# Skill Buy Optimization — Research

## Current Behavior

### Skill buying flow

1. **Entrance gate** (`core/actions/ura/agent.py:~317` / `core/actions/unity_cup/agent.py:~353`):
   - OCR total skill points: `extract_skill_points()` → `lobby.state.skill_pts`
   - If `skill_pts >= 700` and turn/delta gates pass: enter skills screen and call `buy()`

2. **`SkillsFlow.buy()`** (`core/actions/skills.py:94-203`):
   - Loops up to 15 scroll passes (`max_scrolls=15`)
   - Each pass: `_scan_and_click_buys()` → detect skill squares → OCR title → match targets → click BUY if active → confirm → close
   - Scrolls a fixed amount each pass (`_scroll_once()`: 15-25% of screen height)
   - Two exit conditions:
     - All target skills purchased (line 168)
     - `_nearly_same()` returns True for 3 consecutive passes (line 153-159) — only fires at the bottom of the list

3. **Why it scrolls to the bottom even with no SP left:**
   - No SP cost data exists in `skills.json` — the bot never checks per-skill cost
   - Once past the 700 SP gate, `buy()` has zero awareness of remaining points
   - Every scroll pass calls `record_seen()` for ALL visible skills (line 478-485) to populate `SkillMemoryManager`
   - The `_nearly_same()` early-stop is the only exit signal, which only triggers at the very bottom

### Data gap

`datasets/in_game/skills.json` (517 entries) has: `id`, `icon_filename`, `icon_src`, `name`, `description`, `color_class`, `rarity`, `grade_symbol`. **No `skill_pts` field.**

Gametora source (`skills.03d569a7.json`) also has no `skill_pts`.

### Relevant files

| File | Lines | Role |
|------|-------|------|
| `core/actions/skills.py` | 94-203 | `buy()` — main loop |
| `core/actions/skills.py` | 382-539 | `_scan_and_click_buys()` — per-pass detection + matching + purchase |
| `core/actions/skills.py` | 691-751 | `_scroll_once()` — fixed scroll |
| `core/actions/skills.py` | 220-310 | `_nearly_same()` — bottom detection |
| `core/actions/skills.py` | 478-485 | `record_seen()` for every visible skill |
| `core/actions/ura/agent.py` | 309-369 | SP gate & `buy()` call |
| `core/actions/unity_cup/agent.py` | 345-405 | SP gate & `buy()` call |
| `core/agent_scenario.py` | 288-308, 391 | Hint recheck flow |
| `core/perception/extractors/state.py` | 551-604 | `extract_skill_points()` (total SP OCR) |
| `core/utils/skill_memory.py` | 9-419 | Skill memory for hint gating |
| `core/utils/skill_matching.py` | 33-203 | SkillMatcher (name-only, no cost data) |
