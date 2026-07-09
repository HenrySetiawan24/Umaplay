# Policy Diagrams

Mermaid flowcharts diagramming the per-scenario **lobby routing**, **SV
scoring**, and **training decision** logic in
[`core/actions/<scenario>/`](../../../core/actions/) — the visual
counterpart to the prose/table reference in
[`training-scan.md`](../features/actions/training-scan.md), which is the
**source of truth** for the actual thresholds and decision order. Every
`.mmd` file here must stay in sync with it (each carries a `%% Must stay in
sync with training-scan.md` comment as a reminder).

## Per-scenario diagrams

| Scenario | Lobby routing | Training decision | SV scoring |
|---|---|---|---|
| URA | [`ura/flow_lobby.mmd`](ura/flow_lobby.mmd) | [`ura/flow_training.mmd`](ura/flow_training.mmd) | [`ura/flow_scoring_system.mmd`](ura/flow_scoring_system.mmd) |
| Unity Cup | [`unity_cup/flow_lobby.mmd`](unity_cup/flow_lobby.mmd) | [`unity_cup/flow_training.mmd`](unity_cup/flow_training.mmd) | [`unity_cup/flow_scoring_system.mmd`](unity_cup/flow_scoring_system.mmd) |

Each pair of scenario diagrams should be structurally parallel (same node
shape/order) wherever the underlying code is — check the other scenario's
diagram when one looks incomplete; a missing branch is more likely a stale
diagram than a real behavioral difference. (This happened: `unity_cup/flow_lobby.mmd`
was missing the infirmary pre-check and PAL-recreation energy-gate branches
that `ura/flow_lobby.mmd` had, even though `core/actions/unity_cup/lobby.py`
has both — fixed 2026-07.)

Diagrams are maintained via the `/doc-policy-scenario` Windsurf workflow
(`.windsurf/workflows/doc-policy-scenario.md`), which derives them from code
and keeps them ASCII-only/parse-safe. It does **not** regenerate prose
thresholds into a `notes.txt` anymore — `training-scan.md` owns that.

## Other files

- [`unity_cup/agent-notes.md`](unity_cup/agent-notes.md) — Unity Cup
  **agent-loop** engineering changelog (`core/actions/unity_cup/agent.py`
  timing/navigation fixes: showdown pacing, race-day banner advance, result-
  screen walk, opponent-selection fallback). **Not** a training/lobby
  decision reference — see the diagrams above and `training-scan.md` for that.
  URA has no equivalent file.

## See also

- [`docs/ai/INDEX.md`](../INDEX.md) — full documentation sitemap.
- [`docs/ai/features/actions/training-scan.md`](../features/actions/training-scan.md) —
  prose source of truth for SV scoring + the training decision tree.
- [`docs/ai/SOPs/towards-custom-training-policy-graph.md`](../SOPs/towards-custom-training-policy-graph.md) —
  maintaining `core/policy/`, a code-level mirror of the same decision tree
  used by the web policy editor.
