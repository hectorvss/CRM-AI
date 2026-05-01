export function getDb(): any {
  throw new Error('SQLite runtime has been removed. Use Supabase-backed repositories only.');
}

export function runMigrations(): void {
  throw new Error('SQLite migrations have been removed. Manage schema in Supabase only.');
}

export default getDb;
