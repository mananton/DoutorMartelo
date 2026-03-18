from __future__ import annotations

from collections.abc import Callable
from typing import Any

from backend.app.adapters.google_sheets.base import GoogleSheetsAdapter, WriteBatch
from backend.app.config import Settings


Serializer = Callable[[dict[str, Any]], dict[str, Any]]


class LiveGoogleSheetsAdapter(GoogleSheetsAdapter):
    SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.service = self._build_service()

    def write_batches(self, batches: list[WriteBatch]) -> None:
        for batch in batches:
            if not batch.records:
                continue
            self._upsert_batch(batch)

    def _build_service(self):
        from google.oauth2.service_account import Credentials
        from googleapiclient.discovery import build

        creds = Credentials.from_service_account_info(
            self.settings.load_service_account_info(),
            scopes=self.SCOPES,
        )
        return build("sheets", "v4", credentials=creds, cache_discovery=False)

    def _upsert_batch(self, batch: WriteBatch) -> None:
        cfg = SHEET_WRITE_CONFIG[batch.entity]
        sheet_name = cfg["sheet_name"]
        id_field = cfg["id_field"]
        serializer: Serializer = cfg["serializer"]

        headers = self._read_header(sheet_name)
        current_rows = self._read_rows(sheet_name, headers)
        index_by_id = {
            str(row.get(id_field) or "").strip(): row_num
            for row_num, row in current_rows
            if str(row.get(id_field) or "").strip()
        }

        updates: list[tuple[int, list[Any]]] = []
        appends: list[list[Any]] = []

        for record in batch.records:
            values = serializer(record)
            row_values = [values.get(header, "") for header in headers]
            row_id = str(values.get(id_field) or "").strip()
            if row_id and row_id in index_by_id:
                updates.append((index_by_id[row_id], row_values))
            else:
                appends.append(row_values)

        for row_num, values in updates:
            self.service.spreadsheets().values().update(
                spreadsheetId=self.settings.google_spreadsheet_id,
                range=f"{sheet_name}!A{row_num}",
                valueInputOption="USER_ENTERED",
                body={"values": [values]},
            ).execute()

        if appends:
            self.service.spreadsheets().values().append(
                spreadsheetId=self.settings.google_spreadsheet_id,
                range=f"{sheet_name}!A:A",
                valueInputOption="USER_ENTERED",
                insertDataOption="INSERT_ROWS",
                body={"values": appends},
            ).execute()

    def _read_header(self, sheet_name: str) -> list[str]:
        result = self.service.spreadsheets().values().get(
            spreadsheetId=self.settings.google_spreadsheet_id,
            range=f"{sheet_name}!1:1",
        ).execute()
        rows = result.get("values", [[]])
        return rows[0]

    def _read_rows(self, sheet_name: str, headers: list[str]) -> list[tuple[int, dict[str, Any]]]:
        result = self.service.spreadsheets().values().get(
            spreadsheetId=self.settings.google_spreadsheet_id,
            range=f"{sheet_name}!A2:ZZ",
        ).execute()
        rows = result.get("values", [])
        parsed: list[tuple[int, dict[str, Any]]] = []
        for offset, row in enumerate(rows, start=2):
            data = {headers[i]: row[i] if i < len(row) else "" for i in range(len(headers))}
            parsed.append((offset, data))
        return parsed


def _fatura_serializer(record: dict[str, Any]) -> dict[str, Any]:
    return {
        "ID_Fatura": record["id_fatura"],
        "Fornecedor": record["fornecedor"],
        "NIF": record["nif"],
        "Nº Doc/Fatura": record["nr_documento"],
        "Data Fatura": str(record["data_fatura"]),
        "Valor Total Sem IVA": record["valor_sem_iva"],
        "IVA": record["iva"],
        "Valor Total Com IVA": record["valor_com_iva"],
        "Estado": record.get("estado", ""),
        "Observacoes": record.get("observacoes", ""),
    }


def _fit_serializer(record: dict[str, Any]) -> dict[str, Any]:
    return {
        "ID_Item_Fatura": record["id_item_fatura"],
        "ID_Fatura": record["id_fatura"],
        "Fornecedor": record.get("fornecedor", ""),
        "NIF": record.get("nif", ""),
        "Nº Doc/Fatura": record.get("nr_documento", ""),
        "Data Fatura": str(record.get("data_fatura") or ""),
        "Descricao_Original": record["descricao_original"],
        "ID_Item": record.get("id_item", ""),
        "Item_Oficial": record.get("item_oficial", ""),
        "Unidade": record.get("unidade", ""),
        "Quantidade": record["quantidade"],
        "Custo_Unit": record["custo_unit"],
        "Desconto 1": record.get("desconto_1", 0),
        "Desconto 2": record.get("desconto_2", 0),
        "Custo_Total Sem IVA": record.get("custo_total_sem_iva", 0),
        "IVA": record.get("iva", 0),
        "Custo_Total Com IVA": record.get("custo_total_com_iva", 0),
        "Destino": record["destino"],
        "Obra": record.get("obra", ""),
        "Fase": record.get("fase", ""),
        "Observacoes": record.get("observacoes", ""),
        "Estado_Mapeamento": record.get("estado_mapeamento", ""),
        "Sugestao_Alias": record.get("sugestao_alias", ""),
    }


def _catalog_serializer(record: dict[str, Any]) -> dict[str, Any]:
    return {
        "ID_Item": record["id_item"],
        "Fornecedor": record["fornecedor"],
        "Descricao_Original": record["descricao_original"],
        "Item_Oficial": record["item_oficial"],
        "Natureza": record["natureza"],
        "Unidade": record["unidade"],
        "Observacoes": record.get("observacoes", ""),
        "Estado_Cadastro": record.get("estado_cadastro", ""),
    }


def _afetacao_serializer(record: dict[str, Any]) -> dict[str, Any]:
    return {
        "ID_Afetacao": record["id_afetacao"],
        "Origem": record["origem"],
        "Source_ID": record.get("source_id", ""),
        "Data": str(record["data"]),
        "ID_Item": record["id_item"],
        "Item_Oficial": record.get("item_oficial", ""),
        "Natureza": record.get("natureza", ""),
        "Quantidade": record["quantidade"],
        "Unidade": record.get("unidade", ""),
        "Custo_Unit": record.get("custo_unit", 0),
        "Custo_Total": record.get("custo_total", 0),
        "Custo_Total Sem IVA": record.get("custo_total_sem_iva", 0),
        "IVA": record.get("iva", 0),
        "Custo_Total Com IVA": record.get("custo_total_com_iva", 0),
        "Obra": record["obra"],
        "Fase": record["fase"],
        "Fornecedor": record.get("fornecedor", ""),
        "NIF": record.get("nif", ""),
        "Nº Doc/Fatura": record.get("nr_documento", ""),
        "Processar": record.get("processar", False),
        "Estado": record.get("estado", ""),
        "Observacoes": record.get("observacoes", ""),
    }


def _mov_serializer(record: dict[str, Any]) -> dict[str, Any]:
    return {
        "ID_Mov": record["id_mov"],
        "Data": str(record["data"]),
        "Tipo": record["tipo"],
        "ID_Item": record["id_item"],
        "Item_Oficial": record["item_oficial"],
        "Material": record["item_oficial"],
        "Unidade": record.get("unidade", ""),
        "Quantidade": record["quantidade"],
        "Custo_Unit": record.get("custo_unit", 0),
        "Custo_Total Sem IVA": record.get("custo_total_sem_iva", 0),
        "IVA": record.get("iva", 0),
        "Custo_Total Com IVA": record.get("custo_total_com_iva", 0),
        "Obra": record.get("obra", ""),
        "Fase": record.get("fase", ""),
        "Fornecedor": record.get("fornecedor", ""),
        "NIF": record.get("nif", ""),
        "Nº Doc/Fatura": record.get("nr_documento", ""),
        "Observacoes": record.get("observacoes", ""),
    }


SHEET_WRITE_CONFIG: dict[str, dict[str, Any]] = {
    "faturas": {"sheet_name": "FATURAS", "id_field": "ID_Fatura", "serializer": _fatura_serializer},
    "faturas_itens": {"sheet_name": "FATURAS_ITENS", "id_field": "ID_Item_Fatura", "serializer": _fit_serializer},
    "materiais_cad": {"sheet_name": "MATERIAIS_CAD", "id_field": "ID_Item", "serializer": _catalog_serializer},
    "afetacoes_obra": {"sheet_name": "AFETACOES_OBRA", "id_field": "ID_Afetacao", "serializer": _afetacao_serializer},
    "materiais_mov": {"sheet_name": "MATERIAIS_MOV", "id_field": "ID_Mov", "serializer": _mov_serializer},
}

