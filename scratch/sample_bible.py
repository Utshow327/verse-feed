import json

with open("data/bible.json", "r", encoding="utf-8", errors="replace") as f:
    b = json.load(f)

for book in list(b.keys())[:3]:
    for chap in list(b[book].keys())[:2]:
        for v in list(b[book][chap].keys())[:3]:
            print(f"[{book} {chap}:{v}] {b[book][chap][v]}")
