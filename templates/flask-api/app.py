import os

from flask import Flask, jsonify, request
from flask_cors import CORS

try:
    import psycopg2
    import psycopg2.extras

    HAVE_PG = True
except ImportError:  # pragma: no cover - optional dependency
    HAVE_PG = False

app = Flask(__name__)
CORS(app)

_items: list = []
_next_id = 1


def _pg():
    if not HAVE_PG:
        return None
    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        return None
    return psycopg2.connect(dsn)


@app.get("/health")
def health():
    return jsonify({"ok": True, "service": "crewcode-flask-api"})


@app.get("/api/items")
def items():
    conn = _pg()
    if conn is None:
        return jsonify({"items": _items, "note": "no DATABASE_URL — running without a database (see .env.example)"})
    try:
        with conn, conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("create table if not exists items (id serial primary key, name text not null)")
            cur.execute("select id, name from items order by id limit 100")
            return jsonify({"items": cur.fetchall()})
    finally:
        conn.close()


@app.post("/api/items")
def create_item():
    global _next_id
    data = request.get_json(silent=True) or {}
    name = str(data.get("name", "")).strip()
    if not name or len(name) > 200:
        return jsonify({"error": "name is required (max 200 chars)"}), 400
    conn = _pg()
    if conn is None:
        item = {"id": 0, "name": name}
        _items.append(item)
        return jsonify({"ok": True, "item": item, "note": "no DATABASE_URL — not persisted"}), 201
    try:
        with conn, conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("insert into items (name) values (%s) returning id, name", (name,))
            return jsonify({"ok": True, "item": cur.fetchone()}), 201
    finally:
        conn.close()
