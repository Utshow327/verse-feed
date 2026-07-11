import json
import os

data_dir = "C:/Users/ASUS/Desktop/religion app/data"

files = [
    ("bible.json", None),
    ("quran_v2.json", "surahs"),
    ("hadiths_v2.json", None),
    ("gita.json", None),
    ("hindu_books.json", None),
    ("sefaria.json", None),
    ("gurbani.json", None),
    ("buddhism.json", "books")
]

eligible_count = 0
total_count = 0

for file_name, key_name in files:
    path = os.path.join(data_dir, file_name)
    if not os.path.exists(path):
        continue
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
        
        # Simple recursive helper to extract string values (verses)
        def process_node(node):
            global eligible_count, total_count
            if isinstance(node, str):
                total_count += 1
                if 70 <= len(node) <= 180:
                    eligible_count += 1
            elif isinstance(node, dict):
                for val in node.values():
                    process_node(val)
            elif isinstance(node, list):
                for item in node:
                    process_node(item)
                    
        if key_name and isinstance(data, dict) and key_name in data:
            process_node(data[key_name])
        else:
            process_node(data)

print(f"Total verses: {total_count}")
print(f"Eligible verses (70-180 chars): {eligible_count}")
