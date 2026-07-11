import os
import sys

# Ensure UTF-8 output for Windows console
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

log_path = "C:/Users/ASUS/.gemini/antigravity/brain/81630e44-6c7b-4d36-bfc9-68715913cbed/.system_generated/logs/transcript.jsonl"
if not os.path.exists(log_path):
    print(f"Log path does not exist: {log_path}")
    sys.exit(1)

print("Searching previous transcript...")
with open(log_path, "r", encoding="utf-8") as f:
    for line in f:
        if "gemini" in line.lower() or "flash" in line.lower() or "generativeai" in line.lower():
            # Print first 200 chars of matching line to avoid huge output
            print(line[:250])
