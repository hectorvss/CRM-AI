/**
 * server/agents/chatAgent/providers/anthropic.ts
 *
 * Primary provider for the operator Super Agent — Claude drives the ReAct
 * loop, mirroring PostHog's root agent (MaxChatAnthropic in ee/hogai/llm.py,
 * claude-sonnet with streaming + native tool use).
 */

// Type-only import: erased at compile time so the serverless cold-start never
// requires '@anthropic-ai/sdk'. The real module is dynamically imported inside
// getClient(), only when the chat agent is actually invoked — this keeps the
// core API up even if the AI SDK isn't in the bundle.
import type Anthropic from '@anthropic-ai/sdk';
import { config } from '../../../config.js';
import {
  type ChatLLMProvider,
  type ProviderMessage,
  type ProviderTool,
  type ProviderToolCall,
  type StreamChatResult,
  ProviderNotConfiguredError,
} from './types.js';
import { withLLMRetry } from './retry.js';

const DEFAULT_PRIMARY_MODEL = process.env.AGENT_MODEL_PRIMARY || 'claude-sonnet-5';
const DEFAULT_UTILITY_MODEL = process.env.AGENT_MODEL_ANTHROPIC_UTILITY || 'claude-haiku-4-5';
// PostHog uses max_tokens 16384 on its root agent (executables.py); we keep a
// smaller default because CRM answers are shorter than analysis reports.
const DEFAULT_MAX_TOKENS = 4096;

async function getClient(): Promise<Anthropic> {
  const apiKey = config.ai?.anthropicApiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new ProviderNotConfiguredError('anthropic', 'ANTHROPIC_API_KEY');
  const { default: AnthropicClient } = await import('@anthropic-ai/sdk');
  return new AnthropicClient({ apiKey, timeout: 60_000 });
}

function toAnthropicMessages(messages: ProviderMessage[]): Anthropic.MessageParam[] {
  const out: Anthropic.MessageParam[] = [];
  for (const msg of messages) {
    if (msg.role === 'user') {
      out.push({ role: 'user', content: msg.content });
    } else if (msg.role === 'assistant') {
      // Extended thinking: within a tool-use sequence Anthropic requires the
      // original thinking blocks (with signatures) passed back verbatim. When we
      // captured them this turn, replay them unmodified.
      if (msg._providerContent && Array.isArray(msg._providerContent) && msg._providerContent.length) {
        out.push({ role: 'assistant', content: msg._providerContent as Anthropic.ContentBlockParam[] });
        continue;
      }
      const blocks: Anthropic.ContentBlockParam[] = [];
      if (msg.content) blocks.push({ type: 'text', text: msg.content });
      for (const tc of msg.toolCalls ?? []) {
        blocks.push({
          type: 'tool_use',
          id: tc.id,
          // Persisted canonical names may contain dots; the API requires the
          // sanitized form, matching what the model originally emitted.
          name: tc.toolName.replace(/\./g, '__'),
          input: tc.args ?? {},
        });
      }
      if (blocks.length) out.push({ role: 'assistant', content: blocks });
    } else {
      // tool_result blocks live in user-role messages in the Anthropic API.
      const block: Anthropic.ToolResultBlockParam = {
        type: 'tool_result',
        tool_use_id: msg.toolCallId,
        content: msg.content,
        ...(msg.isError ? { is_error: true } : {}),
      };
      const prev = out[out.length - 1];
      if (prev && prev.role === 'user' && Array.isArray(prev.content) && prev.content[0]?.type === 'tool_result') {
        (prev.content as Anthropic.ContentBlockParam[]).push(block);
      } else {
        out.push({ role: 'user', content: [block] });
      }
    }
  }
  return out;
}

export class AnthropicChatProvider implements ChatLLMProvider {
  async streamChat(opts: {
    system: string;
    messages: ProviderMessage[];
    tools: ProviderTool[];
    resolveToolName: (apiName: string) => string;
    maxTokens?: number;
    signal?: AbortSignal;
    onTextDelta: (text: string) => void;
    onThinkingDelta?: (text: string) => void;
    thinkingEffort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
  }): Promise<StreamChatResult> {
    const client = await getClient();
    const model = DEFAULT_PRIMARY_MODEL;

    // Extended thinking is model-family-aware:
    //  - Claude 5-era models (…-5, Opus 4.8+) use the ADAPTIVE thinking API
    //    (thinking.type=adaptive + output_config.effort). They REJECT the legacy
    //    enabled+budget form with a 400 ("thinking.type.enabled is not supported").
    //  - Claude 4.x uses the legacy enabled+budget form (adaptive is unknown to it).
    // Set AGENT_THINKING=off to disable entirely; AGENT_THINKING_EFFORT overrides
    // the adaptive effort (low|medium|high|xhigh|max).
    const thinkingOff = (process.env.AGENT_THINKING ?? '').toLowerCase() === 'off';
    const adaptiveEra = /(?:sonnet|opus|haiku|fable|mythos)-5\b/.test(model) || /opus-4-[89]\b/.test(model);
    let maxTokens = opts.maxTokens ?? DEFAULT_MAX_TOKENS;
    let thinkingParams: Record<string, unknown> = {};
    if (!thinkingOff && adaptiveEra) {
      const effort = opts.thinkingEffort ?? process.env.AGENT_THINKING_EFFORT ?? 'medium';
      thinkingParams = { thinking: { type: 'adaptive' }, output_config: { effort } };
    } else if (!thinkingOff) {
      const budget = Number(process.env.AGENT_THINKING_BUDGET ?? 2048);
      if (Number.isFinite(budget) && budget >= 1024) {
        maxTokens = Math.max(maxTokens, budget + 1024);
        thinkingParams = { thinking: { type: 'enabled', budget_tokens: budget } };
      }
    }

    return withLLMRetry(async () => {
      const stream = client.messages.stream(
        {
          model,
          max_tokens: maxTokens,
          system: opts.system,
          messages: toAnthropicMessages(opts.messages),
          tools: opts.tools.map((t) => ({
            name: t.name,
            description: t.description,
            input_schema: t.inputSchema as Anthropic.Tool['input_schema'],
          })),
          ...thinkingParams,
        } as Parameters<typeof client.messages.stream>[0],
        { signal: opts.signal },
      );

      stream.on('text', (delta) => {
        if (delta) opts.onTextDelta(delta);
      });
      if (opts.onThinkingDelta) {
        stream.on('thinking', (delta) => {
          if (delta) opts.onThinkingDelta!(delta);
        });
      }

      const final = await stream.finalMessage();

      let text = '';
      let thinking = '';
      const toolCalls: ProviderToolCall[] = [];
      for (const block of final.content) {
        if (block.type === 'text') text += block.text;
        else if (block.type === 'thinking') thinking += block.thinking;
        else if (block.type === 'tool_use') {
          toolCalls.push({
            id: block.id,
            toolName: opts.resolveToolName(block.name),
            args: (block.input ?? {}) as Record<string, unknown>,
          });
        }
      }

      const stopReason: StreamChatResult['stopReason'] =
        final.stop_reason === 'tool_use' ? 'tool_use'
        : final.stop_reason === 'max_tokens' ? 'max_tokens'
        : final.stop_reason === 'end_turn' ? 'end_turn'
        : 'other';

      return {
        text,
        toolCalls,
        usage: {
          inputTokens: final.usage?.input_tokens ?? 0,
          outputTokens: final.usage?.output_tokens ?? 0,
        },
        stopReason,
        model,
        thinking: thinking || undefined,
        // Replay verbatim next iteration (preserves thinking-block signatures).
        rawContent: final.content,
      };
    }, { label: 'anthropic-stream-chat' });
  }

  async completeUtility(opts: { system: string; prompt: string; maxTokens?: number }) {
    const client = await getClient();
    const model = DEFAULT_UTILITY_MODEL;

    return withLLMRetry(async () => {
      const msg = await client.messages.create({
        model,
        max_tokens: opts.maxTokens ?? 256,
        system: opts.system,
        messages: [{ role: 'user', content: opts.prompt }],
      });
      const text = msg.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('');
      return {
        text,
        usage: {
          inputTokens: msg.usage?.input_tokens ?? 0,
          outputTokens: msg.usage?.output_tokens ?? 0,
        },
        model,
      };
    }, { label: 'anthropic-utility', attempts: 2 });
  }
}
