import json
import os
import re

DATA_DIR = r"c:\Users\ASUS\Desktop\religion app\data"

files = [
    "bible.json",
    "buddhism.json",
    "gita.json",
    "gurbani.json",
    "hadiths_v2.json",
    "hindu_books.json",
    "philosophy.json",
    "psychology.json",
    "quran_v2.json",
    "sefaria.json"
]

report = {}

def inspect_file(fname):
    fpath = os.path.join(DATA_DIR, fname)
    if not os.path.exists(fpath):
        return
    with open(fpath, "r", encoding="utf-8", errors="replace") as f:
        content = f.read()

    data = json.loads(content)
    file_issues = {
        "corrupted_replacement_char": 0, #  or \ufffd
        "html_tags": 0,
        "footnote_markers": 0, # [1], [a], etc.
        "editorial_brackets": 0, # [God], [i.e., ...]
        "double_semicolons_or_commas": 0, # ;; or ,,
        "glued_digits": 0, # 12And, 34before
        "empty_or_too_short": 0,
        "sample_fixes": []
    }

    def process_item(text, location):
        if not text or not isinstance(text, str):
            file_issues["empty_or_too_short"] += 1
            return
        
        t = text.strip()
        if len(t) < 10:
            file_issues["empty_or_too_short"] += 1

        if "" in t or "\ufffd" in t:
            file_issues["corrupted_replacement_char"] += 1
            if len(file_issues["sample_fixes"]) < 5:
                file_issues["sample_fixes"].append((location, "corrupted_char", t[:100]))

        if re.search(r"<[^>]+>", t):
            file_issues["html_tags"] += 1
            if len(file_issues["sample_fixes"]) < 5:
                file_issues["sample_fixes"].append((location, "html_tags", t[:100]))

        if re.search(r"\[\d+\]|\[[a-zA-Z]\]", t):
            file_issues["footnote_markers"] += 1
            if len(file_issues["sample_fixes"]) < 5:
                file_issues["sample_fixes"].append((location, "footnote_markers", t[:100]))

        if re.search(r"\[[^\]]+\]", t):
            file_issues["editorial_brackets"] += 1
            if len(file_issues["sample_fixes"]) < 5:
                file_issues["sample_fixes"].append((location, "editorial_brackets", t[:100]))

        if re.search(r";;|,,|(?<!\.)\.\.(?!\.)", t):
            file_issues["double_semicolons_or_commas"] += 1
            if len(file_issues["sample_fixes"]) < 5:
                file_issues["sample_fixes"].append((location, "double_punctuation", t[:100]))

        if re.search(r"\b\d+[a-zA-Z]{3,}\b|\b[a-zA-Z]{3,}\d+\b", t):
            file_issues["glued_digits"] += 1
            if len(file_issues["sample_fixes"]) < 5:
                file_issues["sample_fixes"].append((location, "glued_digits", t[:100]))

    if isinstance(data, list):
        for idx, it in enumerate(data):
            if isinstance(it, dict):
                t = it.get("text") or it.get("translation") or it.get("verse") or ""
                process_item(t, f"idx_{idx}")
            elif isinstance(it, str):
                process_item(it, f"idx_{idx}")
    elif isinstance(data, dict):
        if "verses" in data and isinstance(data["verses"], list):
            for idx, it in enumerate(data["verses"]):
                if isinstance(it, dict):
                    t = it.get("text") or it.get("translation") or it.get("verse") or ""
                    process_item(t, f"verses_{idx}")
        elif "books" in data and isinstance(data["books"], dict):
            for bname, chaps in data["books"].items():
                if isinstance(chaps, dict):
                    for cname, vlist in chaps.items():
                        if isinstance(vlist, list):
                            for idx, it in enumerate(vlist):
                                if isinstance(it, dict):
                                    t = it.get("text") or it.get("translation") or ""
                                    process_item(t, f"{bname}_{cname}_{idx}")
                                elif isinstance(it, str):
                                    process_item(it, f"{bname}_{cname}_{idx}")
        else:
            for k, v in data.items():
                if isinstance(v, list):
                    for idx, it in enumerate(v):
                        if isinstance(it, dict):
                            t = it.get("text") or it.get("translation") or ""
                            process_item(t, f"{k}_{idx}")
                        elif isinstance(it, str):
                            process_item(it, f"{k}_{idx}")

    report[fname] = file_issues

for fname, issues in report.items():
    print(f"\n==================== {fname} ====================")
    for k, v in issues.items():
        if k != "sample_fixes":
            if v > 0:
                print(f"  {k}: {v}")
    if issues["sample_fixes"]:
        print("  Sample dirty text:")
        for s in issues["sample_fixes"][:3]:
            print(f"    - [{s[1]} at {s[0]}]: {s[2]}")
