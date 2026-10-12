"""Static server for the browser checks: the repo root on 127.0.0.1:5500.

`python3 -m http.server` queues only 5 connections, and a page that loads many
scripts at once then loses some ("kdpAutosave is not defined"). This one
answers each request on its own thread and queues up to 128. No caching, so a
run always reads the files on disk.
    python3 tests/browser/serve.py          (tests/browser/run.sh starts it)
"""
import functools
import http.server
import os

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PORT = int(os.environ.get("KDP_TEST_PORT", "5500"))


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, *args):
        pass


class Server(http.server.ThreadingHTTPServer):
    request_queue_size = 128
    daemon_threads = True


if __name__ == "__main__":
    Server(("127.0.0.1", PORT), functools.partial(Handler, directory=ROOT)).serve_forever()
