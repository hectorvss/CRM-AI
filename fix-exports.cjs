const fs = require('fs');

function fix(file) {
  let code = fs.readFileSync(file, 'utf8');
  let parts = code.split('export default router;');
  if (parts.length > 2) {
    code = parts.slice(0, parts.length - 1).join('export default router;') + parts[parts.length - 1];
    fs.writeFileSync(file, code);
  }
}

fix('C:/Users/usuario/OneDrive - Universidad Politécnica de Cartagena/Escritorio/CRM AI/CRM-AI/server/routes/policy.ts');
fix('C:/Users/usuario/OneDrive - Universidad Politécnica de Cartagena/Escritorio/CRM AI/CRM-AI/server/routes/workspaces.ts');
console.log('Fixed default exports');
