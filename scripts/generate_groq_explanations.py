# scripts/generate_groq_explanations.py
import os
import sys
import json
import time
import re
import argparse
import urllib.request
from datetime import timedelta
from concurrent.futures import ThreadPoolExecutor, as_completed

# Ensure UTF-8 output on Windows consoles
try:
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

DEFAULT_KEY = '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'
GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
DEFAULT_MODEL = 'groq/compound'

OUTPUT_FILE = os.path.join('data', 'verse_explanations.json')
WWW_OUTPUT_FILE = os.path.join('www', 'data', 'verse_explanations.json')

os.makedirs('data', exist_ok=True)
os.makedirs(os.path.join('www', 'data'), exist_ok=True)

parser = argparse.ArgumentParser(description='Fast Verse Explanation Generator via Groq Cloud AI')
parser.add_argument('--limit', type=int, default=0, help='Max verses to generate in this batch (e.g. 4135 for feed, or 10000). 0 = unlimited.')
parser.add_argument('--key', type=str, default='', help='Groq API Key (defaults to saved key)')
parser.add_argument('--model', type=str, default=DEFAULT_MODEL, help='Groq model to use (default: groq/compound)')
parser.add_argument('--workers', type=int, default=4, help='Number of parallel request threads (default: 4)')
args = parser.parse_args()

api_key = args.key or os.environ.get('GROQ_API_KEY') or DEFAULT_KEY
batch_limit = args.limit
num_workers = args.workers
model_name = args.model

# Load existing explanations
explanations = {}
if os.path.exists(OUTPUT_FILE):
    try:
        with open(OUTPUT_FILE, 'r', encoding='utf-8') as f:
            explanations = json.load(f)
    except Exception as e:
        print('Error reading existing explanations:', e)

print(f'Found {len(explanations):,} existing explanations.')

# Index all scriptures across the app
verses_by_key = {}

def add_verse(rel, book, chap, ver, text):
    if not text or len(str(text).strip()) < 3:
        return
    rel_clean = str(rel).lower().replace(' ', '_')
    book_clean = str(book).lower().replace(' ', '_')
    chap_clean = str(chap).lower().replace(' ', '_')
    ver_clean = str(ver).lower().replace(' ', '_')
    key = f'{rel_clean}_{book_clean}_{chap_clean}_{ver_clean}'
    verses_by_key[key] = {
        'key': key,
        'religion': rel,
        'book': book,
        'chapter': str(chap),
        'verse': str(ver),
        'text': str(text).strip()
    }

print('Scanning all scriptures in data/ ...')

# 1. Quran
quran_file = os.path.join('data', 'quran_v2.json')
if os.path.exists(quran_file):
    try:
        with open(quran_file, 'r', encoding='utf-8') as f:
            for s in json.load(f):
                for v in s.get('verses', []):
                    add_verse('Islam', 'Quran', s.get('id'), v.get('id'), v.get('translation') or v.get('text'))
    except Exception as e:
        print('Error reading quran_v2.json:', e)

# 2. Hadiths
hadiths_file = os.path.join('data', 'hadiths_v2.json')
if os.path.exists(hadiths_file):
    try:
        with open(hadiths_file, 'r', encoding='utf-8') as f:
            for h in json.load(f):
                add_verse('Islam', h.get('source', ''), h.get('chapter_no', 1), h.get('hadith_no', 1), h.get('text_en', ''))
    except Exception as e:
        print('Error reading hadiths_v2.json:', e)

# 3. Bible
bible_file = os.path.join('data', 'bible.json')
if os.path.exists(bible_file):
    try:
        with open(bible_file, 'r', encoding='utf-8') as f:
            bible = json.load(f)
            for b, chs in bible.items():
                if isinstance(chs, dict):
                    for c, vs in chs.items():
                        if isinstance(vs, dict):
                            for v, txt in vs.items():
                                add_verse('Christianity', b, c, v, txt)
    except Exception as e:
        print('Error reading bible.json:', e)

# 4. Gita
gita_file = os.path.join('data', 'gita.json')
if os.path.exists(gita_file):
    try:
        with open(gita_file, 'r', encoding='utf-8') as f:
            for g in json.load(f):
                if g.get('lang', '').lower() == 'english':
                    c = g.get('chapterNumber') or g.get('chapter') or 1
                    v = g.get('verseNumber') or g.get('verse_id') or 1
                    txt = g.get('description') or g.get('meaning') or g.get('text')
                    add_verse('Hinduism', 'Bhagavad Gita', c, v, txt)
    except Exception as e:
        print('Error reading gita.json:', e)

# 5. Hindu Books (Ramayana, Vedas, Upanishads, Mahabharata)
hb_file = os.path.join('data', 'hindu_books.json')
if os.path.exists(hb_file):
    try:
        with open(hb_file, 'r', encoding='utf-8') as f:
            hb = json.load(f)
            for b, chs in hb.items():
                if isinstance(chs, dict):
                    for c, vs in chs.items():
                        if isinstance(vs, dict):
                            for v, txt in vs.items():
                                add_verse('Hinduism', b, c, v, txt)
    except Exception as e:
        print('Error reading hindu_books.json:', e)

# 6. Sefaria (Judaism)
sefaria_file = os.path.join('data', 'sefaria.json')
if os.path.exists(sefaria_file):
    try:
        with open(sefaria_file, 'r', encoding='utf-8') as f:
            for item in json.load(f).get('verses', []):
                add_verse('Judaism', item.get('book', ''), item.get('chapter', ''), item.get('verse', ''), item.get('text', ''))
    except Exception as e:
        print('Error reading sefaria.json:', e)

# 7. Gurbani (Sikhism)
gurbani_file = os.path.join('data', 'gurbani.json')
if os.path.exists(gurbani_file):
    try:
        with open(gurbani_file, 'r', encoding='utf-8') as f:
            g = json.load(f)
            for bk in g.get('books', []):
                bname = bk.get('name', 'Guru Granth Sahib')
                for c, vs in bk.get('content', {}).items():
                    if isinstance(vs, dict):
                        for v, txt in vs.items():
                            add_verse('Sikhism', bname, c, v, txt)
    except Exception as e:
        print('Error reading gurbani.json:', e)

# 8. Buddhism
buddhism_file = os.path.join('data', 'buddhism.json')
if os.path.exists(buddhism_file):
    try:
        with open(buddhism_file, 'r', encoding='utf-8') as f:
            bud = json.load(f)
            books = bud.get('books', [])
            if isinstance(books, list):
                for bk in books:
                    bname = bk.get('name', 'Dhammapada')
                    for c, vs in bk.get('content', {}).items():
                        if isinstance(vs, dict):
                            for v, txt in vs.items():
                                add_verse('Buddhism', bname, c, v, txt)
    except Exception as e:
        print('Error reading buddhism.json:', e)

# 9. Philosophy
philosophy_file = os.path.join('data', 'philosophy.json')
if os.path.exists(philosophy_file):
    try:
        with open(philosophy_file, 'r', encoding='utf-8') as f:
            phil = json.load(f)
            books = phil.get('books', [])
            if isinstance(books, list):
                for bk in books:
                    bname = bk.get('name', 'Philosophy')
                    for c, vs in bk.get('content', {}).items():
                        if isinstance(vs, dict):
                            for v, txt in vs.items():
                                add_verse('Philosophy', bname, c, v, txt)
    except Exception as e:
        print('Error reading philosophy.json:', e)

print(f'Total unique scripture verses indexed: {len(verses_by_key):,}')

# Order queue by Priority:
# Tier 1: Active feed rankings (Rank 100 -> 70)
# Tier 2: Master rankings (Rank 69 -> 0)
# Tier 3: Remaining verses
prioritized_keys = []
seen = set()

active_file = os.path.join('data', 'active_rankings.json')
if os.path.exists(active_file):
    try:
        with open(active_file, 'r', encoding='utf-8') as f:
            active = json.load(f)
            sorted_active = sorted(active.items(), key=lambda x: x[1], reverse=True)
            for k, _ in sorted_active:
                if k in verses_by_key and k not in seen:
                    prioritized_keys.append(k)
                    seen.add(k)
    except Exception as e:
        print('Warning reading active_rankings.json:', e)

rankings_file = os.path.join('data', 'rankings.json')
if os.path.exists(rankings_file):
    try:
        with open(rankings_file, 'r', encoding='utf-8') as f:
            rankings = json.load(f)
            sorted_rankings = sorted(rankings.items(), key=lambda x: x[1], reverse=True)
            for k, _ in sorted_rankings:
                if k in verses_by_key and k not in seen:
                    prioritized_keys.append(k)
                    seen.add(k)
    except Exception as e:
        print('Warning reading rankings.json:', e)

for k in verses_by_key:
    if k not in seen:
        prioritized_keys.append(k)
        seen.add(k)

pending = [verses_by_key[k] for k in prioritized_keys if k not in explanations]

if batch_limit > 0:
    pending = pending[:batch_limit]

print(f'\nQueue prepared:')
print(f'- Total indexed in app: {len(verses_by_key):,}')
print(f'- Already completed: {len(explanations):,}')
print(f'- To generate in this batch: {len(pending):,}')

if not pending:
    print('All specified verses already have explanations!')
    sys.exit(0)

def save_progress():
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
        print(f'\nError saving progress: {e}')

def call_groq(verse_item):
    verse_ref = f"{verse_item['religion']} - {verse_item['book']} {verse_item['chapter']}:{verse_item['verse']}"
    verse_text = verse_item['text'][:280]

    prompt = (
        f"Explain this spiritual verse simply in 2 short spaced paragraphs without academic jargon:\n"
        f"Verse: \"{verse_text}\" ({verse_ref})\n\n"
        f"Strict rules:\n"
        f"- Never use emojis.\n"
        f"- Put a blank line between the 2 paragraphs.\n"
        f"- Explain the practical life lesson for everyday peace.\n"
        f"- Keep it punchy, compassionate, and under 45 words total."
    )

    payload = {
        'model': model_name,
        'messages': [{'role': 'user', 'content': prompt}],
        'max_tokens': 120,
        'temperature': 0.5
    }
    data = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(GROQ_URL, data=data, headers={
        'Authorization': f'Bearer {api_key}',
        'Content-Type': 'application/json',
        'User-Agent': 'ReligionApp/1.0'
    })

    for attempt in range(5):
        try:
            with urllib.request.urlopen(req, timeout=12) as resp:
                res = json.loads(resp.read().decode('utf-8'))
                raw = res['choices'][0]['message'].get('content', '').strip()
                cleaned = re.sub(r'^[#*>\s]+', '', raw).strip()
                return verse_item['key'], cleaned, verse_ref, None
        except Exception as e:
            err_str = str(e)
            if hasattr(e, 'read'):
                try:
                    err_body = e.read().decode('utf-8', errors='ignore')
                    err_str += f" | {err_body}"
                except Exception:
                    pass
            
            # Rate limit handling (HTTP 429)
            if '429' in err_str:
                sleep_time = 3 + attempt * 2
                time.sleep(sleep_time)
                continue
            
            time.sleep(1.5)

    return verse_item['key'], None, verse_ref, err_str

print('=' * 75)
print(f'  STARTING ULTRA-FAST GROQ CLOUD GENERATOR ({num_workers} parallel workers)')
print('  Auto-saves continuously. Press Ctrl+C anytime to pause.')
print('=' * 75)

start_time = time.time()
completed_this_session = 0
total_target = len(pending)

try:
    with ThreadPoolExecutor(max_workers=num_workers) as executor:
        idx = 0
        chunk_size = num_workers * 2
        
        while idx < len(pending):
            chunk = pending[idx:idx + chunk_size]
            idx += chunk_size
            
            futures = [executor.submit(call_groq, item) for item in chunk]
            for fut in as_completed(futures):
                vkey, explanation, vref, err = fut.result()
                if explanation:
                    explanations[vkey] = {
                        'text': explanation,
                        'source': 'groq_ai',
                        'updated_at': int(time.time() * 1000)
                    }
                    completed_this_session += 1
                
                # Auto-save every 5 verses
                if completed_this_session % 5 == 0:
                    save_progress()

                elapsed = time.time() - start_time
                speed = completed_this_session / elapsed if elapsed > 0 else 0
                remaining = total_target - completed_this_session
                eta_seconds = remaining / speed if speed > 0 else 0

                elapsed_str = str(timedelta(seconds=int(elapsed)))
                eta_str = str(timedelta(seconds=int(eta_seconds)))
                pct = (completed_this_session / total_target) * 100

                bar_len = 20
                filled = int(bar_len * completed_this_session // total_target)
                bar = '#' * filled + '-' * (bar_len - filled)

                ref_short = vref if len(vref) <= 28 else vref[:25] + '...'
                status_line = f'\r[{bar}] {pct:5.2f}% ({completed_this_session:,}/{total_target:,}) | {speed*60:.1f} v/min | Elapsed: {elapsed_str} | ETA: {eta_str} | {ref_short:<28}'
                sys.stdout.write(status_line)
                sys.stdout.flush()
                
            time.sleep(0.15)

except KeyboardInterrupt:
    print('\n\n[PAUSED] Process paused by user. Saving all progress...')
finally:
    save_progress()
    total_elapsed = time.time() - start_time
    print(f'\n\n[SAVED] Progress saved to {OUTPUT_FILE} and {WWW_OUTPUT_FILE}.')
    print(f'Completed this run: {completed_this_session:,} verses in {total_elapsed/60:.1f} minutes.')
    print(f'Total verses with explanations in app: {len(explanations):,}')
