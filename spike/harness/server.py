#!/usr/bin/env python3
"""검증 하네스용 로컬 서버: 테스트 페이지 제공 + 결과(report) 수집 + 핫링크 보호 흉내"""
import json, os, sys, time
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

ROOT = sys.argv[1]
OUT = sys.argv[2]
PORT = 8765


class H(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def log_message(self, fmt, *args):
        with open(os.path.join(OUT, 'server.log'), 'a') as f:
            f.write('%s %s\n' % (time.strftime('%H:%M:%S'), fmt % args))

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Methods', 'POST, GET')
        self.send_header('Access-Control-Allow-Headers', 'content-type')
        self.end_headers()

    def do_GET(self):
        if self.path.startswith('/protected/'):
            ref = self.headers.get('Referer', '')
            with open(os.path.join(OUT, 'protected.log'), 'a') as f:
                f.write('%s referer=%r ua-dest=%r\n' % (time.strftime('%H:%M:%S'), ref, self.headers.get('Sec-Fetch-Dest')))
            if not ref.startswith('http://127.0.0.1:8765/'):
                self.send_response(403)
                self.end_headers()
                self.wfile.write(b'hotlink blocked')
                return
            self.path = '/img/' + self.path[len('/protected/'):]
        return super().do_GET()

    def do_POST(self):
        if self.path == '/report':
            n = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(n)
            with open(os.path.join(OUT, 'reports.jsonl'), 'ab') as f:
                f.write(body + b'\n')
            self.send_response(204)
            self.end_headers()
            return
        self.send_response(404)
        self.end_headers()


H.extensions_map.update({'.otf': 'font/otf', '.svg': 'image/svg+xml'})
ThreadingHTTPServer(('0.0.0.0', PORT), H).serve_forever()
