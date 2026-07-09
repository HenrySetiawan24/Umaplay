---
description: doc policy scenario diagrams
auto_execution_mode: 1
---

> **Task:**
> Explore the repository to infer scenario policies from source code and project notes, then update or create Mermaid flowcharts and notes under `docs\ai\policies\<scenario>\` (e.g., `unity_cup`, `ura`) so that the diagrams and notes accurately reflect the current logic.

---

## 🎯 Goal

Produce accurate, readable, and maintainable **Lobby**, **Training**, **Scoring**, and any other requested flowcharts (e.g. `flow_lobby.mmd`, `flow_training.mmd`, `flow_scoring_system.mmd`, `flow_<custom>.mmd`) that stay in sync with `docs/ai/features/actions/training-scan.md` (the prose/table **source of truth** for thresholds, gates, tie-break rules, and cameo/spirit scoring — do not restate that content into a per-scenario `notes.txt`/`agent-notes.md`; those files are for content that doesn't fit a diagram, e.g. Unity Cup's `agent-notes.md` agent-loop timing changelog, not decision logic). Prefer **small, safe edits** when the code evolved slightly; perform **full rewrites** only when logic materially changed. For **minor** findings, adjust wording and edge labels; for **major** changes, update nodes/branches and the thresholds legend, and flag the corresponding section of `training-scan.md` for a matching update (this workflow does not edit that file itself).

---

## ⚙️ Operating Rules

* **Source of truth:** derive behavior from code, configs, and in-repo docs only.
* **Required viewpoints:** document every policy file the user names. By default cover:

  1. **Lobby** (pre-training turn screening: infirmary, mood, summer/race windows, schedule, race-plans).
  2. **Training** (SV filters, priority guard, mood/energy/race gates, director/PAL, spirits, final season, WIT logic).
  3. **Scoring system** when `compute_support_values` or similar scoring helpers changed.
* **Mermaid style (parse-safe):** keep diagrams ASCII-only, single-line labels, no parentheses, IDs with underscores, and only end nodes with “then end turn” when the turn truly ends.

  * ASCII only (no Unicode arrows/quotes). Use `<=`, `>=`, `%`, plain digits.
  * No ampersands in labels; write “and”.
  * Avoid parentheses inside node labels; fold into words.
  * Node IDs alphanumeric with underscores; short labels; keep decisions as diamonds.
  * End nodes with “then end turn” only when they truly end the turn.
* **Thresholds & vocabulary:**

  * Extract numeric gates (SV bins, energy %, mood levels, risk multipliers, hint multipliers) directly from code/constants.
  * Named bins (e.g., `SV_high`, `SV_mid`, `SV_late`, `risk_high`) and tie-break/priority-guard/cameo/spirit-combo descriptions live in `docs/ai/features/actions/training-scan.md`, not in a per-scenario file this workflow writes — reflect the numbers in the diagrams with explicit values, keep diagram edges short, and flag `training-scan.md` in the report if a bin name/value needs updating there.
* **Validation & truth-checking:**

  * Cross-check each branch against code comments and conditionals.
  * Ensure each decision has complete outgoing paths, no orphan nodes, and consistent terminology across files.
* **Non-destructive edits:** preserve structure when possible; keep changelog context in the report, not in diagrams.

---

## 🔍 Update Detection Method

1. **Scan recent signals:**

   * Identify the scenario folder under `docs/ai/policies/<scenario>/`.
   * Locate governing code: lobby flows (`core/actions/<scenario>/lobby.py`), training policy (`core/actions/<scenario>/training_policy.py`), scoring helpers (`core/actions/<scenario>/training_check.py`, `compute_support_values`), agent glue (`core/actions/<scenario>/agent.py`), and any scenario-specific utils/configs.
   * Review existing diagrams against `docs/ai/features/actions/training-scan.md` for drift (missing branches, outdated thresholds or cameo numbers) — that doc is the source of truth, not the diagrams themselves.
2. **Compare with reference:**

   * Map code branches → diagram nodes/edges and list mismatches (missing node, wrong threshold, renamed concept, reordered priority, updated cameo/scoring rules).
   * Check whether resource files for the target scenario exist; if any artifact is missing, plan to create it.
3. **Decide update level:**

   * **Minor:** wording/labels, small numeric corrections, legend tweaks.
   * **Moderate:** add/remove a branch, update bins, add director/spirit windows, adjust scoring nodes.
   * **Major:** rewrite significant sections, split/merge ladders, add new flow files, or overhaul scoring diagrams.

---

## 🧠 Workflow

### Step 1 — Assess

Define scenario (`<scenario>`), desired artifacts, and scope:

* Collect inputs: source modules, existing diagrams, user screenshots/notes, scenario configs.
* Record expected outputs (which `.mmd` files, and whether `training-scan.md` needs a matching update).
* Decide validation plan (Mermaid parse sanity, branch coverage, threshold consistency).

### Step 2 — Select Mode

Choose **light / moderate / major** based on mismatches gathered in Update Detection. Prefer light edits for small constants; switch to major when control flow or scoring changed.

### Step 3 — Research Details

1. **Lobby logic:** trace `process_turn` (and helpers like `_plan_race_today`, `_maybe_do_goal_race`, `_go_rest`, `_go_training_screen_from_lobby`). Note energy gates, race guards, infirmary/mood handling, summer prep, and reasons returned.
2. **Training decisions:** follow `decide_action_training` (caps, hints, distribution nudge, priority guard, final season, mood, summer staging, SV thresholds, energy/race fallbacks). Capture constants from function arguments and `Settings` references.
3. **Scoring system:** read `compute_support_values` (cameo values, hint defaults, rainbow combo, spirits, risk multipliers, greedy flag). Include any scenario-specific overrides or multipliers.
4. **Other flows:** if the user requests additional diagrams (e.g., showdown, race-day), read the associated modules and extract equivalent decision trees.

### Step 4 — Apply Updates

* **flow_lobby.mmd:** encode race-plan guards, energy/mood/infirmary checks, summer prep, and transition to training. Show when the loop ends vs continues.
* **flow_training.mmd:** map decision ladder from SV computation through final fallbacks. Highlight thresholds, caps, WIT logic, director windows, spirits, and race fallbacks. Keep priority guard and distribution gates explicit.
* **flow_scoring_system.mmd (or requested scoring flow):** diagram scoring pipeline (support contributions, hints, combos, spirits, risk scaling, greedy flag). Reference cameo values and multipliers verbatim.
* **Do not write a per-scenario `notes.txt`/`agent-notes.md` with thresholds.** If numeric gates (SV bins, energy thresholds, risk multipliers, cameo scores, spirit combos, hint defaults, distribution thresholds) changed, update `docs/ai/features/actions/training-scan.md` instead (outside this workflow's file scope — flag it in the report) so there is exactly one prose reference, not a per-scenario copy.
* Apply the Mermaid style rules (ASCII labels, single-line nodes, no stray punctuation).

### Step 5 — Verify

* **Syntax sanity:** ensure each `.mmd` renders in strict Mermaid (all nodes reachable, no dangling edges).
* **Semantic alignment:** cross-check numbers and terminology against code; ensure diagram labels match `docs/ai/features/actions/training-scan.md` (the prose source of truth).
* **Completeness:** confirm every branch in code is reflected somewhere (including error/skip guards). Ensure scoring diagram covers all additive components and risk logic.
* **Report:** summarize update mode, files touched, key changes, and verification results using the template below.

---

## 🧾 Output Requirements

* If updates occur:

  * Overwrite/create:

    * `docs\ai\policies\<scenario>\flow_lobby.mmd`
    * `docs\ai\policies\<scenario>\flow_training.mmd`
    * `docs\ai\policies\<scenario>\flow_scoring_system.mmd` (if scoring changed)
  * Do **not** create or overwrite a per-scenario `notes.txt`/`agent-notes.md` —
    if thresholds/gates drifted, flag `docs/ai/features/actions/training-scan.md`
    as needing a matching update in the report instead.
  * Provide a **summary report** with update mode, changed files, and a concise change list (bullets). Include short before/after snippets for non-trivial edits.
* If no updates needed:

  * Output a brief report stating **no changes**, with the checks you performed and where each rule was validated in code.
* Conclude with an optional prompt proposing the next scenario/file to refresh.

---

## 🧾 Output Format

```md
# <scenario> Policy Diagrams Update Summary

## Update Mode
<none | light | moderate | major>

## Files
- docs\ai\policies\<scenario>\flow_lobby.mmd  — <created|updated|unchanged>
- docs\ai\policies\<scenario>\flow_training.mmd  — <created|updated|unchanged>
- docs\ai\policies\<scenario>\flow_scoring_system.mmd  — <created|updated|unchanged>

## Changes
- <short bullet per change: what/why; thresholds, branches, labels>

## training-scan.md follow-up (if thresholds changed)
- <none | which section of docs/ai/features/actions/training-scan.md needs updating>

## Verification
- Mermaid parse: <ok|failed> (tool or reasoning)
- Threshold consistency: <ok|notes>
- Branch coverage: <ok|notes>

## Next Suggested Action (optional)
- <e.g., refresh URA or add new scenario placeholders>
```


Here’s a compact, general-purpose rule set to keep Mermaid **flowcharts** safe and parser-friendly:

1. **Use plain ASCII text only.**
   Stick to basic letters, digits, spaces, and underscores. Avoid any non-ASCII or decorative characters.

2. **Keep node and edge labels simple.**
   Write brief, descriptive phrases using plain words. Do not include symbols, formulas, or coded syntax inside labels.

3. **Avoid punctuation that Mermaid might treat as syntax.**
   Skip parentheses, angle brackets, ampersands, semicolons, backticks, or other special marks in node titles or labels.

4. **Use one idea per label.**
   Instead of multi-line or combined statements, break complex logic into smaller connected nodes.

5. **Keep identifiers alphanumeric with underscores.**
   Node IDs should not include spaces, symbols, or punctuation.

6. **Maintain consistent direction and structure.**
   Declare the flow direction once (`TD`, `LR`, etc.) and ensure all nodes connect in a logical order.

7. **Separate comments clearly.**
   Place comments on their own lines starting with `%%` and never append them to flow statements.

8. **Use plain words for conditions.**
   Replace any mathematical or symbolic comparisons with descriptive text such as “if energy low” or “check threshold”.

9. **Avoid multi-line strings or escapes.**
   Keep each node label and arrow label on one line; use concise wording instead of manual line breaks.

10. **Close every open block or branch.**
    Make sure subgraphs and decision branches connect to valid endpoints.

Following these guidelines ensures your diagrams remain valid across all Mermaid versions and render consistently without syntax errors.

kept plain ASCII, short single-line labels, and clear newlines between every edge so Mermaid won’t glue lines together.