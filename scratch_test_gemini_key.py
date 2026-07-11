import urllib.request
import json
import sys

# Ensure UTF-8 output for Windows console
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

API_KEY = "AIzaSyCpATyVQNc5j11DWPvf3Etaen-k8KIx8Cc"
URL = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={API_KEY}"

payload = {
    "contents": [{"parts": [{"text": "Rank the peacefulness and inspiring quality of this verse: 'Peace be with you.' on a scale of 1 to 10. Output only a single number."}]}]
}

req = urllib.request.Request(URL, data=json.dumps(payload).encode("utf-8"), headers={"Content-Type": "application/json"})
try:
    with urllib.request.urlopen(req) as res:
        response_data = json.loads(res.read().decode("utf-8"))
        print("Status Code: 200")
        print("Response:", response_data['candidates'][0]['content']['parts'][0]['text'].strip())
except Exception as e:
    print("Error:", e)
