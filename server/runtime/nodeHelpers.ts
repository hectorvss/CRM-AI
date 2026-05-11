/**
 * server/runtime/nodeHelpers.ts
 *
 * Pure helpers shared between the inline executor in
 * `server/routes/workflows.ts` and the per-category adapters under
 * `server/runtime/adapters/`. Extracted as part of the workflow runtime
 * extraction (Turno 5/D2, Phase 2) so adapter modules don't have to
 * import from the route file (which would create a circular dependency).
 *
 * These functions are byte-for-byte transcriptions of the originals that
 * lived in `server/routes/workflows.ts`. No behavior change.
 */

export function parseMaybeJsonObject(value: any): Record<string, any> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value !== 'string') return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function resolveTemplateValue(value: any, context: any) {
  if (typeof value !== 'string') return value;
  return value.replace(/\{\{\s*([^}]+)\s*\}\}/g, (_match, path) => {
    const parts = String(path).split('.');
    let cursor = context;
    for (const part of parts) cursor = cursor?.[part];
    return cursor === undefined || cursor === null ? '' : String(cursor);
  });
}

export function resolveNodeConfig(config: Record<string, any> = {}, context: any) {
  return Object.fromEntries(
    Object.entries(config).map(([key, value]) => [key, resolveTemplateValue(value, context)]),
  );
}

export function compareValues(left: any, operator: string, right: any) {
  const normalizedOperator = String(operator || '==').toLowerCase();
  if (normalizedOperator === 'exists') return left !== undefined && left !== null && String(left).length > 0;
  if (normalizedOperator === 'not_exists') return left === undefined || left === null || String(left).length === 0;
  if (normalizedOperator === 'contains') return String(left ?? '').toLowerCase().includes(String(right ?? '').toLowerCase());
  if (normalizedOperator === 'not_contains') return !String(left ?? '').toLowerCase().includes(String(right ?? '').toLowerCase());
  if (normalizedOperator === 'in') return asArray(right).map((item) => String(item).toLowerCase()).includes(String(left ?? '').toLowerCase());
  if (normalizedOperator === 'not_in') return !asArray(right).map((item) => String(item).toLowerCase()).includes(String(left ?? '').toLowerCase());
  const numericLeft = Number(left);
  const numericRight = Number(right);
  const canCompareNumber = Number.isFinite(numericLeft) && Number.isFinite(numericRight);
  switch (normalizedOperator) {
    case '>': return canCompareNumber ? numericLeft > numericRight : String(left) > String(right);
    case '>=': return canCompareNumber ? numericLeft >= numericRight : String(left) >= String(right);
    case '<': return canCompareNumber ? numericLeft < numericRight : String(left) < String(right);
    case '<=': return canCompareNumber ? numericLeft <= numericRight : String(left) <= String(right);
    case '!=':
    case '!==': return String(left) !== String(right);
    case '=':
    case '==':
    case '===':
    default: return String(left) === String(right);
  }
}

export function readContextPath(context: any, path: string) {
  return String(path || '').split('.').reduce((cursor, part) => cursor?.[part], context);
}

export function asArray(value: any) {
  if (Array.isArray(value)) return value;
  if (value == null) return [];
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      return trimmed.split(/[\n,|]+/).map((item) => item.trim()).filter(Boolean);
    }
  }
  return [value];
}

export function cloneJson(value: any) {
  if (Array.isArray(value)) return value.map((item) => cloneJson(item));
  if (value && typeof value === 'object') return { ...value };
  return value;
}
