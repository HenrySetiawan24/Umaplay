# Trackblazer (Make A New Track) — Implementation Plan

**Status:** Planning  
**Target scenario key:** `trackblazer`  
**Aliases:** MANT, Make A New Track, Trackblazer: Start of the Climax  
**Game release:** March 12, 2026 (Global)

---

## Overview

Trackblazer is the 3rd permanent career scenario in Umamusume: Pretty Derby. It plays fundamentally differently from URA Finale and Unity Cup — it's a **race-centric sandbox** with no character-specific goals, no secret events, and a heavy focus on the **Pro Shop** item economy.

### Key Differences from Existing Scenarios

| Aspect | URA / Unity Cup | Trackblazer |
|--------|----------------|-------------|
| Goals | Character-specific race goals | Year-end Grade Point thresholds |
| Races per run | ~12-15 | 30-40 |
| Secret events | Yes | Disabled entirely |
| Story character | Aoi (URA) / Riko (Unity Cup) | None |
| Special mechanic | Director / Spirit Burst | **Pro Shop** (buy items with race coins) |
| Finale | URA Finals (3 rounds elimination) | **Twinkle Star Climax** (Victory Points) |
| Key deck stat | Skill/Hint focus | **Race Bonus** (min 50%) |
| SCREEN: Shop | None | New Pro Shop UI with item grid |
| SCREEN: Items | None | Item usage buttons on training/race screens |
| SCREEN: Rivals | None | VS icon on race banners |
| Screen classifier | `classify_screen_ura` / `classify_screen_unity_cup` | Needs new `classify_screen_trackblazer` |
| YOLO weights | `uma_ura.pt` / `uma_unity_cup.pt` | New `uma_trackblazer.pt` likely needed |

---

## Architecture Touchpoints

Every file that must be touched to add a new scenario (full checklist in `docs/ai/SOPs/adding-new-scenario.md`):

### Python Backend

| # | File | Action |
|---|------|--------|
| 1 | `core/scenarios/trackblazer.py` | **Create** — register `compute_support_values` + `decide_action_training` with `registry.register("trackblazer", ...)` |
| 2 | `core/scenarios/__init__.py` | Add `from . import trackblazer` |
| 3 | `core/scenarios/registry.py` | Optionally add alias in `resolve()` |
| 4 | `core/actions/trackblazer/` | **Create directory** with `__init__.py`, `training_check.py`, `training_policy.py`, `agent.py`, `lobby.py`, `shop.py` |
| 5 | `core/settings.py` | Add `AGENT_NAME_TRACKBLAZER`, `YOLO_WEIGHTS_TRACKBLAZER`, update `normalize_scenario()`, `resolve_agent_name()`, `resolve_yolo_weights_path()`, add `WEAK_TURN_SV_BY_SCENARIO` / `RACE_PRECHECK_SV_BY_SCENARIO` entries |
| 6 | `core/ui/scenario_prompt.py` | Add `trackblazer` to `ALLOWED_SCENARIOS` and the prompt list |

### Web UI

| # | File | Action |
|---|------|--------|
| 7 | `web/src/models/types.ts` | Add `'trackblazer'` to `activeScenario` union type |
| 8 | `web/src/models/config.schema.ts` | Add to `activeScenario` Zod enum; add `scenarioPresetDefaults` entry; seed scenario branch in `appConfigSchema` |
| 9 | `web/src/store/configStore.ts` | Update `normalizeScenario()` to accept `'trackblazer'`; update `ensureScenarioMap()` |
| 10 | `web/src/components/general/GeneralForm.tsx` | Add `ToggleButton` for Trackblazer with icon |
| 11 | `web/src/components/presets/strategy/TrackblazerStrategy.tsx` | **Create** — strategy component implementing `StrategyComponentProps` |
| 12 | `web/src/components/presets/strategy/index.ts` | Register `trackblazer: TrackblazerStrategy` |
| 13 | `web/public/scenarios/trackblazer_icon.png` | Add scenario icon |

### Server / Config

| # | File | Action |
|---|------|--------|
| 14 | `server/utils.py` | Update `load_config()` to seed `trackblazer` branch |

---

## Implementation Phases

### Phase 1 — Scaffold + Basic Loop

**Goal:** Bot can start a Trackblazer run, navigate basic screens, and train/race with URA-like logic.

**Tasks:**
1. Add `trackblazer` key throughout Python backend (settings, scenarios, actions stubs)
2. Create `core/actions/trackblazer/` with stubs:
   - `agent.py` — `AgentTrackblazer` extending `AgentScenario`, basic `run()` loop
   - `lobby.py` — `LobbyFlowTrackblazer.process_turn()` (start with URA copy)
   - `training_check.py` — `compute_support_values()` (start with URA copy)
   - `training_policy.py` — `decide_action_training()` (start with URA copy)
3. Create basic screen classifier: `classify_screen_trackblazer()` recognizing:
   - Trackblazer-specific lobby (no director/PAL, different layout)
   - Training screen (reuse existing)
   - Race screen (reuse existing)
   - Pro Shop screen (new — needs placeholder)
   - Twinkle Star Climax (new — needs placeholder)
4. Wire Web UI: toggle button, stub strategy component, schema/types/store updates
5. Register in `core/scenarios/registry.py`

**Deliverable:** Trackblazer selectable in UI. Bot enters career, trains, and races using copied URA logic. Shop/Twinkle Star screens fall through to generic handling.

**Estimated effort:** 3-5 hours

---

### Phase 2 — Pro Shop Detection & Item Management

**Goal:** Bot can open the shop, read coin balance, identify items, and make purchase decisions.

**Tasks:**
1. Collect ~50-100 labeled screenshots of the Pro Shop UI
2. Decide approach: YOLO retraining vs template matching vs OCR-based item detection
   - YOLO: new class per item slot + OCR for item name/price
   - Template: match item icons from known catalog
   - Hybrid: YOLO detects shop regions, OCR reads item text + price
3. Implement `core/actions/trackblazer/shop.py`:
   - `should_visit_shop(state)` — check coin balance, turn count, needed items
   - `read_shop_items(frame)` — detect available items + prices + discount tags
   - `purchase_decision(items, state)` — prioritize items by tier list
   - `navigate_shop(target_item)` — click to buy, handle confirmation
4. Add `TrackblazerAdvancedSettings` to config (purchase thresholds, auto-use toggles)
5. Extend Web UI `TrackblazerStrategy.tsx` with shop config section

**Shop Item Priority (from uma.guide & Game8):**

| Tier | Items | Use Case |
|------|-------|----------|
| SS | Stat Scrolls/Manuals (all types) | Immediate use — flat stat boost |
| SS | Good-Luck Charm | Save for 0-energy turns — prevents training failure |
| SS | Royal Kale / Juice / Berry | Save for summer training stacks |
| SS | Cupcakes (Sweet/Plain) | Mood recovery before training |
| S | Vita 65 / 40 / 20 | Energy recovery |
| S | Master Cleat Hammer / Artisan Cleat Hammer | Save for G1s and Twinkle Star Climax |
| S | Ankle Weights (all types) | Slot-specific training bonus |
| S | Reset Whistle | Reroll bad training RNG |
| A | Megaphones (Empowering / Motivating / Coaching) | Training boost stacking |
| A | Grilled Carrots | Flat stats early-game |
| B | Glow Sticks | Fan farming for G1s |
| B | Status heals (Miracle Cure, Rich Hand Cream, etc.) | Buy only if condition is active |
| C | Scholar Hat (Fast Learner) | 280 coins — expensive, situational |
| C | Training Facility Items | 150 coins — only with surplus |
| Skip | Notepads, Energy Drink, DVDs, etc. | Inefficient coin-to-value ratio |

**Deliverable:** Bot autonomously shops for items and builds an inventory.

**Estimated effort:** 6-10 hours

---

### Phase 3 — Item Usage Optimization

**Goal:** Bot uses items intelligently at the right times.

**Tasks:**
1. Implement `core/actions/trackblazer/item_usage.py`:
   - Pre-training item stack (anklets, megaphones, kale/berry)
   - Pre-race item stack (hammers, cleats, glow sticks)
   - Emergency items (Good-Luck Charm on 0-energy, cupcakes for bad mood)
   - Summer camp item dumping (use all stackable items during summer turns)
2. Add state tracking: current inventory, active buffs, turn count, summer camp detection
3. Configurable presets: "Aggressive" (use items freely) vs "Conservative" (save for key turns)

**Deliverable:** Items are automatically used at optimal timings, mimicking human play.

**Estimated effort:** 4-6 hours

---

### Phase 4 — Race Planning & Grade Points

**Goal:** Bot makes smart race-vs-training decisions based on Grade Point requirements and available races.

**Tasks:**
1. Replace goal-based race scheduling with **Grade Point optimization**:
   - Track current Grade Points per year via OCR (read GP counter at top of screen)
   - Calculate remaining turns + remaining GP needed
   - Target highest-grade races (G1 > G2 > G3 > OP) for GP efficiency
   - Factor in placement risk (1st = 100% GP, 2nd = 60%, 6+ = 10%)
2. **Rival race detection:**
   - YOLO class or template match for the VS icon on race buttons
   - When detected, prioritize rival races for skill hints
   - Track which skills were obtained from rivals to avoid duplicates
3. **Epithet route tracking:**
   - Define which race sets form epithets (e.g., "Sprint Route", "Classic Route")
   - Track progress toward completing routes
   - Prioritize route-completing races when close to a bonus
4. **Race fatigue management:**
   - Track consecutive races
   - Skip 4th+ consecutive race unless end-of-year deadline
   - Use items to mitigate fatigue when necessary
5. Configurable race planning in Web UI:
   - Target number of races (default: 30-40)
   - Grade point safety margin
   - Epithet route preferences

**Deliverable:** Bot independently plans which races to enter, when to skip, and how to meet Grade Point targets.

**Estimated effort:** 6-8 hours

---

### Phase 5 — Twinkle Star Climax

**Goal:** Bot handles the 3-race finale correctly.

**Tasks:**
1. Detect Twinkle Star Climax entry screen
2. Understand Victory Points scoring:
   - 1st = most VPs across 3 races
   - Not an elimination bracket — cumulative points decide winner
3. Use saved hammers/cleats/glow sticks for maximum performance
4. Handle race results screen and post-Climax flow

**Deliverable:** Bot completes full Trackblazer career end-to-end.

**Estimated effort:** 2-3 hours

---

## Unknowns & Risks

| Risk | Mitigation |
|------|-----------|
| **YOLO retraining** — Trackblazer has unique UI elements (Shop, VS icon, Twinkle Star, item buttons). Current models (`uma_ura.pt`) won't recognize them. | Start with template matching fallback for new screens. Train new `uma_trackblazer.pt` model once enough labeled data is collected. |
| **Pro Shop layout** — Unknown click coordinates and item grid layout. | Use dev notebooks (`dev_play.ipynb` style) to capture and analyze shop frames before implementing. |
| **Grade Point OCR** — Need reliable number reading from top-of-screen GP counter. | Reuse existing `core/perception/extractors/` or `core/perception/digits.py` OCR pipeline. |
| **Rival VS icon** — Small icon may be hard to detect reliably. | Try template matching first (cheap), then YOLO if accuracy is insufficient. |
| **Item inventory** — Bot needs to track what it owns across turns. | Add in-memory `TrackblazerState` object with inventory dict, persisted per run. |
| **Consecutive race fatigue** — The game has a hidden fatigue system with mood drops and stat penalties. | Model the probabilities from the community-documented fatigue table and make race decisions accordingly. |
| **Shop refresh timing** — Shop refreshes every 6 turns. Races can add items for 3 turns. | Track turn count modulo 6; detect shop refresh as a screen state. |

---

## Estimated Total Effort

| Phase | Hours | Dependencies |
|-------|-------|-------------|
| 1 — Scaffold + Basic Loop | 3-5 | None |
| 2 — Pro Shop Detection | 6-10 | Phase 1, screenshots |
| 3 — Item Usage | 4-6 | Phase 2 |
| 4 — Race Planning & GP | 6-8 | Phase 1 |
| 5 — Twinkle Star Climax | 2-3 | Phase 1 |
| **Total** | **21-32** | |

---

## References

- [Magody/Umaplay Issue #113 — Request for Trackblazer Support](https://github.com/Magody/Umaplay/issues/113)
- [uma.guide — Trackblazer Guide](https://uma.guide/guides/trackblazer)
- [Game8 — Trackblazer Scenario Guide](https://game8.co/games/Umamusume-Pretty-Derby/archives/580723)
- [Game8 — Trackblazer Items Tier List](https://game8.co/games/Umamusume-Pretty-Derby/archives/585850)
- [LootBar — Trackblazer MANT Guide](https://www.lootbar.com/blog/en/uma-musume-pretty-derby-trackblazer-mant-guide.html)
- [Reddit — Advice/Tips for Trackblazer](https://www.reddit.com/r/UmaMusume/comments/1rqdxre/advicetips_for_the_new_scenario_make_a_new)
- [Reddit — Minimal Thought Intensity Guide](https://www.reddit.com/r/UmamusumeGame/comments/1rz3ug9/minimal_thought_intensity_guide_to_trackblazer)
- [Trackblazer Race Scheduler Tool](https://race.daftuyda.moe/)

## Related Docs

- `docs/ai/SOPs/adding-new-scenario.md` — Step-by-step SOP for adding any new scenario
- `docs/ai/SYSTEM_OVERVIEW.md` — Full system architecture
- `docs/race_scheduler_architecture.md` — Race scheduler data model
