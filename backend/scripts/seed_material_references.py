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
        description="Seed MATERIAIS_REFERENCIAS from existing FATURAS_ITENS without touching MATERIAIS_CAD.",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Write the new references to Google Sheets and Supabase. Default is dry-run.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Limit how many candidate references are selected from the dry-run report or applied.",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Print the report as JSON instead of human-readable text.",
    )
    return parser


def print_report(report: dict[str, object]) -> None:
    print("== Seed Material References ==")
    print(f"- Mode: {'APPLY' if report['applied'] else 'DRY-RUN'}")
    print(f"- FATURAS_ITENS scanned: {report['scanned_rows']}")
    print(f"- Missing description rows: {report['skipped_missing_description']}")
    print(f"- Missing ID_Item rows: {report['skipped_missing_mapping']}")
    print(f"- Missing catalog item rows: {report['skipped_missing_catalog']}")
    print(f"- Already covered by existing references: {report['existing_reference_matches']}")
    print(f"- Conflicts detected: {report['conflicts']}")
    print(f"- Candidate references found: {report['candidate_count_total']}")
    print(f"- Candidate references selected: {report['candidate_count_selected']}")
    print(f"- References created: {report['created_count']}")

    candidates = report.get("candidates_preview") or []
    if candidates:
        print("\nCandidates preview:")
        for candidate in candidates:
            print(
                f"- {candidate['descricao_original']} -> {candidate['id_item']} "
                f"(source items: {', '.join(candidate['source_item_ids'])})"
            )

    conflicts = report.get("conflicts_preview") or []
    if conflicts:
        print("\nConflicts preview:")
        for conflict in conflicts:
            conflict_id_items = conflict.get("id_items")
            if isinstance(conflict_id_items, list):
                id_items_repr = ", ".join(str(item) for item in conflict_id_items)
            else:
                id_items_repr = f"{conflict.get('existing_id_item')} vs {conflict.get('id_item')}"
            print(
                f"- {conflict['descricao_original']} -> {id_items_repr} "
                f"[{conflict.get('conflict', 'CONFLICT')}]"
            )

    if not report["applied"]:
        print("\nNo changes were written. Run again with --apply to persist the selected references.")


def main() -> int:
    args = build_parser().parse_args()
    container = ServiceContainer()
    report = container.materials.seed_catalog_references_from_invoice_items(apply=args.apply, limit=args.limit)

    if args.json:
        print(json.dumps(report, default=str, indent=2, ensure_ascii=False))
    else:
        print_report(report)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
