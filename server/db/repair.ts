import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '../../data/crmai.db');
const db = new Database(dbPath);

console.log('--- Database Repair Script ---');

try {
  const tableInfo = db.pragma('table_info(payments)') as any[];
  const hasWorkspaceId = tableInfo.some(c => c.name === 'workspace_id');

  if (!hasWorkspaceId) {
    console.log('Adding missing workspace_id to payments table...');
    db.exec("ALTER TABLE payments ADD COLUMN workspace_id TEXT NOT NULL DEFAULT 'ws_default'");
    console.log('✅ Added workspace_id to payments');
  } else {
    console.log('✅ workspace_id already exists in payments');
  }

  // Check agent_runs too
  const agentRunsInfo = db.pragma('table_info(agent_runs)') as any[];
  const hasArWorkspaceId = agentRunsInfo.some(c => c.name === 'workspace_id');
  if (!hasArWorkspaceId) {
    console.log('Adding missing workspace_id to agent_runs table...');
    db.exec("ALTER TABLE agent_runs ADD COLUMN workspace_id TEXT NOT NULL DEFAULT 'ws_default'");
    console.log('✅ Added workspace_id to agent_runs');
  }

  console.log('--- Repair Complete ---');
} catch (err) {
  console.error('❌ Repair failed:', err);
} finally {
  db.close();
}
