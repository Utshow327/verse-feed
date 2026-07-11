import urllib.request
import json
import urllib.parse

query = 'subject:"relaxation" AND subject:"ambient" AND mediatype:"audio"'
url = f"https://archive.org/advancedsearch.php?q={urllib.parse.quote(query)}&fl[]=identifier&fl[]=title&rows=15&output=json"

try:
    with urllib.request.urlopen(url) as response:
        data = json.loads(response.read().decode("utf-8"))
        results = data.get("response", {}).get("docs", [])
        print("Found relaxing ambient items:")
        for r in results:
            print(f"- ID: {r['identifier']} | Title: {r.get('title', '')}")
except Exception as e:
    print("Error:", e)
