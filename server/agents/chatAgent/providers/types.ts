/**
 * server/agents/chatAgent/providers/types.ts
 *
 * Provider-agnostic LLM contract for the operator Super Agent.
 * Mirrors PostHog's split (ee/hogai/llm.py): a "root" model driving the ReAct
 * loop (Claude Sonnet there and here) plus cheap utility models for titles and
 * classifications. Implementations: anthropic.ts (primary), openai.ts
 * (secondary / utility / switchable via AGENT_PROVIDER=openai).
 */

// ── Message shapes (provider-neutral, converted internally by each impl) ──────

export interface ProviderToolCall {
  /** Provider-issued id (tool_use.id / tool_calls[i].id). */
  id: string;
  /** Canonical registry name, e.g. "payment.refund" (already un-mangled). */
  toolName: string;
  args: Record<string, unknown>;
}

export type ProviderMessage =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; toolCalls?: ProviderToolCall[] }
  | { role: 'tool_result'; toolCallId: string; content: string; isError?: boolean };

export interface ProviderTool {
  /** Sanitized name sent to the API (no dots — see toolAdapter nameMap). */
  name: string;
  description: string;
  /** JSON Schema for the arguments object. */
  inputSchema: Record<string, unknown>;
}

export interface StreamChatResult {
  text: string;
  toolCalls: ProviderToolCall[];
  usage: { inputTokens: number; outputTokens: number };
  stopReason: 'end_turn' | 'tool_use' | 'max_tokens' | 'other';
  model: string;
}

export interface ChatLLMProvider {
  /** Streams one model turn; resolves once the turn is complete. */
  streamChat(opts: {
    system: string;
    messages: ProviderMessage[];
    tools: ProviderTool[];
    /** Un-mangles API tool names back to canonical registry names. */
    resolveToolName: (apiName: string) => string;
    maxTokens?: number;
    signal?: AbortSignal;
    onTextDelta: (text: string) => void;
  }): Promise<StreamChatResult>;

  /** Cheap non-streaming completion for titles / classifications. */
  completeUtility(opts: {
    system: string;
    prompt: string;
    maxTokens?: number;
  }): Promise<{ text: string; usage: { inputTokens: number; outputTokens: number }; model: string }>;
}

export class ProviderNotConfiguredError extends Error {
  code = 'LLM_PROVIDER_NOT_CONFIGURED';
  constructor(provider: string, envVar: string) {
    super(`AI provider "${provider}" is not configured. Set ${envVar} in the environment.`);
    this.name = 'ProviderNotConfiguredError';
  }
}
