/**
 * server/agents/chatAgent/providers/openai.ts
 *
 * Secondary provider for the operator Super Agent. Two roles, mirroring
 * PostHog's split (root = Claude, utility/taxonomy = OpenAI in ee/hogai):
 *   1. Utility model for titles / classifications (completeUtility).
 *   2. Full ChatLLMProvider so the loop can run on OpenAI via
 *      AGENT_PROVIDER=openai (fallback or preference).
 */

// Type-only import: erased at compile time so the serverless cold-start never
// requires 'openai'. The real module is dynamically imported inside getClient(),
// only when the chat agent actually runs on OpenAI.
import type OpenAI from 'openai';
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

const DEFAULT_PRIMARY_MODEL = process.env.AGENT_MODEL_OPENAI_PRIMARY || 'gpt-4.1';
const DEFAULT_UTILITY_MODEL = process.env.AGENT_MODEL_UTILITY || 'gpt-4.1-mini';
const DEFAULT_MAX_TOKENS = 4096;

async function getClient(): Promise<OpenAI> {
  const apiKey = config.ai?.openaiApiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey) throw new ProviderNotConfiguredError('openai', 'OPENAI_API_KEY');
  const { default: OpenAIClient } = await import('openai');
  return new OpenAIClient({ apiKey, timeout: 60_000 });
}

function toOpenAIMessages(
  system: string,
  messages: ProviderMessage[],
): OpenAI.Chat.ChatCompletionMessageParam[] {
  const out: OpenAI.Chat.ChatCompletionMessageParam[] = [{ role: 'system', content: system }];
  for (const msg of messages) {
    if (msg.role === 'user') {
      out.push({ role: 'user', content: msg.content });
    } else if (msg.role === 'assistant') {
      out.push({
        role: 'assistant',
        content: msg.content || null,
        ...(msg.toolCalls?.length
          ? {
              tool_calls: msg.toolCalls.map((tc) => ({
                id: tc.id,
                type: 'function' as const,
                function: {
                  name: tc.toolName.replace(/\./g, '__'),
                  arguments: JSON.stringify(tc.args ?? {}),
                },
              })),
            }
          : {}),
      });
    } else {
      out.push({ role: 'tool', tool_call_id: msg.toolCallId, content: msg.content });
    }
  }
  return out;
}

export class OpenAIChatProvider implements ChatLLMProvider {
  async streamChat(opts: {
    system: string;
    messages: ProviderMessage[];
    tools: ProviderTool[];
    resolveToolName: (apiName: string) => string;
    maxTokens?: number;
    signal?: AbortSignal;
    onTextDelta: (text: string) => void;
  }): Promise<StreamChatResult> {
    const client = await getClient();
    const model = DEFAULT_PRIMARY_MODEL;

    return withLLMRetry(async () => {
      const stream = await client.chat.completions.create(
        {
          model,
          max_tokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
          stream: true,
          stream_options: { include_usage: true },
          messages: toOpenAIMessages(opts.system, opts.messages),
          ...(opts.tools.length
            ? {
                tools: opts.tools.map((t) => ({
                  type: 'function' as const,
                  function: {
                    name: t.name,
                    description: t.description,
                    parameters: t.inputSchema,
                  },
                })),
              }
            : {}),
        },
        { signal: opts.signal },
      );

      let text = '';
      let finishReason: string | null = null;
      let usage = { inputTokens: 0, outputTokens: 0 };
      // tool call deltas arrive fragmented, keyed by index
      const toolCallAcc = new Map<number, { id: string; name: string; args: string }>();

      for await (const chunk of stream) {
        const choice = chunk.choices?.[0];
        if (choice?.delta?.content) {
          text += choice.delta.content;
          opts.onTextDelta(choice.delta.content);
        }
        for (const tc of choice?.delta?.tool_calls ?? []) {
          const acc = toolCallAcc.get(tc.index) ?? { id: '', name: '', args: '' };
          if (tc.id) acc.id = tc.id;
          if (tc.function?.name) acc.name += tc.function.name;
          if (tc.function?.arguments) acc.args += tc.function.arguments;
          toolCallAcc.set(tc.index, acc);
        }
        if (choice?.finish_reason) finishReason = choice.finish_reason;
        if (chunk.usage) {
          usage = {
            inputTokens: chunk.usage.prompt_tokens ?? 0,
            outputTokens: chunk.usage.completion_tokens ?? 0,
          };
        }
      }

      const toolCalls: ProviderToolCall[] = [...toolCallAcc.values()].map((acc) => ({
        id: acc.id,
        toolName: opts.resolveToolName(acc.name),
        args: safeParseArgs(acc.args),
      }));

      const stopReason: StreamChatResult['stopReason'] =
        finishReason === 'tool_calls' ? 'tool_use'
        : finishReason === 'length' ? 'max_tokens'
        : finishReason === 'stop' ? 'end_turn'
        : 'other';

      return { text, toolCalls, usage, stopReason, model };
    }, { label: 'openai-stream-chat' });
  }

  async completeUtility(opts: { system: string; prompt: string; maxTokens?: number }) {
    const client = await getClient();
    const model = DEFAULT_UTILITY_MODEL;

    return withLLMRetry(async () => {
      const completion = await client.chat.completions.create({
        model,
        max_tokens: opts.maxTokens ?? 256,
        messages: [
          { role: 'system', content: opts.system },
          { role: 'user', content: opts.prompt },
        ],
      });
      return {
        text: completion.choices?.[0]?.message?.content ?? '',
        usage: {
          inputTokens: completion.usage?.prompt_tokens ?? 0,
          outputTokens: completion.usage?.completion_tokens ?? 0,
        },
        model,
      };
    }, { label: 'openai-utility', attempts: 2 });
  }
}

function safeParseArgs(raw: string): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return { _unparsed: raw };
  }
}
