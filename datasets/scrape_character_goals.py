#!/usr/bin/env python3
"""Scrape character goal data from Gametora into datasets/in_game/.

Output:
  - datasets/in_game/character_index.json — master index (goals + image URLs)
  - datasets/in_game/characters/{slug}.json — per-character detail

Resumable: checks existing index before fetching each character.
Rate-limited: 1 s pause every 10 requests.
"""

import json, os, sys, time, re, requests
from typing import Any

CHARACTERS_DIR = "datasets/in_game/characters"
INDEX_PATH = "datasets/in_game/character_index.json"

# Image URL pattern
def make_image_urls(char_id: int, card_id: int) -> tuple[str, str]:
    base = f"https://gametora.com/images/umamusume/characters/chara_stand_{char_id}_{card_id}.png"
    thumb = f"https://gametora.com/images/umamusume/characters/thumb/chara_stand_{char_id}_{card_id}.png"
    return base, thumb


def goal_turn_to_date(turn: int) -> tuple[int, int, int]:
    """Career turn -> (year, month, day).

    turn 1  -> Y1-01-1, turn 12 -> Y1-06-2 (Junior Make Debut).
    turn >= 72 -> (4, 0, 0)  (URA finale / final season).
    turn < 1  -> (0, 1, 1)  (pre-debut sentinel).
    """
    if turn < 1 or turn >= 72:
        return (4, 0, 0) if turn >= 72 else (0, 1, 1)
    idx = turn - 1
    year = idx // 24 + 1
    month = (idx % 24) // 2 + 1
    day = (idx % 24) % 2 + 1
    return (year, month, day)


def dbg(msg: str) -> None:
    print(msg, file=sys.stderr)


def load_json(path: str) -> Any:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def save_json(path: str, data: Any) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def fetch_character_cards() -> list[dict]:
    """Fetch the character-cards endpoint to get card_id + url_name per costume."""
    dbg("Fetching character-cards ...")
    r = requests.get(
        "https://gametora.com/data/umamusume/character-cards.14eb6ff2.json",
        timeout=30,
    )
    r.raise_for_status()
    return r.json()


def discover_slugs_from_sitemap() -> set[str]:
    """Extract all unique character slugs from sitemap."""
    dbg("Fetching sitemap ...")
    r = requests.get("https://gametora.com/sitemap.xml", timeout=30)
    r.raise_for_status()
    slugs = set()
    subs = re.findall(r"<loc>(.*?)</loc>", r.text)
    for sub in subs:
        try:
            r2 = requests.get(sub, timeout=30)
            urls = re.findall(r"<loc>(.*?)</loc>", r2.text)
            for u in urls:
                m = re.search(r"/umamusume/characters/(\d{6}-[a-z0-9-]+)", u)
                if m:
                    slugs.add(m.group(1))
        except Exception as e:
            dbg(f"  [WARN] sitemap sub {sub}: {e}")
    return slugs


def extract_next_data(html: str) -> dict | None:
    m = re.search(
        r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', html, re.DOTALL
    )
    if m:
        return json.loads(m.group(1))
    return None


def fetch_character_page(slug: str) -> dict | None:
    """Fetch a character page and return __NEXT_DATA__ JSON."""
    url = f"https://gametora.com/umamusume/characters/{slug}"
    try:
        r = requests.get(url, timeout=20)
        r.raise_for_status()
        return extract_next_data(r.text)
    except Exception as e:
        dbg(f"  [ERROR] {slug}: {e}")
        return None


def process_character(
    slug: str, card_id: int, char_id_from_cards: int, index: dict
) -> str | None:
    """Fetch, parse, and write one character. Returns char_id or None."""
    next_data = fetch_character_page(slug)
    if not next_data:
        return None

    pp = next_data.get("props", {}).get("pageProps", {})
    char = pp.get("charData", {})
    char_id = str(char.get("char_id", char_id_from_cards))

    goals_raw = pp.get("objectiveData") or []
    goals = []
    for g in goals_raw:
        y, m, d = goal_turn_to_date(g["turn"])
        goals.append({
            "order": g["order"],
            "turn": g["turn"],
            "year": y,
            "month": m,
            "day": d,
            "race_name": ((g.get("races") or [{}])[0]).get("name_en", ""),
            "cond_type": g.get("cond_type"),
            "cond_value": g.get("cond_value"),
        })

    img_url, thumb_url = make_image_urls(int(char_id), card_id)

    # Per-character detail file
    char_out = {
        "charData": char,
        "image_url": img_url,
        "thumb_url": thumb_url,
        "objectiveData_transformed": goals,
        "profileArtMeta": pp.get("profileArtMeta"),
        "profileData": pp.get("profileData"),
    }
    file_path = os.path.join(CHARACTERS_DIR, f"{slug}.json")
    save_json(file_path, char_out)

    # Index entry
    index[char_id] = {
        "char_id": int(char_id),
        "name_en": char.get("en_name", ""),
        "name_jp": char.get("jp_name", ""),
        "card_id": card_id,
        "slug": slug,
        "playable": char.get("playable", False),
        "goal_count": len(goals),
        "image_url": img_url,
        "thumb_url": thumb_url,
        "goals": goals,
    }

    dbg(f"  -> {char.get('en_name','?')} ({len(goals)} goals)")

    # Write index after each character (resumability)
    save_json(INDEX_PATH, index)

    return char_id


def main():
    os.makedirs(CHARACTERS_DIR, exist_ok=True)

    # 1) Load existing index (for resumability)
    index: dict = {}
    if os.path.exists(INDEX_PATH):
        index = load_json(INDEX_PATH)
    dbg(f"Existing index: {len(index)} characters")

    # 2) Fetch character-cards to map slug -> card_id
    cards = fetch_character_cards()
    dbg(f"Character cards: {len(cards)} entries")

    # Build a map: first card per unique char_id, prefer playable
    char_map: dict[int, dict] = {}
    for c in cards:
        chid = c.get("char_id")
        if chid not in char_map:
            char_map[chid] = c
        else:
            existing = char_map[chid]
            # Prefer the card that is playable and has a lower costume number
            e_playable = existing.get("obtained") is not None
            c_playable = c.get("obtained") is not None
            if c_playable and not e_playable:
                char_map[chid] = c

    dbg(f"Unique characters from cards: {len(char_map)}")

    # 3) Discover slugs from sitemap
    sitemap_slugs = discover_slugs_from_sitemap()
    dbg(f"Sitemap slugs: {len(sitemap_slugs)}")

    # 4) Map slugs -> (card_id, char_id) using character-cards data
    slug_to_card: dict[str, tuple[int, int]] = {}
    for chid, c in char_map.items():
        url_name = c.get("url_name", "")
        slug_to_card[url_name] = (c["card_id"], c["char_id"])

    # Check which sitemap slugs we can resolve
    resolved_slugs = sorted(s for s in sitemap_slugs if s in slug_to_card)
    unresolved = [s for s in sitemap_slugs if s not in slug_to_card]
    if unresolved:
        dbg(f"Unresolved slugs (not in character-cards): {len(unresolved)}")
        for s in unresolved[:5]:
            dbg(f"  {s}")

    dbg(f"Resolved slugs: {len(resolved_slugs)}")

    # 5) Filter to new characters only
    existing_slugs = {v["slug"] for v in index.values()}
    new_slugs = [s for s in resolved_slugs if s not in existing_slugs]
    dbg(f"New: {len(new_slugs)}, already done: {len(resolved_slugs) - len(new_slugs)}")

    if not new_slugs:
        dbg("Nothing new to scrape.")
        return

    # 6) Fetch each character
    for i, slug in enumerate(new_slugs, 1):
        card_id, char_id = slug_to_card[slug]
        dbg(f"[{i}/{len(new_slugs)}] {slug} (card={card_id})")
        process_character(slug, card_id, char_id, index)
        if i % 10 == 0:
            time.sleep(1)

    # Final save
    save_json(INDEX_PATH, index)
    dbg(f"\nDone. {len(index)} characters in index, {len(new_slugs)} newly scraped.")


if __name__ == "__main__":
    main()
