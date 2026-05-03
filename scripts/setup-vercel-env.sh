#!/usr/bin/env bash
# Set up all Vercel env vars for production + preview.
# Run from project root. Skips if a value is empty (so Stripe/Postmark stay
# unconfigured until the user fills those in).

set -euo pipefail

SUPABASE_URL='https://erzfvnpzbmwnpchhemjt.supabase.co'
SUPABASE_ANON_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVyemZ2bnB6Ym13bnBjaGhlbWp0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3OTA5MjQsImV4cCI6MjA5MTM2NjkyNH0.vtUHINHIUIJortTkqcK6ShFrnSNbjQRnj5dE8fcFTxY'
SUPABASE_SERVICE_ROLE_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVyemZ2bnB6Ym13bnBjaGhlbWp0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTc5MDkyNCwiZXhwIjoyMDkxMzY2OTI0fQ.nCl0VtUiCd_1j_hoSV_wqyiDE4PKEKa3G95D154t4kY'
DEFAULT_TENANT_ID='3eff452d-3a87-47b7-bef8-8a4f2909f09d'
DEFAULT_WORKSPACE_ID='8962907c-c303-45d3-9170-01414d0ba4ee'
INTERNAL_CRON_SECRET='2JNYqr-d1tnbp2o4aLKOVYk3ittaC_eEjakCoIbeL-rNtcTvTFR6n2aCaGu9U1Wn'
CRON_SECRET='LKLI9kiak_ttjQ2ENId4CQ236QbARYrsSHwNuZVaOUwC5x5LZWoxCE-ljX9krom3'
WEB_CHAT_API_KEY='xM88EfD0EmuxoBL1aElS4-nmqfeE7pessH9pAIalgmg'
JWT_SECRET='WcjenaaXdjMIicHV4NzjRnO_9Mo6tvaIeMaR9ehQd-3JeeO40ijELjPnQ_KMxxVk'

# What target environments to push to
ENVS=(production preview)

set_var() {
  local name="$1" value="$2"
  if [[ -z "$value" ]]; then
    echo "  skip $name (empty)"
    return
  fi
  for env in "${ENVS[@]}"; do
    echo "  $name -> $env"
    vercel env add "$name" "$env" --value "$value" --force --yes >/dev/null 2>&1 || echo "    WARN: could not set $name in $env"
  done
}

echo "Setting Supabase vars..."
set_var SUPABASE_URL                "$SUPABASE_URL"
set_var SUPABASE_ANON_KEY           "$SUPABASE_ANON_KEY"
set_var SUPABASE_SERVICE_ROLE_KEY   "$SUPABASE_SERVICE_ROLE_KEY"
set_var VITE_SUPABASE_URL           "$SUPABASE_URL"
set_var VITE_SUPABASE_ANON_KEY      "$SUPABASE_ANON_KEY"

echo "Setting tenant defaults..."
set_var DEFAULT_TENANT_ID           "$DEFAULT_TENANT_ID"
set_var DEFAULT_WORKSPACE_ID        "$DEFAULT_WORKSPACE_ID"
set_var VITE_TENANT_ID              "$DEFAULT_TENANT_ID"
set_var VITE_WORKSPACE_ID           "$DEFAULT_WORKSPACE_ID"

echo "Setting cron secrets..."
set_var INTERNAL_CRON_SECRET        "$INTERNAL_CRON_SECRET"
set_var CRON_SECRET                 "$CRON_SECRET"
set_var WEB_CHAT_API_KEY            "$WEB_CHAT_API_KEY"
set_var JWT_SECRET                  "$JWT_SECRET"

echo "Setting tuning..."
set_var DB_PROVIDER                 "supabase"
set_var APP_URL                     "https://crm-ai-rose.vercel.app"
set_var CORS_ORIGINS                "https://crm-ai-rose.vercel.app,https://crm-ai.vercel.app"
set_var WORKER_BATCH_SIZE           "10"
set_var SCHEDULER_TICK_TIMEOUT_MS   "50000"
set_var PLAN_ENGINE_MAX_STEPS       "50"
set_var SUPER_AGENT_LLM_ROUTING     "true"
set_var BILLING_TOKENS_PER_CREDIT   "1000"
set_var LOG_LEVEL                   "info"
set_var ALLOW_ANON_DEV              "false"

# Frontend API base — empty means same-origin (which is what we want in prod)
set_var VITE_API_URL                ""

echo "Done."
