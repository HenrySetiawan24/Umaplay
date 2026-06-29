# Race Flow — OCR & Await Optimization Plan

**Status:** Planned — not yet implemented.

Covers the race-day routine in [`core/actions/race.py`](../core/actions/race.py):
`run()` (selection → confirm → pre-race lobby) → `lobby()` (RACE → skip race →
skip win/trophy screen → placement → NEXT → NEXT).

---

## 1. Current cost inventory

### OCR calls (cost, highest first)

| Site | Where | Cost |
|------|-------|------|
| **Placement read** | `lobby()` [race.py:865](../core/actions/race.py#L865) & [race.py:975](../core/actions/race.py#L975): `self.ocr.text(img_pl, min_conf=0.1)` | **Full-screen OCR of the entire 1220×2712 leaderboard** — by far the most expensive single OCR in the flow, run once per race. |
| Race-name match | `_pick_race_square` [race.py:556](../core/actions/race.py#L556), [race.py:617](../core/actions/race.py#L617): per-square `self.ocr.text(...)` | N squares × OCR, repeated across up to 3 scrolls during selection. |
| View-Results button | `_pick_view_results_button` [race.py:339](../core/actions/race.py#L339): OCR per candidate white button | A few small OCRs per lobby entry. |
| Strategy labels | `set_strategy` [race.py:1176](../core/actions/race.py#L1176): OCR per style button | Only when `select_style` is set. |

### Blind fixed sleeps (wall-clock, highest first)

| Sleep | Where | Note |
|-------|-------|------|
| `sleep(7)` | `run()` [race.py:1319](../core/actions/race.py#L1319) | Blind pre-wait **before** the `button_change` poll loop (which itself waits up to 14s). Pure dead time — the poll already handles arrival. |
| `sleep(5)` | `lobby()` [race.py:886](../core/actions/race.py#L886) | After first RACE click, before re-confirm. |
| `sleep(4)` | `lobby()` [race.py:930](../core/actions/race.py#L930) | Before the skip loop. |
| `sleep(3)` | `run()` [race.py:1346](../core/actions/race.py#L1346) | After strategy select ("wait for white buttons to disappear"). |
| `sleep(2)` | `run()` [race.py:1256](../core/actions/race.py#L1256) | After nav into raceday list. |
| `sleep(1.2)` | `run()` [race.py:1290](../core/actions/race.py#L1290) | Let RACE popup grow. |
| `~3s` | `lobby()` [race.py:996-1005](../core/actions/race.py#L996-L1005) | Try-again probe: 6 × `sleep(0.5)`. |

Plus loop budgets: confirm loop 12s, skip loop 12s+2s/skip, NEXT click timeouts 4.6s + 6s.

**Blind fixed sleeps alone total ≈ 22s per race**, much of it redundant with the
poll loops that follow.

---

## 2. Part A — OCR reduction

### A1. Replace full-screen placement OCR with a row-1 highlight color check (no OCR)

**We only need win/not-win, not the exact placement.** The result leaderboard
highlights the *trainee's* row cream/yellow; every other row is white. When the
trainee wins they are 1st, so **row 1 is highlighted ⟺ win**. This needs a single
small color sample — no OCR, no trainee name.

Replace the two `self.ocr.text(img, min_conf=0.1)` full-screen reads at
[race.py:865](../core/actions/race.py#L865) and [race.py:975](../core/actions/race.py#L975)
with `_row1_is_win(img)`:

- Content-aware bounds (reuse the letterbox detection from the skills SP fix), then
  sample the median color of row 1's name-band: content-relative
  x `0.34–0.60`, y `0.415–0.485`.
- Convert to HSV; **win = saturation ≥ 0.10** (highlight) vs ~0 (white).

**Validation (already done):** across all 145 `debug/race/placement/*.png`
captures the signal is perfectly bimodal — wins land at `sat=0.220, hue=49`,
losses at `sat=0.000`. One borderline at `0.046`, still clearly a loss. A `0.10`
threshold separates every sample.

**Effect:**
- Eliminates the single most expensive OCR in the whole race flow (a full
  1220×2712 detect+recognize, run once per race) — replaced by one median-color
  read of a tiny crop.
- **Fixes a correctness bug:** the current OCR regex grabs the first `Nst` among
  the 5+ leaderboard rows, so it mislabels wins as losses — e.g.
  `view_results_..._2.png` is actually a *win* (trainee 1st) misread as placement 2.
- Replaces `_last_placement: Optional[int]` with a `_last_won: Optional[bool]`;
  `_record_race_attempt` only consumes `won` anyway, so nothing downstream needs
  the exact number.

**Fallback:** if the highlight ever proves theme-dependent, fall back to OCR'ing
just row 1's name band (content x `0.30–0.62`) and fuzzy-matching the trainee name
(would require passing the uma name into `RaceFlow`, which it doesn't currently
hold). The color check avoids that plumbing entirely.

### A2. Batch the race-name OCR in selection

`_pick_race_square` OCRs each candidate square's name-band sequentially, per
scroll. Collect the visible name crops and issue one `batch_text`, and **skip
re-OCR of squares already seen** across scrolls (key by YOLO box signature) — same
pattern as the skills-buy batching.

### A3. Drop OCR where YOLO + position suffice

`_pick_view_results_button` OCRs candidate buttons to disambiguate. The active-state
classifier + bottom-most position usually identify it without OCR; keep OCR only as
a tie-breaker.

---

## 3. Part B — await reduction & configurability

### B1. Convert blind sleeps to poll-until-ready

Several big fixed sleeps are immediately followed by a poll for the next element —
the sleep is redundant. Highest value:

- **`run()` `sleep(7)` [race.py:1319](../core/actions/race.py#L1319):** delete it and
  let the existing `button_change` poll loop (already capped at 14s) start
  immediately. Saves up to 7s/race with no behavior change.
- **`lobby()` `sleep(5)` / `sleep(4)`:** replace with a short poll for the expected
  next state (RACE-confirm popup / skip buttons) capped at the same budget.
- **`sleep(3)` after strategy:** poll for the white buttons to disappear (or the
  green proceed button to appear) instead of a flat 3s.

This mirrors the training-scan settle-loop already shipped: poll cheaply, proceed
on the first valid frame, cap with a timeout so it's never slower.

### B2. Make the residual awaits configurable

For beats that can't be polled away (animation grace periods), introduce a single
**race pacing multiplier** plus optionally per-phase overrides:

- `Settings.RACE_AWAIT_SCALE` (float, default `1.0`, clamp ~`0.4–2.0`). Wrap the
  remaining race sleeps in a tiny `self._beat(seconds)` helper that multiplies by
  the scale. Fast devices/emulators → `0.5`; slow phones → `1.5`.
- Surface it in **General → Advanced settings** as a "Race pacing" slider, wired
  through `config.schema.ts` / `types.ts` / `Settings.apply_config`, exactly like
  the new `trainingSettle*` knobs.
- Optionally expose the two poll caps (`pre-lobby wait`, `skip-loop budget`) as
  advanced numbers for power users, defaulting to current values.

### B3. Tighten the skip & NEXT loops

- The skip loop extends its own budget (`total_time += 2` per skip) and polls every
  0.12s — fine, but gate the placement OCR (A1) to run only once and only on the
  NEXT branch (already conditional on `DETAILED_HISTORY and not closed_early`).
- NEXT click timeouts (4.6s + 6s) can be reduced once the preceding waits are
  poll-driven, since the buttons are typically present immediately.

---

## 4. Risks & validation

- **Placement ROI** must be validated against the full `debug/race/placement/`
  corpus (placements 1–18) before replacing the full-screen read; keep the
  full-screen OCR as a one-shot fallback when the cropped read returns `None`.
- **Removing blind sleeps** risks polling a mid-animation frame; mitigated by the
  poll loops already present and their timeout caps (never slower than today).
- **Pacing multiplier** lower bounds must stay safe — clamp so users can't set it so
  low that animations are routinely cut off. The poll-driven waits are
  self-correcting; only the irreducible beats scale.

---

## 5. Status

- [ ] A1 — replace full-screen placement OCR with row-1 highlight color check (no OCR; validated on 145 captures)
- [ ] A2 — batch + cache race-name OCR in selection
- [ ] A3 — reduce View-Results button OCR
- [ ] B1 — convert blind sleeps (esp. `run()` `sleep(7)`) to poll-until-ready
- [ ] B2 — `RACE_AWAIT_SCALE` + Advanced-settings "Race pacing" slider
- [ ] B3 — tighten skip / NEXT loop timeouts

**Suggested order:** A1 (biggest OCR win, self-contained) → B1 (biggest time win,
low risk) → B2 (configurability) → A2 / A3 / B3 (incremental).
