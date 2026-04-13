const fs = require('fs');
const file = 'C:/Users/usuario/OneDrive - Universidad Politécnica de Cartagena/Escritorio/CRM AI/CRM-AI/server/data/canonical.ts';
let code = fs.readFileSync(file, 'utf8');

const stubs = `
  getEventById(scope: CanonicalScope, eventId: string): Promise<any>;
`;
code = code.replace('export interface CanonicalRepository {', 'export interface CanonicalRepository {' + stubs);

fs.writeFileSync(file, code);
console.log('Fixed canonical.ts interface');
