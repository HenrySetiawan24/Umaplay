# Skill Buy Flow — Fixes & OCR Reduction

Covers the skill-shop buying loop in [`core/actions/skills.py`](../../../../core/actions/skills.py)
(`SkillsFlow.buy` / `SkillsFlow._scan_and_click_buys`).

## Background: Original Behavior

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
   - Every scroll pass calls `record_seen()` for ALL visible skills to populate `SkillMemoryManager`
   - The `_nearly_same()` early-stop is the only exit signal, which only triggers at the very bottom

### Data gap

`datasets/in_game/skills.json` (517 entries) has: `id`, `icon_filename`, `icon_src`, `name`, `description`, `color_class`, `rarity`, `grade_symbol`. **No `skill_pts` field.**

Gametora source also has no `skill_pts`.

### Why OCR instead of dataset lookup?

`skills.json` and the Gametora source both lack `skill_pts` data. Adding OCR is:
- **Accurate** — reads the exact cost displayed on each card
- **Zero external deps** — no new scraping, no hardcoded mapping to maintain
- **Low overhead** — digit-only OCR is fast (~20-50ms per card)
- **Enables dual benefit**: both the early exit AND a guard against clicking unaffordable BUY buttons

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

---

## Part 1 — SP early-exit fix (done)

The "quick loop break when SP drops below a threshold" (the SP-based early exit
in `buy()`) was not firing. Two compounding causes:

### Cause 1 — the `9999` sentinel disabled tracking

On the first pass the SP total was read once:

```python
running_sp = self.ocr.digits(sp_crop)
if running_sp <= 0:
    running_sp = 9999
```

`ocr.digits()` returns **`-1`** on any OCR miss (see `ocr_local.py`). The SP crop
is a thin top-right band that is easy to misread. A single miss locked
`running_sp = 9999` for the **entire** buy session, so:

- `running_sp < min_visible_cost` was never true → early-exit never fired
- the per-skill affordability guard (`running_sp < cost`) never tripped

**Fix:** keep `running_sp = None` on a miss and **retry the read each pass** until
a real value is obtained. The SP figure is always on-screen, so a transient miss
must not permanently defeat tracking.

### Cause 2 — `purchased_cost` undercounted

```python
purchased_cost = cost
```

This **overwrote** on multi-buys (only the last skill in a pass counted) and
**ignored the click multiplier** (a ◎ skill clicks twice but subtracted one cost).
So `running_sp` barely dropped and the break stayed dormant.

**Fix:** accumulate the real spend per pass:

```python
purchased_cost += cost * max(1, click_counts)
```

### Assumption to confirm

The arithmetic design (read SP once, subtract as we buy) implies the game's top
SP counter does **not** decrement live on each BUY click — it commits at Confirm.
If it *does* decrement live, re-reading SP each pass would be simpler and
self-correcting. Flagged for verification.

---

## Part 2 — OCR reduction (planned)

A pass currently costs up to **2N + 1** OCR calls (N = visible skill cards): a
`digits` per card for cost, a `text` per card for the title, plus the SP read —
all sequential round-trips. Ranked by payoff:

### 1. Batch the per-card OCR (biggest win)

The OCR layer already exposes `batch_text` / `batch_digits`. Collect all title
crops → one `batch_text`; all cost crops → one `batch_digits`. Collapses ~2N
sequential calls into **2 per pass**. For remote OCR this is the dominant latency
saver.

### 2. Batch costs too (instead of target-only cost OCR)

Original idea was to OCR cost only for matched targets. **Decision: batch all
candidate costs in one `batch_digits` call instead.** Batching already collapses
N cost reads into a single call, so we keep the safer *global* `min_visible_cost`
"can I afford anything at all" check without the early-stop regression that
target-only costing risks (it could stop before reaching a cheaper target that is
still a couple of scrolls down). Net OCR cost: 1 call either way.

### 3. Drop the redundant cost re-OCR in the debug log

The affordability-skip log calls `self.ocr.text(cost_crop)` purely to print the
skill, re-OCRing a crop already read as `cost`. Remove it; log `cost` directly.
(1 line, pure win.)

### 4. Gate cost OCR behind the active-buy classifier

Move the `predict_proba` active-buy check (local model, no OCR) **before** the
cost OCR so greyed/inactive cards cost zero OCR.

### Combined effect

Proposals 1–4 take a pass from ~2N + 1 down to **~2 OCR calls regardless of N**.

Target shape of `_scan_and_click_buys`:

1. Gather squares + matched BUY buttons.
2. Run the local active-buy classifier per card (no OCR); drop inactive cards.
3. `batch_text` all candidate title crops → match against targets.
4. `batch_digits` cost crops only for matched targets → affordability.
5. Decide quotas + click.

### Lower priority / more involved

- **#5** Memoize title OCR by YOLO square fingerprint to skip re-reading
  overlapping cards across consecutive scrolls.
- **#6** Tune scroll overlap to cut total pass count.

---

## Implementation Details (from Plan)

### SP cost crop region

For each detected `skills_square` with bounding box `xyxy`:
- The SP cost number is displayed in the **bottom-left** area of the card
- Crop: bottom 15% of the square height, left 40% of the square width
- Approximate region: `(x0, y1 - h*0.15, x0 + w*0.40, y1)` where `w = x1-x0`, `h = y1-y0`

```python
x0, y0, x1, y1 = sq["xyxy"]
w, h = x1 - x0, y1 - y0
cost_crop = crop_pil(game_img, [x0, y1 - int(h * 0.15), x0 + int(w * 0.40), y1], pad=0)
cost_text = self.ocr.digits(cost_crop).strip()
cost = int(cost_text) if cost_text.isdigit() else 0
```

### `buy()` signature

```python
def buy(self, skill_list, *, max_scrolls=15, scroll_time_range=(0.08, 0.38), early_stop=True, ocr_cost=True):
```

### Risks and mitigations

| Risk | Mitigation |
|---|---|
| SP cost OCR fails (blurry text, unusual font) | Fall back to `cost=0` (skip affordability guard, let BUY button classifier handle it) |
| SP region crop wrong (different resolution) | Use proportional coordinates relative to image size; test at 1920×1080 and 2560×1440 |
| `running_sp` desyncs (purchase failed but cost was subtracted) | Re-OCR total SP from game_img every 3 passes to re-sync |
| Missing a skill because we stopped scanning early | `record_seen()` already fires on the final pass before break; skill memory is intact |
| SP cost OCR picks up noise (non-digit text) | `ocr.digits()` returns only digits; empty/non-numeric → `cost=0` → skip guard |

### Estimated time savings

| Before | After |
|---|---|
| Always scrolls to bottom (~5-6 passes × ~0.5s = ~2.5-3s) | Stops when SP exhausted (typically 1-3 passes = ~0.5-1.5s) |
| 15 `max_scrolls` safety margin always unused | Early exit fires naturally; 15 scrolls remains as safety net |
| Spends ~0.5s per pass scanning + scrolling | Adds ~0.1-0.3s per pass for SP cost OCR, but fewer passes = net savings |

**Estimated savings: ~1-2s per skills screen visit. Over ~10-15 race day visits = ~10-30s total per run.**

---

## Status

- [x] Part 1 — SP early-exit fix
- [x] Part 2.1 — batch per-card OCR (`batch_text` + `batch_digits`)
- [x] Part 2.2 — batch costs (kept global `min_visible_cost`)
- [x] Part 2.3 — drop redundant debug re-OCR
- [x] Part 2.4 — gate cost OCR behind active-buy classifier (Phase 1)

`_scan_and_click_buys` now runs in three phases: (1) gather active candidates via
the local classifier, (2) two batched OCR calls for all titles + costs, (3)
decide/click per candidate. A pass is ~2 OCR calls regardless of card count.

Not yet done: #5 (memoize title OCR across overlapping scrolls), #6 (scroll
overlap tuning).

---

## Example images

> Reuse from `debug/skills/` captures where available; the screens below still need
> representative shots dropped into `images/`. Useful annotations: the **BUY** button
> (and the cost ROI anchored left of it), the **SP total** band (top-right), and an
> **inactive/greyed** card vs an active one.

| Placeholder file | Screen to capture |
|------------------|-------------------|
| `images/skills-shop-cards.png` | The skill shop with several cards — label the title, the cost (between `-`/`+`), and the BUY button. |
| `images/skills-sp-region.png` | The top-right **SP total** region the early-exit reads. |
| `images/skills-inactive-card.png` | A greyed/unaffordable card (the active-buy classifier gate skips its OCR). |

*(See [README](README.md#images-still-needed).)*
