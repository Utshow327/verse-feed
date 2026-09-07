# scripts/generate_all_explanations.py
import os
import sys
import json
import time
from datetime import timedelta

try:
    from llama_cpp import Llama
except ImportError:
    print('ERROR: llama_cpp is not installed. Run: pip install llama-cpp-python')
    sys.exit(1)

MODEL_PATH = 'qwen2.5-7b-instruct-q5_k_m.gguf'
OUTPUT_FILE = os.path.join('data', 'verse_explanations.json')
WWW_OUTPUT_FILE = os.path.join('www', 'data', 'verse_explanations.json')

if not os.path.exists(MODEL_PATH):
    print(f'ERROR: Model file not found at {MODEL_PATH}')
    print('Make sure qwen2.5-7b-instruct-q5_k_m.gguf is in the root folder.')
    sys.exit(1)

os.makedirs('data', exist_ok=True)
os.makedirs(os.path.join('www', 'data'), exist_ok=True)

# Load existing explanations (crash-proof resume)
explanations = {}
if os.path.exists(OUTPUT_FILE):
    try:
        with open(OUTPUT_FILE, 'r', encoding='utf-8') as f:
            explanations = json.load(f)
        print(f'Resuming: {len(explanations)} verses already completed.')
    except Exception as e:
        print('Warning reading existing explanations:', e)

def save_progress():
    temp_file = OUTPUT_FILE + '.tmp'
    with open(temp_file, 'w', encoding='utf-8') as f:
        json.dump(explanations, f, indent=2, ensure_ascii=False)
    if os.path.exists(OUTPUT_FILE):
        os.replace(temp_file, OUTPUT_FILE)
    else:
        os.rename(temp_file, OUTPUT_FILE)
    try:
        with open(WWW_OUTPUT_FILE, 'w', encoding='utf-8') as f:
            json.dump(explanations, f, indent=2, ensure_ascii=False)
    except Exception:
        pass

print('Scanning scripture datasets in data/ ...')
all_items = []

def add_verse(rel, book, chap, ver, text):
    if not text or len(str(text).strip()) < 5:
        return
    rel_clean = str(rel).lower().replace(' ', '_')
    book_clean = str(book).lower().replace(' ', '_')
    chap_clean = str(chap).lower().replace(' ', '_')
    ver_clean = str(ver).lower().replace(' ', '_')
    key = f'{rel_clean}_{book_clean}_{chap_clean}_{ver_clean}'
    all_items.append({
        'key': key,
        'religion': rel,
        'book': book,
        'chapter': chap,
        'verse': ver,
        'text': str(text).strip()
    })

# 1. Quran
quran_file = os.path.join('data', 'quran_v2.json')
if os.path.exists(quran_file):
    try:
        with open(quran_file, 'r', encoding='utf-8') as f:
            q_data = json.load(f)
            for surah in q_data:
                s_num = surah.get('id')
                for v in surah.get('verses', []):
                    add_verse('Islam', 'Quran', s_num, v.get('id'), v.get('translation'))
    except Exception as e:
        print('Error reading quran_v2.json:', e)

# 2. Gita
gita_file = os.path.join('data', 'gita.json')
if os.path.exists(gita_file):
    try:
        with open(gita_file, 'r', encoding='utf-8') as f:
            g_data = json.load(f)
            for item in g_data:
                txt = item.get('description') or item.get('meaning') or item.get('text')
                c = item.get('chapterNumber') or item.get('chapter') or 1
                v = item.get('verseNumber') or item.get('verse_id') or 1
                add_verse('Hinduism', 'Bhagavad Gita', c, v, txt)
    except Exception as e:
        print('Error reading gita.json:', e)

# 3. Buddhism
buddhism_file = os.path.join('data', 'buddhism.json')
if os.path.exists(buddhism_file):
    try:
        with open(buddhism_file, 'r', encoding='utf-8') as f:
            b_data = json.load(f)
            if isinstance(b_data, list):
                for item in b_data:
                    add_verse('Buddhism', item.get('book', 'Dhammapada'), item.get('chapter', 1), item.get('verse', 1), item.get('text'))
    except Exception as e:
        print('Error reading buddhism.json:', e)

# 4. Bible
bible_file = os.path.join('data', 'bible.json')
if os.path.exists(bible_file):
    try:
        with open(bible_file, 'r', encoding='utf-8') as f:
            bi_data = json.load(f)
            items_list = bi_data if isinstance(bi_data, list) else bi_data.get('verses', [])
            for item in items_list:
                add_verse('Christianity', item.get('book', 'Bible'), item.get('chapter', 1), item.get('verse', 1), item.get('text'))
    except Exception as e:
        print('Error reading bible.json:', e)

print(f'Total verses scanned: {len(all_items)}')
pending = [v for v in all_items if v['key'] not in explanations]
print(f'Already completed: {len(all_items) - len(pending)} | Remaining to generate: {len(pending)}')

if not pending:
    print('All verses already have explanations!')
    sys.exit(0)

threads = max(1, (os.cpu_count() or 4) - 1)
print(f'Loading model {MODEL_PATH} ({threads} CPU threads)...')
t_start_model = time.time()
llm = Llama(model_path=MODEL_PATH, n_ctx=2048, n_threads=threads, verbose=False)
print(f'Model loaded in {time.time() - t_start_model:.2f}s!')

print('=' * 65)
print('GENERATING EXPLANATIONS - AUTO-SAVING ON EVERY VERSE')
print('You can press Ctrl+C anytime. Progress will NOT be lost.')
print('=' * 65)

start_time = time.time()
completed_this_session = 0
total_needed = len(all_items)
already_done = len(all_items) - len(pending)

try:
    for i, item in enumerate(pending):
        verse_ref = f"{item['religion']} - {item['book']} {item['chapter']}:{item['verse']}"
        verse_text = item['text'][:250]
        
        prompt = (
            f"Explain this spiritual verse simply in 2 short spaced-out paragraphs without academic jargon:\n"
            f"Verse: \"{verse_text}\" ({verse_ref})\n"
            f"Rules: Never use emojis. Put a blank line between thoughts. Keep it punchy, practical, and under 45 words."
        )
        
        res = llm.create_chat_completion(
            messages=[
                {"role": "system", "content": "You are a compassionate teacher writing short, punchy, spaced-out spiritual reflections for everyday readers. Never use emojis."},
                {"role": "user", "content": prompt}
            ],
            max_tokens=85,
            temperature=0.7
        )
        
        content = res['choices'][0]['message']['content'].strip()
        
        explanations[item['key']] = {
            'religion': item['religion'],
            'book': item['book'],
            'chapter': item['chapter'],
            'verse': item['verse'],
            'text': item['text'],
            'meaning': content
        }
        
        completed_this_session += 1
        current_done = already_done + completed_this_session
        
        # Save every 5 verses or first verse
        if completed_this_session % 5 == 0 or completed_this_session == 1:
            save_progress()
        
        elapsed = time.time() - start_time
        speed = completed_this_session / elapsed if elapsed > 0 else 0
        rem_items = len(pending) - completed_this_session
        eta_seconds = rem_items / speed if speed > 0 else 0
        
        elapsed_str = str(timedelta(seconds=int(elapsed)))
        eta_str = str(timedelta(seconds=int(eta_seconds)))
        pct = (current_done / total_needed) * 100
        
        bar_len = 20
        filled = int(bar_len * current_done // total_needed)
        bar = '█' * filled + '░' * (bar_len - filled)
        
        print(f'\r[{bar}] {pct:5.1f}% ({current_done}/{total_needed}) | {speed*60:.1f} v/min | Elapsed: {elapsed_str} | ETA: {eta_str} | {verse_ref}', end='', flush=True)

except KeyboardInterrupt:
    print('\n\nPaused by user! Saving all progress...')
finally:
    save_progress()
    print(f'\nProgress successfully saved to {OUTPUT_FILE} and {WWW_OUTPUT_FILE}.')
    print(f'Total verses with explanations: {len(explanations)}')
