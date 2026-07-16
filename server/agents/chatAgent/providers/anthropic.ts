/**
 * server/agents/chatAgent/providers/anthropic.ts
 *
 * Primary provider for the operator Super Agent — Claude drives the ReAct
 * loop, mirroring PostHog's root agent (MaxChatAnthropic in ee/hogai/llm.py,
 * claude-sonnet with streaming + native tool use).
 */

import Anthropic from '@anthropic-ai/sdk';
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

function getClient(): Anthropic {
  const apiKey = config.ai?.anthropicApiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new ProviderNotConfiguredError('anthropic', 'ANTHROPIC_API_KEY');
  return new Anthropic({ apiKey, timeout: 60_000 });
}

function toAnthropicMessages(messages: ProviderMessage[]): Anthropic.MessageParam[] {
  const out: Anthropic.MessageParam[] = [];
  for (const msg of messages) {
    if (msg.role === 'user') {
      out.push({ role: 'user', content: msg.content });
    } else if (msg.role === 'assistant') {
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
  }): Promise<StreamChatResult> {
    const client = getClient();
    const model = DEFAULT_PRIMARY_MODEL;

    return withLLMRetry(async () => {
      const stream = client.messages.stream(
        {
          model,
          max_tokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
          system: opts.system,
          messages: toAnthropicMessages(opts.messages),
          tools: opts.tools.map((t) => ({
            name: t.name,
            description: t.description,
            input_schema: t.inputSchema as Anthropic.Tool['input_schema'],
          })),
        },
        { signal: opts.signal },
      );

      stream.on('text', (delta) => {
        if (delta) opts.onTextDelta(delta);
      });

      const final = await stream.finalMessage();

      let text = '';
      const toolCalls: ProviderToolCall[] = [];
      for (const block of final.content) {
        if (block.type === 'text') text += block.text;
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
      };
    }, { label: 'anthropic-stream-chat' });
  }

  async completeUtility(opts: { system: string; prompt: string; maxTokens?: number }) {
    const client = getClient();
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
