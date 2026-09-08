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

total_done = len(explanations)
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
total_library = 161088
lib_pct = (total_done / total_library) * 100

bar_len = 24
filled = int(bar_len * feed_done // total_feed) if total_feed > 0 else 0
bar = '#' * filled + '-' * (bar_len - filled)

print("=" * 65)
print("             VERSE EXPLANATION PIPELINE STATUS")
print("=" * 65)
print(f"  Feed Progress:   [{bar}] {feed_pct:5.1f}%")
print(f"  Active Feed:     {feed_done:,} / {total_feed:,} verses explained")
print(f"  Total Library:   {total_done:,} / {total_library:,} verses completed ({lib_pct:4.2f}%)")
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
