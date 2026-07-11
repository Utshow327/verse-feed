import os
import sys

# Ensure UTF-8 output for Windows console
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

brain_dir = "C:/Users/ASUS/.gemini/antigravity/brain"

print("Searching all brain logs for Gemini API calls...")
found = False
for root, dirs, files in os.walk(brain_dir):
    for file in files:
        if file.endswith((".py", ".jsonl", ".txt", ".md")):
            path = os.path.join(root, file)
            try:
                with open(path, "r", encoding="utf-8", errors="ignore") as f:
                    content = f.read()
                    if "generativelanguage" in content or "gemini-2.5-flash" in content or "api.google.com" in content:
                        print(f"Found match in {path}")
                        # Print occurrences
                        for line in content.splitlines():
                            if any(x in line for x in ["generativelanguage", "gemini-2.5-flash", "googleapis.com/v1"]):
                                print(f"  Line: {line[:200]}")
                        found = True
            except Exception as e:
                pass

if not found:
    print("No matches found in past brain directories.")
