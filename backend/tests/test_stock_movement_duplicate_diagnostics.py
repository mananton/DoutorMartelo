from __future__ import annotations

from datetime import UTC, date, datetime
import unittest

from backend.app.adapters.google_sheets.memory import MemoryGoogleSheetsAdapter
from backend.app.adapters.supabase.memory import MemorySupabaseAdapter
from backend.app.services.materials import MaterialsService
from backend.app.services.state import RuntimeState


def _ts() -> datetime:
    return datetime(2026, 3, 19, tzinfo=UTC)


class StockMovementDuplicateDiagnosticsTests(unittest.TestCase):
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
            }
        }
        google = MemoryGoogleSheetsAdapter(state)
        supabase = MemorySupabaseAdapter(state)
        return MaterialsService(state, google, supabase), state

    def test_diagnose_stock_duplicates_reports_and_cleans_exact_duplicate_rows(self) -> None:
        service, state = self._build_service()
        state.afetacoes = {
            "AFO-000010": {
                "id_afetacao": "AFO-000010",
                "origem": "STOCK",
                "source_id": None,
                "data": date(2026, 3, 18),
                "id_item": "MAT-000001",
                "item_oficial": "PREGO_20",
                "natureza": "MATERIAL",
                "quantidade": 5.0,
                "unidade": "UN",
                "custo_unit": 2.0,
                "custo_total": 12.3,
                "custo_total_sem_iva": 10.0,
                "iva": 23.0,
                "custo_total_com_iva": 12.3,
                "obra": "Pera I",
                "fase": "D - estrutura",
                "fornecedor": None,
                "nif": None,
                "nr_documento": None,
                "processar": True,
                "estado": "MOVIMENTO_GERADO",
                "observacoes": None,
                "sheet_row_num": 2,
                "created_at": _ts(),
                "updated_at": _ts(),
            }
        }
        state.movimentos = {
            "MOV-000050": {
                "id_mov": "MOV-000050",
                "tipo": "CONSUMO",
                "data": date(2026, 3, 18),
                "id_item": "MAT-000001",
                "item_oficial": "PREGO_20",
                "unidade": "UN",
                "quantidade": 5.0,
                "custo_unit": 2.0,
                "custo_total_sem_iva": 10.0,
                "iva": 23.0,
                "custo_total_com_iva": 12.3,
                "obra": "Pera I",
                "fase": "D - estrutura",
                "fornecedor": None,
                "nif": None,
                "nr_documento": None,
                "observacoes": "[SRC_AFO:AFO-000010]",
                "source_type": "AFO",
                "source_id": "AFO-000010",
                "sequence": 50,
                "created_at": _ts(),
                "updated_at": _ts(),
            },
            "MOV-000099": {
                "id_mov": "MOV-000099",
                "tipo": "CONSUMO",
                "data": date(2026, 3, 18),
                "id_item": "MAT-000001",
                "item_oficial": "PREGO_20",
                "unidade": "UN",
                "quantidade": 5.0,
                "custo_unit": 2.0,
                "custo_total_sem_iva": 10.0,
                "iva": 23.0,
                "custo_total_com_iva": 12.3,
                "obra": "Pera I",
                "fase": "D - estrutura",
                "fornecedor": None,
                "nif": None,
                "nr_documento": None,
                "observacoes": "movimento duplicado legado",
                "source_type": "FIT",
                "source_id": "MOV-000099",
                "sequence": 99,
                "created_at": _ts(),
                "updated_at": _ts(),
            },
        }

        report = service.diagnose_stock_movement_duplicates()

        self.assertFalse(report["applied"])
        self.assertEqual(report["exact_duplicate_groups"], 1)
        self.assertEqual(report["exact_duplicate_candidates"], 1)
        self.assertEqual(report["cleanup_id_movs"], ["MOV-000099"])

        applied_report = service.diagnose_stock_movement_duplicates(apply=True)

        self.assertTrue(applied_report["applied"])
        self.assertEqual(applied_report["deleted_count"], 1)
        self.assertEqual(applied_report["deleted_id_movs"], ["MOV-000099"])
        self.assertIn("MOV-000050", state.movimentos)
        self.assertNotIn("MOV-000099", state.movimentos)

    def test_diagnose_stock_duplicates_reports_context_overlaps_and_unreconciled_rows(self) -> None:
        service, state = self._build_service()
        state.afetacoes = {
            "AFO-000007": {
                "id_afetacao": "AFO-000007",
                "origem": "STOCK",
                "source_id": None,
                "data": date(2026, 3, 18),
                "id_item": "MAT-000001",
                "item_oficial": "PREGO_20",
                "natureza": "MATERIAL",
                "quantidade": 2.0,
                "unidade": "UN",
                "custo_unit": 2.0,
                "custo_total": 4.92,
                "custo_total_sem_iva": 4.0,
                "iva": 23.0,
                "custo_total_com_iva": 4.92,
                "obra": "Pera I",
                "fase": "D - estrutura",
                "fornecedor": None,
                "nif": None,
                "nr_documento": None,
                "processar": True,
                "estado": "MOVIMENTO_GERADO",
                "observacoes": None,
                "sheet_row_num": 8,
                "created_at": _ts(),
                "updated_at": _ts(),
            },
            "AFO-000010": {
                "id_afetacao": "AFO-000010",
                "origem": "STOCK",
                "source_id": None,
                "data": date(2026, 3, 18),
                "id_item": "MAT-000001",
                "item_oficial": "PREGO_20",
                "natureza": "MATERIAL",
                "quantidade": 30.0,
                "unidade": "UN",
                "custo_unit": 2.0,
                "custo_total": 73.8,
                "custo_total_sem_iva": 60.0,
                "iva": 23.0,
                "custo_total_com_iva": 73.8,
                "obra": "Pera I",
                "fase": "D - estrutura",
                "fornecedor": None,
                "nif": None,
                "nr_documento": None,
                "processar": True,
                "estado": "MOVIMENTO_ATUALIZADO",
                "observacoes": None,
                "sheet_row_num": 10,
                "created_at": _ts(),
                "updated_at": _ts(),
            },
            "AFO-000011": {
                "id_afetacao": "AFO-000011",
                "origem": "STOCK",
                "source_id": None,
                "data": date(2026, 3, 19),
                "id_item": "MAT-000001",
                "item_oficial": "PREGO_20",
                "natureza": "MATERIAL",
                "quantidade": 1.0,
                "unidade": "UN",
                "custo_unit": 2.0,
                "custo_total": 2.46,
                "custo_total_sem_iva": 2.0,
                "iva": 23.0,
                "custo_total_com_iva": 2.46,
                "obra": "Pera I",
                "fase": "D - estrutura",
                "fornecedor": None,
                "nif": None,
                "nr_documento": None,
                "processar": True,
                "estado": "MOVIMENTO_GERADO",
                "observacoes": None,
                "sheet_row_num": 11,
                "created_at": _ts(),
                "updated_at": _ts(),
            },
        }
        state.movimentos = {
            "MOV-000050": {
                "id_mov": "MOV-000050",
                "tipo": "CONSUMO",
                "data": date(2026, 3, 18),
                "id_item": "MAT-000001",
                "item_oficial": "PREGO_20",
                "unidade": "UN",
                "quantidade": 30.0,
                "custo_unit": 2.0,
                "custo_total_sem_iva": 60.0,
                "iva": 23.0,
                "custo_total_com_iva": 73.8,
                "obra": "Pera I",
                "fase": "D - estrutura",
                "fornecedor": None,
                "nif": None,
                "nr_documento": None,
                "observacoes": "[SRC_AFO:AFO-000010]",
                "source_type": "AFO",
                "source_id": "AFO-000010",
                "sequence": 50,
                "created_at": _ts(),
                "updated_at": _ts(),
            },
            "MOV-000068": {
                "id_mov": "MOV-000068",
                "tipo": "CONSUMO",
                "data": date(2026, 3, 18),
                "id_item": "MAT-000001",
                "item_oficial": "PREGO_20",
                "unidade": "UN",
                "quantidade": 2.0,
                "custo_unit": 2.0,
                "custo_total_sem_iva": 4.0,
                "iva": 23.0,
                "custo_total_com_iva": 4.92,
                "obra": "Pera I",
                "fase": "D - estrutura",
                "fornecedor": None,
                "nif": None,
                "nr_documento": None,
                "observacoes": "[SRC_AFO:AFO-000007]",
                "source_type": "AFO",
                "source_id": "AFO-000007",
                "sequence": 68,
                "created_at": _ts(),
                "updated_at": _ts(),
            },
        }

        report = service.diagnose_stock_movement_duplicates()

        self.assertEqual(report["exact_duplicate_groups"], 0)
        self.assertEqual(report["exact_duplicate_candidates"], 0)
        self.assertEqual(report["context_overlap_groups"], 2)
        self.assertEqual(report["unreconciled_generated_afetacoes"], 1)
        self.assertEqual(report["cleanup_id_movs"], [])


if __name__ == "__main__":
    unittest.main()
