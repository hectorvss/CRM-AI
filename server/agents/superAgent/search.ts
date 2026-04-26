export function normalizeSearchQuery(value: string) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/[\u0000-\u001f]+/g, ' ')
    .replace(/[(),[\]{}?%!]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isGeneralConversationInput(value: string) {
  const normalized = normalizeSearchQuery(value).toLowerCase();
  if (!normalized) return true;

  const greeted = /^(hola|buenas|hello|hi|hey|ey|saludos)\b/.test(normalized);
  const helpRequest = /(que|qué|como|cómo|con que|con qué).*(ayudar|hacer|puedes ayudar|puedes hacer)/.test(normalized);
  const shortNonDomain = normalized.length < 12;
  const hasDomainHint = /(case|caso|pedido|order|payment|pago|refund|return|devolucion|approval|aprob|customer|cliente|workflow|flujo|knowledge|report|integration|agent|search|buscar|investig|revis|open|abrir|cancel|close|update|change|block|bloque)/.test(normalized);

  return (greeted || helpRequest || shortNonDomain) && !hasDomainHint;
}
