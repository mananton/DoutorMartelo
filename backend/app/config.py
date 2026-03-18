from __future__ import annotations

import json
import os
from dataclasses import dataclass


@dataclass(slots=True)
class Settings:
    google_spreadsheet_id: str | None
    google_service_account_file: str | None
    google_service_account_json: str | None
    supabase_url: str | None
    supabase_service_role_key: str | None
    supabase_schema: str

    @classmethod
    def from_env(cls) -> "Settings":
        return cls(
            google_spreadsheet_id=os.getenv("GOOGLE_SHEETS_SPREADSHEET_ID"),
            google_service_account_file=os.getenv("GOOGLE_SERVICE_ACCOUNT_FILE"),
            google_service_account_json=os.getenv("GOOGLE_SERVICE_ACCOUNT_JSON"),
            supabase_url=os.getenv("SUPABASE_URL"),
            supabase_service_role_key=os.getenv("SUPABASE_SERVICE_ROLE_KEY"),
            supabase_schema=os.getenv("SUPABASE_SCHEMA", "public"),
        )

    @property
    def has_google_sheets(self) -> bool:
        return bool(self.google_spreadsheet_id and (self.google_service_account_file or self.google_service_account_json))

    @property
    def has_supabase(self) -> bool:
        return bool(self.supabase_url and self.supabase_service_role_key)

    def load_service_account_info(self) -> dict[str, object]:
        if self.google_service_account_json:
            return json.loads(self.google_service_account_json)
        if self.google_service_account_file:
            with open(self.google_service_account_file, "r", encoding="utf-8") as handle:
                return json.load(handle)
        raise RuntimeError("Google service account config missing")

