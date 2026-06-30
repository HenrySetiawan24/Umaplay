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
| [daily-race-flow.md](daily-race-flow.md) | `DailyRaceFlow` | `daily_race.py` | Daily (RP) races outside career |
| [training-scan.md](training-scan.md) | *(functions)* | `training_check.py` + `training_policy.py` | Training tile scan → score → decide |

> `training_check.py` and `training_policy.py` are **not** Flow classes — they're the
> stateless scan + decision helpers the lobby calls each non-race turn. Both are
> covered by [training-scan.md](training-scan.md).
>
> Same Flow pattern, not in this set: `RouletteFlow` (`roulette.py`),
> `TeamTrialsFlow` (`team_trials.py`).

## How they relate

```
LobbyFlow.process_turn()            ← every career turn
  ├─ training scan  → training-scan.md   (train / rest / race decision)
  ├─ RaceFlow.run() → race-flow.md       (when racing)
  ├─ EventFlow      → event-flow.md       (on event popups)
  └─ SkillsFlow.buy → skills-flow.md      (when SP gate clears)

agent_nav → DailyRaceFlow → daily-race-flow.md   (separate, non-career)
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
**event-flow** — `event-support-choices.png`, `event-chain-arrows.png`, `event-unitycup-team.png`
**lobby-flow** — `lobby-main.png`, `lobby-recreation-rows.png`, `lobby-goal-text.png`
**skills-flow** — `skills-shop-cards.png`, `skills-sp-region.png`, `skills-inactive-card.png`
**training-scan** — `training-tiles.png`, `training-tile-supports.png`, `training-rainbow.png`

Several of these likely already exist under `debug/` (`debug/skills/`,
`debug/training/`, `debug/agent_nav/`) — point me at good frames and I'll copy +
reference them instead.
