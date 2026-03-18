from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import httpx

from backend.app.config import Settings


REQUIRED_SHEETS = [
    "FATURAS",
    "FATURAS_ITENS",
    "MATERIAIS_CAD",
    "AFETACOES_OBRA",
    "MATERIAIS_MOV",
    "STOCK_ATUAL",
]

REQUIRED_TABLES = [
    "faturas",
    "faturas_itens",
    "materiais_cad",
    "afetacoes_obra",
    "materiais_mov",
    "stock_atual",
]


def check_google_sheets(settings: Settings) -> tuple[bool, list[str]]:
    messages: list[str] = []
    if not settings.has_google_sheets:
        return False, ["Google Sheets config missing in backend/.env"]

    try:
        from google.oauth2.service_account import Credentials
        from googleapiclient.discovery import build
    except Exception as exc:  # pragma: no cover - dependency import guard
        return False, [f"Google client dependencies missing: {exc}"]

    try:
        creds = Credentials.from_service_account_info(
            settings.load_service_account_info(),
            scopes=["https://www.googleapis.com/auth/spreadsheets.readonly"],
        )
        service = build("sheets", "v4", credentials=creds, cache_discovery=False)
        spreadsheet = service.spreadsheets().get(spreadsheetId=settings.google_spreadsheet_id).execute()
        title = spreadsheet.get("properties", {}).get("title", "(sem titulo)")
        messages.append(f"Spreadsheet OK: {title}")
        existing = {sheet["properties"]["title"] for sheet in spreadsheet.get("sheets", [])}
        missing = [name for name in REQUIRED_SHEETS if name not in existing]
        if missing:
            messages.append("Missing sheets: " + ", ".join(missing))
            return False, messages
        messages.append("All required core sheets found.")
        return True, messages
    except Exception as exc:
        return False, [f"Google Sheets connection failed: {exc}"]


def check_supabase(settings: Settings) -> tuple[bool, list[str]]:
    messages: list[str] = []
    if not settings.has_supabase:
        return False, ["Supabase config missing in backend/.env"]

    headers = {
        "apikey": settings.supabase_service_role_key or "",
        "Authorization": f"Bearer {settings.supabase_service_role_key or ''}",
        "Accept-Profile": settings.supabase_schema,
        "Content-Profile": settings.supabase_schema,
    }

    base_url = f"{settings.supabase_url.rstrip('/')}/rest/v1"
    missing_tables: list[str] = []

    try:
        with httpx.Client(timeout=20.0) as client:
            for table in REQUIRED_TABLES:
                response = client.get(
                    f"{base_url}/{table}",
                    headers=headers,
                    params={"select": "*", "limit": 1},
                )
                if response.status_code >= 300:
                    missing_tables.append(f"{table} (HTTP {response.status_code})")
        if missing_tables:
            messages.append("Supabase reachable, but some required tables are missing or inaccessible:")
            messages.extend(missing_tables)
            return False, messages
        messages.append("Supabase OK: all required core tables are reachable.")
        return True, messages
    except Exception as exc:
        return False, [f"Supabase connection failed: {exc}"]


def main() -> int:
    settings = Settings.from_env()

    print("== Checking Google Sheets ==")
    sheets_ok, sheets_messages = check_google_sheets(settings)
    for message in sheets_messages:
        print("-", message)

    print("\n== Checking Supabase ==")
    supabase_ok, supabase_messages = check_supabase(settings)
    for message in supabase_messages:
        print("-", message)

    if sheets_ok and supabase_ok:
        print("\nAll integrations are ready.")
        return 0

    print("\nIntegration check failed.")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
