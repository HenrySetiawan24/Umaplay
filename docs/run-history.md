# Run History

## Overview

Persistent storage and UI for past scenario runs, capturing final stats, preset info, per-turn actions, race outcomes, timestamps, and the bot's launch date.

---

## Storage

**Summary index:** `prefs/run_history.json` — lightweight array of summary records, one entry per run. Loaded on every history page open; stays small regardless of run count.

**Per-run detail:** `prefs/run_detail/{id}.json` — `{ turn_log, active_periods }` for one run. Written incrementally as the run progresses; loaded on demand when the Race History dialog opens.

Reasons for the split:
- `turn_log` can exceed 70 entries per run, each with full stat snapshots — it dominates file size
- The history table only needs summary fields (counts, final stats, fans, rank)
- Lazy-loading the detail keeps the history page fast even with hundreds of runs
- Follows the existing no-dependency JSON pattern (`config.json`, `nav.json`, etc.)

---

## Data Model

### RunRecord

| Field | Type | Source |
|-------|------|--------|
| `id` | UUID | Generated at run start |
| `scenario` | `"ura"` / `"unity_cup"` | `BotState.start()` |
| `preset_name` | str | Active preset name at start |
| `uma_name` | str \| null | OCR from final screen |
| `char_id` | int \| null | Resolved from trainee name via character index at run start |
| `start_date` | str (YYYY-MM-DD) | Bot's local clock at run start |
| `start_time` | ISO 8601 | Bot's local time at run start |
| `end_time` | ISO 8601 | Bot's local time at scenario end |
| `final_turn` | int | `LobbyState.turn` at FinalScreen |
| `final_stats` | `{SPD,STA,PWR,GUTS,WIT: int}` | `LobbyState.stats` |
| `final_mood` | str \| null | `LobbyState.mood[0]` |
| `final_fans` | int \| null | OCR from final screen |
| `final_rank` | str \| null | OCR from final screen |
| `completed` | bool | True = FinalScreen hit, False = error/stop |
| `error` | str \| null | Exception message if crashed |
| `race_count` | int | Races run this session (precomputed from turn_log at write time) |
| `training_count` | int | Training turns taken |
| `rest_count` | int | Rest turns taken |
| `recreation_count` | int | Recreation turns taken |
| `races_attempted` | `RaceAttempt[]` | **Legacy only** — present on old records; empty `[]` on new runs |

### TurnLogEntry

The single source of truth for per-turn history. Race outcomes are stored directly on the entry for race turns.

| Field | Type | Notes |
|-------|------|-------|
| `turn` | int | In-game remaining-turn counter |
| `abs_turn` | int | Monotonically incrementing counter for absolute position |
| `date_key` | str | `"Y2-07-1"` — inferred in-game date |
| `action` | str | `to_training`, `to_race`, `to_rest`, `to_recreation`, `raced`, `rested`, `infirmary`, `continue`, `training_ready` |
| `training_type` | str \| null | `SPD`, `STA`, `PWR`, `GUTS`, `WIT` |
| `reason` | str \| null | Agent's decision rationale (omitted in UI for non-race turns) |
| `stats` | `{SPD,…: int}` \| null | Stat snapshot after training |
| `energy` | int \| null | Energy % |
| `mood` | str \| null | Mood string or `"UNKNOWN"` |
| `skill_pts` | int \| null | Skill points |
| `race_name` | str \| null | **Race turns only** — canonical race name |
| `won` | bool \| null | **Race turns only** — True = win, False = loss |
| `fans_before` | int \| null | **Race turns only** — fan count before race |
| `fans_after` | int \| null | **Race turns only** — fan count after race |

### RaceAttempt (legacy)

Present on records written before the `turn_log` consolidation. New runs do not write this list.

| Field | Type |
|-------|------|
| `turn` | int \| null |
| `date_key` | str \| null |
| `race_name` | str |
| `won` | bool |
| `fans_before` | int \| null |
| `fans_after` | int \| null |
| `timestamp` | ISO 8601 |

### `date_key` format

```text
Y{year}-{MM}-{half}
```

Year buckets:

```text
Y1 = Junior Year
Y2 = Classic Year
Y3 = Senior Year
Y4 = Final Season / URA finale
```

Examples:

```text
Y1-01-1  Early Jan, Junior Year
Y1-01-2  Late Jan, Junior Year
Y2-07-1  Early Jul, Classic Year
Y3-12-2  Late Dec, Senior Year
Y4       Final Season (no month/half)
```

Fallback rules:

- Date is inferred from `lobby.state.turn` using character goal race dates as anchor points (seeded from `datasets/in_game/character_index.json`) and any prior turn_log entries with confirmed full date_keys.
- If only the year is known, stores `Y1` / `Y2` / `Y3` rather than an empty string.

---

## Write Path

### Run start — `main.py → BotState.start()`

Resolves `char_id` by checking `preset.charId` first (set by the UI character selector), then falling back to `character_data.search_characters(trainee_name)` as a best-effort guess. Then initialises the run record:

```python
record = {
    "id": str(uuid4()),
    "scenario": ...,
    "preset_name": ...,
    "char_id": char_id,
    "start_time": datetime.now().isoformat(),
    "races_attempted": [],   # kept for schema compat; always empty on new runs
    "turn_log": [],
}
```

### Per-turn action — `core/run_context.py → push_turn_log()`

Called each time the agent makes a decision:

```python
push_turn_log(
    turn=lobby.state.turn,
    date_key=self._turn_date_key(),
    action="to_training",
    training_type="SPD",
    stats=..., energy=..., mood=..., skill_pts=...,
)
```

### Race outcome — `core/actions/race.py → _record_race_attempt()`

After win/loss is confirmed, enriches the most recent `turn_log` entry (the `to_race` decision that was already written) instead of appending to a separate list:

```python
update_last_turn_log(
    race_name=self._last_race_name,
    won=won,
    fans_before=fans_before,
    fans_after=fans_after,
)
```

`_current_date_key` is also re-synced here from `lobby.state` (after `process_turn()`) so the race outcome carries the same date as the `turn_log` entry.

### FinalScreen — `core/actions/{ura,unity_cup}/agent.py`

```python
record["end_time"] = datetime.now().isoformat()
record["final_stats"] = dict(lobby.state.stats)
record["final_fans"] = ocr_final_fans(img)
record["completed"] = True
persist_run_record()
```

### Error / early stop — `main.py → BotState._runner()`

```python
record["end_time"] = datetime.now().isoformat()
record["completed"] = False
record["error"] = str(e)
persist_run_record()
```

---

## Backend API — `server/main.py`

```
GET    /api/history                    →  list[RunRecord]   (summaries only)
POST   /api/history                    →  {"status": "ok"}
DELETE /api/history/{id}               →  {"status": "ok"}  (also deletes detail file)
GET    /api/history/incomplete         →  list[RunRecord]
GET    /api/history/{id}/detail        →  RunDetail { turn_log, active_periods }

GET    /api/characters                 →  dict[char_id, CharacterEntry]
GET    /api/characters/{char_id}       →  CharacterDetail
GET    /api/characters/{char_id}/thumb →  image (proxied from Gametora)
```

---

## Frontend

### Components

| File | Purpose |
|------|---------|
| `src/components/history/RunHistory.tsx` | Table of run records; uses precomputed count fields from summary |
| `src/components/history/RaceHistoryDialog.tsx` | Read-only card grid; fetches `/api/history/{id}/detail` on open |
| `src/services/historyApi.ts` | `fetchHistory()`, `fetchHistoryDetail(id)`, `deleteHistory(id)`, TypeScript interfaces |
| `src/hooks/useCharactersData.ts` | React Query hook for `/api/characters`, 5-min cache |

### RaceHistoryDialog — data flow

On open, fetches `GET /api/history/{id}/detail` (cached 30 s via React Query). Iterates `detail.turn_log` directly; entries with `race_name` set are rendered as race cards with banner, win/loss, fans, etc. Non-race entries show training/rest/recreation summary chips.

The card grid is ordered chronologically by year → month → half → turn.

### Goal race display

The history dialog loads character goal data via `useCharactersData` (keyed by `char_id` or `uma_name`). Date slots that are a character goal but have no recorded race turn show the goal race banner, rank badge, and surface/distance chips at reduced opacity.

---

## Pending: `races_attempted` consolidation

**Status:** Planned — not yet implemented.

**Scope:**

1. `core/run_context.py` — extend `update_last_turn_log` to accept `race_name`, `won`, `fans_before`, `fans_after`.
2. `core/actions/race.py` — change `_record_race_attempt` to call `update_last_turn_log` with race fields instead of appending to `races_attempted`. Leave `races_attempted: []` in the record for schema compat.
3. `web/src/services/historyApi.ts` — add race fields to `TurnLogEntry`; keep `RaceAttempt` and `races_attempted` for legacy read path.
4. `web/src/components/history/RaceHistoryDialog.tsx` — simplify `cards` memo to read race fields directly from `turn_log`; retain existing merge logic as legacy fallback for old records.

No data migration needed — old records are handled by the legacy fallback read path.
