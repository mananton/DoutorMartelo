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

### 4. Run the backend

```powershell
uvicorn backend.app.main:app --reload
```

If the variables are valid, the backend uses the live adapters automatically.
If not, it falls back to in-memory adapters.

## Local run

```powershell
uvicorn backend.app.main:app --reload
```

If Google Sheets / Supabase variables are missing, the app falls back to in-memory adapters for local development.
