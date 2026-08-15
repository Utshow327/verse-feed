import json

with open("data/bible.json", "rb") as f:
    raw = f.read(500)

print("RAW BYTES:")
print(raw[:300])

with open("data/bible.json", "r", encoding="utf-8", errors="replace") as f:
    b = json.load(f)

v2 = b["Genesis"]["1"]["2"]
print("\nV2:", repr(v2))
for ch in v2:
    if ord(ch) > 127:
        print(f"Char: {repr(ch)}, ord: {ord(ch)}, hex: {hex(ord(ch))}")

v3 = b["Genesis"]["1"]["3"]
print("\nV3:", repr(v3))
for ch in v3:
    if ord(ch) > 127:
        print(f"Char: {repr(ch)}, ord: {ord(ch)}, hex: {hex(ord(ch))}")
