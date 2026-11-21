
import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL ?? "postgres://crewcode:crewcode@localhost:5432/crewcode";
export const pool = new Pool({ connectionString });

export async function queryWithOrg<T = any>(text: string, params: any[], orgId: string | null): Promise<T[]> {
  const client = await pool.connect();
  try {
    if (orgId) await client.query(`select set_config('app.current_org_id', $1, true)`, [orgId]);
    const res = await client.query(text, params);
    return res.rows as T[];
  } finally {
    client.release();
  }
}


export async function query<T = any>(text: string, params?: any[]): Promise<T[]> {
  const res = await pool.query(text, params);
  return res.rows as T[];
}
