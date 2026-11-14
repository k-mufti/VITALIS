# VITALIS Rules

Rules for both teammates AND any AI coding agents working in this repo.
Agents: read `plan.md` and this file fully before making any change.

## 1. Ownership (who edits what)

| Area                                              | Owner          |
|---------------------------------------------------|----------------|
| `src/three/`, `assets/models/`, `styles/three.css` | 3D owner (partner) |
| `backend/`, `src/data/`, `src/ui/`, `styles/data-ui.css` | Backend owner (Zaid) |
| `index.html`, `styles.css`, `src/main.js`, `src/nav.js`, `src/state.js`, `src/util.js`, `src/signin.js`, `plan.md`, `rules.md`, `.gitignore` | SHARED |

- Only edit files in your own area.
- Need something from the other area? Ask, or add a `TODO(<owner>):` comment in your own code
  and call the function as defined in the contract. Do not edit their files yourself.
- SHARED files: tell your teammate before editing, keep the change small, and push it right away.
  Add new things at the end of the file. Do not reorder, reformat, or rename existing code.

## 2. Git workflow

- `main` must always run. Never push broken code to `main`.
- Work on a branch: `3d/<short-name>` or `backend/<short-name>` (e.g. `3d/halftone`, `backend/simulator`).
- Before starting work and before every push:
  ```
  git checkout main && git pull --rebase
  git checkout <your-branch> && git rebase main
  ```
- Commit small and often (every 30-60 min of work). One idea per commit.
- Merge to `main` often (at least every 2-3 hours) so branches never drift far apart.
  A quick PR on GitHub is preferred. Self-merge is fine during the hackathon.
- Commit messages: `area: what changed`, e.g. `3d: add halftone silhouette effect`,
  `backend: stream watch vitals over websocket`.
- NEVER `git push --force` to `main`. Never rewrite history others have pulled.
- Merge conflict in a file you do not own? Stop and ask the owner. Do not guess.

## 3. Contracts

- The contracts in `plan.md` section 5 are how our work connects: organ IDs, severity scale,
  data shapes, `src/three/api.js`, backend endpoints, model manifest.
- Changing a contract = update `plan.md` in the SAME commit, start the commit message with
  `contract:`, and tell your teammate.
- Never rename an organ ID or remove a field. Add new fields instead.
- Frontend must still work if the backend is down (`src/data/client.js` falls back to `mock.js`).

## 4. Assets (3D models)

- Put models in `assets/models/`, prefer `.glb`. Compress if possible (Draco / gltf-transform).
- Keep each file under 25 MB. Never commit anything over 50 MB (GitHub rejects 100 MB).
- Every model gets an entry in `assets/models/CREDITS.md`: name, source URL, author, license.
  Only use licenses that allow reuse (CC0, CC-BY, CC-BY-SA with credit).
- Register each model in `assets/models/manifest.json`. Code loads models from the manifest,
  never by hardcoded path.
- Do not commit source files from modeling tools (.blend, .max) unless needed. Store them outside the repo.

## 5. Secrets

- API keys live only in `backend/.env` (gitignored). Commit `backend/.env.example` with empty values.
- Never put a key in frontend code. The browser talks to our backend, the backend talks to the LLM.
- If a key is ever committed, tell your teammate and rotate it immediately.

## 6. Code style

- Simple, readable code over clever code. Plain comments, short and only where they help.
- Prefer a clear `if` over a nested or long ternary.
- Vanilla JS with ES modules. No React, no bundler, no new frameworks without agreeing first.
- New frontend libraries load through the importmap in `index.html` (SHARED, so tell your teammate).
- New Python packages go in `backend/requirements.txt` with a pinned version.
- Keep the existing look: dark UI, Barlow / Barlow Condensed fonts, plain language copy.
- Health numbers in the engine cite their source in a comment (NASA HRP, NASA-STD-3001, etc.).
- All demo data must stay clearly simulated. Keep the footer note "all readings are made up".

## 7. Running locally

```
# frontend (repo root)
python3 -m http.server 8000          # open http://localhost:8000

# backend
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env                 # add keys
uvicorn app.main:app --reload --port 8001
```

## 8. Rules for AI agents

1. Read `plan.md` and `rules.md` before doing anything.
2. Ask which owner you are working for if it is not clear. Only edit that owner's files.
3. Do not edit SHARED files unless the task explicitly says to. If you must, make the smallest
   possible addition and do not reformat anything.
4. Do not refactor, rename, or "clean up" code outside the task.
5. Follow the contracts in `plan.md` section 5 exactly. If the task needs a contract change,
   stop and say so instead of changing it silently.
6. Do not add dependencies, frameworks, or build tools without being told to.
7. Never commit secrets, never force push, never run destructive git commands
   (`reset --hard`, `clean -fd`, branch deletes) without the user confirming.
8. Keep `main` runnable: test in the browser (and the backend if touched) before saying a task is done.
9. When done, summarize which files changed and whether any contract or SHARED file was touched.

## 9. Definition of done

- Runs locally with the commands above, no console errors.
- Works with the backend off (falls back to mock data).
- Only your own area changed, or SHARED changes were announced.
- Committed with a clear message, rebased on latest `main`, merged.
