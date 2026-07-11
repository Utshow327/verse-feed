with open("script_v14.js", "r", encoding="utf-8") as f:
    for idx, line in enumerate(f, 1):
        if "const slots" in line or "let slots" in line or "slots =" in line:
            print(f"Line {idx}: {line.strip()}")
