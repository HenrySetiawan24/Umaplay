# Daily Race Flow

**Class:** `DailyRaceFlow` — [`core/actions/daily_race.py`](../../../../core/actions/daily_race.py)
**Constructed in:** [`core/agent_nav.py`](../../../../core/agent_nav.py) (`self.daily_race = DailyRaceFlow(ctrl, ocr, yolo_engine, waiter)`)

Drives the **Daily Races** screen (the RP/"monies" farming races outside of a
career run). It is a thin navigation flow: it does not score or decide anything —
it just walks the menu → race → results → race-again loop until there are no more
daily races or a shop exchange appears.

Line numbers drift; methods are named so they stay findable.

---

## Where it fits

Daily races are a *navigation* task (under `agent_nav`), not a career-scenario
task. Unlike `RaceFlow` (career race-day), there is no race selection, strategy,
win-detection, or retry — daily races are fixed and the only goal is to spend
race tickets and collect rewards.

## Flow

```
enter_from_menu()        # click RACES menu → click the 'monies' card
pick_first_row()         # click the topmost 'monies' row above conf 0.70
confirm_and_next_to_race()   # NEXT(green RACE) → RACE; handles a CANCEL/insufficient popup
run_race_and_collect():      # loop (≤5 races):
    NEXT(green) → RACE(green) → wait
    click VIEW RESULTS / CLOSE (white)
    continue (green)
    handle_shop_exchange()    # if a shop appears → break (handled by nav.handle_shop_exchange)
    else RACE AGAIN (pink)    # not found → finalize & stop
        → if "OK / no more dailies" seen: OK → ADVANCE → HOME, stop
handle_shop_in_place()   # resume entry point if the run was interrupted mid-shop
```

### Key methods

| Method | Role |
|--------|------|
| `enter_from_menu()` | Clicks `race_daily_races` then the `race_daily_races_monies` card. |
| `pick_first_row()` | Picks the topmost `race_daily_races_monies_row` with conf ≥ `_thr["row"]` (0.70). |
| `confirm_and_next_to_race()` | Green **RACE** (text-gated, forbids OK/PURCHASE/BUY/RESTORE). If only a **CANCEL** + OK popup is present (not enough tickets / restore prompt), it cancels and goes `ui_home`. |
| `run_race_and_collect()` | The race→results→race-again loop (≤5 iterations). Delegates shop handling to `nav.handle_shop_exchange`. Returns `finalized: bool`. |
| `handle_shop_in_place()` | Re-enters shop handling when resuming a run that was already inside the shop (`ensure_enter=False`). |

### Notes / quirks

- **Emulator pacing:** extra `sleep` is added when `ctrl` is `ScrcpyController` /
  `BlueStacksController` (mirrored Android is slower to animate than Steam).
- **Button gating is text-aware:** the green-button clicks use `texts=`/`forbid_texts=`
  so the flow never mistakes an `OK`/`PURCHASE` dialog for the **RACE** button.
- **No win detection:** daily races don't read placement — they always proceed.
- All waits here are blind `sleep`s (not `_beat`-scaled like `RaceFlow`); this flow
  is not on the per-turn hot path, so it was never pacing-optimized.

---

## Example images

> Reuse from `debug/agent_nav/` captures where available; the screens below still
> need representative shots dropped into `images/`.

| Placeholder file | Screen to capture |
|------------------|-------------------|
| `images/daily-race-menu.png` | The Daily Races menu with the **Monies** card. |
| `images/daily-race-rows.png` | The race list showing `monies_row` entries (the topmost is picked). |
| `images/daily-race-results.png` | Post-race results with the **RACE AGAIN** (pink) / shop prompt. |

*(Provide these and I'll wire them in — see [README](README.md#images-still-needed).)*
