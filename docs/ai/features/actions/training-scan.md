# Training Scan Decision Flow

## Overview

The training scan determines which training tile to click each turn. It runs every non-race/non-event turn and consists of three sequential stages executed within `check_training()` in `core/actions/training_policy.py`:

1. **Scan** — `scan_training_screen()` clicks tiles and collects raw data
2. **Score** — `compute_support_values()` assigns each tile a Support Value (SV)
3. **Decide** — `decide_action_training()` picks the final action: train, rest, race, etc.

```
┌─────────────────┐     ┌──────────────────────┐     ┌─────────────────────┐
│  1. Scan tiles  │ ──► │  2. Compute SV per   │ ──► │  3. Decide action   │
│  (click, OCR)   │     │  tile, risk-gate,    │     │  via threshold tree │
│                 │     │  flag greedy hits    │     │                     │
└─────────────────┘     └──────────────────────┘     └─────────────────────┘
```

---

## Stage 1: `scan_training_screen()`

**File:** `core/actions/training_check.py`

Goal: click each training tile, collect support cards and failure percentage.

### Flow

```
Initial capture (YOLO, conf=0.60)
  │
  ├─ ❌ 5 training buttons not found? → retry once after 500ms
  │
  ├─ FAST_MODE + energy ≤ threshold (35)?
  │     └─ Scan only raised tile + WIT tile → return early
  │
  ├─ Already-raised tile detected? (free, no click)
  │     ├─ Collect supports + failure%
  │     └─ FAST_MODE + greedy hit? → return early
  │
  ├─ HIGH-FAILURE ABORT (non-FAST_MODE only)?
  │     │  First result's failure_pct > MAX_FAILURE (20)?
  │     ├─ WIT already scanned? → return early with 1-2 results
  │     ├─ WIT not scanned? → scan WIT, then return early
  │     └─ (skips all remaining tiles)
  │
  └─ Visit remaining tiles in PRIORITY_STATS order
        │  For each tile: click → YOLO recapture → collect supports + failure%
        ├─ FAST_MODE + greedy hit? → return immediately
        ├─ ≥4 total supports seen? → break (early exit)
        └─ HIGH-FAILURE ABORT (same check as above, after 1st clicked tile)
```

### Tile priority order

```
1. Priority stats from Settings.PRIORITY_STATS (default: SPD → STA → PWR → GUTS → WIT)
2. Remaining indices appended in natural order
```

### Data collected per tile

| Field | Type | Source |
|-------|------|--------|
| `tile_idx` | int | Index 0-4 (SPD→WIT) |
| `tile_xyxy` | [x1,y1,x2,y2] | YOLO detection |
| `supports` | list | `collect_supports_enriched()` |
| `has_any_rainbow` | bool | Rainbow support card present |
| `failure_pct` | int | OCR from failure bubble text |
| `skipped_click` | bool | True for already-raised tile (no click cost) |

### Early exit paths (summary)

| Path | Condition | Saves |
|------|-----------|-------|
| FAST_MODE low-energy | `FAST_MODE && energy ≤ 35` | 3-4 tile clicks |
| FAST_MODE greedy | `FAST_MODE && greedy_hit` | Remaining tile clicks |
| High-failure abort | `failure_pct > 20` on first tile | 3+ tile clicks |
| Support count ≥4 | 4+ total supports across tiles | Variable |
| All tiles scanned | Normal completion | None (worst case) |

---

## Stage 2: `compute_support_values()`

**Files:**
- `core/actions/ura/training_check.py` (URA)
- `core/actions/unity_cup/training_check.py` (Unity Cup)

Goal: compute SV per tile and determine risk eligibility.

### SV components

For each scanned tile:

- **Card base values** — each support card contributes stat-dependent points
- **Hints** — race hints (+1.0), scenario hints (+0.3), skill hints (+0.2)
- **Rainbow** — +1.0 for rainbow supports
- **Spirit gauge** (Unity Cup only) — spirit bars + burst allowlist bonuses
- **Director bonus** — `TRAIN_DIRECTOR` type overrides

### Risk gating

```
base_limit = Settings.MAX_FAILURE        # = 20
risk_mult  = dynamic_multiplier(SV)       # 1.0 to 2.0
risk_limit = int(min(100, base_limit * risk_mult))

allowed_by_risk = failure_pct <= risk_limit
```

Risk multiplier tiers (URA):

| SV threshold | Multiplier |
|--------------|------------|
| ≥ 5.0 | ×2.0 |
| ≥ 3.5 | ×1.5 |
| ≥ 2.75 | ×1.35 |
| ≥ 2.25 | ×1.25 |
| else | ×1.0 |

If failure_pct > risk_limit, the tile is flagged `allowed_by_risk = False` and will be skipped by the decision tree.

### Greedy flag

```
greedy_hit = (sv_total >= GREEDY_THRESHOLD) and allowed_by_risk
```

- URA: `GREEDY_THRESHOLD = 2.5`
- Unity Cup: `GREEDY_THRESHOLD_UNITY_CUP = 3.5`

A `greedy_hit` tile triggers an immediate return from `scan_training_screen()` in FAST_MODE.

---

## Stage 3: `decide_action_training()`

**Files:**
- `core/actions/ura/training_policy.py` (822 lines)
- `core/actions/unity_cup/training_policy.py`

Goal: pick one action based on SV, energy, mood, race proximity, and special rules.

### Decision tree (simplified)

```
1. SV >= max_pick_sv_top?  (URA 2.5, UC 3.5)
     └─ TRAIN_MAX on best tile

2. Finale / season special?
     └─ Push specific stat

3. Mood < minimal_mood?
     └─ RECREATION (if PAL available) or REST

4. Summer gate + good energy?
     └─ RACE (if G1 available)

5. SV >= next_pick_sv_top?  (URA 2.0, UC 2.5)
     └─ TRAIN_MAX

6. G1 race opportunity?
     └─ RACE

7. Director rule tile available?
     └─ TRAIN_DIRECTOR

8. Energy <= 35%?
     └─ REST or RECREATION

9. WIT viable? (SV >= 1.5 or rainbow)
     └─ TRAIN_WIT

10. SV >= late_pick_sv_top?  (URA 1.5, UC 2.0)
      └─ TRAIN_MAX

11. Mood < GREAT, not near mood-up?
      └─ RECREATION

12. SV >= low_pick_sv_gate on top-3 stats?
      └─ TRAIN_MAX

13. Energy <= 70, no good SV?
      └─ REST (weak-turn fallback)

14. Last resort
      └─ Best allowed tile, fallback WIT, or NOOP
```

### Available actions

| Action | Meaning |
|--------|---------|
| `TRAIN_MAX` | Train the highest-SV tile (must be `allowed_by_risk`) |
| `TRAIN_WIT` | Explicitly train WIT (index 4) |
| `TRAIN_DIRECTOR` | Train a director rule tile |
| `RACE` | Enter race lobby |
| `REST` | Rest (heal energy) |
| `RECREATION` | Recreation event (if PAL available) |
| `NOOP` | Do nothing (fallback) |

---

## File Reference

| File | Role |
|------|------|
| `core/actions/training_policy.py` | Orchestrator: scan → compute → decide |
| `core/actions/training_check.py` | Screen scanner, tile click loop, early exits |
| `core/utils/training_check_helpers.py` | `failure_pct()`, `collect_supports_enriched()`, spirit/burst helpers |
| `core/perception/extractors/training_metrics.py` | OCR extraction of failure % from bubble text |
| `core/actions/ura/training_check.py` | URA SV scoring and risk gating |
| `core/actions/ura/training_policy.py` | URA decision tree |
| `core/actions/unity_cup/training_check.py` | Unity Cup SV scoring with spirit/flame mechanics |
| `core/actions/unity_cup/training_policy.py` | Unity Cup decision tree |
| `core/settings.py` | `MAX_FAILURE`, `PRIORITY_STATS`, `FAST_MODE` config |
| `core/constants.py` | `DEFAULT_TILE_TO_TYPE = {0:"SPD", 1:"STA", 2:"PWR", 3:"GUTS", 4:"WIT"}` |

> **Note:** this doc covers both `training_check.py` (the scanner) **and**
> `training_policy.py` (the `check_training` orchestrator + `TrainingDecision`), so
> there is no separate `training-policy.md`.

---

## Example images

> Reuse from `debug/training/` captures where available; the screens below still need
> representative shots dropped into `images/`.

| Placeholder file | Screen to capture |
|------------------|-------------------|
| `images/training-tiles.png` | The training screen showing the 5 tiles (SPD→WIT) before any click. |
| `images/training-tile-supports.png` | One tile opened — label the support cards, a rainbow support, and the failure% bubble. |
| `images/training-rainbow.png` | A tile with a rainbow (raised) support — the greedy-hit case. |

*(See [README](README.md#images-still-needed).)*
