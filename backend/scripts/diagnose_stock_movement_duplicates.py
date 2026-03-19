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
        description="Diagnose duplicate-looking STOCK afetacao movements in MATERIAIS_MOV.",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Clear exact duplicate MATERIAIS_MOV rows when a linked canonical movement already exists. Default is dry-run.",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Print the report as JSON instead of human-readable text.",
    )
    return parser


def print_report(report: dict[str, object]) -> None:
    print("== Diagnose STOCK Movement Duplicates ==")
    print(f"- Mode: {'APPLY' if report['applied'] else 'DRY-RUN'}")
    print(f"- STOCK afetacoes scanned: {report['stock_afetacoes_scanned']}")
    print(f"- Exact duplicate groups: {report['exact_duplicate_groups']}")
    print(f"- Exact duplicate movement candidates: {report['exact_duplicate_candidates']}")
    print(f"- Context overlap groups: {report['context_overlap_groups']}")
    print(f"- Unreconciled generated afetacoes: {report['unreconciled_generated_afetacoes']}")
    print(f"- Deleted movement rows: {report['deleted_count']}")

    exact_preview = report.get("exact_duplicate_preview") or []
    if exact_preview:
        print("\nExact duplicate preview:")
        for group in exact_preview:
            print(
                f"- {group['id_afetacao']} -> canonical {group['canonical_id_mov']} | "
                f"duplicates {', '.join(group['duplicate_id_movs'])}"
            )

    context_preview = report.get("context_overlap_preview") or []
    if context_preview:
        print("\nContext overlap preview:")
        for group in context_preview:
            print(
                f"- {group['id_afetacao']} ({group['id_item']} {group['quantidade']}) -> "
                f"context rows {', '.join(group['all_context_id_movs'])}"
            )

    unreconciled_preview = report.get("unreconciled_preview") or []
    if unreconciled_preview:
        print("\nUnreconciled preview:")
        for group in unreconciled_preview:
            print(
                f"- {group['id_afetacao']} | {group['id_item']} | {group['quantidade']} | "
                f"{group['obra']} / {group['fase']} | {group['estado']}"
            )

    cleanup_ids = report.get("cleanup_id_movs") or []
    if cleanup_ids and not report["applied"]:
        print("\nNo rows were deleted. Run again with --apply to clear the exact duplicate movement rows.")


def main() -> int:
    args = build_parser().parse_args()
    container = ServiceContainer()
    report = container.materials.diagnose_stock_movement_duplicates(apply=args.apply)

    if args.json:
        print(json.dumps(report, default=str, indent=2, ensure_ascii=False))
    else:
        print_report(report)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
