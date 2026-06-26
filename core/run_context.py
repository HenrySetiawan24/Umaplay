from datetime import datetime
from typing import Any, Dict, Optional

_current_run: Optional[Dict[str, Any]] = None
"""Shared run record reference for the currently executing scenario.
Set by BotState.start(), appended to by RaceFlow, finalized by agent on FinalScreen."""

_abs_turn: int = 0
"""Monotonically incrementing turn counter for absolute turn tracking."""


def get() -> Optional[Dict[str, Any]]:
    return _current_run


def set(record: Optional[Dict[str, Any]]) -> None:
    global _current_run, _abs_turn
    _current_run = record
    _abs_turn = 0 if record is None else len(record.get("turn_log") or [])


def push_turn_log(
    turn: int,
    date_key: str,
    action: str,
    *,
    training_type: Optional[str] = None,
    reason: Optional[str] = None,
    stats: Optional[Dict[str, int]] = None,
    energy: Optional[int] = None,
    mood: Optional[str] = None,
    skill_pts: Optional[int] = None,
) -> None:
    global _abs_turn
    record = _current_run
    if record is None or record.get("end_time"):
        return
    _abs_turn += 1
    entry: Dict[str, Any] = {
        "turn": turn,
        "abs_turn": _abs_turn,
        "date_key": date_key,
        "action": action,
    }
    if training_type is not None:
        entry["training_type"] = training_type
    if reason is not None:
        entry["reason"] = reason
    if stats is not None:
        entry["stats"] = dict(stats)
    if energy is not None:
        entry["energy"] = energy
    if mood is not None:
        entry["mood"] = mood
    if skill_pts is not None:
        entry["skill_pts"] = skill_pts
    record.setdefault("turn_log", []).append(entry)


def update_last_turn_log(**kwargs: Any) -> None:
    """Update the most recent turn_log entry with additional fields."""
    record = _current_run
    if record is None or record.get("end_time"):
        return
    log = record.get("turn_log")
    if not log:
        return
    log[-1].update(kwargs)


def tick_active_time() -> None:
    """Add elapsed time since last_resume_at to active_seconds and reset the checkpoint."""
    record = _current_run
    if record is None or record.get("end_time"):
        return
    last = record.get("last_resume_at")
    if last:
        try:
            elapsed = (datetime.now() - datetime.fromisoformat(last)).total_seconds()
            if elapsed > 0:
                record["active_seconds"] = (record.get("active_seconds") or 0) + elapsed
        except Exception:
            pass
    record["last_resume_at"] = datetime.now().isoformat()
