# scripts/generate_factual_ch1_ch2.py
import os
import sys
import json
import time
import re
import urllib.request

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

API_KEY = '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'
URL = 'https://api.groq.com/openai/v1/chat/completions'
MODEL_NAME = 'groq/compound-mini'

OUTPUT_FILE = os.path.join('data', 'verse_explanations.json')
WWW_OUTPUT_FILE = os.path.join('www', 'data', 'verse_explanations.json')
QURAN_FILE = os.path.join('data', 'quran_v2.json')

# Load existing explanations
explanations = {}
if os.path.exists(OUTPUT_FILE):
    with open(OUTPUT_FILE, 'r', encoding='utf-8') as f:
        explanations = json.load(f)

print(f"Current explanations in database: {len(explanations):,}")

# Load Quran data
with open(QURAN_FILE, 'r', encoding='utf-8') as f:
    quran_data = json.load(f)

# Collect all verses for Surah 1 and Surah 2
all_target_verses = []
for surah in quran_data:
    s_id = surah.get('id')
    if s_id in [1, 2]:
        s_name = surah.get('transliteration') or surah.get('englishName') or f"Surah {s_id}"
        clean_s_name = s_name.lower().replace(' ', '_').replace('-', '_').replace("'", "")
        for v in surah.get('verses', []):
            v_id = v.get('id')
            v_text = v.get('translation') or v.get('text') or ''
            all_target_verses.append({
                'surah_id': s_id,
                'verse_id': v_id,
                'surah_name': s_name,
                'clean_surah_name': clean_s_name,
                'text': v_text.strip(),
                'ref_key': f"{s_id}:{v_id}"
            })

print(f"Total verses to explain for Surah 1 and Surah 2: {len(all_target_verses)}")

def save_database():
    temp_file = OUTPUT_FILE + '.tmp'
    with open(temp_file, 'w', encoding='utf-8') as f:
        json.dump(explanations, f, indent=2, ensure_ascii=False)
    if os.path.exists(OUTPUT_FILE):
        os.replace(temp_file, OUTPUT_FILE)
    else:
        os.rename(temp_file, OUTPUT_FILE)
    with open(WWW_OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(explanations, f, indent=2, ensure_ascii=False)

def clean_explanation(text):
    if not text:
        return ""
    # Strip any em dashes, en dashes, double dashes
    t = text.replace('—', ', ').replace('–', '-').replace('--', ', ')
    # Normalize spaces
    t = re.sub(r'[\u202f\u00a0]', ' ', t)
    # Remove any stray bullets or numbering at start
    t = re.sub(r'^\s*[\d\.\-\*]+\s*', '', t).strip()
    return t

def process_batch(batch_verses):
    lines = []
    for item in batch_verses:
        clean_text = item['text'][:240].replace('"', "'")
        lines.append(f'{item["ref_key"]}: "{clean_text}"')
    
    verses_block = "\n".join(lines)
    prompt = (
        "Explain each of the following Quran verses factually, humanely, and concisely (around 25 to 40 words each).\n\n"
        "Strict rules:\n"
        "1. Focus on the factual meaning, key terms, and historical or theological context.\n"
        "2. Keep it concise, tight, and informative (under 45 words each).\n"
        "3. Strictly NO em dashes (never use —, –, or --). Use commas or parentheses instead.\n"
        "4. Tone must be humane, warm, and natural. Do NOT use generic filler like 'In this verse', 'A practical lesson', or 'we learn that'.\n"
        "5. Never use emojis.\n"
        "6. Return ONLY a valid JSON object where keys are the exact verse references (e.g. \"2:1\", \"2:2\") mapping to the explanation string.\n\n"
        f"Verses:\n{verses_block}"
    )

    payload = {
        'model': MODEL_NAME,
        'messages': [{'role': 'user', 'content': prompt}],
        'response_format': {'type': 'json_object'},
        'max_tokens': 1200,
        'temperature': 0.2
    }
    data_bytes = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(URL, data=data_bytes, headers={
        'Authorization': f'Bearer {API_KEY}',
        'Content-Type': 'application/json',
        'User-Agent': 'ReligionApp/1.0'
    })

    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=25) as resp:
                result = json.loads(resp.read().decode('utf-8'))
                raw_json = result['choices'][0]['message']['content']
                parsed = json.loads(raw_json)
                return parsed, None
        except Exception as e:
            err = str(e)
            if '429' in err:
                time.sleep(4 + attempt * 2)
                continue
            time.sleep(2)

    return {}, err

# Split into batches of 10
BATCH_SIZE = 10
batches = [all_target_verses[i:i + BATCH_SIZE] for i in range(0, len(all_target_verses), BATCH_SIZE)]
print(f"Total batches to process: {len(batches)}")

t0 = time.time()
success_count = 0

for b_idx, batch in enumerate(batches, 1):
    batch_keys = [item['ref_key'] for item in batch]
    print(f"[{b_idx}/{len(batches)}] Generating {batch_keys[0]} to {batch_keys[-1]}...", end=" ", flush=True)
    
    parsed, err = process_batch(batch)
    if not parsed:
        print(f"FAILED ({err})")
        continue

    # Store into explanations with all aliases
    for item in batch:
        ref = item['ref_key']
        # Try both "2:1" and variations
        exp_text = parsed.get(ref) or parsed.get(f"Quran {ref}") or parsed.get(ref.replace(':', '.'))
        if exp_text:
            cleaned = clean_explanation(exp_text)
            exp_obj = {
                'meaning': cleaned,
                'text': cleaned,
                'source': 'groq_factual_v2',
                'updated_at': int(time.time() * 1000)
            }
            s_id = item['surah_id']
            v_id = item['verse_id']
            clean_s_name = item['clean_surah_name']
            
            alias_keys = [
                f"islam_quran_{s_id}_{v_id}",
                f"quran_{s_id}_{v_id}",
                f"islam_{s_id}_{v_id}",
                f"islam_{clean_s_name}_{s_id}_{v_id}"
            ]
            for ak in alias_keys:
                explanations[ak] = exp_obj
            success_count += 1

    print(f"Done ({len(parsed)} verses)")
    save_database()
    time.sleep(0.4)

total_elapsed = time.time() - t0
print("=" * 60)
print(f"Completed {success_count} / {len(all_target_verses)} verses in {total_elapsed:.1f}s!")
print(f"Total database entries now: {len(explanations):,}")
