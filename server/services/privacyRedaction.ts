import { createWorkspaceRepository } from '../data/workspaces.js';

export interface PrivacySettings {
  maskSensitiveLogs: boolean;
  redactCreditCards: boolean;
  voicePiiRedaction: boolean;
}

export function parseSettings(settings: any) {
  if (!settings) return {};
  if (typeof settings === 'string') {
    try { return JSON.parse(settings); } catch { return {}; }
  }
  return settings;
}

export function privacySettingsFromWorkspace(settings: any): PrivacySettings {
  const parsed = parseSettings(settings);
  return {
    maskSensitiveLogs: parsed.privacy?.maskSensitiveLogs ?? true,
    redactCreditCards: parsed.privacy?.redactCreditCards ?? true,
    voicePiiRedaction: parsed.privacy?.voicePiiRedaction ?? false,
  };
}

function redactText(value: string, settings: PrivacySettings) {
  let output = value;
  if (settings.maskSensitiveLogs) {
    output = output
      .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[redacted-email]')
      .replace(/(?<!\w)\+?\d[\d\s().-]{7,}\d(?!\w)/g, '[redacted-phone]')
      .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[redacted-ip]');
  }
  if (settings.redactCreditCards) {
    output = output.replace(/\b(?:\d[ -]*?){13,19}\b/g, '[redacted-card]');
  }
  if (settings.voicePiiRedaction) {
    output = output.replace(/\b(audio|voice|recording|transcript):\s*[^,}\n]+/gi, '$1: [redacted-voice-pii]');
  }
  return output;
}

function looksSensitiveKey(key: string) {
  return /password|secret|token|api[_-]?key|authorization|cookie|card|ssn|iban|cvv/i.test(key);
}

export function redactSensitiveValue(value: any, settings: PrivacySettings, key = ''): any {
  if (value === null || value === undefined) return value;
  if (looksSensitiveKey(key)) return '[redacted]';
  if (typeof value === 'string') return redactText(value, settings);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.map(item => redactSensitiveValue(item, settings));
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [entryKey, redactSensitiveValue(entryValue, settings, entryKey)]),
    );
  }
  return value;
}

export async function loadPrivacySettings(scope: { tenantId: string; workspaceId: string }) {
  const workspaceRepository = createWorkspaceRepository();
  const workspace = await workspaceRepository.getById(scope.workspaceId, scope.tenantId);
  return privacySettingsFromWorkspace(workspace?.settings);
}

export async function redactForWorkspacePolicy(scope: { tenantId: string; workspaceId: string }, value: any) {
  const settings = await loadPrivacySettings(scope);
  return redactSensitiveValue(value, settings);
}
