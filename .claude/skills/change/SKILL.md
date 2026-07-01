---
name: change
description: Orientation before editing Umaplay code — which docs to scan FIRST (by change type) so you learn the architecture, conventions, and the exact code paths before opening source. Use at the START of any non-trivial change, before reading code. Pair with /post-change at the end.
---

# Before you change code (Umaplay)

Docs here are the map; read them before the code. They name the real code paths,
so scanning the right doc first turns a blind code search into a targeted read.
Do this before writing anything.

## Always read first (any change)

1. `docs/ai/SYSTEM_OVERVIEW.md` — architecture, module layout, how perception →
   actions → controllers fit together.
2. `docs/ai/CONTRIBUTING.md` — conventions (incl. the notebook-prototyping workflow).

Then jump to the row(s) below that match your change. Read the doc, follow its
code-path references, *then* open the source.

## Route by what you're changing

| Change area | Scan these docs first |
|---|---|
| An action/flow class (`core/actions/*.py`) | `docs/ai/features/actions/README.md` (flow index + how they relate) → the specific `…-flow.md`; then `docs/ai/SOPs/waiter-usage-and-integration.md` for the perception/click (`Waiter`, YOLO+OCR) patterns |
| Scenario lobby / training / scoring logic (`core/actions/<scenario>/…`) | `docs/ai/policies/<scenario>/flow_lobby.mmd`, `flow_training.mmd`, `flow_scoring_system.mmd`, `notes.txt` (thresholds/bins) + `docs/ai/SOPs/towards-custom-training-policy-graph.md` |
| Adding a whole new scenario | `docs/ai/SOPs/adding-new-scenario.md` |
| Config/settings crossing web ↔ Python | `docs/ai/SOPs/sop-config-back-front.md` |
| Web preset UI / tab groups (`web/`) | `docs/ai/SOPs/sop-presets-tab-groups.md` |
| Events / dataset scraping pipeline | `docs/ai/SOPs/events-scrappers-context.md` + `README.dev.md` |
| Race scheduling | `docs/ai/features/race_scheduler_architecture.md` |
| Character goals | `docs/ai/features/character-goal-system.md` |
| Run history | `docs/ai/features/run-history.md` |
| Training scan/scoring internals | `docs/ai/features/actions/training-scan.md`, `training-policy.md` |

## Larger / net-new features

Check `docs/ai/plans/` and any `docs/ai/features/<feature>/PLAN.md` + `RESEARCH.md`
pair — prior design and rationale for a feature often already live there. Don't
re-derive a decision that's already written down.

## Reading game-screen flows without scanning images

For screen-by-screen UI flows, the ASCII transcriptions under
`docs/ai/features/actions/images/**/gemini ascii response.md` describe each screen
(layout, button colors, intended taps). Read those instead of the raw screenshots —
cheaper and usually enough. The YOLO class list is baked into `models/*.pt`, not a
text file; extract it from the model when you need to confirm a detection class.

## Then

Implement against the patterns you just read (reuse existing `nav`/`Waiter`
helpers over new code). When done, run **/post-change** to update docs and verify.
