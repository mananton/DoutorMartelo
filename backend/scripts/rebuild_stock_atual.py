from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.app.api.deps import ServiceContainer


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Rebuild STOCK_ATUAL from the current materials backoffice runtime.",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Write the rebuilt STOCK_ATUAL rows to Google Sheets and Supabase. Default is dry-run.",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Print the report as JSON instead of human-readable text.",
    )
    return parser


def print_report(report: dict[str, object]) -> None:
    print("== Rebuild STOCK_ATUAL ==")
    print(f"- Mode: {'APPLY' if report['applied'] else 'DRY-RUN'}")
    print(f"- Rows selected from runtime: {report['rows_selected']}")
    print(f"- Existing rows in sheet: {report['existing_rows']}")
    print(f"- Stale rows to remove: {report['stale_count']}")
    print(f"- Rows deleted: {report['deleted_count']}")

    stale_ids = report.get("stale_id_items") or []
    if stale_ids:
        print("\nStale IDs:")
        for item_id in stale_ids[:20]:
            print(f"- {item_id}")

    preview = report.get("preview") or []
    if preview:
        print("\nPreview:")
        for row in preview:
            print(
                f"- {row['id_item']} | {row.get('item_oficial') or '-'} | "
                f"{row.get('stock_atual')} {row.get('unidade') or ''} | "
                f"custo medio {row.get('custo_medio_atual')}"
            )

    if not report["applied"]:
        print("\nNo changes were written. Run again with --apply to rebuild the sheet.")


def main() -> int:
    args = build_parser().parse_args()
    container = ServiceContainer()
    report = container.materials.rebuild_stock_atual_snapshot(apply=args.apply)

    if args.json:
        print(json.dumps(report, default=str, indent=2, ensure_ascii=False))
    else:
        print_report(report)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
