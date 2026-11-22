"""Local sensor receiver and dashboard. Python standard library only."""
import argparse
import hmac
import json
import math
import os
from pathlib import Path
import secrets
import sqlite3
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ROOT = Path(__file__).resolve().parent

def create_server(host, port, database, token):
    with sqlite3.connect(database) as db:
        db.execute("CREATE TABLE IF NOT EXISTS samples (time REAL, bpm REAL, spo2 REAL)")

    class Handler(BaseHTTPRequestHandler):
        def send_data(self, data, kind="application/json", status=200):
            self.send_response(status)
            self.send_header("Content-Type", kind)
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def authorized(self):
            return hmac.compare_digest(self.headers.get("Authorization", "").encode(),
                                       ("Bearer " + token).encode())

        def do_GET(self):
            if self.path == "/local/samples":
                if not self.authorized():
                    return self.send_data(b'{}', status=401)
                with sqlite3.connect(database) as db:
                    rows = db.execute("SELECT time,bpm,spo2 FROM samples ORDER BY rowid DESC LIMIT 60").fetchall()
                return self.send_data(json.dumps(rows[::-1]).encode())
            files = {"/": ("index.html", "text/html"), "/index.html": ("index.html", "text/html"),
                     "/app.js": ("app.js", "text/javascript"), "/style.css": ("style.css", "text/css"),
                     "/watch-sample.csv": ("watch-sample.csv", "text/csv")}
            if self.path in files:
                name, kind = files[self.path]
                return self.send_data((ROOT / "web" / name).read_bytes(), kind + "; charset=utf-8")
            self.send_data(b'{}', status=404)

        def do_POST(self):
            if self.path != "/local/samples":
                return self.send_data(b'{}', status=404)
            if not self.authorized():
                return self.send_data(b'{}', status=401)
            try:
                size = int(self.headers.get("Content-Length", "0"))
                if not 0 < size <= 1024:
                    raise ValueError
                payload = json.loads(self.rfile.read(size))
                bpm, spo2 = payload["bpm"], payload.get("spo2")
                if payload["quality"] != "valid" or not numeric(bpm, 1, 255):
                    raise ValueError
                if spo2 is not None and not numeric(spo2, 0, 100):
                    raise ValueError
            except (ValueError, KeyError, TypeError):
                return self.send_data(b'{"error":"invalid sample"}', status=422)
            with sqlite3.connect(database) as db:
                db.execute("INSERT INTO samples VALUES (?,?,?)", (time.time(), bpm, spo2))
                db.execute("DELETE FROM samples WHERE time < ?", (time.time() - 86400,))
            self.send_data(b'{"stored":true}', status=201)

        def do_DELETE(self):
            if self.path != "/local/samples":
                return self.send_data(b'{}', status=404)
            if not self.authorized():
                return self.send_data(b'{}', status=401)
            with sqlite3.connect(database) as db:
                db.execute("DELETE FROM samples")
            self.send_data(b'{"deleted":true}')

    return ThreadingHTTPServer((host, port), Handler)

def numeric(value, minimum, maximum):
    return type(value) in (int, float) and minimum <= value <= maximum and math.isfinite(value)

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--lan", action="store_true", help="Enable sensor access on a trusted private LAN")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()
    token = os.getenv("KT_TOKEN") or secrets.token_hex(16)
    if args.lan and len(token) < 24:
        parser.error("KT_TOKEN must be at least 24 characters in LAN mode")
    print(f"Dashboard: http://localhost:{args.port}\nSession token: {token}", flush=True)
    create_server("0.0.0.0" if args.lan else "127.0.0.1", args.port, ROOT / "private.sqlite", token).serve_forever()
