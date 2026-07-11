with open("script_v14.js", "r", encoding="utf-8") as f:
    for idx, line in enumerate(f, 1):
        if "swipe" in line.lower() or "touch" in line.lower():
            if "function " in line or "const " in line or "let " in line or "addeventlistener" in line.lower():
                print(f"Line {idx}: {line.strip()}")
