import dotenv from 'dotenv';

// Load env here so every importer sees the same values, even under ESM.
dotenv.config({ path: '.env.local' });
dotenv.config();

/**
 * server/config.ts
 *
 * Central configuration module. Reads environment variables, validates them at
 * startup, and exports a single typed `config` object used everywhere in the
 * server. If a required variable is missing the process exits immediately with
 * a clear message so the problem is obvious before any request is served.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Config {
  /** Runtime environment */
  env: 'development' | 'production' | 'test';

  server: {
    port: number;
    /** Allowed CORS origins (comma-separated in env) */
    corsOrigins: string[];
  };

  db: {
    provider: 'sqlite' | 'supabase';
    path: string;
    supabaseUrl?: string;
    supabaseServiceRoleKey?: string;
  };

  ai: {
    geminiApiKey: string;
    /** Model used for case diagnosis and drafts */
    geminiModel: string;
    /** Optional: Anthropic Claude API key for ai.anthropic workflow node */
    anthropicApiKey?: string;
    /** Optional: OpenAI API key for ai.openai workflow node */
    openaiApiKey?: string;
    /** Optional: Ollama base URL (default http://localhost:11434) for ai.ollama node */
    ollamaBaseUrl?: string;
  };

  queue: {
    /** How many jobs run in parallel inside the worker */
    concurrency: number;
    /** Milliseconds between each poll of the jobs table */
    pollIntervalMs: number;
    /** Default max retry attempts for a failed job */
    defaultMaxAttempts: number;
    /** Base delay in ms for exponential backoff (doubles each attempt) */
    backoffBaseMs: number;
  };

  integrations: {
    /** Default HTTP timeout in ms for outbound API calls */
    defaultTimeoutMs: number;
    /** Default max retries per outbound call */
    defaultMaxRetries: number;
    /** Default request rate limit ceiling (requests per minute) */
    defaultRateLimitPerMinute: number;
  };

  /** Optional: Shopify credentials (not required in Phase 0) */
  shopify?: {
    shopDomain: string;
    adminApiToken: string;
    webhookSecret: string;
  };

  /** Optional: Stripe credentials (not required in Phase 0) */
  stripe?: {
    secretKey: string;
    webhookSecret: string;
  };

  commerce: {
    /**
     * Legacy refund amount above which manual approval is required.
     * Configurable via REFUND_AUTO_APPROVAL_THRESHOLD (default: 250).
     * Used as the fallback for currencies not present in
     * `refundAutoApprovalThresholds`.
     */
    refundAutoApprovalThreshold: number;
    /**
     * Per-currency refund auto-approval thresholds. Currency keys are
     * upper-case ISO 4217 codes. Override at runtime with the JSON env var
     * `REFUND_THRESHOLDS_JSON`, e.g. `{"USD":300,"EUR":300}`.
     */
    refundAutoApprovalThresholds: Record<string, number>;
  };

  /** Optional: Direct messaging channel credentials */
  channels?: {
    /** Token used to verify Meta's webhook subscription handshake */
    whatsappVerifyToken?: string;
    /** WhatsApp Business Account phone number ID */
    whatsappPhoneNumberId?: string;
    /** Meta permanent access token for sending messages */
    whatsappAccessToken?: string;
    /** Optional: Meta webhook verification secret for signature checks */
    whatsappWebhookSecret?: string;
    /** Postmark configuration (transactional email) */
    postmark?: {
      serverToken: string;
      fromEmail: string;
    };
    /** Twilio configuration (SMS) */
    twilio?: {
      accountSid: string;
      authToken: string;
      fromNumber: string;
    };
  };

  /** Application URL used for building outbound links (invite, OAuth callback) */
  app: {
    url: string;
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value || value.trim() === '') {
    console.error(`\n❌  Missing required environment variable: ${key}`);
    console.error(`    Add it to .env.local and restart the server.\n`);
    process.exit(1);
  }
  return value.trim();
}

function optionalEnv(key: string, defaultValue: string): string {
  return process.env[key]?.trim() || defaultValue;
}

function optionalInt(key: string, defaultValue: number): number {
  const raw = process.env[key];
  if (!raw) return defaultValue;
  const parsed = parseInt(raw, 10);
  if (isNaN(parsed)) {
    console.warn(`⚠️  ${key} is not a valid integer, using default: ${defaultValue}`);
    return defaultValue;
  }
  return parsed;
}

/**
 * Default per-currency refund auto-approval thresholds.
 * Tuned to roughly match the legacy USD/EUR threshold (~250 USD) for each
 * currency's typical scale. Override per-currency via `REFUND_THRESHOLDS_JSON`.
 */
const DEFAULT_REFUND_THRESHOLDS: Record<string, number> = {
  USD: 250,
  EUR: 250,
  GBP: 200,
  JPY: 25000,
  MXN: 5000,
  BRL: 1500,
  COP: 1000000,
  CLP: 200000,
};

function parseRefundThresholds(): Record<string, number> {
  const merged: Record<string, number> = { ...DEFAULT_REFUND_THRESHOLDS };
  const raw = process.env.REFUND_THRESHOLDS_JSON?.trim();
  if (!raw) return merged;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      console.warn('⚠️  REFUND_THRESHOLDS_JSON must be a JSON object, ignoring');
      return merged;
    }
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      const numeric = typeof value === 'number' ? value : Number(value);
      if (!Number.isFinite(numeric) || numeric < 0) {
        console.warn(`⚠️  REFUND_THRESHOLDS_JSON: invalid value for ${key}, skipping`);
        continue;
      }
      merged[key.toUpperCase()] = numeric;
    }
  } catch (err) {
    console.warn(`⚠️  REFUND_THRESHOLDS_JSON is not valid JSON, ignoring (${(err as Error).message})`);
  }
  return merged;
}

// ── Build config ──────────────────────────────────────────────────────────────

function buildConfig(): Config {
  const env = optionalEnv('NODE_ENV', 'development') as Config['env'];

  const requestedDbProvider = optionalEnv('DB_PROVIDER', 'supabase');
  if (requestedDbProvider !== 'supabase') {
    console.warn(`DB_PROVIDER=${requestedDbProvider} is no longer supported. Supabase will be used exclusively.`);
  }

  // Gemini is optional at server boot, but LLM-only routes fail closed until
  // a real provider key is configured.
  const geminiApiKey = optionalEnv('GEMINI_API_KEY', '');
  if (!geminiApiKey) {
    console.warn('GEMINI_API_KEY is not set. LLM-only AI endpoints will return LLM_PROVIDER_NOT_CONFIGURED.');
  }

  const shopifyDomain = process.env.SHOPIFY_SHOP_DOMAIN;
  const shopifyToken  = process.env.SHOPIFY_ADMIN_API_TOKEN;
  const shopifySecret = process.env.SHOPIFY_WEBHOOK_SECRET;

  const stripeKey    = process.env.STRIPE_SECRET_KEY;
  const stripeSecret = process.env.STRIPE_WEBHOOK_SECRET;

  const whatsappVerifyToken   = process.env.WHATSAPP_VERIFY_TOKEN;
  const whatsappPhoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const whatsappAccessToken   = process.env.WHATSAPP_ACCESS_TOKEN;
  const whatsappWebhookSecret = process.env.WHATSAPP_WEBHOOK_SECRET;

  const postmarkToken = process.env.POSTMARK_SERVER_TOKEN;
  const emailFrom     = process.env.EMAIL_FROM;

  const twilioSid    = process.env.TWILIO_ACCOUNT_SID;
  const twilioToken  = process.env.TWILIO_AUTH_TOKEN;
  const twilioFrom   = process.env.TWILIO_FROM_NUMBER ?? process.env.TWILIO_PHONE;

  const config: Config = {
    env,

    server: {
      port: optionalInt('API_PORT', 3006),
      corsOrigins: optionalEnv(
        'CORS_ORIGINS',
        'http://localhost:3005,http://localhost:5173'
      ).split(',').map(s => s.trim()),
    },

    db: {
      provider: 'supabase',
      path: optionalEnv('DB_PATH', './data/crmai.db'),
      supabaseUrl: process.env.SUPABASE_URL?.trim(),
      supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
    },

    ai: {
      geminiApiKey,
      geminiModel: optionalEnv('GEMINI_MODEL', 'gemini-2.5-pro'),
      anthropicApiKey: optionalEnv('ANTHROPIC_API_KEY', '') || undefined,
      openaiApiKey: optionalEnv('OPENAI_API_KEY', '') || undefined,
      ollamaBaseUrl: optionalEnv('OLLAMA_BASE_URL', '') || undefined,
    },

    queue: {
      concurrency:        optionalInt('QUEUE_CONCURRENCY', 5),
      pollIntervalMs:     optionalInt('QUEUE_POLL_INTERVAL_MS', 1000),
      defaultMaxAttempts: optionalInt('QUEUE_MAX_ATTEMPTS', 3),
      backoffBaseMs:      optionalInt('QUEUE_BACKOFF_BASE_MS', 2000),
    },

    integrations: {
      defaultTimeoutMs:          optionalInt('INTEGRATION_TIMEOUT_MS', 15000),
      defaultMaxRetries:         optionalInt('INTEGRATION_MAX_RETRIES', 3),
      defaultRateLimitPerMinute: optionalInt('INTEGRATION_RATE_LIMIT', 60),
    },

    commerce: {
      refundAutoApprovalThreshold: optionalInt('REFUND_AUTO_APPROVAL_THRESHOLD', 250),
      refundAutoApprovalThresholds: parseRefundThresholds(),
    },

    app: {
      url: optionalEnv('APP_URL', 'http://localhost:5173'),
    },
  };

  // Attach optional integration blocks only when ALL keys for that integration exist
  if (shopifyDomain && shopifyToken && shopifySecret) {
    config.shopify = {
      shopDomain:     shopifyDomain,
      adminApiToken:  shopifyToken,
      webhookSecret:  shopifySecret,
    };
  }

  if (stripeKey && stripeSecret) {
    config.stripe = {
      secretKey:     stripeKey,
      webhookSecret: stripeSecret,
    };
  }

  const hasWhatsapp = whatsappVerifyToken || whatsappPhoneNumberId || whatsappAccessToken || whatsappWebhookSecret;
  const hasPostmark = !!postmarkToken;
  const hasTwilio   = twilioSid && twilioToken && twilioFrom;

  if (hasWhatsapp || hasPostmark || hasTwilio) {
    config.channels = {
      whatsappVerifyToken,
      whatsappPhoneNumberId,
      whatsappAccessToken,
      whatsappWebhookSecret,
    };

    if (hasPostmark) {
      config.channels.postmark = {
        serverToken: postmarkToken!,
        fromEmail:   emailFrom ?? 'support@example.com',
      };
    }

    if (hasTwilio) {
      config.channels.twilio = {
        accountSid: twilioSid!,
        authToken:  twilioToken!,
        fromNumber: twilioFrom!,
      };
    }
  }

  return config;
}

// ── Singleton ─────────────────────────────────────────────────────────────────

export const config: Config = buildConfig();
