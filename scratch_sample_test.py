import os
import json
import re
import sys
from llama_cpp import Llama

# Ensure UTF-8 output for Windows console
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

# Sample verses representing a spectrum from highly peaceful/wisdom-focused to dry historical/violent
samples = [
    {
        "id": "christianity_sample_peace",
        "text": "Blessed are the peacemakers: for they shall be called the children of God. Blessed are they which are persecuted for righteousness' sake: for theirs is the kingdom of heaven."
    },
    {
        "id": "christianity_sample_lineage",
        "text": "And Arphaxad lived five and thirty years, and begat Salah: And Arphaxad lived after he begat Salah four hundred and three years, and begat sons and daughters."
    },
    {
        "id": "islam_sample_peace",
        "text": "The servants of the Most Compassionate are those who walk upon the earth humbly, and when the ignorant address them, they reply with words of peace."
    },
    {
        "id": "islam_sample_fighting",
        "text": "Slay them wherever you find them, and drive them out from whence they drove you out, for persecution is worse than slaughter."
    },
    {
        "id": "hinduism_sample_soul",
        "text": "The soul is never born, nor does it die; nor having once been, does it ever cease to be. It is unborn, eternal, permanent, and primeval."
    },
    {
        "id": "hinduism_sample_dry",
        "text": "After this, the king gave twenty cows, ten horses, three chariots, and one hundred gold coins to the priest who performed the sacrifice."
    },
    {
        "id": "philosophy_sample_stoic",
        "text": "Waste no more time arguing about what a good man should be. Be one."
    },
    {
        "id": "philosophy_sample_dry",
        "text": "The syllogism consists of propositions, propositions consist of words, words are symbols of notions."
    },
    {
        "id": "psychology_sample_positive",
        "text": "The curious paradox is that when I accept myself just as I am, then I can change. We cannot move away from what we are until we accept what we are."
    },
    {
        "id": "psychology_sample_neutral",
        "text": "In the second experiment, the subjects were placed in a dark room with a single point of light, and their eye movements were recorded at 50Hz."
    }
]

print("Loading local Qwen GGUF model...")
model_path = r"C:\Users\ASUS\Downloads\qwen2.5-7b-instruct-q5_k_m.gguf"
llm = Llama(
    model_path=model_path,
    n_ctx=4096,
    n_threads=6,
    verbose=False
)

# Constructing prompt for 1-100 rating
system_prompt = (
    "You are an objective AI critic that evaluates religious, philosophical, and psychological quotes "
    "on a strict 1 to 100 scale based on their universal positive value, wisdom, and peacefulness.\n\n"
    "CRITERIA:\n"
    "- 90 to 100: Exceptional universal spiritual wisdom, love, compassion, peace, kindness, mental serenity, and clean moral guidance.\n"
    "- 70 to 89: Good positive teachings, self-improvement, constructive psychology, or helpful moral guidance.\n"
    "- 40 to 69: Neutral, historical descriptions, factual observations, or dry philosophical analysis.\n"
    "- 20 to 39: Dry genealogical lists (names/begats), measurements, tribal details, or administrative records.\n"
    "- 1 to 19: Extremely harsh, violent commands, wartime instructions, politics of war, or hostile context.\n\n"
    "You must return a valid JSON object mapping each quote's ID to its integer rank between 1 and 100. Do not return any text other than the JSON object."
)

prompt_content = "Please rank these quotes:\n"
for s in samples:
    prompt_content += f"- ID: {s['id']}\n  Quote: \"{s['text']}\"\n\n"
prompt_content += "JSON output:"

prompt = f"<|im_start|>system\n{system_prompt}<|im_end|>\n<|im_start|>user\n{prompt_content}<|im_end|>\n<|im_start|>assistant\n"

print("Evaluating sample batch...")
res = llm(prompt, max_tokens=1000, temperature=0.0)
text_resp = res["choices"][0]["text"].strip()

# Clean code blocks if present
if text_resp.startswith("```"):
    text_resp = re.sub(r"^```(?:json)?\n", "", text_resp)
    text_resp = re.sub(r"\n```$", "", text_resp)
    text_resp = text_resp.strip()

print("\n--- RAW RESP ---")
print(text_resp)
print("--- END RAW ---\n")

try:
    ranks = json.loads(text_resp)
    print("SUCCESSFULLY PARSED RANKS:")
    for s in samples:
        r = ranks.get(s["id"], "N/A")
        print(f"[{s['id']}] Rank: {r}")
        print(f"  Text: {s['text']}")
        print()
except Exception as e:
    print("FAILED TO PARSE RESPONSE:", e)
