# Skill Buy Optimization — Implementation Plan

## Goal

Reduce wasted scrolling in the skill buying flow by stopping early when the bot has exhausted its skill points, while preserving skill memory recording for the remaining visible skills on the final screen.

## Approach

**OCR the SP cost from each skill card** during `_scan_and_click_buys()`, then use it to track remaining SP in the `buy()` loop and break when no affordable skills remain.

### Why OCR instead of dataset lookup?

`skills.json` and the Gametora source both lack `skill_pts` data. Adding OCR is:
- **Accurate** — reads the exact cost displayed on each card
- **Zero external deps** — no new scraping, no hardcoded mapping to maintain
- **Low overhead** — digit-only OCR is fast (~20-50ms per card)
- **Enables dual benefit**: both the early exit AND a guard against clicking unaffordable BUY buttons

---

## Phase 1: Add SP cost OCR to `_scan_and_click_buys()`

**File:** `core/actions/skills.py` — `_scan_and_click_buys()` method (~line 382)

### 1a. Compute SP cost crop region

For each detected `skills_square` with bounding box `xyxy`:
- The SP cost number is displayed in the **bottom-left** area of the card
- Crop: bottom 15% of the square height, left 40% of the square width
- Approximate region: `(x0, y1 - h*0.15, x0 + w*0.40, y1)` where `w = x1-x0`, `h = y1-y0`

```python
# Inside the per-square loop, after getting sq["xyxy"]:
x0, y0, x1, y1 = sq["xyxy"]
w, h = x1 - x0, y1 - y0
cost_crop = crop_pil(game_img, [x0, y1 - int(h * 0.15), x0 + int(w * 0.40), y1], pad=0)
```

### 1b. OCR the cost number

Use the existing OCR interface already available in the method:

```python
cost_text = self.ocr.digits(cost_crop).strip()
cost = int(cost_text) if cost_text.isdigit() else 0
```

The method already has `self.ocr` available (set at initialization).

### 1c. Return cost alongside other square data

Currently `_scan_and_click_buys()` returns `(clicked: bool, game_img, parsed, cur_ocr_sig)`. We need to also return the **minimum cost seen** on the current screen and track **cost of purchased skill**.

Add to return: `(clicked, game_img, parsed, cur_ocr_sig, min_visible_cost, purchased_cost)`

- `min_visible_cost`: minimum cost among all detected skill squares on this pass (for the "can we afford anything?" check)
- `purchased_cost`: cost of the skill that was actually bought (0 if none)

### 1d. Update call site in `buy()`

```python
clicked, game_img, dets, cur_ocr_sig, min_visible_cost, purchased_cost = (
    self._scan_and_click_buys(...)
)
```

---

## Phase 2: Track SP in `buy()` loop

**File:** `core/actions/skills.py` — `buy()` method (~line 94)

### 2a. Capture initial SP

Before the scroll loop, grab the total SP from the first screenshot. The SP text is always visible at the top of the skills screen. Use direct crop OCR (no full YOLO pass) since the region position is known.

```python
# Before the scroll loop (line ~136), after first capture:
# Crop the SP region from the top-right area of game_img
h, w = game_img.size  # PIL Image
sp_crop = crop_pil(game_img, [int(w * 0.82), 0, int(w * 0.97), int(h * 0.04)], pad=0)
initial_sp_text = self.ocr.digits(sp_crop).strip()
running_sp = int(initial_sp_text) if initial_sp_text.isdigit() else 9999
```

The SP region is in the **top-right** of the skills screen, typically occupying ~15% of width × ~4% of height.

> **Note:** The crop coordinates are approximate and may need adjustment based on screen resolution. Use a scaling factor relative to image dimensions for robustness.

### 2b. Track SP after each pass

```python
running_sp -= purchased_cost  # subtract cost of what was bought
```

### 2c. Early exit conditions

Insert after the existing early-stop check (after the `_nearly_same()` block, ~line 163):

```python
# SP-based early exit: can't afford anything visible
if running_sp < min_visible_cost or running_sp < 100:
    logger_uma.info(
        "SP EXHAUSTED: %d SP remaining, min visible cost %d, stopping scroll",
        running_sp, min_visible_cost
    )
    break
```

Also insert a **guard before clicking BUY** inside `_scan_and_click_buys()`:

```python
# Inside the per-square loop, after matching target:
if cost > 0 and running_sp < cost:
    logger_uma.info(
        "Cannot afford %s (%d SP, only %d remaining), skipping",
        best_name, cost, running_sp
    )
    continue
```

This prevents the bot from clicking BUY on an unaffordable skill, which would waste time going through the CONFIRM → error flow.

---

## Phase 3: Handle the "final screen" record_seen() problem

When the SP early exit fires mid-list, we still want to record the skills visible on the current screen into skill memory (for hint priority gating).

**No change needed** — the existing code already calls `record_seen()` for every detected square inside `_scan_and_click_buys()`. The last scroll pass (which triggered the SP exit) will have already recorded all visible skills before the break.

---

## Phase 4: Update `buy()` signature and callers

### New signature

```python
def buy(
    self,
    skill_list,
    *,
    max_scrolls=15,
    scroll_time_range=(0.08, 0.38),
    early_stop=True,
    ocr_cost=True,  # NEW: enable SP cost OCR
):
```

### Callers (no changes needed if default `ocr_cost=True`)

| Caller | File | Line | Change needed |
|--------|------|------|---------------|
| URA raceday | `core/actions/ura/agent.py` | 344 | None |
| URA finals | `core/actions/ura/agent.py` | 567 | None |
| UnityCup raceday | `core/actions/unity_cup/agent.py` | 380 | None |
| UnityCup finals | `core/actions/unity_cup/agent.py` | 706 | None |
| Hint recheck | `core/agent_scenario.py` | 391 | None |

### Edge case: post-hint recheck (agent_scenario.py:391)

This call happens after buying a hint from a support card event. The bot enters the skills screen with potentially very few SP (maybe 0). The SP early exit will naturally break immediately on the first pass, which is correct behavior.

---

## Flow diagram (simplified)

```
buy() called with skill_list
  │
  ├─ OCR initial SP → running_sp
  │
  └─ loop (max 15 scrolls):
       │
       ├─ _scan_and_click_buys()
       │    ├─ for each skills_square:
       │    │    ├─ OCR title → match target
       │    │    ├─ OCR cost from bottom-left crop
       │    │    ├─ if cost > running_sp: skip (can't afford)
       │    │    ├─ else: click BUY, running_sp -= cost
       │    │    └─ record_seen() always
       │    └─ return (clicked, ..., min_visible_cost, purchased_cost)
       │
       ├─ running_sp -= purchased_cost
       │
       ├─ all targets bought? → break (existing)
       │
       ├─ running_sp < min_visible_cost? → break (NEW)
       │
       └─ _nearly_same() × 3? → break (existing, safety net)
```

---

## Files to modify

| File | Changes | Impact |
|------|---------|--------|
| `core/actions/skills.py` | `_scan_and_click_buys()` — add SP cost OCR, return cost data | Medium — add ~30 lines |
| `core/actions/skills.py` | `buy()` — track running_sp, add early exit, pass to caller | Medium — add ~20 lines |
| None other | All callers use unchanged signatures | None |

---

## Estimated time savings

| Before | After |
|--------|-------|
| Always scrolls to bottom (~5-6 passes × ~0.5s = ~2.5-3s) | Stops when SP exhausted (typically 1-3 passes = ~0.5-1.5s) |
| 15 `max_scrolls` safety margin always unused | Early exit fires naturally; 15 scrolls remains as safety net |
| Spends ~0.5s per pass scanning + scrolling | Adds ~0.1-0.3s per pass for SP cost OCR, but fewer passes = net savings |

**Estimated savings: ~1-2s per skills screen visit. Over ~10-15 race day visits = ~10-30s total per run.**

---

## Risks and mitigations

| Risk | Mitigation |
|------|------------|
| SP cost OCR fails (blurry text, unusual font) | Fall back to `cost=0` (skip affordability guard, let BUY button classifier handle it) |
| SP region crop wrong (different resolution) | Use proportional coordinates relative to image size; test at 1920×1080 and 2560×1440 |
| `running_sp` desyncs (purchase failed but cost was subtracted) | Re-OCR total SP from game_img every 3 passes to re-sync |
| Missing a skill because we stopped scanning early | `record_seen()` already fires on the final pass before break; skill memory is intact |
| SP cost OCR picks up noise (non-digit text) | `ocr.digits()` returns only digits; empty/non-numeric → `cost=0` → skip guard |

---

## Testing

1. **Unit test**: Mock OCR to return known SP cost values, verify `buy()` breaks at the correct point
2. **Integration test**: Run `buy()` with a small `skill_list` and limited `initial_sp`, verify early exit fires
3. **Manual test**: Observe `buy()` in-game with low SP, verify it stops scrolling after 1-2 passes
4. **Regression**: Run normal full buy flow (high SP, many targets), verify all targets still purchased
