from __future__ import annotations

import os
from pathlib import Path
import shutil
import unittest

from fastapi.testclient import TestClient

from backend.app.main import create_app


class OperationalServingTests(unittest.TestCase):
    def setUp(self) -> None:
        self._previous_env = {
            "BACKEND_DISABLE_LIVE_ADAPTERS": os.environ.get("BACKEND_DISABLE_LIVE_ADAPTERS"),
            "BACKOFFICE_FRONTEND_DIST_DIR": os.environ.get("BACKOFFICE_FRONTEND_DIST_DIR"),
            "BACKOFFICE_DISABLE_FRONTEND_SERVING": os.environ.get("BACKOFFICE_DISABLE_FRONTEND_SERVING"),
        }
        os.environ["BACKEND_DISABLE_LIVE_ADAPTERS"] = "1"
        os.environ.pop("BACKOFFICE_DISABLE_FRONTEND_SERVING", None)

    def tearDown(self) -> None:
        for key, value in self._previous_env.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value

    def test_backend_serves_frontend_dist_and_keeps_api_routes(self) -> None:
        dist_dir = Path(__file__).resolve().parents[2] / "data" / "test-operational-dist"
        if dist_dir.exists():
            shutil.rmtree(dist_dir)
        (dist_dir / "assets").mkdir(parents=True, exist_ok=True)
        (dist_dir / "index.html").write_text("<html><body>materials backoffice operational</body></html>", encoding="utf-8")
        (dist_dir / "assets" / "app.js").write_text("console.log('ok')", encoding="utf-8")
        os.environ["BACKOFFICE_FRONTEND_DIST_DIR"] = str(dist_dir)

        try:
            app = create_app()
            client = TestClient(app)

            index = client.get("/")
            self.assertEqual(index.status_code, 200)
            self.assertIn("materials backoffice operational", index.text)

            deep_link = client.get("/faturas/FAT-000001")
            self.assertEqual(deep_link.status_code, 200)
            self.assertIn("materials backoffice operational", deep_link.text)

            asset = client.get("/assets/app.js")
            self.assertEqual(asset.status_code, 200)
            self.assertIn("console.log", asset.text)

            api = client.get("/api/faturas")
            self.assertEqual(api.status_code, 200)
            self.assertEqual(api.json(), [])
        finally:
            if dist_dir.exists():
                shutil.rmtree(dist_dir)


if __name__ == "__main__":
    unittest.main()
