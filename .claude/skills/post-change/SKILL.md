---
name: post-change
description: Post-change checklist for the Umaplay repo — run after editing code to update the right docs, verify with the correct commands (ruff, pytest, catalog/web builds), report honestly, and commit per repo rules. Use whenever you have finished a code change and are about to wrap up, or when the user asks to "wrap up", "verify", "finish this", or "what's left".
---

# Post-change checklist (Umaplay)

Run this after making a code change, before declaring done. Do the steps that
apply; skip (and say you skipped) the ones that don't. Never claim a step passed
that you didn't actually run.

## 0. Workspace hygiene (before AND after)

- Keep the git workspace clean. If there is **pre-existing uncommitted tracked
  work** unrelated to your change, commit it first, then start editing.
- **Never stage or commit these stray files** (they live untracked on purpose):
  `.tmp_verify_formula.py`, `dev_claw.ipynb`, `oguri capper.json`, and the
  `docs/ai/features/actions/images/daily - legend - trials/` source folder.
- Put throwaway scripts in the scratchpad dir, not the repo.

## 1. Update the docs that match what you changed

Map the code you touched to its doc and update it in the same change:

| You changed… | Update… |
|---|---|
| A `core/actions/*.py` flow class | its `docs/ai/features/actions/<flow>.md` **and** the tables + flow-map in `docs/ai/features/actions/README.md` |
| Scenario lobby/training/scoring logic (`core/actions/<scenario>/…`) | `docs/ai/policies/<scenario>/*.mmd` + `notes.txt` (ASCII-only, parse-safe Mermaid — see `.windsurf/workflows/doc-policy-scenario.md`) |
| A new `Settings` / nav-pref | document the key, default, and getter in the relevant feature doc |
| Dataset / event pipeline | `README.dev.md` if the workflow changed |

Drop stale "planned / not yet implemented" banners once the code lands. Keep flow
docs findable by method name (line numbers drift).

## 2. Verify (use the repo's real tooling)

Run only what's relevant to the files you touched:

- **Lint (Python):** `ruff check <changed .py files>` (config: `ruff.toml`).
  Fix warnings in files you touched, including dead imports you introduced.
- **Tests (Python):** `pytest tests/ -q` — or target the relevant file
  (`pytest tests/test_turns.py -q`). There is also root `test_backward_compatibility.py`.
- **Import/syntax smoke:** if heavy deps (torch/paddle/ultralytics) block a real
  import, fall back to an AST parse:
  `python -c "import ast; ast.parse(open('path.py',encoding='utf-8').read())"`.
- **Catalog rebuild:** only if you changed `datasets/in_game/events.json` or the
  scraper → `python build_catalog.py` (and `python -m json.tool` the JSON first).
- **Web UI:** only if you touched `web/` → `cd web && npm run build`
  (`tsc -b && vite build`) and/or `npm run lint`.

If a tool isn't installed in the environment, say so — don't imply it passed.

## 3. Report honestly

State per check: passed / failed (with the output) / skipped (with why). Call out
the riskiest part of the change and what a live run should watch. If something is
done and verified, say so plainly; don't hedge.

## 4. Commit (only when asked, or when the user's workflow expects it)

- Don't commit unless the user asked or it's clearly expected; when unsure, offer.
- If on `main`, branch first.
- Stage only the files for this change — never the stray files in step 0.
- End the commit message with:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
