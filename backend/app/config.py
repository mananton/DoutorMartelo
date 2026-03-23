from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path


def _load_dotenv_file() -> None:
    env_path = Path(__file__).resolve().parents[1] / ".env"
    if not env_path.exists():
        return

    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()
        if len(value) >= 2 and ((value.startswith('"') and value.endswith('"')) or (value.startswith("'") and value.endswith("'"))):
            value = value[1:-1]
        os.environ.setdefault(key, value)


_load_dotenv_file()


@dataclass(slots=True)
class Settings:
    google_spreadsheet_id: str | None
    google_service_account_file: str | None
    google_service_account_json: str | None
    supabase_url: str | None
    supabase_service_role_key: str | None
    supabase_schema: str
    disable_live_adapters: bool
    cors_allowed_origins: list[str]
    frontend_dist_dir: str | None
    disable_frontend_serving: bool

    @classmethod
    def from_env(cls) -> "Settings":
        return cls(
            google_spreadsheet_id=os.getenv("GOOGLE_SHEETS_SPREADSHEET_ID"),
            google_service_account_file=os.getenv("GOOGLE_SERVICE_ACCOUNT_FILE"),
            google_service_account_json=os.getenv("GOOGLE_SERVICE_ACCOUNT_JSON"),
            supabase_url=os.getenv("SUPABASE_URL"),
            supabase_service_role_key=os.getenv("SUPABASE_SERVICE_ROLE_KEY"),
            supabase_schema=os.getenv("SUPABASE_SCHEMA", "public"),
            disable_live_adapters=_read_bool_env("BACKEND_DISABLE_LIVE_ADAPTERS"),
            cors_allowed_origins=_read_csv_env(
                "BACKOFFICE_CORS_ALLOWED_ORIGINS",
                default=["http://127.0.0.1:5173", "http://localhost:5173"],
            ),
            frontend_dist_dir=os.getenv("BACKOFFICE_FRONTEND_DIST_DIR"),
            disable_frontend_serving=_read_bool_env("BACKOFFICE_DISABLE_FRONTEND_SERVING"),
        )

    @property
    def has_google_sheets(self) -> bool:
        return not self.disable_live_adapters and bool(self.google_spreadsheet_id and (self.google_service_account_file or self.google_service_account_json))

    @property
    def has_supabase(self) -> bool:
        return not self.disable_live_adapters and bool(self.supabase_url and self.supabase_service_role_key)

    def load_service_account_info(self) -> dict[str, object]:
        if self.google_service_account_json:
            return json.loads(self.google_service_account_json)
        if self.google_service_account_file:
            with open(self.google_service_account_file, "r", encoding="utf-8") as handle:
                return json.load(handle)
        raise RuntimeError("Google service account config missing")


def _read_bool_env(name: str) -> bool:
    value = (os.getenv(name) or "").strip().lower()
    return value in {"1", "true", "yes", "on"}


def _read_csv_env(name: str, *, default: list[str] | None = None) -> list[str]:
    raw = (os.getenv(name) or "").strip()
    if not raw:
        return list(default or [])
    return [item.strip() for item in raw.split(",") if item.strip()]
