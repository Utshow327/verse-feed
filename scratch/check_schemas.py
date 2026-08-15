import json
import os

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

for fname in files:
    fpath = os.path.join(DATA_DIR, fname)
    if not os.path.exists(fpath):
        continue
    with open(fpath, "r", encoding="utf-8", errors="replace") as f:
        data = json.load(f)
    print(f"\n--- {fname} ---")
    if isinstance(data, list):
        print(f"List with {len(data)} items. Sample item: {list(data[0].keys()) if isinstance(data[0], dict) else type(data[0])}")
    elif isinstance(data, dict):
        print(f"Dict with keys: {list(data.keys())[:10]}")
        first_key = list(data.keys())[0]
        val = data[first_key]
        if isinstance(val, list):
            print(f"  Key '{first_key}' has list with {len(val)} items. Sample: {list(val[0].keys()) if len(val) > 0 and isinstance(val[0], dict) else type(val[0])}")
        elif isinstance(val, dict):
            print(f"  Key '{first_key}' has dict with keys: {list(val.keys())[:5]}")
