from __future__ import annotations

from datetime import UTC, date, datetime
import unittest

from fastapi import HTTPException

from backend.app.adapters.google_sheets.memory import MemoryGoogleSheetsAdapter
from backend.app.adapters.supabase.memory import MemorySupabaseAdapter
from backend.app.services.materials import MaterialsService
from backend.app.services.state import RuntimeState


def _ts() -> datetime:
    return datetime(2026, 3, 19, tzinfo=UTC)


class StockAfetacaoReconciliationTests(unittest.TestCase):
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

    def test_process_stock_afetacao_reuses_unique_legacy_consumption_movement(self) -> None:
        service, state = self._build_service()
        state.afetacoes = {
            "AFO-000001": {
                "id_afetacao": "AFO-000001",
                "origem": "STOCK",
                "source_id": None,
                "data": date(2026, 3, 18),
                "id_item": "MAT-000001",
                "item_oficial": "PREGO_20",
                "natureza": "MATERIAL",
                "quantidade": 5.0,
                "unidade": "UN",
                "custo_unit": 0.0,
                "custo_total": 0.0,
                "custo_total_sem_iva": 0.0,
                "iva": 23.0,
                "custo_total_com_iva": 0.0,
                "obra": "Pera I",
                "fase": "D - estrutura",
                "fornecedor": None,
                "nif": None,
                "nr_documento": None,
                "processar": True,
                "estado": "MOVIMENTO_GERADO",
                "observacoes": "teste",
                "sheet_row_num": 2,
                "created_at": _ts(),
                "updated_at": _ts(),
            }
        }
        state.movimentos = {
            "MOV-000001": {
                "id_mov": "MOV-000001",
                "tipo": "ENTRADA",
                "data": date(2026, 3, 1),
                "id_item": "MAT-000001",
                "item_oficial": "PREGO_20",
                "unidade": "UN",
                "quantidade": 10.0,
                "custo_unit": 2.0,
                "custo_total_sem_iva": 20.0,
                "iva": 23.0,
                "custo_total_com_iva": 24.6,
                "obra": None,
                "fase": None,
                "fornecedor": None,
                "nif": None,
                "nr_documento": None,
                "observacoes": "[SRC_FIT:FIT-000001]",
                "source_type": "FIT",
                "source_id": "FIT-000001",
                "sequence": 1,
                "created_at": _ts(),
                "updated_at": _ts(),
            },
            "MOV-000010": {
                "id_mov": "MOV-000010",
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
                "observacoes": "movimento legado sem marcador",
                "source_type": "FIT",
                "source_id": "MOV-000010",
                "sequence": 10,
                "created_at": _ts(),
                "updated_at": _ts(),
            },
        }

        result = service.process_afetacao("AFO-000001")

        self.assertEqual(result.id_afetacao, "AFO-000001")
        self.assertEqual(state.movimentos["MOV-000010"]["id_mov"], "MOV-000010")
        self.assertEqual(state.afetacoes["AFO-000001"]["estado"], "MOVIMENTO_ATUALIZADO")
        self.assertIn("[SRC_AFO:AFO-000001]", str(state.movimentos["MOV-000010"]["observacoes"]))
        self.assertEqual(len(state.google_write_log), 2)
        self.assertEqual(state.google_write_log[1].entity, "materiais_mov")
        self.assertEqual(state.google_write_log[1].records[0]["id_mov"], "MOV-000010")

    def test_process_stock_afetacao_blocks_when_existing_generated_movement_cannot_be_reconciled(self) -> None:
        service, state = self._build_service()
        state.afetacoes = {
            "AFO-000001": {
                "id_afetacao": "AFO-000001",
                "origem": "STOCK",
                "source_id": None,
                "data": date(2026, 3, 18),
                "id_item": "MAT-000001",
                "item_oficial": "PREGO_20",
                "natureza": "MATERIAL",
                "quantidade": 5.0,
                "unidade": "UN",
                "custo_unit": 0.0,
                "custo_total": 0.0,
                "custo_total_sem_iva": 0.0,
                "iva": 23.0,
                "custo_total_com_iva": 0.0,
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
            "MOV-000001": {
                "id_mov": "MOV-000001",
                "tipo": "ENTRADA",
                "data": date(2026, 3, 1),
                "id_item": "MAT-000001",
                "item_oficial": "PREGO_20",
                "unidade": "UN",
                "quantidade": 10.0,
                "custo_unit": 2.0,
                "custo_total_sem_iva": 20.0,
                "iva": 23.0,
                "custo_total_com_iva": 24.6,
                "obra": None,
                "fase": None,
                "fornecedor": None,
                "nif": None,
                "nr_documento": None,
                "observacoes": "[SRC_FIT:FIT-000001]",
                "source_type": "FIT",
                "source_id": "FIT-000001",
                "sequence": 1,
                "created_at": _ts(),
                "updated_at": _ts(),
            }
        }

        with self.assertRaises(HTTPException) as captured:
            service.process_afetacao("AFO-000001")

        self.assertEqual(captured.exception.status_code, 409)
        self.assertEqual(captured.exception.detail, "MOVIMENTO_STOCK_EXISTENTE_NAO_RECONCILIADO")
        self.assertEqual(state.google_write_log, [])
        self.assertEqual(state.supabase_write_log, [])


if __name__ == "__main__":
    unittest.main()
