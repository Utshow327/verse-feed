import json
import os
import re

base_dir = r'c:\Users\ASUS\Desktop\religion app\data'

MIN_CHAR_LIMIT = 70
maxCharLimit = 210

negativeWords = ['smite', 'kill', 'destroy', 'wrath', 'blood', 'sword', 'curse', 'hell', 'fire', 'punish', 'death', 'die', 'slay', 'enemy', 'evil', 'wicked', 'sin', 'weep', 'wail', 'gnash', 'vengeance', 'terror', 'fear', 'plague', 'famine', 'perish', 'slaughter', 'condemn', 'abomination', 'hate', 'despise', 'anger', 'fury']
positiveWords = ['love', 'peace', 'joy', 'hope', 'faith', 'light', 'grace', 'mercy', 'compassion', 'kindness', 'bless', 'heal', 'forgive', 'comfort', 'strength', 'wisdom', 'truth', 'spirit', 'heart', 'soul', 'heaven', 'glory', 'righteous', 'holy', 'pure', 'good', 'rejoice', 'glad', 'praise', 'worship', 'save', 'deliver', 'guide', 'protect']

def cleanText(text):
    if not text:
        return ''
    if 'peace' in text or 'pbuh' in text or '\ufdfa' in text:
        text = re.sub(r'\(\(may peace be upon him\)\)', '(pbuh)', text, flags=re.IGNORECASE)
        text = re.sub(r'\(may peace be upon him\)', '(pbuh)', text, flags=re.IGNORECASE)
        text = re.sub(r'may peace be upon him', '(pbuh)', text, flags=re.IGNORECASE)
        text = re.sub(r'\(\(peace be upon him\)\)', '(pbuh)', text, flags=re.IGNORECASE)
        text = re.sub(r'\(peace be upon him\)', '(pbuh)', text, flags=re.IGNORECASE)
        text = re.sub(r'peace be upon him', '(pbuh)', text, flags=re.IGNORECASE)
        text = re.sub(r'\(\(pbuh\)\)', '(pbuh)', text, flags=re.IGNORECASE)
        text = text.replace('\ufdfa', '(pbuh)')
    text = re.sub(r'[{}[\]\@#*_+=~0-9]', '', text)
    text = re.sub(r'\s+', ' ', text)
    text = re.sub(r'^[\s\-.,:;]+', '', text)
    return text.strip()

def is_good_verse(text):
    if not text:
        return False
    length = len(text)
    if length < MIN_CHAR_LIMIT or length > maxCharLimit:
        return False
    text_lower = text.lower()
    if any(w in text_lower for w in negativeWords):
        return False
    if not any(w in text_lower for w in positiveWords):
        return False
    if text_lower.startswith(('and ', 'but ', 'then ', 'therefore ', 'for ')):
        return False
    return True

rel_verses = {}

# 1. Christianity (bible.json)
christian_raw = []
with open(os.path.join(base_dir, 'bible.json'), 'r', encoding='utf-8') as f:
    bible = json.load(f)
    for b_name, b_content in bible.items():
        if isinstance(b_content, dict):
            for c_num, verses in b_content.items():
                for v_num, text in verses.items():
                    christian_raw.append(cleanText(text))
rel_verses['Christianity'] = christian_raw

# 2. Islam (quran_v2.json + hadiths_v2.json)
islam_raw = []
with open(os.path.join(base_dir, 'quran_v2.json'), 'r', encoding='utf-8') as f:
    quran = json.load(f)
    for surah in quran:
        for v in surah['verses']:
            islam_raw.append(cleanText(v['translation']))

with open(os.path.join(base_dir, 'hadiths_v2.json'), 'r', encoding='utf-8') as f:
    hadiths = json.load(f)
    metaPhrases = [
        "chain of transmitters", "chain of transmission", "variation of wording",
        "change of words", "rest of the hadith is the same", "similar hadith has been",
        "same hadith has been", "this hadith has been reported", "this hadith is reported",
        "this hadith has been transmitted", "exception of these words", "with this addition",
        "but he made no mention of", "the hadith was narrated"
    ]
    for h in hadiths:
        text = h.get('text_en')
        if text and text != "Missing English text":
            lower_text = text.lower()
            if any(m in lower_text for m in metaPhrases):
                continue
            islam_raw.append(cleanText(text))
rel_verses['Islam'] = islam_raw

# 3. Hinduism (gita.json + hindu_books.json)
hindu_raw = []
with open(os.path.join(base_dir, 'gita.json'), 'r', encoding='utf-8') as f:
    gita = json.load(f)
    unique = {}
    for g in gita:
        if g.get('lang', '').lower() == 'english':
            if g['verse_id'] not in unique:
                unique[g['verse_id']] = g['description']
    for text in unique.values():
        hindu_raw.append(cleanText(text))

with open(os.path.join(base_dir, 'hindu_books.json'), 'r', encoding='utf-8') as f:
    h_books = json.load(f)
    for b_name, b_data in h_books.items():
        for c_name, verses in b_data.items():
            for v_key, text in verses.items():
                if text and text.strip():
                    hindu_raw.append(cleanText(text))
rel_verses['Hinduism'] = hindu_raw

# 4. Judaism (sefaria.json)
judaism_raw = []
with open(os.path.join(base_dir, 'sefaria.json'), 'r', encoding='utf-8') as f:
    sefaria = json.load(f)
    collections = sefaria.get('collections', {})
    for c_name, c_books in collections.items():
        for book in c_books:
            content = book.get('content', {})
            for chap, chap_verses in content.items():
                if isinstance(chap_verses, dict):
                    for v_num, text in chap_verses.items():
                        if text and text.strip():
                            judaism_raw.append(cleanText(text))
rel_verses['Judaism'] = judaism_raw

# 5. Sikhism (gurbani.json)
sikhism_raw = []
with open(os.path.join(base_dir, 'gurbani.json'), 'r', encoding='utf-8') as f:
    gurbani = json.load(f)
    for book in gurbani.get('books', []):
        if book.get('name') == 'Dasam Granth':
            continue
        content = book.get('content', {})
        for c_name, verses in content.items():
            for k, text in verses.items():
                sikhism_raw.append(cleanText(text))
rel_verses['Sikhism'] = sikhism_raw

# 6. Buddhism (buddhism.json)
buddhism_raw = []
badPhrases = ['gutenberg', 'copyright', 'ebook', 'translator', 'volume', 'edition', 'chapter', 'section', 'index', 'preface', 'introduction', 'footnote', 'indemnity', 'trademark']
with open(os.path.join(base_dir, 'buddhism.json'), 'r', encoding='utf-8') as f:
    buddhism = json.load(f)
    books = buddhism.get('books', {})
    for b_name, b_content in books.items():
        for c_num, c_verses in b_content.items():
            for v_num, text in c_verses.items():
                text_lower = text.lower()
                if any(bp in text_lower for bp in badPhrases):
                    continue
                buddhism_raw.append(cleanText(text))
rel_verses['Buddhism'] = buddhism_raw

# 7. Philosophy (philosophy.json)
philosophy_raw = []
with open(os.path.join(base_dir, 'philosophy.json'), 'r', encoding='utf-8') as f:
    philosophy = json.load(f)
    books = philosophy.get('books', {})
    for b_name, chapters in books.items():
        for c_num, verses in chapters.items():
            for v_num, text in verses.items():
                philosophy_raw.append(cleanText(text))
rel_verses['Philosophy'] = philosophy_raw

# 8. Psychology (psychology.json)
psychology_raw = []
with open(os.path.join(base_dir, 'psychology.json'), 'r', encoding='utf-8') as f:
    psychology = json.load(f)
    books = psychology.get('books', {})
    for b_name, chapters in books.items():
        for c_num, verses in chapters.items():
            for v_num, text in verses.items():
                psychology_raw.append(cleanText(text))
rel_verses['Psychology'] = psychology_raw

print("--- GOOD VERSES DATASET COUNT RESULTS ---")
total_raw = 0
total_good = 0

for rel, raw_list in rel_verses.items():
    good_list = [v for v in raw_list if is_good_verse(v)]
    raw_count = len(raw_list)
    good_count = len(good_list)
    total_raw += raw_count
    total_good += good_count
    print(f"{rel}: {good_count:,} good verses (out of {raw_count:,} total)")

print(f"\nTOTAL GOOD VERSES ACROSS ALL TOPICS: {total_good:,} (out of {total_raw:,} total)")
