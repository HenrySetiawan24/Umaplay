import json
from pathlib import Path
from typing import Any, Dict, List, Optional

PREFS_DIR = Path(__file__).resolve().parent.parent / "prefs"
HISTORY_PATH = PREFS_DIR / "run_history.json"
DETAIL_DIR = PREFS_DIR / "run_detail"

# Fields kept in the summary (run_history.json).
# turn_log and active_periods live in run_detail/{id}.json instead.
_SUMMARY_KEYS = {
    "id", "scenario", "preset_name", "uma_name", "char_id",
    "start_date", "start_time", "end_time",
    "final_turn", "final_stats", "final_mood", "final_fans", "final_rank",
    "completed", "error",
    "active_seconds",
    "race_count", "training_count", "rest_count", "recreation_count",
    "races_attempted",  # kept empty for schema compat
}


def _compute_counts(record: Dict[str, Any]) -> Dict[str, int]:
    log = record.get("turn_log") or []
    return {
        "race_count": sum(1 for e in log if e.get("race_name") is not None),
        "training_count": sum(1 for e in log if e.get("action") in ("to_training", "training_ready")),
        "rest_count": sum(1 for e in log if e.get("action") == "rested" and e.get("training_type") != "recreation"),
        "recreation_count": sum(1 for e in log if e.get("action") == "rested" and e.get("training_type") == "recreation"),
    }


def _to_summary(record: Dict[str, Any]) -> Dict[str, Any]:
    summary = {k: v for k, v in record.items() if k in _SUMMARY_KEYS}
    summary.update(_compute_counts(record))
    return summary


def _to_detail(record: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "turn_log": record.get("turn_log") or [],
        "active_periods": record.get("active_periods") or [],
    }


def load_history() -> List[Dict[str, Any]]:
    if not HISTORY_PATH.exists():
        return []
    try:
        with open(HISTORY_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
            return data if isinstance(data, list) else []
    except Exception:
        return []


def load_detail(record_id: str) -> Optional[Dict[str, Any]]:
    """Return {turn_log, active_periods} for a run, or None if no detail file exists."""
    path = DETAIL_DIR / f"{record_id}.json"
    if not path.exists():
        return None
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


def append_history(record: Dict[str, Any]) -> None:
    """Upsert a run: write summary to run_history.json, full detail to run_detail/{id}.json."""
    DETAIL_DIR.mkdir(parents=True, exist_ok=True)
    record_id = record.get("id")

    if record_id:
        detail_path = DETAIL_DIR / f"{record_id}.json"
        with open(detail_path, "w", encoding="utf-8") as f:
            json.dump(_to_detail(record), f, indent=2)

    summary = _to_summary(record)
    records = load_history()
    for i, r in enumerate(records):
        if r.get("id") == record_id:
            records[i] = summary
            break
    else:
        records.append(summary)
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
    detail_path = DETAIL_DIR / f"{record_id}.json"
    if detail_path.exists():
        detail_path.unlink()
    return True


def get_record(record_id: str) -> Optional[Dict[str, Any]]:
    """Return the summary record only."""
    for r in load_history():
        if r.get("id") == record_id:
            return r
    return None


def get_full_record(record_id: str) -> Optional[Dict[str, Any]]:
    """Return summary merged with detail (turn_log + active_periods) for run continuation."""
    summary = get_record(record_id)
    if not summary:
        return None
    detail = load_detail(record_id)
    if detail:
        return {**summary, **detail}
    return summary


def find_incomplete() -> List[Dict[str, Any]]:
    return [r for r in load_history() if not r.get("completed", False)]
