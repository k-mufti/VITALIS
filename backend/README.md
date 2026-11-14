# VITALIS backend

Built in layers. Each step adds one thing and is tested before the next (see plan.md section 6.1).

```
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --port 8001
```

Open http://localhost:8001/docs for the interactive API page.
