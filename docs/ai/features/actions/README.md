# Action Flows

Per-screen automation classes under [`core/actions/`](../../../../core/actions/). Each
"flow" owns one game screen/task and is constructed once (from `agent_nav.py` or
`agent_scenario.py`) with the same perception trio `(ctrl, ocr, yolo_engine, waiter)`.

## Flow classes

| Doc | Class | File | Screen / task |
|-----|-------|------|---------------|
| [lobby-flow.md](lobby-flow.md) | `LobbyFlow` (abstract) | `lobby.py` | Career hub — state, per-turn decision; hub for the others |
| [race-flow.md](race-flow.md) | `RaceFlow` | `race.py` | Career race-day: select → skip → results → next/retry |
| [skills-flow.md](skills-flow.md) | `SkillsFlow` | `skills.py` | Skill shop buying loop |
| [event-flow.md](event-flow.md) | `EventFlow` | `events.py` | Event choice popups |
| [daily-race-flow.md](daily-race-flow.md) | `DailyRaceFlow` | `daily_race.py` | Daily (coins/SP) races outside career |
| [daily-legend-race-flow.md](daily-legend-race-flow.md) | `DailyLegendRaceFlow` *(planned)* | `daily_race.py` | Daily Legend Races — pick opponent, 1 race per ticket |
| [training-scan.md](training-scan.md) | *(functions)* | `training_check.py` | Training tile scan → per-tile SV scoring |
| [training-policy.md](training-policy.md) | *(functions)* | `training_policy.py` | Orchestrates scan→score→decide; `TrainingDecision` |
| [team-trials-flow.md](team-trials-flow.md) | `TeamTrialsFlow` | `team_trials.py` | Weekly Team Trials race mode (non-career) |

> `training_check.py` and `training_policy.py` are **not** Flow classes — they are
> stateless helpers the lobby calls each non-race turn. `training-scan.md` covers the
> full scan→compute→decide pipeline; `training-policy.md` focuses on the
> orchestrator layer and `TrainingDecision`.
>
> Same Flow pattern, not yet documented: `RouletteFlow` (`roulette.py`).

## How they relate

```
LobbyFlow.process_turn()               ← every career turn
  ├─ check_training() → training-policy.md   (orchestrates scan→decide)
  │     └─ scan_training_screen → training-scan.md
  ├─ RaceFlow.run()   → race-flow.md          (when racing)
  ├─ EventFlow        → event-flow.md          (on event popups)
  └─ SkillsFlow.buy   → skills-flow.md         (when SP gate clears)

agent_nav → DailyRaceFlow        → daily-race-flow.md         (coins/SP, implemented)
agent_nav → DailyLegendRaceFlow  → daily-legend-race-flow.md  (legend, planned)
agent_nav → TeamTrialsFlow       → team-trials-flow.md        (weekly trials)
```

## Images

Screenshots live in [`images/`](images/). Already present (reused from
`debug/race/placement/race flow/`):

- `race-after-skip-pose-win.png`, `race-after-skip-pose-loss.png`
- `race-leaderboard-no-next.png`, `race-leaderboard-with-next.png`

### Images still needed

Drop these into `images/` (filenames are referenced as placeholders in each doc).
Annotated screenshots are ideal but raw captures are fine.

**daily-race-flow** — `daily-race-menu.png`, `daily-race-rows.png`, `daily-race-results.png`
**daily-legend-race-flow** — `daily-legend-lobby.png`, `daily-legend-opponent-grid.png`, `daily-legend-result.png`
**event-flow** — `event-support-choices.png`, `event-chain-arrows.png`, `event-unitycup-team.png`
**lobby-flow** — `lobby-main.png`, `lobby-recreation-rows.png`, `lobby-goal-text.png`
**skills-flow** — `skills-shop-cards.png`, `skills-sp-region.png`, `skills-inactive-card.png`
**training-scan** — `training-tiles.png`, `training-tile-supports.png`, `training-rainbow.png`

Several of these likely already exist under `debug/` (`debug/skills/`,
`debug/training/`, `debug/agent_nav/`) — point me at good frames and I'll copy +
reference them instead.
