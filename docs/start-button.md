# Start/Stop Button & Incomplete Run Continuation

## Goal
Replace exclusive reliance on the F2 hotkey with a web UI start/stop button that:
- Starts/stops the bot (same logic as F2 toggle)
- Checks for incomplete runs before starting and prompts the user to continue one
- Auto-refreshes status so the button always reflects real bot state (even after hotkey use)

## Architecture

### Backend — `server/bot_bridge.py`
Module-level function references that bridge `main.py` (where `BotState` lives) and `server/main.py` (FastAPI routes). Avoids circular imports.

```
main.py: state = BotState()
         register(state.start, state.stop, lambda: state.running)
                      ↓
          server/bot_bridge.py  ──→  server/main.py
              _start_fn               POST /api/bot/start
              _stop_fn                POST /api/bot/stop
              _running_fn             GET  /api/bot/status
```

### `BotState.start(continue_id=None)`
- If `continue_id` is provided: load that record from `run_history.json`, use its id/fields as the current run (`set_run_record()`), clear `end_time` + `error`, and append new race data to the existing `races_attempted` array. Do NOT create a new UUID.
- If `continue_id` is None (or F2 hotkey): create a brand new stub record as today.
- The `_runner()` finally block always upserts the final record.

### Incomplete Run Detection
- **Backend**: `GET /api/history/incomplete` returns records where `completed == False` (started but never reached FinalScreen — includes stopped/errored runs).
- **Frontend**: Before starting, fetches this list. If non-empty, shows `<ContinueRunDialog>`.

## New API Routes

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/bot/status` | Returns `{"running": bool}` |
| `POST` | `/api/bot/start` | Body: `{continue_id?: string}`. Starts the bot. |
| `POST` | `/api/bot/stop` | Stops the bot. |
| `GET` | `/api/history/incomplete` | Returns `RunRecord[]` where `completed` is false. |

## Diagnostic Data Model

### Extended `RaceAttempt` fields (per race)

| Field | Type | Source |
|---|---|---|
| `turn` | int | `self.lobby.state.turn` at race time |
| `date_key` | str | `self._today_date_key()` at race time |
| `fans_before` | int | Lobby state fans before race |
| `fans_after` | int | Lobby state fans after race |

### `turn_log[]` (per-turn snapshot)

Pushed once per turn in the Lobby handler after `process_turn()` determines the action.

| Field | Type | Source |
|---|---|---|
| `turn` | int | `self.lobby.state.turn` |
| `date_key` | str | `self._today_date_key()` |
| `action` | str | `process_turn()` outcome: `to_training`, `to_race`, `to_rest`, `to_recreation`, etc. |
| `training_type` | str | Reason string when action is `to_training` (e.g., "SPD brilliant") |
| `stats` | dict | Snapshot of SPD/STA/PWR/GUTS/WIT |
| `energy` | int | Current energy % |
| `mood` | str | Current mood label |
| `skill_pts` | int | Available skill points |

### `uma_name`

OCR'd once from the top-left region of the first lobby screen. Stored as string, fallback to preset_name if OCR fails.

## Data Storage
- `run_history.json` — extended schema with `races_attempted[].{turn,date_key}` and `turn_log[]`
- `bot_bridge.py` is stateless; all state lives in `BotState`

## State Shape

### Continue dialog (frontend)
```
Open:
  - Fetch incomplete runs (completed=false) → show in dialog
  - Each entry shows: date, scenario, preset name, final turn (so far), fans, rank
  - User picks: Continue (with selected id) / Start Fresh / Cancel
```

### RunRecord schema
```json
{
  "id": "uuid",
  "scenario": "ura",
  "preset_name": "My Preset",
  "uma_name": "Tokai Teio",
  "start_time": "2026-06-26T12:00:00",
  "active_seconds": 5400,
  "end_time": "2026-06-26T13:30:00",
  "final_turn": 72,
  "final_stats": {"SPD": 1200, ...},
  "final_mood": "GREAT",
  "final_fans": 520000,
  "final_rank": "UG",
  "completed": true,
  "error": null,
  "races_attempted": [
    {"race_name": "Osaka Hai", "won": true, "turn": 32, "date_key": "Y3-03-2", "fans_after": 135000}
  ],
  "turn_log": [
    {"abs_turn": 1, "turn": 48, "date_key": "Y0", "action": "to_training", "training_type": "SPD", ...},
    {"abs_turn": 5, "turn": 44, "date_key": "Y1-07-1", "action": "to_race", ...},
    {"abs_turn": 72, "turn": 0, "date_key": "Y3-12-2", "action": "completed", ...}
  ]
}
```

### Turn Log Improvements

**Absolute turn (`abs_turn`)**: A monotonically incrementing counter (1, 2, 3, ...) stored on every `turn_log` entry. Managed by `run_context.py` — auto-increments in `push_turn_log()` and resets when a new run record is set. Shows clean sequential order regardless of the game's turn-remaining countdown.

**Pre-debut date_key (`"Y0"`)**: When the lobby detects `year_code == 0` (pre-debut phase), `_today_date_key()` now returns `"Y0"` instead of `None`/`""`, so pre-debut turns are clearly labeled in the history.

**Final season date_key (`"Y4"`)**: During the URA/Unity Cup Final Season (`year_code == 4`), the game's `DateInfo` has `month = None`, which previously caused `_today_date_key()` to return `None` → `""` in turn_log entries. Now it falls back to `f"Y{di.year_code}"` so the last ~3 URA turns get `date_key="Y4"` instead of an empty string. This aligns with `DateInfo.as_key()` (`core/utils/date_uma.py`).

**Completed milestone**: When the scenario finishes (FinalScreen), a turn_log entry with `action: "completed"`, `turn: 0` and the final stats is pushed, marking the end of the run in the log.

## Win/Loss Detection Fix

### Original problem
The original `lobby()` method used a single `time.sleep(1)` + one-shot `waiter.seen()` for the "TRY AGAIN" button. This was unreliable — if the button rendered slightly late the race was incorrectly recorded as a win. Further, the "TRY AGAIN" button only appears when the **scenario goal** is failed, not when an individual race is lost, so win/loss labels were fundamentally inaccurate.

### Phase 1 fix
A polling loop (6 attempts × 0.5s) replaced the single sleep+check, catching the button even with delayed UI transitions. This improved reliability but still conflated goal-failure with race-loss.

### Phase 2 fix (current)
Placement OCR on the leaderboard screen replaces the TRY AGAIN heuristic entirely. See [Race Win/Loss Detection](#race-winloss-detection) above.

## Frontend Components

### `BotControl.tsx`
- Toggle button + colored dot indicator
- Polls `GET /api/bot/status` every 3 seconds
- On idle click: fetches incomplete runs → shows ContinueRunDialog → starts
- On running click: stops immediately (no confirmation)

### `ContinueRunDialog.tsx`
- Dialog listing incomplete runs as compact cards
- "Continue this run", "Start Fresh", "Cancel" buttons
- Passes selected `continue_id` to `startBot()`

### `RunHistory.tsx` (table)
- Auto-refreshes every 5 seconds
- Columns: Start, End, Duration, Scenario, Preset/Uma, Fans, Rank, Turn, Status, Races count
- View races button opens RaceHistoryDialog

### `RaceHistoryDialog.tsx`
- Card grid of race attempts
- Each card shows: WIN/LOSS chip, race name, banner, rank badge, surface, distance, turn, fans, timestamp

### `Home.tsx`
- Render `<BotControl />` in the tab bar Paper header (right-aligned)

## Hotkey Behavior (unchanged)
- F2 always starts fresh (no continue dialog) — there is no UI to show one.
- F7/F8/F9/F10 continue working as before (nav actions, complete dailies).

## Race Win/Loss Detection

### Problem
Previous detection polled for the "TRY AGAIN" button, which only appears when the **scenario goal** is failed — not when an individual race is lost. This produced incorrect WIN/LOSS labels.

### Solution: Placement OCR
Right after the skip loop breaks on the green "NEXT" button (leaderboard screen visible), the bot:

1. Takes a screenshot with `self._collect("race_placement")`
2. Runs full-screen OCR at `min_conf=0.1`
3. Parses the placement number from the OCR text using `_parse_placement()`:
   - `[1st]` / `[3rd]` — bracket pattern from the leaderboard grid
   - `1st PL.` / `3rd PL.` — banner pattern from the fan pyramid
   - Standalone `1st` / `2nd` etc.
4. Sets `self._last_placement = N` (or `None` if parsing fails)
5. At the win/loss decision point: `won = (self._last_placement == 1)` if placement detected, else falls back to `not loss_indicator_seen`

### Insertion Points
- **Skip-loop path**: right after the skip `while` loop ends, before the CLOSE fallback check, gated on `not closed_early` (only when we broke on NEXT, meaning the leaderboard is showing).
- **View Results path**: 1.5s after clicking View Results, same capture + OCR.

### Debug Data Collection
When `Settings.STORE_FOR_TRAINING` is enabled, each placement OCR saves:
- `debug/race/placement/<source>_<timestamp>_<placement>.png` — raw screenshot
- `debug/race/placement/<source>_<timestamp>_<placement>.txt` — OCR text + parsed result

### Fallback
If OCR fails to extract a placement number, `self._last_placement` remains `None` and the decision falls back to the previous `not loss_indicator_seen` logic — no regression.

## Files Changed

| File | Change |
|---|---|
| `server/bot_bridge.py` (new) | Function reference bridge |
| `server/run_history.py` | Added `get_record()`, `find_incomplete()` (checks `completed==False`); `append_history()` → upsert by id |
| `server/main.py` | `/api/bot/*` + `/api/history/incomplete` routes |
| `main.py` | `BotState.start(continue_id)`, `register()` call; clear `end_time` on continue |
| `core/run_context.py` | Added `push_turn_log()`, `update_last_turn_log()`, `tick_active_time()`, `_abs_turn` counter with auto-increment in `push_turn_log()` |
| `core/agent_scenario.py` | `_today_date_key()` returns `"Y0"` for pre-debut phase |
| `core/actions/race.py` | `_record_race_attempt()` extended with turn/date_key/fans; placement OCR (`_parse_placement()`, `_save_placement_debug()`) replacing TRY AGAIN polling for win/loss; `_last_placement` field; active time tracking via `tick_active_time()` |
| `core/actions/ura/agent.py` | Turn log push + uma_name OCR; completed milestone push on FinalScreen |
| `core/actions/unity_cup/agent.py` | Turn log push + uma_name OCR; completed milestone push on FinalScreen |
| `web/src/services/api.ts` | `fetchBotStatus()`, `startBot()`, `stopBot()` |
| `web/src/services/historyApi.ts` | `fetchIncompleteHistory()`, extended `RaceAttempt`/`TurnLogEntry`/`RunRecord` types |
| `web/src/components/common/BotControl.tsx` (new) | Start/Stop toggle + poll + continue dialog trigger |
| `web/src/components/common/ContinueRunDialog.tsx` (new) | Incomplete run selection dialog |
| `web/src/components/history/RunHistory.tsx` | Auto-refresh, extended columns, action counters (T/R/C) |
| `web/src/components/history/RaceHistoryDialog.tsx` | Turn/fans chips, action chip + reason from turn_log lookup |
| `web/src/components/history/TurnLogDialog.tsx` (new) | Per-turn diagnostic table |
| `web/src/pages/Home.tsx` | BotControl in tab bar |

## Phasing
Phase 1 (complete):
- bot_bridge, continue run, start/stop button, extended diagnostic data

Phase 2 (future):
- Turn chart visualization (show gaps between races)
- Per-turn training heatmap/breakdown
- Export run data as JSON
