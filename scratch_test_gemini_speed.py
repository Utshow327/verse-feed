import urllib.request
import json
import time
import sys

# Ensure UTF-8 output for Windows console
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

API_KEY = "AIzaSyCpATyVQNc5j11DWPvf3Etaen-k8KIx8Cc"
URL = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={API_KEY}"

verses = [
    {"id": f"t_{i}", "text": "This is a beautiful and inspiring verse about peace and love."}
    for i in range(40)
]

prompt = f"""You are an expert in spiritual and religious texts.
Rate the peacefulness, wisdom, and inspiring quality of the following verses on a scale of 1 to 10.
Input:
{json.dumps(verses, indent=2)}
Respond ONLY with a flat JSON object mapping the ID to the integer rank."""

payload = {
    "contents": [{"parts": [{"text": prompt}]}],
    "generationConfig": {"responseMimeType": "application/json"}
}

start_time = time.time()
req = urllib.request.Request(URL, data=json.dumps(payload).encode("utf-8"), headers={"Content-Type": "application/json"})
try:
    with urllib.request.urlopen(req, timeout=60) as res:
        response_data = json.loads(res.read().decode("utf-8"))
        print("Success! Time taken:", time.time() - start_time)
except Exception as e:
    print("Error:", e, "Time taken:", time.time() - start_time)
