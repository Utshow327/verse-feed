import json
import os

DATA_DIR = r"c:\Users\ASUS\Desktop\religion app\data"
WWW_DATA_DIR = r"c:\Users\ASUS\Desktop\religion app\www\data"

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
    if os.path.exists(fpath):
        with open(fpath, "r", encoding="utf-8") as f:
            data = json.load(f)
        with open(fpath, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
        sz_mb = os.path.getsize(fpath) / (1024 * 1024)
        print(f"{fname}: {sz_mb:.2f} MB in data/")

    www_fpath = os.path.join(WWW_DATA_DIR, fname)
    if os.path.exists(www_fpath):
        with open(www_fpath, "r", encoding="utf-8") as f:
            data = json.load(f)
        with open(www_fpath, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
        sz_mb = os.path.getsize(www_fpath) / (1024 * 1024)
        print(f"{fname}: {sz_mb:.2f} MB in www/data/")

print("\nAll datasets compacted and minified successfully!")
