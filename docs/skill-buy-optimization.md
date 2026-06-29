# Skill Buy Flow — Fixes & OCR Reduction

Covers the skill-shop buying loop in [`core/actions/skills.py`](../core/actions/skills.py)
(`SkillsFlow.buy` / `SkillsFlow._scan_and_click_buys`).

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
