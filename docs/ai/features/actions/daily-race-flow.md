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
  dismiss the **Exchange Complete** summary via its white **Close** button. No
  row-level detection needed — lowest risk, matches "just buy everything."

  **Closing the 'Exchange Complete' summary (2026-07 fix)**: after Confirm
  commits, the game shows an *Exchange Complete* summary (bought items + monies
  delta) whose only dismiss is a white **Close** button. It renders after a
  short processing delay, so the original
  single-shot close could land mid-transition and miss, leaving the summary up
  (then `end_sale_dialog`'s Back found nothing and the flow stalled).
  `_click_confirm_purchase` now retries the Close up to 4× (0.8s apart) and
  breaks as soon as a follow-up `seen()` confirms no white Close remains. The
  Close click uses `require_text_match=True` so it only ever clicks a white
  button reading "Close" — never the shop's white **Back** button if the
  summary is already gone (which would exit the shop prematurely).

  **'Select All' is found by OCR, not YOLO (2026-07 fix)**: it's a small
  pill-shaped button the nav model does **not** classify as `button_green`
  (different shape from the large Confirm/Race buttons). A live log showed the
  original `click_when(classes=("button_green",), texts=("SELECT ALL",))`
  polling for 3s and only ever seeing the big `button_green` "Confirm" — the
  Select All pill was never a candidate, so the buy-all path failed on shops
  that *did* have items, and `resume()` re-detected `SHOP` and looped. Fixed
  with `_ocr_click_text`: OCR the whole frame (`ocr.raw`), fuzzy-match each
  recognized line against `("Select All", "SELECT ALL")`, click the
  best-scoring box. Same technique the Daily Legend flow (`_click_text`) uses
  for its class-less text. Matching notes:
  - **Both casings are targets** because the OCR normalizer maps lowercase
    `l`→`1` but leaves uppercase `L` alone, so "Select All" and "SELECT ALL"
    normalize to *different* strings and only the same-case target scores 1.0.
  - **`threshold=0.82`** keeps the "Select an item to purchase." header out
    (its best token "select" scores ~0.75 against "select all").
  - **`'Deselect All'` is forbidden** (`forbid=`) because "select all" is a
    substring of it — in a multi-select UI the button toggles to Deselect All
    once items are checked, and clicking that would unselect everything.
  - The frame is captured via `collect_snapshot` (same path the waiter clicks
    in) and passed into the helper — not re-captured inside it — so the OCR
    box maps back to correct screen coords even under Steam's left-half
    capture.
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

**Exit control is 'Back', not 'End Sale' (2026-07 fix)**: a live Team Trials
log showed `_handle_shop_buy_all` failing to find **Select All** (nothing
purchasable that visit — only a `button_green` "Confirm" was on screen), then
`resume()` immediately re-detecting `SHOP` state and retrying from scratch —
a stuck loop, since nothing about the screen had changed. Root cause: on a
"nothing to buy" or post-failure exit, `_handle_shop_buy_all`/
`_handle_shop_selective` returned `False` without leaving the shop screen, and
`end_sale_dialog` (the designated exit helper) only recognized the old UI's
**"End Sale"** button — the new UI's actual exit control is the white
bottom-left **"Back"** button, which `end_sale_dialog` never matched. Fixed by
widening `end_sale_dialog`'s accepted texts to `("BACK", "END SALE")` and
calling it on every failure path in both handlers (previously only called
after success), so any dead end now attempts to leave the shop screen instead
of leaving the caller to re-poll an unchanged screen.

**Entry-poll timeout is graduated (2026-07)**: the "click SHOP to enter"
poll used a flat 8s timeout regardless of whether a `button_green` was even
on screen. A Team Trials log showed this poll running to its full 8s on
*every* race (no shop that lap → zero `button_green` candidates the whole
time). Since `ensure_enter`'s precheck already grabs a frame (`dets_pre`) to
check "already in shop", that same frame is reused: no `button_green` present
→ timeout drops to 1.5s (covers late-rendering animation only); a
`button_green` already visible → keeps the full 8s (OCR needs a beat to
confirm it says SHOP, not some other green button). Benefits both callers —
Daily Race and Team Trials share `handle_shop_exchange`.

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
