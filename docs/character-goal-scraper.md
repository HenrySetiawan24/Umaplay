# Character Goal Data Scraper Plan

## Overview

Scrape character goal schedules from Gametora into local JSON datasets, then use them in the backend to infer run-history date keys when OCR fails. Also provide a character selector in the preset UI.

**Source:** [gametora.com](https://gametora.com/umamusume/characters)
**Output:** `datasets/in_game/character_index.json` + per-character files in `datasets/in_game/characters/`

---

## Why This Matters

The `turn` value stored in run history is a per-goal countdown (~4–11 range), not a per-year counter. When OCR fails to read the full date from the game UI, we lose month/half granularity. Character goal data gives us **absolute career-turn anchors** (turn 12, 27, 34, … 72) that map directly to known dates, letting us infer the date for every intervening training turn.

---

## API Structure

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

---

## Implementation Order

1. Write `datasets/scrape_character_goals.py`
2. Run it once to populate `character_index.json` + `characters/`
3. Write `core/utils/character_data.py` (loader + turn→date helper)
4. Integrate into `_infer_date_from_turn()` in `agent_scenario.py`
5. Add character selector to preset UI
6. Wire character selection → backend goal loading
