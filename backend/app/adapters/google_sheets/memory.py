from __future__ import annotations

from backend.app.adapters.google_sheets.base import GoogleSheetsAdapter, WriteBatch
from backend.app.services.state import RuntimeState


class MemoryGoogleSheetsAdapter(GoogleSheetsAdapter):
    def __init__(self, state: RuntimeState) -> None:
        self.state = state

    def write_batches(self, batches: list[WriteBatch]) -> None:
        self.state.google_write_log.extend(batches)

    def delete_records(self, entity: str, ids: list[str]) -> None:
        return

    def load_snapshot(self) -> dict[str, list[dict[str, object]]]:
        return {}

    def load_work_options(self) -> list[dict[str, object]]:
        fases_by_obra: dict[str, set[str]] = {}
        for collection in (
            self.state.fatura_items.values(),
            self.state.nota_credito_items.values(),
            self.state.afetacoes.values(),
            self.state.movimentos.values(),
        ):
            for record in collection:
                obra = str(record.get("obra") or "").strip()
                fase = str(record.get("fase") or "").strip()
                if not obra:
                    continue
                fases_by_obra.setdefault(obra, set())
                if fase:
                    fases_by_obra[obra].add(fase)
        return [
            {"obra": obra, "ativa": True, "fases": sorted(fases)}
            for obra, fases in sorted(fases_by_obra.items())
        ]

    def load_supplier_options(self) -> list[dict[str, object]]:
        suppliers_by_name: dict[str, dict[str, object]] = {}
        for collection in (
            self.state.compromissos.values(),
            self.state.faturas.values(),
            self.state.fatura_items.values(),
            self.state.nota_credito_items.values(),
            self.state.movimentos.values(),
        ):
            for record in collection:
                fornecedor = str(record.get("fornecedor") or "").strip()
                if not fornecedor:
                    continue
                nif = str(record.get("nif") or "").strip() or None
                key = fornecedor.lower()
                current = suppliers_by_name.get(key)
                if current is None:
                    suppliers_by_name[key] = {"fornecedor": fornecedor, "nif": nif}
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

    def load_vehicle_options(self) -> list[dict[str, object]]:
        vehicles_by_matricula: dict[str, dict[str, object]] = {}
        for collection in (self.state.fatura_items.values(), self.state.movimentos.values()):
            for record in collection:
                matricula = str(record.get("matricula") or "").strip()
                if not matricula:
                    continue
                key = matricula.lower()
                vehicles_by_matricula.setdefault(
                    key,
                    {
                        "veiculo": matricula,
                        "matricula": matricula,
                    },
                )
        return [
            vehicles_by_matricula[key]
            for key in sorted(
                vehicles_by_matricula.keys(),
                key=lambda item: str(vehicles_by_matricula[item].get("matricula") or "").lower(),
            )
        ]
