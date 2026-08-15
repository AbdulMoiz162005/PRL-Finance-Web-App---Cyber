import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { env } from '../config/env';
import { DbAdapter, QueryOptions, QueryWhere, Row, normalizeWhere } from './adapter';

export class SupabaseAdapter implements DbAdapter {
  readonly name = 'supabase';
  private client: SupabaseClient;

  constructor() {
    if (!env.supabaseUrl || !env.supabaseServiceKey) {
      throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required when using Supabase');
    }
    this.client = createClient(env.supabaseUrl, env.supabaseServiceKey, {
      auth: { persistSession: false },
    });
  }

  async select(table: string, opts?: QueryOptions): Promise<Row[]> {
    let q = this.client.from(table).select('*');
    const where = normalizeWhere(opts?.where);
    for (const [k, v] of Object.entries(where)) {
      q = q.eq(k, v);
    }
    const orders = opts?.order ? (Array.isArray(opts.order) ? opts.order : [opts.order]) : [];
    for (const o of orders) {
      q = q.order(o.column, { ascending: o.dir !== 'desc' });
    }
    if (opts?.limit) q = q.limit(opts.limit);
    if (opts?.offset) q = q.range(opts.offset, opts.offset + (opts.limit || 100) - 1);
    const { data, error } = await q;
    if (error) throw new Error(`DB select ${table}: ${error.message}`);
    return (data as Row[]) || [];
  }

  async selectOne(table: string, opts?: QueryOptions): Promise<Row | null> {
    const rows = await this.select(table, { ...opts, limit: 1 });
    return rows[0] ?? null;
  }

  async insert(table: string, data: Row | Row[]): Promise<Row | Row[]> {
    const rows = Array.isArray(data) ? data : [data];
    const { data: inserted, error } = await this.client.from(table).insert(rows).select();
    if (error) throw new Error(`DB insert ${table}: ${error.message}`);
    const out = (inserted as Row[]) || [];
    return Array.isArray(data) ? out : out[0];
  }

  async update(table: string, where: QueryWhere, data: Row): Promise<Row | null> {
    let q = this.client.from(table).update(data).select();
    const clean = normalizeWhere(where);
    for (const [k, v] of Object.entries(clean)) q = q.eq(k, v);
    const { data: updated, error } = await q;
    if (error) throw new Error(`DB update ${table}: ${error.message}`);
    const out = (updated as Row[]) || [];
    return out[0] ?? null;
  }

  async updateMany(table: string, where: QueryWhere, data: Row): Promise<number> {
    let q = this.client.from(table).update(data);
    const clean = normalizeWhere(where);
    for (const [k, v] of Object.entries(clean)) q = q.eq(k, v);
    const { error } = await q;
    if (error) throw new Error(`DB updateMany ${table}: ${error.message}`);
    return 0;
  }

  async remove(table: string, where: QueryWhere): Promise<void> {
    let q = this.client.from(table).delete();
    const clean = normalizeWhere(where);
    for (const [k, v] of Object.entries(clean)) q = q.eq(k, v);
    const { error } = await q;
    if (error) throw new Error(`DB delete ${table}: ${error.message}`);
  }

  async count(table: string, opts?: QueryOptions): Promise<number> {
    let q = this.client.from(table).select('id', { count: 'exact', head: true });
    const clean = normalizeWhere(opts?.where);
    for (const [k, v] of Object.entries(clean)) q = q.eq(k, v);
    const { count, error } = await q;
    if (error) throw new Error(`DB count ${table}: ${error.message}`);
    return count ?? 0;
  }
}
