export function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

export function ensureArray<T>(value: unknown, fallback: T[] = []): T[] {
  return Array.isArray(value) ? (value as T[]) : fallback;
}

export function ensureRecord<T>(value: unknown, fallback: Record<string, T> = {}): Record<string, T> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, T>)
    : fallback;
}

export function mergeRecord<T>(fallback: Record<string, T>, persisted?: unknown): Record<string, T> {
  const merged = cloneJson(fallback);
  if (!persisted || typeof persisted !== 'object' || Array.isArray(persisted)) {
    return merged;
  }

  for (const [key, value] of Object.entries(persisted as Record<string, T>)) {
    if (value !== undefined) {
      merged[key] = cloneJson(value);
    }
  }

  return merged;
}

export function ensureBoolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

export function ensureNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function mergeProfile<T extends Record<string, any>>(fallback: T, persisted?: Record<string, any> | null): T {
  if (!persisted || typeof persisted !== 'object') {
    return cloneJson(fallback);
  }

  const merged = cloneJson(fallback);
  for (const [key, value] of Object.entries(persisted)) {
    if (value !== undefined) {
      (merged as Record<string, any>)[key] = cloneJson(value);
    }
  }

  return merged;
}
