from __future__ import annotations

from datetime import UTC, datetime
import unittest

from backend.app.adapters.google_sheets.memory import MemoryGoogleSheetsAdapter
from backend.app.adapters.supabase.memory import MemorySupabaseAdapter
from backend.app.services.materials import MaterialsService
from backend.app.services.state import RuntimeState


def _ts() -> datetime:
    return datetime(2026, 3, 19, tzinfo=UTC)


class ReferenceSeedingTests(unittest.TestCase):
    def _build_service(self) -> tuple[MaterialsService, RuntimeState]:
        state = RuntimeState()
        state.catalog = {
            "MAT-000001": {
                "id_item": "MAT-000001",
                "item_oficial": "PREGO_20",
                "natureza": "MATERIAL",
                "unidade": "UN",
                "observacoes": None,
                "estado_cadastro": "ATIVO",
                "created_at": _ts(),
                "updated_at": _ts(),
            },
            "MAT-000002": {
                "id_item": "MAT-000002",
                "item_oficial": "PARAFUSO_10",
                "natureza": "MATERIAL",
                "unidade": "UN",
                "observacoes": None,
                "estado_cadastro": "ATIVO",
                "created_at": _ts(),
                "updated_at": _ts(),
            },
        }
        google = MemoryGoogleSheetsAdapter(state)
        supabase = MemorySupabaseAdapter(state)
        return MaterialsService(state, google, supabase), state

    def test_seed_references_dry_run_reports_candidates_without_writing(self) -> None:
        service, state = self._build_service()
        state.catalog_references = {
            "REF-000001": {
                "id_referencia": "REF-000001",
                "descricao_original": "Prego 20",
                "id_item": "MAT-000001",
                "observacoes": None,
                "estado_referencia": "ATIVA",
                "created_at": _ts(),
                "updated_at": _ts(),
            }
        }
        state.counters["REF"] = 1
        state.fatura_items = {
            "FIT-000001": {"id_item_fatura": "FIT-000001", "descricao_original": "Prego vinte", "id_item": "MAT-000001", "sheet_row_num": 2},
            "FIT-000002": {"id_item_fatura": "FIT-000002", "descricao_original": "prego vinte", "id_item": "MAT-000001", "sheet_row_num": 3},
            "FIT-000003": {"id_item_fatura": "FIT-000003", "descricao_original": "Parafuso 10", "id_item": "MAT-000002", "sheet_row_num": 4},
            "FIT-000004": {"id_item_fatura": "FIT-000004", "descricao_original": "", "id_item": "MAT-000002", "sheet_row_num": 5},
            "FIT-000005": {"id_item_fatura": "FIT-000005", "descricao_original": "Sem item", "id_item": "", "sheet_row_num": 6},
        }

        report = service.seed_catalog_references_from_invoice_items()

        self.assertFalse(report["applied"])
        self.assertEqual(report["candidate_count_total"], 2)
        self.assertEqual(report["candidate_count_selected"], 2)
        self.assertEqual(report["created_count"], 0)
        self.assertEqual(report["skipped_missing_description"], 1)
        self.assertEqual(report["skipped_missing_mapping"], 1)
        self.assertEqual(len(state.catalog_references), 1)
        self.assertEqual(state.google_write_log, [])
        self.assertEqual(state.supabase_write_log, [])

    def test_seed_references_detects_conflicts_for_same_description_with_multiple_items(self) -> None:
        service, state = self._build_service()
        state.fatura_items = {
            "FIT-000001": {"id_item_fatura": "FIT-000001", "descricao_original": "Prego 30", "id_item": "MAT-000001", "sheet_row_num": 2},
            "FIT-000002": {"id_item_fatura": "FIT-000002", "descricao_original": "prego 30", "id_item": "MAT-000002", "sheet_row_num": 3},
        }

        report = service.seed_catalog_references_from_invoice_items()

        self.assertEqual(report["candidate_count_total"], 0)
        self.assertEqual(report["conflicts"], 1)
        self.assertEqual(report["created_count"], 0)
        self.assertEqual(state.catalog_references, {})

    def test_seed_references_apply_writes_selected_candidates_only(self) -> None:
        service, state = self._build_service()
        state.counters["REF"] = 3
        state.fatura_items = {
            "FIT-000001": {"id_item_fatura": "FIT-000001", "descricao_original": "Prego vinte", "id_item": "MAT-000001", "sheet_row_num": 2},
            "FIT-000002": {"id_item_fatura": "FIT-000002", "descricao_original": "Parafuso 10", "id_item": "MAT-000002", "sheet_row_num": 3},
        }

        report = service.seed_catalog_references_from_invoice_items(apply=True, limit=1)

        self.assertTrue(report["applied"])
        self.assertEqual(report["candidate_count_total"], 2)
        self.assertEqual(report["candidate_count_selected"], 1)
        self.assertEqual(report["created_count"], 1)
        self.assertIn("REF-000004", state.catalog_references)
        self.assertEqual(len(state.google_write_log), 1)
        self.assertEqual(state.google_write_log[0].entity, "materiais_referencias")
        self.assertEqual(len(state.google_write_log[0].records), 1)

