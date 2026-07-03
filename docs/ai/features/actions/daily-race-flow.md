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

## Screen sequence

```
┌ Daily Races lobby ──────────────────────────────────────────────────────────┐
│ Two selectable cards:                                                         │
│   TOP   → Coins race (Moonlight Sho, etc.)      ← bot always picks this     │
│   BOTTOM → Support Points race (Jupiter Cup, etc.)                           │
└─────────────────────────────────────────────────────────────────────────────┘

┌ Difficulty list ────────────────────────────────────────────────────────────┐
│ Same race, 4 difficulty rows (topmost = hardest):                            │
│   VERY HARD (bright pink pill)   ← bot always picks this (topmost row)      │
│   HARD      (red/dark-pink pill)                                             │
│   NORMAL    (orange pill)                                                    │
│   EASY      (light-green pill)                                               │
└─────────────────────────────────────────────────────────────────────────────┘

┌ "No tickets" popup (edge case) ─────────────────────────────────────────────┐
│ "Not enough Daily Race Ticket. Purchase tickets?" — Cancel (grey) / OK (green)│
│ Bot clicks Cancel and exits to ui_home.                                      │
└─────────────────────────────────────────────────────────────────────────────┘

After difficulty selection the flow follows the standard pre-race / race / results
screens (confirm details → entrants list → race strategy → race animation →
placement reaction → result → rewards) and then loops via RACE AGAIN (pink) or
exits when tickets run out.
```

## Flow

```
enter_from_menu()            # click RACES menu → Daily Races lobby → click top card (coins)
pick_first_row()             # on difficulty list, click topmost row (VERY HARD)
confirm_and_next_to_race()   # NEXT(green) → RACE(green); on no-ticket popup → Cancel → ui_home
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
| `enter_from_menu()` | Clicks `race_daily_races` to open the lobby, then clicks the `race_daily_races_monies` card (top/coins option). |
| `pick_first_row()` | On the difficulty screen, clicks the topmost `race_daily_races_monies_row` (conf ≥ 0.70) — always VERY HARD. |
| `confirm_and_next_to_race()` | Clicks green **RACE** (text-gated, forbids OK/PURCHASE/BUY/RESTORE). If only a **CANCEL** + OK popup is present (no tickets), it cancels and goes `ui_home`. |
| `run_race_and_collect()` | The race→results→race-again loop (≤5 iterations). Delegates shop handling to `nav.handle_shop_exchange`. Returns `finalized: bool`. |
| `handle_shop_in_place()` | Re-enters shop handling when resuming a run that was already inside the shop (`ensure_enter=False`). |

### Shop exchange (multi-select UI, 2026-07)

The Daily Race / Team Trials shop switched from a per-row "EXCHANGE → confirm
→ CLOSE" flow to a batch UI: every `shop_row` now shows a checkbox on its
right edge, plus a top **Select All** button and a bottom **Confirm**/**Reset**
bar with a running cost total. `nav.handle_shop_exchange` (`core/utils/nav.py`)
was rewritten around this — the old per-row `EXCHANGE` button/dialog no longer
exists in-game, so the previous flow is gone, not just superseded.

Two modes, selected by the `shop.buy_all` nav preference:

- **Buy all** (`_handle_shop_buy_all`): click **Select All**, then **Confirm**,
  then walk the resulting purchase popup (`EXCHANGE`/`PURCHASE`/`OK`/`YES`) and
  **CLOSE**. No row-level detection needed — lowest risk, matches "just buy
  everything."
- **Selective** (`_handle_shop_selective`): only enabled when `buy_all` is off
  and at least one of `alarm_clock`/`star_pieces`/`parfait` is on. For each
  scroll pass, rows whose item-icon class (`shop_clock`/`shop_star_piece`/
  `shop_parfait`) matches an enabled preference get their checkbox tapped, then
  a single **Confirm** at the end.

**Checkbox targeting is geometric, not a trained class** — there's no YOLO
class for the checkbox widget itself (checked `models/uma_nav.pt`'s class list;
it has `shop_row`/`shop_exchange`/`shop_clock`/`shop_star_piece`/`shop_parfait`/
`shop_shoes`/`shop_sp` but nothing checkbox/select-all/confirm-specific). The
click point is `row.x1 + row_width * Settings.SHOP_CHECKBOX_X_FRAC` (default
`0.87`), vertically centered on the row — a fraction of each row's own detected
width so it scales across resolutions, calibrated against a single reference
screenshot. **This has not been verified against a live device** — if a live
run shows the tap landing off the checkbox, tune `SHOP_CHECKBOX_X_FRAC` (env
var of the same name, or via the `shop` nav-prefs plumbing) rather than editing
the click math.

**Dedup across scroll passes**: because checked rows stay checked (there's no
per-row confirm to remove them from view, unlike the old flow), re-tapping an
already-checked row on an overlapping scroll would *uncheck* it. Each row's
item name is OCR'd once (`_row_item_name`) and tracked in a `checked_names` set
so a row is only ever tapped once per shop visit, regardless of how many scroll
passes re-show it.

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
