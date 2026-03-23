from __future__ import annotations

import os
import unittest

from fastapi.testclient import TestClient

from backend.app.main import create_app


class MaterialsApiTests(unittest.TestCase):
    def setUp(self) -> None:
        self._previous_disable_live = os.environ.get("BACKEND_DISABLE_LIVE_ADAPTERS")
        os.environ["BACKEND_DISABLE_LIVE_ADAPTERS"] = "1"
        self.app = create_app()
        self.client = TestClient(self.app)
        response = self.client.post(
            "/api/materiais-cad",
            json={
                "descricao_original": "Prego 30",
                "item_oficial": "Prego Zincado 30",
                "natureza": "MATERIAL",
                "unidade": "UN",
            },
        )
        self.assertEqual(response.status_code, 201)
        self.catalog = response.json()

    def _create_catalog_entry(
        self,
        *,
        descricao_original: str,
        item_oficial: str,
        natureza: str,
        unidade: str,
    ) -> dict[str, object]:
        response = self.client.post(
            "/api/materiais-cad",
            json={
                "descricao_original": descricao_original,
                "item_oficial": item_oficial,
                "natureza": natureza,
                "unidade": unidade,
            },
        )
        self.assertEqual(response.status_code, 201)
        return response.json()

    def _create_fatura(
        self,
        suffix: str = "001",
        *,
        paga: bool = False,
        data_pagamento: str | None = None,
    ) -> dict[str, object]:
        return self.client.post(
            "/api/faturas",
            json={
                "fornecedor": "Fornecedor Base",
                "nif": "501234567",
                "nr_documento": f"FT 2026/{suffix}",
                "data_fatura": "2026-03-18",
                "valor_sem_iva": 100,
                "iva": 23,
                "valor_com_iva": 123,
                "paga": paga,
                "data_pagamento": data_pagamento,
            },
        ).json()

    def _create_item(
        self,
        id_fatura: str,
        *,
        destino: str,
        descricao_original: str = "Prego 30",
        obra: str | None = None,
        fase: str | None = None,
        id_item: str | None = None,
        natureza: str | None = None,
        uso_combustivel: str | None = None,
        matricula: str | None = None,
    ) -> dict[str, object]:
        response = self.client.post(
            f"/api/faturas/{id_fatura}/itens",
            json={
                "items": [
                    {
                        "descricao_original": descricao_original,
                        "quantidade": 100,
                        "custo_unit": 0.1,
                        "iva": 23,
                        "destino": destino,
                        "obra": obra,
                        "fase": fase,
                        "id_item": id_item or self.catalog["id_item"],
                        "natureza": natureza,
                        "uso_combustivel": uso_combustivel,
                        "matricula": matricula,
                    }
                ]
            },
        )
        self.assertEqual(response.status_code, 201)
        return response.json()["items"][0]

    def tearDown(self) -> None:
        if self._previous_disable_live is None:
            os.environ.pop("BACKEND_DISABLE_LIVE_ADAPTERS", None)
        else:
            os.environ["BACKEND_DISABLE_LIVE_ADAPTERS"] = self._previous_disable_live

    def test_direct_invoice_item_generates_afetacao_and_movement(self) -> None:
        fatura = self._create_fatura("001")
        self._create_item(fatura["id_fatura"], destino="CONSUMO", obra="Obra A", fase="Fase 1")
        afetacoes = self.client.get("/api/afetacoes").json()
        self.assertEqual(len(afetacoes), 1)
        self.assertEqual(afetacoes[0]["origem"], "FATURA_DIRETA")

    def test_list_faturas_returns_most_recent_first(self) -> None:
        first = self._create_fatura("001")
        second = self._create_fatura("002")
        third = self._create_fatura("003")

        response = self.client.get("/api/faturas")
        self.assertEqual(response.status_code, 200)
        ids = [entry["id_fatura"] for entry in response.json()]
        self.assertEqual(ids[:3], [third["id_fatura"], second["id_fatura"], first["id_fatura"]])

    def test_stock_entry_then_manual_afetacao_uses_average_cost(self) -> None:
        fatura = self._create_fatura("002")
        self._create_item(fatura["id_fatura"], destino="STOCK")

        afetacao = self.client.post(
            "/api/afetacoes",
            json={
                "origem": "STOCK",
                "data": "2026-03-18",
                "id_item": self.catalog["id_item"],
                "quantidade": 10,
                "iva": 23,
                "obra": "Obra B",
                "fase": "Fase 2",
                "processar": True,
            },
        )
        self.assertEqual(afetacao.status_code, 201)
        body = afetacao.json()
        self.assertGreater(body["custo_unit"], 0)
        stock = self.client.get(f"/api/stock-atual/{self.catalog['id_item']}").json()
        self.assertEqual(stock["stock_atual"], 90)

    def test_create_and_patch_fatura_keep_payment_state_fields(self) -> None:
        fatura = self._create_fatura("002A", paga=True, data_pagamento="2026-03-20")
        self.assertTrue(fatura["paga"])
        self.assertEqual(fatura["data_pagamento"], "2026-03-20")

        patch = self.client.patch(
            f"/api/faturas/{fatura['id_fatura']}",
            json={
                "paga": False,
            },
        )
        self.assertEqual(patch.status_code, 200)
        self.assertFalse(patch.json()["paga"])
        self.assertIsNone(patch.json()["data_pagamento"])

    def test_fuel_invoice_item_for_viatura_generates_direct_movement(self) -> None:
        fuel_catalog = self._create_catalog_entry(
            descricao_original="Gasoleo simples",
            item_oficial="GASOLEO_RODOVIARIO",
            natureza="GASOLEO",
            unidade="Lt",
        )
        fatura = self._create_fatura("002B")

        item = self._create_item(
            fatura["id_fatura"],
            destino="VIATURA",
            descricao_original="Gasoleo simples",
            id_item=str(fuel_catalog["id_item"]),
            uso_combustivel="VIATURA",
            matricula="11-AA-22",
        )
        self.assertEqual(item["destino"], "VIATURA")
        self.assertEqual(item["uso_combustivel"], "VIATURA")
        self.assertEqual(item["matricula"], "11-AA-22")

        self.assertEqual(self.client.get("/api/afetacoes").json(), [])
        movimentos = self.client.get("/api/materiais-mov").json()
        self.assertEqual(len(movimentos), 1)
        self.assertEqual(movimentos[0]["source_type"], "FIT")
        self.assertEqual(movimentos[0]["tipo"], "CONSUMO")
        self.assertEqual(movimentos[0]["uso_combustivel"], "VIATURA")
        self.assertEqual(movimentos[0]["matricula"], "11-AA-22")
        stock = self.client.get(f"/api/stock-atual/{fuel_catalog['id_item']}").json()
        self.assertEqual(stock["stock_atual"], 0)

    def test_direct_service_invoice_item_does_not_reduce_stock(self) -> None:
        service_catalog = self._create_catalog_entry(
            descricao_original="Servico de instalacao",
            item_oficial="SERVICO_INSTALACAO",
            natureza="SERVICO",
            unidade="UN",
        )
        fatura = self._create_fatura("002B-SRV")

        item = self._create_item(
            fatura["id_fatura"],
            destino="CONSUMO",
            descricao_original="Servico de instalacao",
            id_item=str(service_catalog["id_item"]),
            obra="Obra Servico",
            fase="Execucao",
        )
        self.assertEqual(item["id_item"], service_catalog["id_item"])

        stock = self.client.get(f"/api/stock-atual/{service_catalog['id_item']}").json()
        self.assertEqual(stock["stock_atual"], 0)
        stock_list = self.client.get("/api/stock-atual").json()
        self.assertFalse(any(entry["id_item"] == service_catalog["id_item"] for entry in stock_list))

    def test_stock_fuel_afetacao_requires_machine_or_generator_usage(self) -> None:
        fuel_catalog = self._create_catalog_entry(
            descricao_original="Gasolina simples",
            item_oficial="GASOLINA_95",
            natureza="GASOLINA",
            unidade="Lt",
        )
        fatura = self._create_fatura("002C")
        self._create_item(
            fatura["id_fatura"],
            destino="STOCK",
            descricao_original="Gasolina simples",
            id_item=str(fuel_catalog["id_item"]),
            uso_combustivel="GERADOR",
        )

        invalid = self.client.post(
            "/api/afetacoes",
            json={
                "origem": "STOCK",
                "data": "2026-03-18",
                "id_item": fuel_catalog["id_item"],
                "quantidade": 10,
                "iva": 23,
                "obra": "Obra Combustivel",
                "fase": "Fase Combustivel",
                "uso_combustivel": "N/A",
                "processar": True,
            },
        )
        self.assertEqual(invalid.status_code, 422)
        self.assertEqual(invalid.json()["detail"], "Fuel stock consumption requires MAQUINA or GERADOR")

        valid = self.client.post(
            "/api/afetacoes",
            json={
                "origem": "STOCK",
                "data": "2026-03-18",
                "id_item": fuel_catalog["id_item"],
                "quantidade": 10,
                "iva": 23,
                "obra": "Obra Combustivel",
                "fase": "Fase Combustivel",
                "uso_combustivel": "MAQUINA",
                "processar": True,
            },
        )
        self.assertEqual(valid.status_code, 201)
        self.assertEqual(valid.json()["uso_combustivel"], "MAQUINA")

    def test_sync_retry_marks_pending_when_supabase_fails(self) -> None:
        container = self.app.state.container
        container.supabase.fail_entities.add("faturas_itens")

        response = self.client.post("/api/sync/faturas-itens", json={"rows": [{"id_item_fatura": "FIT-000001"}]})
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["pending_retry"])

        status = self.client.get("/api/sync/status").json()
        faturas_itens_job = next(job for job in status["jobs"] if job["entity"] == "faturas_itens")
        self.assertTrue(faturas_itens_job["pending_retry"])

        container.supabase.fail_entities.clear()
        retry = self.client.post("/api/sync/retry")
        self.assertEqual(retry.status_code, 200)
        retried_job = next(job for job in retry.json()["jobs"] if job["entity"] == "faturas_itens")
        self.assertFalse(retried_job["pending_retry"])

    def test_sync_status_includes_core_entities_even_without_activity(self) -> None:
        status = self.client.get("/api/sync/status")
        self.assertEqual(status.status_code, 200)
        entities = [job["entity"] for job in status.json()["jobs"]]
        self.assertEqual(
            entities,
            ["faturas", "faturas_itens", "materiais_cad", "materiais_referencias", "afetacoes_obra", "materiais_mov"],
        )

    def test_stock_and_diagnostics_endpoints(self) -> None:
        fatura = self._create_fatura("003")
        self._create_item(fatura["id_fatura"], destino="STOCK")

        stock_list = self.client.get("/api/stock-atual")
        self.assertEqual(stock_list.status_code, 200)
        self.assertTrue(any(item["id_item"] == self.catalog["id_item"] for item in stock_list.json()))

        movimentos = self.client.get("/api/materiais-mov")
        self.assertEqual(movimentos.status_code, 200)
        self.assertGreaterEqual(len(movimentos.json()), 1)

        diagnostics = self.client.get("/api/sync/diagnostics")
        self.assertEqual(diagnostics.status_code, 200)
        self.assertEqual(diagnostics.json()["source"], "google_sheets")
        self.assertEqual(len(diagnostics.json()["entities"]), 6)

    def test_work_options_endpoint_returns_obras_and_fases(self) -> None:
        fatura = self._create_fatura("004")
        self._create_item(fatura["id_fatura"], destino="CONSUMO", obra="Obra Ativa A", fase="Estrutura")
        self._create_item(fatura["id_fatura"], destino="CONSUMO", obra="Obra Ativa B", fase="Acabamentos")

        response = self.client.get("/api/options/obras-fases")
        self.assertEqual(response.status_code, 200)
        obras = response.json()["obras"]
        by_obra = {entry["obra"]: entry for entry in obras}
        self.assertIn("Obra Ativa A", by_obra)
        self.assertIn("Obra Ativa B", by_obra)
        self.assertIn("Estrutura", by_obra["Obra Ativa A"]["fases"])
        self.assertIn("Acabamentos", by_obra["Obra Ativa B"]["fases"])

    def test_patch_invoice_item_reconciles_generated_records(self) -> None:
        fatura = self._create_fatura("005")
        item = self._create_item(fatura["id_fatura"], destino="STOCK")

        response = self.client.patch(
            f"/api/faturas/{fatura['id_fatura']}/itens/{item['id_item_fatura']}",
            json={
                "destino": "CONSUMO",
                "obra": "Obra C",
                "fase": "Acabamentos",
                "quantidade": 40,
                "custo_unit": 0.2,
            },
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["destino"], "CONSUMO")

        detail = self.client.get(f"/api/faturas/{fatura['id_fatura']}").json()
        self.assertEqual(detail["items"][0]["destino"], "CONSUMO")

        afetacoes = self.client.get("/api/afetacoes").json()
        self.assertEqual(len(afetacoes), 1)
        self.assertEqual(afetacoes[0]["origem"], "FATURA_DIRETA")
        self.assertEqual(afetacoes[0]["obra"], "Obra C")

        movimentos = self.client.get("/api/materiais-mov").json()
        self.assertEqual(len(movimentos), 1)
        self.assertEqual(movimentos[0]["source_type"], "AFO")

    def test_delete_invoice_item_cleans_generated_records(self) -> None:
        fatura = self._create_fatura("006")
        item = self._create_item(fatura["id_fatura"], destino="CONSUMO", obra="Obra D", fase="Estrutura")

        response = self.client.delete(f"/api/faturas/{fatura['id_fatura']}/itens/{item['id_item_fatura']}")
        self.assertEqual(response.status_code, 204)

        detail = self.client.get(f"/api/faturas/{fatura['id_fatura']}").json()
        self.assertEqual(detail["items"], [])
        self.assertEqual(self.client.get("/api/afetacoes").json(), [])
        self.assertEqual(self.client.get("/api/materiais-mov").json(), [])

    def test_patch_catalog_updates_dependents_and_delete_is_blocked(self) -> None:
        fatura = self._create_fatura("007")
        self._create_item(fatura["id_fatura"], destino="STOCK")

        patch = self.client.patch(
            f"/api/materiais-cad/{self.catalog['id_item']}",
            json={
                "item_oficial": "Prego Zincado 30 Atualizado",
                "unidade": "CX",
            },
        )
        self.assertEqual(patch.status_code, 200)

        detail = self.client.get(f"/api/faturas/{fatura['id_fatura']}").json()
        self.assertEqual(detail["items"][0]["item_oficial"], "Prego Zincado 30 Atualizado")
        self.assertEqual(detail["items"][0]["unidade"], "CX")

        movimentos = self.client.get("/api/materiais-mov").json()
        self.assertEqual(movimentos[0]["item_oficial"], "Prego Zincado 30 Atualizado")
        self.assertEqual(movimentos[0]["unidade"], "CX")

        delete = self.client.delete(f"/api/materiais-cad/{self.catalog['id_item']}")
        self.assertEqual(delete.status_code, 422)
        self.assertEqual(delete.json()["detail"], "CATALOGO_REFERENCIADO")

    def test_patch_and_delete_manual_afetacao_reconciles_movement(self) -> None:
        fatura = self._create_fatura("008")
        self._create_item(fatura["id_fatura"], destino="STOCK")

        afetacao = self.client.post(
            "/api/afetacoes",
            json={
                "origem": "STOCK",
                "data": "2026-03-18",
                "id_item": self.catalog["id_item"],
                "quantidade": 10,
                "iva": 23,
                "obra": "Obra B",
                "fase": "Fase 2",
                "processar": True,
            },
        ).json()

        patch = self.client.patch(
            f"/api/afetacoes/{afetacao['id_afetacao']}",
            json={
                "quantidade": 15,
                "obra": "Obra Corrigida",
                "fase": "Fase Corrigida",
            },
        )
        self.assertEqual(patch.status_code, 200)
        self.assertEqual(patch.json()["obra"], "Obra Corrigida")

        stock = self.client.get(f"/api/stock-atual/{self.catalog['id_item']}").json()
        self.assertEqual(stock["stock_atual"], 85)

        delete = self.client.delete(f"/api/afetacoes/{afetacao['id_afetacao']}")
        self.assertEqual(delete.status_code, 204)
        stock_after_delete = self.client.get(f"/api/stock-atual/{self.catalog['id_item']}").json()
        self.assertEqual(stock_after_delete["stock_atual"], 100)

    def test_delete_fatura_cascades_children(self) -> None:
        fatura = self._create_fatura("009")
        self._create_item(fatura["id_fatura"], destino="CONSUMO", obra="Obra Z", fase="Fase Z")

        delete = self.client.delete(f"/api/faturas/{fatura['id_fatura']}")
        self.assertEqual(delete.status_code, 204)
        self.assertEqual(self.client.get("/api/faturas").json(), [])
        self.assertEqual(self.client.get("/api/afetacoes").json(), [])
        self.assertEqual(self.client.get("/api/materiais-mov").json(), [])

    def test_sync_diagnostics_reports_field_mismatch(self) -> None:
        fatura = self._create_fatura("010")
        container = self.app.state.container
        current = container.state.faturas[str(fatura["id_fatura"])]
        container.google_sheets.load_snapshot = lambda: {
            "faturas": [{**current, "fornecedor": "Fornecedor Divergente", "sheet_row_num": 7}],
            "faturas_itens": [],
            "materiais_cad": [],
            "materiais_referencias": [],
            "afetacoes_obra": [],
            "materiais_mov": [],
        }

        diagnostics = self.client.get("/api/sync/diagnostics")
        self.assertEqual(diagnostics.status_code, 200)
        faturas_diag = next(entity for entity in diagnostics.json()["entities"] if entity["entity"] == "faturas")
        self.assertFalse(faturas_diag["matches"])
        self.assertEqual(faturas_diag["field_mismatch_count"], 1)
        self.assertEqual(faturas_diag["field_mismatches"][0]["id"], str(fatura["id_fatura"]))
        self.assertIn("fornecedor", faturas_diag["field_mismatches"][0]["fields"])


if __name__ == "__main__":
    unittest.main()
