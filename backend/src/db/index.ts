import { env } from '../config/env';
import { DbAdapter } from './adapter';
import { SupabaseAdapter } from './supabase';
import { SqliteAdapter } from './sqlite';
import { openSqlite } from './schema';

let adapter: DbAdapter | null = null;

export function getDb(): DbAdapter {
  if (adapter) return adapter;
  const useSupabase = env.useSupabase && !!env.supabaseUrl && !!env.supabaseServiceKey;
  if (useSupabase) {
    adapter = new SupabaseAdapter();
  } else {
    adapter = new SqliteAdapter(openSqlite(env.dbFile));
  }
  return adapter;
}

export function resetDb() {
  adapter = null;
}

export { DbAdapter, Row, QueryOptions, QueryWhere } from './adapter';
