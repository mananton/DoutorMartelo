from __future__ import annotations

from datetime import date, datetime
import logging
from time import perf_counter
from typing import Any

import httpx

from backend.app.adapters.google_sheets.base import WriteBatch
from backend.app.adapters.supabase.base import SupabaseAdapter, SupabaseAdapterError
from backend.app.config import Settings


TABLE_CONFIG: dict[str, dict[str, str]] = {
    "colaboradores": {"table": "colaboradores_sync", "conflict": "nome", "id_field": "nome"},
    "pessoal_efetivo": {"table": "pessoal_efetivo", "conflict": "nome", "id_field": "nome"},
    "registos": {"table": "registos_sync", "conflict": "id_registo", "id_field": "id_registo"},
    "deslocacoes": {"table": "deslocacoes_sync", "conflict": "id_viagem", "id_field": "id_viagem"},
    "legacy_mao_obra": {"table": "legacy_mao_obra_sync", "conflict": "source_key", "id_field": "source_key"},
    "faturas": {"table": "faturas", "conflict": "id_fatura", "id_field": "id_fatura"},
    "compromissos_obra": {"table": "compromissos_obra", "conflict": "id_compromisso", "id_field": "id_compromisso"},
    "faturas_itens": {"table": "faturas_itens", "conflict": "id_item_fatura", "id_field": "id_item_fatura"},
    "notas_credito_itens": {"table": "notas_credito_itens", "conflict": "id_item_nota_credito", "id_field": "id_item_nota_credito"},
    "materiais_cad": {"table": "materiais_cad", "conflict": "id_item", "id_field": "id_item"},
    "materiais_referencias": {"table": "materiais_referencias", "conflict": "id_referencia", "id_field": "id_referencia"},
    "afetacoes_obra": {"table": "afetacoes_obra", "conflict": "id_afetacao", "id_field": "id_afetacao"},
    "materiais_mov": {"table": "materiais_mov", "conflict": "id_mov", "id_field": "id_mov"},
    "stock_atual": {"table": "stock_atual", "conflict": "id_item", "id_field": "id_item"},
}
logger = logging.getLogger("uvicorn.error")


class LiveSupabaseAdapter(SupabaseAdapter):
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.base_url = f"{settings.supabase_url.rstrip('/')}/rest/v1"
        self.headers = {
            "apikey": settings.supabase_service_role_key or "",
            "Authorization": f"Bearer {settings.supabase_service_role_key or ''}",
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates,return=representation",
        }

    def write_batches(self, batches: list[WriteBatch]) -> None:
        with httpx.Client(timeout=20.0, trust_env=False) as client:
            for batch in batches:
                if not batch.records:
                    continue
                config = TABLE_CONFIG.get(batch.entity)
                if not config:
                    raise SupabaseAdapterError(f"No Supabase table mapping for {batch.entity}")
                payload = [self._json_ready(record) for record in batch.records]
                started_at = perf_counter()
                try:
                    response = client.post(
                        f"{self.base_url}/{config['table']}",
                        params={"on_conflict": config["conflict"]},
                        headers=self.headers | {"Accept-Profile": self.settings.supabase_schema, "Content-Profile": self.settings.supabase_schema},
                        json=payload,
                    )
                except httpx.HTTPError as exc:
                    raise SupabaseAdapterError(f"Supabase mirror failed for {batch.entity}: {exc}") from exc
                if response.status_code >= 300:
                    raise SupabaseAdapterError(f"Supabase mirror failed for {batch.entity}: HTTP {response.status_code} {response.text}")
                logger.info(
                    "timing.supabase.upsert entity=%s table=%s records=%s duration_ms=%.2f status=%s",
                    batch.entity,
                    config["table"],
                    len(batch.records),
                    (perf_counter() - started_at) * 1000,
                    response.status_code,
                )

    def delete_records(self, entity: str, ids: list[str]) -> None:
        if not ids:
            return
        config = TABLE_CONFIG.get(entity)
        if not config:
            raise SupabaseAdapterError(f"No Supabase table mapping for {entity}")
        joined_ids = ",".join(f'"{record_id}"' for record_id in ids)
        with httpx.Client(timeout=20.0, trust_env=False) as client:
            try:
                response = client.delete(
                    f"{self.base_url}/{config['table']}",
                    params={config["id_field"]: f"in.({joined_ids})"},
                    headers=self.headers | {"Accept-Profile": self.settings.supabase_schema, "Content-Profile": self.settings.supabase_schema},
                )
            except httpx.HTTPError as exc:
                raise SupabaseAdapterError(f"Supabase mirror failed for {entity}: {exc}") from exc
            if response.status_code >= 300:
                raise SupabaseAdapterError(f"Supabase mirror failed for {entity}: HTTP {response.status_code} {response.text}")

    def _json_ready(self, value: Any) -> Any:
        if isinstance(value, datetime):
            return value.isoformat()
        if isinstance(value, date):
            return value.isoformat()
        if isinstance(value, dict):
            return {key: self._json_ready(item) for key, item in value.items()}
        if isinstance(value, list):
            return [self._json_ready(item) for item in value]
        return value
