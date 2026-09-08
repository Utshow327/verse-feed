# scripts/cloud_merge_and_push.py
import os
import sys
import json
import time
import subprocess

EXP_FILE = os.path.join("data", "verse_explanations.json")
WWW_EXP_FILE = os.path.join("www", "data", "verse_explanations.json")

print("--- STARTING CLOUD MERGE AND PUSH ---")

# 1. Configure git user
subprocess.run(["git", "config", "--global", "user.name", "github-actions[bot]"], check=False)
subprocess.run(["git", "config", "--global", "user.email", "github-actions[bot]@users.noreply.github.com"], check=False)

# 2. Load local explanations
local_exp = {}
if os.path.exists(EXP_FILE):
    try:
        with open(EXP_FILE, "r", encoding="utf-8") as f:
            local_exp = json.load(f)
    except Exception as e:
        print(f"Error reading local explanations: {e}")

print(f"Local explanations loaded: {len(local_exp):,}")

# 3. Fetch latest from origin main
subprocess.run(["git", "fetch", "origin", "main"], check=False)

# 4. Fetch remote version and merge
try:
    proc = subprocess.run(["git", "show", "origin/main:data/verse_explanations.json"], capture_output=True, text=True, encoding="utf-8")
    if proc.returncode == 0 and proc.stdout.strip():
        remote_exp = json.loads(proc.stdout)
        print(f"Remote explanations fetched: {len(remote_exp):,}")
        merged_count = 0
        for k, v in remote_exp.items():
            if k not in local_exp:
                local_exp[k] = v
                merged_count += 1
        if merged_count > 0:
            print(f"Merged {merged_count:,} explanations from remote origin/main.")
except Exception as e:
    print(f"Note during remote merge: {e}")

# 5. Save merged databases
with open(EXP_FILE, "w", encoding="utf-8") as f:
    json.dump(local_exp, f, indent=2, ensure_ascii=False)
with open(WWW_EXP_FILE, "w", encoding="utf-8") as f:
    json.dump(local_exp, f, indent=2, ensure_ascii=False)

print(f"Total merged explanations: {len(local_exp):,}")

# 6. Reset tree against origin/main so working directory is on top of latest remote
subprocess.run(["git", "reset", "--mixed", "origin/main"], check=False)

# 7. Add only the explanations files
subprocess.run(["git", "add", EXP_FILE, WWW_EXP_FILE], check=False)

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

