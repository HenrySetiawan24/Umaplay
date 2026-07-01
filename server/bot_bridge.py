from typing import Any, Callable, Dict, Optional

_start_fn: Optional[Callable[[Optional[str]], None]] = None
_stop_fn: Optional[Callable[[], None]] = None
_running_fn: Optional[Callable[[], bool]] = None

# AgentNav (daily races / team trials / roulette) control — registered by main.py.
_nav_start_fn: Optional[Callable[[str], None]] = None
_nav_stop_fn: Optional[Callable[[], None]] = None
_nav_status_fn: Optional[Callable[[], Dict[str, Any]]] = None


def register(
    start: Callable[[Optional[str]], None],
    stop: Callable[[], None],
    running: Callable[[], bool],
) -> None:
    global _start_fn, _stop_fn, _running_fn
    _start_fn = start
    _stop_fn = stop
    _running_fn = running


def register_nav(
    start: Callable[[str], None],
    stop: Callable[[], None],
    status: Callable[[], Dict[str, Any]],
) -> None:
    global _nav_start_fn, _nav_stop_fn, _nav_status_fn
    _nav_start_fn = start
    _nav_stop_fn = stop
    _nav_status_fn = status


def start_bot(continue_id: Optional[str] = None) -> None:
    if _start_fn is None:
        raise RuntimeError("BotState not registered")
    _start_fn(continue_id)


def stop_bot() -> None:
    if _stop_fn is None:
        raise RuntimeError("BotState not registered")
    _stop_fn()


def is_running() -> bool:
    if _running_fn is None:
        return False
    return _running_fn()


def start_nav(action: str) -> None:
    if _nav_start_fn is None:
        raise RuntimeError("NavState not registered")
    _nav_start_fn(action)


def stop_nav() -> None:
    if _nav_stop_fn is None:
        raise RuntimeError("NavState not registered")
    _nav_stop_fn()


def nav_status() -> Dict[str, Any]:
    if _nav_status_fn is None:
        return {"running": False, "action": None}
    return _nav_status_fn()
