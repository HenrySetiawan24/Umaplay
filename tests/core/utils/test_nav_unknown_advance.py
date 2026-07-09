from __future__ import annotations

from typing import Any, Dict, List

from core.utils.nav import try_advance_unknown


class DummyWaiter:
    def __init__(self, *, click_result: bool = False) -> None:
        self._click_result = click_result
        self.click_when_calls: List[Dict[str, Any]] = []

    def click_when(self, **kwargs):
        self.click_when_calls.append(kwargs)
        return self._click_result


def test_cheap_gate_skips_probe_without_candidate_buttons():
    waiter = DummyWaiter(click_result=True)
    dets = [{"name": "race_square", "conf": 0.9}, {"name": "button_skip", "conf": 0.8}]

    assert try_advance_unknown(waiter, dets, tag_prefix="agent_nav") is False
    assert waiter.click_when_calls == []


def test_probes_when_candidate_button_present():
    waiter = DummyWaiter(click_result=True)
    dets = [{"name": "button_green", "conf": 0.66}]

    assert try_advance_unknown(waiter, dets, tag_prefix="agent_nav") is True
    assert len(waiter.click_when_calls) == 1


def test_probes_when_dets_omitted():
    waiter = DummyWaiter(click_result=False)

    assert try_advance_unknown(waiter, tag_prefix="agent_nav") is False
    assert len(waiter.click_when_calls) == 1


def test_click_is_ocr_verified_and_safety_lists_forwarded():
    waiter = DummyWaiter(click_result=True)
    dets = [{"name": "button_white", "conf": 0.7}]

    try_advance_unknown(waiter, dets, tag_prefix="agent_nav")

    (call,) = waiter.click_when_calls
    # Never class-only: greedy fast paths must be off so every click goes
    # through the OCR-disambiguation step.
    assert call["allow_greedy_click"] is False
    assert call["texts"] == ("CLOSE", "OK", "NEXT")
    for verb in ("RESTORE", "RETIRE", "TRY AGAIN", "CANCEL", "RACE", "BACK", "SHOP"):
        assert verb in call["forbid_texts"]
    assert call["tag"] == "agent_nav_unknown_advance"
