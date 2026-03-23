from __future__ import annotations

from datetime import UTC, date, datetime
import unittest

from backend.app.adapters.google_sheets.base import WriteBatch
from backend.app.adapters.google_sheets.memory import MemoryGoogleSheetsAdapter
from backend.app.adapters.supabase.memory import MemorySupabaseAdapter
from backend.app.schemas.materials import CatalogEntryCreate, FaturaCreate, FaturaItemCreate
from backend.app.services.materials import MaterialsService
from backend.app.services.state import RuntimeState


def _ts() -> datetime:
    return datetime(2026, 3, 23, tzinfo=UTC)


class _TrackingGoogleSheetsAdapter(MemoryGoogleSheetsAdapter):
    def __init__(self, state: RuntimeState, snapshot_rows: list[dict[str, object]]) -> None:
        super().__init__(state)
        self.snapshot_rows = snapshot_rows
        self.deleted_records: list[tuple[str, list[str]]] = []

    def load_snapshot(self) -> dict[str, list[dict[str, object]]]:
        return {"stock_atual": list(self.snapshot_rows)}

    def delete_records(self, entity: str, ids: list[str]) -> None:
        self.deleted_records.append((entity, list(ids)))


class _TrackingSupabaseAdapter(MemorySupabaseAdapter):
    def __init__(self, state: RuntimeState) -> None:
        super().__init__(state)
        self.deleted_records: list[tuple[str, list[str]]] = []

    def delete_records(self, entity: str, ids: list[str]) -> None:
        self.deleted_records.append((entity, list(ids)))


class StockAtualRebuildTests(unittest.TestCase):
    def _build_service(self, snapshot_rows: list[dict[str, object]]) -> tuple[MaterialsService, RuntimeState, _TrackingGoogleSheetsAdapter, _TrackingSupabaseAdapter]:
        state = RuntimeState()
        google = _TrackingGoogleSheetsAdapter(state, snapshot_rows)
        supabase = _TrackingSupabaseAdapter(state)
        service = MaterialsService(state, google, supabase)
        return service, state, google, supabase

    def test_rebuild_stock_snapshot_excludes_direct_consumption_only_materials(self) -> None:
        service, state, _, _ = self._build_service([])
        state.catalog = {
            "MAT-000001": {
                "id_item": "MAT-000001",
                "item_oficial": "PREGO_20",
                "natureza": "MATERIAL",
                "unidade": "UN",
                "created_at": _ts(),
                "updated_at": _ts(),
            },
            "MAT-000002": {
                "id_item": "MAT-000002",
                "item_oficial": "BUCHA_8",
                "natureza": "MATERIAL",
                "unidade": "UN",
                "created_at": _ts(),
                "updated_at": _ts(),
            },
            "SER-000001": {
                "id_item": "SER-000001",
                "item_oficial": "SERVICO_TESTE",
                "natureza": "SERVICO",
                "unidade": "UN",
                "created_at": _ts(),
                "updated_at": _ts(),
            },
        }
        state.movimentos = {
            "MOV-000001": {
                "id_mov": "MOV-000001",
                "tipo": "ENTRADA",
                "data": date(2026, 3, 20),
                "id_item": "MAT-000001",
                "item_oficial": "PREGO_20",
                "unidade": "UN",
                "quantidade": 10.0,
                "custo_unit": 2.0,
                "custo_total_sem_iva": 20.0,
                "iva": 23.0,
                "custo_total_com_iva": 24.6,
                "source_type": "FIT",
                "source_id": "FIT-000001",
                "sequence": 1,
                "created_at": _ts(),
                "updated_at": _ts(),
            },
            "MOV-000002": {
                "id_mov": "MOV-000002",
                "tipo": "CONSUMO",
                "data": date(2026, 3, 20),
                "id_item": "MAT-000002",
                "item_oficial": "BUCHA_8",
                "unidade": "UN",
                "quantidade": 3.0,
                "custo_unit": 1.0,
                "custo_total_sem_iva": 3.0,
                "iva": 23.0,
                "custo_total_com_iva": 3.69,
                "obra": "Obra X",
                "fase": "Fase X",
                "source_type": "FIT",
                "source_id": "FIT-000002",
                "sequence": 2,
                "created_at": _ts(),
                "updated_at": _ts(),
            },
            "MOV-000003": {
                "id_mov": "MOV-000003",
                "tipo": "CONSUMO",
                "data": date(2026, 3, 20),
                "id_item": "SER-000001",
                "item_oficial": "SERVICO_TESTE",
                "unidade": "UN",
                "quantidade": 1.0,
                "custo_unit": 50.0,
                "custo_total_sem_iva": 50.0,
                "iva": 23.0,
                "custo_total_com_iva": 61.5,
                "obra": "Obra X",
                "fase": "Fase X",
                "source_type": "FIT",
                "source_id": "FIT-000003",
                "sequence": 3,
                "created_at": _ts(),
                "updated_at": _ts(),
            },
        }
        state.fatura_items = {
            "FIT-000001": {"id_item_fatura": "FIT-000001", "id_item": "MAT-000001", "natureza": "MATERIAL", "destino": "STOCK"},
            "FIT-000002": {"id_item_fatura": "FIT-000002", "id_item": "MAT-000002", "natureza": "MATERIAL", "destino": "CONSUMO"},
            "FIT-000003": {"id_item_fatura": "FIT-000003", "id_item": "SER-000001", "natureza": "SERVICO", "destino": "CONSUMO"},
        }

        report = service.rebuild_stock_atual_snapshot()

        self.assertFalse(report["applied"])
        self.assertEqual(report["rows_selected"], 1)
        self.assertEqual(report["preview"][0]["id_item"], "MAT-000001")
        self.assertEqual(report["preview"][0]["stock_atual"], 10.0)
        self.assertEqual(report["preview"][0]["custo_medio_atual"], 2.0)
        self.assertEqual(report["preview"][0]["valor_stock"], 20.0)

    def test_rebuild_stock_snapshot_applies_rows_and_deletes_stale_ids(self) -> None:
        service, state, google, supabase = self._build_service(
            [
                {"id_item": "MAT-000001", "item_oficial": "PREGO_20", "unidade": "UN", "stock_atual": 8.0, "custo_medio_atual": 2.0},
                {"id_item": "SER-000001", "item_oficial": "SERVICO_TESTE", "unidade": "UN", "stock_atual": 1.0, "custo_medio_atual": 50.0},
            ]
        )
        state.catalog = {
            "MAT-000001": {
                "id_item": "MAT-000001",
                "item_oficial": "PREGO_20",
                "natureza": "MATERIAL",
                "unidade": "UN",
                "created_at": _ts(),
                "updated_at": _ts(),
            },
            "SER-000001": {
                "id_item": "SER-000001",
                "item_oficial": "SERVICO_TESTE",
                "natureza": "SERVICO",
                "unidade": "UN",
                "created_at": _ts(),
                "updated_at": _ts(),
            },
        }
        state.movimentos = {
            "MOV-000001": {
                "id_mov": "MOV-000001",
                "tipo": "ENTRADA",
                "data": date(2026, 3, 20),
                "id_item": "MAT-000001",
                "item_oficial": "PREGO_20",
                "unidade": "UN",
                "quantidade": 10.0,
                "custo_unit": 2.0,
                "custo_total_sem_iva": 20.0,
                "iva": 23.0,
                "custo_total_com_iva": 24.6,
                "source_type": "FIT",
                "source_id": "FIT-000001",
                "sequence": 1,
                "created_at": _ts(),
                "updated_at": _ts(),
            }
        }
        state.fatura_items = {
            "FIT-000001": {"id_item_fatura": "FIT-000001", "id_item": "MAT-000001", "natureza": "MATERIAL", "destino": "STOCK"}
        }

        report = service.rebuild_stock_atual_snapshot(apply=True)

        self.assertTrue(report["applied"])
        self.assertEqual(report["rows_selected"], 1)
        self.assertEqual(report["stale_count"], 1)
        self.assertEqual(report["deleted_count"], 1)
        self.assertEqual(state.google_write_log, [WriteBatch(entity="stock_atual", records=state.google_write_log[0].records)])
        self.assertEqual(state.google_write_log[0].entity, "stock_atual")
        self.assertEqual(len(state.google_write_log[0].records), 1)
        self.assertEqual(state.google_write_log[0].records[0]["stock_atual"], 10.0)
        self.assertEqual(state.google_write_log[0].records[0]["custo_medio_atual"], 2.0)
        self.assertEqual(state.google_write_log[0].records[0]["valor_stock"], 20.0)
        self.assertEqual(google.deleted_records, [("stock_atual", ["SER-000001"])])
        self.assertEqual(supabase.deleted_records, [("stock_atual", ["SER-000001"])])


class StockAtualAutoSyncTests(unittest.TestCase):
    def _build_service(self) -> tuple[MaterialsService, RuntimeState, _TrackingGoogleSheetsAdapter, _TrackingSupabaseAdapter]:
        state = RuntimeState()
        google = _TrackingGoogleSheetsAdapter(state, [])
        supabase = _TrackingSupabaseAdapter(state)
        service = MaterialsService(state, google, supabase)
        return service, state, google, supabase

    def test_create_stock_invoice_item_auto_syncs_stock_atual(self) -> None:
        service, state, _, _ = self._build_service()
        catalog = service.create_catalog_entry(
            CatalogEntryCreate(
                descricao_original="Prego 30",
                item_oficial="PREGO_30",
                natureza="MATERIAL",
                unidade="UN",
            )
        )
        fatura = service.create_fatura(
            FaturaCreate(
                fornecedor="Fornecedor Base",
                nif="501234567",
                nr_documento="FT 2026/100",
                data_fatura=date(2026, 3, 23),
                valor_sem_iva=10,
                iva=23,
                valor_com_iva=12.3,
            )
        )

        service.create_fatura_items(
            fatura.id_fatura,
            [
                FaturaItemCreate(
                    descricao_original="Prego 30",
                    quantidade=100,
                    custo_unit=0.1,
                    iva=23,
                    destino="STOCK",
                    id_item=catalog.id_item,
                )
            ],
        )

        stock_batches = [batch for batch in state.google_write_log if batch.entity == "stock_atual"]
        self.assertEqual(len(stock_batches), 1)
        self.assertEqual(stock_batches[0].records[0]["id_item"], catalog.id_item)
        self.assertEqual(stock_batches[0].records[0]["stock_atual"], 100.0)
        self.assertEqual(stock_batches[0].records[0]["custo_medio_atual"], 0.1)
        self.assertEqual(stock_batches[0].records[0]["valor_stock"], 10.0)

    def test_delete_stock_invoice_item_auto_deletes_stock_atual(self) -> None:
        service, state, google, supabase = self._build_service()
        catalog = service.create_catalog_entry(
            CatalogEntryCreate(
                descricao_original="Bucha 8",
                item_oficial="BUCHA_8",
                natureza="MATERIAL",
                unidade="UN",
            )
        )
        fatura = service.create_fatura(
            FaturaCreate(
                fornecedor="Fornecedor Base",
                nif="501234567",
                nr_documento="FT 2026/101",
                data_fatura=date(2026, 3, 23),
                valor_sem_iva=10,
                iva=23,
                valor_com_iva=12.3,
            )
        )
        created = service.create_fatura_items(
            fatura.id_fatura,
            [
                FaturaItemCreate(
                    descricao_original="Bucha 8",
                    quantidade=25,
                    custo_unit=0.2,
                    iva=23,
                    destino="STOCK",
                    id_item=catalog.id_item,
                )
            ],
        )
        state.google_write_log.clear()
        state.supabase_write_log.clear()

        service.delete_fatura_item(fatura.id_fatura, created.items[0].id_item_fatura)

        self.assertIn(("stock_atual", [catalog.id_item]), google.deleted_records)
        self.assertIn(("stock_atual", [catalog.id_item]), supabase.deleted_records)
        self.assertEqual(service.list_stock_snapshots(), [])

    def test_direct_consumption_does_not_auto_sync_stock_atual(self) -> None:
        service, state, _, _ = self._build_service()
        catalog = service.create_catalog_entry(
            CatalogEntryCreate(
                descricao_original="Servico de apoio",
                item_oficial="SERVICO_APOIO",
                natureza="SERVICO",
                unidade="UN",
            )
        )
        fatura = service.create_fatura(
            FaturaCreate(
                fornecedor="Fornecedor Base",
                nif="501234567",
                nr_documento="FT 2026/102",
                data_fatura=date(2026, 3, 23),
                valor_sem_iva=10,
                iva=23,
                valor_com_iva=12.3,
            )
        )
        state.google_write_log.clear()

        service.create_fatura_items(
            fatura.id_fatura,
            [
                FaturaItemCreate(
                    descricao_original="Servico de apoio",
                    quantidade=1,
                    custo_unit=10,
                    iva=23,
                    destino="CONSUMO",
                    obra="Obra A",
                    fase="Execucao",
                    id_item=catalog.id_item,
                )
            ],
        )

        stock_batches = [batch for batch in state.google_write_log if batch.entity == "stock_atual"]
        self.assertEqual(stock_batches, [])


if __name__ == "__main__":
    unittest.main()
