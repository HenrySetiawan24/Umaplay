# Character Selector UI — Plan

Integrate character selection into the preset UI, and show goal race markers in both the race scheduler and race history dialog.

---

## Overview

Three visible changes:

1. **Character autocomplete** in the preset panel — pick your trainee Uma from a searchable dropdown with name + thumbnail
2. **Goal markers** in the race scheduler — date cards for goal races get a gold star / "Goal" badge, and the selected race shows a goal indicator if it matches
3. **Goal markers** in the race history dialog — turn cards that correspond to a character goal get a gold border / badge

Data flows: `character_index.json` → new `/api/characters` endpoint → React Query → UI components. The selected `charId` is stored in the preset JSON and saved to `config.json`.

---

## Step 1 — Backend: `/api/characters` endpoint

Add to `server/main.py`:

```python
from server.utils import load_dataset_json

CHARACTER_INDEX_PATH = "datasets/in_game/character_index.json"

@app.get("/api/characters")
def get_characters():
    return load_dataset_json(CHARACTER_INDEX_PATH)
```

`load_dataset_json()` already exists in `server/utils.py` and handles file-reading + error wrapping.

---

## Step 2 — Frontend: types & API

### `web/src/models/datasets.ts` — add Character type

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

### `web/src/services/api.ts` — add fetch function

```typescript
export async function fetchCharacters(): Promise<CharacterIndex> {
  const res = await fetch('/api/characters')
  if (!res.ok) throw new Error('Failed to fetch characters')
  return res.json()
}
```

### `web/src/hooks/useCharactersData.ts` — data hook

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

## Step 3 — Preset: add `charId` field

### `web/src/models/types.ts` — Preset interface

```typescript
export interface Preset {
  // ... existing fields ...
  charId?: number | null          // NEW: selected character id
}
```

### `web/src/store/configStore.ts`

Add a `setCharId(presetId, charId)` action alongside existing `patchPreset` approach. Since `patchPreset` already handles arbitrary key-value updates, we can just use `patchPreset(id, 'charId', charId)`.

### Zod schema (`web/src/models/config.schema.ts`)

```typescript
// In the Preset schema:
charId: z.number().int().positive().nullable().optional()
```

### Preset name field

Reflect the character name in the preset name automatically? No — keep separate. The user manually names their preset. The character is a separate field.

---

## Step 4 — CharacterSelector component

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

## Step 5 — Goal markers in RaceScheduler

### `web/src/utils/race.ts` — add goal helpers

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

## Step 6 — Goal markers in RaceHistoryDialog

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

## Step 7 — Store charId in run records

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

## Step 8 — Backend: serve individual character data (optional)

Not strictly needed if the character index lives in the frontend cache. But for future use (e.g., showing full detail in a tooltip), add:

```python
@app.get("/api/characters/{char_id}")
def get_character(char_id: int):
    index = load_dataset_json(CHARACTER_INDEX_PATH)
    entry = index.get(str(char_id))
    if not entry:
        raise HTTPException(status_code=404, detail="Character not found")
    # Also try to load the full detail file
    slug = entry.get("slug", "")
    detail_path = f"datasets/in_game/characters/{slug}.json"
    return load_dataset_json(detail_path)
```

---

## Implementation Order

1. Backend: `/api/characters` endpoint (5 min)
2. Frontend: types + API + hook (5 min)
3. Preset: add `charId` field + save (5 min)
4. CharacterSelector component + integration into PresetPanel (15 min)
5. Goal markers in RaceScheduler (20 min)
6. Goal markers in RaceHistoryDialog (15 min)
7. Store charId in run records (5 min)
8. Manual test: verify save/load round-trip, goal markers appear in both views

Total: ~1.5 hours of focused work.

---

## Edge Cases

| Case | Handling |
|------|----------|
| No character selected | No goal markers shown; RaceScheduler/RaceHistoryDialog behave as before |
| Character not in index (old preset) | `charId` is null; fall back to no-goal display |
| Legacy run history without charId | Fall back to name-based lookup (Option B) |
| Goal race name doesn't match exactly | Fuzzy match: case-insensitive, or use canonicalized names. Since goal data uses the same race names as `races.json`, exact match should work |
| Character deleted from dataset | Index lookups return undefined; no crash, no goals shown |
| Multiple goals on same date key | Extremely rare (some characters have back-to-back goals). The `getGoalForDateKey` returns first match; both will show the marker |
| Thumbnail image 404 | Avatar's `img` onError will show fallback initials; no crash |
