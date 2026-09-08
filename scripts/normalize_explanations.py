# scripts/normalize_explanations.py
import json
import os
import re

DATA_FILE = os.path.join('data', 'verse_explanations.json')
WWW_DATA_FILE = os.path.join('www', 'data', 'verse_explanations.json')

def normalize():
    if not os.path.exists(DATA_FILE):
        print("Data file not found:", DATA_FILE)
        return

    with open(DATA_FILE, 'r', encoding='utf-8') as f:
        data = json.load(f)

    print(f"Initial keys count: {len(data):,}")

    new_entries = {}
    for k, v in list(data.items()):
        if isinstance(v, str):
            v = {'meaning': v, 'text': v}
            data[k] = v
        elif isinstance(v, dict):
            if 'text' in v and ('meaning' not in v or not v['meaning']):
                v['meaning'] = v['text']
            elif 'meaning' in v and ('text' not in v or not v['text']):
                v['text'] = v['meaning']

        # Ensure Quran aliases
        # match patterns like islam_al_baqarah_2_15 or islam_quran_2_15 or quran_2_15
        m = re.match(r'^(?:islam_)?(?:quran|al_[a-z]+)_(\d+)_(\d+)$', k)
        if m:
            ch, ver = m.group(1), m.group(2)
            aliases = [
                f"islam_quran_{ch}_{ver}",
                f"quran_{ch}_{ver}",
                f"islam_{ch}_{ver}"
            ]
            for a in aliases:
                if a not in data and a not in new_entries:
                    new_entries[a] = v

    data.update(new_entries)
    print(f"Added {len(new_entries):,} alias keys.")
    print(f"Total keys now: {len(data):,}")

    with open(DATA_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    with open(WWW_DATA_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    print("Normalized and synchronized to both data/ and www/data/ successfully!")

if __name__ == '__main__':
    normalize()
