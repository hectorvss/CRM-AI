import assert from 'assert/strict';
import { isGeneralConversationInput, normalizeSearchQuery } from '../../server/agents/superAgent/search.js';

const cases = [
  {
    name: 'greeting',
    input: 'Hola, con que me puedes ayudar hoy??',
    expectedGeneral: true,
    expectedQuery: 'Hola con que me puedes ayudar hoy',
  },
  {
    name: 'entity query',
    input: 'Investiga el pedido OR-1002',
    expectedGeneral: false,
    expectedQuery: 'Investiga el pedido OR-1002',
  },
  {
    name: 'punctuation sanitized',
    input: 'customer, payment?? blocked!',
    expectedGeneral: false,
    expectedQuery: 'customer payment blocked',
  },
];

for (const testCase of cases) {
  assert.equal(isGeneralConversationInput(testCase.input), testCase.expectedGeneral, `${testCase.name}: general detection mismatch`);
  assert.equal(normalizeSearchQuery(testCase.input), testCase.expectedQuery, `${testCase.name}: normalization mismatch`);
}

console.log(`Super Agent search smoke: ${cases.length}/${cases.length} passed`);
