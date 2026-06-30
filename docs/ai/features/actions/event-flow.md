# Event Flow

**Class:** `EventFlow` (+ `EventDecision` dataclass) — [`core/actions/events.py`](../../../../core/actions/events.py)
**Constructed in:** [`core/agent_scenario.py`](../../../../core/agent_scenario.py) (`self.event_flow = EventFlow(...)`)

Handles the **event choice popup** — the screen where a support/trainee/scenario
event appears with 2–5 options and the bot must pick the best one. It identifies
*which* event this is (from OCR + portrait), looks up the preferred option from the
event catalog + user prefs, then clicks it — with several robustness fallbacks.

Line numbers drift; methods are named so they stay findable.

---

## Inputs

`EventFlow` is constructed with the perception trio plus two data sources:

| Arg | Role |
|-----|------|
| `catalog: Catalog` | The packaged event database (`core/utils/event_processor`) — events, options, outcomes. |
| `prefs: UserPrefs` | User/default option preferences, reward priorities, energy-overflow avoidance. |
| `conf_min_choice` | Min YOLO conf for an `event_choice` box to count (default 0.60). |

The single entry point is **`process_event_screen(frame, parsed_objects, *, current_energy, max_energy_cap)`**,
called once the agent has already detected it's on an event screen. It returns an
`EventDecision` (matched key, chosen option, clicked box, and a rich `debug` dict).

## How an option is chosen

```
1. Read detections      _pick_event_card (portrait), _count_chain_steps (blue arrows),
                        _choices (sorted top→bottom)
2. OCR the banner       _extract_title_description_from_banner → (title, description)
3. Build a Query        text + type_hint (support/trainee) + chain_step_hint + portrait crop
4. Retrieve             retrieve_best(catalog, q, top_k=3) ; chain-hint fallback to step 1
5. Resolve preference   prefs.pick_for(best.rec) → desired option number
6. Validate options     YOLO choice count must match the DB's option count (retry once if not)
7. Energy guard         avoid overfilling energy; honor reward_priority (PAL gets +10 overcap)
8. Confirmation guard   same event re-shown with fewer options → force option 1 (confirm)
9. Click                click the chosen choice; else _fallback_click_top
```

### Key mechanics

- **Banner OCR** (`_extract_title_description_from_banner`): the event title/description
  live in the blue banner to the **right of the portrait** (`event_card`). The crop is
  anchored to the card box and split into a header zone (top 30–40%, by aspect) and a
  description zone. The **description** is the stronger retrieval signal, so it's used as
  the primary OCR query.
- **Chain step hint** (`_count_chain_steps` + `_is_blue_chain`): counts the **blue** chain
  arrows (HSV gate around hue 105) to know which step of a multi-step event chain this is.
  If retrieval finds nothing at step N, it retries at step 1 (`replace(q, chain_step_hint=1)`).
- **Portrait as a retrieval feature:** the portrait crop is passed to the retriever
  (`portrait_image=`) to disambiguate by card art when text is ambiguous.

### Special cases & fallbacks

| Case | Behavior |
|------|----------|
| **Unity Cup "A Team at Last"** | Bypasses index-based picking — OCRs each visible choice and **fuzzy-matches the team name** (threshold 0.55); falls back to the bottom choice (Team Carrot) if not found. |
| **YOLO/DB option-count mismatch** | Waits 0.8s, re-recognizes once; uses whichever set has more choices; proceeds if the preferred pick is in range, else falls back to top. |
| **Energy overflow** | If a pick would overfill energy past `max_energy_cap`, it rotates to a "safe" option, preferring ones matching `reward_priority`. PAL support dates get a +10 overcap window. |
| **Confirmation phase** | If the *same* event reappears with fewer options and the prior pick was > 1, it forces **option 1** (the in-game "confirm your choice" sub-prompt). |
| **No match / no choices** | `_fallback_click_top` clicks the top `event_choice` (or no-ops if none), and resets confirmation state. |

### `EventDecision`

```python
@dataclass
class EventDecision:
    matched_key: Optional[str]       # catalog key of the matched event
    matched_key_step: Optional[str]  # key incl. chain step
    pick_option: int                 # 1-indexed option clicked
    clicked_box: Optional[Tuple]     # xyxy of the clicked choice
    debug: Dict[str, Any]            # full reasoning trace (OCR, scores, adjustments)
```

The `debug` dict is the place to look when an event was mispicked — it records the
OCR title/description, the top match + score, the resolved vs adjusted pick, and the
reason for any energy/confirmation override.

---

## Example images

> Provide representative captures into `images/`:

| Placeholder file | Screen to capture |
|------------------|-------------------|
| `images/event-support-choices.png` | A support-card event with the portrait + blue banner + 2–3 choices (label the banner header vs description zones). |
| `images/event-chain-arrows.png` | An event showing the blue chain arrows (step indicator) `_count_chain_steps` reads. |
| `images/event-unitycup-team.png` | The Unity Cup "A Team at Last" team-selection event (OCR team-name matching path). |

*(See [README](README.md#images-still-needed).)*
