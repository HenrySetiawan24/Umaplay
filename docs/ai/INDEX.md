# docs/ai — Documentation Sitemap

Full map of `docs/ai/`. If you're starting from a feature description that
doesn't map cleanly to a row in `.claude/skills/change/SKILL.md`'s
change-area table, start here, find the closest section below, then drill
into that folder's own README/index.

## Always read first

- [`SYSTEM_OVERVIEW.md`](SYSTEM_OVERVIEW.md) — architecture, module layout,
  how perception → actions → controllers fit together.
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — conventions, including the
  notebook-prototyping workflow.

## `features/actions/` — per-screen flow docs

One doc per `core/actions/*.py` class/module, 1:1. Start at
[`features/actions/README.md`](features/actions/README.md) — it has the full
table (flow → class → file → screen) and a diagram of how the flows call
into each other. Covers: lobby, race-day, skill shop, event popups, daily
races, daily legend races, team trials, and the training scan/scoring/decide
pipeline.

## `policies/` — per-scenario decision diagrams

Mermaid flowcharts for lobby routing / SV scoring / training decisions, per
scenario (`ura`, `unity_cup`). Start at
[`policies/README.md`](policies/README.md). The **prose source of truth**
for the same logic is
[`features/actions/training-scan.md`](features/actions/training-scan.md) —
the diagrams are the visual complement, not a second independent reference;
keep them in sync.

## `SOPs/` — operational procedures

Step-by-step checklists for repeatable, cross-cutting tasks (not tied to one
screen/class):

| SOP | Purpose |
|---|---|
| [`adding-new-scenario.md`](SOPs/adding-new-scenario.md) | Onboard a brand-new training scenario end-to-end across `core/`, `web/`, `prefs/`. |
| [`events-scrappers-context.md`](SOPs/events-scrappers-context.md) | Maintain the Gametora event-viewer HTML → JSON scraper. |
| [`sop-config-back-front.md`](SOPs/sop-config-back-front.md) | Sync a config field across the web schema/store and backend settings. |
| [`sop-presets-tab-groups.md`](SOPs/sop-presets-tab-groups.md) | Chrome-like preset tab-group UI usage/maintenance. |
| [`towards-custom-training-policy-graph.md`](SOPs/towards-custom-training-policy-graph.md) | Regenerate/publish/validate `core/policy/`'s graph mirror of `decide_action_training()`. |
| [`waiter-usage-and-integration.md`](SOPs/waiter-usage-and-integration.md) | Using/integrating the shared `Waiter` polling/click abstraction. |

## `features/` — other web/backend feature docs

Standalone features not part of the `actions/` per-screen set:

| Doc | Covers |
|---|---|
| [`features/character-goal-system.md`](features/character-goal-system.md) | Character goal scraping, backend API, character selector UI, goal markers. |
| [`features/race_scheduler_architecture.md`](features/race_scheduler_architecture.md) | Race Scheduler: pre-selecting races per turn, UI ↔ config persistence. |
| [`features/run-history.md`](features/run-history.md) | Persistent run history storage + UI (stats, per-turn actions, timestamps). |

## `features/<feature>/` — design docs for past features (PLAN.md + RESEARCH.md pairs)

Prior design/rationale — check before re-deriving a decision that's already
written down:

| Folder | Covers |
|---|---|
| [`features/button-golden-robust/`](features/button-golden-robust/) | Unity Cup: advancing through mid-confidence `button_golden`/`race_race_day` detections without stalling on Unknown screens. |
| [`features/race-synonimous-handling/`](features/race-synonimous-handling/) | Reducing mis-selection of scheduled races when multiple G1s/similar names or banners are ambiguous. |
| [`features/try-again-bug/`](features/try-again-bug/) | Hardening the post-`TRY AGAIN` retry transition so it doesn't mis-click the lobby Race button instead of View Results. |

## `plans/` — larger/net-new feature plans

| Doc | Covers |
|---|---|
| [`plans/scenario-setup-redesign.md`](plans/scenario-setup-redesign.md) | Scenario Setup tab layout redesign (moving off the 2-column layout). |
| [`plans/trackblazer_implementation_plan.md`](plans/trackblazer_implementation_plan.md) | Trackblazer (Make A New Track) — plan for a new scenario key. |

## Reading game-screen flows without scanning images

ASCII transcriptions of screenshots live under
`features/actions/images/**/gemini ascii response.md` — read those instead
of raw screenshots when documenting a screen-by-screen UI flow (layout,
button colors, intended taps); cheaper and usually sufficient.
