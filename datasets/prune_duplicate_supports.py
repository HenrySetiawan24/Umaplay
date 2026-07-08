#!/usr/bin/env python3
"""Remove duplicate support-card entries from datasets/in_game/events.json.

A support card is uniquely identified by (name, attribute, rarity). Scraping has
left 34 groups with 2-3 copies of the same card whose event lists differ — the
extras are artifacts (raw Japanese event names / mission events) alongside one
clean, mostly-English entry.

For each duplicate group this keeps a single best entry and drops the rest.
"Best" = prefer an entry that has an `id`, then the most English (ASCII) event
names, then the most events overall, then earliest position (stable).

Trainee/scenario rows are never touched (trainees have no duplicates).

Usage:
    python datasets/prune_duplicate_supports.py            # dry-run (report only)
    python datasets/prune_duplicate_supports.py --apply    # rewrite events.json
"""

from __future__ import annotations

import argparse
import json
from collections import defaultdict
from pathlib import Path

EVENTS_PATH = Path("datasets/in_game/events.json")


def _key(entry: dict) -> tuple:
    return (str(entry.get("name")), str(entry.get("attribute")), str(entry.get("rarity")))


def _is_ascii(s: str) -> bool:
    return all(ord(c) < 128 for c in str(s))


def _score(entry: dict) -> tuple:
    """Higher is better. Keep the most-translated, cleanest, canonical entry:
    (#English/ascii events, has id, fewest Japanese/junk events, #events)."""
    events = entry.get("choice_events") or []
    ascii_events = sum(1 for ev in events if _is_ascii(ev.get("name", "")))
    non_ascii = len(events) - ascii_events
    has_id = 1 if entry.get("id") else 0
    return (ascii_events, has_id, -non_ascii, len(events))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="rewrite events.json (default is dry-run)")
    args = ap.parse_args()

    if not EVENTS_PATH.exists():
        print(f"FATAL: {EVENTS_PATH} not found")
        return 1
    data = json.loads(EVENTS_PATH.read_text(encoding="utf-8"))

    # Group support entries (by index) by identity key.
    groups: dict[tuple, list[int]] = defaultdict(list)
    for i, entry in enumerate(data):
        if entry.get("type") == "support":
            groups[_key(entry)].append(i)

    drop_indices: set[int] = set()
    dup_groups = 0
    for key, idxs in groups.items():
        if len(idxs) < 2:
            continue
        dup_groups += 1
        # Choose the best index to keep; drop the others.
        best = max(idxs, key=lambda i: (_score(data[i]), -i))
        for i in idxs:
            if i != best:
                drop_indices.add(i)
        name, attr, rar = key
        kept = data[best]
        print(f"  {name} / {attr} / {rar}: keep #{best} "
              f"(id={'yes' if kept.get('id') else 'no'}, events={len(kept.get('choice_events') or [])}), "
              f"drop {sorted(i for i in idxs if i != best)}")

    support_total = sum(1 for e in data if e.get("type") == "support")
    print(
        f"\nDuplicate groups: {dup_groups} | entries to remove: {len(drop_indices)} | "
        f"support {support_total} -> {support_total - len(drop_indices)}"
    )

    if not drop_indices:
        print("Nothing to prune.")
        return 0

    if not args.apply:
        print("\nDry-run only. Re-run with --apply to rewrite events.json,")
        print("then rebuild the catalog:  python build_catalog.py")
        return 0

    pruned = [e for i, e in enumerate(data) if i not in drop_indices]
    EVENTS_PATH.write_text(
        json.dumps(pruned, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"\nWrote {len(pruned)} entries -> {EVENTS_PATH}")
    print("Now rebuild the catalog:  python build_catalog.py")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
