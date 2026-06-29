# Scenario Setup Tab — Layout Redesign

## Problem

The current scenario setup uses a 2-column layout:

```
Wide:
┌──────────────────────┬──────────────────────────────────────────────┐
│  GeneralForm         │  PresetsShell:                               │
│                      │    PresetsTabs (tab bar + group chips)       │
│                      │    PresetPanel:                              │
│                      │      name, stats, mood, style, skill pts     │
│                      │      SkillsPicker ◄── long when many skills  │
│                      │      strategy, event setup                   │
│                      │      RaceScheduler ◄── long calendar grid    │
└──────────────────────┴──────────────────────────────────────────────┘
```

Two issues:
1. **Preset selector (PresetsTabs)** is at the top of the right column, above the preset form — user wants it left, below GeneralForm.
2. **SkillsPicker + RaceScheduler** are inline in the preset panel's vertical stack, so the whole right column scrolls excessively — user wants them split to the right of the shorter settings.

## Proposed Layout

### Very Wide (lg+): 3 equal-ish columns

```
┌─────────────────┬─────────────────────────┬──────────────────────────┐
│ GeneralForm     │  Preset Settings        │  Skills & Scheduler     │
│                 │                         │                         │
│ PresetsTabs     │  ─ name textfield       │  SkillsPicker preview   │
│ (tab bar +      │  ─ PriorityStats        │  (chips + open button)  │
│  group chips)   │  ─ TargetStats          │                         │
│                 │  ─ MoodSelector         │  RaceScheduler          │
│                 │  ─ StyleSelector        │  (calendar grid)        │
│                 │  ─ skill pts threshold  │                         │
│                 │  ─ Strategy component   │                         │
│                 │  ─ EventSetup           │                         │
│                 │    (if events loaded)   │                         │
│                 │                         │                         │
│                 │  All short items that   │  Both long/large items  │
│                 │  don't need much height │  get full height.       │
│                 │  — scrolls minimally.   │  — no competition.      │
└─────────────────┴─────────────────────────┴──────────────────────────┘
```

### Medium (md): 2 columns — left = General+Selector, right = split settings vs skills

```
┌──────────────────────┬─────────────────────────────────────────────┐
│  GeneralForm         │  ┌─────────────────┬──────────────────────┐ │
│                      │  │  Preset Settings │  Skills & Scheduler  │ │
│  PresetsTabs         │  │  (name, stats,   │  SkillsPicker chips  │ │
│  (tab bar + chips)   │  │   mood, style,   │  RaceScheduler       │ │
│                      │  │   skill pts,     │  (calendar grid)     │ │
│                      │  │   strategy,      │                      │ │
│                      │  │   event setup)   │                      │ │
│                      │  └─────────────────┴──────────────────────┘ │
└──────────────────────┴──────────────────────────────────────────────┘
```

The right column uses a 2-column sub-grid (`1fr 1fr`). Each sub-column is independently scrollable (or both overflow into the parent column's scroll).

### Narrow (xs, sm): fully stacked — no grid

```
┌──────────────────────────────┐
│  GeneralForm                 │
├──────────────────────────────┤
│  PresetsTabs (selector)      │
├──────────────────────────────┤
│  Preset Settings             │
│  (name, stats, mood, style,  │
│   skill pts, strategy,       │
│   event setup)               │
├──────────────────────────────┤
│  SkillsPicker preview chips  │
├──────────────────────────────┤
│  RaceScheduler               │
└──────────────────────────────┘
```

## Breakpoint Summary

| Breakpoint | Columns | Layout |
|------------|---------|--------|
| `xs` (0–599) | 1 | Stacked: G → P → S → K → R |
| `sm` (600–899) | 1 | Stacked (same as xs) |
| `md` (900–1199) | 2 | Left: General+PresetsTabs / Right: 2-col sub-grid (Settings \| Skills+Scheduler) |
| `lg` (1200–1535) | 3 | General+PresetsTabs / Settings / Skills+Scheduler |
| `xl` (1536+) | 3 | Same as lg, more breathing room |

Key: G=GeneralForm, P=PresetsTabs, S=Settings, K=SkillsPicker, R=RaceScheduler

## Implementation Approach

### Files to modify

| File | Change |
|------|--------|
| `web/src/pages/Home.tsx` | Restructure the scenario tab's grid layout for 1/2/3 columns at breakpoints. Extract PresetsTabs from PresetsShell into the left column. |
| `web/src/components/presets/PresetsShell.tsx` | Make PresetsShell render only PresetPanel (no longer wraps PresetsTabs). Or create a standalone panel. |
| `web/src/components/presets/PresetPanel.tsx` | Split into two sub-sections: (a) settings columns containing name/stats/mood/style/skill pts/strategy/event setup, (b) SkillsPicker + RaceScheduler in a separate column. Accept a `layout` prop or use breakpoint-aware rendering. |
| `web/src/components/presets/SkillsPicker.tsx` | No layout change — just render the preview chips section as before. |
| `web/src/components/presets/RaceScheduler.tsx` | No layout change — renders its own calendar grid. |

### Details

1. **Home.tsx outer grid** — Change from 2-column to 3-column at lg+:
   ```tsx
   gridTemplateColumns: {
     xs: '1fr',
     md: collapsed ? '1fr' : 'minmax(280px, 360px) minmax(0, 1fr)',
     lg: collapsed ? '1fr' : 'minmax(280px, 360px) minmax(360px, 1fr) minmax(300px, 1fr)',
   }
   ```
   When `collapsed` is true, stack everything in 1 column.

2. **PresetPanel split** — Extract the "Settings" and "Skills+Scheduler" sections. At md+, render them in a `display: 'grid'` with `gridTemplateColumns: { md: '1fr 1fr', lg: 'none' }`. At lg+, the outer 3-column grid handles the split, so the panel renders as a single column.

   Alternatively: always render PresetPanel as a 2-column sub-grid (settings | skills+scheduler), and let the outer grid's column count handle the rest. On narrow, the inner grid collapses to 1 column.

3. **PresetsShell** — Currently wraps PresetsTabs + PresetPanel. After the refactor:
   - Home.tsx renders PresetsTabs directly in the left column
   - PresetsShell is removed or becomes just the PresetPanel renderer
   - Or: PresetsShell stays but accepts a `mode` prop to control whether it includes the tabs

4. **SkillsPicker preview** — The preview chips section at the top of SkillsPicker.tsx is lightweight. The full dialog opens on click. This is fine as-is.

5. **RaceScheduler** — The calendar grid is the heaviest component. Give it a `maxHeight` with `overflow: auto` so it scrolls internally rather than pushing the page.

### CSS Notes

- Use `alignItems: 'start'` on all grids to prevent vertical stretching
- Each column should have `minWidth: 0` to prevent grid overflow
- PresetsTabs needs to be scrollable horizontally (already handled by `variant="scrollable"`)
- RaceScheduler calendar uses `gridTemplateColumns: 'repeat(4, 1fr)'` — fine as-is

## Open Questions

1. **PresetsTabs in left column** — The tab bar includes action buttons (Add, Copy, Delete, Export, Import) and group chips. These need horizontal space. In a narrow left column (280–360px) they might wrap. Should the action buttons move to a toolbar row?
2. **EventSetupSection** — Currently inside PresetPanel. Should it stay in the Settings column, or move to Skills+Scheduler? It's moderately sized, so Settings column is fine.
3. **Strategy component** — URA has a short form; UnityCup has a longer form with opponent grids. Both should fit in the Settings column.
4. **Collapsed mode** — Currently collapses to 1 column. Same behavior applies — everything stacks.
