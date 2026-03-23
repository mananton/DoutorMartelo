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
        description="Backfill missing financial totals on legacy CONSUMO rows in MATERIAIS_MOV.",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Write the recovered totals back to Google Sheets and Supabase. Default is dry-run.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Limit how many candidate CONSUMO rows are selected from the report or updated.",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Print the report as JSON instead of human-readable text.",
    )
    return parser


def print_report(report: dict[str, object]) -> None:
    print("== Backfill CONSUMO Movement Totals ==")
    print(f"- Mode: {'APPLY' if report['applied'] else 'DRY-RUN'}")
    print(f"- MATERIAIS_MOV rows scanned: {report['scanned_rows']}")
    print(f"- Candidates found: {report['candidate_count_total']}")
    print(f"- Candidates selected: {report['candidate_count_selected']}")
    print(f"- Rows updated: {report['updated_count']}")
    print(f"- Unresolved rows: {report['unresolved_count']}")

    candidates = report.get("candidates_preview") or []
    if candidates:
        print("\nCandidates preview:")
        for candidate in candidates:
            print(
                f"- {candidate['id_mov']} ({candidate.get('source_type') or '-'}:{candidate.get('source_id') or '-'}) "
                f"| missing {', '.join(candidate['missing_fields'])} "
                f"| sem IVA {candidate['updated']['custo_total_sem_iva']} "
                f"| IVA {candidate['updated']['iva']} "
                f"| com IVA {candidate['updated']['custo_total_com_iva']}"
            )

    unresolved = report.get("unresolved_preview") or []
    if unresolved:
        print("\nUnresolved preview:")
        for candidate in unresolved:
            print(
                f"- {candidate['id_mov']} ({candidate.get('source_type') or '-'}:{candidate.get('source_id') or '-'}) "
                f"| missing {', '.join(candidate['missing_fields'])}"
            )

    if not report["applied"]:
        print("\nNo changes were written. Run again with --apply to persist the selected rows.")


def main() -> int:
    args = build_parser().parse_args()
    container = ServiceContainer()
    report = container.materials.backfill_incomplete_consumo_movement_totals(
        apply=args.apply,
        limit=args.limit,
    )

    if args.json:
        print(json.dumps(report, default=str, indent=2, ensure_ascii=False))
    else:
        print_report(report)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
