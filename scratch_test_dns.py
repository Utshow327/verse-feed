import socket
import sys

# Ensure UTF-8 output for Windows console
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

for host in ["generativelanguage.googleapis.com", "api.openai.com"]:
    try:
        ip = socket.gethostbyname(host)
        print(f"Resolved {host} to {ip}")
    except Exception as e:
        print(f"Failed to resolve {host}: {e}")
