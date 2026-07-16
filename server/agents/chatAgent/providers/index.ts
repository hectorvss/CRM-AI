/**
 * server/agents/chatAgent/providers/index.ts
 *
 * Provider selection for the operator Super Agent:
 *   - Loop brain:    Claude (default) or OpenAI via AGENT_PROVIDER=openai.
 *   - Utility calls: OpenAI mini-model (default), falling back to Anthropic
 *     Haiku when only ANTHROPIC_API_KEY is configured.
 */

import { config } from '../../../config.js';
import type { ChatLLMProvider } from './types.js';
import { AnthropicChatProvider } from './anthropic.js';
import { OpenAIChatProvider } from './openai.js';

export * from './types.js';
export { withLLMRetry } from './retry.js';

let primary: ChatLLMProvider | null = null;
let utility: ChatLLMProvider | null = null;

export function getPrimaryProvider(): ChatLLMProvider {
  if (!primary) {
    primary =
      (process.env.AGENT_PROVIDER || 'anthropic') === 'openai'
        ? new OpenAIChatProvider()
        : new AnthropicChatProvider();
  }
  return primary;
}

export function getUtilityProvider(): ChatLLMProvider {
  if (!utility) {
    const hasOpenAI = Boolean(config.ai?.openaiApiKey ?? process.env.OPENAI_API_KEY);
    utility = hasOpenAI ? new OpenAIChatProvider() : new AnthropicChatProvider();
  }
  return utility;
}

/** Test-only override hooks. */
export function _setProvidersForTests(p: ChatLLMProvider | null, u: ChatLLMProvider | null): void {
  primary = p;
  utility = u;
}
