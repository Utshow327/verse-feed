# scripts/generate_local_gguf.py
import os
import sys
import json
import time
import re
from datetime import timedelta

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

import argparse
parser = argparse.ArgumentParser(description='Local GGUF Explanations Generator')
parser.add_argument('--threads', type=int, default=6, help='Number of CPU threads')
parser.add_argument('--max-count', type=int, default=0, help='Max verses to generate (0 = unlimited)')
parser.add_argument('--reverse', action='store_true', default=True, help='Process pending queue in reverse order')
cli_args = parser.parse_args()

MODEL_PATH = 'qwen2.5-7b-instruct-q5_k_m.gguf'
if not os.path.exists(MODEL_PATH):
    print(f"ERROR: Model file {MODEL_PATH} not found!")
    sys.exit(1)

OUTPUT_FILE = os.path.join('data', 'verse_explanations.json')
WWW_OUTPUT_FILE = os.path.join('www', 'data', 'verse_explanations.json')

# 1. Load explanations
explanations = {}
if os.path.exists(OUTPUT_FILE):
    try:
        with open(OUTPUT_FILE, 'r', encoding='utf-8') as f:
            explanations = json.load(f)
    except Exception as e:
        print(f"Warning reading explanations: {e}")

print(f"Loaded {len(explanations):,} existing explanations.")

# 2. Index all verses
all_verses = {}
def clean_text(text):
    if not text: return ''
    text = re.sub(r'[{}[\]\@#*_+=~0-9]', '', str(text))
    text = re.sub(r'\s+', ' ', text).strip()
    return text

print("Indexing all scriptures across the app...")
for script_file, rel_name in [
    ('data/bible.json', 'Christianity'),
    ('data/quran_en.json', 'Islam'),
    ('data/hadiths.json', 'Islam'),
    ('data/buddhism.json', 'Buddhism'),
    ('data/gurbani.json', 'Sikhism'),
    ('data/sefaria.json', 'Judaism'),
    ('data/hindu_books.json', 'Hinduism'),
    ('data/gita.json', 'Hinduism')
]:
    if not os.path.exists(script_file):
        continue
    try:
        with open(script_file, 'r', encoding='utf-8') as f:
            content = json.load(f)
            # Generic verse extractor
            def walk(obj, path=[]):
                if isinstance(obj, dict):
                    for k, v in obj.items():
                        walk(v, path + [str(k)])
                elif isinstance(obj, str) and len(obj.strip()) > 5:
                    if len(path) >= 2:
                        bk = path[0]
                        ch = path[1] if len(path) > 2 else '1'
                        vr = path[2] if len(path) > 2 else path[1]
                        vid = f"{rel_name}_{bk}_{ch}_{vr}".lower().replace(' ', '_')
                        if vid not in all_verses:
                            all_verses[vid] = {
                                'key': vid,
                                'religion': rel_name,
                                'book': bk,
                                'chapter': str(ch),
                                'verse': str(vr),
                                'text': clean_text(obj)
                            }
            walk(content)
    except Exception:
        pass

print(f"Total scriptures indexed: {len(all_verses):,}")

def is_done(key):
    if not key: return False
    entry = explanations.get(key) or explanations.get(key.lower())
    if not entry or not isinstance(entry, dict): return False
    exp = str(entry.get('explanation') or entry.get('meaning') or entry.get('text') or '').strip()
    return len(exp.split()) >= 6

# Build pending queue
pending_queue = []
for vkey, v_obj in all_verses.items():
    parts = vkey.split('_')
    alt_key = '_'.join(parts[1:])
    if is_done(vkey) or is_done(alt_key):
        continue
    if v_obj.get('text') and len(v_obj['text']) > 5:
        item_copy = dict(v_obj)
        item_copy['feed_key'] = vkey
        item_copy['alt_key'] = alt_key
        pending_queue.append(item_copy)

if cli_args.reverse:
    pending_queue.reverse()

print(f"Pending verses queued: {len(pending_queue):,} (Reverse: {cli_args.reverse})")

# 3. Load llama_cpp model
print(f"Loading local model {MODEL_PATH} ({cli_args.threads} threads)...")
from llama_cpp import Llama
t_load = time.time()
llm = Llama(
    model_path=MODEL_PATH,
    n_ctx=2048,
    n_threads=cli_args.threads,
    verbose=False
)
print(f"Local model loaded in {time.time() - t_load:.1f}s. Ready to generate 100% offline!")

def safe_save():
    temp_file = OUTPUT_FILE + '.tmp'
    www_temp = WWW_OUTPUT_FILE + '.tmp'
    try:
        data_copy = dict(explanations)
        with open(temp_file, 'w', encoding='utf-8') as f:
            json.dump(data_copy, f, indent=2, ensure_ascii=False)
        for _ in range(5):
            try:
                os.replace(temp_file, OUTPUT_FILE)
                break
            except OSError:
                time.sleep(0.2)

        with open(www_temp, 'w', encoding='utf-8') as f:
            json.dump(data_copy, f, indent=2, ensure_ascii=False)
        for _ in range(5):
            try:
                os.replace(www_temp, WWW_OUTPUT_FILE)
                break
            except OSError:
                time.sleep(0.2)
    except Exception as e:
        print(f"Save error: {e}")

completed = 0
t_start = time.time()
last_save = time.time()

for item in pending_queue:
    if cli_args.max_count > 0 and completed >= cli_args.max_count:
        print(f"\n[TARGET REACHED] Generated {completed} verses.")
        break

    v_text = item['text'][:200]
    v_ref = f"{item['religion']} - {item['book']} {item['chapter']}:{item['verse']}"

    prompt = (
        'Respond in valid JSON: {"context": "...", "meaning": "..."}\n'
        'Write exactly TWO distinct paragraphs:\n'
        '1. context: 1-2 simple sentences clearly explaining characters and background setting.\n'
        '2. meaning: 1-2 simple sentences clearly explaining the practical core life lesson or spiritual takeaway.\n\n'
        f'Verse: "{v_text}" ({v_ref})\n'
    )

    t0 = time.time()
    try:
        res = llm.create_chat_completion(
            messages=[
                {'role': 'system', 'content': 'You provide two-paragraph verse explanations. Output valid JSON.'},
                {'role': 'user', 'content': prompt}
            ],
            max_tokens=220,
            temperature=0.2
        )
        raw = res['choices'][0]['message']['content'].strip()
        raw_clean = re.sub(r'<think>.*?</think>', '', raw, flags=re.DOTALL).strip()
        raw_clean = re.sub(r'```(?:json)?', '', raw_clean).strip()
        
        ctx_val = ''
        mean_val = ''
        exp_val = ''
        m = re.search(r'\{[\s\S]*\}', raw_clean)
        if m:
            try:
                parsed = json.loads(m.group(0))
                ctx_val = str(parsed.get('context') or '').strip()
                mean_val = str(parsed.get('meaning') or '').strip()
            except Exception:
                pass
        
        if not (ctx_val and mean_val):
            parts = [p.strip() for p in raw_clean.split('\n\n') if p.strip()]
            if len(parts) >= 2:
                ctx_val = parts[0]
                mean_val = parts[1]
            else:
                mean_val = raw_clean

        if ctx_val and mean_val:
            exp_val = f"{ctx_val}\n\n{mean_val}"
        else:
            exp_val = ctx_val or mean_val

        if len(exp_val.split()) >= 6:
            feed_k = item.get('feed_key') or item['key']
            alt_k = item.get('alt_key')
            entry = {
                'explanation': exp_val,
                'meaning': mean_val or exp_val,
                'context': ctx_val or '',
                'religion': item['religion'],
                'book': item['book'],
                'chapter': item['chapter'],
                'verse': item['verse'],
                'updated_at': int(time.time() * 1000)
            }
            explanations[feed_k] = entry
            if alt_k and alt_k != feed_k:
                explanations[alt_k] = entry
            completed += 1

            dur = time.time() - t0
            tot_elapsed = time.time() - t_start
            rate = (completed / tot_elapsed) * 60 if tot_elapsed > 0 else 0
            print(f"[{completed:,}/{len(pending_queue):,}] {rate:.1f} v/min ({dur:.1f}s) | {item['book']} {item['chapter']}:{item['verse']}")
            sys.stdout.flush()

            if time.time() - last_save > 60:
                safe_save()
                last_save = time.time()
    except Exception as e:
        print(f"Error on verse: {e}")
        time.sleep(1)

safe_save()
print(f"\nFinished session! {completed} verses generated offline.")
