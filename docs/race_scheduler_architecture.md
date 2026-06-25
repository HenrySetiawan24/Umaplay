# Race Scheduler — Architecture & Data Flow

## Purpose

The Race Scheduler lets users pre-select which races the bot should enter during a career run, organized by turn (year + month + half). The UI mirrors the in-game race selection screen and persists choices into config presets.

---

## Data Model

### Backend: `datasets/in_game/races.json`

A JSON object keyed by race name. Each value is an array of `RaceInstance` objects (same race may run in different years/halves):

```json
{
  "Race Name": [
    {
      "year_label": "First Year",
      "year_int": 1,
      "date_text": "June 2",
      "month": 6,
      "day": 2,
      "surface": "Turf",
      "location": "Chukyo",
      "distance_category": "Mile",
      "distance_text": "1600 m",
      "distance_m": 1600,
      "rank": "G3",
      "banner_url": "https://...",
      "public_banner_path": "/race/G3/...png"
    }
  ]
}
```

### Frontend types: `web/src/models/datasets.ts`

```typescript
export type RaceInstance = {
  year_label: string        // "First Year"
  year_int: number          // 1, 2, 3
  date_text: string         // "June 2"
  month: number             // 1-12
  day: number               // 1 or 2 (first or second half)
  surface: string
  course_hint?: string
  location?: string
  distance_category: string // "Mile", "Short", "Medium", "Long"
  distance_text: string
  distance_m: number
  banner_url?: string
  public_banner_path?: string
  rank: string              // "G1" | "G2" | "G3" | "OP" | "PRE-OP" | "EX" | "DEBUT" | "MAIDEN"
}

export type RacesMap = Record<string, RaceInstance[]>
```

### Date Key Format: `web/src/utils/race.ts`

Each turn is identified by a `DateKey` string: `Y{year}-{MM}-{half}`
- `year`: 1 (Junior/First), 2 (Classic/Second), 3 (Senior/Third)
- `MM`: zero-padded month (01-12)
- `half`: 1 (first half of month, day=1) or 2 (second half, day=2)

```typescript
export function toDateKey(year: number, month: number, day: number): DateKey {
  const half = day <= 1 ? 1 : 2
  const mm = String(month).padStart(2, '0')
  return `Y${year}-${mm}-${half}`
}
```

### Preset storage: `web/src/models/types.ts`

```typescript
export interface Preset {
  plannedRaces: Record<string, string>          // dateKey -> raceName
  plannedRacesTentative?: Record<string, boolean> // dateKey -> true
}
```

Example: `{ "Y1-06-2": "Junior Make Debut", "Y2-04-1": "Tulip Sho", "Y2-04-1_tentative": true }`

### Zod schema: `web/src/models/config.schema.ts`

```typescript
plannedRaces: z.record(z.string(), z.string())
plannedRacesTentative: z.record(z.string(), z.boolean()).default({})
```

---

## API Endpoint

**`GET /api/races`** (FastAPI, `server/main.py`)

Returns the full `RacesMap` from `datasets/in_game/races.json` as JSON.

Frontend fetches via React Query:
```typescript
const { data: races = {} as RacesMap } = useQuery({
  queryKey: ['races'],
  queryFn: fetchRaces  // GET /api/races
})
```

---

## UI Component Architecture

### File: `web/src/components/presets/RaceScheduler.tsx`

The component renders inside `PresetPanel.tsx` and receives a `presetId` prop.

**Visual layout (single table, all years side by side):**

1. **Rows**: 24 month+half turns (Jan 前半 through Dec 後半)
2. **Columns**: Junior, Classic, Senior (years 1-3)
3. **Cells**: Each cell represents one turn (year + month + half)
4. **Empty cell**: Shows `+` — click to open search dialog
5. **Occupied cell**: Shows selected race name (bold) + optional tentative `?` badge
6. **Search dialog**: Shows races available at that turn by default; free search across all races
7. **Junior pre-June**: Cells are disabled (career starts at June of first year)

**Table layout:**
```
┌────────┬────────────┬────────────┬────────────┐
│  Turn  │  Junior    │  Classic   │  Senior    │
├────────┼────────────┼────────────┼────────────┤
│ Jan 前 │  +         │  +         │  +         │
│ Jan 後 │  +         │  +         │  +         │
│ Feb 前 │  +         │  +         │  +         │
│ ...    │            │            │            │
│ Jun 前 │  (race)    │  (race)    │  (race)    │
│ ...    │            │            │            │
│ Dec 後 │  +         │  (race)    │  (race)    │
└────────┴────────────┴────────────┴────────────┘
```

### Data flow:

```
User clicks cell → handleCellClick(year, month, half)
  → opens Dialog with dateKey set
  → Dialog shows pre-filtered races for that dateKey
  → User can search all races freely
  → User selects a race → patchPreset('plannedRaces', { ...existing, [dateKey]: raceName })
  → Grid re-renders, showing the selected race

Race removal:
  → Click on occupied cell → opens dialog with "Remove" option
  → User removes → patchPreset removes from plannedRaces dict

Tentative toggle:
  → Inside dialog, toggle checkbox → patchPreset('plannedRacesTentative')
```

### Key constants:

```typescript
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

const YEAR_COLS = [
  { label: 'Junior', year: 1 },
  { label: 'Classic', year: 2 },
  { label: 'Senior', year: 3 },
]
```

---

## Backend Integration

The bot (`core/utils/race_index.py`) reads `plannedRaces` from the config to determine which races to target, matching by `dateKey` and `raceName`. The race execution flow in `core/actions/race.py` uses `RaceIndex` to resolve race details, banner matching, and OCR verification during races.

---

## Badges & UI Assets

File: `web/src/constants/ui.ts`
```typescript
export const BADGE_ICON: Record<string, string> = {
  G1: '/badges/G1.png', G2: '/badges/G2.png', G3: '/badges/G3.png',
  OP: '/badges/OP.png', EX: '/badges/EX.png',
  "PRE-OP": '/badges/PRE-OP.png', DEBUT: '/badges/DEBUT.png',
}
export const DEFAULT_RACE_BANNER = '/race/default_banner.png'
```

Static images are served from `/badges/`, `/race/`, `/icons/`, etc. via FastAPI static mounts.

---

## Quick Search Feature

The main view includes a search bar above the year tabs for fast race lookup:

1. **Empty state**: Shows the normal 4-column grid (browse by turn).
2. **Typing a query**: Filters all race instances by name, location, rank, or distance category. Results replace the grid.
3. **Click a result**: Adds the race to its corresponding date key immediately. The `dateKey` chip turns filled + blue if already planned; an `Added` badge shows for duplicates.
4. **Clear button**: X icon resets the search and returns to the grid view.

```
User types "Arima" → searchResults filters flat array
  → shows "Arima Kinen (G1) — Y2-12-2" and "Arima Kinen (G1) — Y3-12-2"
  → click adds the selected year's instance to plannedRaces
  → search clears, grid re-renders with the new selection
```
