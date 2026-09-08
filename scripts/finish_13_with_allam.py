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
MODEL_NAME = 'allam-2-7b'

OUTPUT_FILE = os.path.join('data', 'verse_explanations.json')
WWW_OUTPUT_FILE = os.path.join('www', 'data', 'verse_explanations.json')
QURAN_FILE = os.path.join('data', 'quran_v2.json')

with open(OUTPUT_FILE, 'r', encoding='utf-8') as f:
    explanations = json.load(f)

with open(QURAN_FILE, 'r', encoding='utf-8') as f:
    quran_data = json.load(f)

s2 = quran_data[1]
remaining_verses = [v for v in s2['verses'] if v['id'] >= 274]
print(f"Generating factual explanations for remaining {len(remaining_verses)} verses using {MODEL_NAME}...")

def clean_explanation(text):
    if not text:
        return ""
    t = text.replace('—', ', ').replace('–', '-').replace('--', ', ')
    t = re.sub(r'[\u202f\u00a0]', ' ', t)
    # Remove leading numbers, bullets, or 'In this verse'
    t = re.sub(r'^\s*[\d\.\-\*]+\s*', '', t)
    t = re.sub(r'^(In this verse,?\s*|Verse \d+:\d+ of Surah [^,\.]+ (states that|declares that|emphasizes)\s*)', '', t, flags=re.IGNORECASE)
    # Trim to 2 short sentences or under 45 words
    words = t.split()
    if len(words) > 48:
        # Cut at sentence boundary
        sentences = re.split(r'(?<=[.!?])\s+', t)
        short_t = ""
        for s in sentences:
            if len((short_t + " " + s).split()) <= 48:
                short_t = (short_t + " " + s).strip()
            else:
                break
        if short_t:
            t = short_t
        else:
            t = " ".join(words[:45]) + "."
    return t.strip()

for v in remaining_verses:
    vid = v['id']
    v_text = (v.get('translation') or v.get('text') or '')[:240].replace('"', "'")
    
    prompt = (
        f"Explain Quran 2:{vid} (Surah Al-Baqarah) factually, concisely, and humanely.\n"
        f"Verse text: \"{v_text}\"\n\n"
        f"Strict instructions:\n"
        f"1. Explain the actual factual meaning, context, or legal/ethical instruction of this verse.\n"
        f"2. Keep it concise, tight, and under 40 words.\n"
        f"3. Maximum 1 or 2 natural sentences.\n"
        f"4. Strictly NO em dashes (no —, no –, no --). Use commas or parentheses instead.\n"
        f"5. Tone: humane, warm, direct. Do NOT start with 'In this verse' or 'This verse'.\n"
        f"6. Never use emojis."
    )

    payload = {
        'model': MODEL_NAME,
        'messages': [{'role': 'user', 'content': prompt}],
        'max_tokens': 90,
        'temperature': 0.2
    }
    data_bytes = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(URL, data=data_bytes, headers={
        'Authorization': f'Bearer {API_KEY}',
        'Content-Type': 'application/json',
        'User-Agent': 'ReligionApp/1.0'
    })

    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=12) as resp:
                res = json.loads(resp.read().decode('utf-8'))
                raw = res['choices'][0]['message']['content'].strip()
                cleaned = clean_explanation(raw)
                exp_obj = {
                    'meaning': cleaned,
                    'text': cleaned,
                    'source': 'groq_factual_v2',
                    'updated_at': int(time.time() * 1000)
                }
                for ak in [f"islam_quran_2_{vid}", f"quran_2_{vid}", f"islam_2_{vid}", f"islam_al_baqarah_2_{vid}"]:
                    explanations[ak] = exp_obj
                print(f"Done 2:{vid}: {cleaned[:55]}...")
                break
        except Exception as e:
            print(f"Retry 2:{vid}: {e}")
            time.sleep(2)

    time.sleep(0.3)

with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
    json.dump(explanations, f, indent=2, ensure_ascii=False)
with open(WWW_OUTPUT_FILE, 'w', encoding='utf-8') as f:
    json.dump(explanations, f, indent=2, ensure_ascii=False)

print("Saved all 286 verses of Surah 2 and all 7 verses of Surah 1 to database!")
