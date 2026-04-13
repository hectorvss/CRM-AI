const fs = require('fs');
const file = 'C:/Users/usuario/OneDrive - Universidad Politécnica de Cartagena/Escritorio/CRM AI/CRM-AI/server/data/cases.ts';
let code = fs.readFileSync(file, 'utf8');

// The method we want to keep exactly one of in SupabaseCaseRepository
const matchStr = "  async addStatusHistory(scope: CaseScope, data: any) {\n    const supabase = getSupabaseAdmin();\n    const { error } = await supabase.from('case_status_history').insert({\n      id: crypto.randomUUID(),\n      case_id: data.caseId,\n      from_status: data.fromStatus,\n      to_status: data.toStatus,\n      changed_by: data.changedBy,\n      reason: data.reason || null,\n      tenant_id: scope.tenantId,\n      created_at: new Date().toISOString()\n    });\n    if (error) throw error;\n  }";

// Split and remove all occurrences
let parts = code.split(matchStr);
if (parts.length > 2) {
  // join them back
  let cleanCode = parts.join('');
  
  // Find end of SupabaseCaseRepository and insert it once
  cleanCode = cleanCode.replace('class SQLiteCaseRepository', matchStr + '\n\nclass SQLiteCaseRepository');
  code = cleanCode;
}

// Add stub methods to SQLiteCaseRepository
const stubs = `
  async listOpenCasesWithSLA(scope: CaseScope, limit: number): Promise<any[]> { return []; }
  async listExpiredApprovals(scope: CaseScope, threshold: string): Promise<any[]> { return []; }
  async expireApprovals(scope: CaseScope, threshold: string): Promise<{ changes: number }> { return { changes: 0 }; }
  async updateCasesForExpiredApprovals(scope: CaseScope): Promise<void> {}
  async updateMessage(scope: CaseScope, id: string, updates: any): Promise<void> {}
`;

code = code.replace('class SQLiteCaseRepository implements CaseRepository {', 'class SQLiteCaseRepository implements CaseRepository {' + stubs);

fs.writeFileSync(file, code);
console.log('Done cases');