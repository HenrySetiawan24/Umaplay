# Unity Cup agent-loop notes

**Not the training/lobby decision reference.** For SV scoring and the
`decide_action_training` decision tree, see
[`training-scan.md`](../../features/actions/training-scan.md) (prose source
of truth) and this folder's `flow_lobby.mmd` / `flow_training.mmd` /
`flow_scoring_system.mmd` (diagram source of truth). This file only records
agent-loop timing/navigation notes for `core/actions/unity_cup/agent.py` that
don't fit in a diagram — a running changelog, not a rules reference.

## Changelog

- **Showdown pacing (2026-07):** the `begin_showdown` sequence in
  `core/actions/unity_cup/agent.py` no longer uses raw unscaled sleeps. Fixed
  waits go through `AgentUnityCup._beat` (seconds × `Settings.RACE_AWAIT_SCALE`,
  same semantics as `RaceFlow._beat`), and transition sleeps were folded into
  the adjacent `waiter` poll windows so ready-early screens proceed early. The
  song cutscene wait is a scaled 55s floor plus up to 30s of polling for the
  CLOSE button, replacing the old flat `sleep(80)`.

- **Race-day entry — active banner advance (2026-07):** on a Unity race day
  the `UnityCupRaceday` branch clicks the race-day banner then must click a
  green GO/RACE button on the intro/confirm screen before the
  `unity_opponent_banner` detections render. That advance is now done
  actively inside the banner-wait loop (`tag="unity_cup_raceday_advance"`,
  clicks green GO/RACE/NEXT or re-clicks the race-day banner while polling
  for banners, breaking the instant they appear). The old passive
  `seen()`-only poll never clicked the GO screen, so it burned the full 15s
  timeout every race day and the generic `maybe_handle_race_card` fallback
  did the GO click ~15s late.

- **Showdown result walk (2026-07):** the common opponent-race branch of
  `begin_showdown` (race_after_next active) now drives the whole post-race
  result sequence in-place via `_advance_result_screens` — skip leftover
  animation, green NEXT/OK (forbidding RACE/TRY AGAIN), white CLOSE (trophy),
  the race_after_next special continue, else a center tap-to-continue —
  returning as soon as a known screen is back (lobby / training / next
  opponent banner / race-day / event). It replaces the old truncated "skip
  once + one NEXT + dead race_after_next poll" that bailed mid-result and
  left the slower generic unknown-screen handler to finish. The rarer
  Kashimoto/finale (button_pink) branch keeps its bespoke song-aware walk.

- **Showdown opponent-selection: text-driven fallback (2026-07):** the
  **Select Opponent** list and the **Begin Showdown!** confirm popup
  frequently yield neither `race_race_day` nor `unity_opponent_banner`, so
  `classify_screen_unity_cup` returns `Unknown` and they fall to the generic
  `agent_unknown_advance` handler. That handler's `texts` include `CANCEL` —
  so on the confirm popup it matched the white **Cancel** and *cancelled the
  showdown*, then looped on the Select Opponent screen (whose green button
  reads "Select Opponent", matching none of NEXT/OK/CLOSE/PROCEED/CANCEL).
  Observed live: click Unity Cup → Select Opponent → **Cancel** → back to
  selector → loop until stopped. `_try_advance_showdown(img, dets)` now runs
  at the top of the Unknown branch (before the generic handler) and also as
  the fallback when the `UnityCupRaceday` branch reports "No opponent banners
  detected". It probes `button_green` by OCR text: a green **Begin
  Showdown!** routes through `begin_showdown` (which is class-filtered to
  `button_green`, so it clicks the green confirm, never the white Cancel —
  and runs the result walk); otherwise a green **Select Opponent** is clicked
  to confirm the pre-selected (middle) opponent. Note: specific-slot
  opponent selection still depends on `unity_opponent_banner` detection; this
  fallback only keeps the flow moving (defaulting to the highlighted middle
  card, which matches the usual `opponentSelection.defaultUnknown = 2`). If
  banner detection is chronically missing on these screens, the real fix is
  retraining `uma_unity_cup.pt` to detect `unity_opponent_banner` on the
  Select Opponent list.
