# Lobby Flow

**Class:** `LobbyFlow` (abstract base) + `LobbyState` / `LobbyConfig` — [`core/actions/lobby.py`](../../../../core/actions/lobby.py)
**Concrete subclasses:** `core/actions/ura/agent.py`, `core/actions/unity_cup/agent.py`
**Constructed in:** [`core/agent_scenario.py`](../../../../core/agent_scenario.py)

`LobbyFlow` is the **career hub orchestrator** — the screen the bot returns to every
turn. It reads and maintains the run's live state (stats, energy, mood, date, goal),
then decides the per-turn action: train, race, rest, recreate, infirmary, or buy
skills. It is the most central action class; `RaceFlow`, `SkillsFlow`, and the
training scan are all invoked *from* here.

It is **abstract**: scenario-specific logic (URA vs Unity Cup) lives in the
subclasses, which implement `process_turn`, `_update_state`, and `_process_turns_left`.

Line numbers drift; methods are named so they stay findable.

---

## State: `LobbyState`

The per-turn snapshot the rest of the system reads (`player.lobby.state`):

| Field | Meaning |
|-------|---------|
| `goal` | OCR'd current goal text (used by `_maybe_do_goal_race`). |
| `energy`, `mood` | Energy %, mood as `(label, score)`. |
| `skill_pts` | Total skill points (gates the skills screen). |
| `turn`, `turns_special` | Turns remaining / special counter. |
| `career_date_raw`, `date_info` | Raw OCR date + parsed `DateInfo` (year/month/half). |
| `is_summer` | Derived summer flag. |
| `stats` | Dict `{SPD,STA,PWR,GUTS,WIT}`. |
| `planned_race_name` / `_canonical` / `_tentative` | Today's planned race, if any. |
| `pal_available` | PAL icon present near Recreation. |

`LobbyConfig` holds the YOLO/poll knobs (`imgsz`, `conf`, `iou`, poll interval,
default timeout).

## The abstract contract

Subclasses must implement:

| Method | Responsibility |
|--------|----------------|
| `process_turn()` | Evaluate the lobby and take one action. Returns an outcome string: `RACED`, `INFIRMARY`, `RESTED`, `TO_TRAINING`, `CONTINUE`, `ETC`. |
| `_update_state(img, dets)` | Populate `LobbyState` from a recognized frame. |
| `_process_turns_left(img, dets)` | Parse the turns counter. |

The base class supplies everything else — the state maintainers, the navigation
clicks, and the race pre-check logic below.

## What the base class provides

### Robust state maintainers (noise-resistant)

These exist because OCR on a live, animating screen is noisy; each one guards against
single-frame misreads:

- **`_update_stats(img, dets)`** — monotonic-ish stat updater. Accepts normal
  increases, requires *persistence* for big jumps, allows small decreases, imputes
  missing stats with the average of known ones (flagged *artificial* so a later real
  read overwrites unconditionally), and has a "suspect window" to accept a large
  downward *correction* after a bad upward spike (e.g. fixing a `103→703` misread).
  Gated by `interval_stats_refresh` but forced whenever any stat is still `-1`.
- **`_process_date_info(img, dets)`** — robust date updater. Monotonic acceptance with
  warm-up backward-correction, an *artificial* flag for auto-advanced dates, suspicious-
  jump persistence gating, and **turn-aware auto-advance**: when OCR returns no date but
  the turn counter dropped, it advances the date by +1 half (handles the Y3-Dec→Final
  Season boundary). This is the machinery behind the date-inference behavior tracked in
  [`run-history`](../run-history.md).

### Navigation click helpers

Thin `waiter.click_when` wrappers, each targeting one lobby button:
`_go_rest`, `_go_recreate`, `_go_skills`, `_go_infirmary`,
`_go_training_screen_from_lobby`, `_go_back`.

`_go_recreate` is the heaviest — on the Tazuna/recreation screen it scores the
`recreation_row`s using **PAL memory** (`pal_memory`), chain-step counts, expected
energy from the event catalog, and the active-button classifier, then clicks the
best *active* row (filtering out completed PAL chains).

### Race decision logic

- **`_maybe_do_goal_race(img, dets)`** — the critical-goal race trigger. Classifies the
  goal text (G1 placement vs FANS/MAIDEN vs Pre-OP) and, within `max_critical_turn`,
  decides whether to race now. Skips the very first junior date.
- **`_plan_race_today()`** — resolves today's planned race: an explicit `Settings.RACES`
  date→name entry wins over `PRIORITIZE_G1` detection; guarded by `_raced_keys_recent`
  so it won't re-race a date whose OCR hasn't ticked over yet.
- **Training pre-check** (`_precheck_allowed` / `_peek_training_best_sv` /
  `_should_skip_planned_race_for_training`) — before committing to a (goal or planned)
  race, the bot can *peek* into the training screen, compute the best Support Value, and
  **skip the race to train instead** if `best_sv ≥ Settings.RACE_PRECHECK_SV`. The peek is
  cached per `(date_key, turn, energy)`; if it decides to stay, it clicks the best tile
  directly to save a round-trip. Disable via `Settings.LOBBY_PRECHECK_ENABLE`.
- **`mark_raced_today(date_key)`** — lets the agent record that a race already happened
  this date so the lobby won't trigger another.

### PAL memory

`pal_memory` (`PalMemoryManager`) persists PAL availability and recreation-chain
snapshots across turns, keyed to the run (preset/date/scenario). `_refresh_pal_memory`
keeps it aligned and resets it when the run identity changes.

---

## Per-turn shape (subclass `process_turn`)

The concrete URA/Unity Cup `process_turn` roughly: recognize the lobby frame →
`_update_state` (stats/date/turns/energy/mood/goal) → check infirmary → check goal
race (`_maybe_do_goal_race`) / planned race (with training pre-check) → else go to
training (the [training scan](training-scan.md) decides train/rest/race) → optionally
visit skills when `skill_pts` clears the gate.

> For the downstream decision once on the training screen, see
> [training-scan.md](training-scan.md). For the race-day flow this hands off to, see
> [race-flow.md](race-flow.md).

---

## Example images

> Provide representative captures into `images/`:

| Placeholder file | Screen to capture |
|------------------|-------------------|
| `images/lobby-main.png` | The career lobby — label the stats row, energy bar, mood, date, goal text, and the Train/Race/Rest/Recreation/Skills/Infirmary buttons. |
| `images/lobby-recreation-rows.png` | The Tazuna recreation screen with multiple `recreation_row`s (PAL scoring path). |
| `images/lobby-goal-text.png` | A close-up of the goal banner (the text `_maybe_do_goal_race` classifies). |

*(See [README](README.md#images-still-needed).)*
