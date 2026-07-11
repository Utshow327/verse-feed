import time
import sys
from llama_cpp import Llama

# Ensure UTF-8 output for Windows console
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

model_path = r"C:\Users\ASUS\Downloads\qwen2.5-7b-instruct-q5_k_m.gguf"
print("Loading model locally using llama_cpp...")
start = time.time()
try:
    # Use n_ctx=1024 to keep memory small, and n_gpu_layers=0 to run on CPU by default (or -1 to autodetect GPU if CUDA is available)
    # Let's use n_gpu_layers=-1 to auto-detect GPU acceleration!
    llm = Llama(model_path=model_path, n_ctx=1024, n_threads=4, n_gpu_layers=-1)
    print(f"Model loaded in {time.time() - start:.2f} seconds.")
    
    prompt = "<|im_start|>user\nRank the peacefulness of this verse: 'Peace be with you.' on a scale of 1 to 10. Output only a single number.<|im_end|>\n<|im_start|>assistant\n"
    print("Generating rank...")
    gen_start = time.time()
    res = llm(prompt, max_tokens=10, temperature=0.0)
    print("Response:", res["choices"][0]["text"].strip())
    print(f"Generation took {time.time() - gen_start:.2f} seconds.")
except Exception as e:
    print("Error:", e)
