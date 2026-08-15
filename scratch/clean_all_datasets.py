import json
import os
import re
import html
import sys

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8')

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

def clean_text_node(text):
    if not isinstance(text, str):
        return text
    
    t = text

    # 1. Unescape HTML entities & strip HTML tags
    t = html.unescape(t)
    t = re.sub(r"<[^>]+>", " ", t)

    # 2. Fix UTF-8 encoding corruption (Windows-1252 / Mojibake)
    t = t.replace("â€™", "'").replace("â€œ", '"').replace("â€\x9d", '"').replace("â€", '"')
    t = t.replace("â€”", " — ").replace("â€“", " — ").replace("â€˜", "'")
    t = t.replace("\u200b", "").replace("\u200e", "").replace("\ufeff", "")

    # 3. Fix  (replacement character) intelligently based on context
    # Word contraction: dont -> don't, fathers -> father's
    t = re.sub(r"([a-zA-Z])([a-zA-Z])", r"\1'\2", t)
    # Quote opening: Word or , Word -> "Word
    t = re.sub(r"(^|[\s,\(\[\{])([a-zA-Z0-9])", r'\1"\2', t)
    # Quote closing: Word or Word. -> Word"
    t = re.sub(r"([a-zA-Z0-9.,;:!?])([\s,\)\]\}\.\?!;:]|$)", r'\1"\2', t)
    # Dash connector: toiland -> toil — and
    t = re.sub(r"([a-zA-Z])\s*([a-zA-Z])", r"\1 — \2", t)
    # Any stray 
    t = t.replace("", '"').replace("\ufffd", '"')

    # 4. Remove editorial / illustration / footnote brackets
    t = re.sub(r"\[Illustration:[^\]]*\]", "", t, flags=re.IGNORECASE)
    t = re.sub(r"\[(?:Greek|Latin|Hebrew|Sanskrit|Arabic):[^\]]*\]", "", t, flags=re.IGNORECASE)
    t = re.sub(r"\[(?:meaning|lit\.|i\.e\.|cf\.|see)[^\]]*\]", "", t, flags=re.IGNORECASE)
    t = re.sub(r"\[\d+\]|\[[a-zA-Z]\]", "", t) # Footnote tags like [1] or [a]
    
    # Bracketed single capital letters e.g. [A]ccording -> According
    t = re.sub(r"\[([A-Z])\]([a-z])", r"\1\2", t)
    
    # Inline editorial words: [God] -> God, [I give] -> I give, [among you] -> among you
    t = re.sub(r"\[([a-zA-Z0-9\s,\-'\"]+)\]", r"\1", t)
    
    # Remove any leftover stray brackets
    t = t.replace("[", "").replace("]", "")

    # 5. Fix stray leading verse numbers glued to start of text: "5 And the Blessed One..." -> "And the Blessed One..."
    t = re.sub(r"^\s*\d{1,4}\s+([A-Z])", r"\1", t)

    # 6. Fix double punctuation & punctuation glitches
    t = re.sub(r";;+", ";", t)
    t = re.sub(r",,+", ",", t)
    t = re.sub(r"::+", ":", t)
    # Replace double periods (when not ellipsis ...)
    t = re.sub(r"(?<!\.)\.\.(?!\.)", ".", t)
    t = re.sub(r"\.\.\.\.+", "...", t) # Collapse 4+ dots into 3

    # Fix spacing before punctuation: "word ," -> "word,", "word ." -> "word."
    t = re.sub(r"\s+([,;:.\?!])", r"\1", t)

    # Fix multiple whitespace / tabs / newlines
    t = re.sub(r"[\r\n\t]+", " ", t)
    t = re.sub(r"\s{2,}", " ", t)

    # 7. Strip leading/trailing stray punctuation or whitespace
    t = t.strip()
    t = re.sub(r"^[\s,\-;:–—]+", "", t)
    t = re.sub(r"[\s,\-;–—]+$", "", t)

    return t

def clean_recursively(obj):
    if isinstance(obj, str):
        return clean_text_node(obj)
    elif isinstance(obj, list):
        return [clean_recursively(it) for it in obj]
    elif isinstance(obj, dict):
        return {k: clean_recursively(v) for k, v in obj.items()}
    return obj

total_cleaned_files = 0

for fname in files:
    fpath = os.path.join(DATA_DIR, fname)
    if not os.path.exists(fpath):
        print(f"Skipping missing {fname}")
        continue
    
    print(f"Cleaning {fname}...")
    with open(fpath, "r", encoding="utf-8", errors="replace") as f:
        data = json.load(f)

    cleaned_data = clean_recursively(data)

    with open(fpath, "w", encoding="utf-8") as f:
        json.dump(cleaned_data, f, ensure_ascii=False, indent=2)

    # Also write to www/data/
    www_fpath = os.path.join(WWW_DATA_DIR, fname)
    if os.path.exists(WWW_DATA_DIR):
        with open(www_fpath, "w", encoding="utf-8") as f:
            json.dump(cleaned_data, f, ensure_ascii=False, indent=2)

    total_cleaned_files += 1
    print(f"✓ Cleaned and saved {fname}")

print(f"\nAll {total_cleaned_files} dataset files have been thoroughly cleaned!")
