# Daily Legend Race Flow

**Class:** `DailyLegendRaceFlow` — [`core/actions/daily_race.py`](../../../../core/actions/daily_race.py)
**Constructed in:** [`core/agent_nav.py`](../../../../core/agent_nav.py) (`self.daily_legend = DailyLegendRaceFlow(...)`)
**Entry point:** Daily Races lobby → right module (Daily Legend Races)

> **Auto-chained, opt-in.** After a daily-race run finalizes under the
> `daily_races` nav trigger, `agent_nav` calls `DailyLegendRaceFlow.run()` **only
> when** the `daily_legend.enabled` nav-pref is on (default OFF). The legend flow's
> `enter_from_menu()` is robust to wherever the daily-race run left off (home /
> stale results / monies-SP sub-page), so it re-navigates to the legend module on
> its own.

Daily Legend Races pit a fixed legend Umamusume opponent against your team.
One ticket per run; tickets reset on a timer (typically 23 h). Rewards include
legend-specific pieces used for character exchange or training buffs.

---

## Where it fits

Same non-career nav path as Daily Races and Team Trials:

```
agent_nav → DailyRaceFlow   → daily-race-flow.md        (left card — implemented)
agent_nav → DailyLegendRaceFlow → daily-legend-race-flow.md  (right card — planned)
```

The two flows share the same lobby entry point but diverge immediately after
the lobby card click.

---

## Screen sequence

```
┌ 1. Daily Races lobby ───────────────────────────────────────────────────────┐
│   LEFT card  → Daily Races (coins / SP)        → DailyRaceFlow             │
│   RIGHT card → Daily Legend Races              → this flow                  │
│ Ticket counter shown top-right (e.g. 1/1).                                  │
└─────────────────────────────────────────────────────────────────────────────┘

┌ 2. Select Legend opponent ──────────────────────────────────────────────────┐
│ Grid of legend character cards (e.g. El Condor Pasa, Special Week, …).      │
│ Each card is a white tile with the character's name.                         │
│ Bot clicks the configured/preferred legend slot.                             │
│ Buttons: Back (grey).                                                        │
└─────────────────────────────────────────────────────────────────────────────┘

┌ 3. Race details for selected legend ────────────────────────────────────────┐
│ Shows race name (e.g. "Tenno Sho (Spring) HARD"), main rewards, first-win   │
│ bonus (CLEAR! if already cleared).                                           │
│ Buttons: Back (grey).                                                        │
│ (No explicit confirm button on this screen — tapping the card in screen 2   │
│  navigates here; bot may need a Next/confirm click to proceed.)              │
└─────────────────────────────────────────────────────────────────────────────┘

┌ 4. Confirm race ────────────────────────────────────────────────────────────┐
│ Full race detail card: difficulty EX, legend info, main rewards, first-win. │
│ Buttons: Cancel (grey) / Race! (bright green).                               │
└─────────────────────────────────────────────────────────────────────────────┘

┌ 5. Race entrants list ──────────────────────────────────────────────────────┐
│ Scrollable rows. Each row: placement number, name, mood pill (GREAT=pink /  │
│ NORM=yellow / BAD=blue), running strategy (Front / Late / etc.).            │
│ Buttons: Back (grey) / Next (bright green).                                  │
└─────────────────────────────────────────────────────────────────────────────┘

┌ 6. Item select dialog ──────────────────────────────────────────────────────┐
│ Optional items (Parfait, Sunny, Rainy, Gate 1/2). Light blue checkered bg   │
│ on selected items; empty white boxes for unused slots.                       │
│ Buttons: Cancel (grey) / Race! (bright green).                               │
└─────────────────────────────────────────────────────────────────────────────┘

┌ 7. Race strategy / pre-race screen ─────────────────────────────────────────┐
│ Attributes / Skills tabs. Mood pill. Running strategy + Change button.       │
│ Buttons: Back (grey) / View Results (light tan — skips to results without   │
│   racing) / Race (bright green — runs the race).                             │
│ Bot clicks Race (green). Does NOT use View Results.                          │
└─────────────────────────────────────────────────────────────────────────────┘

┌ 8. Placement reaction ──────────────────────────────────────────────────────┐
│ Character art reaction (win celebration or loss). TAP overlay anywhere.      │
│ Same as career race placement pose screen; bot taps to advance.             │
└─────────────────────────────────────────────────────────────────────────────┘

┌ 9. Race result ─────────────────────────────────────────────────────────────┐
│ Legend name + placement. WIN banner if 1st. Leaderboard rows.               │
│ Buttons: Placing (white/grey — view entrant details) / Next (bright green). │
│ Bot clicks Next.                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

┌ 10. Rewards screen ─────────────────────────────────────────────────────────┐
│ Entry reward + victory rewards on white panel.                               │
│ Buttons: Next (bright green).                                                │
└─────────────────────────────────────────────────────────────────────────────┘

┌ 11. Back to Daily Races lobby ──────────────────────────────────────────────┐
│ Both cards now show status banners:                                          │
│   Daily Races: "Done for today!" (dark grey overlay)                        │
│   Daily Legend Races: "Resets in 23h" (light purple/grey banner)            │
│ Bot reads this as "all done" and returns to Home.                           │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Flow (actual methods)

```python
run()                          # orchestrator; short-circuits to False on any miss
  enter_from_menu()            # bounded loop (≤6): reach 2-module lobby, OCR-click
                               #   "DAILY LEGEND RACES"; backs out of monies/SP page
                               #   or opens ui_race from home as needed
  pick_opponent()              # OCR-match Settings.get_daily_legend_opponent() in the
                               #   grid band; fallback = topmost-leftmost text card
  confirm_and_start()
    # selected-legend : button_green (forbid BACK/CANCEL); fallback ui_race
    # confirm         : button_green texts=("RACE!",) forbid=("CANCEL",)
    #                   on no-ticket popup → button_white CANCEL → ui_home → False
    # entrants        : button_green (Next, forbid BACK)
    # item dialog     : button_green texts=("RACE!",) forbid=("CANCEL",)
    # strategy        : button_green texts=("RACE",) forbid=("VIEW RESULTS","BACK")
  run_and_collect()
    # race animation  : blind sleep (+ emulator extra)
    # placement       : nav.random_center_tap ×2 rounds (+ defensive button_advance)
    # result          : button_green (Next, forbid PLACING)
    # rewards         : button_green (Next)
    # back to lobby   : detect race_daily_races / "DAILY LEGEND" / "RESETS IN" → done
```

### Configuration (nav-prefs)

`Settings.NAV_PREFS["daily_legend"]` (see [`core/settings.py`](../../../../core/settings.py)):

| Key | Default | Meaning |
|-----|---------|---------|
| `enabled` | `False` | Opt-in toggle; when on, the legend race runs after each daily-race completion. |
| `preferred_opponent` | `""` | Legend name OCR-matched on the grid; empty → topmost-leftmost card. |

Getters: `Settings.get_daily_legend_enabled()`, `Settings.get_daily_legend_opponent()`.

---

## Key differences from `DailyRaceFlow`

| Aspect | Daily Races | Daily Legend |
|--------|-------------|--------------|
| Entry card | Left (coins / SP) | Right (legend) |
| Opponent selection | Fixed race type, pick difficulty | Pick legend character from grid |
| Race count per run | Up to 5 (ticket loop) | 1 race per ticket |
| Win detection | None | None (bot never reads placement) |
| Strategy screen | Present (bot skips View Results) | Present (same behavior) |
| Post-race | RACE AGAIN (pink) loop or done | Back to lobby → done |
| Ticket type | `race_daily_races` ticket | Legend ticket (separate counter) |

---

## Detection: YOLO + OCR

The `uma_nav.pt` model has **no class for the legend module card or the opponent
grid** (verified against the model's label list). Those two screens are located via
**OCR text boxes** (`ocr.raw(img)` → `_text_boxes` / `_click_text` in the flow).
Everything else reuses generic button classes that already exist.

| Screen | How it's clicked |
|--------|------------------|
| Daily Legend module (2-module lobby) | OCR text "DAILY LEGEND RACES" (`_click_text`) |
| Legend opponent grid | OCR-match preferred name, else topmost-leftmost text box |
| selected-legend / confirm / entrants / item / strategy | `button_green` (text/forbid-gated) |
| no-ticket popup | `button_white` "CANCEL" → `ui_home` |
| placement reaction | center taps (`nav.random_center_tap`) + `button_advance` |
| result / rewards | `button_green` (Next) |

> Future hardening: retrain `uma_nav.pt` with dedicated `race_daily_legend` +
> opponent classes to replace the OCR-anchored clicks on the two legend-only screens.

---

## Example images

> Screenshots for this flow live in
> `images/daily - legend - trials/daily legend (daily races lobby right option)/`.
> Wire representative frames into `images/` when the implementation is ready.

| Placeholder file | Screen |
|------------------|--------|
| `images/daily-legend-lobby.png` | Daily Races lobby showing both cards (left=Daily, right=Legend). |
| `images/daily-legend-opponent-grid.png` | Legend opponent selection grid (all character tiles). |
| `images/daily-legend-result.png` | Race result screen with legend rank and Next button. |

*(See [README](README.md#images-still-needed).)*
