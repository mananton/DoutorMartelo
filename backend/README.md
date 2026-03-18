# Backend Setup

## Environment variables

### Google Sheets
- `GOOGLE_SHEETS_SPREADSHEET_ID`
- `GOOGLE_SERVICE_ACCOUNT_FILE`
or
- `GOOGLE_SERVICE_ACCOUNT_JSON`

### Supabase
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_SCHEMA` optional, default `public`

## Local run

```powershell
uvicorn backend.app.main:app --reload
```

If Google Sheets / Supabase variables are missing, the app falls back to in-memory adapters for local development.

