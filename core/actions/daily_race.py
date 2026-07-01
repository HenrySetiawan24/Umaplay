# core/actions/daily_race.py
from __future__ import annotations

import random
from time import sleep
from typing import List, Optional, Sequence, Tuple

from PIL import Image

from core.controllers.base import IController
from core.controllers.android import ScrcpyController

try:
    from core.controllers.bluestacks import BlueStacksController
except Exception:
    BlueStacksController = None  # type: ignore
from core.perception.ocr.interface import OCRInterface
from core.perception.yolo.interface import IDetector
from core.settings import Settings
from core.types import DetectionDict
from core.utils.logger import logger_uma
from core.utils.text import fuzzy_contains
from core.utils.waiter import Waiter
from core.utils import nav


class DailyRaceFlow:
    """
    Daily Races navigation: enter menu, pick a 'monies' card/row, confirm, race, results.
    """

    def __init__(
        self,
        ctrl: IController,
        ocr: OCRInterface,
        yolo_engine: IDetector,
        waiter: Waiter,
    ) -> None:
        self.ctrl = ctrl
        self.ocr = ocr
        self.yolo_engine = yolo_engine
        self.waiter = waiter
        self._thr = {
            "row": 0.70,  # race_daily_races_monies_row
        }

    def enter_from_menu(self) -> bool:
        ok = self.waiter.click_when(
            classes=("race_daily_races",),
            prefer_bottom=False,
            timeout_s=2.0,
            tag="daily_race_menu",
        )
        if not ok:
            return False
        sleep(1.7)
        # Often need to click the 'monies' card
        self.waiter.click_when(
            classes=("race_daily_races_monies",),
            prefer_bottom=True,
            timeout_s=3.2,
            tag="daily_race_monies",
        )
        return True

    def pick_first_row(self) -> bool:
        """
        Click the first valid 'race_daily_races_monies_row' (topmost above threshold).
        """
        img, dets = nav.collect_snapshot(
            self.waiter, self.yolo_engine, tag="daily_race_rows"
        )
        rows = nav.rows_top_to_bottom(dets, "race_daily_races_monies_row")
        for row in rows:
            if float(row.get("conf", 0.0)) >= self._thr["row"]:
                self.ctrl.click_xyxy_center(row["xyxy"])
                logger_uma.info("[DailyRace] Clicked 'Monies' row")
                return True
        return False

    def confirm_and_next_to_race(self) -> bool:
        """
        NEXT -> RACE
        """
        sleep(1.5)
        ok = self.waiter.click_when(
            classes=("button_green",),
            prefer_bottom=False,
            allow_greedy_click=False,
            texts=("RACE", "RACE!", "RACEL"),
            forbid_texts=("OK", "PURCHASE", "BUY", "RESTORE"),
            timeout_s=2.0,
            tag="daily_race_next_0",
        )
        if not ok:
            # Check with waiter if there are the next button with texts: button_white 'CANCEL' , button_green 'OK'. If that is the case, click in Cancel, wait 1 sec, capture /recognize objects in screen and press ui_home
            if self.waiter.click_when(
                classes=("button_white",),
                prefer_bottom=False,
                allow_greedy_click=False,
                texts=("CANCEL",),
                forbid_texts=("OK", "PURCHASE", "BUY", "RESTORE"),
                timeout_s=2.0,
                tag="daily_race_cancel",
            ):
                sleep(1.5)
                img, dets = nav.collect_snapshot(
                    self.waiter, self.yolo_engine, tag="daily_race_cancel"
                )
                # Click ui_home  that may be inside dets
                self.waiter.click_when(
                    classes=("ui_home",),
                    prefer_bottom=True,
                    timeout_s=3.0,
                    tag="daily_race_ui_home",
                )
                sleep(1.5)
                logger_uma.debug("[DailyRace] Canceling races")
                return False
        sleep(1.5)
        if self.waiter.click_when(
            classes=("button_green",),
            prefer_bottom=True,
            timeout_s=2.0,
            tag="daily_race_race",
        ):
            logger_uma.info("[DailyRace] RACE 1")
            return True
        return False

    def run_race_and_collect(self) -> bool:
        """
        Start race, view results and proceed.
        """

        race_again = True
        finalized = False
        counter = 5
        while race_again and counter > 0:
            sleep(3)
            if isinstance(self.ctrl, ScrcpyController) or (
                BlueStacksController is not None
                and isinstance(self.ctrl, BlueStacksController)
            ):
                sleep(1.5)
            if self.waiter.click_when(
                classes=("button_green",),
                prefer_bottom=True,
                timeout_s=6.0,
                tag="daily_race_next_1",
            ):
                logger_uma.info("[DailyRace] NEXT (1)")
            else:
                race_again = False
                continue
            sleep(1.5)

            if self.waiter.click_when(
                classes=("button_green",),
                prefer_bottom=True,
                timeout_s=2.0,
                tag="daily_race_race",
            ):
                logger_uma.info("[DailyRace] race (2)")
            else:
                race_again = False
                continue
            counter -= 1
            sleep(2.0)
            # After race, click 'View Results' / proceed with white button spamming
            img, _ = nav.collect_snapshot(
                self.waiter, self.yolo_engine, tag="daily_race_view_results"
            )
            self.waiter.click_when(
                classes=("button_white",),
                prefer_bottom=False,
                timeout_s=7.3,
                texts=("VIEW RESULTS", "CLOSE"),
                forbid_texts=("BACK",),
                allow_greedy_click=False,
                clicks=1,
                tag="daily_race_view_results_white",
            )
            sleep(2.0)
            # nav.random_center_tap(
            #     self.ctrl, img, clicks=random.randint(3, 4), dev_frac=0.20
            # )
            # sleep(2.0)

            # Then green to continue
            if self.waiter.click_when(
                classes=("button_green",),
                prefer_bottom=False,
                allow_greedy_click=False,
                timeout_s=2.0,
                forbid_texts=("SHOP",),
                tag="daily_race_after_results_green",
            ):
                logger_uma.info("[DailyRace] Results: continued")

            # check for shop, reuse the nav method
            did_shop = nav.handle_shop_exchange(
                self.waiter,
                self.yolo_engine,
                self.ctrl,
                tag_prefix="daily_race_shop",
                ensure_enter=True,
            )
            if did_shop:
                logger_uma.info("[DailyRace] Completed shop exchange flow")
                finalized = False  # Shop, uncertain if finalized
                break
            else:
                if not self.waiter.click_when(
                    classes=("button_pink",),
                    texts=("RACE AGAIN",),
                    prefer_bottom=True,
                    timeout_s=4.2,
                    clicks=1,
                    allow_greedy_click=True,
                    tag="daily_race_again",
                ):
                    logger_uma.info("[TeamTrials] RACE AGAIN NOT FOUND")
                    finalized = True
                    break
                else:
                    sleep(2.0)
                    if self.waiter.seen(
                        classes=("button_green",),
                        texts=("OK",),
                        tag="agent_nav_daily_race_ok",
                    ):
                        logger_uma.info("[DailyRace] OK seen no more dailys")
                        # Click in button_white using the waiter
                        self.waiter.click_when(
                            classes=("button_white",),
                            prefer_bottom=True,
                            timeout_s=2.0,
                            tag="daily_race_ok",
                        )
                        sleep(2)
                        # Click in button_advance using the waiter
                        self.waiter.click_when(
                            classes=("button_advance",),
                            prefer_bottom=True,
                            timeout_s=4,
                            tag="daily_race_advance",
                        )
                        sleep(2)
                        if isinstance(self.ctrl, ScrcpyController) or (
                            BlueStacksController is not None
                            and isinstance(self.ctrl, BlueStacksController)
                        ):
                            sleep(4.0)
                        # Click object with class ui_home
                        self.waiter.click_when(
                            classes=("ui_home",),
                            prefer_bottom=True,
                            timeout_s=2.0,
                            tag="daily_race_home",
                        )
                        finalized = True
                        race_again = False
                    continue
        return finalized

    def handle_shop_in_place(self) -> None:
        did_shop = nav.handle_shop_exchange(
            self.waiter,
            self.yolo_engine,
            self.ctrl,
            tag_prefix="daily_race_shop_resume",
            ensure_enter=False,
        )
        if did_shop:
            logger_uma.info("[DailyRace] Completed shop exchange flow (resume)")
        else:
            logger_uma.warning("[DailyRace] Unable to process shop exchange (resume)")


# Box of OCR text in image-pixel space: (text, score, (x1, y1, x2, y2)).
TextBox = Tuple[str, float, Tuple[float, float, float, float]]


class DailyLegendRaceFlow:
    """
    Daily Legend Races navigation (the right module on the Daily Races lobby).

    Unlike :class:`DailyRaceFlow`, the two legend-only screens (the "Daily Legend
    Races" module card and the legend opponent grid) have NO dedicated YOLO class,
    so they are located via OCR text boxes (``ocr.raw``). Every screen after
    opponent selection reuses the generic ``button_green`` / ``button_white`` /
    ``button_advance`` detections, exactly like ``DailyRaceFlow``.

    One legend ticket per run; the opponent is chosen by a configurable legend name
    (``Settings.get_daily_legend_opponent``) and falls back to the topmost-leftmost
    card on the grid.
    """

    def __init__(
        self,
        ctrl: IController,
        ocr: OCRInterface,
        yolo_engine: IDetector,
        waiter: Waiter,
    ) -> None:
        self.ctrl = ctrl
        self.ocr = ocr
        self.yolo_engine = yolo_engine
        self.waiter = waiter

    # ---------------------------
    # OCR helpers (legend-only screens have no YOLO class)
    # ---------------------------

    def _emu_extra(self, secs: float = 1.5) -> None:
        """Extra pacing for mirrored-Android controllers (slower to animate)."""
        if isinstance(self.ctrl, ScrcpyController) or (
            BlueStacksController is not None
            and isinstance(self.ctrl, BlueStacksController)
        ):
            sleep(secs)

    def _text_boxes(self, img: Image.Image) -> List[TextBox]:
        """OCR the whole frame and return (text, score, xyxy) for each line."""
        try:
            j = self.ocr.raw(img)
        except Exception as e:  # pragma: no cover - perception failure
            logger_uma.warning("[DailyLegend] OCR raw failed: %s", e)
            return []
        res = (j or {}).get("res", {}) or {}
        texts = res.get("rec_texts", []) or []
        scores = res.get("rec_scores", []) or []
        boxes = res.get("rec_boxes", None)
        polys = res.get("rec_polys", None)

        out: List[TextBox] = []
        for i, raw_t in enumerate(texts):
            t = (raw_t or "").strip()
            if not t:
                continue
            sc = float(scores[i]) if i < len(scores) else 0.0
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
            out.append((t, sc, box))
        return out

    @staticmethod
    def _in_region(
        box: Tuple[float, float, float, float],
        W: int,
        H: int,
        region: Tuple[float, float, float, float],
    ) -> bool:
        cx = (box[0] + box[2]) * 0.5 / max(1, W)
        cy = (box[1] + box[3]) * 0.5 / max(1, H)
        x0, y0, x1, y1 = region
        return x0 <= cx <= x1 and y0 <= cy <= y1

    def _click_text(
        self,
        img: Image.Image,
        targets: Sequence[str],
        *,
        region: Optional[Tuple[float, float, float, float]] = None,
        threshold: float = 0.6,
        tag: str = "legend_text",
    ) -> bool:
        """Click the best fuzzy text match among OCR boxes (optionally region-gated)."""
        boxes = self._text_boxes(img)
        if not boxes:
            return False
        W, H = img.size
        best: Optional[Tuple[float, float, float, float]] = None
        best_s = 0.0
        for t, _sc, box in boxes:
            if region is not None and not self._in_region(box, W, H, region):
                continue
            for tgt in targets:
                ok, r = fuzzy_contains(t, tgt, threshold=threshold, return_ratio=True)
                if ok and r > best_s:
                    best, best_s = box, r
        if best is not None:
            self.ctrl.click_xyxy_center(best)
            logger_uma.info(
                "[DailyLegend] OCR-clicked '%s' (score=%.2f, tag=%s)",
                targets[0],
                best_s,
                tag,
            )
            return True
        return False

    def _text_seen(
        self, img: Image.Image, targets: Sequence[str], threshold: float = 0.7
    ) -> bool:
        for t, _sc, _box in self._text_boxes(img):
            for tgt in targets:
                if fuzzy_contains(t, tgt, threshold=threshold):
                    return True
        return False

    # ---------------------------
    # Flow steps
    # ---------------------------

    def enter_from_menu(self) -> bool:
        """
        Reach the two-module Daily Races lobby and click the Daily Legend module.

        Robust to starting from home / a stale results screen / the monies-SP
        sub-page, so it can be chained after a daily-race run wherever it ended.
        """
        for _ in range(6):
            img, dets = nav.collect_snapshot(
                self.waiter, self.yolo_engine, tag="legend_enter"
            )
            # On the two-module lobby: click the legend module by its text.
            if self._click_text(
                img,
                ("DAILY LEGEND RACES", "LEGEND RACES", "LEGEND"),
                tag="legend_module",
            ):
                sleep(1.8)
                return True
            # Lobby present but OCR missed the text — brief wait then retry.
            if nav.has(dets, "race_daily_races", conf_min=0.50):
                sleep(0.8)
                continue
            # On the monies/SP sub-page — back out to the two-module lobby.
            if nav.has(dets, "race_daily_races_monies") or nav.has(
                dets, "race_daily_races_sp"
            ):
                self.waiter.click_when(
                    classes=("button_white",),
                    texts=("BACK",),
                    allow_greedy_click=False,
                    timeout_s=2.0,
                    tag="legend_back_to_lobby",
                )
                sleep(1.2)
                continue
            # On home / any footer screen — open the RACES lobby.
            if nav.has(dets, "ui_race"):
                self.waiter.click_when(
                    classes=("ui_race",),
                    timeout_s=2.5,
                    tag="legend_open_races",
                )
                sleep(1.5)
                continue
            sleep(0.6)
        logger_uma.warning("[DailyLegend] Could not reach the legend module")
        return False

    def pick_opponent(self) -> bool:
        """Pick the configured legend, else the topmost-leftmost card on the grid."""
        img, _dets = nav.collect_snapshot(
            self.waiter, self.yolo_engine, tag="legend_opponent"
        )
        grid = (0.05, 0.28, 0.98, 0.82)  # central grid band (frac of W/H)
        pref = Settings.get_daily_legend_opponent()
        if pref and self._click_text(
            img, (pref,), region=grid, threshold=0.6, tag="legend_opp_pref"
        ):
            sleep(1.8)
            return True
        if pref:
            logger_uma.info(
                "[DailyLegend] Preferred opponent '%s' not found; using first card",
                pref,
            )
        # Fallback: topmost-leftmost text box inside the grid band.
        W, H = img.size
        grid_boxes = [
            box
            for _t, _sc, box in self._text_boxes(img)
            if self._in_region(box, W, H, grid)
        ]
        if not grid_boxes:
            logger_uma.warning("[DailyLegend] No opponent cards detected on grid")
            return False
        grid_boxes.sort(key=lambda b: ((b[1] + b[3]) * 0.5, (b[0] + b[2]) * 0.5))
        self.ctrl.click_xyxy_center(grid_boxes[0])
        logger_uma.info("[DailyLegend] Clicked topmost-leftmost legend card")
        sleep(1.8)
        return True

    def confirm_and_start(self) -> bool:
        """selected-legend -> confirm -> entrants -> item -> strategy (Race)."""
        # Screen 2: selected-legend -> Race (green action, or footer race).
        sleep(1.2)
        clicked = self.waiter.click_when(
            classes=("button_green",),
            prefer_bottom=True,
            allow_greedy_click=False,
            forbid_texts=("BACK", "CANCEL"),
            timeout_s=3.0,
            tag="legend_selected_race",
        )
        if not clicked:
            # The green "Race" on this screen may be the footer race button.
            clicked = self.waiter.click_when(
                classes=("ui_race",),
                prefer_bottom=True,
                timeout_s=2.0,
                tag="legend_selected_ui_race",
            )
        if not clicked:
            logger_uma.info("[DailyLegend] selected-legend Race not found")
            return False
        sleep(1.5)
        self._emu_extra()

        # Screen 3: confirm -> Race!
        ok = self.waiter.click_when(
            classes=("button_green",),
            allow_greedy_click=False,
            texts=("RACE", "RACE!", "RACEL"),
            forbid_texts=("OK", "PURCHASE", "BUY", "RESTORE", "CANCEL"),
            timeout_s=2.5,
            tag="legend_confirm_race",
        )
        if not ok:
            # Out-of-tickets popup (Cancel / OK) — cancel and bail home.
            if self.waiter.click_when(
                classes=("button_white",),
                allow_greedy_click=False,
                texts=("CANCEL",),
                forbid_texts=("OK", "PURCHASE", "BUY", "RESTORE"),
                timeout_s=2.0,
                tag="legend_no_ticket_cancel",
            ):
                sleep(1.2)
                self.waiter.click_when(
                    classes=("ui_home",),
                    prefer_bottom=True,
                    timeout_s=3.0,
                    tag="legend_no_ticket_home",
                )
                sleep(1.0)
                logger_uma.info("[DailyLegend] Out of legend tickets; canceled")
            return False
        sleep(1.8)
        self._emu_extra()

        # Screen 4: entrants -> Next (green).
        self.waiter.click_when(
            classes=("button_green",),
            prefer_bottom=True,
            allow_greedy_click=False,
            forbid_texts=("BACK",),
            timeout_s=3.0,
            tag="legend_entrants_next",
        )
        sleep(1.5)
        self._emu_extra()

        # Screen 5: item dialog -> Race!
        self.waiter.click_when(
            classes=("button_green",),
            allow_greedy_click=False,
            texts=("RACE", "RACE!"),
            forbid_texts=("CANCEL",),
            timeout_s=3.0,
            tag="legend_item_race",
        )
        sleep(1.5)
        self._emu_extra()

        # Screen 6: strategy -> Race (green); green gating skips the tan View Results.
        if not self.waiter.click_when(
            classes=("button_green",),
            prefer_bottom=True,
            allow_greedy_click=False,
            texts=("RACE",),
            forbid_texts=("VIEW RESULTS", "BACK", "CHANGE"),
            timeout_s=3.0,
            tag="legend_strategy_race",
        ):
            logger_uma.info("[DailyLegend] strategy Race not found (may be racing)")
        return True

    def run_and_collect(self) -> bool:
        """race animation -> placement tap -> result Next -> rewards Next -> lobby."""
        sleep(8)
        self._emu_extra(3.0)

        # Screen 7: placement reaction (TAP overlay; no skip button on legend).
        img, _ = nav.collect_snapshot(
            self.waiter, self.yolo_engine, tag="legend_placement"
        )
        for _ in range(2):
            nav.random_center_tap(
                self.ctrl, img, clicks=random.randint(3, 4), dev_frac=0.18
            )
            sleep(1.5)
        self.waiter.click_when(
            classes=("button_advance",),
            prefer_bottom=True,
            timeout_s=2.0,
            tag="legend_advance",
        )
        sleep(1.0)

        # Screen 8: result -> Next (green).
        self.waiter.click_when(
            classes=("button_green",),
            prefer_bottom=True,
            allow_greedy_click=False,
            forbid_texts=("PLACING", "BACK"),
            timeout_s=4.0,
            tag="legend_result_next",
        )
        sleep(1.5)
        self._emu_extra()

        # Screen 9: rewards -> Next (green).
        self.waiter.click_when(
            classes=("button_green",),
            prefer_bottom=True,
            timeout_s=3.0,
            tag="legend_rewards_next",
        )
        sleep(1.5)
        self._emu_extra()

        # Settle and confirm we are back at the lobby; clear stray prompts.
        img, dets = nav.collect_snapshot(
            self.waiter, self.yolo_engine, tag="legend_done"
        )
        for _ in range(3):
            if nav.has(dets, "race_daily_races", conf_min=0.50) or self._text_seen(
                img, ("DAILY LEGEND", "DAILY RACES", "RESETS IN")
            ):
                logger_uma.info("[DailyLegend] Back at lobby; legend run complete")
                return True
            if self.waiter.click_when(
                classes=("button_advance",),
                prefer_bottom=True,
                timeout_s=2.0,
                tag="legend_done_advance",
            ):
                sleep(1.2)
            elif self.waiter.click_when(
                classes=("button_green",),
                prefer_bottom=True,
                timeout_s=2.0,
                tag="legend_done_green",
            ):
                sleep(1.2)
            else:
                break
            img, dets = nav.collect_snapshot(
                self.waiter, self.yolo_engine, tag="legend_done"
            )
        logger_uma.info("[DailyLegend] Legend run finished (lobby not confirmed)")
        return True

    def run(self) -> bool:
        """Full legend race: menu -> opponent -> confirm/race -> collect."""
        logger_uma.info("[DailyLegend] Starting Daily Legend Race flow")
        if not self.enter_from_menu():
            return False
        if not self.pick_opponent():
            return False
        if not self.confirm_and_start():
            return False
        return self.run_and_collect()
