import express from "express";
import { Pool } from "pg";
import { z } from "zod";

const app = express();
app.use(express.json());

const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL })
  : null;

app.get("/health", (_req, res) => res.json({ ok: true, service: "crewcode-express-api" }));

app.get("/api/items", async (_req, res) => {
  if (!pool) return res.json({ items: [], note: "no DATABASE_URL — running without a database (see .env.example)" });
  try {
    const { rows } = await pool.query("select id, name from items order by id limit 100").catch(async () => {
      await pool.query("create table if not exists items (id serial primary key, name text not null)");
      return { rows: [] as any[] };
    });
    res.json({ items: rows });
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? "query failed" });
  }
});

const Item = z.object({ name: z.string().min(1).max(200) });

app.post("/api/items", async (req, res) => {
  const parsed = Item.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error);
  if (!pool) return res.status(200).json({ ok: true, item: { id: 0, ...parsed.data }, note: "no DATABASE_URL — not persisted" });
  try {
    const { rows } = await pool.query("insert into items (name) values ($1) returning *", [parsed.data.name]);
    res.status(201).json({ ok: true, item: rows[0] });
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? "insert failed" });
  }
});

const port = Number(process.env.PORT ?? 8000);
app.listen(port, () => console.log(`[crewcode-express-api] listening on :${port}`));
