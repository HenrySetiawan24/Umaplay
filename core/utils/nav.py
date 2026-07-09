# core/utils/nav.py
from __future__ import annotations

import random
from time import sleep
from typing import List, Sequence, Tuple, Dict, Optional, Iterable

from PIL import Image

from core.controllers.base import IController
from core.perception.yolo.interface import IDetector
from core.settings import Settings
from core.types import DetectionDict
from core.utils.geometry import crop_pil
from core.utils.logger import logger_uma
from core.utils.pointer import smart_scroll_small
from core.utils.text import fuzzy_contains
from core.utils.waiter import Waiter


def collect_snapshot(
    waiter: Waiter,
    yolo_engine: IDetector,
    *,
    agent: Optional[str] = None,
    tag: str,
) -> Tuple[Image.Image, List[DetectionDict]]:
    active_agent = agent if agent is not None else getattr(waiter, "agent", None)
    if active_agent is None:
        logger_uma.warning(
            "collect_snapshot called without agent; defaulting to generic debug folder",
            extra={"collect_snapshot_tag": tag},
        )
    img, _, dets = yolo_engine.recognize(
        imgsz=waiter.cfg.imgsz,
        conf=waiter.cfg.conf,
        iou=waiter.cfg.iou,
        agent=active_agent,
        tag=tag,
    )
    return img, dets


def has(dets: List[DetectionDict], name: str, *, conf_min: float = 0.0) -> bool:
    return any(
        d.get("name") == name and float(d.get("conf", 0.0)) >= conf_min for d in dets
    )


def maybe_handle_connection_error(
    waiter: Waiter,
    dets: Optional[List[DetectionDict]] = None,
    *,
    tag_prefix: str = "conn_err",
) -> bool:
    """
    Detect and dismiss the game's **Connection Error** popup — a network-hiccup
    modal (green *Retry* + white *Title Screen*) that can overlay ANY screen —
    by clicking *Retry* to resume in place. Meant to be called at the top of
    every flow's poll loop as a shared recovery step (no flow has a common
    per-iteration hook otherwise).

    Cheap gate: *Retry* is a green button, so when `dets` is given, skip the OCR
    probe entirely if no `button_green` is on screen this frame. Pass `dets=None`
    (e.g. from a flow that doesn't have fresh detections handy) to always probe.
    Matching requires the literal text "Retry" (`require_text_match`), so it
    won't fire on the race-loss "Try Again" popup or ordinary green NEXT/OK
    buttons. Returns True if it clicked Retry.
    """
    if dets is not None and not any(d.get("name") == "button_green" for d in dets):
        return False
    if waiter.click_when(
        classes=("button_green",),
        texts=("RETRY",),
        prefer_bottom=True,
        allow_greedy_click=True,
        require_text_match=True,
        timeout_s=0.4,
        tag=f"{tag_prefix}_retry",
    ):
        logger_uma.warning(
            "[nav] Connection Error detected; clicked Retry to recover."
        )
        sleep(1.0)
        return True
    return False


def try_advance_unknown(
    waiter: Waiter,
    dets: Optional[List[DetectionDict]] = None,
    *,
    tag_prefix: str,
    timeout_s: float = 0.6,
) -> bool:
    """
    Last-resort advance for a screen the caller's classifier couldn't name:
    OCR the generic buttons on screen and click one only if it reads a
    known-safe, forward-only dismisser (CLOSE/OK/NEXT). Never clicks
    class-only (`allow_greedy_click=False`) — an unknown screen is exactly
    where a bare `button_green` tap can commit something destructive — and
    forbids every verb that spends resources (RESTORE), commits (RACE), or
    regresses (BACK/CANCEL). Worst case it clicks nothing and the caller is
    no worse off than before.

    Cheap gate: when `dets` is given, skip the OCR probe entirely if the
    frame has no green/white button (mirrors `maybe_handle_connection_error`).

    Even a no-click call pays off in logs: `_pick_by_text` prints every
    candidate's OCR text (`[waiter] OCR candidate … text=…`), turning
    "Unknown screen" into "unknown screen whose buttons say X/Y" so a proper
    classifier rule can be written later. Returns True if it clicked.
    """
    if dets is not None and not any(
        d.get("name") in ("button_green", "button_white") for d in dets
    ):
        return False
    return waiter.click_when(
        classes=("button_green", "button_white"),
        texts=("CLOSE", "OK", "NEXT"),
        allow_greedy_click=False,
        prefer_bottom=False,
        forbid_texts=("RESTORE", "RETIRE", "TRY AGAIN", "CANCEL", "RACE", "BACK", "SHOP"),
        timeout_s=timeout_s,
        tag=f"{tag_prefix}_unknown_advance",
    )


def by_name(
    dets: List[DetectionDict], name: str, *, conf_min: float = 0.0
) -> List[DetectionDict]:
    return [
        d
        for d in dets
        if d.get("name") == name and float(d.get("conf", 0.0)) >= conf_min
    ]


def rows_top_to_bottom(
    dets: List[DetectionDict], name: str, *, conf_min: float = 0.0
) -> List[DetectionDict]:
    rows = by_name(dets, name, conf_min=conf_min)
    rows.sort(key=lambda d: d["xyxy"][1])
    return rows


def _detections_in_row(
    dets: List[DetectionDict], row: DetectionDict, name: str, *, conf_min: float = 0.0
) -> List[DetectionDict]:
    """Return detections with given name whose center lies inside the row bounds."""
    rx1, ry1, rx2, ry2 = row["xyxy"]
    matches: List[DetectionDict] = []
    for d in by_name(dets, name, conf_min=conf_min):
        x1, y1, x2, y2 = d["xyxy"]
        cx = 0.5 * (x1 + x2)
        cy = 0.5 * (y1 + y2)
        if rx1 <= cx <= rx2 and ry1 <= cy <= ry2:
            matches.append(d)
    return matches


def random_center_tap(
    ctrl: IController, img: Image.Image, *, clicks: int, dev_frac: float = 0.20
) -> None:
    """Tap near the center with random deviation."""
    W, H = img.size
    cx = W * 0.5 + random.uniform(-W * dev_frac, W * dev_frac)
    cy = H * 0.5 + random.uniform(-H * dev_frac, H * dev_frac)
    ctrl.click_xyxy_center((cx, cy, cx, cy), clicks=clicks)


def click_button_loop(
    waiter: Waiter,
    *,
    classes: Sequence[str],
    tag_prefix: str,
    max_clicks: int = 6,
    sleep_between_s: float = 0.30,
    prefer_bottom: bool = True,
    texts: Optional[Sequence[str]] = None,
    clicks_each: int = 1,
    allow_greedy_click: bool = True,
    forbid_texts: Optional[Sequence[str]] = None,
    timeout_s: float = 2.0,
) -> int:
    """
    Repeatedly click a button limited by max_clicks. Returns number of successful clicks.
    """
    done = 0
    while done < max_clicks:
        ok = waiter.click_when(
            classes=classes,
            texts=texts,
            prefer_bottom=prefer_bottom,
            allow_greedy_click=allow_greedy_click,
            forbid_texts=forbid_texts,
            clicks=clicks_each,
            timeout_s=timeout_s,
            tag=f"{tag_prefix}_loop",
        )
        if not ok:
            break
        done += 1
        sleep(sleep_between_s)
    return done


def advance_sequence_with_mid_taps(
    waiter: Waiter,
    yolo_engine: IDetector,
    ctrl: IController,
    *,
    tag_prefix: str,
    iterations_max: int = 6,
    advance_class: str = "button_advance",
    advance_texts: Optional[Sequence[str]] = None,
    taps_each_click: Tuple[int, int] = (3, 4),
    tap_dev_frac: float = 0.20,
    sleep_after_advance: float = 0.40,
):
    """
    Click NEXT/advance a few times; after each advance, tap around center to nudge UI.
    Returns number of advances performed.
    """
    advances = 0
    last_clicked_pos = None  # Store the last clicked position
    for i in range(iterations_max):
        did, clicked_obj = waiter.click_when(
            classes=(advance_class,),
            texts=advance_texts,
            prefer_bottom=True,
            allow_greedy_click=True,
            timeout_s=2.3,
            clicks=random.randint(*taps_each_click),
            tag=f"{tag_prefix}_advance",
            return_object=True,
        )
        if not did and i > 5:
            break
        sleep(sleep_after_advance)
        
        # Click on the same position as the button we just clicked
        if clicked_obj:
            # Update last clicked position
            x1, y1, x2, y2 = clicked_obj["xyxy"]
            last_clicked_pos = (x1, y1 + 10, x2, y2 + 10)  # Store with offset
            ctrl.click_xyxy_center(
                last_clicked_pos,
                clicks=random.randint(2, 3),
            )
        elif last_clicked_pos and i < 5:
            # Click the last known position if available
            ctrl.click_xyxy_center(
                last_clicked_pos,
                clicks=random.randint(2, 3),
            )
        else:
            # Fallback to bottom right corner if no previous position
            img, _ = collect_snapshot(waiter, yolo_engine, tag=f"{tag_prefix}_tap")
            width, height = img.size
            # Click bottom right quarter of the screen
            bottom_right = (width * 0.9, height * 0.9, width * 0.98, height * 0.98)
            ctrl.click_xyxy_center(
                bottom_right,
                clicks=random.randint(2, 3),
            )
        
        advances += 1
        sleep(sleep_after_advance)
    return advances


def _shop_item_order() -> Iterable[Tuple[str, str]]:
    prefs = Settings.get_shop_nav_prefs()
    order = [
        ("shop_clock", "alarm_clock"),
        ("shop_star_piece", "star_pieces"),
        ("shop_parfait", "parfait"),
    ]
    for det_name, pref_key in order:
        if prefs.get(pref_key, False):
            yield det_name, pref_key


def _row_checkbox_point(row: DetectionDict, x_frac: float) -> Tuple[float, float, float, float]:
    """
    Approximate click point for a shop_row's multi-select checkbox, which sits
    near the row's right edge. Expressed as a fraction of the row's own
    detected width so it scales with resolution/aspect ratio instead of a
    fixed screen-space offset.
    """
    x1, y1, x2, y2 = row["xyxy"]
    cx = x1 + (x2 - x1) * x_frac
    cy = 0.5 * (y1 + y2)
    return (cx, cy, cx, cy)


def _row_item_name(waiter: Waiter, img: Image.Image, row: DetectionDict) -> str:
    """OCR the item-name area of a shop_row (between the icon and the cost/checkbox)."""
    if not waiter.ocr:
        return ""
    x1, y1, x2, y2 = row["xyxy"]
    w = x2 - x1
    crop = crop_pil(img, (x1 + w * 0.22, y1, x1 + w * 0.75, y2), pad=0)
    return (waiter.ocr.text(crop) or "").strip()


def _ocr_click_text(
    waiter: Waiter,
    img: Image.Image,
    targets: Sequence[str],
    *,
    threshold: float = 0.8,
    forbid: Optional[Sequence[str]] = None,
    forbid_threshold: float = 0.85,
    tag: str,
    clicks: int = 1,
) -> bool:
    """
    Click UI text that has NO YOLO class by OCR'ing `img` and fuzzy-matching
    each recognized line, clicking the best-scoring box.

    Needed for the shop's 'Select All' button: it's a small pill the nav model
    doesn't classify as `button_green` (different shape), so a
    `click_when(classes=("button_green",))` poll never surfaces it as a
    candidate — the frame only ever yields the large 'Confirm' green button.
    Mirrors `DailyLegendFlow._click_text` (`core/actions/daily_race.py`).

    Coordinates: OCR boxes are in last-screenshot space; `click_xyxy_center`
    translates them via the origin set by the capture that produced `img`.
    Pass an image straight from `collect_snapshot` and don't capture again
    before this returns, so that origin is still the one for `img` (handles
    Steam's left-half capture, which a bare `ctrl.screenshot()` would not).
    """
    ocr = waiter.ocr
    ctrl = waiter.ctrl
    if not ocr:
        return False
    try:
        j = ocr.raw(img)
    except Exception as e:  # pragma: no cover - perception failure
        logger_uma.warning("[nav] OCR raw failed (tag=%s): %s", tag, e)
        return False
    res = (j or {}).get("res", {}) or {}
    texts = res.get("rec_texts", []) or []
    boxes = res.get("rec_boxes", None)
    polys = res.get("rec_polys", None)

    best: Optional[Tuple[float, float, float, float]] = None
    best_s = 0.0
    best_text = ""
    for i, raw_t in enumerate(texts):
        t = (raw_t or "").strip()
        if not t:
            continue
        box: Optional[Tuple[float, float, float, float]] = None
        if boxes is not None and i < len(boxes):
            try:
                b = boxes[i]
                box = (float(b[0]), float(b[1]), float(b[2]), float(b[3]))
            except Exception:
                box = None
        if box is None and polys is not None and i < len(polys):
            try:
                pts = polys[i]
                xs = [float(p[0]) for p in pts]
                ys = [float(p[1]) for p in pts]
                box = (min(xs), min(ys), max(xs), max(ys))
            except Exception:
                box = None
        if box is None:
            continue
        if forbid and any(
            fuzzy_contains(t, f, threshold=forbid_threshold) for f in forbid
        ):
            # e.g. skip 'Deselect All' when hunting 'Select All' ('select all'
            # is a substring of 'deselect all', so it would otherwise match).
            continue
        for tgt in targets:
            ok, r = fuzzy_contains(t, tgt, threshold=threshold, return_ratio=True)
            if ok and r > best_s:
                best, best_s, best_text = box, r, t

    if best is None:
        return False
    ctrl.click_xyxy_center(best, clicks=clicks)
    logger_uma.info(
        "[nav] OCR-clicked '%s' via text=%r (score=%.2f, tag=%s)",
        targets[0],
        best_text,
        best_s,
        tag,
    )
    return True


def _click_select_all(waiter: Waiter, img: Image.Image, tag_prefix: str) -> bool:
    # 'Select All' is a small pill the nav YOLO model doesn't detect as
    # button_green, so locate it by OCR text instead. Both casings are passed
    # because the OCR normalizer maps lowercase 'l'->'1' but not uppercase 'L',
    # so "Select All" and "SELECT ALL" normalize differently and only the
    # matching-case target scores 1.0. threshold=0.82 keeps the
    # "Select an item to purchase." header (best token ~0.75) out; 'Deselect
    # All' is forbidden since "select all" is a substring of it.
    return _ocr_click_text(
        waiter,
        img,
        ("Select All", "SELECT ALL"),
        threshold=0.82,
        forbid=("Deselect All", "DESELECT ALL"),
        tag=f"{tag_prefix}_select_all",
    )


def _click_confirm_purchase(waiter: Waiter, tag_prefix: str) -> bool:
    """Click the bottom 'Confirm' button, then walk through the resulting
    purchase confirmation popup (if any) and close the 'Exchange Complete'
    summary."""
    ok = waiter.click_when(
        classes=("button_green",),
        texts=("CONFIRM",),
        prefer_bottom=True,
        allow_greedy_click=True,
        require_text_match=True,
        timeout_s=3.0,
        tag=f"{tag_prefix}_confirm",
    )
    if not ok:
        return False

    sleep(1.0)
    waiter.click_when(
        classes=("button_green",),
        texts=("EXCHANGE", "PURCHASE", "OK", "YES"),
        prefer_bottom=False,
        allow_greedy_click=True,
        timeout_s=3.0,
        tag=f"{tag_prefix}_confirm_popup",
    )

    # After the purchase commits, the game shows an 'Exchange Complete' summary
    # (all bought items + monies delta) whose only dismiss is a white 'Close'
    # button. It renders after a short processing delay, so a single click can
    # land mid-transition — retry a few times and stop as soon as it's gone.
    dismissed = False
    for attempt in range(4):
        sleep(0.8)
        clicked = waiter.click_when(
            classes=("button_white",),
            texts=("CLOSE",),
            prefer_bottom=True,
            allow_greedy_click=True,
            require_text_match=True,  # only click a white button reading 'Close'
            # — never the shop's white 'Back' if the summary is already gone.
            timeout_s=2.0,
            tag=f"{tag_prefix}_confirm_close",
        )
        if clicked:
            dismissed = True
            sleep(0.6)
            # Confirm the summary is actually gone; if a Close button is no
            # longer present, we're done.
            if not waiter.seen(
                classes=("button_white",),
                texts=("CLOSE",),
                tag=f"{tag_prefix}_confirm_close_check",
            ):
                break
    if not dismissed:
        logger_uma.warning(
            "[nav] shop: 'Exchange Complete' Close button not found (tag=%s)", tag_prefix
        )
    sleep(0.4)
    return True


def end_sale_dialog(waiter: Waiter, tag_prefix: str) -> bool:
    """
    Leave the shop screen. The multi-select UI's exit control is a white
    'Back' button (bottom-left) rather than the old 'End Sale' dialog, so both
    are accepted — 'Back' covers the common case, 'End Sale' is kept for
    whatever screen still shows it.
    """
    clicked_end = waiter.click_when(
        classes=("button_white",),
        texts=("BACK", "END SALE"),
        prefer_bottom=False,
        timeout_s=2.5,
        allow_greedy_click=False,
        tag=f"{tag_prefix}_end_sale",
    )
    if not clicked_end:
        waiter.click_when(
            classes=("ui_race",),
            prefer_bottom=True,
            timeout_s=2.0,
            allow_greedy_click=True,
            tag=f"{tag_prefix}_race_fallback",
        )
        return False

    sleep(0.7)
    waiter.click_when(
        classes=("button_green",),
        texts=("OK",),
        prefer_bottom=False,
        timeout_s=2.0,
        allow_greedy_click=False,
        tag=f"{tag_prefix}_ok",
    )
    sleep(0.6)
    waiter.click_when(
        classes=("ui_race",),
        prefer_bottom=True,
        timeout_s=2.0,
        allow_greedy_click=True,
        tag=f"{tag_prefix}_race",
    )
    return True

def _handle_shop_buy_all(
    waiter: Waiter, yolo_engine: IDetector, tag_prefix: str
) -> bool:
    """Multi-select UI: tap 'Select All' then 'Confirm' once."""
    # Grab the frame via the same capture path the waiter clicks in so the OCR
    # box for 'Select All' maps back to the right screen coords.
    img, _dets = collect_snapshot(waiter, yolo_engine, tag=f"{tag_prefix}_select_all_scan")
    if not _click_select_all(waiter, img, tag_prefix):
        logger_uma.info("[nav] shop: 'Select All' not found (nothing to buy?)")
        end_sale_dialog(waiter, tag_prefix)
        return False

    sleep(0.6)
    if not _click_confirm_purchase(waiter, tag_prefix):
        logger_uma.warning("[nav] shop: 'Confirm' failed after Select All")
        end_sale_dialog(waiter, tag_prefix)
        return False

    logger_uma.info("[nav] shop: bought all available items")
    end_sale_dialog(waiter, tag_prefix)
    return True


def _handle_shop_selective(
    waiter: Waiter,
    yolo_engine: IDetector,
    ctrl: IController,
    prefs_enabled: List[Tuple[str, str]],
    *,
    tag_prefix: str,
    max_cycles: int,
) -> bool:
    """
    Multi-select UI: tick the checkbox for rows matching enabled preferences,
    then 'Confirm' once. Rows are deduped by OCR'd item name so an overlapping
    scroll pass never re-taps (and un-checks) an item already selected.
    """
    checked_names: set = set()
    stagnant_passes = 0
    attempts = 0

    while attempts < max_cycles:
        attempts += 1
        img, dets = collect_snapshot(waiter, yolo_engine, tag=f"{tag_prefix}_scan")

        rows = rows_top_to_bottom(dets, "shop_row")
        if not rows:
            logger_uma.debug("[nav] shop: no shop_row detected, retry scrolling")
            smart_scroll_small(ctrl, steps_android=1, steps_pc=1)
            sleep(1.0)
            continue

        new_this_pass = 0
        for det_name, pref_key in prefs_enabled:
            for row in rows:
                if not _detections_in_row(dets, row, det_name):
                    continue

                name_text = _row_item_name(waiter, img, row)
                if not name_text or name_text in checked_names:
                    continue

                checked_names.add(name_text)
                point = _row_checkbox_point(row, Settings.SHOP_CHECKBOX_X_FRAC)
                ctrl.click_xyxy_center(point, clicks=1)
                logger_uma.info(
                    f"[nav] shop: checked '{name_text}' (pref={pref_key}) at {point}"
                )
                new_this_pass += 1
                sleep(0.35)

        if new_this_pass == 0:
            stagnant_passes += 1
            if stagnant_passes >= 2:
                break
        else:
            stagnant_passes = 0

        smart_scroll_small(ctrl, steps_android=1, steps_pc=1)
        sleep(0.8)

    if not checked_names:
        logger_uma.info("[nav] shop: preferences not satisfied after scroll attempts")
        end_sale_dialog(waiter, tag_prefix)
        return False

    sleep(0.4)
    if not _click_confirm_purchase(waiter, tag_prefix):
        logger_uma.warning("[nav] shop: 'Confirm' failed after selecting items")
        end_sale_dialog(waiter, tag_prefix)
        return False

    logger_uma.info("[nav] shop: purchased %d selected item(s)", len(checked_names))
    end_sale_dialog(waiter, tag_prefix)
    return True


def handle_shop_exchange(
    waiter: Waiter,
    yolo_engine: IDetector,
    ctrl: IController,
    *,
    tag_prefix: str = "shop",
    ensure_enter: bool = True,
    max_cycles: int = 6,
) -> bool:
    prefs = Settings.get_shop_nav_prefs()
    buy_all = bool(prefs.get("buy_all", False))
    prefs_enabled = list(_shop_item_order())
    if not buy_all and not prefs_enabled:
        logger_uma.info("[nav] shop: all items disabled by preference")
        return False

    shop_appeared = True
    if ensure_enter:
        _img, dets_pre = collect_snapshot(
            waiter, yolo_engine, tag=f"{tag_prefix}_precheck"
        )
        in_shop_already = bool(rows_top_to_bottom(dets_pre, "shop_row")) or has(
            dets_pre, "shop_clock", conf_min=0.30
        ) or has(dets_pre, "shop_exchange", conf_min=0.30)

        if in_shop_already:
            logger_uma.debug(
                "[nav] shop: detected existing shop UI, skipping 'SHOP' enter click"
            )
        else:
            # Most calls land here with no shop prompt at all this pass (shop
            # doesn't appear every race). If the precheck frame already shows
            # zero button_green candidates, an 8s poll can't discover one that
            # isn't there — a brief poll only covers late-rendering animation.
            # If a button_green IS already visible (just needs OCR/timing to
            # confirm it says SHOP), keep the full budget.
            enter_timeout = 8.0 if has(dets_pre, "button_green") else 1.5
            shop_appeared = waiter.click_when(
                classes=("button_green",),
                texts=("SHOP",),
                prefer_bottom=False,
                allow_greedy_click=True,
                timeout_s=enter_timeout,
                clicks=2,
                tag=f"{tag_prefix}_enter",
            )
            if not shop_appeared:
                return False
            sleep(2.5)
    else:
        sleep(1.0)

    if buy_all:
        return _handle_shop_buy_all(waiter, yolo_engine, tag_prefix)
    return _handle_shop_selective(
        waiter, yolo_engine, ctrl, prefs_enabled, tag_prefix=tag_prefix, max_cycles=max_cycles
    )
