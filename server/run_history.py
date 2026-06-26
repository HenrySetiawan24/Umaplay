import json
from pathlib import Path
from typing import Any, Dict, List, Optional

PREFS_DIR = Path(__file__).resolve().parent.parent / "prefs"
HISTORY_PATH = PREFS_DIR / "run_history.json"


def load_history() -> List[Dict[str, Any]]:
    if not HISTORY_PATH.exists():
        return []
    try:
        with open(HISTORY_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
            return data if isinstance(data, list) else []
    except Exception:
        return []


def append_history(record: Dict[str, Any]) -> None:
    """Upsert a run record by its 'id' field (insert if new, replace if exists)."""
    records = load_history()
    record_id = record.get("id")
    for i, r in enumerate(records):
        if r.get("id") == record_id:
            records[i] = record
            break
    else:
        records.append(record)
    with open(HISTORY_PATH, "w", encoding="utf-8") as f:
        json.dump(records, f, indent=2)


def delete_history(record_id: str) -> bool:
    records = load_history()
    before = len(records)
    records = [r for r in records if r.get("id") != record_id]
    if len(records) == before:
        return False
    with open(HISTORY_PATH, "w", encoding="utf-8") as f:
        json.dump(records, f, indent=2)
    return True
