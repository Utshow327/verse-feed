import os
import json
import re
import sys
import time
from llama_cpp import Llama

# Ensure UTF-8 output for Windows console
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

data_dir = "data"
rankings_path = os.path.join(data_dir, "rankings.json")
active_rankings_path = os.path.join(data_dir, "active_rankings.json")

def save_rankings(rankings):
    with open(rankings_path, "w", encoding="utf-8") as f:
        json.dump(rankings, f, indent=2)
    active = {k: v for k, v in rankings.items() if v >= 70}
    with open(active_rankings_path, "w", encoding="utf-8") as f:
        json.dump(active, f, indent=2)

print("Stage 1: Parsing and loading all eligible verses from files...", flush=True)

religions_data = {
    "Christianity": [],
    "Islam": [],
    "Hinduism": [],
    "Judaism": [],
    "Sikhism": [],
    "Buddhism": []
}

# Bible
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

# Islam
quran_path = os.path.join(data_dir, "quran_v2.json")
if os.path.exists(quran_path):
    with open(quran_path, "r", encoding="utf-8") as f:
        quran = json.load(f)
        for surah in quran:
            surah_id = surah["id"]
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
        for h in hadiths:
            collection = h.get("source")
            if not collection:
                continue
            if collection not in counters:
                counters[collection] = 1
            text = h.get("text_en")
            if text and text != "Missing English text":
                verse_num = counters[collection]
                counters[collection] += 1
                if 70 <= len(text) <= 180:
                    chapter = (verse_num - 1) // 100 + 1
                    verse_str = (verse_num - 1) % 100 + 1
                    key = f"islam_{collection}_{chapter}_{verse_str}".lower().replace(" ", "_")
                    religions_data["Islam"].append({"id": key, "text": text})

# Hinduism
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

# Judaism
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

# Sikhism
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

# Buddhism
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

# Flatten all loaded verses
all_verses = []
for rel, items in religions_data.items():
    all_verses.extend(items)

total_verses_count = len(all_verses)
print(f"Total eligible verses loaded: {total_verses_count}", flush=True)

# Load existing database to resume progress
final_rankings = {}
if os.path.exists(rankings_path):
    try:
        with open(rankings_path, "r", encoding="utf-8") as f:
            final_rankings = json.load(f)
        print(f"Resuming progress: Loaded {len(final_rankings)} existing rankings.", flush=True)
    except Exception as e:
        print(f"Could not load existing rankings. Starting fresh. Error: {e}", flush=True)

# Word lists for rule-based auto-scoring
strong_wisdom_words = ["peace", "wisdom", "compassion", "love", "forgive", "kindness", "meditat", "righteous", "patient", "charit", "humble", "grateful", "seren", "gentle", "merciful", "mercy"]
generic_pos_words = ["truth", "prayer", "heart", "spirit", "faith", "hope", "joy"]
genealogy_words = ["begat", "begot", "sire", "lineage", "son of", "daughter of", "wife of", "husband of", "genealogy", "cubit", "shekel", "talent of", "measurement"]
hadith_meta = ["chain of transmitters", "chain of transmission", "variation of wording", "narrated", "transmitted", "reported"]
violence_words = ["slay", "kill", "destroy", "sword", "war", "battle", "blood", "slaughter", "punish", "stone him", "execute", "vengeance", "wrath"]
pos_modifiers = ["do not", "shall not", "never", "avoid", "abstain", "refrain", "forbid", "shalt not"]

# Auto-scoring scan
print("Stage 2: Running rule-based filters for fast auto-scoring...", flush=True)
ai_queue = []
auto_scored_count = 0
violence_scored_count = 0
neutral_scored_count = 0

for v in all_verses:
    v_id = v["id"]
    
    # If already ranked (either by auto-score or GGUF in previous run), keep it!
    if v_id in final_rankings:
        continue
        
    text_lower = v["text"].lower()
    
    # 1. Check for genealogies/measurements -> Auto score 20
    is_genealogy = any(w in text_lower for w in genealogy_words)
    if is_genealogy:
        final_rankings[v_id] = 20
        auto_scored_count += 1
        continue
        
    # 2. Check for Hadith transmission metadata -> Auto score 35
    is_trans = any(w in text_lower for w in hadith_meta)
    if is_trans:
        final_rankings[v_id] = 35
        auto_scored_count += 1
        continue
        
    # 3. Check for violence words -> Auto score 30 (instead of slow GGUF evaluation)
    has_violence = any(w in text_lower for w in violence_words)
    if has_violence:
        final_rankings[v_id] = 30
        auto_scored_count += 1
        violence_scored_count += 1
        continue
        
    # 4. Check if it contains strong wisdom words. If not, auto-score as 50 (neutral).
    # This prevents running slow GGUF AI on thousands of generic verses.
    has_strong = any(w in text_lower for w in strong_wisdom_words)
    if not has_strong:
        final_rankings[v_id] = 50
        auto_scored_count += 1
        neutral_scored_count += 1
        continue
        
    # Otherwise, it's a high-quality positive candidate containing strong moral keywords -> Queue for GGUF!
    ai_queue.append(v)

print(f"Auto-scored {auto_scored_count} total verses:", flush=True)
print(f"  - {violence_scored_count} violent/harsh verses auto-scored as 30", flush=True)
print(f"  - {neutral_scored_count} generic/dry verses auto-scored as 50", flush=True)
print(f"Remaining positive candidate verses queued for GGUF evaluation: {len(ai_queue)}", flush=True)

# Write baseline auto-scores to disk immediately
try:
    save_rankings(final_rankings)
    print("Baseline auto-scores successfully saved.", flush=True)
except Exception as e:
    print(f"Error saving baseline: {e}", flush=True)

# Stage 3: Local GGUF AI evaluation of candidate verses
if len(ai_queue) > 0:
    print("Loading local Qwen GGUF model...", flush=True)
    model_path = r"C:\Users\ASUS\Downloads\qwen2.5-7b-instruct-q5_k_m.gguf"
    
    llm = Llama(
        model_path=model_path,
        n_ctx=1500,
        n_threads=6, # Optimized for Intel P-Cores
        n_gpu_layers=0,
        n_batch=512,
        verbose=False
    )
    
    system_prompt = (
        "You are an objective AI critic that evaluates religious quotes on a strict 1 to 100 scale "
        "based on their universal positive value, moral wisdom, and peacefulness. You must be extremely strict.\n\n"
        "CRITICAL CONSTRAINTS (MANDATORY):\n"
        "1. Give a LOW score (1 to 49) to any quote containing:\n"
        "   - Specific miracle stories or narrative actions (e.g., dipping in the river Jordan 7 times to heal, raising the dead, healing leprosy, physical acts of God).\n"
        "   - Sectarian dogmatic jargon, political titles, or ancient administrative terms (e.g., 'bodhi', 'dharma', 'covenant', 'magistrates', 'counselors', 'sacrament', 'baptize', 'circumcision').\n"
        "   - Specific historical narratives, names of specific people, prophets, or places (e.g., Jordan, Jerusalem, Naaman, Moses, Jesus, Muhammad, Buddha, Krishna).\n"
        "   - Ritual instructions, ceremonial laws, or specific forms of sectarian worship.\n"
        "2. Give a HIGH score (70 to 100) ONLY to quotes containing universal ethical wisdom, human values, and self-improvement that apply to ANY human being regardless of belief:\n"
        "   - Peace, kindness, patience, control of anger, honesty, charity, humility, self-control, truthfulness, and love.\n\n"
        "Respond ONLY with a raw JSON array of integers, representing the scores for each quote in the EXACT order they were provided. "
        "Example: [45, 85, 20, 95, 10]\n"
        "Do not return any markdown code blocks or explanatory text, just the raw JSON array."
    )
    
    BATCH_SIZE = 10
    total_unranked = len(ai_queue)
    
    print(f"Starting GGUF rating loop over {total_unranked} verses in batches of {BATCH_SIZE}...", flush=True)
    
    for i in range(0, total_unranked, BATCH_SIZE):
        batch = ai_queue[i:i + BATCH_SIZE]
        batch_num = (i // BATCH_SIZE) + 1
        total_batches = (total_unranked + BATCH_SIZE - 1) // BATCH_SIZE
        
        print(f"Processing Batch {batch_num}/{total_batches} ({len(batch)} verses)...", flush=True)
        
        prompt_content = "Rank these quotes in order:\n"
        for idx, v in enumerate(batch):
            clean_text = v["text"].replace("\n", " ").replace("\r", "")
            prompt_content += f"Quote {idx+1}: \"{clean_text}\"\n\n"
            
        prompt = f"<|im_start|>system\n{system_prompt}<|im_end|>\n<|im_start|>user\n{prompt_content}<|im_end|>\n<|im_start|>assistant\n"
        
        success = False
        for attempt in range(3):
            try:
                res = llm(prompt, max_tokens=1000, temperature=0.0)
                text_resp = res["choices"][0]["text"].strip()
                
                if text_resp.startswith("```"):
                    text_resp = re.sub(r"^```(?:json)?\n", "", text_resp)
                    text_resp = re.sub(r"\n```$", "", text_resp)
                    text_resp = text_resp.strip()
                    
                batch_ranks = json.loads(text_resp)
                if isinstance(batch_ranks, list) and len(batch_ranks) == len(batch):
                    for k_idx, rank in enumerate(batch_ranks):
                        try:
                            final_rankings[batch[k_idx]['id']] = int(rank)
                        except:
                            pass
                    success = True
                    break
                else:
                    print(f"  Attempt {attempt+1} failed: Invalid array length or format.", flush=True)
            except Exception as e:
                print(f"  Attempt {attempt+1} failed: {e}", flush=True)
                time.sleep(2)
                
        if not success:
            print(f"  WARNING: Batch {batch_num} failed completely. Skipping.", flush=True)
            
        try:
            save_rankings(final_rankings)
        except Exception as e:
            print(f"  Error saving rankings file: {e}", flush=True)

print("SUCCESS: Finished local GGUF AI-refined rankings for all verses!", flush=True)
