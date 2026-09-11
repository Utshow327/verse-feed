# scripts/cloud_merge_and_push.py
import os
import sys
import json
import time
import subprocess

EXP_FILE = os.path.join("data", "verse_explanations.json")
WWW_EXP_FILE = os.path.join("www", "data", "verse_explanations.json")
EPICS_FILE = os.path.join("data", "explanations_epics.json")
WWW_EPICS_FILE = os.path.join("www", "data", "explanations_epics.json")

print("--- STARTING CLOUD MERGE AND PUSH ---")

# 1. Configure git user
subprocess.run(["git", "config", "--global", "user.name", "github-actions[bot]"], check=False)
subprocess.run(["git", "config", "--global", "user.email", "github-actions[bot]@users.noreply.github.com"], check=False)

# 2. Load local explanations
local_exp = {}
if os.path.exists(EXP_FILE):
    try:
        with open(EXP_FILE, "r", encoding="utf-8") as f:
            local_exp.update(json.load(f))
    except Exception as e:
        print(f"Error reading local explanations: {e}")

if os.path.exists(EPICS_FILE):
    try:
        with open(EPICS_FILE, "r", encoding="utf-8") as f:
            local_exp.update(json.load(f))
    except Exception as e:
        print(f"Error reading epics explanations: {e}")

print(f"Local explanations loaded: {len(local_exp):,}")

# 3. Fetch latest from origin main
subprocess.run(["git", "fetch", "origin", "main"], check=False)

# 4. Fetch remote versions and merge
for rfile in [EXP_FILE, EPICS_FILE]:
    try:
        proc = subprocess.run(["git", "show", f"origin/main:{rfile.replace(os.sep, '/')}"], capture_output=True, text=True, encoding="utf-8")
        if proc.returncode == 0 and proc.stdout.strip():
            remote_exp = json.loads(proc.stdout)
            print(f"Remote {rfile} fetched: {len(remote_exp):,}")
            merged_count = 0
            for k, v in remote_exp.items():
                if k not in local_exp:
                    local_exp[k] = v
                    merged_count += 1
            if merged_count > 0:
                print(f"Merged {merged_count:,} explanations from remote {rfile}.")
    except Exception as e:
        print(f"Note during remote merge of {rfile}: {e}")

# 4b. Canonical Deduplication & Splitting
def is_epic_entry(k, v):
    book = str(v.get('book', '')).lower() if isinstance(v, dict) else ''
    kl = str(k).lower()
    return 'mahabharata' in book or 'ramayana' in book or 'mahabharata' in kl or 'ramayana' in kl

religions = ['islam', 'christianity', 'judaism', 'hinduism', 'buddhism', 'sikhism', 'taoism', 'shinto', 'zoroastrianism', 'bahai', 'jainism', 'philosophy']
core_data = {}
epics_data = {}

for k, v in local_exp.items():
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

print(f"Total unified explanations: {len(core_data) + len(epics_data):,} (Core: {len(core_data):,}, Epics: {len(epics_data):,})")

# 5. Save merged databases atomically
def atomic_save(data_dict, file1, file2):
    tmp1 = file1 + ".tmp"
    tmp2 = file2 + ".tmp"
    with open(tmp1, "w", encoding="utf-8") as f:
        json.dump(data_dict, f, separators=(',', ':'), ensure_ascii=False)
    os.replace(tmp1, file1)
    with open(tmp2, "w", encoding="utf-8") as f:
        json.dump(data_dict, f, separators=(',', ':'), ensure_ascii=False)
    os.replace(tmp2, file2)

atomic_save(core_data, EXP_FILE, WWW_EXP_FILE)
if epics_data:
    atomic_save(epics_data, EPICS_FILE, WWW_EPICS_FILE)

# 6. Reset tree against origin/main so working directory is on top of latest remote
subprocess.run(["git", "reset", "--mixed", "origin/main"], check=False)

# 7. Add only the explanations files
files_to_add = [EXP_FILE, WWW_EXP_FILE]
if os.path.exists(EPICS_FILE):
    files_to_add.extend([EPICS_FILE, WWW_EPICS_FILE])
subprocess.run(["git", "add"] + files_to_add, check=False)

# 8. Check if there are staged changes
diff_check = subprocess.run(["git", "diff", "--cached", "--quiet"])
if diff_check.returncode == 0:
    print("No new explanations to commit. Everything is up to date.")
    sys.exit(0)

# 9. Commit
subprocess.run(["git", "commit", "-m", "Automated cloud explanation generation [skip ci]"], check=False)

# 10. Push with retry
pushed = False
for attempt in range(1, 6):
    print(f"Pushing to origin main (Attempt {attempt}/5)...")
    res = subprocess.run(["git", "push", "origin", "HEAD:main"])
    if res.returncode == 0:
        print(">>> SUCCESS: Explanations successfully pushed to GitHub main branch!")
        pushed = True
        break
    else:
        print("Push rejected. Fetching and rebasing...")
        subprocess.run(["git", "fetch", "origin", "main"])
        subprocess.run(["git", "rebase", "origin/main"])
        time.sleep(3)

if not pushed:
    print("ERROR: Failed to push to origin main after 5 attempts.")
    sys.exit(1)

