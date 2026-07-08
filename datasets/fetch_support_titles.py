#!/usr/bin/env python3
"""Attach each support card's flavor title (+ support_id) to events.json.

Support entries in events.json only ever carried {type, name, rarity,
attribute, choice_events} -- no card title (the bracketed subtitle shown on
the card, e.g. "[Hometown Cheers]"). Gametora publishes the full support-card
catalog (541 cards) as a single static JSON, keyed by (char_name, type,
rarity), which has both title_en and support_id in one shot -- no per-card
page scraping needed.

Note: (name, attribute, rarity) is not always unique on gametora's side either
-- popular characters get re-released as a "new" card at the same
type/rarity (e.g. two different GUTS SSR Special Week cards). Our own catalog
already stores only one entry per (name, attribute, rarity)
(post datasets/prune_duplicate_supports.py), so this picks gametora's
earliest release at that combo as a reasonable, deterministic choice -- there
is no way to know which specific historical release our single scraped entry
corresponds to.

Usage:
    python datasets/fetch_support_titles.py            # dry-run (report only)
    python datasets/fetch_support_titles.py --apply     # rewrite events.json
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import requests

EVENTS_PATH = Path("datasets/in_game/events.json")
SUPPORT_CARDS_URL = "https://gametora.com/data/umamusume/support-cards.99644539.json"

TYPE_MAP = {
    "speed": "SPD",
    "stamina": "STA",
    "power": "PWR",
    "guts": "GUTS",
    "intelligence": "WIT",
    "friend": "PAL",
    "group": "GRP",
}
RARITY_MAP = {1: "R", 2: "SR", 3: "SSR"}


def build_gametora_index(entries: list[dict]) -> dict[tuple, dict]:
    """(char_name, attribute, rarity) -> best gametora entry (earliest release)."""
    groups: dict[tuple, list[dict]] = {}
    for e in entries:
        attr = TYPE_MAP.get(e.get("type"))
        rar = RARITY_MAP.get(e.get("rarity"))
        if not attr or not rar:
            continue
        key = (e.get("char_name"), attr, rar)
        groups.setdefault(key, []).append(e)

    index: dict[tuple, dict] = {}
    for key, group in groups.items():
        group.sort(key=lambda e: (e.get("release_en") or e.get("release") or "9999"))
        index[key] = group[0]
    return index


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="rewrite events.json (default is dry-run)")
    args = ap.parse_args()

    if not EVENTS_PATH.exists():
        print(f"FATAL: {EVENTS_PATH} not found")
        return 1

    print(f"Fetching {SUPPORT_CARDS_URL} ...")
    r = requests.get(SUPPORT_CARDS_URL, timeout=30, headers={"User-Agent": "Mozilla/5.0"})
    r.raise_for_status()
    gt_entries = r.json()
    print(f"  {len(gt_entries)} cards in gametora's catalog")

    gt_index = build_gametora_index(gt_entries)

    data = json.loads(EVENTS_PATH.read_text(encoding="utf-8"))
    matched = 0
    unmatched: list[tuple] = []
    for entry in data:
        if entry.get("type") != "support":
            continue
        key = (entry.get("name"), entry.get("attribute"), entry.get("rarity"))
        gt = gt_index.get(key)
        if gt is None:
            unmatched.append(key)
            entry["title"] = None
            entry["support_id"] = None
            continue
        matched += 1
        entry["title"] = gt.get("title_en")
        entry["support_id"] = gt.get("support_id")

    support_total = sum(1 for e in data if e.get("type") == "support")
    print(f"\nMatched: {matched}/{support_total}")
    if unmatched:
        print(f"Unmatched ({len(unmatched)}) -- kept title=None, support_id=None:")
        for k in unmatched:
            print(f"   {k}")

    if not args.apply:
        print("\nDry-run only. Re-run with --apply to rewrite events.json,")
        print("then rebuild the catalog:  python build_catalog.py")
        return 0

    EVENTS_PATH.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"\nWrote {len(data)} entries -> {EVENTS_PATH}")
    print("Now rebuild the catalog:  python build_catalog.py")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
