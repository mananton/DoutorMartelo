from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable

import httpx

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.app.adapters.google_sheets.base import WriteBatch
from backend.app.adapters.google_sheets.live import (  # noqa: E402
    LiveGoogleSheetsAdapter,
    _normalize_key,
    _read_bool,
    _read_date,
    _read_float,
    _read_text,
    SHEET_READ_CONFIG,
)
from backend.app.adapters.supabase.base import SupabaseAdapterError  # noqa: E402
from backend.app.adapters.supabase.live import LiveSupabaseAdapter, TABLE_CONFIG  # noqa: E402
from backend.app.config import Settings  # noqa: E402


RowMapper = Callable[[dict[str, Any], int], dict[str, Any] | None]
HeaderResolver = Callable[[LiveGoogleSheetsAdapter], int]

BATCH_SIZE = 200
MISSING_TABLE_HINT = "Run the required operational sync SQL in the Supabase SQL Editor first (including backend/sql/010_create_dashboard_runtime_sync_tables.sql for the new dashboard mirror tables)."
SNAPSHOT_ENTITIES = [
    "compromissos_obra",
    "faturas",
    "materiais_cad",
    "materiais_referencias",
    "faturas_itens",
    "notas_credito_itens",
    "afetacoes_obra",
    "materiais_mov",
    "stock_atual",
]
SYNC_ORDER = [
    "pessoal_efetivo",
    "obras",
    "colaboradores",
    "ferias",
    "viagens",
    "registos",
    "deslocacoes",
    "legacy_mao_obra",
    "legacy_materiais",
    *SNAPSHOT_ENTITIES,
]

ENTITY_DROP_FIELDS: dict[str, set[str]] = {
    "pessoal_efetivo": {"sheet_row_num"},
}


@dataclass(slots=True)
class ManualSheetConfig:
    entity: str
    sheet_name: str | tuple[str, ...]
    header_row: int | HeaderResolver
    mapper: RowMapper
    dedupe_key: Callable[[dict[str, Any]], str] | None = None
    optional: bool = False


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Sync Google Sheets data to Supabase directly from this computer, without Railway.",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Write rows to Supabase. Default is dry-run.",
    )
    parser.add_argument(
        "--entity",
        action="append",
        dest="entities",
        help="Sync only the selected entity. Repeat to include more than one.",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Print the report as JSON.",
    )
    parser.add_argument(
        "--strict",
        action="store_true",
        help="Return a non-zero exit code when any selected entity is missing in Supabase or fails.",
    )
    parser.add_argument(
        "--list-entities",
        action="store_true",
        help="Print the supported entities and exit.",
    )
    return parser


def _pessoal_header_row(adapter: LiveGoogleSheetsAdapter) -> int:
    result = adapter._execute_request(  # type: ignore[attr-defined]
        adapter.service.spreadsheets().values().get(
            spreadsheetId=adapter.settings.google_spreadsheet_id,
            range="PESSOAL_EFETIVO!A1:Z8",
        )
    )
    rows = result.get("values", [])
    required = {_normalize_key("Nome"), _normalize_key("Nacionalidade")}
    for index, row in enumerate(rows, start=1):
        normalized = {_normalize_key(str(cell or "")) for cell in row}
        if required.issubset(normalized):
            return index
    return 1


def _map_pessoal_efetivo(row: dict[str, Any], row_num: int) -> dict[str, Any] | None:
    nome = _read_text(row, ["Nome"])
    if not nome:
        return None
    data_nascimento = _read_date(row, ["Data Nascimento"])
    data_inicio = _read_date(row, ["Dta Inicio Contrato", "Data Inicio Contrato"])
    data_termino = _read_date(row, ["Data Termino Contrato"])
    return {
        "nome": nome,
        "nacionalidade": _read_text(row, ["Nacionalidade"]),
        "data_nascimento": data_nascimento.isoformat() if data_nascimento else None,
        "morada": _read_text(row, ["Morada"]),
        "telefone": _read_text(row, ["Telefone"]),
        "email": _read_text(row, ["Email", "email"]),
        "data_inicio_contrato": data_inicio.isoformat() if data_inicio else None,
        "data_termino_contrato": data_termino.isoformat() if data_termino else None,
        "carta_conducao": _read_text(row, ["Carta Condução", "Carta Conducao", "Carta ConduÃ§Ã£o"]),
        "categorias_carta": _read_text(row, ["Categorias"]),
        "cam": _read_text(row, ["CAM"]),
        "numero_carta": _read_text(row, ["Nº Carta", "N Carta", "Numero Carta", "NÂº Carta"]),
        "cartao_cidadao": _read_text(row, ["Cartão de Cidadão", "Cartao de Cidadao", "CartÃ£o de CidadÃ£o"]),
        "cartao_residencia": _read_text(row, ["Cartão Residencia", "Cartao Residencia", "CartÃ£o Residencia"]),
        "passaporte": _read_text(row, ["Passaporte"]),
        "visto": _read_text(row, ["Visto"]),
        "certificacoes": _read_text(row, ["Certificações", "Certificacoes", "CertificaÃ§Ãµes"]),
        "ocorrencias": _read_text(row, ["Ocorrências", "Ocorrencias", "OcorrÃªncias"]),
        "sheet_row_num": row_num,
    }


def _map_colaborador(row: dict[str, Any], row_num: int) -> dict[str, Any] | None:
    nome = _read_text(row, ["Nome"])
    if not nome:
        return None
    return {
        "nome": nome,
        "funcao": _read_text(row, ["Função", "Funcao", "FunÃ§Ã£o"]),
        "eur_h": _read_float(row, ["€/h", "â‚¬/h", "Eur_h", "Eur h"]) or 0.0,
        "ativo": True,
        "sheet_row_num": row_num,
    }


def _map_obra(row: dict[str, Any], row_num: int) -> dict[str, Any] | None:
    obra_id = _read_text(row, ["Obra_ID", "Obra"])
    if not obra_id or obra_id == "Obra_ID":
        return None
    return {
        "obra_id": obra_id,
        "local_id": _read_text(row, ["Local_ID", "Local"]),
        "ativa": _read_text(row, ["Ativa", "Activo", "Ativo"]),
        "sheet_row_num": row_num,
    }


def _map_registo(row: dict[str, Any], row_num: int) -> dict[str, Any] | None:
    record_id = _read_text(row, ["ID_Registo", "ID Registo"])
    if not record_id:
        return None
    data_registo = _read_date(row, ["DATA_REGISTO", "Data Registo"])
    return {
        "id_registo": record_id,
        "data_registo": data_registo.isoformat() if data_registo else None,
        "nome": _read_text(row, ["Nome"]) or "",
        "funcao": _read_text(row, ["Função", "Funcao", "FunÃ§Ã£o"]),
        "obra": _read_text(row, ["Obra"]),
        "fase": _read_text(row, ["Fase de Obra", "Fase"]),
        "horas": _read_float(row, ["Horas"]) or 0.0,
        "atraso_min": _read_float(row, ["Atraso_Minutos", "Atraso Minutos"]) or 0.0,
        "falta": _read_bool(row, ["Falta"]),
        "motivo": _read_text(row, ["Motivo Falta"]),
        "eur_h": _read_float(row, ["€/h", "â‚¬/h"]) or 0.0,
        "observacao": _read_text(row, ["Observação", "Observacao", "ObservaÃ§Ã£o"]),
        "dispensado": _read_bool(row, ["Dispensado"]),
        "sheet_row_num": row_num,
    }


def _build_ferias_key(row: dict[str, Any], row_num: int) -> str:
    data_admissao = _read_date(row, ["Data_Admissao", "Data Admissao", "Data AdmissÃ£o"])
    ref_inicio = _read_date(row, ["Ano_Ref_Inicio", "Ano Ref Inicio", "Ano Ref InÃ­cio"])
    ref_fim = _read_date(row, ["Ano_Ref_Fim", "Ano Ref Fim"])
    return "|".join(
        [
            "ferias-row",
            _normalize_key_part(_read_text(row, ["Nome"])),
            data_admissao.isoformat() if data_admissao else "",
            ref_inicio.isoformat() if ref_inicio else "",
            ref_fim.isoformat() if ref_fim else "",
            str(row_num),
        ]
    )


def _map_ferias(row: dict[str, Any], row_num: int) -> dict[str, Any] | None:
    nome = _read_text(row, ["Nome"])
    if not nome:
        return None
    data_admissao = _read_date(row, ["Data_Admissao", "Data Admissao", "Data AdmissÃ£o"])
    ref_inicio = _read_date(row, ["Ano_Ref_Inicio", "Ano Ref Inicio", "Ano Ref InÃ­cio"])
    ref_fim = _read_date(row, ["Ano_Ref_Fim", "Ano Ref Fim"])
    return {
        "source_key": _build_ferias_key(row, row_num),
        "nome": nome,
        "data_admissao": data_admissao.isoformat() if data_admissao else None,
        "dias_total": int(_read_float(row, ["Dias_Total", "Dias Total"]) or 0),
        "ano_ref_inicio": ref_inicio.isoformat() if ref_inicio else None,
        "ano_ref_fim": ref_fim.isoformat() if ref_fim else None,
        "dias_usados": int(_read_float(row, ["Dias_Usados", "Dias Usados"]) or 0),
        "dias_disponiveis": int(_read_float(row, ["Dias_Disponiveis", "Dias Disponiveis", "Dias DisponÃ­veis"]) or 0),
        "sheet_row_num": row_num,
    }


def _build_viagem_key(row: dict[str, Any], row_num: int) -> str:
    data = _read_date(row, ["Data"])
    return "|".join(
        [
            "viagem-row",
            data.isoformat() if data else "",
            _normalize_key_part(_read_text(row, ["Viatura"])),
            _normalize_key_part(_read_text(row, ["Obra"])),
            str(_read_float(row, ["V_Efetivas", "V Efetivas"]) or 0.0),
            str(row_num),
        ]
    )


def _map_viagem(row: dict[str, Any], row_num: int) -> dict[str, Any] | None:
    data = _read_date(row, ["Data"])
    if not data:
        return None
    raw_real = _read_text(row, ["V_Real", "V Real"])
    v_real = _read_float(row, ["V_Real", "V Real"]) if raw_real != "" else None
    return {
        "source_key": _build_viagem_key(row, row_num),
        "data": data.isoformat() if data else None,
        "dia_sem": int(_read_float(row, ["DiaSem", "Dia da Semana"]) or 0),
        "v_padrao": _read_float(row, ["V_Padrao", "V PadrÃ£o"]) or 0.0,
        "v_real": v_real,
        "v_efetivas": _read_float(row, ["V_Efetivas", "V Efetivas"]) or 0.0,
        "viatura": _read_text(row, ["Viatura"]),
        "obra": _read_text(row, ["Obra"]) or None,
        "custo_via": _read_float(row, ["Custo_Via", "Custo Via"]) or 0.0,
        "custo_dia": _read_float(row, ["Custo_Dia", "Custo Dia"]) or 0.0,
        "sheet_row_num": row_num,
    }


def _map_deslocacao(row: dict[str, Any], row_num: int) -> dict[str, Any] | None:
    viagem_id = _read_text(row, ["ID_Viagem", "ID Viagem"])
    if not viagem_id:
        return None
    data = _read_date(row, ["Data"])
    return {
        "id_viagem": viagem_id,
        "data": data.isoformat() if data else None,
        "obra_destino": _read_text(row, ["Obra_Destino", "Obra Destino"]),
        "destino": _read_text(row, ["Destino"]),
        "veiculo": _read_text(row, ["Veiculo", "Veículo"]),
        "motorista": _read_text(row, ["Motorista"]),
        "origem": _read_text(row, ["Origem"]),
        "quantidade_viagens": int(_read_float(row, ["Quantidade_Viagens", "Quantidade Viagens"]) or 0),
        "custo_total": _read_float(row, ["Custo_Total", "Custo Total"]) or 0.0,
        "sheet_row_num": row_num,
    }


def _normalize_key_part(value: Any) -> str:
    return " ".join(str(value or "").strip().lower().split())


def _build_legacy_key(row: dict[str, Any], row_num: int) -> str:
    manual_id = _read_text(row, ["ID_Legacy", "ID LEGACY"])
    if manual_id:
        return f"legacy-id|{manual_id}"
    data = _read_date(row, ["Data"])
    return "|".join(
        [
            "legacy-row",
            data.isoformat() if data else "",
            _normalize_key_part(_read_text(row, ["Obra"])),
            _normalize_key_part(_read_text(row, ["Fase de Obra", "Fase"])),
            str(_read_float(row, ["Horas"]) or 0.0),
            str(_read_float(row, ["Custo Dia", "Custo_Dia"]) or 0.0),
            str(row_num),
        ]
    )


def _build_legacy_materiais_key(row: dict[str, Any], row_num: int) -> str:
    data = _read_date(row, ["Data"])
    return "|".join(
        [
            "legacy-mat-row",
            data.isoformat() if data else "",
            _normalize_key_part(_read_text(row, ["Obra"])),
            _normalize_key_part(_read_text(row, ["Fase de Obra", "Fase"])),
            _normalize_key_part(_read_text(row, ["Material"])),
            str(_read_float(row, ["Quantidade"]) or 0.0),
            str(_read_float(row, ["Custo_Total Com IVA", "Custo Total Com IVA", "Custo_Total_Com_IVA"]) or 0.0),
            str(row_num),
        ]
    )


def _map_legacy_mao_obra(row: dict[str, Any], row_num: int) -> dict[str, Any] | None:
    data = _read_date(row, ["Data"])
    obra = _read_text(row, ["Obra"])
    if not data and not obra:
        return None
    return {
        "source_key": _build_legacy_key(row, row_num),
        "data": data.isoformat() if data else None,
        "obra": obra,
        "fase": _read_text(row, ["Fase de Obra", "Fase"]),
        "horas": _read_float(row, ["Horas"]) or 0.0,
        "custo_dia": _read_float(row, ["Custo Dia", "Custo_Dia"]) or 0.0,
        "origem": _read_text(row, ["Origem"]) or "legacy",
        "nota": _read_text(row, ["Nota", "Observacao", "Observação", "ObservaÃ§Ã£o"]),
        "sheet_row_num": row_num,
    }


def _map_legacy_materiais(row: dict[str, Any], row_num: int) -> dict[str, Any] | None:
    obra = _read_text(row, ["Obra"])
    material = _read_text(row, ["Material"])
    if not obra or not material:
        return None
    data = _read_date(row, ["Data"])
    custo_com_iva = _read_float(row, ["Custo_Total Com IVA", "Custo Total Com IVA", "Custo_Total_Com_IVA"]) or 0.0
    custo_sem_iva = _read_float(row, ["Custo_Total Sem IVA", "Custo Total Sem IVA", "Custo_Total_Sem_IVA"]) or 0.0
    custo_total = custo_com_iva or custo_sem_iva or 0.0
    quantidade = _read_float(row, ["Quantidade"]) or 0.0
    return {
        "source_key": _build_legacy_materiais_key(row, row_num),
        "data": data.isoformat() if data else None,
        "obra": obra,
        "fase": _read_text(row, ["Fase de Obra", "Fase"]) or "Sem Fase",
        "material": material,
        "unidade": _read_text(row, ["Unidade"]),
        "quantidade": quantidade,
        "custo_unit": _read_float(row, ["Custo_Unit", "Custo Unit", "Custo Unitario", "Custo UnitÃ¡rio"]) or 0.0,
        "custo_total_sem_iva": custo_sem_iva,
        "iva": _read_float(row, ["IVA"]) or 0.0,
        "custo_total_com_iva": custo_com_iva or custo_total,
        "custo_total": custo_total,
        "sheet_row_num": row_num,
    }


MANUAL_SHEETS: dict[str, ManualSheetConfig] = {
    "pessoal_efetivo": ManualSheetConfig(
        entity="pessoal_efetivo",
        sheet_name="PESSOAL_EFETIVO",
        header_row=_pessoal_header_row,
        mapper=_map_pessoal_efetivo,
        dedupe_key=lambda item: str(item.get("nome") or "").strip().lower(),
    ),
    "colaboradores": ManualSheetConfig(
        entity="colaboradores",
        sheet_name="COLABORADORES",
        header_row=3,
        mapper=_map_colaborador,
        dedupe_key=lambda item: str(item.get("nome") or "").strip().lower(),
    ),
    "obras": ManualSheetConfig(
        entity="obras",
        sheet_name="OBRAS",
        header_row=3,
        mapper=_map_obra,
        dedupe_key=lambda item: str(item.get("obra_id") or "").strip().lower(),
    ),
    "ferias": ManualSheetConfig(
        entity="ferias",
        sheet_name="FERIAS",
        header_row=1,
        mapper=_map_ferias,
        dedupe_key=lambda item: str(item.get("source_key") or "").strip(),
    ),
    "viagens": ManualSheetConfig(
        entity="viagens",
        sheet_name="VIAGENS_DIARIAS",
        header_row=2,
        mapper=_map_viagem,
        dedupe_key=lambda item: str(item.get("source_key") or "").strip(),
        optional=True,
    ),
    "registos": ManualSheetConfig(
        entity="registos",
        sheet_name="REGISTOS_POR_DIA",
        header_row=1,
        mapper=_map_registo,
        dedupe_key=lambda item: str(item.get("id_registo") or "").strip(),
    ),
    "deslocacoes": ManualSheetConfig(
        entity="deslocacoes",
        sheet_name="REGISTO_DESLOCACOES",
        header_row=1,
        mapper=_map_deslocacao,
        dedupe_key=lambda item: str(item.get("id_viagem") or "").strip(),
    ),
    "legacy_mao_obra": ManualSheetConfig(
        entity="legacy_mao_obra",
        sheet_name="LEGACY_MAO_OBRA",
        header_row=1,
        mapper=_map_legacy_mao_obra,
        dedupe_key=lambda item: str(item.get("source_key") or "").strip(),
    ),
    "legacy_materiais": ManualSheetConfig(
        entity="legacy_materiais",
        sheet_name=("LEGACY_MATERIAIS", "MATERIAIS_LEGACY"),
        header_row=1,
        mapper=_map_legacy_materiais,
        dedupe_key=lambda item: str(item.get("source_key") or "").strip(),
    ),
}


def list_supported_entities() -> None:
    print("Supported entities:")
    for entity in SYNC_ORDER:
        print(f"- {entity}")


def resolve_entities(requested: list[str] | None) -> list[str]:
    if not requested:
        return list(SYNC_ORDER)
    requested_set = {item.strip() for item in requested if item and item.strip()}
    unknown = sorted(requested_set.difference(SYNC_ORDER))
    if unknown:
        raise SystemExit(f"Unknown entities: {', '.join(unknown)}")
    return [entity for entity in SYNC_ORDER if entity in requested_set]


def resolve_header_row(adapter: LiveGoogleSheetsAdapter, config: ManualSheetConfig) -> int:
    if callable(config.header_row):
        return config.header_row(adapter)
    return int(config.header_row)


def resolve_sheet_name(adapter: LiveGoogleSheetsAdapter, config: ManualSheetConfig) -> str:
    names = (config.sheet_name,) if isinstance(config.sheet_name, str) else tuple(config.sheet_name)
    last_error: Exception | None = None
    for name in names:
        try:
            adapter._read_header_at_row(name, 1)  # type: ignore[attr-defined]
            return name
        except Exception as exc:
            last_error = exc
            continue
    if last_error:
        raise last_error
    raise RuntimeError(f"No sheet name configured for {config.entity}")


def load_manual_entity(adapter: LiveGoogleSheetsAdapter, config: ManualSheetConfig) -> list[dict[str, Any]]:
    try:
        sheet_name = resolve_sheet_name(adapter, config)
    except Exception:
        if config.optional:
            return []
        raise
    header_row = resolve_header_row(adapter, config)
    headers = adapter._read_header_at_row(sheet_name, header_row)  # type: ignore[attr-defined]
    rows = adapter._read_rows(  # type: ignore[attr-defined]
        sheet_name,
        headers,
        start_row=header_row + 1,
        value_render_option="UNFORMATTED_VALUE",
    )
    out: list[dict[str, Any]] = []
    index_by_key: dict[str, int] = {}
    for row_num, row in rows:
        record = config.mapper(row, row_num)
        if not record:
            continue
        if config.dedupe_key:
            key = config.dedupe_key(record)
            if key:
                if key in index_by_key:
                    out[index_by_key[key]] = record
                else:
                    index_by_key[key] = len(out)
                    out.append(record)
                continue
        out.append(record)
    return out


def chunked(records: list[dict[str, Any]], size: int) -> list[list[dict[str, Any]]]:
    return [records[index:index + size] for index in range(0, len(records), size)]


def prepare_records(entity: str, records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    config = TABLE_CONFIG.get(entity)
    drop_fields = ENTITY_DROP_FIELDS.get(entity, set())
    prepared: list[dict[str, Any]] = []
    seen_by_id: dict[str, int] = {}
    id_field = config.get("id_field") if config else None

    for record in records:
        current = {key: value for key, value in record.items() if key not in drop_fields}
        if id_field:
            row_id = str(current.get(id_field) or "").strip()
            if row_id:
                existing_index = seen_by_id.get(row_id)
                if existing_index is not None:
                    prepared[existing_index] = current
                else:
                    seen_by_id[row_id] = len(prepared)
                    prepared.append(current)
                continue
        prepared.append(current)

    return prepared


def sanitize_source_data(source_data: dict[str, list[dict[str, Any]]]) -> tuple[dict[str, list[dict[str, Any]]], list[str]]:
    sanitized = {entity: list(records) for entity, records in source_data.items()}
    notes: list[str] = []

    catalog_ids = {
        str(item.get("id_item") or "").strip()
        for item in prepare_records("materiais_cad", sanitized.get("materiais_cad", []))
        if str(item.get("id_item") or "").strip()
    }

    if "materiais_referencias" in sanitized and catalog_ids:
        original_refs = sanitized["materiais_referencias"]
        filtered_refs = [
            item for item in original_refs
            if str(item.get("id_item") or "").strip() in catalog_ids
        ]
        skipped = len(original_refs) - len(filtered_refs)
        if skipped:
            notes.append(
                f"Skipped {skipped} orphan materiais_referencias rows whose id_item no longer exists in materiais_cad."
            )
        sanitized["materiais_referencias"] = filtered_refs

    return sanitized, notes


def get_remote_state(settings: Settings, entity: str) -> dict[str, Any]:
    config = TABLE_CONFIG.get(entity)
    if not config:
        return {"ok": False, "table": None, "count": None, "ids": [], "error": f"No Supabase table mapping for {entity}"}

    base_url = f"{settings.supabase_url.rstrip('/')}/rest/v1"
    headers = {
        "apikey": settings.supabase_service_role_key or "",
        "Authorization": f"Bearer {settings.supabase_service_role_key or ''}",
        "Accept-Profile": settings.supabase_schema,
        "Content-Profile": settings.supabase_schema,
        "Prefer": "count=exact",
    }
    total = None
    remote_ids: list[str] = []
    page_size = 1000
    offset = 0
    id_field = config["id_field"]
    with httpx.Client(timeout=20.0, trust_env=False) as client:
        while True:
            response = client.get(
                f"{base_url}/{config['table']}",
                params={"select": id_field, "limit": page_size, "offset": offset},
                headers=headers,
            )
            if response.status_code == 404:
                return {"ok": False, "table": config["table"], "count": None, "ids": [], "error": "missing_table"}
            if response.status_code >= 300:
                return {"ok": False, "table": config["table"], "count": None, "ids": [], "error": f"HTTP {response.status_code} {response.text}"}

            content_range = response.headers.get("content-range", "")
            if total is None and "/" in content_range:
                raw_total = content_range.split("/", 1)[1]
                if raw_total.isdigit():
                    total = int(raw_total)

            rows = response.json()
            for row in rows:
                row_id = str(row.get(id_field) or "").strip()
                if row_id:
                    remote_ids.append(row_id)

            if len(rows) < page_size:
                break
            offset += len(rows)

    if total is None:
        total = len(remote_ids)
    return {"ok": True, "table": config["table"], "count": total, "ids": remote_ids, "error": None}


def sync_entity(
    entity: str,
    records: list[dict[str, Any]],
    settings: Settings,
    supabase: LiveSupabaseAdapter,
    *,
    apply: bool,
) -> dict[str, Any]:
    prepared_records = prepare_records(entity, records)
    remote_state = get_remote_state(settings, entity)
    source_ids = {
        str(item.get(TABLE_CONFIG[entity]["id_field"]) or "").strip()
        for item in prepared_records
        if str(item.get(TABLE_CONFIG[entity]["id_field"]) or "").strip()
    }
    stale_ids = [
        row_id for row_id in remote_state.get("ids", [])
        if row_id not in source_ids
    ]
    result: dict[str, Any] = {
        "entity": entity,
        "rows": len(prepared_records),
        "table": remote_state.get("table"),
        "existing_rows": remote_state.get("count"),
        "stale_remote": len(stale_ids),
        "status": "pending",
        "error": None,
    }

    if not remote_state["ok"]:
        result["status"] = "missing_table" if remote_state.get("error") == "missing_table" else "error"
        result["error"] = remote_state.get("error")
        return result

    if not apply:
        result["status"] = "dry_run" if prepared_records or stale_ids else "empty"
        return result

    if not prepared_records and not stale_ids:
        result["status"] = "empty"
        return result

    total_written = 0
    total_deleted = 0
    try:
        for batch_records in chunked(prepared_records, BATCH_SIZE):
            supabase.write_batches([WriteBatch(entity=entity, records=batch_records)])
            total_written += len(batch_records)
        for stale_batch in chunked(stale_ids, BATCH_SIZE):
            supabase.delete_records(entity, [str(item) for item in stale_batch])
            total_deleted += len(stale_batch)
        result["status"] = "synced"
        result["written"] = total_written
        result["deleted"] = total_deleted
        return result
    except SupabaseAdapterError as exc:
        result["status"] = "error"
        result["written"] = total_written
        result["deleted"] = total_deleted
        result["error"] = str(exc)
        return result


def print_report(report: dict[str, Any]) -> None:
    print("== Manual Sheets -> Supabase Sync ==")
    print(f"- Mode: {'APPLY' if report['applied'] else 'DRY-RUN'}")
    print(f"- Spreadsheet ID: {report['spreadsheet_id']}")
    print(f"- Selected entities: {', '.join(report['selected_entities'])}")

    sheet_overview = report.get("sheet_overview") or {}
    if sheet_overview:
        print("\nGoogle Sheet snapshot:")
        for entity in report["selected_entities"]:
            if entity in sheet_overview:
                print(f"- {entity}: {sheet_overview[entity]} rows")

    print("\nResults:")
    for item in report["results"]:
        line = f"- {item['entity']}: {item['status']} | rows={item['rows']}"
        if item.get("table"):
            line += f" | table={item['table']}"
        if item.get("existing_rows") is not None:
            line += f" | current_supabase={item['existing_rows']}"
        if item.get("stale_remote"):
            line += f" | stale_remote={item['stale_remote']}"
        if item.get("written") is not None:
            line += f" | written={item['written']}"
        if item.get("deleted") is not None:
            line += f" | deleted={item['deleted']}"
        print(line)
        if item.get("error"):
            if item["error"] == "missing_table":
                print(f"  {MISSING_TABLE_HINT}")
            else:
                print(f"  {item['error']}")

    notes = report.get("notes") or []
    if notes:
        print("\nNotes:")
        for note in notes:
            print(f"- {note}")

    summary = report.get("summary") or {}
    print("\nSummary:")
    print(f"- Synced: {summary.get('synced', 0)}")
    print(f"- Dry-run ready: {summary.get('dry_run', 0)}")
    print(f"- Empty: {summary.get('empty', 0)}")
    print(f"- Missing tables: {summary.get('missing_table', 0)}")
    print(f"- Errors: {summary.get('error', 0)}")


def main() -> int:
    args = build_parser().parse_args()

    if args.list_entities:
        list_supported_entities()
        return 0

    selected_entities = resolve_entities(args.entities)
    settings = Settings.from_env()
    if not settings.has_google_sheets:
        raise SystemExit("Google Sheets config missing in backend/.env")
    if not settings.has_supabase:
        raise SystemExit("Supabase config missing in backend/.env")

    sheets = LiveGoogleSheetsAdapter(settings)
    supabase = LiveSupabaseAdapter(settings)

    snapshot = sheets.load_snapshot(value_render_option="UNFORMATTED_VALUE")
    manual_data = {
        entity: load_manual_entity(sheets, config)
        for entity, config in MANUAL_SHEETS.items()
        if entity in selected_entities
    }

    source_data: dict[str, list[dict[str, Any]]] = {entity: snapshot.get(entity, []) for entity in SNAPSHOT_ENTITIES}
    source_data.update(manual_data)
    source_data, notes = sanitize_source_data(source_data)

    results: list[dict[str, Any]] = []
    summary = {"synced": 0, "dry_run": 0, "empty": 0, "missing_table": 0, "error": 0}

    for entity in selected_entities:
        records = source_data.get(entity, [])
        result = sync_entity(entity, records, settings, supabase, apply=args.apply)
        summary[result["status"]] = summary.get(result["status"], 0) + 1
        results.append(result)

    report = {
        "applied": bool(args.apply),
        "spreadsheet_id": settings.google_spreadsheet_id,
        "selected_entities": selected_entities,
        "sheet_overview": {entity: len(source_data.get(entity, [])) for entity in selected_entities},
        "results": results,
        "summary": summary,
        "notes": notes,
    }

    if args.json:
        print(json.dumps(report, indent=2, ensure_ascii=False, default=str))
    else:
        print_report(report)

    has_failures = any(item["status"] in {"missing_table", "error"} for item in results)
    return 1 if args.strict and has_failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
