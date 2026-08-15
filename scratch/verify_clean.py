import json
import os
import re
import sys

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

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

remaining_issues = {
    "corrupted_unicode": 0,
    "html_tags": 0,
    "footnote_brackets": 0,
    "double_punctuation": 0,
    "stray_leading_numbers": 0,
}

total_verses = 0

def check_str(t):
    global total_verses
    if not isinstance(t, str): return
    total_verses += 1
    t = t.strip()
    if "\ufffd" in t or "â€™" in t or "\x00" in t:
        remaining_issues["corrupted_unicode"] += 1
    if re.search(r"<[^>]+>", t):
        remaining_issues["html_tags"] += 1
    if re.search(r"\[\d+\]|\[Illustration:", t, re.I):
        remaining_issues["footnote_brackets"] += 1
    if re.search(r";;|,,|(?<!\.)\.\.(?!\.)", t):
        remaining_issues["double_punctuation"] += 1
    if re.match(r"^\d{1,4}\s+[A-Z]", t):
        remaining_issues["stray_leading_numbers"] += 1

def recurse_check(obj):
    if isinstance(obj, str):
        check_str(obj)
    elif isinstance(obj, list):
        for it in obj: recurse_check(it)
    elif isinstance(obj, dict):
        for v in obj.values(): recurse_check(v)

for fname in files:
    fpath = os.path.join(DATA_DIR, fname)
    if not os.path.exists(fpath): continue
    with open(fpath, "r", encoding="utf-8") as f:
        data = json.load(f)
    recurse_check(data)

print(f"ACCURATE VERIFICATION SCAN RESULT (Total nodes: {total_verses}):")
for k, v in remaining_issues.items():
    print(f"  {k}: {v}")
