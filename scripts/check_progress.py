# scripts/check_progress.py
import os
import sys
import json
import time

try:
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

if os.environ.get('GITHUB_ACTIONS') != 'true' and os.path.exists('.git'):
    try:
        import subprocess
        subprocess.run(['git', 'pull', '--quiet', 'origin', 'main'], timeout=8)
    except Exception:
        pass

EXP_FILE = os.path.join('data', 'verse_explanations.json')
ACTIVE_FILE = os.path.join('data', 'active_rankings.json')

if not os.path.exists(EXP_FILE):
    print("No explanations generated yet.")
    sys.exit(0)

try:
    with open(EXP_FILE, 'r', encoding='utf-8') as f:
        explanations = json.load(f)
except Exception as e:
    print(f"Error reading explanations: {e}")
    sys.exit(1)

# Count unique verses explained
unique_explained = set()
for k, v in explanations.items():
    if isinstance(v, dict):
        rel = v.get('religion', '')
        bk = v.get('book', '')
        ch = str(v.get('chapter', ''))
        vs = str(v.get('verse', ''))
        if rel and bk:
            unique_explained.add((rel.lower(), bk.lower(), ch, vs))
        else:
            unique_explained.add(k)
    else:
        unique_explained.add(k)

total_unique_done = len(unique_explained)
feed_done = 0
total_feed = 4135

if os.path.exists(ACTIVE_FILE):
    try:
        with open(ACTIVE_FILE, 'r', encoding='utf-8') as f:
            active = json.load(f)
            total_feed = len(active)
            feed_done = sum(1 for k in active if k in explanations)
    except Exception:
        pass

feed_pct = (feed_done / total_feed) * 100 if total_feed > 0 else 0

# True library size across all indexed world scriptures
TOTAL_SCRIPTURES = 186000  # ~186k unique verses across all world religions
total_remaining = max(0, TOTAL_SCRIPTURES - total_unique_done)
lib_pct = (total_unique_done / TOTAL_SCRIPTURES) * 100

bar_len = 24
filled = int(bar_len * feed_done // total_feed) if total_feed > 0 else 0
bar = '#' * filled + '-' * (bar_len - filled)

print("=" * 65)
print("             VERSE EXPLANATION PIPELINE STATUS")
print("=" * 65)
print(f"  Feed Verses (Priority 1): [{bar}] {feed_pct:5.1f}%")
print(f"    Completed:  {feed_done:,} / {total_feed:,} feed verses")
print(f"    Remaining:  {max(0, total_feed - feed_done):,} feed verses")
print("  ---------------------------------------------------------------")
print(f"  Total Unique Library:     {total_unique_done:,} / {TOTAL_SCRIPTURES:,} ({lib_pct:4.1f}%)")
print(f"    Unique verses done:     {total_unique_done:,}")
print(f"    Unique verses left:     {total_remaining:,}")
print(f"    Raw dictionary keys:    {len(explanations):,} (dual-indexed)")
print("=" * 65)

# Show last 2 verses completed
keys = list(explanations.keys())[-2:]
print("  LATEST EXPLANATIONS GENERATED:")
for k in keys:
    val = explanations[k]
    text = (val.get('meaning') or val.get('text', '')) if isinstance(val, dict) else str(val)
    first_line = text.split('\n')[0] if text else ''
    if len(first_line) > 70:
        first_line = first_line[:67] + '...'
    print(f"  * [{k}]:")
    print(f"    \"{first_line}\"")

print("=" * 65)
