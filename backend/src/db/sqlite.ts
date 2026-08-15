import Database from 'better-sqlite3';
import { DbAdapter, QueryOptions, QueryWhere, Row, normalizeWhere } from './adapter';

function buildWhere(where: QueryWhere): { sql: string; params: any[] } {
  const clean = normalizeWhere(where);
  const keys = Object.keys(clean);
  if (keys.length === 0) return { sql: '', params: [] };
  const sql = ' WHERE ' + keys.map((k) => `${k} = ?`).join(' AND ');
  return { sql, params: keys.map((k) => bindVal(clean[k])) };
}

function bindVal(v: any): any {
  if (typeof v === 'boolean') return v ? 1 : 0;
  return v;
}

export class SqliteAdapter implements DbAdapter {
  readonly name = 'sqlite';
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  async select(table: string, opts?: QueryOptions): Promise<Row[]> {
    const { sql, params } = buildWhere(opts?.where || {});
    let orderSql = '';
    const orders = opts?.order ? (Array.isArray(opts.order) ? opts.order : [opts.order]) : [];
    if (orders.length) {
      orderSql = ' ORDER BY ' + orders.map((o) => `${o.column} ${o.dir === 'desc' ? 'DESC' : 'ASC'}`).join(', ');
    }
    let limitSql = '';
    if (opts?.limit) {
      limitSql = ` LIMIT ${Math.max(0, Math.floor(opts.limit))}${opts?.offset ? ` OFFSET ${Math.max(0, Math.floor(opts.offset))}` : ''}`;
    }
    const stmt = this.db.prepare(`SELECT * FROM ${table}${sql}${orderSql}${limitSql}`);
    return stmt.all(...params) as Row[];
  }

  async selectOne(table: string, opts?: QueryOptions): Promise<Row | null> {
    const rows = await this.select(table, { ...opts, limit: 1 });
    return rows[0] ?? null;
  }

  async insert(table: string, data: Row | Row[]): Promise<Row | Row[]> {
    const rows = Array.isArray(data) ? data : [data];
    const insertOne = this.db.transaction((r: Row) => {
      const keys = Object.keys(r);
      const placeholders = keys.map(() => '?').join(', ');
      const stmt = this.db.prepare(`INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`);
      stmt.run(...keys.map((k) => bindVal(r[k])));
      return r;
    });
    const insertAll = this.db.transaction((list: Row[]) => list.map((r) => insertOne(r)));
    const out = insertAll(rows);
    return Array.isArray(data) ? out : out[0];
  }

  async update(table: string, where: QueryWhere, data: Row): Promise<Row | null> {
    const w = buildWhere(where);
    const keys = Object.keys(data);
    if (keys.length === 0) return null;
    const stmt = this.db.prepare(
      `UPDATE ${table} SET ${keys.map((k) => `${k} = ?`).join(', ')}${w.sql}`
    );
    const result = stmt.run(...keys.map((k) => bindVal(data[k])), ...w.params);
    if (result.changes === 0) return null;
    const row = await this.selectOne(table, { where });
    return row;
  }

  async updateMany(table: string, where: QueryWhere, data: Row): Promise<number> {
    const w = buildWhere(where);
    const keys = Object.keys(data);
    if (keys.length === 0) return 0;
    const stmt = this.db.prepare(
      `UPDATE ${table} SET ${keys.map((k) => `${k} = ?`).join(', ')}${w.sql}`
    );
    const result = stmt.run(...keys.map((k) => bindVal(data[k])), ...w.params);
    return result.changes;
  }

  async remove(table: string, where: QueryWhere): Promise<void> {
    const w = buildWhere(where);
    const stmt = this.db.prepare(`DELETE FROM ${table}${w.sql}`);
    stmt.run(...w.params);
  }

  async count(table: string, opts?: QueryOptions): Promise<number> {
    const w = buildWhere(opts?.where || {});
    const full = `SELECT COUNT(*) as c FROM ${table}${w.sql}`;
    const stmt = this.db.prepare(full);
    const row = stmt.get(...w.params) as { c: number };
    return row.c;
  }
}
