import Database from 'better-sqlite3';
import path from 'path';
import { readFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DB_PATH = path.join(__dirname, '../../data/crmai.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!_db) {
    // Ensure data directory exists
    mkdirSync(path.dirname(DB_PATH), { recursive: true });
    _db = new Database(DB_PATH);
    // Use better-sqlite3 pragma API — NOT raw SQL
    _db.pragma('journal_mode = WAL');
    _db.pragma('foreign_keys = ON');
    _db.pragma('synchronous = NORMAL');
    _db.pragma('temp_store = MEMORY');
    _db.pragma('cache_size = -32000');
  }
  return _db;
}

export function runMigrations(): void {
  const db = getDb();
  try {
    const schema = readFileSync(SCHEMA_PATH, 'utf-8');
    db.exec(schema);
    console.log('✅ Database schema applied');
  } catch (err: any) {
    console.error('❌ Migration failed:', err.message);
    throw err;
  }
}

export default getDb;
