# scripts/generate_quran_ch1_ch2.py
import os
import sys
import json
import time
import re
import urllib.request
from datetime import timedelta
from concurrent.futures import ThreadPoolExecutor, as_completed

try:
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

DEFAULT_KEY = os.environ.get('GROQ_API_KEY', '')
GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
MODEL_NAME = 'allam-2-7b'

OUTPUT_FILE = os.path.join('data', 'verse_explanations.json')
WWW_OUTPUT_FILE = os.path.join('www', 'data', 'verse_explanations.json')
QURAN_FILE = os.path.join('data', 'quran_v2.json')

# Load existing explanations
explanations = {}
if os.path.exists(OUTPUT_FILE):
    try:
        with open(OUTPUT_FILE, 'r', encoding='utf-8') as f:
            explanations = json.load(f)
    except Exception as e:
        print('Warning loading existing explanations:', e)

print(f"Loaded {len(explanations):,} existing explanations.")

# Load Quran data
with open(QURAN_FILE, 'r', encoding='utf-8') as f:
    quran_data = json.load(f)

# Collect verses for Surah 1 and Surah 2
target_verses = []
for surah in quran_data:
    s_id = surah.get('id')
    if s_id in [1, 2]:
        s_name = surah.get('transliteration') or surah.get('englishName') or f"Surah {s_id}"
        clean_s_name = s_name.lower().replace(' ', '_').replace('-', '_').replace("'", "")
        for v in surah.get('verses', []):
            v_id = v.get('id')
            v_text = v.get('translation') or v.get('text') or ''
            
            # Key options to check
            primary_key = f"islam_quran_{s_id}_{v_id}"
            alias_keys = [
                f"islam_quran_{s_id}_{v_id}",
                f"islam_{clean_s_name}_{s_id}_{v_id}",
                f"quran_{s_id}_{v_id}"
            ]
            
            # Check if already has explanation
            already_done = any(k in explanations for k in alias_keys)
            
            target_verses.append({
                'surah_id': s_id,
                'surah_name': s_name,
                'verse_id': v_id,
                'text': v_text.strip(),
                'primary_key': primary_key,
                'alias_keys': alias_keys,
                'already_done': already_done
            })

pending = [v for v in target_verses if not v['already_done']]
print(f"Surah 1 & 2 Verses: {len(target_verses)} total.")
print(f"Already completed: {len(target_verses) - len(pending)} | Remaining to generate: {len(pending)}")

def save_all():
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
        print('Error saving:', e)

def generate_verse(v):
    ref = f"Quran {v['surah_id']}:{v['verse_id']} ({v['surah_name']})"
    prompt = (
        f"Explain this Quranic verse simply in 2 short spaced paragraphs without academic jargon:\n"
        f"Verse: \"{v['text'][:280]}\" ({ref})\n\n"
        f"Strict rules:\n"
        f"- Never use emojis.\n"
        f"- Put a blank line between the 2 paragraphs.\n"
        f"- Explain the spiritual meaning and a practical life lesson for everyday peace.\n"
        f"- Keep it punchy, compassionate, and under 45 words total."
    )
    
    payload = {
        'model': MODEL_NAME,
        'messages': [{'role': 'user', 'content': prompt}],
        'max_tokens': 120,
        'temperature': 0.4
    }
    data = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(GROQ_URL, data=data, headers={
        'Authorization': f'Bearer {DEFAULT_KEY}',
        'Content-Type': 'application/json',
        'User-Agent': 'ReligionApp/1.0'
    })
    
    for attempt in range(5):
        try:
            with urllib.request.urlopen(req, timeout=12) as resp:
                res = json.loads(resp.read().decode('utf-8'))
                raw = res['choices'][0]['message'].get('content', '').strip()
                cleaned = re.sub(r'^[#*>\s]+', '', raw).strip()
                return v, cleaned, None
        except Exception as e:
            err_str = str(e)
            if '429' in err_str:
                time.sleep(3 + attempt * 2)
                continue
            time.sleep(1.5)
            
    return v, None, err_str

if not pending:
    print("All verses in Surah 1 & 2 already have explanations!")
    sys.exit(0)

print('=' * 65)
print(f"Generating explanations for Surah 1 & 2 ({len(pending)} verses)...")
print('=' * 65)

t_start = time.time()
done_count = 0
total_needed = len(pending)

with ThreadPoolExecutor(max_workers=3) as executor:
    idx = 0
    chunk_size = 6
    while idx < len(pending):
        chunk = pending[idx:idx + chunk_size]
        idx += chunk_size
        
        futures = [executor.submit(generate_verse, item) for item in chunk]
        for fut in as_completed(futures):
            v, explanation, err = fut.result()
            if explanation:
                exp_obj = {
                    'text': explanation,
                    'source': 'groq_ai',
                    'updated_at': int(time.time() * 1000)
                }
                for k in v['alias_keys']:
                    explanations[k] = exp_obj
                done_count += 1
            
            if done_count % 5 == 0:
                save_all()
                
            elapsed = time.time() - t_start
            speed = done_count / elapsed if elapsed > 0 else 0
            eta = (total_needed - done_count) / speed if speed > 0 else 0
            
            bar_len = 20
            filled = int(bar_len * done_count // total_needed)
            bar = '#' * filled + '-' * (bar_len - filled)
            
            sys.stdout.write(f"\r[{bar}] {done_count}/{total_needed} ({done_count/total_needed*100:5.1f}%) | {speed*60:.1f} v/min | ETA: {str(timedelta(seconds=int(eta)))} | Quran {v['surah_id']}:{v['verse_id']}")
            sys.stdout.flush()
        
        time.sleep(0.2)

save_all()
total_time = time.time() - t_start
print(f"\n\n[DONE] Generated {done_count} verses in {total_time/60:.2f} minutes!")
print(f"Total explanations in database now: {len(explanations):,}")
