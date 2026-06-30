# Daily Legend Race Flow

**Planned class:** `DailyLegendRaceFlow` — [`core/actions/daily_race.py`](../../../../core/actions/daily_race.py)
**Entry point:** Daily Races lobby → right card (Daily Legend Races)

> **Not yet implemented.** This doc specifies the 10-screen flow for automation
> reference. `DailyRaceFlow` (left/coins card) is already implemented; this flow
> covers the right card.

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

## Planned flow (pseudocode)

```python
enter_from_menu()
    # click race_daily_races → lobby
    # click right card (race_daily_legend_races or equivalent YOLO class)

pick_legend_opponent()
    # detect legend character cards
    # click preferred slot (configurable, default: first/topmost)

confirm_and_start()
    # screen 3: may auto-advance or require a tap/Next
    # screen 4: click_when(button_green, texts=("RACE!",), forbid=("CANCEL",))
    # screen 5: click Next (button_green) through entrants list
    # screen 6: click Race! (button_green) on item dialog (skip items)
    # screen 7: click Race (button_green) — NOT View Results

run_and_collect()
    # wait for race animation
    # screen 8: tap placement reaction
    # screen 9: click Next on result
    # screen 10: click Next on rewards
    # return to lobby → detect "Resets in Xh" → done
```

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

## YOLO classes to verify

These are inferred — confirm against the YOLO label list before implementing:

| Class | Expected screen |
|-------|-----------------|
| `race_daily_legend_races` | Right card on Daily Races lobby |
| `race_daily_legend_opponent` | Individual legend character cards in grid |
| `button_green` | Race! / Next / Race buttons throughout |
| `button_white` / `button_grey` | Back / Cancel / Placing buttons |

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
