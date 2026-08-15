export type Row = Record<string, any>;

export interface QueryWhere {
  [column: string]: any;
}

export interface QueryOptions {
  where?: QueryWhere;
  order?: { column: string; dir?: 'asc' | 'desc' } | { column: string; dir?: 'asc' | 'desc' }[];
  limit?: number;
  offset?: number;
}

export interface DbAdapter {
  readonly name: string;
  select(table: string, opts?: QueryOptions): Promise<Row[]>;
  selectOne(table: string, opts?: QueryOptions): Promise<Row | null>;
  insert(table: string, data: Row | Row[]): Promise<Row | Row[]>;
  update(table: string, where: QueryWhere, data: Row): Promise<Row | null>;
  updateMany(table: string, where: QueryWhere, data: Row): Promise<number>;
  remove(table: string, where: QueryWhere): Promise<void>;
  count(table: string, opts?: QueryOptions): Promise<number>;
}

export function normalizeWhere(where: QueryWhere = {}) {
  const clean: QueryWhere = {};
  for (const [k, v] of Object.entries(where)) {
    if (v !== undefined && v !== null && v !== '') clean[k] = v;
  }
  return clean;
}
