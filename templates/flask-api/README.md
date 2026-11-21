# CrewCode Flask API starter

JSON API with `/health` and `GET/POST /api/items`. Works with or without
Postgres: without `DATABASE_URL` it answers from memory and says so.

```powershell
pip install -r requirements.txt
flask run            # http://localhost:5000/health
gunicorn -w 4 -b 0.0.0.0:8000 app:app
```
