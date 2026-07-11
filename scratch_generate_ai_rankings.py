import json
import os
import re
import time
import urllib.request
import sys

# Ensure UTF-8 output for Windows console
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

API_KEY = "AIzaSyCpATyVQNc5j11DWPvf3Etaen-k8KIx8Cc"
URL = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={API_KEY}"

data_dir = "C:/Users/ASUS/Desktop/religion app/data"
output_path = os.path.join(data_dir, "rankings.json")

# Positive and negative keywords for initial baseline filtering
pos_words = [
    "peace", "love", "compassion", "wisdom", "truth", "light", "joy", "grace",
    "kindness", "forgive", "comfort", "strength", "heal", "bless", "good",
    "righteous", "holy", "pure", "rejoice", "glad", "mercy", "understanding",
    "knowledge", "praise", "patience", "hope", "heart", "gentle", "faith"
]
neg_words = [
    "begat", "genealogy", "cubits", "cubit", "lineage", "son of", "daughter of",
    "descendant", "concubine", "census", "tribe", "tribes", "shekels", "shekel",
    "sacrificed", "slain", "smote", "swords", "chariots", "horses", "unclean"
]

def get_baseline_score(text):
    text_lower = text.lower()
    score = 6
    for word in pos_words:
        if re.search(r'\b' + word + r'(?:s|ed|ing|ly|ful|ness)?\b', text_lower):
            score += 1.5
    for word in neg_words:
        if re.search(r'\b' + word + r'(?:s|ed|ing|ly)?\b', text_lower):
            score -= 2
    return max(1, min(10, int(round(score))))

# Load and parse all verses
religions_data = {
    "Christianity": [],
    "Islam": [],
    "Hinduism": [],
    "Judaism": [],
    "Sikhism": [],
    "Buddhism": []
}

# 1. Bible (Christianity)
bible_path = os.path.join(data_dir, "bible.json")
if os.path.exists(bible_path):
    with open(bible_path, "r", encoding="utf-8") as f:
        bible = json.load(f)
        for book, chapters in bible.items():
            if isinstance(chapters, dict):
                for chap, verses in chapters.items():
                    if isinstance(verses, dict):
                        for v_num, v_text in verses.items():
                            if 70 <= len(v_text) <= 180:
                                key = f"christianity_{book}_{chap}_{v_num}".lower().replace(" ", "_")
                                religions_data["Christianity"].append({"id": key, "text": v_text})

# 2. Quran & Hadiths (Islam)
quran_path = os.path.join(data_dir, "quran_v2.json")
if os.path.exists(quran_path):
    with open(quran_path, "r", encoding="utf-8") as f:
        quran = json.load(f)
        for surah in quran:
            surah_id = surah["id"]
            surah_name = surah["name"]
            for v in surah["verses"]:
                v_id = v["id"]
                v_text = v["translation"]
                if 70 <= len(v_text) <= 180:
                    key = f"islam_quran_{surah_id}_{v_id}".lower().replace(" ", "_")
                    religions_data["Islam"].append({"id": key, "text": v_text})

hadiths_path = os.path.join(data_dir, "hadiths_v2.json")
if os.path.exists(hadiths_path):
    with open(hadiths_path, "r", encoding="utf-8") as f:
        hadiths = json.load(f)
        counters = {}
        meta_phrases = [
            "chain of transmitters", "chain of transmission", "variation of wording",
            "change of words", "rest of the hadith is the same", "similar hadith has been",
            "same hadith has been", "this hadith has been reported", "this hadith is reported",
            "this hadith has been transmitted", "exception of these words", "with this addition",
            "but he made no mention of", "the hadith was narrated"
        ]
        for h in hadiths:
            collection = h.get("source")
            if not collection:
                continue
            if collection not in counters:
                counters[collection] = 1
            text = h.get("text_en")
            if text and text != "Missing English text":
                lower_text = text.lower()
                if any(p in lower_text for p in meta_phrases):
                    continue
                verse_num = counters[collection]
                counters[collection] += 1
                if 70 <= len(text) <= 180:
                    chapter = (verse_num - 1) // 100 + 1
                    verse_str = (verse_num - 1) % 100 + 1
                    key = f"islam_{collection}_{chapter}_{verse_str}".lower().replace(" ", "_")
                    religions_data["Islam"].append({"id": key, "text": text})

# 3. Gita & Hindu Books (Hinduism)
gita_path = os.path.join(data_dir, "gita.json")
if os.path.exists(gita_path):
    with open(gita_path, "r", encoding="utf-8") as f:
        gita = json.load(f)
        unique_verses = {}
        for g in gita:
            if g.get("lang", "").lower() == "english":
                vid = g.get("verse_id")
                if vid not in unique_verses:
                    unique_verses[vid] = g.get("description", "")
        chapter_lengths = [47, 72, 43, 42, 29, 47, 30, 28, 34, 42, 55, 20, 35, 27, 20, 24, 28, 78]
        current_chapter = 1
        verse_in_chapter = 1
        chapter_end = chapter_lengths[0]
        for vid in range(1, 702):
            if vid not in unique_verses:
                continue
            text = unique_verses[vid]
            if 70 <= len(text) <= 180:
                key = f"hinduism_bhagavad_gita_{current_chapter}_{verse_in_chapter}".lower().replace(" ", "_")
                religions_data["Hinduism"].append({"id": key, "text": text})
            
            verse_in_chapter += 1
            if verse_in_chapter > chapter_end and current_chapter < 18:
                current_chapter += 1
                verse_in_chapter = 1
                chapter_end = chapter_lengths[current_chapter - 1]

hindu_books_path = os.path.join(data_dir, "hindu_books.json")
if os.path.exists(hindu_books_path):
    with open(hindu_books_path, "r", encoding="utf-8") as f:
        hbooks = json.load(f)
        for book, chapters in hbooks.items():
            if isinstance(chapters, dict):
                for chap, verses in chapters.items():
                    if isinstance(verses, dict):
                        for v_num, v_text in verses.items():
                            if 70 <= len(v_text) <= 180:
                                key = f"hinduism_{book}_{chap}_{v_num}".lower().replace(" ", "_")
                                religions_data["Hinduism"].append({"id": key, "text": v_text})

# 4. Sefaria (Judaism)
sefaria_path = os.path.join(data_dir, "sefaria.json")
if os.path.exists(sefaria_path):
    with open(sefaria_path, "r", encoding="utf-8") as f:
        sefaria = json.load(f)
        collections = sefaria.get("collections", {})
        for col_name, col_books in collections.items():
            if isinstance(col_books, list):
                for book in col_books:
                    book_name = book.get("name", "")
                    content = book.get("content", {})
                    if isinstance(content, dict):
                        for chap, verses in content.items():
                            if isinstance(verses, dict):
                                for v_num, v_text in verses.items():
                                    if 70 <= len(v_text) <= 180:
                                        key = f"judaism_{book_name}_{chap}_{v_num}".lower().replace(" ", "_")
                                        religions_data["Judaism"].append({"id": key, "text": v_text})

# 5. Gurbani (Sikhism)
gurbani_path = os.path.join(data_dir, "gurbani.json")
if os.path.exists(gurbani_path):
    with open(gurbani_path, "r", encoding="utf-8") as f:
        gurbani = json.load(f)
        books_list = gurbani.get("books", [])
        for book in books_list:
            book_name = book.get("name", "")
            content = book.get("content", {})
            if isinstance(content, dict):
                for chap, verses in content.items():
                    if isinstance(verses, dict):
                        for v_num, v_text in verses.items():
                            if 70 <= len(v_text) <= 180:
                                key = f"sikhism_{book_name}_{chap}_{v_num}".lower().replace(" ", "_")
                                religions_data["Sikhism"].append({"id": key, "text": v_text})

# 6. Buddhism
buddhism_path = os.path.join(data_dir, "buddhism.json")
if os.path.exists(buddhism_path):
    with open(buddhism_path, "r", encoding="utf-8") as f:
        buddhism = json.load(f)
        buddhism_books = buddhism.get("books", buddhism)
        for book, chapters in buddhism_books.items():
            if isinstance(chapters, dict):
                for chap, verses in chapters.items():
                    if isinstance(verses, dict):
                        for v_num, v_text in verses.items():
                            if isinstance(v_text, dict):
                                v_text = v_text.get("text", str(v_text))
                            if 70 <= len(v_text) <= 180:
                                key = f"buddhism_{book}_{chap}_{v_num}".lower().replace(" ", "_")
                                religions_data["Buddhism"].append({"id": key, "text": v_text})

print("Filtering candidates using baseline scoring...", flush=True)
ai_candidates = []
baseline_rankings = {}

for rel, items in religions_data.items():
    print(f"  - {rel}: {len(items)} eligible verses", flush=True)
    scored_items = []
    for item in items:
        score = get_baseline_score(item["text"])
        baseline_rankings[item["id"]] = score
        scored_items.append((score, item))
        
    scored_items.sort(key=lambda x: x[0], reverse=True)
    limit = 400 if rel != "Buddhism" else 300
    top_items = [x[1] for x in scored_items[:limit]]
    ai_candidates.extend(top_items)

total_ai_verses = len(ai_candidates)
print(f"Total candidate verses selected for Gemini AI ranking: {total_ai_verses}", flush=True)

# Batch size of 100 to optimize API call count
BATCH_SIZE = 100
batches = [ai_candidates[i:i + BATCH_SIZE] for i in range(0, total_ai_verses, BATCH_SIZE)]

print(f"Running Gemini AI ranking over {len(batches)} batches...", flush=True)
ai_rankings = {}

for idx, batch in enumerate(batches):
    print(f"  Processing Batch {idx+1}/{len(batches)} ({len(batch)} verses)...", flush=True)
    
    prompt = f"""You are an expert in spiritual and religious texts.
Rate the peacefulness, wisdom, and inspiring quality of the following verses on a scale of 1 to 10 (10 is extremely peaceful/wise/inspiring, 1 is dry administrative details, genealogy lists, or violent context).
Rate them based on semantic meaning (e.g. "You shall not kill" is peaceful, so rate it high).

Input:
{json.dumps(batch, indent=2)}

Respond ONLY with a flat JSON object mapping the ID to the integer rank, like this:
{{
  "id_here": 9
}}"""

    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"responseMimeType": "application/json"}
    }
    
    success = False
    for attempt in range(8):
        try:
            req = urllib.request.Request(
                URL,
                data=json.dumps(payload).encode("utf-8"),
                headers={"Content-Type": "application/json"}
            )
            with urllib.request.urlopen(req, timeout=60) as res:
                resp = json.loads(res.read().decode("utf-8"))
                text_resp = resp['candidates'][0]['content']['parts'][0]['text'].strip()
                batch_ranks = json.loads(text_resp)
                
                if isinstance(batch_ranks, dict):
                    for k, v in batch_ranks.items():
                        try:
                            ai_rankings[k] = int(v)
                        except:
                            pass
                    success = True
                    break
        except Exception as e:
            err_msg = str(e)
            print(f"    Attempt {attempt+1} failed: {err_msg}", flush=True)
            if "429" in err_msg:
                # Sleep 25 seconds immediately for rate limits
                time.sleep(25)
            else:
                time.sleep(2 ** attempt + 3)
            
    if not success:
        print(f"    WARNING: Batch {idx+1} failed completely after 8 attempts.", flush=True)
        
    # Respect the 15 RPM rate limit (1 request every 4 seconds)
    time.sleep(4.2)

final_rankings = {}
for k, v in baseline_rankings.items():
    final_rankings[k] = v
for k, v in ai_rankings.items():
    if 1 <= v <= 10:
        final_rankings[k] = v

print(f"\nFinal ranked dataset size: {len(final_rankings)}", flush=True)
print(f"AI-refined ranks size: {len(ai_rankings)}", flush=True)

with open(output_path, "w", encoding="utf-8") as f:
    json.dump(final_rankings, f, indent=2)

print(f"SUCCESS: Saved all AI-evaluated rankings to {output_path}", flush=True)
