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
        self.catalog = self.client.post(
            "/api/materiais-cad",
            json={
                "fornecedor": "Fornecedor Base",
                "descricao_original": "Prego 30",
                "item_oficial": "Prego Zincado 30",
                "natureza": "MATERIAL",
                "unidade": "UN",
            },
        ).json()

    def tearDown(self) -> None:
        if self._previous_disable_live is None:
            os.environ.pop("BACKEND_DISABLE_LIVE_ADAPTERS", None)
        else:
            os.environ["BACKEND_DISABLE_LIVE_ADAPTERS"] = self._previous_disable_live

    def test_direct_invoice_item_generates_afetacao_and_movement(self) -> None:
        fatura = self.client.post(
            "/api/faturas",
            json={
                "fornecedor": "Fornecedor Base",
                "nif": "501234567",
                "nr_documento": "FT 2026/001",
                "data_fatura": "2026-03-18",
                "valor_sem_iva": 100,
                "iva": 23,
                "valor_com_iva": 123,
            },
        ).json()
        response = self.client.post(
            f"/api/faturas/{fatura['id_fatura']}/itens",
            json={
                "items": [
                    {
                        "descricao_original": "Prego 30",
                        "quantidade": 100,
                        "custo_unit": 0.1,
                        "iva": 23,
                        "destino": "CONSUMO",
                        "obra": "Obra A",
                        "fase": "Fase 1",
                        "id_item": self.catalog["id_item"],
                    }
                ]
            },
        )
        self.assertEqual(response.status_code, 201)
        afetacoes = self.client.get("/api/afetacoes").json()
        self.assertEqual(len(afetacoes), 1)
        self.assertEqual(afetacoes[0]["origem"], "FATURA_DIRETA")

    def test_stock_entry_then_manual_afetacao_uses_average_cost(self) -> None:
        fatura = self.client.post(
            "/api/faturas",
            json={
                "fornecedor": "Fornecedor Base",
                "nif": "501234567",
                "nr_documento": "FT 2026/002",
                "data_fatura": "2026-03-18",
                "valor_sem_iva": 100,
                "iva": 23,
                "valor_com_iva": 123,
            },
        ).json()
        create_item = self.client.post(
            f"/api/faturas/{fatura['id_fatura']}/itens",
            json={
                "items": [
                    {
                        "descricao_original": "Prego 30",
                        "quantidade": 100,
                        "custo_unit": 0.1,
                        "iva": 23,
                        "destino": "STOCK",
                        "id_item": self.catalog["id_item"],
                    }
                ]
            },
        )
        self.assertEqual(create_item.status_code, 201)

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

    def test_sync_retry_marks_pending_when_supabase_fails(self) -> None:
        container = self.app.state.container
        container.supabase.fail_entities.add("faturas_itens")

        response = self.client.post("/api/sync/faturas-itens", json={"rows": [{"id_item_fatura": "FIT-000001"}]})
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["pending_retry"])

        status = self.client.get("/api/sync/status").json()
        self.assertTrue(status["jobs"][0]["pending_retry"])

        container.supabase.fail_entities.clear()
        retry = self.client.post("/api/sync/retry")
        self.assertEqual(retry.status_code, 200)
        self.assertFalse(retry.json()["jobs"][0]["pending_retry"])


if __name__ == "__main__":
    unittest.main()
