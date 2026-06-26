#!/usr/bin/env python3
"""Fast rescraper for character event data using Gametora SSG JSON endpoint."""

import json, os, sys, time, re
from typing import Any, Dict, List, Optional

import requests

SKILLS_PATH = "datasets/in_game/skills.json"
STATUS_PATH = "datasets/in_game/status.json"
OUT_PATH    = "datasets/in_game/events.json"
OLD_EVENTS  = "datasets/in_game/events.json"
SHARED_EVENTS_PATH = "datasets/in_game/shared_events.json"

BASE_SSG = "https://gametora.com/_next/data/9PzSQZc4e2iBoGpq7L7uH/umamusume/characters"
BASE_URL = "https://gametora.com"

ATTRIBUTE_MAP = {
    "speed": "SPD", "stamina": "STA", "power": "PWR",
    "guts": "GUTS", "intelligence": "WIT", "friend": "PAL",
}
STAT_CODE_MAP = {"sp": "speed", "st": "stamina", "po": "power", "gu": "guts", "in": "wit"}
W_ENERGY, W_STAT, W_SKILLPTS, W_HINT, W_BOND, W_MOOD = 100, 10, 2, 1, 0.3, 2
STAT_WEIGHTS = {"speed": 5, "stamina": 4, "power": 3, "wit": 2, "guts": 1}

def dbg(msg):
    print(msg, file=sys.stderr)

def load_json(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)

def load_skill_map():
    lookup = {}
    try:
        for s in load_json(SKILLS_PATH):
            sid = str(s.get("id")); name = s.get("name")
            if sid and name: lookup[sid] = name
    except Exception as e:
        dbg(f"[WARN] Skills: {e}")
    return lookup

def load_status_map():
    lookup = {}
    try:
        for k, v in load_json(STATUS_PATH).items():
            lookup[str(k)] = v
    except Exception as e:
        dbg(f"[WARN] Status: {e}")
    return lookup

def load_shared_events():
    if not os.path.exists(SHARED_EVENTS_PATH): return []
    try: return load_json(SHARED_EVENTS_PATH)
    except: return []

def load_existing_entries(path):
    """Load all entries from existing events.json, return (supports, trainee_names_set)."""
    if not os.path.exists(path): return [], set()
    try:
        data = load_json(path)
        supports = [e for e in data if e.get("type") == "support"]
        existing_trainee_names = {e.get("name") for e in data if e.get("type") == "trainee"}
        return supports, existing_trainee_names
    except: return [], set()

def _to_int_if_plain_number(v):
    if isinstance(v, (int, float)): return int(v)
    if isinstance(v, str):
        s = v.strip()
        if "/" in s: return s
        if s.startswith("+"): s = s[1:]
        if re.match(r"^[+\-]?\d+$", s): return int(s)
    return v

NUM_KEYS = ("energy","energy_max","skill_pts","bond","speed","stamina","power","guts","wit","mood")
_RE_NUM_ONLY = re.compile(r"^[+\-]?\d+$")
_RE_STATUS_ENMAX = re.compile(r"\benergy\s*(?:limit|max(?:imum)?)\b.*?([+\-]?\d+)", re.I)
_RE_STATUS_MOOD_UP = re.compile(r"\b(mood|motivation)\b.*\b(up|good)\b", re.I)
_RE_STATUS_MOOD_DOWN = re.compile(r"\b(mood|motivation)\b.*\b(down|bad)\b", re.I)

def _normalize_effect(eff):
    out = dict(eff)
    for key in NUM_KEYS:
        if key in out: out[key] = _to_int_if_plain_number(out[key])
    if "hints" in out and isinstance(out["hints"], list):
        flat = []
        seen = set()
        for hint in out["hints"]:
            for part in [p.strip() for p in str(hint).split("/") if p.strip()]:
                if part and part not in seen:
                    seen.add(part); flat.append(part)
        out["hints"] = flat
    status_txt = out.get("status")
    if isinstance(status_txt, str) and status_txt.strip():
        st = status_txt.strip()
        m_en = _RE_STATUS_ENMAX.search(st)
        if m_en:
            out["energy_max"] = int(m_en.group(1).lstrip("+"))
            if len(set(out.keys()) & {"status","statuses"}) == 1:
                out.pop("status", None)
        if _RE_STATUS_MOOD_UP.search(st):
            out["mood"] = 1; out.pop("status", None)
        elif _RE_STATUS_MOOD_DOWN.search(st):
            out["mood"] = -1; out.pop("status", None)
    return {k: v for k, v in out.items() if v not in (None, "", [], {})}

def _format_hint(name, amount):
    if amount is None or amount == "": return name.strip()
    if isinstance(amount, (int, float)): lvl = f"{int(amount):+d}"
    else:
        s = str(amount).strip()
        if _RE_NUM_ONLY.match(s) and not s.startswith(('+','-')): s = f"+{s}"
        lvl = s
    return f"{name.strip()} ({lvl})"

def parse_effects(event_dict, skill_map, status_map):
    outcomes = []
    cur = {}
    has_data = False
    def push(force=False):
        nonlocal has_data
        if has_data or force:
            outcomes.append(_normalize_effect(cur.copy()))
        cur.clear(); has_data = False
    for item in event_dict.get("r", []):
        t = item.get("t"); v = item.get("v"); d = item.get("d")
        if t == "di": push(); continue
        if t in ("sp","st","po","gu","in","en","pt","bo","me","mo"):
            key_map = {"sp":"speed","st":"stamina","po":"power","gu":"guts","in":"wit",
                       "en":"energy","pt":"skill_pts","bo":"bond","me":"energy_max","mo":"mood"}
            cur[key_map[t]] = _to_int_if_plain_number(v); has_data = True
        elif t == "sk":
            sid = str(d or ""); name = skill_map.get(sid, f"Skill ID: {sid}")
            cur.setdefault("hints", []).append(_format_hint(name, v)); has_data = True
        elif t == "sr":
            for s in d or []:
                sid = str(s.get("d","")); amount = s.get("v")
                name = skill_map.get(sid, f"Skill ID: {sid}")
                cur.setdefault("hints", []).append(_format_hint(name, amount)); has_data = True
        elif t == "se":
            sid = str(d); cur["status"] = status_map.get(sid, f"Unknown Status {sid}"); has_data = True
        elif t == "sg":
            sid = str(d or ""); cur["status"] = f"Obtain {skill_map.get(sid, f'Skill ID: {sid}')}"; has_data = True
        elif t == "ha":
            cur["status"] = "Heal all negative status effects"; has_data = True
    push(force=not outcomes)
    if not outcomes: outcomes.append({})
    return outcomes

def min_from_maybe_range(v):
    if isinstance(v, (int, float)): return float(v)
    if isinstance(v, str):
        parts = [p.strip().lstrip("+") for p in v.split("/")] if "/" in v else [v.lstrip("+")]
        vals = [float(p) for p in parts if re.match(r"^[+\-]?\d+(?:\.\d+)?$", p)]
        return min(vals) if vals else 0.0
    return 0.0

def score_outcome(eff):
    energy = min_from_maybe_range(eff.get("energy", 0))
    stats_sum = sum(STAT_WEIGHTS.get(s,0) * min_from_maybe_range(eff.get(s,0)) for s in STAT_WEIGHTS)
    spts = float(min_from_maybe_range(eff.get("skill_pts", 0)))
    hints = len(eff.get("hints", []))
    bond = float(min_from_maybe_range(eff.get("bond", 0)))
    mood = float(min_from_maybe_range(eff.get("mood", 0)))
    return W_ENERGY*energy + W_STAT*stats_sum + W_SKILLPTS*spts + W_HINT*hints + W_BOND*bond + W_MOOD*mood

def choose_default(options):
    best_key, best_score = 1, float("-inf")
    for k, outs in options.items():
        if not outs: continue
        worst = min(score_outcome(o) for o in outs)
        k_int = int(k) if str(k).isdigit() else 1
        if worst > best_score or (worst == best_score and k_int < best_key):
            best_score, best_key = worst, k_int
    return best_key

def parse_events(event_data, skill_map, status_map):
    out = []
    lang = 'en' if 'en' in event_data else 'ja'
    try: events_struct = json.loads(event_data.get(lang, '{}'))
    except: return out

    def choose_list(block):
        c = block.get('c', [])
        hist = block.get('history', [])
        if hist:
            hit = next((h for h in hist if h.get("period") == "pre_first_anni"), None)
            if hit:
                data = hit.get('data', {})
                if isinstance(data, dict): return data.get('c', c)
        return c

    def parse_block(events, etype, step_start=1):
        chain_step = step_start
        for ev in events:
            title = ev.get('n', 'Unknown')
            options = {}
            raw_choices = choose_list(ev)
            if not raw_choices and isinstance(ev, dict) and "c" in ev:
                raw_choices = ev["c"]
            for idx, choice in enumerate(raw_choices or [{}], 1):
                options[str(idx)] = parse_effects(choice, skill_map, status_map)
            if options:
                out.append({
                    "type": etype,
                    "chain_step": chain_step if etype == "chain" else 1,
                    "name": title, "options": options,
                    "default_preference": choose_default(options)
                })
                if etype == "chain": chain_step += 1
        return chain_step

    for key in ('random','version','wchoice','outings','nochoice','dates','special','secret'):
        parse_block(events_struct.get(key, []), 'random')
    parse_block(events_struct.get('arrows', []), 'chain', 1)
    for extra in ('care','ny','ft','at','fs','ff'):
        if extra in events_struct:
            parse_block(events_struct.get(extra, []), 'random')
    return out

def apply_trainee_overrides(shared_events, nyear_stat, dance_stats):
    result = []
    for event in shared_events:
        e = dict(event); name = e.get("name", "")
        if name == "Dance Lesson" and dance_stats and len(dance_stats) == 2:
            ts = STAT_CODE_MAP.get(dance_stats[0]); bs = STAT_CODE_MAP.get(dance_stats[1])
            if ts and bs:
                e["options"] = {"1": [{ts: 10}], "2": [{bs: 10}]}; e["default_preference"] = 2
        elif name == "New Year's Resolutions" and nyear_stat:
            ts = STAT_CODE_MAP.get(nyear_stat)
            if ts:
                e["options"] = {"1": [{ts: 10}], "2": [{"energy": 20}], "3": [{"skill_pts": 20}]}; e["default_preference"] = 2
        result.append(e)
    return result

def merge_shared(card_events, shared_events):
    card_names = {evt.get("name") for evt in card_events}
    result = list(card_events)
    for se in shared_events:
        if se.get("name") not in card_names:
            result.append(se)
    return result

def fetch_character(slug, skill_map, status_map, shared_events, period=""):
    url = f"{BASE_SSG}/{slug}.json"
    dbg(f"  Fetching: {slug}")
    try:
        r = requests.get(url, timeout=20); r.raise_for_status()
        data = r.json()
        page_props = data['pageProps']
        item_data = page_props['itemData']
        event_data = page_props['eventData']
    except Exception as e:
        dbg(f"  [ERROR] {slug}: {e}")
        return None

    name = item_data.get("name_en", "Unknown")
    version = item_data.get("version")
    display_name = f"{name} ({version.replace('_',' ').title()})" if version else name

    events = parse_events(event_data, skill_map, status_map)

    events_struct = None
    try:
        events_struct = json.loads(event_data.get('en' if 'en' in event_data else 'ja', '{}'))
    except: pass

    nyear_stat = events_struct.get("nyear") if events_struct else None
    dance_stats = events_struct.get("dance") if events_struct else None

    if shared_events:
        customized = apply_trainee_overrides(shared_events, nyear_stat, dance_stats)
        events = merge_shared(events, customized)
        dbg(f"  Merged {len(customized)} shared events for '{display_name}'")

    entry = {
        "type": "trainee",
        "name": display_name,
        "rarity": "None",
        "attribute": "None",
        "id": f"{display_name}_profile",
        "choice_events": events
    }
    return entry

def main():
    # Read slugs from stdin or from sitemap
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--slugs", help="Comma-separated character slugs")
    ap.add_argument("--all", action="store_true", help="Use all base character slugs from sitemap")
    ap.add_argument("--out", default=OUT_PATH)
    ap.add_argument("--period", default="")
    args = ap.parse_args()

    skill_map = load_skill_map()
    status_map = load_status_map()
    shared_events = load_shared_events()

    # Get existing entries to preserve (supports + trainee names for dedup)
    existing_supports, existing_trainee_names = load_existing_entries(args.out)
    dbg(f"Loaded {len(existing_supports)} existing support entries, {len(existing_trainee_names)} existing trainees")

    if args.slugs:
        slugs = [s.strip() for s in args.slugs.split(",") if s.strip()]
    elif args.all:
        dbg("Fetching sitemap index for all character slugs...")
        r = requests.get("https://gametora.com/sitemap.xml", timeout=30)
        subs = re.findall(r'<loc>(.*?)</loc>', r.text)
        all_slugs = set()
        for sub in subs:
            try:
                r2 = requests.get(sub, timeout=30)
                urls = re.findall(r'<loc>(.*?)</loc>', r2.text)
                for u in urls:
                    m = re.search(r'/en/umamusume/characters/(\d{6}-[a-z0-9-]+)', u)
                    if m: all_slugs.add(m.group(1))
                    # Also match without language prefix
                    m2 = re.search(r'/umamusume/characters/(\d{6}-[a-z0-9-]+)', u)
                    if m2 and '/ja/' not in u and '/ko/' not in u and '/zh-tw/' not in u:
                        all_slugs.add(m2.group(1))
            except Exception as e:
                dbg(f"  [WARN] sitemap sub {sub}: {e}")
        slugs = sorted(all_slugs)
        dbg(f"Found {len(slugs)} character slugs in sitemap")
    else:
        ap.print_help()
        return

    dbg(f"Processing {len(slugs)} characters...")
    new_trainee_entries = []
    for i, slug in enumerate(slugs, 1):
        dbg(f"[{i}/{len(slugs)}] {slug}")
        entry = fetch_character(slug, skill_map, status_map, shared_events, args.period)
        if entry and entry.get("name") not in existing_trainee_names:
            new_trainee_entries.append(entry)
            existing_trainee_names.add(entry["name"])
        elif entry:
            dbg(f"  Skipping duplicate: {entry['name']}")
        # Rate limiting
        if i % 10 == 0:
            time.sleep(1)

    # Load existing trainees that weren't reprocessed
    existing_trainees = []
    if os.path.exists(args.out):
        try:
            existing = load_json(args.out)
            existing_trainees = [e for e in existing if e.get("type") == "trainee" and e.get("name") not in existing_trainee_names]
        except: pass
    all_entries = existing_supports + existing_trainees + new_trainee_entries
    dbg(f"\nTotal: {len(existing_supports)} supports + {len(existing_trainees) + len(new_trainee_entries)} trainees = {len(all_entries)}")

    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(all_entries, f, ensure_ascii=False, indent=2)
    dbg(f"Wrote {len(all_entries)} entries → {args.out}")

if __name__ == "__main__":
    main()
