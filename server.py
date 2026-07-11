import http.server
import socketserver
import gzip
import io
import os

PORT = 8000
ALLOWED_EXTENSIONS = {'.html', '.css', '.js', '.mjs', '.json', '.wasm', '.data', '.onnx', '.ico', '.png', '.jpg', '.svg'}

class SecureGzipHandler(http.server.SimpleHTTPRequestHandler):
    """Serves files with gzip compression, caching, and security headers."""

    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        '.mjs': 'application/javascript',
        '.js': 'application/javascript',
        '.json': 'application/json',
        '.wasm': 'application/wasm',
        '.data': 'application/octet-stream',
        '.onnx': 'application/octet-stream',
    }

    COMPRESSIBLE = {
        'text/html', 'text/css', 'text/plain',
        'application/javascript', 'application/json',
    }

    def end_headers(self):
        # Security headers on every response
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('X-Frame-Options', 'DENY')
        self.send_header('Referrer-Policy', 'no-referrer')
        self.send_header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
        super().end_headers()

    def do_GET(self):
        # Block path traversal attempts
        path = self.translate_path(self.path)
        base = os.path.realpath(os.getcwd())
        real = os.path.realpath(path)
        if not real.startswith(base):
            self.send_error(403, 'Forbidden')
            return

        # Block access to server.py itself and hidden files
        rel = os.path.relpath(real, base)
        if (rel.startswith('.') and rel != '.') or 'server.py' in rel or '__pycache__' in rel:
            self.send_error(404, 'Not Found')
            return

        # Block listing of directories (only serve files)
        if os.path.isdir(real) and not self.path.rstrip('/') == '':
            # Allow root index only
            pass

        # Check file extension is allowed
        _, ext = os.path.splitext(path)
        if ext and ext.lower() not in ALLOWED_EXTENSIONS and not os.path.isdir(path):
            self.send_error(403, 'Forbidden')
            return

        # Gzip compression for text-based content
        accept_enc = self.headers.get('Accept-Encoding', '')
        if 'gzip' not in accept_enc:
            return super().do_GET()

        ctype = self.guess_type(path)
        if ctype not in self.COMPRESSIBLE:
            return super().do_GET()

        try:
            with open(path, 'rb') as f:
                content = f.read()
        except (FileNotFoundError, IsADirectoryError, PermissionError):
            return super().do_GET()

        # Compress
        buf = io.BytesIO()
        with gzip.GzipFile(fileobj=buf, mode='wb', compresslevel=6) as gz:
            gz.write(content)
        compressed = buf.getvalue()

        self.send_response(200)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Encoding', 'gzip')
        self.send_header('Content-Length', str(len(compressed)))
        self.send_header('Vary', 'Accept-Encoding')
        # Cache static assets aggressively
        if ext in {'.json', '.wasm', '.data', '.onnx'}:
            self.send_header('Cache-Control', 'public, max-age=86400')
        elif ext in {'.js', '.css'}:
            self.send_header('Cache-Control', 'public, max-age=3600')
        self.end_headers()
        self.wfile.write(compressed)

    def do_POST(self):
        # Only allow /log endpoint for browser debug logging
        if self.path == '/log':
            length = int(self.headers.get('Content-Length', 0))
            self.rfile.read(length)  # consume body, discard
            self.send_response(204)
            self.end_headers()
            return
        self.send_error(405, 'Method Not Allowed')

    def log_message(self, format, *args):
        pass

with socketserver.ThreadingTCPServer(("", PORT), SecureGzipHandler) as httpd:
    httpd.allow_reuse_address = True
    print(f"Serving at http://localhost:{PORT} (Threaded + Gzip + Secure)")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
