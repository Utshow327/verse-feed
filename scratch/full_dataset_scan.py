import json
import os
import re

DATA_DIR = r"c:\Users\ASUS\Desktop\religion app\data"

stats = {
    "total_verses_scanned": 0,
    "corrupted_unicode": [], # e.g.  or \ufffd or weird bytes
    "html_tags_or_entities": [],
    "footnote_brackets": [], # [1], [a], [12]
    "editorial_brackets": [], # [i.e., ...], [meaning ...]
    "double_punctuation": [], # ;; or ,, or .. (not ellipsis)
    "glued_digits": [], # 12And, 324before, everyt8
    "stray_verse_numbers_at_start": [], # e.g. "1 In the beginning"
    "leading_trailing_junk": [],
    "empty_or_broken": []
}

def scan_text_string(text, loc_id):
    if not isinstance(text, str):
        return
    stats["total_verses_scanned"] += 1
    t = text.strip()

    if len(t) < 5:
        stats["empty_or_broken"].append((loc_id, t))
        return

    if "" in t or "\ufffd" in t:
        stats["corrupted_unicode"].append((loc_id, t[:80]))

    if re.search(r"<[^>]+>|&[a-zA-Z0-9#]+;", t):
        stats["html_tags_or_entities"].append((loc_id, t[:80]))

    if re.search(r"\[\d+\]|\[[a-zA-Z]\]", t):
        stats["footnote_brackets"].append((loc_id, t[:80]))

    if re.search(r"\[[^\]]{1,40}\]", t):
        # check if it's editorial
        stats["editorial_brackets"].append((loc_id, t[:80]))

    if re.search(r";;|,,|(?<!\.)\.\.(?!\.)|::", t):
        stats["double_punctuation"].append((loc_id, t[:80]))

    if re.search(r"\b\d+[a-zA-Z]{3,}\b|\b[a-zA-Z]{3,}\d+\b", t):
        stats["glued_digits"].append((loc_id, t[:80]))

    if re.match(r"^\d{1,3}\s+[A-Z]", t):
        stats["stray_verse_numbers_at_start"].append((loc_id, t[:80]))

    if re.search(r"^[\s,;:.\-\–\—\?\/]+|[\s,;:.\-\–\—\/]+$", t):
        stats["leading_trailing_junk"].append((loc_id, t[:80]))

def recurse_scan(obj, loc_prefix):
    if isinstance(obj, str):
        scan_text_string(obj, loc_prefix)
    elif isinstance(obj, list):
        for i, it in enumerate(obj):
            recurse_scan(it, f"{loc_prefix}[{i}]")
    elif isinstance(obj, dict):
        for k, v in obj.items():
            # if item is a verse dictionary with 'text' or 'text_en' or 'translation' or 'description'
            if k in ['text', 'text_en', 'translation', 'description'] and isinstance(v, str):
                scan_text_string(v, f"{loc_prefix}.{k}")
            else:
                recurse_scan(v, f"{loc_prefix}.{k}")

files = [
    "bible.json",
    "buddhism.json",
    "gita.json",
    "gurbani.json",
    "hadiths_v2.json",
    "hindu_books.json",
    "philosophy.json",
    "psychology.json",
    "quran_v2.json",
    "sefaria.json"
]

for fname in files:
    fpath = os.path.join(DATA_DIR, fname)
    if not os.path.exists(fpath):
        continue
    print(f"Reading {fname}...")
    with open(fpath, "r", encoding="utf-8", errors="replace") as f:
        data = json.load(f)
    recurse_scan(data, fname)

print(f"\n==========================================")
print(f"TOTAL TEXT NODES SCANNED: {stats['total_verses_scanned']}")
print(f"==========================================")

for cat in [
    "corrupted_unicode",
    "html_tags_or_entities",
    "footnote_brackets",
    "editorial_brackets",
    "double_punctuation",
    "glued_digits",
    "stray_verse_numbers_at_start",
    "leading_trailing_junk",
    "empty_or_broken"
]:
    items = stats[cat]
    print(f"\n[{cat.upper()}] - Found {len(items)} items")
    for loc, sample in items[:5]:
        print(f"   * ({loc}): {sample}")
