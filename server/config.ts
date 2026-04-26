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

  /** Optional: Direct messaging channel credentials */
  channels?: {
    /** Token used to verify Meta's webhook subscription handshake */
    whatsappVerifyToken?: string;
    /** WhatsApp Business Account phone number ID */
    whatsappPhoneNumberId?: string;
    /** Meta permanent access token for sending messages */
    whatsappAccessToken?: string;
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

// ── Build config ──────────────────────────────────────────────────────────────

function buildConfig(): Config {
  const env = optionalEnv('NODE_ENV', 'development') as Config['env'];

  const requestedDbProvider = optionalEnv('DB_PROVIDER', 'supabase');
  if (requestedDbProvider !== 'supabase') {
    console.warn(`DB_PROVIDER=${requestedDbProvider} is no longer supported. Supabase will be used exclusively.`);
  }

  // Gemini is optional for local product demos: when it is missing, the API
  // still boots and AI routes can return deterministic canonical-state fallbacks.
  const geminiApiKey = optionalEnv('GEMINI_API_KEY', '');
  if (!geminiApiKey) {
    console.warn('GEMINI_API_KEY is not set. AI endpoints will use safe local fallbacks where available.');
  }

  const shopifyDomain = process.env.SHOPIFY_SHOP_DOMAIN;
  const shopifyToken  = process.env.SHOPIFY_ADMIN_API_TOKEN;
  const shopifySecret = process.env.SHOPIFY_WEBHOOK_SECRET;

  const stripeKey    = process.env.STRIPE_SECRET_KEY;
  const stripeSecret = process.env.STRIPE_WEBHOOK_SECRET;

  const whatsappVerifyToken   = process.env.WHATSAPP_VERIFY_TOKEN;
  const whatsappPhoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const whatsappAccessToken   = process.env.WHATSAPP_ACCESS_TOKEN;

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

  if (whatsappVerifyToken || whatsappPhoneNumberId || whatsappAccessToken) {
    config.channels = {
      whatsappVerifyToken:   whatsappVerifyToken,
      whatsappPhoneNumberId: whatsappPhoneNumberId,
      whatsappAccessToken:   whatsappAccessToken,
    };
  }

  return config;
}

// ── Singleton ─────────────────────────────────────────────────────────────────

export const config: Config = buildConfig();
