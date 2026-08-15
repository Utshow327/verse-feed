import json
import os
import re
import html
import sys

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

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

def clean_single_text(t):
    if not isinstance(t, str):
        return t
    
    # 1. Strip stray HTML tags & unescape entities
    t = html.unescape(t)
    t = re.sub(r"<[^>]+>", " ", t)
    t = re.sub(r"^<+\s*", "", t)

    # 2. Remove bracketed illustration tags: [Illustration: ...]
    t = re.sub(r"\[Illustration:[^\]]*\]", "", t, flags=re.IGNORECASE)
    # Remove bracketed language notes: [Greek: ...], [Latin: ...], [Hebrew: ...]
    t = re.sub(r"\s*\[(?:Greek|Latin|Hebrew|Sanskrit|Arabic):[^\]]*\]\s*,?", "", t, flags=re.IGNORECASE)
    # Remove bracketed editorial footnotes like [1], [2], [a], [b]
    t = re.sub(r"\[\d+\]", "", t)

    # 3. Clean editorial brackets:
    # Bracketed suffix letter: son[s] -> sons, book[s] -> books
    t = re.sub(r"([a-zA-Z])\[([a-zA-Z]{1,3})\]", r"\1\2", t)
    # Bracketed capitalized letter: [A]ccording -> According
    t = re.sub(r"\[([A-Z])\]([a-z])", r"\1\2", t)
    # Bracketed word: [God] -> God, [I give] -> I give, [among you] -> among you
    t = re.sub(r"\[([a-zA-Z0-9\s,\-'\u2018\u2019\u201c\u201d]+)\]", r"\1", t)
    # Remove any dangling brackets
    t = t.replace("[", "").replace("]", "")

    # 4. Remove empty parentheses or broken parenthesis openings
    t = re.sub(r"\(\s*[,;:]?\s*\)", "", t)
    t = re.sub(r"\(\s*[,;:]\s*", "(", t)

    # 5. Remove stray leading verse numbers: "5 And the Blessed One..." -> "And the Blessed One..."
    t = re.sub(r"^\s*\d{1,4}\s+([A-Z])", r"\1", t)

    # 6. Fix double punctuation
    t = re.sub(r";;+", ";", t)
    t = re.sub(r",,+", ",", t)
    t = re.sub(r"::+", ":", t)
    t = re.sub(r"(?<!\.)\.\.(?!\.)", ". ", t)

    # 7. Fix space before punctuation: "word ," -> "word,", "word ." -> "word."
    t = re.sub(r"\s+([,;:.\?!])", r"\1", t)

    # 8. Normalize spaces and whitespace
    t = re.sub(r"[\r\n\t]+", " ", t)
    t = re.sub(r"\s{2,}", " ", t)

    # 9. Strip leading/trailing junk
    t = t.strip()
    t = re.sub(r"^[\s,\-;:–—]+", "", t)
    t = re.sub(r"[\s,\-;–—]+$", "", t)

    return t

def clean_recursively(obj):
    if isinstance(obj, str):
        return clean_single_text(obj)
    elif isinstance(obj, list):
        return [clean_recursively(it) for it in obj]
    elif isinstance(obj, dict):
        return {k: clean_recursively(v) for k, v in obj.items()}
    return obj

for fname in files:
    fpath = os.path.join(DATA_DIR, fname)
    if not os.path.exists(fpath):
        continue
    print(f"Cleaning {fname}...")
    with open(fpath, "r", encoding="utf-8") as f:
        data = json.load(f)

    cleaned = clean_recursively(data)

    with open(fpath, "w", encoding="utf-8") as f:
        json.dump(cleaned, f, ensure_ascii=False, separators=(',', ':'))

    www_fpath = os.path.join(WWW_DATA_DIR, fname)
    if os.path.exists(WWW_DATA_DIR):
        with open(www_fpath, "w", encoding="utf-8") as f:
            json.dump(cleaned, f, ensure_ascii=False, separators=(',', ':'))

    size_mb = os.path.getsize(fpath) / (1024 * 1024)
    print(f"Cleaned {fname}: {size_mb:.2f} MB")

print("\nAll datasets cleaned and synchronized!")
