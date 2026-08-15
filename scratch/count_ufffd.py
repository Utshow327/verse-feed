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
    with open(fpath, "r", encoding="utf-8", errors="replace") as f:
        content = f.read()
    count = content.count("\ufffd")
    print(f"{fname}: {count} replacement chars (\\ufffd)")
