from __future__ import annotations

import unittest

from backend.app.adapters.google_sheets.base import WriteBatch
from backend.app.adapters.google_sheets.live import LiveGoogleSheetsAdapter


class _FakeRequest:
    def __init__(self, response: dict[str, object]) -> None:
        self._response = response

    def execute(self) -> dict[str, object]:
        return self._response


class _FakeValuesApi:
    def __init__(self, responses: dict[tuple[str, str], dict[str, object]]) -> None:
        self.responses = responses
        self.get_calls: list[str] = []
        self.update_calls: list[dict[str, object]] = []
        self.append_calls: list[dict[str, object]] = []

    def get(self, *, spreadsheetId: str, range: str) -> _FakeRequest:
        self.get_calls.append(range)
        return _FakeRequest(self.responses.get(("get", range), {"values": []}))

    def update(self, *, spreadsheetId: str, range: str, valueInputOption: str, body: dict[str, object]) -> _FakeRequest:
        self.update_calls.append({"range": range, "body": body})
        return _FakeRequest({"updatedRange": range})

    def append(
        self,
        *,
        spreadsheetId: str,
        range: str,
        valueInputOption: str,
        insertDataOption: str,
        body: dict[str, object],
    ) -> _FakeRequest:
        self.append_calls.append({"range": range, "body": body})
        return _FakeRequest(self.responses.get(("append", range), {"updates": {"updatedRange": f"{range}2"}}))


class _FakeSpreadsheetsApi:
    def __init__(self, values_api: _FakeValuesApi) -> None:
        self._values_api = values_api

    def values(self) -> _FakeValuesApi:
        return self._values_api


class _FakeService:
    def __init__(self, values_api: _FakeValuesApi) -> None:
        self._spreadsheets_api = _FakeSpreadsheetsApi(values_api)

    def spreadsheets(self) -> _FakeSpreadsheetsApi:
        return self._spreadsheets_api


class _FakeSettings:
    google_spreadsheet_id = "sheet-id"


class LiveGoogleSheetsAdapterTests(unittest.TestCase):
    def _build_adapter(self, responses: dict[tuple[str, str], dict[str, object]]) -> tuple[LiveGoogleSheetsAdapter, _FakeValuesApi]:
        values_api = _FakeValuesApi(responses)
        adapter = LiveGoogleSheetsAdapter.__new__(LiveGoogleSheetsAdapter)
        adapter.settings = _FakeSettings()
        adapter.service = _FakeService(values_api)
        adapter._header_cache = {}
        return adapter, values_api

    def test_upsert_uses_sheet_row_num_without_reading_full_sheet(self) -> None:
        adapter, values_api = self._build_adapter(
            {
                ("get", "FATURAS_ITENS!1:1"): {
                    "values": [[
                        "ID_Item_Fatura",
                        "ID_Fatura",
                        "Descricao_Original",
                        "Quantidade",
                        "Custo_Unit",
                        "Destino",
                    ]]
                }
            }
        )
        record = {
            "id_item_fatura": "FIT-000001",
            "id_fatura": "FAT-000001",
            "descricao_original": "Item teste",
            "quantidade": 1,
            "custo_unit": 10,
            "destino": "STOCK",
            "sheet_row_num": 15,
        }

        adapter.write_batches([WriteBatch(entity="faturas_itens", records=[record])])

        self.assertEqual(values_api.get_calls, ["FATURAS_ITENS!1:1"])
        self.assertEqual(len(values_api.update_calls), 1)
        self.assertEqual(values_api.update_calls[0]["range"], "FATURAS_ITENS!A15")
        self.assertEqual(record["sheet_row_num"], 15)

    def test_append_assigns_sheet_row_num_and_reuses_cached_header(self) -> None:
        adapter, values_api = self._build_adapter(
            {
                ("get", "FATURAS_ITENS!1:1"): {
                    "values": [[
                        "ID_Item_Fatura",
                        "ID_Fatura",
                        "Descricao_Original",
                        "Quantidade",
                        "Custo_Unit",
                        "Destino",
                    ]]
                },
                ("get", "FATURAS_ITENS!A2:ZZ"): {"values": []},
                ("append", "FATURAS_ITENS!A:A"): {
                    "updates": {"updatedRange": "FATURAS_ITENS!A10:F11"}
                },
            }
        )
        first = {
            "id_item_fatura": "FIT-000010",
            "id_fatura": "FAT-000001",
            "descricao_original": "Primeiro",
            "quantidade": 1,
            "custo_unit": 10,
            "destino": "STOCK",
        }
        second = {
            "id_item_fatura": "FIT-000011",
            "id_fatura": "FAT-000001",
            "descricao_original": "Segundo",
            "quantidade": 2,
            "custo_unit": 20,
            "destino": "CONSUMO",
        }

        adapter.write_batches([WriteBatch(entity="faturas_itens", records=[first, second])])

        self.assertEqual(first["sheet_row_num"], 10)
        self.assertEqual(second["sheet_row_num"], 11)
        self.assertEqual(
            values_api.get_calls,
            ["FATURAS_ITENS!1:1", "FATURAS_ITENS!A2:ZZ"],
        )

        adapter.write_batches([WriteBatch(entity="faturas_itens", records=[first])])

        self.assertEqual(
            values_api.get_calls,
            ["FATURAS_ITENS!1:1", "FATURAS_ITENS!A2:ZZ"],
        )
        self.assertEqual(values_api.update_calls[-1]["range"], "FATURAS_ITENS!A10")


if __name__ == "__main__":
    unittest.main()
