import urllib.request
import json
import os
import sys

# Ensure UTF-8 output for Windows console
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

token = os.environ.get("HUGGINGFACEHUB_API_TOKEN")
if not token:
    print("HUGGINGFACEHUB_API_TOKEN not found in environment.")
    sys.exit(1)

headers = {
    "Authorization": f"Bearer {token}",
    "Content-Type": "application/json"
}
payload = {
    "inputs": "<|begin_of_text|><|start_header_id|>user<|end_header_id|>\n\nRank the peacefulness and inspiring quality of this verse: 'Peace be with you.' on a scale of 1 to 10. Output only a single number.<|eot_id|><|start_header_id|>assistant<|end_header_id|>\n\n",
    "parameters": {"max_new_tokens": 10}
}
url = "https://api-inference.huggingface.co/models/meta-llama/Meta-Llama-3-8B-Instruct"

req = urllib.request.Request(url, data=json.dumps(payload).encode("utf-8"), headers=headers)
try:
    with urllib.request.urlopen(req) as res:
        response_data = json.loads(res.read().decode("utf-8"))
        print("Response:", response_data)
except Exception as e:
    print("Error:", e)
