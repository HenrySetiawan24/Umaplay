from typing import Any, Dict, Optional

_current_run: Optional[Dict[str, Any]] = None
"""Shared run record reference for the currently executing scenario.
Set by BotState.start(), appended to by RaceFlow, finalized by agent on FinalScreen."""


def get() -> Optional[Dict[str, Any]]:
    return _current_run


def set(record: Optional[Dict[str, Any]]) -> None:
    global _current_run
    _current_run = record
