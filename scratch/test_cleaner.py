import re
import html

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

    # 4. Remove empty parentheses caused by removed notes: " (, " -> " "
    t = re.sub(r"\(\s*[,;:]?\s*\)", "", t)
    t = re.sub(r"\(\s*[,;:]\s*", "(", t)

    # 5. Remove stray leading verse numbers: "5 And the Blessed One..." -> "And the Blessed One..."
    t = re.sub(r"^\s*\d{1,4}\s+([A-Z])", r"\1", t)

    # 6. Fix double punctuation
    t = re.sub(r";;+", ";", t)
    t = re.sub(r",,+", ",", t)
    t = re.sub(r"::+", ":", t)
    t = re.sub(r"\.\s*\.", ". ", t)
    t = re.sub(r"\.\.\.\.+", "...", t) # Collapse 4+ dots into 3

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

test_samples = [
    "5 And the Blessed One sat down with his body erect...",
    "Seeking enlightenment is a waste of your time. ..In reality there is no seeker",
    "He led out the people who lived there and he hacked them with axes;; cf. Sam. 12.31",
    "So the ETERNAL God cast a deep sleep upon the Human; and, while he slept, [God] took one of his sides",
    "<Abu Hurairah said:\"The Messenger of Allah forbade...",
    "The name of its characteristic star and of itself, Arcturus ([Greek: Arktos], before...",
    "[Illustration: THE ZODIAC OF DENDERAH.] In the first instance...",
    "The son[s] of Zerubbabel: Meshullam and Hananiah"
]

print("BEFORE -> AFTER TEST:")
for s in test_samples:
    print(f"OLD: {s}")
    print(f"NEW: {clean_single_text(s)}\n")
