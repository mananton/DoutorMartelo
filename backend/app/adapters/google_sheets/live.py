from __future__ import annotations

from collections.abc import Callable
from datetime import UTC, date, datetime
import re
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

    def load_snapshot(self) -> dict[str, list[dict[str, Any]]]:
        snapshot: dict[str, list[dict[str, Any]]] = {}
        for entity, config in SHEET_READ_CONFIG.items():
            headers = self._read_header(config["sheet_name"])
            rows = self._read_rows(config["sheet_name"], headers)
            parser: RowParser = config["parser"]
            parsed = []
            for row_num, row in rows:
                record = parser(row, row_num)
                if record:
                    parsed.append(record)
            snapshot[entity] = parsed
        return snapshot

    def load_work_options(self) -> list[dict[str, Any]]:
        obras_headers = self._read_header_at_row("OBRAS", 3)
        obras_rows = self._read_rows("OBRAS", obras_headers, start_row=4)

        active_obras: dict[str, dict[str, Any]] = {}
        for _, row in obras_rows:
            obra = _read_text(row, ["Local_ID", "Local"])
            if not obra:
                continue
            active_obras[obra] = {
                "obra": obra,
                "ativa": True,
                "fases": set(),
            }

        global_fases = self._load_global_work_phases()
        if global_fases:
            for payload in active_obras.values():
                payload["fases"].update(global_fases)
        else:
            phase_sources = [
                ("OBRAS_DIMENSOES", 1),
                ("MEDICOES_FASE", 1),
                ("REGISTOS_POR_DIA", 1),
                ("LEGACY_MAO_OBRA", 1),
                ("FATURAS_ITENS", 1),
                ("AFETACOES_OBRA", 1),
                ("MATERIAIS_MOV", 1),
            ]

            for sheet_name, header_row in phase_sources:
                try:
                    headers = self._read_header_at_row(sheet_name, header_row)
                    rows = self._read_rows(sheet_name, headers, start_row=header_row + 1)
                except Exception:
                    continue
                for _, row in rows:
                    obra = _read_text(row, ["Obra", "Local_ID", "Local", "Obra_ID"])
                    fase = _read_text(row, ["Fase de Obra", "Fase"])
                    if not obra or not fase:
                        continue
                    active_obras.setdefault(obra, {"obra": obra, "ativa": False, "fases": set()})
                    active_obras[obra]["fases"].add(fase)

        return [
            {
                "obra": obra,
                "ativa": bool(payload["ativa"]),
                "fases": sorted(payload["fases"]),
            }
            for obra, payload in sorted(
                active_obras.items(),
                key=lambda item: (not bool(item[1]["ativa"]), str(item[0]).lower()),
            )
        ]

    def _load_global_work_phases(self) -> set[str]:
        for header_row, start_row in ((1, 2), (2, 3)):
            try:
                headers = self._read_header_at_row("FASES_DE_OBRA", header_row)
                rows = self._read_rows("FASES_DE_OBRA", headers, start_row=start_row)
            except Exception:
                continue
            phases = {
                fase
                for _, row in rows
                for fase in [_read_text(row, ["Fases de obra", "Fases de Obra", "Descricao", "Descrição"])]
                if fase
            }
            if phases:
                return phases
        return set()

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
        return self._read_header_at_row(sheet_name, 1)

    def _read_header_at_row(self, sheet_name: str, row_num: int) -> list[str]:
        result = self.service.spreadsheets().values().get(
            spreadsheetId=self.settings.google_spreadsheet_id,
            range=f"{sheet_name}!{row_num}:{row_num}",
        ).execute()
        rows = result.get("values", [[]])
        return rows[0]

    def _read_rows(self, sheet_name: str, headers: list[str], *, start_row: int = 2) -> list[tuple[int, dict[str, Any]]]:
        result = self.service.spreadsheets().values().get(
            spreadsheetId=self.settings.google_spreadsheet_id,
            range=f"{sheet_name}!A{start_row}:ZZ",
        ).execute()
        rows = result.get("values", [])
        parsed: list[tuple[int, dict[str, Any]]] = []
        for offset, row in enumerate(rows, start=start_row):
            data = {headers[i]: row[i] if i < len(row) else "" for i in range(len(headers))}
            parsed.append((offset, data))
        return parsed


RowParser = Callable[[dict[str, Any], int], dict[str, Any] | None]


def _normalize_key(value: str) -> str:
    normalized = (value or "").strip().lower()
    normalized = normalized.replace("º", "o").replace("°", "o")
    normalized = normalized.replace("âº", "o").replace("â", "")
    normalized = normalized.replace("/", "").replace("_", "").replace("-", "").replace(" ", "")
    return normalized


def _pick_value(row: dict[str, Any], aliases: list[str]) -> Any:
    alias_keys = {_normalize_key(alias) for alias in aliases}
    for key, value in row.items():
        if _normalize_key(key) in alias_keys:
            return value
    return None


def _read_text(row: dict[str, Any], aliases: list[str]) -> str | None:
    value = _pick_value(row, aliases)
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _read_float(row: dict[str, Any], aliases: list[str]) -> float | None:
    value = _pick_value(row, aliases)
    if value in (None, ""):
        return None
    text = str(value).strip().replace(".", "").replace(",", ".") if isinstance(value, str) and "," in str(value) and "." in str(value) else str(value).strip().replace(",", ".")
    try:
        return float(text)
    except ValueError:
        return None


def _read_bool(row: dict[str, Any], aliases: list[str]) -> bool:
    value = _pick_value(row, aliases)
    text = str(value or "").strip().lower()
    return text in {"true", "1", "yes", "sim", "x", "verdadeiro"}


def _read_date(row: dict[str, Any], aliases: list[str]) -> date | None:
    value = _pick_value(row, aliases)
    if value in (None, ""):
        return None
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    text = str(value).strip()
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y"):
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            continue
    return None


def _read_timestamp(row_num: int) -> datetime:
    return datetime.now(UTC)


def _extract_source_marker(observacoes: str | None, marker: str) -> str | None:
    if not observacoes:
        return None
    match = re.search(rf"\[{marker}:([^\]]+)\]", observacoes)
    return match.group(1) if match else None


def _parse_fatura(row: dict[str, Any], row_num: int) -> dict[str, Any] | None:
    id_fatura = _read_text(row, ["ID_Fatura", "ID Fatura"])
    if not id_fatura:
        return None
    now = _read_timestamp(row_num)
    return {
        "id_fatura": id_fatura,
        "fornecedor": _read_text(row, ["Fornecedor"]) or "",
        "nif": _read_text(row, ["NIF"]) or "",
        "nr_documento": _read_text(row, ["Nº Doc/Fatura", "NÂº Doc/Fatura", "Numero Doc/Fatura"]) or "",
        "data_fatura": _read_date(row, ["Data Fatura", "Data"]) or date.today(),
        "valor_sem_iva": _read_float(row, ["Valor Total Sem IVA", "Custo_Total Sem IVA"]) or 0.0,
        "iva": _read_float(row, ["IVA"]) or 0.0,
        "valor_com_iva": _read_float(row, ["Valor Total Com IVA", "Custo_Total Com IVA"]) or 0.0,
        "observacoes": _read_text(row, ["Observacoes", "Observações"]),
        "estado": _read_text(row, ["Estado"]) or "ATIVA",
        "sheet_row_num": row_num,
        "created_at": now,
        "updated_at": now,
    }


def _parse_fit(row: dict[str, Any], row_num: int) -> dict[str, Any] | None:
    item_id = _read_text(row, ["ID_Item_Fatura", "ID Item Fatura"])
    if not item_id:
        return None
    now = _read_timestamp(row_num)
    return {
        "id_item_fatura": item_id,
        "id_fatura": _read_text(row, ["ID_Fatura", "ID Fatura"]) or "",
        "fornecedor": _read_text(row, ["Fornecedor"]),
        "nif": _read_text(row, ["NIF"]),
        "nr_documento": _read_text(row, ["Nº Doc/Fatura", "NÂº Doc/Fatura", "Numero Doc/Fatura"]),
        "data_fatura": _read_date(row, ["Data Fatura", "Data"]),
        "descricao_original": _read_text(row, ["Descricao_Original", "Descrição_Original", "Descricao Original"]) or "",
        "id_item": _read_text(row, ["ID_Item", "ID Item"]),
        "item_oficial": _read_text(row, ["Item_Oficial", "Item Oficial"]),
        "unidade": _read_text(row, ["Unidade"]),
        "natureza": _read_text(row, ["Natureza"]),
        "quantidade": _read_float(row, ["Quantidade"]) or 0.0,
        "custo_unit": _read_float(row, ["Custo_Unit", "Custo Unit"]) or 0.0,
        "desconto_1": _read_float(row, ["Desconto 1", "Desconto_1"]) or 0.0,
        "desconto_2": _read_float(row, ["Desconto 2", "Desconto_2"]) or 0.0,
        "custo_total_sem_iva": _read_float(row, ["Custo_Total Sem IVA", "Valor Total Sem IVA"]) or 0.0,
        "iva": _read_float(row, ["IVA"]) or 0.0,
        "custo_total_com_iva": _read_float(row, ["Custo_Total Com IVA", "Valor Total Com IVA"]) or 0.0,
        "destino": _read_text(row, ["Destino"]) or "CONSUMO",
        "obra": _read_text(row, ["Obra"]),
        "fase": _read_text(row, ["Fase"]),
        "observacoes": _read_text(row, ["Observacoes", "Observações"]),
        "estado_mapeamento": _read_text(row, ["Estado_Mapeamento", "Estado Mapeamento"]) or "GUARDADO",
        "sugestao_alias": _read_text(row, ["Sugestao_Alias", "Sugestao Alias"]),
        "sheet_row_num": row_num,
        "created_at": now,
        "updated_at": now,
    }


def _parse_catalog(row: dict[str, Any], row_num: int) -> dict[str, Any] | None:
    id_item = _read_text(row, ["ID_Item", "ID Item"])
    if not id_item:
        return None
    now = _read_timestamp(row_num)
    return {
        "id_item": id_item,
        "fornecedor": _read_text(row, ["Fornecedor"]) or "",
        "descricao_original": _read_text(row, ["Descricao_Original", "Descrição_Original", "Descricao Original"]) or "",
        "item_oficial": _read_text(row, ["Item_Oficial", "Item Oficial"]) or "",
        "natureza": _read_text(row, ["Natureza"]) or "MATERIAL",
        "unidade": _read_text(row, ["Unidade"]) or "",
        "observacoes": _read_text(row, ["Observacoes", "Observações"]),
        "estado_cadastro": _read_text(row, ["Estado_Cadastro", "Estado Cadastro"]) or "ATIVO",
        "sheet_row_num": row_num,
        "created_at": now,
        "updated_at": now,
    }


def _parse_afetacao(row: dict[str, Any], row_num: int) -> dict[str, Any] | None:
    id_afetacao = _read_text(row, ["ID_Afetacao", "ID Afetacao"])
    if not id_afetacao:
        return None
    now = _read_timestamp(row_num)
    return {
        "id_afetacao": id_afetacao,
        "origem": _read_text(row, ["Origem"]) or "STOCK",
        "source_id": _read_text(row, ["Source_ID", "Source ID"]),
        "data": _read_date(row, ["Data"]) or date.today(),
        "id_item": _read_text(row, ["ID_Item", "ID Item"]) or "",
        "item_oficial": _read_text(row, ["Item_Oficial", "Item Oficial"]),
        "natureza": _read_text(row, ["Natureza"]),
        "quantidade": _read_float(row, ["Quantidade"]) or 0.0,
        "unidade": _read_text(row, ["Unidade"]),
        "custo_unit": _read_float(row, ["Custo_Unit", "Custo Unit"]) or 0.0,
        "custo_total": _read_float(row, ["Custo_Total", "Custo Total"]) or 0.0,
        "custo_total_sem_iva": _read_float(row, ["Custo_Total Sem IVA", "Custo Total Sem IVA"]) or 0.0,
        "iva": _read_float(row, ["IVA"]) or 0.0,
        "custo_total_com_iva": _read_float(row, ["Custo_Total Com IVA", "Custo Total Com IVA"]) or 0.0,
        "obra": _read_text(row, ["Obra"]) or "",
        "fase": _read_text(row, ["Fase"]) or "",
        "fornecedor": _read_text(row, ["Fornecedor"]),
        "nif": _read_text(row, ["NIF"]),
        "nr_documento": _read_text(row, ["Nº Doc/Fatura", "NÂº Doc/Fatura", "Numero Doc/Fatura"]),
        "processar": _read_bool(row, ["Processar"]),
        "estado": _read_text(row, ["Estado"]) or "RASCUNHO",
        "observacoes": _read_text(row, ["Observacoes", "Observações"]),
        "sheet_row_num": row_num,
        "created_at": now,
        "updated_at": now,
    }


def _parse_mov(row: dict[str, Any], row_num: int) -> dict[str, Any] | None:
    id_mov = _read_text(row, ["ID_Mov", "ID Mov"])
    if not id_mov:
        return None
    observacoes = _read_text(row, ["Observacoes", "Observações"])
    now = _read_timestamp(row_num)
    source_afo = _extract_source_marker(observacoes, "SRC_AFO")
    source_fit = _extract_source_marker(observacoes, "SRC_FIT")
    source_type = "AFO" if source_afo else "FIT"
    source_id = source_afo or source_fit or id_mov
    return {
        "id_mov": id_mov,
        "tipo": _read_text(row, ["Tipo"]) or "CONSUMO",
        "data": _read_date(row, ["Data"]) or date.today(),
        "id_item": _read_text(row, ["ID_Item", "ID Item"]) or "",
        "item_oficial": _read_text(row, ["Item_Oficial", "Item Oficial", "Material"]) or "",
        "unidade": _read_text(row, ["Unidade"]),
        "quantidade": _read_float(row, ["Quantidade"]) or 0.0,
        "custo_unit": _read_float(row, ["Custo_Unit", "Custo Unit"]) or 0.0,
        "custo_total_sem_iva": _read_float(row, ["Custo_Total Sem IVA", "Custo Total Sem IVA"]) or 0.0,
        "iva": _read_float(row, ["IVA"]) or 0.0,
        "custo_total_com_iva": _read_float(row, ["Custo_Total Com IVA", "Custo Total Com IVA"]) or 0.0,
        "obra": _read_text(row, ["Obra"]),
        "fase": _read_text(row, ["Fase"]),
        "fornecedor": _read_text(row, ["Fornecedor"]),
        "nif": _read_text(row, ["NIF"]),
        "nr_documento": _read_text(row, ["Nº Doc/Fatura", "NÂº Doc/Fatura", "Numero Doc/Fatura"]),
        "observacoes": observacoes,
        "source_type": source_type,
        "source_id": source_id,
        "sequence": row_num - 1,
        "sheet_row_num": row_num,
        "created_at": now,
        "updated_at": now,
    }


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
        "Natureza": record.get("natureza", ""),
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

SHEET_READ_CONFIG: dict[str, dict[str, Any]] = {
    "faturas": {"sheet_name": "FATURAS", "parser": _parse_fatura},
    "faturas_itens": {"sheet_name": "FATURAS_ITENS", "parser": _parse_fit},
    "materiais_cad": {"sheet_name": "MATERIAIS_CAD", "parser": _parse_catalog},
    "afetacoes_obra": {"sheet_name": "AFETACOES_OBRA", "parser": _parse_afetacao},
    "materiais_mov": {"sheet_name": "MATERIAIS_MOV", "parser": _parse_mov},
}
