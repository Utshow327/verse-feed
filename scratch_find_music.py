with open("index.html", "r", encoding="utf-8") as f:
    for idx, line in enumerate(f, 1):
        if "audio" in line.lower() or "music" in line.lower() or "mp3" in line.lower():
            print(f"index.html Line {idx}: {line.strip()}")

with open("script_v14.js", "r", encoding="utf-8") as f:
    for idx, line in enumerate(f, 1):
        if "audio" in line.lower() or "music" in line.lower() or "mp3" in line.lower():
            if idx < 500 or idx > 1500: # just sample edges
                print(f"script_v14.js Line {idx}: {line.strip()}")
