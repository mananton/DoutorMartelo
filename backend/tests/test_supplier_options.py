from __future__ import annotations

import os
import unittest

from fastapi.testclient import TestClient

from backend.app.main import create_app


class SupplierOptionsApiTests(unittest.TestCase):
    def setUp(self) -> None:
        self._previous_disable_live = os.environ.get("BACKEND_DISABLE_LIVE_ADAPTERS")
        os.environ["BACKEND_DISABLE_LIVE_ADAPTERS"] = "1"
        self.app = create_app()
        self.client = TestClient(self.app)

    def tearDown(self) -> None:
        if self._previous_disable_live is None:
            os.environ.pop("BACKEND_DISABLE_LIVE_ADAPTERS", None)
        else:
            os.environ["BACKEND_DISABLE_LIVE_ADAPTERS"] = self._previous_disable_live

    def test_supplier_options_derive_from_runtime_faturas(self) -> None:
        create = self.client.post(
            "/api/faturas",
            json={
                "fornecedor": "Fornecedor Base",
                "nif": "501234567",
                "nr_documento": "FT 2026/001",
                "data_fatura": "2026-03-19",
                "valor_sem_iva": 100,
                "iva": 23,
                "valor_com_iva": 123,
            },
        )
        self.assertEqual(create.status_code, 201)
        self.app.state.container._supplier_options_cache = None

        response = self.client.get("/api/options/fornecedores")
        self.assertEqual(response.status_code, 200)

        fornecedores = response.json()["fornecedores"]
        match = next((item for item in fornecedores if item["fornecedor"] == "Fornecedor Base"), None)
        self.assertIsNotNone(match)
        assert match is not None
        self.assertEqual(match["nif"], "501234567")

    def test_vehicle_options_use_live_adapter_when_available(self) -> None:
        container = self.app.state.container
        container.google_sheets.load_vehicle_options = lambda: [
            {"veiculo": "Carrinha Oficina", "matricula": "11-AA-22"},
            {"veiculo": "Mini Giratoria", "matricula": "33-BB-44"},
        ]
        container._vehicle_options_cache = None

        response = self.client.get("/api/options/veiculos")
        self.assertEqual(response.status_code, 200)
        veiculos = response.json()["veiculos"]
        self.assertEqual(len(veiculos), 2)
        self.assertEqual(veiculos[0]["matricula"], "11-AA-22")
