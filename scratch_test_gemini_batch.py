import urllib.request
import json
import sys

# Ensure UTF-8 output for Windows console
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

API_KEY = "AIzaSyCpATyVQNc5j11DWPvf3Etaen-k8KIx8Cc"
URL = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={API_KEY}"

verses = [
    {"id": "test_1", "text": "Blessed are the peacemakers, for they shall be called sons of God."},
    {"id": "test_2", "text": "These are the sons of Israel: Reuben, Simeon, Levi, Judah, Issachar, Zebulun."},
    {"id": "test_3", "text": "You shall not kill."},
    {"id": "test_4", "text": "And the length of the ark shall be three hundred cubits, and the breadth of it fifty cubits."},
    {"id": "test_5", "text": "The Lord is my shepherd; I shall not want. He maketh me to lie down in green pastures."}
]

prompt = f"""You are an expert in spiritual and religious texts.
Rate the peacefulness, wisdom, and inspiring quality of the following verses on a scale of 1 to 10 (10 is extremely peaceful/wise/inspiring, 1 is dry administrative details, genealogy lists, or violent context).
Rate them based on semantic meaning (e.g. "You shall not kill" is peaceful, so rate it high).

Input:
{json.dumps(verses, indent=2)}

Respond ONLY with a flat JSON object mapping the ID to the integer rank, like this:
{{
  "test_1": 9,
  ...
}}"""

payload = {
    "contents": [{"parts": [{"text": prompt}]}],
    "generationConfig": {"responseMimeType": "application/json"}
}

req = urllib.request.Request(URL, data=json.dumps(payload).encode("utf-8"), headers={"Content-Type": "application/json"})
try:
    with urllib.request.urlopen(req) as res:
        response_data = json.loads(res.read().decode("utf-8"))
        text_resp = response_data['candidates'][0]['content']['parts'][0]['text'].strip()
        print("Response JSON:")
        print(text_resp)
except Exception as e:
    print("Error:", e)
