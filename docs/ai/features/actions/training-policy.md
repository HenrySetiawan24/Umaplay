# Training Policy

**Module:** [`core/actions/training_policy.py`](../../../../core/actions/training_policy.py)
**Called from:** `LobbyFlow.process_turn()` (URA / Unity Cup agent) via `check_training(player)`

`training_policy.py` is the **orchestrator layer** between the lobby and the
training screen. It glues scan → score → decide into a single call and returns a
`TrainingDecision` the lobby acts on. It owns no perception — all I/O goes through
`training_check.py` and the scenario-specific sub-modules.

> For the full scan → compute → decide pipeline in detail, see
> [training-scan.md](training-scan.md). This doc focuses on the module's own role:
> what it receives, what it decides, and how it resolves scenario + preset config.

---

## `TrainingDecision` dataclass

The single return value of `check_training()`:

| Field | Type | Contains |
|-------|------|----------|
| `action` | `TrainAction` | What to do: `TRAIN_MAX`, `TRAIN_WIT`, `TRAIN_DIRECTOR`, `RACE`, `REST`, `RECREATION`, `NOOP` |
| `tile_idx` | `Optional[int]` | Which tile (0=SPD…4=WIT); `None` when action is not a tile click |
| `why` | `str` | Human-readable reason logged at INFO level |
| `training_state` | `Any` | Raw output of `scan_training_screen()` — tile data with supports/failure% |
| `last_img` | `Optional[Image]` | The PIL frame captured during the scan |
| `last_parsed` | `Optional[List[dict]]` | Raw YOLO detections from the scan |
| `sv_rows` | `List[dict]` | Scored rows from `compute_support_values()` — tile_idx, sv_total, failure_pct, allowed_by_risk, greedy_hit, notes |

The lobby only needs `action` and `tile_idx` to act; the rest is passed back
so the caller can reuse the already-captured image and state without a second scan.

---

## `check_training(player)` — what it does

```
1. scan_training_screen(ctrl, ocr, yolo_engine, energy=...)
       → training_state, last_img, last_parsed
   Returns None if not on the training screen.

2. compute_support_values()(training_state)
       → sv_rows  (resolved from registry by ACTIVE_SCENARIO)
   Logs each tile: SV, failure%, risk_limit, greedy_hit, notes.

3. Resolve runtime context from player:
       mood, turns_left, career_date, energy_pct, stats,
       pal_hint (PAL memory + lobby pal_available flag)

4. Resolve preset settings (from Settings._last_config):
       race_if_no_good_value, weak_turn_sv, junior_minimal_mood

5. decide_action_training()(sv_rows, mood, turns_left, …)
       → (action, tile_idx, why)
   (resolved from registry by ACTIVE_SCENARIO — URA or Unity Cup)

6. Return TrainingDecision(...)
```

### Scenario dispatch

Both `compute_support_values` and `decide_action_training` are resolved at call
time via `registry.resolve(Settings.ACTIVE_SCENARIO)` — the same registry the
lobby uses. This means the scoring and decision logic is **entirely scenario-specific**
without branching here; swapping scenario changes both automatically.

### Preset config resolution

Three knobs are pulled from `Settings._last_config` (the last-applied web config)
via `Settings.extract_runtime_preset()`:

| Preset key | Default | Effect |
|------------|---------|--------|
| `raceIfNoGoodValue` | `False` | Allows the decision tree to choose RACE when no tile has a good SV |
| `weakTurnSv` | `Settings.WEAK_TURN_SV` | SV below which a turn is considered "weak" → may REST instead of train |
| `juniorMinimalMood` | `Settings.JUNIOR_MINIMAL_MOOD` | Minimum mood to train in Junior year |

---

## Helper functions

| Function | Role |
|----------|------|
| `get_compute_support_values()` | Returns the scenario-specific SV scoring function from the registry. |
| `get_decide_action_training()` | Returns the scenario-specific decision function from the registry. |

These are also used by `LobbyFlow._peek_training_best_sv()` (the race pre-check)
to compute SV on the training screen without going through a full `check_training`.

---

## File reference

| File | Role |
|------|------|
| `core/actions/training_policy.py` | This module — orchestrator + `TrainingDecision` |
| `core/actions/training_check.py` | Screen scanner (`scan_training_screen`) |
| `core/actions/ura/training_check.py` | URA SV scoring + risk gating |
| `core/actions/ura/training_policy.py` | URA decision tree (822 lines) |
| `core/actions/unity_cup/training_check.py` | Unity Cup SV scoring with spirit/flame |
| `core/actions/unity_cup/training_policy.py` | Unity Cup decision tree |
| `core/scenarios/registry.py` | Resolves `(compute_fn, decide_fn)` by scenario name |
| `core/settings.py` | `ACTIVE_SCENARIO`, `_last_config`, preset extraction |
