/**
 * server/data/personalApiKeys.ts
 *
 * Data layer for the `personal_api_keys` table. Each key belongs to a user
 * within a tenant. Plaintext token is shown ONCE at create/regenerate time;
 * the DB stores only the SHA-256 hash plus a short prefix for display.
 *
 * Token format: `phx_<48 hex chars>` (prefix "phx_" matches PostHog convention
 * so existing clients/SDKs don't need to change).
 */

import { createHash, randomBytes, randomUUID } from 'crypto';
import { getSupabaseAdmin } from '../db/supabase.js';

export interface PersonalApiKeyScope {
  tenantId: string;
  userId: string;
}

export interface CreatePersonalApiKeyPayload {
  label:                 string;
  scopes:                string[];
  scoped_organizations?: string[];
  scoped_teams?:         number[];
  expires_at?:           string | null;
}

export interface UpdatePersonalApiKeyPayload {
  label?:                string;
  scopes?:               string[];
  scoped_organizations?: string[];
  scoped_teams?:         number[];
  expires_at?:           string | null;
}

function maskValue(prefix: string, hash: string): string {
  return `${prefix}••••${hash.slice(-4)}`;
}

function generateTokenPair() {
  // phx_<48 hex chars>
  const secret = randomBytes(24).toString('hex');
  const plaintext = `phx_${secret}`;
  const tokenHash = createHash('sha256').update(plaintext).digest('hex');
  const tokenPrefix = plaintext.slice(0, 8); // "phx_AbCd"
  return { plaintext, tokenHash, tokenPrefix };
}

export async function listPersonalApiKeys(scope: PersonalApiKeyScope) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('personal_api_keys')
    .select('*')
    .eq('tenant_id', scope.tenantId)
    .eq('user_id', scope.userId)
    .order('created_at', { ascending: false });
  if (error) {
    if ((error as any).code === '42P01') return [];
    throw error;
  }
  return (data ?? []).map((row: any) => ({
    ...row,
    mask_value: maskValue(row.token_prefix, row.token_hash || ''),
  }));
}

export async function getPersonalApiKey(scope: PersonalApiKeyScope, id: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('personal_api_keys')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', scope.tenantId)
    .eq('user_id', scope.userId)
    .maybeSingle();
  if (error) {
    if ((error as any).code === '42P01') return null;
    throw error;
  }
  return data ? { ...data, mask_value: maskValue(data.token_prefix, data.token_hash || '') } : null;
}

export async function createPersonalApiKey(scope: PersonalApiKeyScope, payload: CreatePersonalApiKeyPayload) {
  const supabase = getSupabaseAdmin();
  const { plaintext, tokenHash, tokenPrefix } = generateTokenPair();
  const { data, error } = await supabase
    .from('personal_api_keys')
    .insert({
      id:                   randomUUID(),
      user_id:              scope.userId,
      tenant_id:            scope.tenantId,
      label:                payload.label,
      token_hash:           tokenHash,
      token_prefix:         tokenPrefix,
      scopes:               payload.scopes,
      scoped_organizations: payload.scoped_organizations ?? [],
      scoped_teams:         payload.scoped_teams ?? [],
      expires_at:           payload.expires_at ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return {
    row: { ...data, mask_value: maskValue(tokenPrefix, tokenHash) },
    value: plaintext, // shown ONCE
  };
}

export async function updatePersonalApiKey(
  scope: PersonalApiKeyScope,
  id: string,
  payload: UpdatePersonalApiKeyPayload,
) {
  const supabase = getSupabaseAdmin();
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (payload.label                !== undefined) updates.label = payload.label;
  if (payload.scopes               !== undefined) updates.scopes = payload.scopes;
  if (payload.scoped_organizations !== undefined) updates.scoped_organizations = payload.scoped_organizations;
  if (payload.scoped_teams         !== undefined) updates.scoped_teams = payload.scoped_teams;
  if (payload.expires_at           !== undefined) updates.expires_at = payload.expires_at;

  const { data, error } = await supabase
    .from('personal_api_keys')
    .update(updates)
    .eq('id', id)
    .eq('tenant_id', scope.tenantId)
    .eq('user_id', scope.userId)
    .select('*')
    .maybeSingle();
  if (error) throw error;
  return data ? { ...data, mask_value: maskValue(data.token_prefix, data.token_hash || '') } : null;
}

export async function deletePersonalApiKey(scope: PersonalApiKeyScope, id: string) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('personal_api_keys')
    .delete()
    .eq('id', id)
    .eq('tenant_id', scope.tenantId)
    .eq('user_id', scope.userId);
  if (error) throw error;
}

/**
 * Regenerate: invalidates the current token and issues a new one. The id stays
 * the same, but the hash/prefix/created_at are replaced.
 */
export async function regeneratePersonalApiKey(scope: PersonalApiKeyScope, id: string) {
  const supabase = getSupabaseAdmin();
  const { plaintext, tokenHash, tokenPrefix } = generateTokenPair();
  const { data, error } = await supabase
    .from('personal_api_keys')
    .update({
      token_hash:   tokenHash,
      token_prefix: tokenPrefix,
      last_used_at: null,
      updated_at:   new Date().toISOString(),
    })
    .eq('id', id)
    .eq('tenant_id', scope.tenantId)
    .eq('user_id', scope.userId)
    .select('*')
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    row: { ...data, mask_value: maskValue(tokenPrefix, tokenHash) },
    value: plaintext, // shown ONCE
  };
}

/**
 * Verify a bearer token presented by a client. Hashes the candidate and looks
 * up the row. Best-effort updates last_used_at and returns the row + the
 * owning user for downstream authorization.
 */
export async function verifyPersonalApiKey(candidate: string) {
  if (!candidate || !candidate.startsWith('phx_')) return null;
  const supabase = getSupabaseAdmin();
  const hash = createHash('sha256').update(candidate).digest('hex');
  const { data, error } = await supabase
    .from('personal_api_keys')
    .select('*')
    .eq('token_hash', hash)
    .maybeSingle();
  if (error || !data) return null;
  if (data.expires_at && new Date(data.expires_at).getTime() < Date.now()) return null;
  // Best-effort timestamp update.
  void supabase
    .from('personal_api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', data.id)
    .then(() => null, () => null);
  return data;
}
