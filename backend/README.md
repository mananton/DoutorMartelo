# Backend Setup

## Environment variables

Copy `backend/.env.example` to `backend/.env` and fill the real values.

### Google Sheets
- `GOOGLE_SHEETS_SPREADSHEET_ID`
- `GOOGLE_SERVICE_ACCOUNT_FILE`
or
- `GOOGLE_SERVICE_ACCOUNT_JSON`

### Supabase
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_SCHEMA` optional, default `public`

## How to activate the real connection

### 1. Google Sheets
- Create or reuse a Google Cloud service account with access to the Sheets API.
- Download the service-account JSON key.
- Put the spreadsheet ID in `GOOGLE_SHEETS_SPREADSHEET_ID`.
- Set either:
  - `GOOGLE_SERVICE_ACCOUNT_FILE` with the absolute path to the JSON file
  - or `GOOGLE_SERVICE_ACCOUNT_JSON` with the JSON content in one line
- Share the target Google Spreadsheet with the service-account email as editor.

### 2. Supabase
- Set `SUPABASE_URL` to your project URL, for example `https://abc123.supabase.co`.
- Set `SUPABASE_SERVICE_ROLE_KEY` with the service role key from `Project Settings -> API`.
- Optional: set `SUPABASE_SCHEMA` if you are not using `public`.
- Run the bootstrap SQL in `backend/sql/001_materials_backoffice.sql` in the Supabase SQL editor before the first real sync.

### 3. Validate before running the app

```powershell
python backend/scripts/check_integrations.py
```

This checks:
- Google Sheets authentication and spreadsheet access
- presence of the required core sheets
- Supabase authentication
- presence of the required core tables

## Startup hydration behavior

When live Google Sheets credentials are configured, the backend now hydrates startup runtime state from the core materials sheets:
- `FATURAS`
- `FATURAS_ITENS`
- `MATERIAIS_CAD`
- `AFETACOES_OBRA`
- `MATERIAIS_MOV`

This means the new materials backoffice does not restart empty anymore. New IDs are also seeded from the existing sheet state.

## Development mode

Use this when you are still changing code and want the React dev server.

```powershell
python -m uvicorn backend.app.main:app --reload --host 127.0.0.1 --port 8000
```

In a second terminal:

```powershell
cd frontend
$env:VITE_API_BASE_URL='http://127.0.0.1:8000'
npm.cmd run dev -- --host 127.0.0.1
```

If the variables are valid, the backend uses the live adapters automatically.
If not, it falls back to in-memory adapters.

## Operational mode

Use this when a colleague should access the app through a single stable URL served by FastAPI.

### 1. Build the frontend once

```powershell
cd frontend
npm.cmd run build
```

### 2. Run the backend without `--reload`

```powershell
python -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000
```

When `frontend/dist` exists, FastAPI now serves the built React app itself:
- `/` opens the materials backoffice
- `/faturas`, `/catalogo`, `/afetacoes`, etc. work as SPA routes
- `/api/*` keeps serving the backend API

This means your colleague no longer needs `npm run dev` or port `5173`.

### 3. Optional operational env vars

- `BACKOFFICE_CORS_ALLOWED_ORIGINS`
  - only needed if you still want extra browser origins besides the built same-origin app
- `BACKOFFICE_FRONTEND_DIST_DIR`
  - override the default `../frontend/dist`
- `BACKOFFICE_DISABLE_FRONTEND_SERVING`
  - disables built frontend serving if you explicitly want backend-only mode

## Windows operation scripts

The repo now includes helper scripts under `backend/ops/` so day-to-day updates become simpler.

### Files

- `backend/ops/Run-MaterialsBackoffice.ps1`
  - starts the backend in operational mode
- `backend/ops/Update-MaterialsBackoffice.ps1`
  - rebuilds the frontend
  - runs a short backend test suite
  - optionally restarts the Windows service
- `backend/ops/Install-MaterialsBackofficeService.ps1`
  - installs the app as a Windows service using `NSSM`

### Important note

Python + Uvicorn is not a native Windows service by itself.
For a real Windows service, the recommended wrapper here is `NSSM`:
- https://nssm.cc/

### Safe update during office hours

If someone is using the app and you only want to prepare the update:

```powershell
.\backend\ops\Update-MaterialsBackoffice.ps1 -NoRestart
```

This does:
- frontend build
- short backend validation tests
- no restart yet

Later, when there is a safe pause, restart the service:

```powershell
Restart-Service MaterialsBackoffice
```

### Install the Windows service

Do this only when no one is actively saving data in the app.

Example:

```powershell
.\backend\ops\Install-MaterialsBackofficeService.ps1 -NssmPath "C:\tools\nssm\nssm.exe" -PythonExe "C:\Users\<USER>\AppData\Local\Python\pythoncore-3.14-64\python.exe"
```

By default this creates:
- service name: `MaterialsBackoffice`
- listen URL: `http://<IP-DO-PC>:8000/`

Logs are written to:
- `backend/logs/service.stdout.log`
- `backend/logs/service.stderr.log`

Performance timing diagnostics for the materials write path are also written to `service.stderr.log`, for example:
- Google Sheets upsert timings
- Supabase mirror timings
- total invoice-line save timings

Important:
- do not use the Microsoft Store Python / `WindowsApps` alias for the Windows service
- use a normal Python executable outside `WindowsApps`
- if local `http://127.0.0.1:8000/api/faturas` works but a colleague gets timeout from another PC, open Windows Firewall inbound TCP `8000`

Example firewall rule:

```powershell
New-NetFirewallRule -DisplayName "MaterialsBackoffice TCP 8000" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 8000 -Profile Private,Domain
```

### Normal update after the service exists

```powershell
.\backend\ops\Update-MaterialsBackoffice.ps1
```

If the service exists, the script:
- rebuilds the frontend
- runs the short validation tests
- restarts `MaterialsBackoffice`

If the service does not exist yet, it stops after build/tests and tells you to restart the backend manually.

## Current operational note

This is now suitable for trusted internal use on a stable machine/URL, and has already been validated in LAN use through the `MaterialsBackoffice` Windows service.
It still lacks authentication.
For daily office use, the recommended posture today is:
- trusted internal network
- one machine/service running FastAPI
- frontend served by the same FastAPI process
- code changes continue to happen in development mode, then get rebuilt/restarted into operational mode
