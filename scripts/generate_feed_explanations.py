# scripts/generate_feed_explanations.py
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
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
parser.add_argument('--include-library', action='store_true', default=True, help='Include all library scriptures')
parser.add_argument('--reverse', action='store_true', default=False, help='Process pending queue in reverse order')
parser.add_argument('--religion', type=str, default='', help='Filter to a specific religion (e.g. Hinduism, Islam, Buddhism)')
cli_args = parser.parse_args()

API_KEYS = []
raw_keys = os.environ.get('GROQ_API_KEYS') or os.environ.get('GROQ_API_KEY')
if raw_keys:
    API_KEYS = [k.strip() for k in raw_keys.split(',') if k.strip()]

GEMINI_API_KEYS = []
gem_env = os.environ.get('GEMINI_API_KEYS') or os.environ.get('GEMINI_API_KEY')
if gem_env:
    GEMINI_API_KEYS = [k.strip() for k in gem_env.split(',') if k.strip()]

env_file = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '.env')
if os.path.exists(env_file):
    try:
        with open(env_file, 'r', encoding='utf-8') as ef:
            for line in ef:
                line = line.strip()
                if not API_KEYS and (line.startswith('GROQ_API_KEYS=') or line.startswith('GROQ_API_KEY=')):
                    val = line.split('=', 1)[1].strip(' "\'')
                    API_KEYS = [k.strip() for k in val.split(',') if k.strip()]
                if not GEMINI_API_KEYS and (line.startswith('GEMINI_API_KEYS=') or line.startswith('GEMINI_API_KEY=')):
                    val = line.split('=', 1)[1].strip(' "\'')
                    GEMINI_API_KEYS = [k.strip() for k in val.split(',') if k.strip()]
    except Exception:
        pass

if not API_KEYS and not GEMINI_API_KEYS:
    print("ERROR: Neither GROQ_API_KEY nor GEMINI_API_KEYS is set.")
    sys.exit(1)

# Validate Groq keys
valid_keys = []
if API_KEYS:
    print(f"Validating {len(API_KEYS)} Groq API key(s) in rotation pool...")
    for i, k in enumerate(API_KEYS):
        req = urllib.request.Request(
            'https://api.groq.com/openai/v1/chat/completions',
            data=json.dumps({
                'model': 'allam-2-7b',
                'messages': [{'role': 'user', 'content': 'hi'}],
                'max_tokens': 5
            }).encode('utf-8'),
            headers={'Authorization': f'Bearer {k}', 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0'}
        )
        try:
            with urllib.request.urlopen(req, timeout=8) as resp:
                valid_keys.append(k)
                print(f"  Groq Key #{i+1} ({k[:12]}...): ACTIVE")
        except urllib.error.HTTPError as e:
            print(f"  Groq Key #{i+1} ({k[:12]}...): REMOVED (HTTP {e.code})")
        except Exception as e:
            print(f"  Groq Key #{i+1} ({k[:12]}...): REMOVED ({e})")

API_KEYS = valid_keys

# Validate Gemini keys
valid_gemini = []
if GEMINI_API_KEYS:
    print(f"Validating {len(GEMINI_API_KEYS)} Gemini API key(s)...")
    for ki, k in enumerate(GEMINI_API_KEYS):
        gemini_valid = False
        for test_mod in ['gemini-robotics-er-2-preview', 'gemini-3.5-flash', 'gemini-3.6-flash', 'gemini-3.7-flash', 'gemini-3-flash-preview', 'gemini-3.5-flash-lite', 'gemini-flash-lite-latest', 'gemini-3.1-flash-lite']:
            req = urllib.request.Request(
                f'https://generativelanguage.googleapis.com/v1beta/models/{test_mod}:generateContent?key={k}',
                data=json.dumps({'contents': [{'parts': [{'text': 'hi'}]}]}).encode('utf-8'),
                headers={'Content-Type': 'application/json'}
            )
            try:
                with urllib.request.urlopen(req, timeout=8) as resp:
                    print(f"  Gemini Key #{ki+1} ({k[:10]}...) on {test_mod}: ACTIVE")
                    gemini_valid = True
                    break
            except Exception:
                pass
        valid_gemini.append(k)

GEMINI_API_KEYS = valid_gemini

if not API_KEYS and not GEMINI_API_KEYS:
    print("ERROR: No valid API keys in rotation pool!")
    sys.exit(1)

print(f"Active working Groq keys: {len(API_KEYS)} | Active Gemini keys: {len(GEMINI_API_KEYS)}")

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
    'allam-2-7b',
    'groq/compound',
    'openai/gpt-oss-120b',
    'qwen/qwen3.6-27b',
    'qwen/qwen3.8-27b',
    'openai/gpt-oss-20b'
]

OUTPUT_FILE = os.path.join('data', 'verse_explanations.json')
WWW_OUTPUT_FILE = os.path.join('www', 'data', 'verse_explanations.json')
EPICS_OUTPUT_FILE = os.path.join('data', 'explanations_epics.json')
WWW_EPICS_OUTPUT_FILE = os.path.join('www', 'data', 'explanations_epics.json')
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
            explanations.update(json.load(f))
    except Exception as e:
        print(f"Warning reading explanations: {e}")

if os.path.exists(EPICS_OUTPUT_FILE):
    try:
        with open(EPICS_OUTPUT_FILE, 'r', encoding='utf-8') as f:
            explanations.update(json.load(f))
    except Exception as e:
        print(f"Warning reading epics explanations: {e}")

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

# Philosophy
if os.path.exists('data/philosophy.json'):
    try:
        with open('data/philosophy.json', 'r', encoding='utf-8') as f:
            p_data = json.load(f)
            for catName, catBooks in p_data.get('books', {}).items():
                if isinstance(catBooks, dict):
                    for chap, verses in catBooks.items():
                        if isinstance(verses, dict):
                            for vNum, text in verses.items():
                                k = f'philosophy_{catName}_{chap}_{vNum}'.lower().replace(' ', '_')
                                all_verses[k] = {
                                    'key': k,
                                    'religion': 'Philosophy',
                                    'book': catName,
                                    'chapter': str(chap),
                                    'verse': str(vNum),
                                    'text': clean_text(text)
                                }
    except Exception as e:
        print(f"Philosophy index error: {e}")

print(f"Total scriptures indexed: {len(all_verses):,}")

# 3. Load active rankings (the feed pool)
active_rankings = {}
if os.path.exists(ACTIVE_RANKINGS_FILE):
    with open(ACTIVE_RANKINGS_FILE, 'r', encoding='utf-8') as f:
        active_rankings = json.load(f)

print(f"Total verses in active feed rankings: {len(active_rankings):,}")

FLAWED_TRIGGERS = [
    '<think', 'thinking process', 'analyze user input', 'expert scholar', 
    '**role', '**task', 'strict rules', 'key terminology', 'in theological context', 
    'this quranic verse', 'this biblical verse'
]

def is_explanation_complete(key):
    if not key:
        return False
    entry = explanations.get(key) or explanations.get(key.lower())
    if not entry:
        kl = key.lower()
        for r in ['christianity_', 'islam_', 'hinduism_', 'buddhism_', 'judaism_', 'sikhism_']:
            if not kl.startswith(r):
                cand = f"{r}{kl}"
                if cand in explanations:
                    entry = explanations[cand]
                    break
    if not entry or not isinstance(entry, dict):
        return False

    ctx = str(entry.get('context') or '').strip()
    mng = str(entry.get('meaning') or '').strip()
    exp = str(entry.get('explanation') or '').strip()

    if ctx and mng and len(ctx.split()) >= 4 and len(mng.split()) >= 5:
        full_text = f"{ctx}\n\n{mng}"
    elif exp and ('\n\n' in exp or '\n' in exp) and len(exp.split()) >= 15:
        full_text = exp
    else:
        return False

    lower = full_text.lower()
    if any(t in lower for t in FLAWED_TRIGGERS):
        return False
    if full_text and full_text[-1] not in '.!?\"\'”)':
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

# 4. Queue remaining library scriptures
if getattr(cli_args, 'include_library', True):
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

def is_epic_entry(k, v):
    book = str(v.get('book', '')).lower() if isinstance(v, dict) else ''
    kl = str(k).lower()
    return 'mahabharata' in book or 'ramayana' in book or 'mahabharata' in kl or 'ramayana' in kl

# Prioritize: Feed (0) -> Philosophy (1) -> Core Library (2) -> Epics (3)
def get_priority(item):
    if item.get('feed_key') in active_rankings:
        return 0
    if item.get('religion') == 'Philosophy':
        return 1
    if not is_epic_entry(item.get('key'), item):
        return 2
    return 3

pending_queue.sort(key=get_priority)

print(f"TOTAL QUEUED FOR GENERATION: {len(pending_queue):,} verses")

if cli_args.religion:
    pending_queue = [v for v in pending_queue if v.get('religion', '').lower() == cli_args.religion.lower()]
    print(f"Filtered queue to religion '{cli_args.religion}': {len(pending_queue):,} verses")

if cli_args.reverse:
    pending_queue.reverse()
    print("Reversed pending queue: processing backwards from end of library to prevent runner collision.")

if pending_queue:
    if os.path.exists('.all_completed'):
        try:
            os.remove('.all_completed')
        except Exception:
            pass
else:
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

def safe_replace(src, dst):
    for attempt in range(6):
        try:
            if os.path.exists(dst):
                os.replace(src, dst)
            else:
                os.rename(src, dst)
            return
        except OSError:
            time.sleep(0.25)
    try:
        import shutil
        shutil.copyfile(src, dst)
        if os.path.exists(src):
            os.remove(src)
    except Exception as e:
        print(f"safe_replace fallback error: {e}")

def save_databases():
    temp_file = OUTPUT_FILE + '.tmp'
    www_temp = WWW_OUTPUT_FILE + '.tmp'
    epics_temp = EPICS_OUTPUT_FILE + '.tmp'
    www_epics_temp = WWW_EPICS_OUTPUT_FILE + '.tmp'
    try:
        data_copy = dict(explanations)
        religions = ['islam', 'christianity', 'judaism', 'hinduism', 'buddhism', 'sikhism', 'taoism', 'shinto', 'zoroastrianism', 'bahai', 'jainism', 'philosophy']
        core_data = {}
        epics_data = {}
        for k, v in data_copy.items():
            has_rel = any(k.startswith(r + '_') for r in religions)
            if has_rel:
                can_k = k
            else:
                rel = (v.get('religion') or '').lower().strip().replace(' ', '_')
                can_k = f"{rel}_{k}" if rel else k

            if is_epic_entry(can_k, v):
                if can_k not in epics_data:
                    epics_data[can_k] = v
            else:
                if can_k not in core_data:
                    core_data[can_k] = v

        with open(temp_file, 'w', encoding='utf-8') as f:
            json.dump(core_data, f, separators=(',', ':'), ensure_ascii=False)
        safe_replace(temp_file, OUTPUT_FILE)

        # www stubs remain empty {} to keep app bundle tiny (~10MB)
        with open(www_temp, 'w', encoding='utf-8') as f:
            f.write('{}')
        safe_replace(www_temp, WWW_OUTPUT_FILE)

        if epics_data:
            with open(epics_temp, 'w', encoding='utf-8') as f:
                json.dump(epics_data, f, separators=(',', ':'), ensure_ascii=False)
            safe_replace(epics_temp, EPICS_OUTPUT_FILE)

            with open(www_epics_temp, 'w', encoding='utf-8') as f:
                f.write('{}')
            safe_replace(www_epics_temp, WWW_EPICS_OUTPUT_FILE)

        try:
            from scripts.build_chunks import build_chunks
            build_chunks()
        except Exception as e:
            print(f"Error building chunks: {e}")
    except Exception as e:
        print(f"Error saving databases: {e}")

from queue import Queue, Empty
from threading import Thread, Lock

GEMINI_MODELS = [
    'gemini-robotics-er-2-preview',
    'gemini-3.5-flash',
    'gemini-3.6-flash',
    'gemini-3.7-flash',
    'gemini-3-flash-preview',
    'gemini-3.5-flash-lite',
    'gemini-flash-lite-latest',
    'gemini-3.1-flash-lite'
]

CHANNELS = []
for ki, k in enumerate(GEMINI_API_KEYS):
    for g_mod in GEMINI_MODELS:
        CHANNELS.append({
            'provider': 'gemini',
            'key': k,
            'model': g_mod,
            'label': f"Gemini{ki+1}-{g_mod.replace('gemini-', '')}",
            'last_call': 0.0,
            'cooldown_until': 0.0,
            'min_interval': 4.0,
            'disabled': False
        })

for ki, k in enumerate(API_KEYS):
    for m in MODELS:
        CHANNELS.append({
            'provider': 'groq',
            'key': k,
            'model': m,
            'label': f"Groq{ki+1}-{m.split('/')[-1]}",
            'last_call': 0.0,
            'cooldown_until': 0.0,
            'min_interval': 2.2,
            'disabled': False
        })

channel_lock = Lock()
MIN_CHANNEL_INTERVAL = 2.2

def acquire_channel():
    while not stop_requested:
        with channel_lock:
            now = time.time()
            best_idx = None
            longest_idle = -1
            available_active = 0
            for idx, ch in enumerate(CHANNELS):
                if ch.get('disabled'):
                    continue
                available_active += 1
                if now < ch['cooldown_until']:
                    continue
                idle = now - ch['last_call']
                req_interval = ch.get('min_interval', MIN_CHANNEL_INTERVAL)
                if idle >= req_interval and idle > longest_idle:
                    longest_idle = idle
                    best_idx = idx
            if best_idx is not None:
                CHANNELS[best_idx]['last_call'] = now
                return best_idx, CHANNELS[best_idx]
            if available_active == 0:
                print("\n[WARNING] All API channels are currently disabled.")
                return None, None
        time.sleep(0.05)
    return None, None

def mark_channel_cooldown(ch_idx, retry_seconds=15.0):
    with channel_lock:
        if 0 <= ch_idx < len(CHANNELS):
            CHANNELS[ch_idx]['cooldown_until'] = time.time() + retry_seconds

def call_ai_batch_channel(verse_batch, ch_idx, ch):
    prompt = (
        "Respond in valid JSON: {\"v1\": {\"context\": \"...\", \"meaning\": \"...\"}}\n"
        "For each verse, write exactly TWO distinct paragraphs:\n"
        "1. 'context': 1-2 simple sentences clearly explaining who the characters, figures, or places are and the background setting.\n"
        "2. 'meaning': 1-2 simple sentences clearly explaining the practical core life lesson, moral, or spiritual takeaway.\n"
        "Keep each part concise (total ~40-50 words per verse). Start directly without robotic intros.\n\n"
        "Verses:\n"
    )
    for idx, item in enumerate(verse_batch):
        v_text = item['text'][:180]
        v_ref = f"{item['religion']} - {item['book']} {item['chapter']}:{item['verse']}"
        prompt += f'v{idx+1}: "{v_text}" ({v_ref})\n'

    is_gemini = ch.get('provider') == 'gemini'

    if is_gemini:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{ch['model']}:generateContent?key={ch['key']}"
        payload = {
            'contents': [{'parts': [{'text': prompt}]}],
            'generationConfig': {
                'maxOutputTokens': 1500,
                'temperature': 0.2,
                'thinkingConfig': {
                    'thinkingBudget': 0
                }
            }
        }
        data = json.dumps(payload).encode('utf-8')
        req = urllib.request.Request(url, data=data, headers={'Content-Type': 'application/json'})
        req_timeout = 25
    else:
        payload = {
            'model': ch['model'],
            'messages': [
                {'role': 'system', 'content': 'You provide two-paragraph verse explanations: context explaining characters, and meaning explaining the lesson. Output valid JSON.'},
                {'role': 'user', 'content': prompt}
            ],
            'max_tokens': 600,
            'temperature': 0.2
        }
        if 'gpt-oss' in ch['model']:
            payload['reasoning_effort'] = 'low'
            payload['reasoning_format'] = 'hidden'
        elif 'qwen' in ch['model']:
            payload['reasoning_effort'] = 'none'

        data = json.dumps(payload).encode('utf-8')
        req = urllib.request.Request(GROQ_URL, data=data, headers={
            'Authorization': f"Bearer {ch['key']}",
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
        })
        req_timeout = 15

    try:
        with urllib.request.urlopen(req, timeout=req_timeout) as resp:
            res = json.loads(resp.read().decode('utf-8'))
            if is_gemini:
                raw = res['candidates'][0]['content']['parts'][0].get('text', '').strip()
            else:
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
                    for k_map, val in parsed.items():
                        if str(idx+1) in k_map:
                            item_data = val
                            break

                ctx_val = ''
                mean_val = ''
                exp_val = ''
                if isinstance(item_data, dict):
                    ctx_val = sanitize_text(str(item_data.get('context') or ''))
                    mean_val = sanitize_text(str(item_data.get('meaning') or item_data.get('explanation') or ''))
                    if ctx_val and mean_val:
                        exp_val = f"{ctx_val}\n\n{mean_val}"
                    else:
                        exp_val = ctx_val or mean_val
                elif isinstance(item_data, str):
                    exp_val = sanitize_text(item_data)
                    parts = [p.strip() for p in exp_val.split('\n\n') if p.strip()]
                    if len(parts) > 1:
                        ctx_val = parts[0]
                        mean_val = parts[1]
                    else:
                        mean_val = exp_val

                bad_indicators = ['<think', 'thinking process', 'user input', 'expert scholar', '**role', '**task', 'strict rules']
                if any(b in exp_val.lower() for b in bad_indicators):
                    exp_val = ''

                if exp_val and ctx_val and mean_val and len(ctx_val.split()) >= 4 and len(mean_val.split()) >= 5:
                    results.append((v_item, (exp_val, ctx_val, mean_val)))

            if len(results) >= max(1, len(verse_batch) // 2):
                return results, None
    except urllib.error.HTTPError as e:
        raw_err = e.read().decode('utf-8', errors='ignore')
        if e.code in (400, 401, 403) or 'NOT_FOUND' in raw_err:
            ch['disabled'] = True
            return [], f"HTTP {e.code} ({ch['label']}): disabled permanently"

        retry_after = 15.0
        if is_gemini:
            retry_after = 28.0
            try:
                err_data = json.loads(raw_err)
                for item in err_data.get('error', {}).get('details', []):
                    if 'retryDelay' in item:
                        rd = str(item['retryDelay']).rstrip('s')
                        retry_after = max(5.0, float(rd) + 2.0)
                        break
            except Exception:
                pass
        elif 'retry-after' in e.headers:
            try:
                retry_after = max(5.0, float(e.headers['retry-after']))
            except Exception:
                pass
        m_retry = re.search(r'try again in (\d+(?:\.\d+)?s|\d+m\d+(?:\.\d+)?s)', raw_err)
        if m_retry:
            time_str = m_retry.group(1)
            try:
                if 'm' in time_str:
                    parts = time_str.split('m')
                    retry_after = float(parts[0]) * 60 + float(parts[1].rstrip('s'))
                else:
                    retry_after = float(time_str.rstrip('s'))
            except Exception:
                pass
        mark_channel_cooldown(ch_idx, retry_after)
        return [], f"HTTP {e.code} ({ch['label']}): cooldown {retry_after:.1f}s"
    except Exception as e:
        mark_channel_cooldown(ch_idx, 3.0)
        return [], str(e)

    return [], "Parse failed"

BATCH_SIZE = 4
WORKERS = 14

print("=" * 70)
print(f"  STARTING TURBO FEED EXPLANATIONS GENERATOR ({len(pending_queue):,} queued)")
print(f"  Concurrency: {WORKERS} parallel workers across {len(CHANNELS)} isolated rate-governed channels")
print("  Active Models: " + ", ".join(GEMINI_MODELS))
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

        batch_results = None
        for attempt in range(len(CHANNELS) + 2):
            if stop_requested:
                break
            ch_idx, ch = acquire_channel()
            if ch is None:
                break
            batch_results, err = call_ai_batch_channel(verse_batch, ch_idx, ch)
            if batch_results:
                break
            time.sleep(0.1)

        if not batch_results:
            task_queue.put(verse_batch)
            time.sleep(1.0)
            continue

        with results_lock:
            for v_item, res_item in batch_results:
                if isinstance(res_item, tuple):
                    exp_val, ctx_val, mean_val = res_item
                else:
                    exp_val = res_item
                    parts = [p.strip() for p in exp_val.split('\n\n') if p.strip()]
                    ctx_val = parts[0] if len(parts) > 1 else ''
                    mean_val = parts[1] if len(parts) > 1 else exp_val

                feed_k = v_item.get('feed_key') or v_item['key']
                alt_k = v_item.get('alt_key')

                entry = {
                    'explanation': exp_val,
                    'meaning': mean_val or exp_val,
                    'context': ctx_val or '',
                    'religion': v_item['religion'],
                    'book': v_item['book'],
                    'chapter': v_item['chapter'],
                    'verse': v_item['verse'],
                    'updated_at': int(time.time() * 1000)
                }

                rel_prefix = f"{v_item['religion'].lower().replace(' ', '_')}_"
                can_k = feed_k if feed_k.startswith(rel_prefix) else f"{rel_prefix}{feed_k}"
                explanations[can_k] = entry

                completed += 1

            t_now = time.time()
            recent_completed.append((t_now, len(batch_results)))
            # Keep sliding window of completed batches within last 60s
            while len(recent_completed) > 1 and (t_now - recent_completed[0][0]) > 60:
                recent_completed.pop(0)

            if len(recent_completed) >= 2:
                window_seconds = max(0.5, t_now - recent_completed[0][0])
                rolling_count = sum(c for _, c in recent_completed[1:])
                rate = (rolling_count / window_seconds) * 60.0
            else:
                elapsed_total = max(1.0, t_now - actual_gen_start)
                rate = (completed / elapsed_total) * 60.0

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

