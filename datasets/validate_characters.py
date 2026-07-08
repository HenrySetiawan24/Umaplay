#!/usr/bin/env python3
"""Integrity check for character_index.json + datasets/in_game/characters/*.json.

Re-run after any rescrape (scrape_character_goals.py / rescraper_characters.py)
to catch drift before it reaches the app: orphaned/missing detail files,
duplicate keys, schema drift, or the index/detail copies of goal data
diverging (goals are stored redundantly in both places).

Exit code 0 = clean, 1 = problems found. Read-only; makes no changes.
"""

import json
import os
import sys
from collections import Counter
from typing import Any, Dict

INDEX_PATH = os.path.join("datasets", "in_game", "character_index.json")
CHARACTERS_DIR = os.path.join("datasets", "in_game", "characters")

INDEX_REQUIRED_KEYS = {
    "char_id", "name_en", "name_jp", "card_id", "slug",
    "playable", "goal_count", "image_url", "thumb_url", "goals",
}
GOAL_REQUIRED_KEYS = {
    "order", "turn", "year", "month", "day",
    "race_name", "cond_type", "cond_value",
}


def load_json(path: str) -> Any:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def main() -> int:
    problems: list[str] = []

    if not os.path.exists(INDEX_PATH):
        print(f"FATAL: {INDEX_PATH} not found")
        return 1
    index: Dict[str, Any] = load_json(INDEX_PATH)

    if not os.path.isdir(CHARACTERS_DIR):
        print(f"FATAL: {CHARACTERS_DIR} not found")
        return 1
    files_on_disk = set(os.listdir(CHARACTERS_DIR))
    slugs_in_index = {v["slug"] + ".json" for v in index.values()}

    orphans = files_on_disk - slugs_in_index
    if orphans:
        problems.append(f"{len(orphans)} orphan file(s) not referenced by any index entry: {sorted(orphans)}")

    missing = slugs_in_index - files_on_disk
    if missing:
        problems.append(f"{len(missing)} index entr(y/ies) missing their detail file: {sorted(missing)}")

    slug_counts = Counter(v.get("slug") for v in index.values())
    dupe_slugs = {s: c for s, c in slug_counts.items() if c > 1}
    if dupe_slugs:
        problems.append(f"Duplicate slugs across index entries: {dupe_slugs}")

    name_counts = Counter(v.get("name_en") for v in index.values())
    dupe_names = {n: c for n, c in name_counts.items() if c > 1}
    if dupe_names:
        problems.append(f"Duplicate name_en across index entries: {dupe_names}")

    for key, entry in index.items():
        label = f"{entry.get('name_en', '?')} (key={key})"

        if str(entry.get("char_id")) != key:
            problems.append(f"{label}: index key does not match char_id {entry.get('char_id')}")

        extra = set(entry.keys()) - INDEX_REQUIRED_KEYS
        missing_keys = INDEX_REQUIRED_KEYS - set(entry.keys())
        if extra or missing_keys:
            problems.append(f"{label}: schema drift (extra={sorted(extra)}, missing={sorted(missing_keys)})")

        goals = entry.get("goals") or []
        if entry.get("goal_count") != len(goals):
            problems.append(f"{label}: goal_count={entry.get('goal_count')} but len(goals)={len(goals)}")

        for g in goals:
            g_missing = GOAL_REQUIRED_KEYS - set(g.keys())
            if g_missing:
                problems.append(f"{label}: goal order={g.get('order')} missing keys {sorted(g_missing)}")

        slug = entry.get("slug", "")
        detail_path = os.path.join(CHARACTERS_DIR, f"{slug}.json")
        if not os.path.exists(detail_path):
            continue  # already reported above as "missing"

        detail = load_json(detail_path)
        if detail.get("objectiveData_transformed") != goals:
            problems.append(f"{label}: detail file's objectiveData_transformed diverges from index goals")
        if detail.get("image_url") != entry.get("image_url") or detail.get("thumb_url") != entry.get("thumb_url"):
            problems.append(f"{label}: detail file's image_url/thumb_url diverges from index")

    if problems:
        print(f"Found {len(problems)} problem(s):\n")
        for p in problems:
            print(f"  - {p}")
        return 1

    print(f"OK: {len(index)} characters, {len(files_on_disk)} detail files — all consistent.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
