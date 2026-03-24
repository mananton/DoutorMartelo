from __future__ import annotations

from collections.abc import Callable
from datetime import UTC, date, datetime
from http.client import IncompleteRead
import logging
from time import perf_counter
import re
import unicodedata
from typing import Any

from backend.app.adapters.google_sheets.base import GoogleSheetsAdapter, WriteBatch
from backend.app.config import Settings


Serializer = Callable[[dict[str, Any]], dict[str, Any]]
logger = logging.getLogger("uvicorn.error")
OPTIONAL_SNAPSHOT_ENTITIES = {"compromissos_obra", "notas_credito_itens"}


class LiveGoogleSheetsAdapter(GoogleSheetsAdapter):
    SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.service = self._build_service()
        self._header_cache: dict[tuple[str, int], list[str]] = {}

    def write_batches(self, batches: list[WriteBatch]) -> None:
        for batch in batches:
            if not batch.records:
                continue
            self._upsert_batch(batch)

    def delete_records(self, entity: str, ids: list[str]) -> None:
        if not ids:
            return
        cfg = SHEET_WRITE_CONFIG[entity]
        sheet_name = cfg["sheet_name"]
        id_field = cfg["id_field"]
        headers = self._read_header(sheet_name)
        current_rows = self._read_rows(sheet_name, headers)
        rows_to_clear = [
            row_num
            for row_num, row in current_rows
            if str(row.get(id_field) or "").strip() in ids
        ]
        if not rows_to_clear:
            return
        last_col = _column_letter(len(headers))
        for row_num in rows_to_clear:
            self._execute_request(
                self.service.spreadsheets().values().clear(
                    spreadsheetId=self.settings.google_spreadsheet_id,
                    range=f"{sheet_name}!A{row_num}:{last_col}{row_num}",
                )
            )

    def load_snapshot(self) -> dict[str, list[dict[str, Any]]]:
        snapshot: dict[str, list[dict[str, Any]]] = {}
        for entity, config in SHEET_READ_CONFIG.items():
            try:
                headers = self._read_header(config["sheet_name"])
                rows = self._read_rows(config["sheet_name"], headers)
                parser: RowParser = config["parser"]
                parsed = []
                for row_num, row in rows:
                    record = parser(row, row_num)
                    if record:
                        parsed.append(record)
                snapshot[entity] = parsed
            except Exception:
                if entity not in OPTIONAL_SNAPSHOT_ENTITIES:
                    raise
                logger.warning(
                    "Failed to read optional Google Sheets entity during snapshot hydration; continuing with empty data entity=%s sheet=%s",
                    entity,
                    config["sheet_name"],
                    exc_info=True,
                )
                snapshot[entity] = []
        return _enrich_snapshot(snapshot)

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
                ("NOTAS_CREDITO_ITENS", 1),
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

    def load_supplier_options(self) -> list[dict[str, Any]]:
        headers = self._read_header("FORNECEDORES")
        rows = self._read_rows("FORNECEDORES", headers)
        suppliers_by_name: dict[str, dict[str, Any]] = {}
        for _, row in rows:
            fornecedor = _read_text(row, ["Fornecedor"])
            if not fornecedor:
                continue
            nif = _read_text(row, ["NIF"])
            key = fornecedor.strip().lower()
            current = suppliers_by_name.get(key)
            if current is None:
                suppliers_by_name[key] = {
                    "id_fornecedor": _read_text(row, ["ID_Fornecedor", "ID Fornecedor"]),
                    "fornecedor": fornecedor,
                    "nif": nif,
                }
                continue
            if not current.get("nif") and nif:
                current["nif"] = nif
        return [
            suppliers_by_name[key]
            for key in sorted(
                suppliers_by_name.keys(),
                key=lambda item: str(suppliers_by_name[item].get("fornecedor") or "").lower(),
            )
        ]

    def load_vehicle_options(self) -> list[dict[str, Any]]:
        headers = self._read_header("VEICULOS")
        rows = self._read_rows("VEICULOS", headers)
        vehicles_by_matricula: dict[str, dict[str, Any]] = {}
        for _, row in rows:
            veiculo = _read_text(row, ["Veiculos", "Veículos"]) or ""
            matricula = _read_text(row, ["Matricula", "Matrícula"]) or ""
            if not veiculo or not matricula:
                continue
            key = matricula.strip().lower()
            if key not in vehicles_by_matricula:
                vehicles_by_matricula[key] = {
                    "veiculo": veiculo,
                    "matricula": matricula,
                }
        return [
            vehicles_by_matricula[key]
            for key in sorted(
                vehicles_by_matricula.keys(),
                key=lambda item: (
                    str(vehicles_by_matricula[item].get("veiculo") or "").lower(),
                    str(vehicles_by_matricula[item].get("matricula") or "").lower(),
                ),
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
        started_at = perf_counter()
        cfg = SHEET_WRITE_CONFIG[batch.entity]
        sheet_name = cfg["sheet_name"]
        id_field = cfg["id_field"]
        serializer: Serializer = cfg["serializer"]

        header_started_at = perf_counter()
        headers = self._read_header(sheet_name)
        header_duration_ms = (perf_counter() - header_started_at) * 1000
        updates: list[tuple[int, list[Any], dict[str, Any]]] = []
        unresolved: list[tuple[str, list[Any], dict[str, Any]]] = []

        for record in batch.records:
            values = serializer(record)
            row_values = [values.get(header, "") for header in headers]
            row_id = str(values.get(id_field) or "").strip()
            sheet_row_num = self._coerce_sheet_row_num(record.get("sheet_row_num"))
            if row_id and sheet_row_num:
                updates.append((sheet_row_num, row_values, record))
            else:
                unresolved.append((row_id, row_values, record))

        current_rows: list[tuple[int, dict[str, Any]]] = []
        rows_duration_ms = 0.0
        if unresolved:
            rows_started_at = perf_counter()
            current_rows = self._read_rows(sheet_name, headers)
            rows_duration_ms = (perf_counter() - rows_started_at) * 1000
            index_by_id = {
                str(row.get(id_field) or "").strip(): row_num
                for row_num, row in current_rows
                if str(row.get(id_field) or "").strip()
            }
        else:
            index_by_id = {}

        appends: list[tuple[list[Any], dict[str, Any]]] = []

        for row_id, row_values, record in unresolved:
            if row_id and row_id in index_by_id:
                record["sheet_row_num"] = index_by_id[row_id]
                updates.append((index_by_id[row_id], row_values, record))
            else:
                appends.append((row_values, record))

        write_started_at = perf_counter()
        for row_num, values, record in updates:
            self._execute_request(
                self.service.spreadsheets().values().update(
                    spreadsheetId=self.settings.google_spreadsheet_id,
                    range=f"{sheet_name}!A{row_num}",
                    valueInputOption="USER_ENTERED",
                    body={"values": [values]},
                )
            )
            record["sheet_row_num"] = row_num
        update_duration_ms = (perf_counter() - write_started_at) * 1000

        if appends:
            append_started_at = perf_counter()
            append_result = self._execute_request(
                self.service.spreadsheets().values().append(
                    spreadsheetId=self.settings.google_spreadsheet_id,
                    range=f"{sheet_name}!A:A",
                    valueInputOption="USER_ENTERED",
                    insertDataOption="INSERT_ROWS",
                    body={"values": [values for values, _ in appends]},
                )
            )
            append_duration_ms = (perf_counter() - append_started_at) * 1000
            self._assign_append_row_numbers(sheet_name, append_result, appends)
        else:
            append_duration_ms = 0.0

        logger.info(
            "timing.google_sheets.upsert entity=%s sheet=%s records=%s existing_rows=%s updates=%s appends=%s header_ms=%.2f rows_ms=%.2f update_ms=%.2f append_ms=%.2f total_ms=%.2f",
            batch.entity,
            sheet_name,
            len(batch.records),
            len(current_rows),
            len(updates),
            len(appends),
            header_duration_ms,
            rows_duration_ms,
            update_duration_ms,
            append_duration_ms,
            (perf_counter() - started_at) * 1000,
        )

    def _read_header(self, sheet_name: str) -> list[str]:
        return self._read_header_at_row(sheet_name, 1)

    def _read_header_at_row(self, sheet_name: str, row_num: int) -> list[str]:
        cache_key = (sheet_name, row_num)
        cached = self._header_cache.get(cache_key)
        if cached is not None:
            return list(cached)
        result = self._execute_request(
            self.service.spreadsheets().values().get(
                spreadsheetId=self.settings.google_spreadsheet_id,
                range=f"{sheet_name}!{row_num}:{row_num}",
            )
        )
        rows = result.get("values", [[]])
        header = rows[0]
        self._header_cache[cache_key] = list(header)
        return header

    def _read_rows(self, sheet_name: str, headers: list[str], *, start_row: int = 2) -> list[tuple[int, dict[str, Any]]]:
        result = self._execute_request(
            self.service.spreadsheets().values().get(
                spreadsheetId=self.settings.google_spreadsheet_id,
                range=f"{sheet_name}!A{start_row}:ZZ",
            )
        )
        rows = result.get("values", [])
        parsed: list[tuple[int, dict[str, Any]]] = []
        for offset, row in enumerate(rows, start=start_row):
            data = {headers[i]: row[i] if i < len(row) else "" for i in range(len(headers))}
            parsed.append((offset, data))
        return parsed

    def _execute_request(self, request: Any) -> Any:
        last_error: Exception | None = None
        for _ in range(3):
            try:
                return request.execute()
            except IncompleteRead as exc:
                last_error = exc
                continue
        if last_error:
            raise last_error
        return request.execute()

    def _coerce_sheet_row_num(self, value: Any) -> int | None:
        try:
            parsed = int(value or 0)
        except (TypeError, ValueError):
            return None
        return parsed if parsed > 1 else None

    def _assign_append_row_numbers(
        self,
        sheet_name: str,
        result: dict[str, Any],
        appended_rows: list[tuple[list[Any], dict[str, Any]]],
    ) -> None:
        updates = result.get("updates") or {}
        updated_range = str(updates.get("updatedRange") or "")
        match = re.search(rf"^{re.escape(sheet_name)}![A-Z]+(\d+):[A-Z]+(\d+)$", updated_range)
        if not match:
            match = re.search(rf"^{re.escape(sheet_name)}![A-Z]+(\d+)$", updated_range)
            if not match:
                return
            start_row = int(match.group(1))
            end_row = start_row
        else:
            start_row = int(match.group(1))
            end_row = int(match.group(2))
        expected_count = end_row - start_row + 1
        if expected_count != len(appended_rows):
            return
        for offset, (_, record) in enumerate(appended_rows):
            record["sheet_row_num"] = start_row + offset


RowParser = Callable[[dict[str, Any], int], dict[str, Any] | None]


def _normalize_key(value: str) -> str:
    normalized = (value or "").strip().lower()
    normalized = unicodedata.normalize("NFD", normalized)
    normalized = "".join(char for char in normalized if unicodedata.category(char) != "Mn")
    normalized = normalized.replace("º", "o").replace("°", "o")
    normalized = normalized.replace("âº", "o").replace("â", "")
    normalized = normalized.replace("/", "").replace("_", "").replace("-", "").replace(" ", "")
    return normalized


def _column_letter(index: int) -> str:
    if index < 1:
        return "A"
    result = ""
    current = index
    while current:
        current, remainder = divmod(current - 1, 26)
        result = chr(65 + remainder) + result
    return result


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


def _read_upper_text(row: dict[str, Any], aliases: list[str]) -> str | None:
    text = _read_text(row, aliases)
    return text.upper() if text else None


def _read_float(row: dict[str, Any], aliases: list[str]) -> float | None:
    value = _pick_value(row, aliases)
    if value in (None, ""):
        return None
    text = str(value).strip()
    has_percent = "%" in text
    text = text.replace("\xa0", "").replace(" ", "").replace("€", "").replace("%", "")
    if "," in text and "." in text:
        if text.rfind(",") > text.rfind("."):
            text = text.replace(".", "").replace(",", ".")
        else:
            text = text.replace(",", "")
    elif "," in text:
        text = text.replace(".", "").replace(",", ".")
    try:
        parsed = float(text)
        if has_percent and parsed > 100:
            return parsed / 100
        return parsed
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
    for fmt in ("%Y-%m-%d", "%Y/%m/%d", "%d/%m/%Y", "%d-%m-%Y"):
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
    tipo_doc_raw = _read_text(row, ["Tipo_Doc", "Tipo Doc", "Tipo"]) or ""
    tipo_doc = (_read_upper_text(row, ["Tipo_Doc", "Tipo Doc", "Tipo"]) or "FATURA").replace(" ", "_")
    doc_origem = _read_text(row, ["Doc_Origem", "Doc Origem", "Documento Origem"])
    nr_documento = _read_text(row, ["Nº Doc/Fatura", "NÂº Doc/Fatura", "NÃ‚Âº Doc/Fatura", "Numero Doc/Fatura"]) or ""
    data_fatura = _read_date(row, ["Data Fatura", "Data"]) or date.today()
    valor_sem_iva = _read_float(row, ["Valor Total Sem IVA", "Custo_Total Sem IVA"])
    valor_com_iva = _read_float(row, ["Valor Total Com IVA", "Custo_Total Com IVA", "Valor"])
    valor_fallback = _read_float(row, ["Valor"])

    if _is_legacy_shifted_fatura_row(tipo_doc_raw, doc_origem, nr_documento, data_fatura, valor_sem_iva, valor_com_iva):
        legacy_data_fatura = _read_date(row, ["Doc_Origem", "Doc Origem", "Documento Origem"]) or date.today()
        legacy_valor_sem_iva = _read_float(row, ["Nº Doc/Fatura", "NÂº Doc/Fatura", "NÃ‚Âº Doc/Fatura", "Numero Doc/Fatura"]) or 0.0
        legacy_valor_com_iva = _recover_shifted_legacy_invoice_total(row) or legacy_valor_sem_iva
        legacy_paga = _read_bool(row, ["Valor Total Sem IVA", "Custo_Total Sem IVA"])
        legacy_data_pagamento = _read_date(row, ["Valor"])
        return {
            "id_fatura": id_fatura,
            "tipo_doc": "FATURA",
            "doc_origem": None,
            "id_compromisso": _read_text(row, ["ID_Compromisso", "ID Compromisso"]),
            "fornecedor": _read_text(row, ["Fornecedor"]) or "",
            "nif": _read_text(row, ["NIF"]) or "",
            "nr_documento": tipo_doc_raw,
            "data_fatura": legacy_data_fatura,
            "valor_sem_iva": legacy_valor_sem_iva,
            "iva": round(((legacy_valor_com_iva / legacy_valor_sem_iva) - 1) * 100, 2) if legacy_valor_sem_iva > 0 and legacy_valor_com_iva > legacy_valor_sem_iva else 0.0,
            "valor_com_iva": legacy_valor_com_iva,
            "paga": legacy_paga,
            "data_pagamento": legacy_data_pagamento if legacy_paga else None,
            "observacoes": _read_text(row, ["Observacoes", "Observações"]),
            "estado": _read_text(row, ["Estado"]) or "ATIVA",
            "sheet_row_num": row_num,
            "created_at": now,
            "updated_at": now,
        }

    return {
        "id_fatura": id_fatura,
        "tipo_doc": tipo_doc,
        "doc_origem": doc_origem,
        "id_compromisso": _read_text(row, ["ID_Compromisso", "ID Compromisso"]),
        "fornecedor": _read_text(row, ["Fornecedor"]) or "",
        "nif": _read_text(row, ["NIF"]) or "",
        "nr_documento": nr_documento,
        "data_fatura": data_fatura,
        "valor_sem_iva": valor_sem_iva if valor_sem_iva is not None else (valor_fallback or 0.0),
        "iva": _read_float(row, ["IVA"]) or 0.0,
        "valor_com_iva": valor_com_iva if valor_com_iva is not None else (valor_fallback or 0.0),
        "paga": _read_bool(row, ["Paga?", "Paga"]),
        "data_pagamento": _read_date(row, ["Data Pagamento"]),
        "observacoes": _read_text(row, ["Observacoes", "Observações"]),
        "estado": _read_text(row, ["Estado"]) or "ATIVA",
        "sheet_row_num": row_num,
        "created_at": now,
        "updated_at": now,
    }


def _is_legacy_shifted_fatura_row(
    tipo_doc_raw: str | None,
    doc_origem: str | None,
    nr_documento: str | None,
    data_fatura: date | None,
    valor_sem_iva: float | None,
    valor_com_iva: float | None,
) -> bool:
    normalized_tipo_doc = str(tipo_doc_raw or "").strip().upper().replace(" ", "_")
    if not normalized_tipo_doc or normalized_tipo_doc in {"FATURA", "NOTA_CREDITO"}:
        return False
    if not doc_origem or not _looks_like_date_text(doc_origem):
        return False
    if _coerce_float_string(nr_documento) is None:
        return False
    if (valor_sem_iva or 0) > 0 or (valor_com_iva or 0) > 0:
        return False
    if data_fatura is None or data_fatura.year > 1910:
        return False
    return True


def _looks_like_date_text(value: str | None) -> bool:
    text = str(value or "").strip()
    if not text:
        return False
    for fmt in ("%Y-%m-%d", "%Y/%m/%d", "%d/%m/%Y", "%d-%m-%Y"):
        try:
            datetime.strptime(text, fmt)
            return True
        except ValueError:
            continue
    return False


def _coerce_float_string(value: str | None) -> float | None:
    if value in (None, ""):
        return None
    text = str(value).strip().replace("\xa0", "").replace(" ", "")
    if "," in text and "." in text:
        if text.rfind(",") > text.rfind("."):
            text = text.replace(".", "").replace(",", ".")
        else:
            text = text.replace(",", "")
    elif "," in text:
        text = text.replace(".", "").replace(",", ".")
    try:
        return float(text)
    except ValueError:
        return None


def _recover_shifted_legacy_invoice_total(row: dict[str, Any]) -> float | None:
    shifted_date = _read_date(row, ["Data Fatura", "Data"])
    if shifted_date is None or shifted_date.year > 1910:
        return None
    base = date(1899, 12, 30)
    serial = float((shifted_date - base).days)
    return serial if serial > 0 else None


def _parse_compromisso(row: dict[str, Any], row_num: int) -> dict[str, Any] | None:
    id_compromisso = _read_text(row, ["ID_Compromisso", "ID Compromisso"])
    if not id_compromisso:
        return None
    now = _read_timestamp(row_num)
    return {
        "id_compromisso": id_compromisso,
        "data": _read_date(row, ["Data"]) or date.today(),
        "fornecedor": _read_text(row, ["Fornecedor"]) or "",
        "nif": _read_text(row, ["NIF"]) or "",
        "tipo_doc": (_read_upper_text(row, ["Tipo_Doc", "Tipo Doc", "Tipo"]) or "PRO_FORMA").replace(" ", "_"),
        "doc_origem": _read_text(row, ["Doc_Origem", "Doc Origem", "Documento Origem"]) or "",
        "obra": _read_text(row, ["Obra"]) or "",
        "fase": _read_text(row, ["Fase"]) or "",
        "descricao": _read_text(row, ["Descricao", "Descrição"]) or "",
        "valor_sem_iva": _read_float(row, ["Valor_Sem_IVA", "Valor Sem IVA", "Valor Total Sem IVA"]) or 0.0,
        "iva": _read_float(row, ["IVA"]) or 0.0,
        "valor_com_iva": _read_float(row, ["Valor_Com_IVA", "Valor Com IVA", "Valor Total Com IVA", "Valor"]) or 0.0,
        "estado": (_read_upper_text(row, ["Estado"]) or "ABERTO").replace(" ", "_"),
        "observacoes": _read_text(row, ["Observacoes", "Observações", "ObservaÃ§Ãµes"]),
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
        "nr_documento": _read_text(row, ["Nº Doc/Fatura", "NÂº Doc/Fatura", "NÃ‚Âº Doc/Fatura", "Numero Doc/Fatura"]),
        "data_fatura": _read_date(row, ["Data Fatura", "Data"]),
        "descricao_original": _read_text(row, ["Descricao_Original", "Descrição_Original", "Descricao Original"]) or "",
        "id_item": _read_text(row, ["ID_Item", "ID Item"]),
        "item_oficial": _read_text(row, ["Item_Oficial", "Item Oficial"]),
        "unidade": _read_text(row, ["Unidade"]),
        "natureza": _read_upper_text(row, ["Natureza"]),
        "uso_combustivel": _read_upper_text(row, ["Uso_Combustivel", "Uso Combustivel"]),
        "matricula": _read_text(row, ["Matricula", "Matrícula"]),
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


def _parse_nci(row: dict[str, Any], row_num: int) -> dict[str, Any] | None:
    item_id = _read_text(row, ["ID_Item_Nota_Credito", "ID Item Nota Credito"])
    if not item_id:
        return None
    now = _read_timestamp(row_num)
    return {
        "id_item_nota_credito": item_id,
        "id_fatura": _read_text(row, ["ID_Fatura", "ID Fatura"]) or "",
        "fornecedor": _read_text(row, ["Fornecedor"]),
        "nif": _read_text(row, ["NIF"]),
        "nr_documento": _read_text(row, ["Nº Doc/Fatura", "NÂº Doc/Fatura", "NÃ‚Âº Doc/Fatura", "Numero Doc/Fatura"]),
        "doc_origem": _read_text(row, ["Doc_Origem", "Doc Origem", "Documento Origem"]),
        "data_fatura": _read_date(row, ["Data Fatura", "Data"]),
        "descricao_original": _read_text(row, ["Descricao_Original", "Descrição_Original", "Descricao Original"]) or "",
        "id_item": _read_text(row, ["ID_Item", "ID Item"]),
        "item_oficial": _read_text(row, ["Item_Oficial", "Item Oficial"]),
        "unidade": _read_text(row, ["Unidade"]),
        "natureza": _read_upper_text(row, ["Natureza"]),
        "quantidade": _read_float(row, ["Quantidade"]) or 0.0,
        "custo_unit": _read_float(row, ["Custo_Unit", "Custo Unit"]) or 0.0,
        "custo_total_sem_iva": _read_float(row, ["Custo_Total Sem IVA", "Custo Total Sem IVA"]) or 0.0,
        "iva": _read_float(row, ["IVA"]) or 0.0,
        "custo_total_com_iva": _read_float(row, ["Custo_Total Com IVA", "Custo Total Com IVA"]) or 0.0,
        "categoria_nota_credito": (_read_upper_text(row, ["Categoria_Nota_Credito", "Categoria Nota Credito"]) or "NC_SEM_OBRA").replace(" ", "_"),
        "obra": _read_text(row, ["Obra"]),
        "fase": _read_text(row, ["Fase"]),
        "estado": _read_text(row, ["Estado"]) or "GUARDADO",
        "observacoes": _read_text(row, ["Observacoes", "Observações"]),
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
        "item_oficial": _read_text(row, ["Item_Oficial", "Item Oficial"]) or "",
        "natureza": _read_upper_text(row, ["Natureza"]) or "MATERIAL",
        "unidade": _read_text(row, ["Unidade"]) or "",
        "observacoes": _read_text(row, ["Observacoes", "Observações"]),
        "estado_cadastro": _read_text(row, ["Estado_Cadastro", "Estado Cadastro"]) or "ATIVO",
        "sheet_row_num": row_num,
        "created_at": now,
        "updated_at": now,
    }


def _parse_catalog_reference(row: dict[str, Any], row_num: int) -> dict[str, Any] | None:
    id_referencia = _read_text(row, ["ID_Referencia", "ID Referencia"])
    if not id_referencia:
        return None
    now = _read_timestamp(row_num)
    return {
        "id_referencia": id_referencia,
        "descricao_original": _read_text(row, ["Descricao_Original", "Descrição_Original", "Descricao Original"]) or "",
        "id_item": _read_text(row, ["ID_Item", "ID Item"]) or "",
        "observacoes": _read_text(row, ["Observacoes", "Observações"]),
        "estado_referencia": _read_text(row, ["Estado_Referencia", "Estado Referencia"]) or "ATIVA",
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
        "natureza": _read_upper_text(row, ["Natureza"]),
        "uso_combustivel": _read_upper_text(row, ["Uso_Combustivel", "Uso Combustivel"]),
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
        "uso_combustivel": _read_upper_text(row, ["Uso_Combustivel", "Uso Combustivel"]),
        "matricula": _read_text(row, ["Matricula", "Matrícula"]),
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


def _parse_stock_atual(row: dict[str, Any], row_num: int) -> dict[str, Any] | None:
    id_item = _read_text(row, ["ID_Item", "ID Item"])
    if not id_item:
        return None
    return {
        "id_item": id_item,
        "item_oficial": _read_text(row, ["Item_Oficial", "Item Oficial", "Material"]) or "",
        "unidade": _read_text(row, ["Unidade"]) or "",
        "stock_atual": _read_float(row, ["Stock Atual", "Stock_Atual"]) or 0.0,
        "custo_medio_atual": _read_float(row, ["Custo_Medio_Atual", "Custo Medio Atual"]) or 0.0,
        "valor_stock": _read_float(row, ["Valor_Stock", "Valor Stock"]) or 0.0,
        "sheet_row_num": row_num,
    }


def _fatura_serializer(record: dict[str, Any]) -> dict[str, Any]:
    return {
        "ID_Fatura": record["id_fatura"],
        "Tipo_Doc": record.get("tipo_doc", "FATURA"),
        "Doc_Origem": record.get("doc_origem", ""),
        "ID_Compromisso": record.get("id_compromisso", ""),
        "Fornecedor": record["fornecedor"],
        "NIF": record["nif"],
        "Nº Doc/Fatura": record["nr_documento"],
        "Data Fatura": str(record["data_fatura"]),
        "Valor": record["valor_com_iva"],
        "Valor Total Sem IVA": record["valor_sem_iva"],
        "IVA": _format_percentage_input(record.get("iva", 0)),
        "Paga?": bool(record.get("paga", False)),
        "Data Pagamento": str(record["data_pagamento"]) if record.get("data_pagamento") else "",
        "Valor Total Com IVA": record["valor_com_iva"],
        "Estado": record.get("estado", ""),
        "Observacoes": record.get("observacoes", ""),
    }


def _compromisso_serializer(record: dict[str, Any]) -> dict[str, Any]:
    return {
        "ID_Compromisso": record["id_compromisso"],
        "Data": str(record["data"]),
        "Fornecedor": record["fornecedor"],
        "NIF": record["nif"],
        "Tipo_Doc": record["tipo_doc"],
        "Doc_Origem": record["doc_origem"],
        "Obra": record["obra"],
        "Fase": record["fase"],
        "Descricao": record["descricao"],
        "Valor_Sem_IVA": record.get("valor_sem_iva", 0),
        "IVA": _format_percentage_input(record.get("iva", 0)),
        "Valor_Com_IVA": record.get("valor_com_iva", 0),
        "Estado": record.get("estado", "ABERTO"),
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
        "Uso_Combustivel": record.get("uso_combustivel", ""),
        "Matricula": record.get("matricula", ""),
        "Quantidade": record["quantidade"],
        "Custo_Unit": record["custo_unit"],
        "Desconto 1": record.get("desconto_1", 0),
        "Desconto 2": record.get("desconto_2", 0),
        "Custo_Total Sem IVA": record.get("custo_total_sem_iva", 0),
        "IVA": _format_percentage_input(record.get("iva", 0)),
        "Custo_Total Com IVA": record.get("custo_total_com_iva", 0),
        "Destino": record["destino"],
        "Obra": record.get("obra", ""),
        "Fase": record.get("fase", ""),
        "Observacoes": record.get("observacoes", ""),
        "Estado_Mapeamento": record.get("estado_mapeamento", ""),
        "Sugestao_Alias": record.get("sugestao_alias", ""),
    }


def _nci_serializer(record: dict[str, Any]) -> dict[str, Any]:
    return {
        "ID_Item_Nota_Credito": record["id_item_nota_credito"],
        "ID_Fatura": record["id_fatura"],
        "Fornecedor": record.get("fornecedor", ""),
        "NIF": record.get("nif", ""),
        "Nº Doc/Fatura": record.get("nr_documento", ""),
        "Doc_Origem": record.get("doc_origem", ""),
        "Data Fatura": str(record.get("data_fatura") or ""),
        "Descricao_Original": record["descricao_original"],
        "ID_Item": record.get("id_item", ""),
        "Item_Oficial": record.get("item_oficial", ""),
        "Unidade": record.get("unidade", ""),
        "Natureza": record.get("natureza", ""),
        "Quantidade": record.get("quantidade", 0),
        "Custo_Unit": record.get("custo_unit", 0),
        "Custo_Total Sem IVA": record.get("custo_total_sem_iva", 0),
        "IVA": _format_percentage_input(record.get("iva", 0)),
        "Custo_Total Com IVA": record.get("custo_total_com_iva", 0),
        "Categoria_Nota_Credito": record.get("categoria_nota_credito", "NC_SEM_OBRA"),
        "Obra": record.get("obra", ""),
        "Fase": record.get("fase", ""),
        "Estado": record.get("estado", "GUARDADO"),
        "Observacoes": record.get("observacoes", ""),
    }


def _catalog_serializer(record: dict[str, Any]) -> dict[str, Any]:
    return {
        "ID_Item": record["id_item"],
        "Item_Oficial": record["item_oficial"],
        "Natureza": record["natureza"],
        "Unidade": record["unidade"],
        "Observacoes": record.get("observacoes", ""),
        "Estado_Cadastro": record.get("estado_cadastro", ""),
    }


def _catalog_reference_serializer(record: dict[str, Any]) -> dict[str, Any]:
    return {
        "ID_Referencia": record["id_referencia"],
        "Descricao_Original": record["descricao_original"],
        "ID_Item": record["id_item"],
        "Observacoes": record.get("observacoes", ""),
        "Estado_Referencia": record.get("estado_referencia", ""),
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
        "Uso_Combustivel": record.get("uso_combustivel", ""),
        "Quantidade": record["quantidade"],
        "Unidade": record.get("unidade", ""),
        "Custo_Unit": record.get("custo_unit", 0),
        "Custo_Total": record.get("custo_total", 0),
        "Custo_Total Sem IVA": record.get("custo_total_sem_iva", 0),
        "IVA": _format_percentage_input(record.get("iva", 0)),
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
        "Uso_Combustivel": record.get("uso_combustivel", ""),
        "Matricula": record.get("matricula", ""),
        "Quantidade": record["quantidade"],
        "Custo_Unit": record.get("custo_unit", 0),
        "Custo_Total Sem IVA": record.get("custo_total_sem_iva", 0),
        "IVA": _format_percentage_input(record.get("iva", 0)),
        "Custo_Total Com IVA": record.get("custo_total_com_iva", 0),
        "Obra": record.get("obra", ""),
        "Fase": record.get("fase", ""),
        "Fornecedor": record.get("fornecedor", ""),
        "NIF": record.get("nif", ""),
        "Nº Doc/Fatura": record.get("nr_documento", ""),
        "Observacoes": record.get("observacoes", ""),
    }


def _stock_atual_serializer(record: dict[str, Any]) -> dict[str, Any]:
    return {
        "ID_Item": record["id_item"],
        "Item_Oficial": record.get("item_oficial", ""),
        "Material": record.get("item_oficial", ""),
        "Unidade": record.get("unidade", ""),
        "Stock_Atual": record.get("stock_atual", 0),
        "Stock Atual": record.get("stock_atual", 0),
        "Custo_Medio_Atual": record.get("custo_medio_atual", 0),
        "Valor_Stock": record.get("valor_stock", 0),
    }


SHEET_WRITE_CONFIG: dict[str, dict[str, Any]] = {
    "faturas": {"sheet_name": "FATURAS", "id_field": "ID_Fatura", "serializer": _fatura_serializer},
    "compromissos_obra": {"sheet_name": "COMPROMISSOS_OBRA", "id_field": "ID_Compromisso", "serializer": _compromisso_serializer},
    "faturas_itens": {"sheet_name": "FATURAS_ITENS", "id_field": "ID_Item_Fatura", "serializer": _fit_serializer},
    "notas_credito_itens": {"sheet_name": "NOTAS_CREDITO_ITENS", "id_field": "ID_Item_Nota_Credito", "serializer": _nci_serializer},
    "materiais_cad": {"sheet_name": "MATERIAIS_CAD", "id_field": "ID_Item", "serializer": _catalog_serializer},
    "materiais_referencias": {"sheet_name": "MATERIAIS_REFERENCIAS", "id_field": "ID_Referencia", "serializer": _catalog_reference_serializer},
    "afetacoes_obra": {"sheet_name": "AFETACOES_OBRA", "id_field": "ID_Afetacao", "serializer": _afetacao_serializer},
    "materiais_mov": {"sheet_name": "MATERIAIS_MOV", "id_field": "ID_Mov", "serializer": _mov_serializer},
    "stock_atual": {"sheet_name": "STOCK_ATUAL", "id_field": "ID_Item", "serializer": _stock_atual_serializer},
}

SHEET_READ_CONFIG: dict[str, dict[str, Any]] = {
    "faturas": {"sheet_name": "FATURAS", "parser": _parse_fatura},
    "compromissos_obra": {"sheet_name": "COMPROMISSOS_OBRA", "parser": _parse_compromisso},
    "faturas_itens": {"sheet_name": "FATURAS_ITENS", "parser": _parse_fit},
    "notas_credito_itens": {"sheet_name": "NOTAS_CREDITO_ITENS", "parser": _parse_nci},
    "materiais_cad": {"sheet_name": "MATERIAIS_CAD", "parser": _parse_catalog},
    "materiais_referencias": {"sheet_name": "MATERIAIS_REFERENCIAS", "parser": _parse_catalog_reference},
    "afetacoes_obra": {"sheet_name": "AFETACOES_OBRA", "parser": _parse_afetacao},
    "materiais_mov": {"sheet_name": "MATERIAIS_MOV", "parser": _parse_mov},
    "stock_atual": {"sheet_name": "STOCK_ATUAL", "parser": _parse_stock_atual},
}


def _format_percentage_input(value: Any) -> str:
    try:
        numeric = float(value or 0)
    except (TypeError, ValueError):
        numeric = 0.0
    if numeric.is_integer():
        return f"{int(numeric)}%"
    return f"{numeric}%"


def _enrich_snapshot(snapshot: dict[str, list[dict[str, Any]]]) -> dict[str, list[dict[str, Any]]]:
    catalog_by_id = {
        str(record.get("id_item") or "").strip(): record
        for record in snapshot.get("materiais_cad", [])
        if str(record.get("id_item") or "").strip()
    }
    for entity in ("faturas_itens", "notas_credito_itens", "afetacoes_obra", "materiais_mov"):
        for record in snapshot.get(entity, []):
            catalog = catalog_by_id.get(str(record.get("id_item") or "").strip())
            if not catalog:
                continue
            if not record.get("item_oficial"):
                record["item_oficial"] = catalog.get("item_oficial")
            if "natureza" in record and not record.get("natureza"):
                record["natureza"] = catalog.get("natureza")
            if not record.get("unidade"):
                record["unidade"] = catalog.get("unidade")
    return snapshot
