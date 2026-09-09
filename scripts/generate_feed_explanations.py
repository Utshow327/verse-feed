# scripts/generate_feed_explanations.py
import os
import sys
import json
import time
import re
import urllib.request
import urllib.error
from datetime import timedelta
from concurrent.futures import ThreadPoolExecutor, as_completed

# Ensure UTF-8 output on Windows consoles
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

import argparse

parser = argparse.ArgumentParser(description='Feed Explanations Generator')
parser.add_argument('--max-minutes', type=int, default=0, help='Max minutes to run (0 = unlimited)')
parser.add_argument('--max-count', type=int, default=0, help='Max verses to generate (0 = unlimited)')
cli_args = parser.parse_args()

API_KEYS = []
raw_keys = os.environ.get('GROQ_API_KEYS') or os.environ.get('GROQ_API_KEY')
if raw_keys:
    API_KEYS = [k.strip() for k in raw_keys.split(',') if k.strip()]

if not API_KEYS:
    env_file = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '.env')
    if os.path.exists(env_file):
        try:
            with open(env_file, 'r', encoding='utf-8') as ef:
                for line in ef:
                    line = line.strip()
                    if line.startswith('GROQ_API_KEYS=') or line.startswith('GROQ_API_KEY='):
                        val = line.split('=', 1)[1].strip(' "\'')
                        API_KEYS = [k.strip() for k in val.split(',') if k.strip()]
        except Exception:
            pass

if not API_KEYS:
    print("ERROR: GROQ_API_KEY is not set.")
    print("Please configure GROQ_API_KEY in your GitHub Secrets or environment.")
    sys.exit(1)

print(f"Loaded {len(API_KEYS)} API key(s) in rotation pool.")

key_index = 0
def get_next_key():
    global key_index
    k = API_KEYS[key_index % len(API_KEYS)]
    key_index += 1
    return k


GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'

# Fast models with independent rate limits to maximize throughput
# Put ultra-fast models (sub-second responses) first
MODELS = [
    'openai/gpt-oss-20b',
    'allam-2-7b',
    'qwen/qwen3.6-27b',
    'qwen/qwen3.8-27b'
]

OUTPUT_FILE = os.path.join('data', 'verse_explanations.json')
WWW_OUTPUT_FILE = os.path.join('www', 'data', 'verse_explanations.json')
ACTIVE_RANKINGS_FILE = os.path.join('data', 'active_rankings.json')
LOG_FILE = os.path.join('scripts', 'feed_generation.log')

os.makedirs('data', exist_ok=True)
os.makedirs(os.path.join('www', 'data'), exist_ok=True)
os.makedirs('scripts', exist_ok=True)

# 1. Load existing explanations
explanations = {}
if os.path.exists(OUTPUT_FILE):
    try:
        with open(OUTPUT_FILE, 'r', encoding='utf-8') as f:
            explanations = json.load(f)
    except Exception as e:
        print(f"Warning reading explanations: {e}")

print(f"Loaded {len(explanations):,} existing explanations.")

# 2. Index all verses across scriptures
all_verses = {}

def clean_text(text):
    if not text: return ''
    text = re.sub(r'[{}[\]\@#*_+=~0-9]', '', str(text))
    text = re.sub(r'\s+', ' ', text).strip()
    return text

print("Indexing all scriptures across the app...")

# Bible
if os.path.exists('data/bible.json'):
    try:
        with open('data/bible.json', 'r', encoding='utf-8') as f:
            bible = json.load(f)
            for bName, bContent in bible.items():
                if isinstance(bContent, dict):
                    for cNum, verses in bContent.items():
                        if isinstance(verses, dict):
                            for vNum, vText in verses.items():
                                vid = f'christianity_{bName}_{cNum}_{vNum}'.lower().replace(' ', '_')
                                all_verses[vid] = {
                                    'key': vid,
                                    'religion': 'Christianity',
                                    'book': bName,
                                    'chapter': str(cNum),
                                    'verse': str(vNum),
                                    'text': clean_text(vText)
                                }
    except Exception as e:
        print(f"Bible index error: {e}")

# Quran
if os.path.exists('data/quran_v2.json'):
    try:
        with open('data/quran_v2.json', 'r', encoding='utf-8') as f:
            for s in json.load(f):
                sid = s.get('id')
                for v in s.get('verses', []):
                    vid_num = v.get('id')
                    vid = f'islam_quran_{sid}_{vid_num}'.lower().replace(' ', '_')
                    all_verses[vid] = {
                        'key': vid,
                        'religion': 'Islam',
                        'book': 'Quran',
                        'chapter': str(sid),
                        'verse': str(vid_num),
                        'text': clean_text(v.get('translation') or v.get('text'))
                    }
    except Exception as e:
        print(f"Quran index error: {e}")

# Hadiths
if os.path.exists('data/hadiths_v2.json'):
    try:
        with open('data/hadiths_v2.json', 'r', encoding='utf-8') as f:
            for h in json.load(f):
                coll = h.get('source', '')
                c = str(h.get('chapter_no') or 1)
                v = str(h.get('hadith_no') or 1)
                vid = f'islam_{coll}_{c}_{v}'.lower().replace(' ', '_')
                all_verses[vid] = {
                    'key': vid,
                    'religion': 'Islam',
                    'book': coll,
                    'chapter': c,
                    'verse': v,
                    'text': clean_text(h.get('text_en', ''))
                }
    except Exception as e:
        print(f"Hadith index error: {e}")

# Gita
if os.path.exists('data/gita.json'):
    try:
        chapterLengths = [47, 72, 43, 42, 29, 47, 30, 28, 34, 42, 55, 20, 35, 27, 20, 24, 28, 78]
        uniqueVerses = {}
        with open('data/gita.json', 'r', encoding='utf-8') as f:
            for g in json.load(f):
                if g.get('lang', '').lower() == 'english' and g.get('verse_id') not in uniqueVerses:
                    uniqueVerses[g.get('verse_id')] = g.get('description') or g.get('meaning') or g.get('text')
        curChap = 1; curVer = 1; chapEnd = chapterLengths[0]
        for vid in range(1, 702):
            if vid in uniqueVerses:
                k = f'hinduism_bhagavad_gita_{curChap}_{curVer}'.lower().replace(' ', '_')
                all_verses[k] = {
                    'key': k,
                    'religion': 'Hinduism',
                    'book': 'Bhagavad Gita',
                    'chapter': str(curChap),
                    'verse': str(curVer),
                    'text': clean_text(uniqueVerses[vid])
                }
            curVer += 1
            if curVer > chapEnd and curChap < 18:
                curChap += 1; curVer = 1; chapEnd = chapterLengths[curChap - 1]
    except Exception as e:
        print(f"Gita index error: {e}")

# Hindu Books
if os.path.exists('data/hindu_books.json'):
    try:
        with open('data/hindu_books.json', 'r', encoding='utf-8') as f:
            hb = json.load(f)
            for bName, bData in hb.items():
                for chapName, verses in bData.items():
                    for vKey, text in verses.items():
                        k = f'hinduism_{bName}_{chapName}_{vKey}'.lower().replace(' ', '_')
                        all_verses[k] = {
                            'key': k,
                            'religion': 'Hinduism',
                            'book': bName,
                            'chapter': str(chapName),
                            'verse': str(vKey),
                            'text': clean_text(text)
                        }
    except Exception as e:
        print(f"Hindu books index error: {e}")

# Sefaria (Judaism)
if os.path.exists('data/sefaria.json'):
    try:
        with open('data/sefaria.json', 'r', encoding='utf-8') as f:
            sef = json.load(f)
            for colName, colBooks in sef.get('collections', {}).items():
                for bk in colBooks:
                    bName = bk.get('name', '')
                    for chap, verses in bk.get('content', {}).items():
                        for vNum, text in verses.items():
                            k = f'judaism_{bName}_{chap}_{vNum}'.lower().replace(' ', '_')
                            all_verses[k] = {
                                'key': k,
                                'religion': 'Judaism',
                                'book': bName,
                                'chapter': str(chap),
                                'verse': str(vNum),
                                'text': clean_text(text)
                            }
    except Exception as e:
        print(f"Sefaria index error: {e}")

# Sikhism (Gurbani)
if os.path.exists('data/gurbani.json'):
    try:
        with open('data/gurbani.json', 'r', encoding='utf-8') as f:
            for bk in json.load(f).get('books', []):
                bName = bk.get('name', '')
                for chap, verses in bk.get('content', {}).items():
                    for vNum, text in verses.items():
                        k = f'sikhism_{bName}_{chap}_{vNum}'.lower().replace(' ', '_')
                        all_verses[k] = {
                            'key': k,
                            'religion': 'Sikhism',
                            'book': bName,
                            'chapter': str(chap),
                            'verse': str(vNum),
                            'text': clean_text(text)
                        }
    except Exception as e:
        print(f"Gurbani index error: {e}")

# Buddhism
if os.path.exists('data/buddhism.json'):
    try:
        with open('data/buddhism.json', 'r', encoding='utf-8') as f:
            for bName, content in json.load(f).get('books', {}).items():
                if isinstance(content, dict):
                    for chap, verses in content.items():
                        if isinstance(verses, dict):
                            for vNum, text in verses.items():
                                k = f'buddhism_{bName}_{chap}_{vNum}'.lower().replace(' ', '_')
                                all_verses[k] = {
                                    'key': k,
                                    'religion': 'Buddhism',
                                    'book': bName,
                                    'chapter': str(chap),
                                    'verse': str(vNum),
                                    'text': clean_text(text)
                                }
    except Exception as e:
        print(f"Buddhism index error: {e}")

print(f"Total scriptures indexed: {len(all_verses):,}")

# 3. Load active rankings (the feed pool)
active_rankings = {}
if os.path.exists(ACTIVE_RANKINGS_FILE):
    with open(ACTIVE_RANKINGS_FILE, 'r', encoding='utf-8') as f:
        active_rankings = json.load(f)

print(f"Total verses in active feed rankings: {len(active_rankings):,}")

def is_explanation_complete(key):
    if not key:
        return False
    entry = explanations.get(key) or explanations.get(key.lower())
    if not entry or not isinstance(entry, dict):
        return False
    ctx = entry.get('context')
    meaning = entry.get('meaning') or entry.get('text')
    if not ctx or len(str(ctx).strip()) < 5:
        return False
    if not meaning or len(str(meaning).strip()) < 5:
        return False
    return True

# Prioritize queue: Rank 100 down to 70
sorted_active = sorted(active_rankings.items(), key=lambda x: x[1], reverse=True)

pending_queue = []
for vkey, score in sorted_active:
    parts = vkey.split('_')
    alt_key = '_'.join(parts[1:])  # e.g., quran_2_21
    # Check if already completed with valid context and meaning
    if is_explanation_complete(vkey) or is_explanation_complete(alt_key):
        continue
    
    verse_obj = all_verses.get(vkey)
    if not verse_obj:
        for cand_key in [alt_key, f'islam_{alt_key}']:
            if cand_key in all_verses:
                verse_obj = all_verses[cand_key]
                break
    
    if verse_obj and verse_obj.get('text') and len(verse_obj['text']) > 5:
        verse_obj['feed_key'] = vkey
        verse_obj['alt_key'] = alt_key
        pending_queue.append(verse_obj)

print(f"Pending feed verses (Priority 1): {len(pending_queue):,}")

# 4. Queue ALL remaining library scriptures across all religions (Priority 2)
queued_keys = set(v.get('feed_key') for v in pending_queue)
for k in list(explanations.keys()):
    if is_explanation_complete(k):
        queued_keys.add(k)
        queued_keys.add(k.lower())

library_added = 0
for vkey, v_obj in all_verses.items():
    if vkey in queued_keys or vkey.lower() in queued_keys:
        continue
    parts = vkey.split('_')
    alt_key = '_'.join(parts[1:])
    if alt_key in queued_keys or alt_key.lower() in queued_keys:
        continue
    if is_explanation_complete(vkey) or is_explanation_complete(alt_key):
        continue

    if v_obj.get('text') and len(v_obj['text']) > 5:
        item_copy = dict(v_obj)
        item_copy['feed_key'] = vkey
        item_copy['alt_key'] = alt_key
        pending_queue.append(item_copy)
        queued_keys.add(vkey)
        queued_keys.add(alt_key)
        library_added += 1

print(f"Pending library verses (Priority 2): {library_added:,}")
print(f"TOTAL QUEUED FOR GENERATION: {len(pending_queue):,} verses across entire app")

if not pending_queue:
    print("All scriptures across the entire app have full explanations!")
    try:
        with open('.all_completed', 'w', encoding='utf-8') as f:
            f.write('done')
    except Exception:
        pass
    sys.exit(0)

def sanitize_text(text):
    if not text: return ''
    # Strip <think> reasoning tags (both closed and unclosed if truncated)
    text = re.sub(r'<think>[\s\S]*?</think>', '', text)
    text = re.sub(r'<think>[\s\S]*', '', text)
    text = re.sub(r'Here\'s a thinking[\s\S]*', '', text, flags=re.IGNORECASE)
    text = re.sub(r'1\.\s*\*\*Analyze User Input[\s\S]*', '', text, flags=re.IGNORECASE)
    text = re.sub(r'\*\*Role:\*\*[\s\S]*', '', text, flags=re.IGNORECASE)
    text = re.sub(r'<[^>]+>', '', text)
    # Remove em-dashes and en-dashes
    text = text.replace('\u2014', ', ').replace('\u2013', ', ').replace('--', ', ')
    text = text.replace('\u2011', '-')  # Non-breaking hyphen
    # Remove emojis
    text = re.sub(r'[\U00010000-\U0010ffff]', '', text)
    # Remove robotic lead-ins
    text = re.sub(r'^(?:In this (?:verse|sutra|passage)(?: from [^,]+)?,?|This (?:verse|sutra|passage)(?: from [^,]+)? (?:highlights|emphasizes|teaches|reminds us that|focuses on|underscores)|This passage from [^,]+,?)\s*', '', text, flags=re.IGNORECASE)
    # Capitalize first letter
    text = text.strip()
    if text and text[0].islower():
        text = text[0].upper() + text[1:]
    # Clean up double commas
    while ', ,' in text:
        text = text.replace(', ,', ',')
    text = text.replace(' ,', ',')
    # Strip leading/trailing quotes or markdown
    text = re.sub(r'^["\'\s*#>-]+', '', text)
    text = re.sub(r'["\'\s]+$', '', text)
    return text.strip()

def save_databases():
    temp_file = OUTPUT_FILE + '.tmp'
    try:
        data_copy = dict(explanations)
        with open(temp_file, 'w', encoding='utf-8') as f:
            json.dump(data_copy, f, indent=2, ensure_ascii=False)
        if os.path.exists(OUTPUT_FILE):
            os.replace(temp_file, OUTPUT_FILE)
        else:
            os.rename(temp_file, OUTPUT_FILE)
        with open(WWW_OUTPUT_FILE, 'w', encoding='utf-8') as f:
            json.dump(data_copy, f, indent=2, ensure_ascii=False)
    except Exception as e:
        print(f"Error saving databases: {e}")

from queue import Queue, Empty
from threading import Thread, Lock

def call_ai_batch_for_worker(verse_batch, worker_id):
    start_model_idx = worker_id % len(MODELS)
    prompt = (
        "Respond in valid JSON format.\n"
        "You explain world scriptures in simple, plain, easy-to-understand English.\n"
        "For each verse, provide TWO short parts: 'context' and 'meaning'.\n\n"
        "Strict rules:\n"
        "1. 'context': 10 to 18 simple words explaining the story, setting, or background.\n"
        "2. 'meaning': 15 to 22 simple words explaining the moral lesson or spiritual truth in everyday words.\n"
        "3. Use easy everyday words. Avoid big words or academic jargon.\n"
        "4. Never use emojis.\n"
        "5. Never use em dashes or en dashes (use standard commas or periods).\n"
        "6. Return ONLY a valid JSON object mapping each ID ('v1', 'v2', etc.) to an object with 'context' and 'meaning'.\n\n"
        "Verses to explain:\n"
    )
    for idx, item in enumerate(verse_batch):
        v_text = item['text'][:250]
        v_ref = f"{item['religion']} - {item['book']} {item['chapter']}:{item['verse']}"
        prompt += f'v{idx+1}: "{v_text}" ({v_ref})\n'

    max_attempts = len(MODELS) * 2
    for attempt in range(max_attempts):
        model = MODELS[(start_model_idx + attempt) % len(MODELS)]
        key_idx = (worker_id + (attempt // len(MODELS))) % len(API_KEYS)
        curr_key = API_KEYS[key_idx]

        payload = {
            'model': model,
            'messages': [
                {'role': 'system', 'content': 'You explain scriptures in simple English with context and meaning. Output valid JSON.'},
                {'role': 'user', 'content': prompt}
            ],
            'max_tokens': 1000,
            'temperature': 0.2
        }
        if 'gpt-oss' in model:
            payload['reasoning_effort'] = 'low'
            payload['reasoning_format'] = 'hidden'
        elif 'qwen' in model:
            payload['reasoning_effort'] = 'none'

        data = json.dumps(payload).encode('utf-8')
        req = urllib.request.Request(GROQ_URL, data=data, headers={
            'Authorization': f'Bearer {curr_key}',
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
        })

        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                res = json.loads(resp.read().decode('utf-8'))
                raw = res['choices'][0]['message'].get('content', '').strip()
                parsed = {}
                raw_clean = re.sub(r'<think>.*?</think>', '', raw, flags=re.DOTALL).strip()
                raw_clean = re.sub(r'```(?:json)?', '', raw_clean).strip()
                m = re.search(r'\{[\s\S]*\}', raw_clean)
                if m:
                    try:
                        parsed = json.loads(m.group(0))
                    except Exception:
                        s_idx = raw_clean.find('{')
                        e_idx = raw_clean.rfind('}')
                        if s_idx != -1 and e_idx != -1:
                            try:
                                parsed = json.loads(raw_clean[s_idx:e_idx+1])
                            except Exception:
                                pass

                results = []
                for idx, v_item in enumerate(verse_batch):
                    item_data = parsed.get(f'v{idx+1}') or parsed.get(str(idx+1))
                    if not item_data and isinstance(parsed, dict):
                        for k, val in parsed.items():
                            if str(idx+1) in k:
                                item_data = val
                                break

                    ctx_val = ''
                    meaning_val = ''
                    if isinstance(item_data, dict):
                        ctx_val = sanitize_text(str(item_data.get('context', '')))
                        meaning_val = sanitize_text(str(item_data.get('meaning', '')))
                    elif isinstance(item_data, str):
                        meaning_val = sanitize_text(item_data)

                    # Explicitly reject contaminated or prompt-leaking outputs
                    bad_indicators = ['<think', 'thinking process', 'user input', 'expert scholar', '**role', '**task', 'strict rules']
                    if any(b in meaning_val.lower() for b in bad_indicators) or any(b in ctx_val.lower() for b in bad_indicators):
                        meaning_val = ''
                        ctx_val = ''

                    if meaning_val and len(meaning_val.split()) >= 8:
                        results.append((v_item, ctx_val, meaning_val))

                if len(results) >= max(1, len(verse_batch) // 2):
                    return results, None
        except urllib.error.HTTPError as e:
            if e.code == 429:
                time.sleep(0.3)
                continue
            time.sleep(0.4)
        except Exception:
            time.sleep(0.4)

    return [], "Rate limit cooldown needed"

BATCH_SIZE = 8
WORKERS = max(4, min(len(API_KEYS), 8))

print("=" * 70)
print(f"  STARTING TURBO FEED EXPLANATIONS GENERATOR ({len(pending_queue):,} queued)")
print(f"  Concurrency: {WORKERS} parallel workers with dedicated keys across {len(API_KEYS)} key(s)")
print("  Active Models: " + ", ".join(MODELS))
print("  Continuous pipeline (non-blocking async I/O). Auto-saves to " + OUTPUT_FILE)
print("=" * 70)

import subprocess

actual_gen_start = time.time()
completed = 0
total_pending = len(pending_queue)
stop_requested = False

results_lock = Lock()
save_lock = Lock()
recent_completed = []

task_queue = Queue()
for i in range(0, total_pending, BATCH_SIZE):
    task_queue.put(pending_queue[i:i + BATCH_SIZE])

with open(LOG_FILE, 'a', encoding='utf-8') as log_f:
    log_f.write(f"\n--- Turbo Generator Started at {time.ctime()} ({total_pending} verses, {WORKERS} workers) ---\n")

def background_saver():
    while not stop_requested:
        for _ in range(45):
            if stop_requested:
                break
            time.sleep(1)
        if not stop_requested:
            with save_lock:
                save_databases()

def background_cloud_syncer():
    if os.environ.get('GITHUB_ACTIONS') != 'true':
        return
    while not stop_requested:
        for _ in range(900):  # 15 minutes
            if stop_requested:
                break
            time.sleep(1)
        if not stop_requested:
            print("\n[PERIODIC CLOUD SYNC] Pushing progress to GitHub in background...")
            with save_lock:
                save_databases()
            subprocess.run(['python', 'scripts/cloud_merge_and_push.py'])

def worker_thread(worker_id):
    global completed, stop_requested
    while not stop_requested:
        try:
            verse_batch = task_queue.get(timeout=2)
        except Empty:
            break

        batch_results, err = call_ai_batch_for_worker(verse_batch, worker_id)
        if not batch_results:
            task_queue.put(verse_batch)
            time.sleep(1.0)
            continue

        with results_lock:
            for v_item, ctx_val, meaning_val in batch_results:
                feed_k = v_item.get('feed_key') or v_item['key']
                alt_k = v_item.get('alt_key')

                entry = {
                    'meaning': meaning_val,
                    'context': ctx_val,
                    'religion': v_item['religion'],
                    'book': v_item['book'],
                    'chapter': v_item['chapter'],
                    'verse': v_item['verse'],
                    'updated_at': int(time.time() * 1000)
                }

                explanations[feed_k] = entry
                if alt_k and alt_k != feed_k:
                    explanations[alt_k] = entry

                completed += 1

            t_now = time.time()
            recent_completed.append((t_now, len(batch_results)))
            # Rolling rate over last 60 seconds
            while recent_completed and t_now - recent_completed[0][0] > 60:
                recent_completed.pop(0)

            rolling_window = max(1.0, min(60.0, t_now - actual_gen_start))
            rolling_count = sum(c for _, c in recent_completed)
            rate = (rolling_count / rolling_window) * 60
            eta_mins = (total_pending - completed) / rate if rate > 0 else 0

            last_v = batch_results[-1][0]
            status = f"[{completed:,}/{total_pending:,}] ({completed/total_pending*100:.1f}%) | {rate:.1f} v/min | ETA: {eta_mins:.1f}m | {last_v['book']} {last_v['chapter']}:{last_v['verse']}"
            print(status)
            sys.stdout.flush()

            if cli_args.max_count > 0 and completed >= cli_args.max_count:
                print(f"\n[TARGET REACHED] Generated {completed} verses. Stopping run.")
                stop_requested = True
                break

            if cli_args.max_minutes > 0 and (t_now - actual_gen_start) > (cli_args.max_minutes * 60):
                print(f"\n[TIME LIMIT REACHED] Ran for {cli_args.max_minutes} minutes. Saving and stopping.")
                stop_requested = True
                break

        task_queue.task_done()

try:
    threads = []
    # Start background saver thread
    saver_t = Thread(target=background_saver, daemon=True)
    saver_t.start()
    threads.append(saver_t)

    # Start background cloud sync thread
    syncer_t = Thread(target=background_cloud_syncer, daemon=True)
    syncer_t.start()
    threads.append(syncer_t)

    # Start generator workers
    worker_threads = []
    for w in range(WORKERS):
        t = Thread(target=worker_thread, args=(w,))
        t.daemon = True
        t.start()
        worker_threads.append(t)

    for t in worker_threads:
        t.join()

except KeyboardInterrupt:
    print("\nPaused by user. Saving progress...")
    stop_requested = True
except Exception as main_err:
    print(f"\nUnexpected pipeline error: {main_err}")
    stop_requested = True
finally:
    with save_lock:
        save_databases()
    elapsed = time.time() - actual_gen_start
    print(f"\nSession finished: {completed:,} verses generated in {elapsed/60:.1f} mins.")
    print(f"Total explanations in database: {len(explanations):,}")
    sys.exit(0)

