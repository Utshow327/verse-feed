import json
import os
import re

DATA_DIR = r"c:\Users\ASUS\Desktop\religion app\data"

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

patterns = {
    "html_tags": re.compile(r"<[^>]+>"),
    "html_entities": re.compile(r"&[a-zA-Z0-9#]+;"),
    "footnote_brackets": re.compile(r"\[\d+\]|\[[a-z]\]"),
    "dangling_brackets": re.compile(r"\[[^\]]{1,25}\]"),
    "double_semicolon": re.compile(r";;+"),
    "double_comma": re.compile(r",,+"),
    "double_period": re.compile(r"(?<!\.)\.\.(?!\.)"),
    "leading_digits_glued": re.compile(r"\b\d{1,4}[a-zA-Z]{3,}\b"),
    "trailing_digits_glued": re.compile(r"\b[a-zA-Z]{3,}\d{1,4}\b"),
    "leading_punctuation": re.compile(r"^[\s,;:.\-\–\—\?\/]+"),
    "corrupted_utf8": re.compile(r"â€™|â€œ|â€|â€”|â€“||[\x00-\x08\x0b\x0c\x0e-\x1f]"),
    "section_markers": re.compile(r"§|†|‡|¶|\bCHAPTER\s+[IVXLCDM0-9]+\b|\bBOOK\s+[IVXLCDM0-9]+\b", re.IGNORECASE)
}

findings = {}

def check_text(text, filename, loc_info):
    if not isinstance(text, str):
        return
    for name, pat in patterns.items():
        matches = pat.findall(text)
        if matches:
            if name not in findings:
                findings[name] = []
            if len(findings[name]) < 20: # store sample
                findings[name].append((filename, loc_info, matches[:3], text[:120]))

for fname in files:
    fpath = os.path.join(DATA_DIR, fname)
    if not os.path.exists(fpath):
        continue
    print(f"Scanning {fname}...")
    try:
        with open(fpath, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception as e:
        print(f"Error loading {fname}: {e}")
        continue

    # data could be list or dict
    if isinstance(data, list):
        for idx, item in enumerate(data):
            if isinstance(item, dict):
                text = item.get("text") or item.get("translation") or item.get("verse") or ""
                check_text(text, fname, f"idx_{idx}")
            elif isinstance(item, str):
                check_text(item, fname, f"idx_{idx}")
    elif isinstance(data, dict):
        # could have books, chapters, or verses
        for k, v in data.items():
            if isinstance(v, list):
                for idx, item in enumerate(v):
                    if isinstance(item, dict):
                        text = item.get("text") or item.get("translation") or item.get("verse") or ""
                        check_text(text, fname, f"{k}_idx_{idx}")
                    elif isinstance(item, str):
                        check_text(item, fname, f"{k}_idx_{idx}")
            elif isinstance(v, dict):
                for subk, subv in v.items():
                    if isinstance(subv, list):
                        for idx, item in enumerate(subv):
                            if isinstance(item, dict):
                                text = item.get("text") or item.get("translation") or ""
                                check_text(text, fname, f"{k}_{subk}_{idx}")
                            elif isinstance(item, str):
                                check_text(subv, fname, f"{k}_{subk}_{idx}")
                    elif isinstance(subv, str):
                        check_text(subv, fname, f"{k}_{subk}")
            elif isinstance(v, str):
                check_text(v, fname, k)

print("\n========== SCAN RESULTS SUMMARY ==========")
for name, samples in findings.items():
    print(f"\n[Pattern: {name}] - Found {len(samples)} samples:")
    for s in samples[:5]:
        print(f"  File: {s[0]} | Loc: {s[1]} | Matches: {s[2]}")
        print(f"  Preview: {s[3]}")
