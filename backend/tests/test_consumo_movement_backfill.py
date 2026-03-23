from __future__ import annotations

from datetime import UTC, date, datetime
import unittest

from backend.app.adapters.google_sheets.memory import MemoryGoogleSheetsAdapter
from backend.app.adapters.supabase.memory import MemorySupabaseAdapter
from backend.app.services.materials import MaterialsService
from backend.app.services.state import RuntimeState


def _ts() -> datetime:
    return datetime(2026, 3, 23, tzinfo=UTC)


class ConsumoMovementBackfillTests(unittest.TestCase):
    def _build_service(self) -> tuple[MaterialsService, RuntimeState]:
        state = RuntimeState()
        google = MemoryGoogleSheetsAdapter(state)
        supabase = MemorySupabaseAdapter(state)
        return MaterialsService(state, google, supabase), state

    def test_dry_run_reports_fit_sourced_candidate_without_writing(self) -> None:
        service, state = self._build_service()
        state.fatura_items = {
            "FIT-000001": {
                "id_item_fatura": "FIT-000001",
                "custo_total_sem_iva": 10.0,
                "iva": 23.0,
                "custo_total_com_iva": 12.3,
            }
        }
        state.movimentos = {
            "MOV-000001": {
                "id_mov": "MOV-000001",
                "tipo": "CONSUMO",
                "data": date(2026, 3, 20),
                "id_item": "MAT-000001",
                "item_oficial": "PREGO_20",
                "quantidade": 5.0,
                "custo_unit": 2.0,
                "custo_total_sem_iva": None,
                "iva": None,
                "custo_total_com_iva": None,
                "source_type": "FIT",
                "source_id": "FIT-000001",
                "sequence": 1,
                "created_at": _ts(),
                "updated_at": _ts(),
            }
        }

        report = service.backfill_incomplete_consumo_movement_totals()

        self.assertFalse(report["applied"])
        self.assertEqual(report["candidate_count_total"], 1)
        self.assertEqual(report["candidate_count_selected"], 1)
        self.assertEqual(report["updated_count"], 0)
        self.assertEqual(report["unresolved_count"], 0)
        self.assertEqual(state.google_write_log, [])
        self.assertEqual(state.supabase_write_log, [])
        candidate = report["candidates_preview"][0]
        self.assertEqual(candidate["id_mov"], "MOV-000001")
        self.assertEqual(candidate["updated"]["custo_total_sem_iva"], 10.0)
        self.assertEqual(candidate["updated"]["iva"], 23.0)
        self.assertEqual(candidate["updated"]["custo_total_com_iva"], 12.3)

    def test_apply_backfill_updates_afo_sourced_movement_and_persists(self) -> None:
        service, state = self._build_service()
        state.afetacoes = {
            "AFO-000001": {
                "id_afetacao": "AFO-000001",
                "custo_total_sem_iva": 8.0,
                "iva": 23.0,
                "custo_total_com_iva": 9.84,
            }
        }
        state.movimentos = {
            "MOV-000010": {
                "id_mov": "MOV-000010",
                "tipo": "CONSUMO",
                "data": date(2026, 3, 20),
                "id_item": "MAT-000001",
                "item_oficial": "PREGO_20",
                "quantidade": 4.0,
                "custo_unit": 2.0,
                "custo_total_sem_iva": "",
                "iva": "",
                "custo_total_com_iva": "",
                "source_type": "AFO",
                "source_id": "AFO-000001",
                "sheet_row_num": 15,
                "sequence": 10,
                "created_at": _ts(),
                "updated_at": _ts(),
            }
        }

        report = service.backfill_incomplete_consumo_movement_totals(apply=True)

        self.assertTrue(report["applied"])
        self.assertEqual(report["updated_count"], 1)
        self.assertEqual(report["updated_id_movs"], ["MOV-000010"])
        updated = state.movimentos["MOV-000010"]
        self.assertEqual(updated["custo_total_sem_iva"], 8.0)
        self.assertEqual(updated["iva"], 23.0)
        self.assertEqual(updated["custo_total_com_iva"], 9.84)
        self.assertEqual(len(state.google_write_log), 1)
        self.assertEqual(state.google_write_log[0].entity, "materiais_mov")
        self.assertEqual(len(state.google_write_log[0].records), 1)
        self.assertEqual(len(state.supabase_write_log), 1)
        self.assertEqual(state.supabase_write_log[0].entity, "materiais_mov")

    def test_report_marks_unresolved_rows_when_totals_cannot_be_inferred(self) -> None:
        service, state = self._build_service()
        state.movimentos = {
            "MOV-000099": {
                "id_mov": "MOV-000099",
                "tipo": "CONSUMO",
                "data": date(2026, 3, 20),
                "id_item": "MAT-000001",
                "item_oficial": "PREGO_20",
                "quantidade": 0.0,
                "custo_unit": 0.0,
                "custo_total_sem_iva": None,
                "iva": None,
                "custo_total_com_iva": None,
                "source_type": "FIT",
                "source_id": "FIT-DOES-NOT-EXIST",
                "sequence": 99,
                "created_at": _ts(),
                "updated_at": _ts(),
            }
        }

        report = service.backfill_incomplete_consumo_movement_totals()

        self.assertEqual(report["candidate_count_total"], 0)
        self.assertEqual(report["updated_count"], 0)
        self.assertEqual(report["unresolved_count"], 1)
        unresolved = report["unresolved_preview"][0]
        self.assertEqual(unresolved["id_mov"], "MOV-000099")
        self.assertEqual(
            unresolved["missing_fields"],
            ["custo_total_sem_iva", "iva", "custo_total_com_iva"],
        )

    def test_backfill_normalizes_legacy_decimal_iva_values_when_gross_matches(self) -> None:
        service, state = self._build_service()
        state.afetacoes = {
            "AFO-000009": {
                "id_afetacao": "AFO-000009",
                "custo_total_sem_iva": 47.76,
                "iva": 0.23,
                "custo_total_com_iva": 58.74,
            }
        }
        state.movimentos = {
            "MOV-000087": {
                "id_mov": "MOV-000087",
                "tipo": "CONSUMO",
                "data": date(2026, 3, 20),
                "id_item": "MAT-000001",
                "item_oficial": "CIMENTO_SECIL_CZ_CEM_II_BL_32_5N_25_KG",
                "quantidade": 12.0,
                "custo_unit": 3.98,
                "custo_total_sem_iva": 0.0,
                "iva": 0.0,
                "custo_total_com_iva": 0.0,
                "source_type": "AFO",
                "source_id": "AFO-000009",
                "sequence": 87,
                "created_at": _ts(),
                "updated_at": _ts(),
            }
        }

        report = service.backfill_incomplete_consumo_movement_totals()

        candidate = report["candidates_preview"][0]
        self.assertEqual(candidate["id_mov"], "MOV-000087")
        self.assertEqual(candidate["updated"]["custo_total_sem_iva"], 47.76)
        self.assertEqual(candidate["updated"]["iva"], 23.0)
        self.assertEqual(candidate["updated"]["custo_total_com_iva"], 58.74)


if __name__ == "__main__":
    unittest.main()
