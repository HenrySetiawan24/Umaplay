# Team Trials Flow

**Class:** `TeamTrialsFlow` (+ `TeamTrialsState` enum) — [`core/actions/team_trials.py`](../../../../core/actions/team_trials.py)
**Constructed in:** [`core/agent_nav.py`](../../../../core/agent_nav.py)

Drives the **Team Trials** weekly race mode (outside of career). The flow covers
the full lifecycle: main menu → GO → opponent banners → race → results →
optional shop exchange → RACE AGAIN. It also handles recovery from any mid-flow
interruption via `resume()`.

Line numbers drift; methods are named so they stay findable.

---

## State machine

`TeamTrialsState` classifies the current screen so `resume()` can pick up
wherever the flow was interrupted:

| State | Detected by |
|-------|-------------|
| `HOME` | `race_team_trials` class visible |
| `GO` | `race_team_trials_go` visible |
| `BANNERS` | `banner_opponent` visible |
| `RESULTS` | `button_pink` or `button_advance` visible |
| `SHOP` | `shop_clock` or `shop_exchange` visible |
| `STALE` | Only `button_white` visible (no pink/advance) — catch-all for stuck screens |
| `UNKNOWN` | None of the above |

`_classify_state(dets)` maps a detection list to one of these in priority order
(SHOP first, then BANNERS, GO, HOME, RESULTS, STALE, UNKNOWN).

---

## Flow

### Happy path

```
enter_from_menu()           # click race_team_trials → sleep 1.5s → click race_team_trials_go
process_banners_screen()
    collect_snapshot()
    sort banners by conf (top-3) → sort top-to-bottom
    pick banner by Settings.get_team_trials_banner_pref() (1-indexed, clamped)
    click banner (3-4 clicks) → sleep 9s
    click_button_loop(button_green, max=1) × 1-2   # pre-start progression prompts
    click_when(button_green, texts=("RACE!",), forbid=("CANCEL",))
    _handle_post_race_sequence(ensure_enter_shop=True)
```

### `_handle_post_race_sequence` (post-race to RACE-AGAIN)

```
sleep(10)                          # race animation
advance_sequence_with_mid_taps()   # button_advance loop (1 iteration)
skip loop (≤1 skip, 5s budget):
    click_when(button_skip, 3-5 clicks)
    → if skip fired: click NEXT → sleep 5s → click race_after_next → sleep 3s
    → else: sleep 5s
random_center_tap() × 4-5         # tap through special reward screen
sleep(4.2)
recapture → if only 1 det or no button_pink:
    click button_advance (forbid VIEW RACE) → click button_green
handle_shop_exchange()             # nav utility; handles shop if present
click button_pink (RACE AGAIN)     # loops the trial; not found → log + stop
```

### Recovery: `resume(max_steps=8)`

Called when the bot re-enters Team Trials mid-flow. Polls state each iteration:

```
for _ in range(max_steps):
    collect_snapshot → _classify_state
    UNKNOWN → break
    HOME     → enter_from_menu()
    GO       → _handle_go_screen()
    BANNERS  → process_banners_screen()
    RESULTS  → _handle_results_screen() → _handle_post_race_sequence
    SHOP     → _handle_shop_in_place()
    STALE    → _handle_stale_screen()
```

### Notable edge cases

- **RP restore prompt** (`STALE` path): if the screen shows a green `RESTORE` button,
  clicking BACK would accept it. `_handle_stale_screen` checks for this first —
  sets `_declined_restore = True`, clicks the white **NO**, then navigates `ui_home`
  so `agent_nav` stops re-entering Team Trials.
- **Shop patience**: `_handle_shop_in_place` tracks consecutive failures in
  `_shop_resume_failures`; after 2 misses it calls `nav.end_sale_dialog` to
  force-close the shop instead of looping indefinitely.
- **Banner preference**: opponent banner slot is user-configurable via
  `Settings.get_team_trials_banner_pref()` (1-indexed from top; clamped to the
  number detected, max 3).
- **Emulator pacing**: extra `sleep` in `process_banners_screen` when ctrl is
  `ScrcpyController` / `BlueStacksController` (not currently wired — note the
  `sleep(5) + sleep(4)` pattern after clicking the banner, inherited from the same
  pattern as `DailyRaceFlow`).

---

## Example images

> Provide representative captures into `images/`:

| Placeholder file | Screen to capture |
|------------------|-------------------|
| `images/team-trials-banners.png` | The opponent banners screen — label the 3 `banner_opponent` slots and which index is preferred. |
| `images/team-trials-go.png` | The Team Trials home screen with the `race_team_trials_go` button. |
| `images/team-trials-results.png` | Post-race results with the `button_pink` (RACE AGAIN) visible. |
| `images/team-trials-shop.png` | The shop exchange screen (`shop_clock` / `shop_exchange`) that triggers the shop handler. |

*(See [README](README.md#images-still-needed).)*
