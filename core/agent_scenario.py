# core/agent.py
from __future__ import annotations

from abc import ABC, abstractmethod
from time import sleep
from typing import Any, Dict, List, Optional, Tuple

from core.actions.claw import ClawGame
from core.actions.events import EventFlow
from core.actions.lobby import LobbyFlow
from core.actions.race import RaceFlow
from core.actions.skills import SkillsFlow, SkillsBuyResult, SkillsBuyStatus

from core.controllers.base import IController
from core.perception.ocr.interface import OCRInterface
from core.perception.yolo.interface import IDetector
from core.settings import Settings
from core.utils.logger import logger_uma
from core.utils.skill_memory import SkillMemoryManager
from core.utils.date_uma import date_index as uma_date_index
from core.utils.waiter import PollConfig, Waiter
from core.utils.event_processor import CATALOG_JSON, Catalog, UserPrefs
from core.utils.race_index import RaceIndex
from core.utils import character_data

class AgentScenario(ABC):
    waiter: Waiter
    lobby: LobbyFlow
    def __init__(
        self,
        ctrl: IController,
        ocr: OCRInterface,
        yolo_engine: IDetector,
        *,
        minimum_skill_pts: int = 700,
        prioritize_g1: bool = False,
        auto_rest_minimum=26,
        plan_races: dict | None = None,
        waiter_config: PollConfig | None = None,
        skill_list=[
            "Concentration",
            "Focus",
            "Professor of Curvature",
            "Swinging Maestro",
            "Corner Recovery",
            "Corner Acceleration",
            "Straightaway Recovery",
            "Homestretch Haste",
            "Straightaway Acceleration",
        ],
        interval_stats_refresh=3,
        select_style=None,
        event_prefs: UserPrefs | None = None,
        lobby_flow: LobbyFlow = None,
        char_id: int | None = None,
    ) -> None:
        self.ctrl = ctrl
        self.ocr = ocr
        self.yolo_engine = yolo_engine
        self.is_running = False
        self.imgsz = Settings.YOLO_IMGSZ
        self.conf = Settings.YOLO_CONF
        self.iou = Settings.YOLO_IOU
        self.prioritize_g1 = bool(prioritize_g1)
        self._skip_training_race_once = False
        self.plan_races = dict(plan_races or {})
        self.char_id = char_id

        self.scenario = Settings.ACTIVE_SCENARIO
        self.skill_memory_path = Settings.resolve_skill_memory_path(self.scenario)

        # Vision params used by Waiter & flows
        self.skill_list = skill_list or []

        self.auto_rest_minimum = auto_rest_minimum

        # Shared Waiter for the whole agent
        if waiter_config is None:
            waiter_config = PollConfig(
                imgsz=Settings.YOLO_IMGSZ,
                conf=Settings.YOLO_CONF,
                iou=Settings.YOLO_IOU,
                poll_interval_s=0.5,
                timeout_s=4.0,
                tag=Settings.ACTIVE_AGENT_NAME,
                agent=Settings.ACTIVE_AGENT_NAME,
            )

        if self.waiter is None:
            self.waiter = Waiter(self.ctrl, self.ocr, self.yolo_engine, waiter_config)
        self.agent_name = waiter_config.agent

        # Flows
        self.skill_memory = SkillMemoryManager(
            self.skill_memory_path, scenario=self.scenario
        )
        goal_races = character_data.get_goal_races(self.char_id) if self.char_id else {}
        self.race = RaceFlow(self.ctrl, self.ocr, self.yolo_engine, self.waiter, plan_races=self.plan_races, goal_races=goal_races)

        self.lobby = lobby_flow
        self.skills_flow = SkillsFlow(
            self.ctrl,
            self.ocr,
            self.yolo_engine,
            self.waiter,
            skill_memory=self.skill_memory,
        )

        self._log_skill_memory_load()

        catalog = Catalog.load(CATALOG_JSON)
        # Prefer prefs coming from config.json (passed by main); fallback to legacy file.
        self.event_flow = EventFlow(
            self.ctrl, self.ocr, self.yolo_engine, self.waiter, catalog, event_prefs
        )

        self.claw_game = ClawGame(self.ctrl, self.yolo_engine)
        self.claw_turn = 0

        self._iterations_turn = 0
        self._minimum_skill_pts = int(minimum_skill_pts)
        self.patience = 0
        self.select_style = select_style
        # Skills optimization tracking
        self._last_skill_check_turn: int | None = None
        self._last_skill_pts_seen: int | None = None
        self._last_skill_buy_succeeded: bool = False
        self._planned_skip_release_pending: bool = False
        self._planned_skip_release_key: Optional[str] = None
        self._planned_skip_cooldown = 0
        self._first_race_day = True
        self._pending_hint_recheck: bool = False
        self._pending_hint_supports: List[Dict[str, Any]] = []
        # Single event option counter (for slow-rendering UI)
        self._single_event_option_counter: int = 0
        self._single_event_option_threshold: int = 5
        # EventStale loop detection
        self._consecutive_event_stale_clicks: int = 0
        self._force_unknown_once: bool = False

    # --------------------------
    # Skill memory helpers
    # --------------------------
    def _log_skill_memory_load(self) -> None:
        meta = self.skill_memory.get_run_metadata()
        logger_uma.info(
            "[skill_memory] loaded preset=%s date=%s idx=%s updated=%s",
            meta.get("preset_id"),
            meta.get("date_key"),
            meta.get("date_index"),
            meta.get("updated_utc"),
        )

    def _active_preset_id(self) -> Optional[str]:
        cfg = Settings._last_config or {}
        _, active_id, _ = Settings._get_active_preset_from_config(cfg)
        if isinstance(active_id, str) and active_id.strip():
            return active_id.strip()
        return None

    def _state_date_key(self) -> Optional[str]:
        di = getattr(self.lobby.state, "date_info", None)
        if di is None:
            return None
        try:
            return di.as_key()
        except Exception:
            return None

    def _state_date_index(self) -> Optional[int]:
        di = getattr(self.lobby.state, "date_info", None)
        if di is None:
            return None
        try:
            return uma_date_index(di)
        except Exception:
            return None

    def _refresh_skill_memory(self) -> None:
        preset_id = self._active_preset_id()
        date_key = self._state_date_key()
        date_idx = self._state_date_index()

        if not self.skill_memory.is_compatible_run(
            preset_id=preset_id,
            date_key=date_key,
            date_index=date_idx,
            scenario=self.scenario,
        ):
            logger_uma.info("[skill_memory] incompatible run detected → reset")
            self.skill_memory.reset()

        self.skill_memory.set_run_metadata(
            preset_id=preset_id,
            date_key=date_key,
            date_index=date_idx,
            scenario=self.scenario,
            commit=True,
        )

    def _desired_race_today(self) -> str | None:
        """
        If we have a planned race for today's date (Y{year}-{MM}-{half}),
        return its name; otherwise None.
        """
        di = getattr(self.lobby.state, "date_info", None)
        if not di or di.month is None or (getattr(di, "half", None) not in (1, 2)):
            return None
        key = f"Y{di.year_code}-{int(di.month):02d}-{int(di.half)}"
        plan = getattr(self.lobby, "plan_races", None) or self.plan_races
        raw_race = plan.get(key)
        if raw_race:
            canon = RaceIndex.canonicalize(raw_race)
            logger_uma.info(
                f"[agent] Planned race for {key}: raw='{raw_race}' canon='{canon}'"
            )
            self.lobby.state.planned_race_canonical = canon or raw_race.lower()
            self.lobby.state.planned_race_name = str(raw_race)
            return str(raw_race)
        return None

    def _planned_race_date_key(self, race_name: str) -> Optional[str]:
        """Reverse-lookup a race name in plan_races to find its date_key."""
        plan_races = getattr(self.lobby, "plan_races", None) or self.plan_races or {}
        for dk, name in plan_races.items():
            if isinstance(name, str) and isinstance(dk, str):
                if name.strip().lower() == race_name.strip().lower():
                    return dk
        return None

    def _today_date_key(self) -> Optional[str]:
        di = getattr(self.lobby.state, "date_info", None)
        if not di:
            return None
        if di.year_code == 0:
            return "Y0"
        if di.month is None or (getattr(di, "half", None) not in (1, 2)):
            return f"Y{di.year_code}"
        return f"Y{di.year_code}-{int(di.month):02d}-{int(di.half)}"

    def _infer_date_from_turn(self, year_code: int, turn_value: int) -> Optional[Tuple[int, int]]:
        """Infer (month, half) from remaining-turn count using known date anchors.

        Each turn decrement approximates 1 half-month advance.
        Anchors come from:
          1. Character goal entries (pre-seeded from character_data)
          2. turn_log entries that have full date_keys (race OCR / plannedRaces match)
        """
        anchors: List[Tuple[int, int, int]] = []

        # — Pre-seed with character goal anchors —
        if self.char_id is not None:
            goal_anchors = character_data.get_goal_anchors(self.char_id)
            for turn, year, month, day in goal_anchors:
                if year == year_code and 1 <= month <= 12 and day in (1, 2):
                    anchors.append((turn, month, day))

        # — Add turn_log anchors (override goals — more precise if OCR matched) —
        try:
            from core.run_context import get as get_run_record
            record = get_run_record()
            if record:
                for entry in record.get("turn_log") or []:
                    dk = entry.get("date_key", "")
                    if not isinstance(dk, str):
                        continue
                    if not dk.startswith(f"Y{year_code}-"):
                        continue
                    parts = dk.split("-")
                    if len(parts) == 3:
                        try:
                            m, h = int(parts[1]), int(parts[2])
                            t = entry.get("turn")
                            if isinstance(t, (int, float)) and 1 <= m <= 12 and h in (1, 2):
                                anchors.append((int(t), m, h))
                        except (ValueError, IndexError):
                            pass
        except Exception:
            pass

        if not anchors:
            return None

        anchors.sort(key=lambda x: -x[0])

        if turn_value >= anchors[0][0]:
            earliest_t, earliest_m, earliest_h = anchors[0]
            idx_offset = (earliest_m - 1) * 2 + (earliest_h - 1)
            upper_turn = earliest_t + idx_offset
            if upper_turn <= earliest_t:
                return earliest_m, earliest_h
            upper_m, upper_h = 1, 1
            lower_turn, lower_m, lower_h = earliest_t, earliest_m, earliest_h
        elif turn_value <= anchors[-1][0]:
            latest_t, latest_m, latest_h = anchors[-1]
            idx_to_end = (12 - latest_m) * 2 + (2 - latest_h)
            lower_turn = latest_t - idx_to_end
            if lower_turn >= latest_t:
                return latest_m, latest_h
            upper_turn, upper_m, upper_h = latest_t, latest_m, latest_h
            lower_m, lower_h = 12, 2
        else:
            pair_found = False
            for i in range(len(anchors) - 1):
                if anchors[i][0] >= turn_value >= anchors[i + 1][0]:
                    upper_turn, upper_m, upper_h = anchors[i]
                    lower_turn, lower_m, lower_h = anchors[i + 1]
                    pair_found = True
                    break
            if not pair_found:
                return None

        if upper_turn <= lower_turn:
            return upper_m, upper_h

        fraction = (upper_turn - turn_value) / (upper_turn - lower_turn)

        upper_idx = (upper_m - 1) * 2 + (upper_h - 1)
        lower_idx = (lower_m - 1) * 2 + (lower_h - 1)

        target_idx = upper_idx + fraction * (lower_idx - upper_idx)
        target_idx = round(target_idx)
        target_idx = max(0, min(23, target_idx))

        month = target_idx // 2 + 1
        half = target_idx % 2 + 1

        logger_uma.info(
            "[date] Inferred Y%d-%02d-%d from turn=%d (anchors: %d)",
            year_code, month, half, turn_value, len(anchors),
        )

        return month, half

    def _turn_date_key(self) -> str:
        """Return the best date key for turn logging.

        Prefer a fully-qualified current date key, but if OCR only gives a year
        (or nothing), try turn-based inference using known date anchors,
        then fall back to the latest full key for the same year from the
        current run.
        """
        current = self._today_date_key()
        if current == "Y4" or (current and "-" in current):
            return current

        year_prefix = current if current else None

        # — Try turn-based inference —
        if year_prefix and year_prefix.startswith("Y"):
            try:
                year_code = int(year_prefix[1:])
                if year_code == 0:
                    turn_value = getattr(self.lobby.state, "turn", None)
                    if isinstance(turn_value, (int, float)) and turn_value > 0:
                        y, m, d = character_data.goal_turn_to_date(int(turn_value))
                        if y == 1:
                            logger_uma.info(
                                "[date] Pre-debut inferred Y1-%02d-%d from turn=%d",
                                m, d, turn_value,
                            )
                            return f"Y1-{m:02d}-{d}"
                    return current or ""
                if 1 <= year_code <= 3:
                    turn_value = getattr(self.lobby.state, "turn", None)
                    if isinstance(turn_value, (int, float)) and turn_value > 0:
                        inferred = self._infer_date_from_turn(year_code, int(turn_value))
                        if inferred:
                            m, h = inferred
                            return f"Y{year_code}-{m:02d}-{h}"
            except (ValueError, AttributeError, TypeError):
                pass

        # — Fall back to latest same-year full key —
        try:
            from core.run_context import get as get_run_record

            record = get_run_record()
            if record:
                for entry in reversed(record.get("turn_log") or []):
                    dk = entry.get("date_key")
                    if not isinstance(dk, str) or not dk:
                        continue
                    if year_prefix and dk.startswith(f"{year_prefix}-"):
                        return dk
                    if year_prefix is None and dk:
                        return dk
        except Exception:
            pass

        return current or ""

    def _schedule_planned_skip_release(self) -> None:
        self._planned_skip_release_pending = True
        self._planned_skip_release_key = self._today_date_key()
        self._planned_skip_cooldown = max(self._planned_skip_cooldown, 2)
        logger_uma.info(
            "[planned_race] scheduled skip reset key=%s cooldown=%d",
            self._planned_skip_release_key,
            self._planned_skip_cooldown,
        )

    def _clear_planned_skip_release(self) -> None:
        if self._planned_skip_release_pending:
            logger_uma.info(
                "[planned_race] cleared pending skip reset key=%s",
                self._planned_skip_release_key,
            )
        self._planned_skip_release_pending = False
        self._planned_skip_release_key = None
        self._planned_skip_cooldown = 0

    def _tick_planned_skip_release(self) -> None:
        if not self._planned_skip_release_pending:
            return
        if not self.lobby._skip_race_once:
            self._clear_planned_skip_release()
            return
        if self._planned_skip_cooldown > 0:
            self._planned_skip_cooldown -= 1
            return

        current_key = self._today_date_key()
        if (
            self._planned_skip_release_key
            and current_key
            and current_key != self._planned_skip_release_key
        ):
            logger_uma.info(
                "[planned_race] date advanced (%s -> %s); releasing skip guard",
                self._planned_skip_release_key,
                current_key,
            )
            self.lobby._skip_race_once = False
            self._clear_planned_skip_release()
            return

        logger_uma.info(
            "[planned_race] releasing skip guard for key=%s",
            current_key or self._planned_skip_release_key,
        )
        self.lobby._skip_race_once = False
        self._clear_planned_skip_release()

    @staticmethod
    def _canon_skill_name(name: object) -> str:
        s = str(name or "")
        for sym in ("◎", "○", "×"):
            s = s.replace(sym, "")
        return " ".join(s.split()).strip()

    def _priority_config_for_key(self, key: Optional[Tuple[str, str, str]]) -> Optional[dict]:
        if not key:
            return None
        return Settings.SUPPORT_CARD_PRIORITIES.get(key)

    def _missing_required_skills_for_priority(self, priority_cfg: Optional[dict]) -> list[str]:
        if not isinstance(priority_cfg, dict):
            return []
        raw = priority_cfg.get("skillsRequiredForPriority")
        if not raw:
            return []
        if isinstance(raw, (str, bytes)):
            skills = [str(raw)]
        elif isinstance(raw, list):
            skills = [str(item) for item in raw if isinstance(item, (str, bytes))]
        else:
            return []

        missing: list[str] = []
        for skill in skills:
            canon = self._canon_skill_name(skill)
            if not canon:
                continue
            if not self.skill_memory.has_bought(canon):
                missing.append(skill)
        return missing

    def _refresh_recheck_targets_cache(self) -> None:
        remaining: set[str] = set()
        for cfg in Settings.SUPPORT_CARD_PRIORITIES.values():
            for skill in self._missing_required_skills_for_priority(cfg):
                remaining.add(skill)
        Settings.RECHECK_AFTER_HINT_SKILLS = sorted(remaining)

    def _update_support_recheck_state(
        self, keys: Optional[List[Tuple[str, str, str]]] = None
    ) -> None:
        mutated = False
        if keys is not None:
            key_set = {k for k in keys if k}
        else:
            key_set = None

        for key, cfg in Settings.SUPPORT_CARD_PRIORITIES.items():
            if key_set is not None and key not in key_set:
                continue
            missing = self._missing_required_skills_for_priority(cfg)
            if not missing and bool(cfg.get("recheckAfterHint", False)):
                cfg["recheckAfterHint"] = False
                mutated = True

        if mutated:
            logger_uma.info("[post-hint] Disabled re-check for supports with fulfilled requirements")
        self._refresh_recheck_targets_cache()

    def _consume_pending_hint_recheck(self) -> bool:
        """Run deferred skill re-check if a hint-triggered support requested it."""
        if not self._pending_hint_recheck:
            return False

        entries = list(self._pending_hint_supports or [])
        self._pending_hint_recheck = False
        self._pending_hint_supports = []

        supports_with_missing: list[dict] = []
        supports_without_missing: list[dict] = []
        targets: list[str] = []

        for entry in entries:
            key = entry.get("key")
            priority_cfg = self._priority_config_for_key(key)
            missing = self._missing_required_skills_for_priority(priority_cfg)
            if not missing:
                supports_without_missing.append(entry)
                continue
            supports_with_missing.append({
                "entry": entry,
                "key": key,
                "missing": missing,
            })
            for skill in missing:
                if skill not in targets:
                    targets.append(skill)

        if not supports_with_missing:
            if supports_without_missing:
                self._update_support_recheck_state(
                    [e.get("key") for e in supports_without_missing if e.get("key")]
                )
            return False

        opened_skills = self.lobby._go_skills()
        if not opened_skills:
            logger_uma.error("[post-hint] Couldn't open skills screen for pending re-check")
            self._pending_hint_recheck = True
            self._pending_hint_supports = [info["entry"] for info in supports_with_missing]
            return False

        sleep(0.6)
        labels = [str(info["entry"].get("label") or "support") for info in supports_with_missing]
        logger_uma.info(
            "[post-hint] Re-checking skills after hint from %s. Targets: %s",
            ", ".join(labels),
            ", ".join(targets),
        )

        skills_result: SkillsBuyResult | None = None
        try:
            skills_result = self.skills_flow.buy(targets)
        except Exception as e:
            logger_uma.error("[post-hint] skills_flow.buy failed: %s", e)

        keys = [info["key"] for info in supports_with_missing if info.get("key")]
        if keys:
            self._update_support_recheck_state(keys)

        remaining_entries: list[dict] = []
        for info in supports_with_missing:
            key = info.get("key")
            missing_now = self._missing_required_skills_for_priority(
                self._priority_config_for_key(key)
            )
            if missing_now:
                remaining_entries.append(info["entry"])

        if remaining_entries:
            # This means, hint selection didn't give us the skill or we didn't have enough 'skill pts' to buy it
            # Don't reactivate recheck, to optimize speed
            pass

        if skills_result is None:
            return False

        if skills_result.status is SkillsBuyStatus.SUCCESS:
            return True

        if not skills_result.exit_recovered:
            logger_uma.warning(
                "[post-hint] Skills exit not recovered; will retry later."
            )
            return False

        # Exit recovered but no skills bought; treat as neutral result
        return False

    # ------------- Hard-stop helper -------------
    def emergency_stop(self) -> None:
        """Cooperative, best-effort immediate stop hook."""
        self.is_running = False
        try:
            # Release any possible held inputs if controller exposes such methods
            if hasattr(self.ctrl, "release_all"):
                self.ctrl.release_all()  # type: ignore[attr-defined]
        except Exception:
            pass

    @abstractmethod
    def run(self, *, delay: float = 0.4, max_iterations: int | None = None) -> None:
        raise NotImplementedError

    @abstractmethod
    def handle_training(self) -> None:
        raise NotImplementedError
