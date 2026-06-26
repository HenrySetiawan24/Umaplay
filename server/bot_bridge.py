from typing import Callable, Optional

_start_fn: Optional[Callable[[Optional[str]], None]] = None
_stop_fn: Optional[Callable[[], None]] = None
_running_fn: Optional[Callable[[], bool]] = None


def register(
    start: Callable[[Optional[str]], None],
    stop: Callable[[], None],
    running: Callable[[], bool],
) -> None:
    global _start_fn, _stop_fn, _running_fn
    _start_fn = start
    _stop_fn = stop
    _running_fn = running


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
