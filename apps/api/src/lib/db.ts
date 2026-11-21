import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL ?? "postgres://crewcode:crewcode@localhost:5432/crewcode";

export const pool = new Pool({ connectionString });

export async function query<T = any>(text: string, params?: any[]): Promise<T[]> {
  const res = await pool.query(text, params);
  return res.rows as T[];
}
