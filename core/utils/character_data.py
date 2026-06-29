from __future__ import annotations

import json
import os
from typing import Any, Dict, List, Optional, Tuple

from core.utils.logger import logger_uma


_INDEX_PATH = os.path.join("datasets", "in_game", "character_index.json")
_DB: Optional[Dict[str, Any]] = None


def _load() -> Dict[str, Any]:
    global _DB
    if _DB is not None:
        return _DB
    try:
        with open(_INDEX_PATH, "r", encoding="utf-8") as f:
            _DB = json.load(f)
    except Exception as e:
        logger_uma.error("Failed to load character index: %s", e)
        _DB = {}
    return _DB


def reload() -> None:
    global _DB
    _DB = None
    _load()


def get_index() -> Dict[str, Any]:
    return _load()


def get_character(char_id: int) -> Optional[Dict[str, Any]]:
    return _load().get(str(char_id))


def get_goal_anchors(char_id: int) -> List[Tuple[int, int, int, int]]:
    """Return (turn, year, month, day) tuples for all goals."""
    c = get_character(char_id)
    if not c:
        return []
    return [(g["turn"], g["year"], g["month"], g["day"]) for g in (c.get("goals") or [])]


def get_goal_races(char_id: int) -> Dict[str, str]:
    """Return {date_key: race_name} for all goal races of a character."""
    c = get_character(char_id)
    if not c:
        return {}
    result: Dict[str, str] = {}
    for g in (c.get("goals") or []):
        race_name = g.get("race_name")
        if not race_name:
            continue
        dk = goal_turn_to_date_key(g["turn"])
        result[dk] = race_name
    return result


def search_characters(query: str) -> List[Dict[str, Any]]:
    """Search characters by name (English or Japanese)."""
    q = query.lower().strip()
    if not q:
        return []
    results = []
    for c in _load().values():
        if q in c.get("name_en", "").lower() or q in c.get("name_jp", "").lower():
            results.append(c)
    return sorted(results, key=lambda x: x.get("name_en", ""))


def goal_turn_to_date(turn: int) -> tuple[int, int, int]:
    """Career turn -> (year, month, day).

    turn 1  -> Y1-01-1, turn 12 -> Y1-06-2 (Junior Make Debut).
    turn >= 72 -> (4, 0, 0)  (URA finale / final season).
    turn < 1  -> (0, 1, 1)  (pre-debut sentinel).
    """
    if turn < 1 or turn >= 72:
        return (4, 0, 0) if turn >= 72 else (0, 1, 1)
    idx = turn - 1
    year = idx // 24 + 1
    month = (idx % 24) // 2 + 1
    day = (idx % 24) % 2 + 1
    return (year, month, day)


def goal_turn_to_date_key(turn: int) -> str:
    """Legacy string form. Prefer goal_turn_to_date()."""
    y, m, d = goal_turn_to_date(turn)
    if y == 0:
        return "Y0"
    if y == 4 and m == 0:
        return "Y4"
    return f"Y{y}-{m:02d}-{d}"
