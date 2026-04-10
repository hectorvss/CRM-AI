import Database from 'better-sqlite3';
import path from 'path';
import { readFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { config } from '../config.js';
import { runIncrementalMigrations } from './migrate.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DB_PATH = path.join(__dirname, '../../data/crmai.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  // If we are in Supabase mode, getDb() shouldn't be the primary bucket.
  // We allow it to initialize ONLY if explicitly needed or for legacy fallbacks,
  // but we should aim for zero usage in Supabase mode.
  if (config.db.provider === 'supabase') {
    console.warn('⚠️  Legacy getDb() called while in Supabase mode. Ensure this is intentional.');
  }

  if (!_db) {
    // Ensure data directory exists
    mkdirSync(path.dirname(DB_PATH), { recursive: true });
    _db = new Database(DB_PATH);
    // Use better-sqlite3 pragma API
    _db.pragma('journal_mode = WAL');
    _db.pragma('foreign_keys = ON');
    _db.pragma('synchronous = NORMAL');
    _db.pragma('temp_store = MEMORY');
    _db.pragma('cache_size = -32000');
  }
  return _db;
}

export function runMigrations(): void {
  // Only run SQLite migrations if we are using SQLite
  if (config.db.provider !== 'sqlite') {
    console.log('ℹ️  Skipping SQLite migrations (Provider is set to Supabase)');
    return;
  }

  const db = getDb();
  try {
    // Step 1: apply base schema
    const schema = readFileSync(SCHEMA_PATH, 'utf-8');
    db.exec(schema);
    console.log('✅ Database schema applied');

    // Step 2: apply incremental ALTER TABLE migrations
    runIncrementalMigrations(db);
  } catch (err: any) {
    console.error('❌ Migration failed:', err.message);
    throw err;
  }
}

export default getDb;
