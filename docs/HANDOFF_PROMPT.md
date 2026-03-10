# Handoff Prompt (Copy/Paste for New Chat)

Use this prompt when starting a new agent session:

```text
Project: GAS Construction Dashboard

Please read these files first, in order:
1) docs/PROJECT_STATE.md
2) docs/DECISIONS.md
3) docs/WORKLOG.md
4) docs/OPEN_ITEMS.md
5) docs/REGRAS_DE_NEGOCIO.md

Hard constraints:
- Do NOT rename global constants (SHEET_REGISTOS, etc.).
- Do NOT change Supabase sync structure unless explicitly asked.
- Keep legacy data handling rules active.
- Work in safe, incremental phases and commit each phase.

Current focus for this session:
[Describe the exact task here]

Expected output format:
- Findings first (if debugging/review).
- Then implementation plan in safe phases.
- Then applied changes + affected files + commit hash.
```

## Optional Session Starter Checklist
- Confirm current branch and latest commit.
- Confirm `git status` is clean before starting.
- Confirm if user wants commit at each phase or single final commit.

## Recent High-Value Commits
- `7ab59ac`: mobile-first Obra chart updates + phase visibility filters + click side-effect removal.
- `76e5253`: worker filtering includes cost-only legacy days.
- `b725a8d`: Obra phase chart metric/type controls.
- `299536d`: collapsible Workers/Materials sections.
