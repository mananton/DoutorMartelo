from __future__ import annotations

import unittest

from backend.app.adapters.google_sheets.live import (
    _enrich_snapshot,
    _parse_afetacao,
    _parse_catalog,
    _parse_catalog_reference,
    _parse_fatura,
    _parse_fit,
    _parse_mov,
)
from backend.app.api.deps import ServiceContainer
from backend.app.schemas.materials import AfetacaoRecord, CatalogEntryRecord, CatalogReferenceRecord, FaturaItemRecord, FaturaRecord, MovimentoRecord
from backend.app.services.state import RuntimeState


class _FailingSheetsAdapter:
    def load_snapshot(self) -> dict[str, list[dict[str, object]]]:
        raise RuntimeError("boom")


class StartupHydrationTests(unittest.TestCase):
    def test_hydration_logs_exception_and_keeps_empty_state(self) -> None:
        container = object.__new__(ServiceContainer)
        container.state = RuntimeState()
        container.google_sheets = _FailingSheetsAdapter()

        with self.assertLogs("backend.app.api.deps", level="ERROR") as captured:
            container._hydrate_runtime_state()

        self.assertTrue(any("Failed to hydrate runtime state from Google Sheets at startup" in line for line in captured.output))
        self.assertEqual(container.state.faturas, {})
        self.assertEqual(container.state.fatura_items, {})


class SheetParserContractTests(unittest.TestCase):
    def test_parse_fatura_supports_sheet_valor_header_currency_and_yyyy_slash_mm_slash_dd_dates(self) -> None:
        parsed = _parse_fatura(
            {
                "ID_Fatura": "FAT-000777",
                "Fornecedor": "Fornecedor Teste",
                "NIF": "501234567",
                "Nº Doc/Fatura": "FT 2026/777",
                "Data Fatura": "2026/02/19",
                "Valor": "2\xa0805,99 €",
                "Observacoes": "",
            },
            2,
        )

        self.assertIsNotNone(parsed)
        assert parsed is not None
        self.assertEqual(str(parsed["data_fatura"]), "2026-02-19")
        self.assertAlmostEqual(parsed["valor_sem_iva"], 2805.99)
        self.assertAlmostEqual(parsed["valor_com_iva"], 2805.99)

    def test_parse_fatura_prefers_explicit_valor_total_sem_iva_when_present(self) -> None:
        parsed = _parse_fatura(
            {
                "ID_Fatura": "FAT-000778",
                "Fornecedor": "Fornecedor Teste",
                "NIF": "501234567",
                "Nº Doc/Fatura": "FT 2026/778",
                "Data Fatura": "2026/02/19",
                "Valor Total Sem IVA": "2 281,29",
                "Valor": "2 805,99",
            },
            3,
        )

        self.assertIsNotNone(parsed)
        assert parsed is not None
        self.assertAlmostEqual(parsed["valor_sem_iva"], 2281.29)
        self.assertAlmostEqual(parsed["valor_com_iva"], 2805.99)

    def test_parse_fatura_keeps_fornecedor_required_by_api_model(self) -> None:
        parsed = _parse_fatura(
            {
                "ID_Fatura": "FAT-000001",
                "ID_Compromisso": "COMP-000001",
                "Fornecedor": "Fornecedor Teste",
                "NIF": "501234567",
                "Nº Doc/Fatura": "FT 2026/001",
                "Data Fatura": "2026-03-19",
                "Valor Total Sem IVA": 100,
                "IVA": 23,
                "Valor Total Com IVA": 123,
                "Paga?": "TRUE",
                "Data Pagamento": "2026-03-20",
                "Estado": "ATIVA",
            },
            2,
        )

        self.assertIsNotNone(parsed)
        assert parsed is not None
        self.assertEqual(parsed["fornecedor"], "Fornecedor Teste")
        validated = FaturaRecord.model_validate(
            {key: value for key, value in parsed.items() if key in FaturaRecord.model_fields}
        )
        self.assertEqual(validated.id_compromisso, "COMP-000001")
        self.assertEqual(validated.fornecedor, "Fornecedor Teste")
        self.assertTrue(validated.paga)
        self.assertEqual(str(validated.data_pagamento), "2026-03-20")

    def test_parse_fit_keeps_descricao_original_required_by_api_model(self) -> None:
        parsed = _parse_fit(
            {
                "ID_Item_Fatura": "FIT-000001",
                "ID_Fatura": "FAT-000001",
                "Fornecedor": "Fornecedor Teste",
                "Descricao_Original": "Prego vinte",
                "Uso_Combustivel": "VIATURA",
                "Matricula": "11-AA-22",
                "Quantidade": 10,
                "Custo_Unit": 1.5,
                "Destino": "STOCK",
            },
            2,
        )

        self.assertIsNotNone(parsed)
        assert parsed is not None
        self.assertEqual(parsed["descricao_original"], "Prego vinte")
        validated = FaturaItemRecord.model_validate(
            {key: value for key, value in parsed.items() if key in FaturaItemRecord.model_fields}
        )
        self.assertEqual(validated.descricao_original, "Prego vinte")
        self.assertEqual(validated.uso_combustivel, "VIATURA")
        self.assertEqual(validated.matricula, "11-AA-22")

    def test_parse_fit_accepts_percentage_cells_written_by_google_sheets(self) -> None:
        parsed = _parse_fit(
            {
                "ID_Item_Fatura": "FIT-000099",
                "ID_Fatura": "FAT-000099",
                "Descricao_Original": "Gasoleo simples",
                "Quantidade": "30,88",
                "Custo_Unit": "1,619",
                "IVA": "2300%",
                "Custo_Total Sem IVA": "49,99",
                "Custo_Total Com IVA": "61,49",
                "Destino": "VIATURA",
            },
            9,
        )

        self.assertIsNotNone(parsed)
        assert parsed is not None
        self.assertAlmostEqual(parsed["iva"], 23.0)

    def test_enrich_snapshot_backfills_catalog_fields_missing_from_faturas_itens_sheet(self) -> None:
        snapshot = _enrich_snapshot(
            {
                "materiais_cad": [
                    {
                        "id_item": "MAT-000001",
                        "item_oficial": "GASOLEO",
                        "natureza": "GASOLEO",
                        "unidade": "Lt",
                    }
                ],
                "faturas_itens": [
                    {
                        "id_item_fatura": "FIT-000001",
                        "id_item": "MAT-000001",
                        "descricao_original": "Gasoleo",
                        "natureza": None,
                        "unidade": None,
                        "item_oficial": "",
                    }
                ],
                "afetacoes_obra": [],
                "materiais_mov": [],
            }
        )

        fit = snapshot["faturas_itens"][0]
        self.assertEqual(fit["item_oficial"], "GASOLEO")
        self.assertEqual(fit["natureza"], "GASOLEO")
        self.assertEqual(fit["unidade"], "Lt")

    def test_parse_catalog_keeps_id_item_required_by_api_model(self) -> None:
        parsed = _parse_catalog(
            {
                "ID_Item": "MAT-000001",
                "Item_Oficial": "GASOLEO_RODOVIARIO",
                "Natureza": "GASOLEO",
                "Unidade": "Lt",
                "Estado_Cadastro": "ATIVO",
            },
            2,
        )

        self.assertIsNotNone(parsed)
        assert parsed is not None
        self.assertEqual(parsed["id_item"], "MAT-000001")
        validated = CatalogEntryRecord.model_validate(
            {key: value for key, value in parsed.items() if key in CatalogEntryRecord.model_fields}
        )
        self.assertEqual(validated.id_item, "MAT-000001")
        self.assertEqual(validated.natureza, "GASOLEO")
        self.assertEqual(validated.unidade, "Lt")

    def test_parse_fit_keeps_id_fatura_required_by_api_model(self) -> None:
        parsed = _parse_fit(
            {
                "ID_Item_Fatura": "FIT-000002",
                "ID_Fatura": "FAT-000123",
                "Descricao_Original": "Prego trinta",
                "Quantidade": 5,
                "Custo_Unit": 2.0,
                "Destino": "STOCK",
            },
            3,
        )

        self.assertIsNotNone(parsed)
        assert parsed is not None
        self.assertEqual(parsed["id_fatura"], "FAT-000123")
        validated = FaturaItemRecord.model_validate(
            {key: value for key, value in parsed.items() if key in FaturaItemRecord.model_fields}
        )
        self.assertEqual(validated.id_fatura, "FAT-000123")

    def test_parse_catalog_reference_keeps_descricao_original_required_by_api_model(self) -> None:
        parsed = _parse_catalog_reference(
            {
                "ID_Referencia": "REF-000001",
                "Descricao_Original": "prego vinte",
                "ID_Item": "MAT-000001",
                "Estado_Referencia": "ATIVA",
            },
            4,
        )

        self.assertIsNotNone(parsed)
        assert parsed is not None
        self.assertEqual(parsed["descricao_original"], "prego vinte")
        validated = CatalogReferenceRecord.model_validate(
            {key: value for key, value in parsed.items() if key in CatalogReferenceRecord.model_fields}
        )
        self.assertEqual(validated.descricao_original, "prego vinte")

    def test_parse_catalog_reference_keeps_id_item_required_by_api_model(self) -> None:
        parsed = _parse_catalog_reference(
            {
                "ID_Referencia": "REF-000002",
                "Descricao_Original": "prego trinta",
                "ID_Item": "MAT-000002",
                "Estado_Referencia": "ATIVA",
            },
            5,
        )

        self.assertIsNotNone(parsed)
        assert parsed is not None
        self.assertEqual(parsed["id_item"], "MAT-000002")
        validated = CatalogReferenceRecord.model_validate(
            {key: value for key, value in parsed.items() if key in CatalogReferenceRecord.model_fields}
        )
        self.assertEqual(validated.id_item, "MAT-000002")

    def test_parse_afetacao_keeps_uso_combustivel_for_fuel_stock_consumption(self) -> None:
        parsed = _parse_afetacao(
            {
                "ID_Afetacao": "AFO-000001",
                "Origem": "STOCK",
                "Data": "2026-03-20",
                "ID_Item": "MAT-000001",
                "Item_Oficial": "GASOLEO_RODOVIARIO",
                "Natureza": "GASOLEO",
                "Uso_Combustivel": "GERADOR",
                "Quantidade": 10,
                "Unidade": "Lt",
                "Obra": "Obra A",
                "Fase": "Fase A",
            },
            6,
        )

        self.assertIsNotNone(parsed)
        assert parsed is not None
        validated = AfetacaoRecord.model_validate(
            {key: value for key, value in parsed.items() if key in AfetacaoRecord.model_fields}
        )
        self.assertEqual(validated.uso_combustivel, "GERADOR")

    def test_parse_mov_keeps_vehicle_assignment_fields(self) -> None:
        parsed = _parse_mov(
            {
                "ID_Mov": "MOV-000001",
                "Tipo": "CONSUMO",
                "Data": "2026-03-20",
                "ID_Item": "MAT-000001",
                "Item_Oficial": "GASOLEO_RODOVIARIO",
                "Uso_Combustivel": "VIATURA",
                "Matricula": "11-AA-22",
                "Quantidade": 45,
                "Unidade": "Lt",
                "Observacoes": "[SRC_FIT:FIT-000001]",
            },
            7,
        )

        self.assertIsNotNone(parsed)
        assert parsed is not None
        validated = MovimentoRecord.model_validate(
            {key: value for key, value in parsed.items() if key in MovimentoRecord.model_fields}
        )
        self.assertEqual(validated.uso_combustivel, "VIATURA")
        self.assertEqual(validated.matricula, "11-AA-22")
