# Character Goal System — Data Scraping, API & UI

## Overview

This document covers the complete character goal feature: scraping goal schedules from Gametora, the backend data model and API, the frontend character selector, and goal race markers in the scheduler and history views.

**Source:** [gametora.com](https://gametora.com/umamusume/characters)
**Output:** `datasets/in_game/character_index.json` + per-character files in `datasets/in_game/characters/`

---

## Why This Matters

The `turn` value stored in run history is a per-goal countdown (~4–11 range), not a per-year counter. When OCR fails to read the full date from the game UI, we lose month/half granularity. Character goal data gives us **absolute career-turn anchors** (turn 12, 27, 34, … 72) that map directly to known dates, letting us infer the date for every intervening training turn.

---

## API Structure (Gametora Scraping)

### Static endpoints (no build hash needed)

| Endpoint | Content |
|---|---|
| `https://gametora.com/sitemap.xml` | Lists all pages; extract `/umamusume/characters/{slug}` URLs |
| `https://gametora.com/data/umamusume/character-cards.{hash}.json` | 257 entries, one per costume. Fields: `card_id`, `char_id`, `url_name`, `name_en`, `base_stats`, `aptitude`, `rarity`. The `url_name` format is `{card_id}-{slug}`. |
| `https://gametora.com/data/umamusume/characters.{hash}.json` | 157 entries, one per character. Fields: `char_id`, `en_name`, `jp_name`, `url_name` (bare slug, no card_id prefix), `playable`, `birth_day`, `va_en`, `race`. |

### Detail page (avoids build hash via `__NEXT_DATA__`)

```
https://gametora.com/umamusume/characters/{card_id}-{slug}
```

The HTML contains a `<script id="__NEXT_DATA__">` tag with the full JSON payload. No `_next/data/{build_hash}` dependency.

**Extracted `pageProps` keys:**
- `charData` — name, char_id, url_name, VA, height, three_sizes
- `objectiveData` — **goals** (the primary target)
- `profileData` — biography text
- `itemData` — card metadata (card_id, title, version)
- `eventData` — training events (already handled by existing `rescraper_characters.py`)
- `evoLocData` — awakening / evolution skills

### `objectiveData` structure

```json
[
  {
    "order": 1,
    "turn": 12,
    "cond_type": 1,
    "cond_id": 1069,
    "cond_value": 0,
    "races": [{
      "id": 9187,
      "name_en": "Junior Make Debut",
      "group": 7,
      "grade": 900,
      "track": 10009,
      "distance": 2000,
      "terrain": 1,
      "fans_needed": 0,
      "fans_gained": 700
    }]
  },
  { "order": 2, "turn": 27, "races": [{ "name_en": "Kisaragi Sho", ... }] },
  ...
]
```

- `turn` = absolute career turn when the goal is received (range 12–72)
- Characters have 7–10 goals each
- `cond_type` / `cond_value` encode the requirement (place 5th, win, etc.)

---

## Career Turn → Date Mapping

### Pre-debut
| Abs turns | Label |
|---|---|
| 0–11 | Pre-debut (Y0) |

### Regular years (same calendar for every character)

**Important:** Y1 starts at month 6 (June), not January. The scheduler uses month 6 as Y1 start (`orderedDateKeys()`), so our formula must match.

| Abs turns | Year | Span | Half-months |
|---|---|---|---|
| 12–25 | Y1 | Jun Early → Dec Late | 14 |
| 26–49 | Y2 | Jan Early → Dec Late | 24 |
| 50–71 | Y3 | Jan Early → Dec Late | 22 (last ~2 are Final Season) |
| 72+ | Y4 | Final Season | — |

### Formula

Uses the same `date_index` convention as `date_uma.py`: `(year-1)*24 + (month-1)*2 + (half-1)`.

```
given abs_turn:

if abs_turn < 12:
    return "Y0"               # pre-debut turns 0-11

if abs_turn >= 72:
    return "Y4"               # Final Season

# abs_turn 12 → date_index 10 = Y1-06-1 (June Early = first Junior turn)
idx = abs_turn - 2

year  = idx // 24 + 1
month = (idx % 24) // 2 + 1
half  = (idx % 24) % 2 + 1
```

Examples:

| Abs turn | Date index | Date key | Notes |
|---|---|---|---|
| 12 | 10 | `Y1-06-1` | First Junior Year turn |
| 14 | 12 | `Y1-07-1` | July Early |
| 19 | 17 | `Y1-09-1` | September Early |
| 25 | 23 | `Y1-12-2` | End of Junior Year |
| 26 | 24 | `Y2-01-1` | First Classic Year turn |
| 27 | 25 | `Y2-01-2` | (Kisaragi Sho is at Y2-02-1 = idx 26) |
| 34 | 32 | `Y2-04-1` | April Early |
| 50 | 48 | `Y3-01-1` | First Senior Year turn |
| 71 | 69 | `Y3-11-2` | Late November |

Check: `orderedDateKeys()` generates Y1 from month 6 (June). `Y1-06-1` is the first valid key. Our formula matches.

---

## Scraper Script Design

### File: `datasets/scrape_character_goals.py`

### Flow

```
1. Fetch sitemap.xml → discover all {card_id}-{slug} URLs
   → Deduplicate by stripping card_id prefix → unique slugs per char

2. For each unique slug:
   a. Fetch https://gametora.com/umamusume/characters/{slug}
   b. Parse <script id="__NEXT_DATA__"> → JSON
   c. Extract charData, objectiveData, profileData (optional)
   d. Transform goals: add date_key via the formula above
   e. Write datasets/in_game/characters/{slug}.json
   f. Update datasets/in_game/character_index.json

3. Rate limit: 1 s pause every 10 requests
```

### Resumability

- Before fetching a slug, check if `character_index.json` already has it
- After each successful fetch, update the index file immediately
- Script can be killed and re-run safely

### Output files

### Image URLs

Constructed deterministically from `char_id` and `card_id` — no download needed:

```
full:   https://gametora.com/images/umamusume/characters/chara_stand_{char_id}_{card_id}.png
thumb:  https://gametora.com/images/umamusume/characters/thumb/chara_stand_{char_id}_{card_id}.png
```

**`datasets/in_game/character_index.json`** — master map:

```json
{
  "1001": {
    "char_id": 1001,
    "name_en": "Special Week",
    "name_jp": "スペシャルウィーク",
    "card_id": 100103,
    "slug": "100103-special-week",
    "playable": true,
    "goal_count": 7,
    "image_url": "https://gametora.com/images/umamusume/characters/chara_stand_1001_100103.png",
    "thumb_url": "https://gametora.com/images/umamusume/characters/thumb/chara_stand_1001_100103.png",
    "goals": [
      { "order": 1, "turn": 12, "date_key": "Y1-06-1", "race_name": "Junior Make Debut" },
      { "order": 2, "turn": 27, "date_key": "Y2-01-2", "race_name": "Kisaragi Sho" },
      ...
    ]
  },
  ...
}
```

**`datasets/in_game/characters/{slug}.json`** — full detail:

```json
{
  "charData": { "char_id": 1001, "en_name": "Special Week", ... },
  "image_url": "https://gametora.com/images/umamusume/characters/chara_stand_1001_100103.png",
  "thumb_url": "https://gametora.com/images/umamusume/characters/thumb/chara_stand_1001_100103.png",
  "objectiveData_transformed": [
    { "order": 1, "turn": 12, "date_key": "Y1-06-1", "race_name": "Junior Make Debut", ... },
    ...
  ],
  "profileData": { ... }
}
```

---

## Backend API Endpoints

### `/api/characters` endpoint

Add to `server/main.py`:

```python
from server.utils import load_dataset_json

CHARACTER_INDEX_PATH = "datasets/in_game/character_index.json"

@app.get("/api/characters")
def get_characters():
    return load_dataset_json(CHARACTER_INDEX_PATH)
```

`load_dataset_json()` already exists in `server/utils.py` and handles file-reading + error wrapping.

### `/api/characters/{char_id}` (optional — full detail)

```python
@app.get("/api/characters/{char_id}")
def get_character(char_id: int):
    index = load_dataset_json(CHARACTER_INDEX_PATH)
    entry = index.get(str(char_id))
    if not entry:
        raise HTTPException(status_code=404, detail="Character not found")
    slug = entry.get("slug", "")
    detail_path = f"datasets/in_game/characters/{slug}.json"
    return load_dataset_json(detail_path)
```

---

## Frontend: Types, API & Hook

### `web/src/models/datasets.ts` — Character types

```typescript
export interface CharacterGoal {
  order: number
  turn: number
  date_key: string
  race_name: string
  cond_type?: number
  cond_value?: number
}

export interface CharacterEntry {
  char_id: number
  name_en: string
  name_jp: string
  card_id: number
  slug: string
  playable: boolean
  goal_count: number
  image_url: string
  thumb_url: string
  goals: CharacterGoal[]
}

export type CharacterIndex = Record<string, CharacterEntry>
```

### `web/src/services/api.ts` — fetch function

```typescript
export async function fetchCharacters(): Promise<CharacterIndex> {
  const res = await fetch('/api/characters')
  if (!res.ok) throw new Error('Failed to fetch characters')
  return res.json()
}
```

### `web/src/hooks/useCharactersData.ts` — React Query hook

```typescript
import { useQuery } from '@tanstack/react-query'
import { fetchCharacters } from '@/services/api'
import type { CharacterEntry, CharacterGoal } from '@/models/datasets'

export function useCharactersData() {
  return useQuery({
    queryKey: ['characters'],
    queryFn: fetchCharacters,
    staleTime: 5 * 60 * 1000,
  })
}
```

---

## Preset: Add `charId` Field

### `web/src/models/types.ts` — Preset interface

```typescript
export interface Preset {
  // ... existing fields ...
  charId?: number | null          // selected character id
}
```

### `web/src/store/configStore.ts`

Add a `setCharId(presetId, id)` action alongside existing `patchPreset` approach. Since `patchPreset` already handles arbitrary key-value updates, we can just use `patchPreset(id, 'charId', charId)`.

### Zod schema (`web/src/models/config.schema.ts`)

```typescript
// In the Preset schema:
charId: z.number().int().positive().nullable().optional()
```

---

## CharacterSelector Component

New file: `web/src/components/presets/CharacterSelector.tsx`

```tsx
import { Autocomplete, Avatar, TextField, Box, Typography } from '@mui/material'
import { useCharactersData } from '@/hooks/useCharactersData'
import type { CharacterEntry } from '@/models/datasets'

export default function CharacterSelector({ presetId }: { presetId: string }) {
  const { data: index, isLoading } = useCharactersData()
  const charId = /* read from preset */  
  const patchPreset = /* ... */

  const options = Object.values(index ?? {})
    .filter(c => c.playable)
    .sort((a, b) => a.name_en.localeCompare(b.name_en))

  const selected = options.find(c => c.char_id === charId) ?? null

  return (
    <Autocomplete
      options={options}
      value={selected}
      getOptionLabel={(opt) => `${opt.name_en} (${opt.name_jp})`}
      renderOption={(props, opt) => (
        <Box component="li" {...props} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Avatar src={opt.thumb_url} sx={{ width: 32, height: 32 }} />
          <Box>
            <Typography variant="body2" fontWeight={600}>{opt.name_en}</Typography>
            <Typography variant="caption" color="text.secondary">{opt.name_jp}</Typography>
          </Box>
        </Box>
      )}
      renderInput={(params) => (
        <TextField
          {...params}
          label="Trainee Uma"
          placeholder="Search character..."
          size="small"
          InputProps={{
            ...params.InputProps,
            startAdornment: selected ? (
              <Avatar src={selected.thumb_url} sx={{ width: 24, height: 24, mr: 0.5 }} />
            ) : undefined,
          }}
        />
      )}
      onChange={(_, value) => patchPreset(presetId, 'charId', value?.char_id ?? null)}
      isOptionEqualToValue={(opt, val) => opt.char_id === val.char_id}
      loading={isLoading}
      size="small"
      sx={{ maxWidth: 400 }}
    />
  )
}
```

Integration: Add `<CharacterSelector presetId={selected.id} />` inside `PresetSettingsSection` in `PresetPanel.tsx` (after the name field, before PriorityStats).

---

## Goal Markers in RaceScheduler

### Utility helpers (`web/src/utils/race.ts`)

```typescript
import type { CharacterGoal } from '@/models/datasets'

export function getGoalForDateKey(
  goals: CharacterGoal[] | undefined,
  dateKey: string,
): CharacterGoal | undefined {
  if (!goals) return undefined
  return goals.find(g => g.date_key === dateKey)
}

export function isGoalRace(
  goals: CharacterGoal[] | undefined,
  raceName: string,
): boolean {
  if (!goals) return false
  return goals.some(g => g.race_name === raceName)
}
```

### `RaceScheduler.tsx` changes

1. **Load characters data** via `useCharactersData()` alongside existing `useQuery(['races'], ...)`
2. **Look up goals** for the selected preset's `charId`:

```typescript
const { data: charIndex } = useCharactersData()
const charEntry = preset?.charId ? charIndex?.[String(preset.charId)] : undefined
const goals = charEntry?.goals
```

3. **In `renderCard(dk)`**, before determining the card content:

```typescript
const goal = getGoalForDateKey(goals, dk)
const isGoal = !!goal
const plannedRaceIsGoal = selected && isGoalRace(goals, selected.name)
```

4. **Visual changes per `renderCard`**:

- **Empty card**: if the date has a goal race but no race is planned yet, show a subtle gold dashed border + a "Goal" badge chip (e.g., `⭐ Goal`) in the top corner. Keep the `+` add button.
- **Planned race card**: if the selected race matches a goal (`plannedRaceIsGoal`), add a gold star icon next to the race name, a "Goal Race" chip, and a gold left-border accent (instead of primary blue).
- **Tentative race card**: same as planned, but with warning/gold styling if it matches a goal.

5. **In the race selection dialog**, show a small `🌟 Goal` indicator next to race names that are goal races for the selected character.

### Visual spec for goal markers:

```typescript
const goalMarkerChip = isGoal && !selected ? (
  <Chip icon={<StarIcon sx={{ fontSize: 14 }} />} label="Goal" size="small"
    sx={{ height: 18, fontSize: '0.55rem', bgcolor: '#ffd700', color: '#7c5c00' }} />
) : null

// When race is planned AND it's a goal:
if (selected && plannedRaceIsGoal) {
  // Add gold border accent, star icon next to race name, goal chip
}
```

---

## Goal Markers in RaceHistoryDialog

### `RaceHistoryDialog.tsx` changes

1. **Load characters data** (same hook) — but the run record only has `uma_name` (string), not `charId`. Two approaches:

   **Option A (recommended):** Store `charId` in the run record when starting a run. In `main.py`, save `charId` to the run record dict.

   **Option B:** Resolve from `uma_name` by searching the character index by name. Frailer but works for existing history.

   Do both: prefer A, fall back to B for legacy records.

2. **Look up goals**:

```typescript
const { data: charIndex } = useCharactersData()

// Resolve char entry
let charEntry: CharacterEntry | undefined
if (record?.charId) {
  charEntry = charIndex?.[String(record.charId)]
} else if (record?.uma_name) {
  const name = record.uma_name.split(' / ').pop() // "Preset / Special Week" -> "Special Week"
  charEntry = Object.values(charIndex ?? {}).find(
    c => c.name_en === name || c.name_jp === name
  )
}
const goals = charEntry?.goals
```

3. **In the card rendering** loop (the `yearKeys.map` block):

```typescript
const goal = getGoalForDateKey(goals, dk)
const isGoal = !!goal
```

4. **Visual changes**:

- **Empty placeholder cards**: if the date has a goal, show gold dashed border and a small "Goal" text instead of default muted styling.
- **Populated turn cards**: if the card's date_key matches a goal, add a gold left-border strip (or full gold border) and a "Goal" chip:

```typescript
const borderColor = isGoal ? '#ffd700' : (card.race ? (card.race.won ? 'success.main' : 'error.main') : actionColor[...])
const borderWidth = isGoal ? 2 : (card.race ? 2 : 1)
```

5. **In the race attempt title area**, if the race name matches a goal, show a star icon next to the race name:

```typescript
{isGoal && <StarIcon sx={{ fontSize: 14, color: '#ffd700' }} />}
```

---

## Store charId in Run Records

### `main.py` changes

When creating the run record (around line 346-365), add:

```python
run_record = {
    # ...existing fields...
    "char_id": char_id,  # already resolved from trainee name
}
```

### `web/src/services/historyApi.ts` — RunRecord type

```typescript
export interface RunRecord {
  // ... existing fields ...
  char_id?: number | null
}
```

---

## Downstream Usage

### Phase A — Goal loader (`core/utils/character_data.py`)

```python
from core.utils.character_data import CharacterDB

db = CharacterDB()                     # lazy-loads index
goals = db.get_goals("Special Week")   # or db.get_goals_by_id(1001)
# → [{"turn": 12, "date_key": "Y1-07-1", ...}, ...]

date_key = db.career_turn_to_date_key(27)
# → "Y2-02-1"
```

### Phase B — Pre-seed turn-date inference in `_turn_date_key()`

In `core/agent_scenario.py`:
```python
def _infer_date_from_turn(self, year_code, turn_value):
    # Load character goals from CharacterDB
    # Use them as pre-seeded anchors alongside turn_log anchors
    # Goal 1 at turn 12 → Y1-06-1 fixes the "first Y1 turn" problem
```

The first turn of Y1 always maps to `Y1-06-1` via goal 1. No OCR, no prior anchor needed.

### Phase C — Uma selector in preset UI

- Add a searchable dropdown in `PresetSettingsSection`
- Uses `character_index.json` loaded on the frontend
- Stores `trainee.name` and `trainee.char_id` in the preset JSON
- Backend reads `trainee.char_id` to load the right goal schedule

---

## Edge Cases

| Case | Handling |
|---|---|
| Character not found in index | Fall back to current behavior (OCR + turn_log interpolation, no goal anchors) |
| Multiple costumes, same char | Deduplicate by char_id; only one goal set per character |
| Non-playable characters (`playable: false`) | Skip — they can't be selected as a trainee |
| New character not yet scraped | Run the scraper again; resumable by design |
| Gametora changes page structure | The `__NEXT_DATA__` tag is a Next.js standard; unlikely to change |
| Network failure mid-scrape | Index file written after each character; re-run resumes |
| Final exam / URA finale goals | Have turn >= 72; map to `Y4` since final season has no month/half |
| Image URL has wrong card_id | Store the **first playable card's** card_id per char (from character-cards); this is the default costume used for the character page |
| No character selected | No goal markers shown; RaceScheduler/RaceHistoryDialog behave as before |
| Character not in index (old preset) | `charId` is null; fall back to no-goal display |
| Legacy run history without charId | Fall back to name-based lookup (Option B) |
| Goal race name doesn't match exactly | Fuzzy match: case-insensitive, or use canonicalized names. Since goal data uses the same race names as `races.json`, exact match should work |
| Character deleted from dataset | Index lookups return undefined; no crash, no goals shown |
| Multiple goals on same date key | Extremely rare (some characters have back-to-back goals). The `getGoalForDateKey` returns first match; both will show the marker |
| Thumbnail image 404 | Avatar's `img` onError will show fallback initials; no crash |

---

## Implementation Order

1. Write `datasets/scrape_character_goals.py`
2. Run it once to populate `character_index.json` + `characters/`
3. Write `core/utils/character_data.py` (loader + turn→date helper)
4. Integrate into `_infer_date_from_turn()` in `agent_scenario.py`
5. Backend: `/api/characters` endpoint (5 min)
6. Frontend: types + API + hook (5 min)
7. Preset: add `charId` field + save (5 min)
8. CharacterSelector component + integration into PresetPanel (15 min)
9. Goal markers in RaceScheduler (20 min)
10. Goal markers in RaceHistoryDialog (15 min)
11. Store charId in run records (5 min)
12. Add character selector to preset UI
13. Wire character selection → backend goal loading
14. Manual test: verify save/load round-trip, goal markers appear in both views

Total: ~1.5 hours of focused work.
