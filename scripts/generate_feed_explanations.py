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
# (compound-mini excluded due to its tiny 250 RPD bottleneck)
MODELS = [
    'qwen/qwen3.6-27b',
    'openai/gpt-oss-20b',
    'qwen/qwen3.8-27b',
    'allam-2-7b'
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

# Prioritize queue: Rank 100 down to 70
sorted_active = sorted(active_rankings.items(), key=lambda x: x[1], reverse=True)

pending_queue = []
for vkey, score in sorted_active:
    # Check if already completed under exact key or alternate key
    if vkey in explanations or vkey.lower() in explanations:
        continue
    parts = vkey.split('_')
    alt_key = '_'.join(parts[1:])  # e.g., quran_2_21
    if alt_key in explanations:
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
    print("All scriptures across the entire app have explanations!")
    sys.exit(0)

def sanitize_text(text):
    if not text: return ''
    # Strip <think> reasoning tags
    text = re.sub(r'<think>.*?</think>', '', text, flags=re.DOTALL)
    text = re.sub(r'Here\'s a thinking.*', '', text, flags=re.DOTALL)
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
        with open(temp_file, 'w', encoding='utf-8') as f:
            json.dump(explanations, f, indent=2, ensure_ascii=False)
        if os.path.exists(OUTPUT_FILE):
            os.replace(temp_file, OUTPUT_FILE)
        else:
            os.rename(temp_file, OUTPUT_FILE)
        with open(WWW_OUTPUT_FILE, 'w', encoding='utf-8') as f:
            json.dump(explanations, f, indent=2, ensure_ascii=False)
    except Exception as e:
        print(f"Error saving databases: {e}")

model_index = 0

model_index = 0

def call_ai_batch(verse_batch):
    global model_index
    prompt = (
        "Respond in valid JSON format.\n"
        "You explain world scriptures in simple, plain, easy-to-understand English.\n"
        "Explain each of the following spiritual verses clearly, simply, and concisely in 25 to 35 words each.\n\n"
        "Strict rules for EVERY explanation:\n"
        "1. Use simple, everyday words. Avoid complex academic jargon, big words, or difficult theological terms so anyone can easily understand.\n"
        "2. Clearly explain what the verse means and its simple story or background.\n"
        "3. Be factual, clear, and direct. Zero generic filler (never start with 'In this verse').\n"
        "4. Never use emojis.\n"
        "5. Never use em dashes or en dashes (use standard commas or periods instead).\n"
        "6. Target length: strictly between 25 and 35 words.\n"
        "7. Return ONLY a valid JSON object mapping each ID ('v1', 'v2', etc.) to its explanation string.\n\n"
        "Verses to explain:\n"
    )
    for idx, item in enumerate(verse_batch):
        v_text = item['text'][:250]
        v_ref = f"{item['religion']} - {item['book']} {item['chapter']}:{item['verse']}"
        prompt += f'v{idx+1}: "{v_text}" ({v_ref})\n'

    max_attempts = 25
    for attempt in range(max_attempts):
        model = MODELS[(model_index + attempt) % len(MODELS)]
        curr_key = get_next_key()
        payload = {
            'model': model,
            'messages': [
                {'role': 'system', 'content': 'You explain spiritual texts in simple, plain, everyday English. Output valid JSON.'},
                {'role': 'user', 'content': prompt}
            ],
            'max_tokens': 500,
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
                raw = re.sub(r'<think>.*?</think>', '', raw, flags=re.DOTALL).strip()
                json_match = re.search(r'\{.*\}', raw, re.DOTALL)
                if json_match:
                    parsed = json.loads(json_match.group(0))
                else:
                    parsed = json.loads(raw)

                results = []
                for idx, v_item in enumerate(verse_batch):
                    exp_text = parsed.get(f'v{idx+1}') or parsed.get(str(idx+1))
                    if not exp_text and isinstance(parsed, dict):
                        for k, val in parsed.items():
                            if str(idx+1) in k:
                                exp_text = val
                                break
                    if exp_text:
                        cleaned = sanitize_text(str(exp_text))
                        if len(cleaned.split()) >= 10:
                            results.append((v_item, cleaned))

                if len(results) >= max(1, len(verse_batch) // 2):
                    model_index = (model_index + 1) % len(MODELS)
                    return results, None
        except urllib.error.HTTPError as e:
            model_index = (model_index + 1) % len(MODELS)
            if e.code == 429:
                err_body = e.read().decode('utf-8', errors='replace')
                m = re.search(r'try again in (\d+(?:\.\d+)?)(?:m|s)', err_body)
                wait_sec = 2.0
                if m:
                    wait_sec = min(float(m.group(1)) + 0.5, 8.0)
                time.sleep(wait_sec)
                continue
            time.sleep(1.0)
        except Exception:
            time.sleep(1.0)

    return [], "Rate limit cooldown needed"

print("=" * 70)
print(f"  STARTING FEED EXPLANATIONS GENERATOR ({len(pending_queue):,} verses queued)")
print("  Running with auto-rotating models: " + ", ".join(MODELS))
print(f"  Batching: 4 verses per API call across {len(API_KEYS)} API key(s)")
print("  Auto-saves continuously. Logs to " + LOG_FILE)
print("=" * 70)

import subprocess

start_time = time.time()
last_sync_time = time.time()
completed = 0
total_pending = len(pending_queue)
BATCH_SIZE = 4
WORKERS = 3

with open(LOG_FILE, 'a', encoding='utf-8') as log_f:
    log_f.write(f"\n--- Generator Started at {time.ctime()} ({total_pending} verses, batch size {BATCH_SIZE}) ---\n")

try:
    with ThreadPoolExecutor(max_workers=WORKERS) as executor:
        for i in range(0, total_pending, BATCH_SIZE * WORKERS):
            round_chunk = pending_queue[i:i + (BATCH_SIZE * WORKERS)]
            batches = [round_chunk[j:j + BATCH_SIZE] for j in range(0, len(round_chunk), BATCH_SIZE)]
            futures = [executor.submit(call_ai_batch, b) for b in batches]

            for fut in as_completed(futures):
                try:
                    batch_results, err = fut.result()
                except Exception as fut_err:
                    print(f"Batch processing error: {fut_err}")
                    continue

                for v_item, explanation in batch_results:
                    feed_k = v_item.get('feed_key') or v_item['key']
                    alt_k = v_item.get('alt_key')

                    entry = {
                        'meaning': explanation,
                        'context': '',
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

                if batch_results:
                    if completed % 8 == 0:
                        save_databases()

                    elapsed = time.time() - start_time
                    rate = completed / elapsed if elapsed > 0 else 0
                    eta_mins = (total_pending - completed) / (rate * 60) if rate > 0 else 0

                    last_v = batch_results[-1][0]
                    status = f"[{completed:,}/{total_pending:,}] ({completed/total_pending*100:.1f}%) | {rate*60:.1f} v/min | ETA: {eta_mins:.1f}m | {last_v['book']} {last_v['chapter']}:{last_v['verse']}"
                    print(status)
                    sys.stdout.flush()

                if cli_args.max_count > 0 and completed >= cli_args.max_count:
                    break

            # In GitHub Actions cloud environment, push progress to GitHub every 15 minutes
            if os.environ.get('GITHUB_ACTIONS') == 'true' and (time.time() - last_sync_time) > 900:
                print("\n[PERIODIC CLOUD SYNC] Pushing progress to GitHub...")
                save_databases()
                subprocess.run(['python', 'scripts/cloud_merge_and_push.py'])
                last_sync_time = time.time()

            if cli_args.max_count > 0 and completed >= cli_args.max_count:
                print(f"\n[TARGET REACHED] Generated {completed} verses. Stopping run.")
                break

            if cli_args.max_minutes > 0 and (time.time() - start_time) > (cli_args.max_minutes * 60):
                print(f"\n[TIME LIMIT REACHED] Ran for {cli_args.max_minutes} minutes. Saving and stopping.")
                break

            time.sleep(0.3)

except KeyboardInterrupt:
    print("\nPaused by user. Saving progress...")
except Exception as main_err:
    print(f"\nUnexpected pipeline error: {main_err}")
finally:
    save_databases()
    elapsed = time.time() - start_time
    print(f"\nSession finished: {completed:,} verses generated in {elapsed/60:.1f} mins.")
    print(f"Total explanations in database: {len(explanations):,}")

