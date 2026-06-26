# Run History Feature Plan

## Overview

Persistent storage + UI for past scenario runs, capturing final stats, preset info, race attempts, timestamps, and the bot's launch date.

---

## Storage

**Location:** `prefs/run_history.json`

Simple JSON array alongside the other preference files (`config.json`, `nav.json`, `runtime_skill_memory.*.json`). Chosen because:

- Follows existing persistence pattern in the project
- No new dependencies (no SQLite, no database)
- Easily accessible by backend (FastAPI), frontend (fetch API), and user (manual edit/delete)
- Small data size — a few hundred entries is well under 1 MB
- Easy to clear: delete the file or truncate to empty array

---

## Data Model

```json
[
  {
    "id": "a1b2c3d4-...",
    "scenario": "ura",
    "preset_name": "My Preset",
    "uma_name": "Special Week",
    "start_date": "2026-06-26",
    "start_time": "2026-06-26T10:00:00",
    "end_time": "2026-06-26T11:30:00",
    "final_turn": 0,
    "final_stats": {"SPD": 800, "STA": 600, "PWR": 700, "GUTS": 500, "WIT": 900},
    "final_mood": "GOOD",
    "final_fans": null,
    "final_rank": null,
    "completed": true,
    "error": null,
    "races_attempted": [
      {"date_key": "Y1-07-1", "race_name": "Hokkaido Race", "won": true, "finish_pos": null, "fans_gained": null},
      {"date_key": "Y2-11-2", "race_name": "Japan Cup", "won": false, "finish_pos": null, "fans_gained": null}
    ]
  }
]
```

### RunRecord

| Field | Type | Source |
|-------|------|--------|
| `id` | UUID | Generated at run start |
| `scenario` | `"ura"` / `"unity_cup"` | `BotState.start()` |
| `preset_name` | str | Active preset name at start |
| `uma_name` | str \| null | OCR from final screen (Uma name text) |
| `start_date` | str (YYYY-MM-DD) | Bot's local date at run start (`datetime.now().date()`) |
| `start_time` | ISO 8601 | Bot's local time at run start (`datetime.now().isoformat()`) |
| `end_time` | ISO 8601 | Bot's local time at scenario end |
| `final_turn` | int | `LobbyState.turn` at FinalScreen |
| `final_stats` | `{SPD,STA,PWR,GUTS,WIT: int}` | `LobbyState.stats` |
| `final_mood` | str \| null | `LobbyState.mood[0]` |
| `final_fans` | int \| null | OCR from final screen |
| `final_rank` | str \| null | OCR from final screen |
| `completed` | bool | True = FinalScreen hit, False = error/stop |
| `error` | str \| null | Exception message if crashed |
| `races_attempted` | `RaceAttempt[]` | Captured per-race |

### RaceAttempt

| Field | Type | Source |
|-------|------|--------|
| `date_key` | str | `"Y2-07-1"` — in-game date from `_plan_race_today()` |
| `race_name` | str | `"Hokkaido Race"` — canonical race name |
| `won` | bool | True = no "TRY AGAIN" after race, False = loss/retry |
| `finish_pos` | int \| null | OCR from results screen |
| `fans_gained` | int \| null | OCR from results screen |

---

## Capture Points (4 hooks)

### 1. Run start

**File:** `main.py` → `BotState.start()`

```python
from datetime import datetime
now = datetime.now()
record = RunRecord(
    id=str(uuid4()),
    scenario=...,
    preset_name=...,
    start_date=now.strftime("%Y-%m-%d"),
    start_time=now.isoformat(),
    races_attempted=[],
)
self._current_run = record
```

`start_date` uses the **bot's local clock**, not OCR from the Android device.

### 2. Per-race attempt

**File:** `core/actions/race.py` → `RaceFlow.lobby()` (after post-race flow, when win/loss is known)

The win/loss is already determined in `lobby()` via the "TRY AGAIN" button check. After that check, push a `RaceAttempt` to the agent's run record list.

```python
attempt = RaceAttempt(
    date_key=date_key,        # passed in from caller
    race_name=race_name,      # canonical name from _plan_race_today()
    won=not loss_detected,    # based on TRY AGAIN presence
)
agent._current_run.races_attempted.append(attempt)
```

The agent must hold a reference to `self._current_run`. This can be passed from `BotState` → `AgentScenario` → `LobbyFlow` → `RaceFlow` via a shared object or callback.

### 3. FinalScreen (scenario end)

**Files:**
- `core/actions/ura/agent.py` (~line 562)
- `core/actions/unity_cup/agent.py` (~line 701)

On the FinalScreen, OCR the following in addition to capturing state:
- **Uma name** — visible in a prominent text label on the final results screen
- **Final fans** — total fans display
- **Final rank** — rank badge text (A+, S, UG, etc.)

```python
if screen == "FinalScreen":
    record = self._current_run
    record.end_time = datetime.now().isoformat()
    record.final_turn = self.lobby.state.turn
    record.final_stats = dict(self.lobby.state.stats)
    record.final_mood = self.lobby.state.mood[0] if self.lobby.state.mood else None
    record.uma_name = ocr_uma_name(img)        # OCR from final screen region
    record.final_fans = ocr_final_fans(img)      # OCR from final screen region
    record.final_rank = ocr_final_rank(img)      # OCR from final screen region
    record.completed = True
    append_run_history(record)
```

### 4. Error / early stop

**File:** `main.py` → `BotState._runner()` (or `NavState._runner()`)

```python
except Exception as e:
    if self._current_run:
        self._current_run.end_time = datetime.now().isoformat()
        self._current_run.completed = False
        self._current_run.error = str(e)
        append_run_history(self._current_run)
```

---

## Backend (server/main.py)

Endpoints:

```
GET   /api/history          →  list[RunRecord]
POST  /api/history          →  {"status": "ok"}  (append one record)
DELETE /api/history/{id}    →  {"status": "ok"}  (delete one record by ID)
```

Returns entire history array (empty list if no file). Deletion splices the array by matching `id`.

---

## Frontend

### New component: `src/components/history/RunHistory.tsx`

- Fetches `/api/history` on mount
- Renders a Material UI table:

| Column | Content |
|--------|---------|
| Date | `start_date` formatted (e.g. "Jun 26, 2026") |
| Scenario | Badge: "URA" / "Unity Cup" |
| Preset | Preset name |
| Uma | Uma name (if captured) |
| Stats | Compact stat bar (SPD/STA/PWR/GUTS/WIT) |
| Races | Count badge of races attempted |
| Result | Completed checkmark, error icon, or rank (A+/S etc.) |

- Click row to expand → full stat values, mood, fans/rank, duration
- Each row has a delete button (trash icon) to remove that entry
- Rows sorted by `start_time` descending (newest first)

### Race History Dialog

Clicking the races count badge (or a dedicated button) opens a **dialog** showing the race attempts in a **3-column or 4-column card grid** (same layout as the RaceScheduler):

- Scrollable dialog, full-width, max-height 80vh
- Cards follow the same pattern as RaceScheduler cards:
  - **Banner image** — `public_banner_path` from race data, 2:1 aspect ratio
  - **Rank badge** — G1/G2/OP/etc. badge icon
  - **Race name** — canonical name
  - **Surface chip** — colored: Turf=#2e7d32, Dirt=#bf8f4a
  - **Distance chip** — outlined, e.g. "Mile", "Sprint"
  - **Location + distance text** — e.g. "Nakayama — 2000m"
  - **Win/Loss indicator** — green checkmark ✓ or red X ✗ overlaid on the card
- No search, no editing, no auto-advance — read-only
- Cards ordered chronologically by `date_key`

### Home.tsx update

Add a "History" tab alongside Scenario setup / Shop / Team Trials / Daily Races / Hotkeys.

---

## Backend Files to Create/Modify

### New file: `server/run_history.py`

Helper functions for reading/writing `prefs/run_history.json`:

```python
HISTORY_PATH = PREFS_DIR / "run_history.json"

def load_history() -> list[dict]: ...
def append_history(record: dict) -> None: ...
def delete_history(record_id: str) -> bool: ...
```

### Modify: `server/main.py`

Add three new routes: `GET /api/history`, `POST /api/history`, `DELETE /api/history/{id}`.

---

## Frontend Files to Create/Modify

### New: `src/components/history/RunHistory.tsx`
History table with expandable rows, race dialog, delete per entry.

### New: `src/components/history/RaceHistoryDialog.tsx`
Read-only card grid dialog for race attempts.

### New: `src/services/historyApi.ts`
API helpers: `fetchHistory()`, `saveHistory()`, `deleteHistory(id)`.

### Modify: `src/pages/Home.tsx`
Add "History" tab, import and render `RunHistory`.

---

## Phasing

### Phase 1 (this PR)
- Data model + persistence (`prefs/run_history.json`)
- Start / Per-race / FinalScreen / Error capture hooks
- Uma name, fans, rank OCR from FinalScreen
- Backend endpoints (CRUD)
- Frontend table with stats + race count + timestamps + delete
- Race history dialog (read-only grid with win/loss indicators)

### Phase 2 (future)
- OCR finish position and fans gained from post-race results screen
- Add `finish_pos` + `fans_gained` to race history cards
