#!/usr/bin/env python3
"""PNP lab attacker server (W8).

Two listeners in one process:
  * public :8000 — serves student pages /p/<sid>/<name> and records callbacks
    /cb/<sid>/... on an isolated origin. Published as 127.0.0.1:10010.
  * admin  :8001 — JSON control API reachable only via nginx /api/attacker/.
Standard library only. PNP_MODE=prod turns both listeners into pure 404s.
"""
import json
import os
import re
import threading
import time
from collections import OrderedDict, deque
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

PNP_MODE = os.getenv("PNP_MODE", "dev")
PNP_ORIGINS = {o.strip() for o in os.getenv(
    "PNP_ORIGINS", "http://localhost:8000,http://127.0.0.1:8000").split(",") if o.strip()}

SID_RE = re.compile(r"^[A-Za-z0-9]{16,64}$")
NAME_RE = re.compile(r"^[a-z0-9_-]{1,40}$")
MAX_PAGE_BYTES = 100 * 1024
MAX_PAGES_PER_SID = 20
MAX_SIDS = 500
SID_TTL = float(os.getenv("ATTACKER_PAGE_TTL", "7200"))  # expire 2h after last page write
MAX_CALLBACKS = 200         # per-sid ring buffer
MAX_CB_BODY = 16 * 1024     # recorded body cap
MAX_ADMIN_BODY = 150 * 1024

LOCK = threading.Lock()
# sid -> {"pages": {name: html}, "cbs": deque, "cb_seq": int,
#         "ts": last-activity (eviction order), "wt": last page write (TTL)}
# OrderedDict is kept in last-write order for oldest-first eviction.
SIDS = OrderedDict()


def public_urls(sid):
    return {
        "page_cross_site": f"http://127.0.0.1:10010/p/{sid}/",
        "page_same_site": f"http://localhost:10010/p/{sid}/",
        "cb_cross_site": f"http://127.0.0.1:10010/cb/{sid}/",
        "cb_same_site": f"http://localhost:10010/cb/{sid}/",
    }


def sweep():
    now = time.time()
    for sid in [s for s, r in SIDS.items() if now - r["wt"] > SID_TTL]:
        del SIDS[sid]


def get_rec(sid, create=False, write=False):
    rec = SIDS.get(sid)
    if rec is None and create:
        while len(SIDS) >= MAX_SIDS:
            SIDS.popitem(last=False)
        rec = {"pages": {}, "cbs": deque(maxlen=MAX_CALLBACKS), "cb_seq": 0,
               "ts": 0.0, "wt": time.time()}
        SIDS[sid] = rec
    if rec is not None and write:
        # callbacks refresh activity order only — page TTL comes from wt.
        rec["ts"] = time.time()
        SIDS.move_to_end(sid)
    return rec


def iso_now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class Base(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *args):
        pass

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Access-Control-Allow-Methods", "*")

    def _text(self, status, body=b"", ctype="text/plain; charset=utf-8", cors=False):
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        if cors:
            self._cors()
        self.end_headers()
        if body and self.command != "HEAD":
            self.wfile.write(body)


class PublicHandler(Base):
    """Port 8000: page serving + callback sink on an isolated origin."""

    def _callback(self, segs, parsed):
        sid = segs[1]
        if not SID_RE.match(sid):
            return self._text(400, b"bad-sid", cors=True)
        raw_len = self.headers.get("Content-Length", "0")
        try:
            declared = int(raw_len)
        except ValueError:
            return self._text(400, b"bad-length", cors=True)
        body = self.rfile.read(min(max(declared, 0), MAX_CB_BODY)) if declared > 0 else b""
        if declared > MAX_CB_BODY:
            self.close_connection = True  # remainder is discarded with the socket
        with LOCK:
            rec = get_rec(sid, create=True, write=True)
            rec["cb_seq"] += 1
            rec["cbs"].append({
                "seq": rec["cb_seq"],
                "ts": iso_now(),
                "method": self.command,
                "path": parsed.path,
                "query": parsed.query,
                "headers": [[k, v] for k, v in self.headers.items()],
                "body": body.decode("utf-8", "replace"),
                "truncated": declared > MAX_CB_BODY,
                "ip": self.client_address[0],
            })
        self._text(200, b"ok", cors=True)

    def _page(self, segs):
        sid, name = segs[1], segs[2]
        if not SID_RE.match(sid):
            return self._text(404, b"Not found")
        with LOCK:
            sweep()  # expired page sets are dropped before serving
            rec = get_rec(sid)
            html = rec["pages"].get(name) if rec else None
        if html is None:
            return self._text(404, b"Not found")
        body = html.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _route(self):
        if PNP_MODE == "prod":
            return self._text(404, b"Not found")
        parsed = urlparse(self.path)
        segs = [s for s in parsed.path.split("/") if s]
        if len(segs) >= 2 and segs[0] == "cb":
            return self._callback(segs, parsed)
        if len(segs) == 3 and segs[0] == "p":
            return self._page(segs)
        return self._text(404, b"Not found")

    do_GET = do_POST = do_PUT = do_PATCH = do_DELETE = do_HEAD = _route

    def do_OPTIONS(self):
        if PNP_MODE == "prod":
            return self._text(404, b"Not found")
        if urlparse(self.path).path.startswith("/cb/"):
            self.send_response(204)
            self._cors()
            self.send_header("Content-Length", "0")
            self.end_headers()
        else:
            self._text(404, b"Not found")


class AdminHandler(Base):
    """Port 8001: JSON control API behind nginx /api/attacker/ + PNP_ORIGINS."""

    def _json(self, status, data):
        self._text(status, json.dumps(data, ensure_ascii=False).encode(),
                   "application/json; charset=utf-8")

    def _origin_ok(self, required):
        # Browsers omit Origin on same-origin GET; write methods always send it.
        origin = self.headers.get("Origin")
        if origin is None:
            return not required
        return origin in PNP_ORIGINS

    def _read_json(self):
        raw_len = self.headers.get("Content-Length", "0")
        try:
            length = int(raw_len)
        except ValueError:
            raise ValueError("bad-length")
        if length <= 0:
            raise ValueError("empty-body")
        if length > MAX_ADMIN_BODY:
            raise OverflowError("body-too-large")
        return json.loads(self.rfile.read(length))

    def _qs(self, parsed):
        return {k: v[0] for k, v in parse_qs(parsed.query).items()}

    def _route(self):
        if PNP_MODE == "prod":
            return self._json(404, {"error": "Not found"})
        write = self.command in ("PUT", "POST", "DELETE")
        if not self._origin_ok(required=write):
            return self._json(403, {"error": "Forbidden"})
        parsed = urlparse(self.path)
        segs = [s for s in parsed.path.split("/") if s]
        qs = self._qs(parsed)
        try:
            if segs and segs[0] == "pages":
                return self._pages(segs, qs)
            if segs == ["callbacks"]:
                return self._callbacks(qs)
            return self._json(404, {"error": "Not found"})
        except OverflowError:
            return self._json(413, {"error": "Too large"})
        except (ValueError, KeyError, TypeError, json.JSONDecodeError) as exc:
            return self._json(400, {"error": str(exc) or "Bad request"})

    def _pages(self, segs, qs):
        if self.command == "GET" and len(segs) == 1:
            sid = qs.get("sid", "")
            if not SID_RE.match(sid):
                return self._json(400, {"error": "bad-sid"})
            with LOCK:
                sweep()
                rec = get_rec(sid)
                pages = sorted(rec["pages"].keys()) if rec else []
            return self._json(200, {"ok": True, "sid": sid, "pages": pages, "urls": public_urls(sid)})

        if self.command == "PUT" and len(segs) == 2:
            name = segs[1]
            if not NAME_RE.match(name):
                return self._json(400, {"error": "bad-name"})
            if self.headers.get("Content-Type", "").split(";")[0] != "application/json":
                return self._json(400, {"error": "bad-content-type"})
            data = self._read_json()
            sid = data.get("sid", "")
            html = data.get("html")
            if not SID_RE.match(sid):
                return self._json(400, {"error": "bad-sid"})
            if not isinstance(html, str):
                return self._json(400, {"error": "bad-html"})
            if len(html.encode("utf-8")) > MAX_PAGE_BYTES:
                return self._json(413, {"error": "page-too-large"})
            with LOCK:
                sweep()
                rec = get_rec(sid, create=True, write=True)
                if name not in rec["pages"] and len(rec["pages"]) >= MAX_PAGES_PER_SID:
                    return self._json(400, {"error": "page-limit"})
                rec["pages"][name] = html
                rec["wt"] = time.time()  # page TTL anchored to page writes only
            url = public_urls(sid)
            return self._json(200, {
                "ok": True, "sid": sid, "name": name,
                "urls": url,
                "page_urls": {
                    "cross_site": url["page_cross_site"] + name,
                    "same_site": url["page_same_site"] + name,
                },
            })

        if self.command == "DELETE" and len(segs) == 2:
            name = segs[1]
            sid = qs.get("sid", "")
            if not NAME_RE.match(name) or not SID_RE.match(sid):
                return self._json(400, {"error": "bad-name-or-sid"})
            with LOCK:
                rec = get_rec(sid)
                removed = bool(rec) and rec["pages"].pop(name, None) is not None
            return self._json(200, {"ok": True, "removed": removed})

        return self._json(404, {"error": "Not found"})

    def _callbacks(self, qs):
        sid = qs.get("sid", "")
        if not SID_RE.match(sid):
            return self._json(400, {"error": "bad-sid"})
        if self.command == "GET":
            try:
                after = int(qs.get("after", "0"))
            except ValueError:
                return self._json(400, {"error": "bad-after"})
            with LOCK:
                sweep()
                rec = get_rec(sid)
                cbs = [c for c in (rec["cbs"] if rec else []) if c["seq"] > after]
            return self._json(200, {"ok": True, "sid": sid, "callbacks": cbs})
        if self.command == "DELETE":
            with LOCK:
                rec = get_rec(sid)
                if rec:
                    rec["cbs"].clear()
            return self._json(200, {"ok": True})
        return self._json(404, {"error": "Not found"})

    do_GET = do_PUT = do_DELETE = do_HEAD = _route


def main():
    public = ThreadingHTTPServer(("0.0.0.0", 8000), PublicHandler)
    admin = ThreadingHTTPServer(("0.0.0.0", 8001), AdminHandler)
    threading.Thread(target=admin.serve_forever, daemon=True).start()
    public.serve_forever()


if __name__ == "__main__":
    main()
