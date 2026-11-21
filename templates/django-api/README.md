# CrewCode Django API starter

JSON API with `/api/health` and `/api/items`. Runs on sqlite out of the box;
point `DATABASES` at Postgres when you outgrow it.

```powershell
pip install -r requirements.txt
python manage.py runserver    # http://localhost:8000/api/health
gunicorn crewcode.wsgi:application -b 0.0.0.0:8000
```
