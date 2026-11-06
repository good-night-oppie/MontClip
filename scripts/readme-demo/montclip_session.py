"""Run one MontClip server for a demo script and talk to it over MCP, failing closed.

- fresh_dir(): the work directory must not exist yet, or be an empty real directory (no symlink);
  nothing in an existing directory is deleted or overwritten.
- Session: starts `node server.js` on a free port with its own FABLECUT_DATA_DIR, then proves that the
  socket listening on that port belongs to the process it started (Linux /proc: the listening socket's
  inode must be one of that process's open sockets). If that cannot be shown, it stops: an HTTP 200 alone
  could come from any other MontClip on the machine.
- Session.call(): runs mcp-call.cjs and stops on a non-zero exit (any tool error stops the run there).
- Session.assert_owned() / the watcher: every client connected to our port must belong to our own process tree
  (this script, mcp-call, the server and the headless browsers it spawns). A browser tab or any other process
  connected from outside stops the run, before the project is written and at any time during calls. The
  headless browsers seen are recorded (pid, parent chain to our server, profile directory).
- Session.open_editor(): starts our own headless Chrome (a child of this script, with a new profile inside the
  work directory) on our server's editor page and waits until that browser, and only it, is connected; frames
  can then be rendered by that tab (where:"tab") instead of a new headless browser per frame.
"""
import json, os, pathlib, socket, subprocess, sys, threading, time, urllib.error, urllib.request

HERE = pathlib.Path(__file__).resolve().parent


def fresh_dir(path):
    p = pathlib.Path(path)
    if p.is_symlink():
        raise SystemExit(f"refusing {p}: it is a symlink; give a new or empty directory")
    if p.exists():
        if not p.is_dir():
            raise SystemExit(f"refusing {p}: it exists and is not a directory")
        if any(p.iterdir()):
            raise SystemExit(f"refusing {p}: it is not empty; give a new or empty directory (nothing was changed)")
    p.mkdir(parents=True, exist_ok=True)
    return p.resolve()


def _free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def _listen_inodes(port):
    """Inodes of sockets in LISTEN state on `port` (IPv4 and IPv6), from /proc/net."""
    found = set()
    for table in ("/proc/net/tcp", "/proc/net/tcp6"):
        try:
            rows = pathlib.Path(table).read_text().splitlines()[1:]
        except OSError:
            continue
        for row in rows:
            f = row.split()
            if len(f) > 9 and f[3] == "0A" and int(f[1].rsplit(":", 1)[1], 16) == port:
                found.add(f[9])
    return found


def _process_sockets(pid):
    out = set()
    for fd in pathlib.Path(f"/proc/{pid}/fd").iterdir():
        try:
            target = os.readlink(fd)
        except OSError:
            continue
        if target.startswith("socket:["):
            out.add(target[8:-1])
    return out


def _parents():
    out = {}
    for d in pathlib.Path("/proc").iterdir():
        if d.name.isdigit():
            try:
                out[int(d.name)] = int((d / "stat").read_text().rsplit(")", 1)[1].split()[1])
            except (OSError, IndexError, ValueError):
                pass
    return out


def _tree(root, parents):
    kids, out, todo = {}, {root}, [root]
    for pid, pp in parents.items():
        kids.setdefault(pp, []).append(pid)
    while todo:
        for k in kids.get(todo.pop(), []):
            if k not in out:
                out.add(k); todo.append(k)
    return out


def _client_inodes(port):
    """Inodes of client-side sockets ESTABLISHED to 127.0.0.1/::1 `port` (remote port == port)."""
    found = set()
    for table in ("/proc/net/tcp", "/proc/net/tcp6"):
        try:
            rows = pathlib.Path(table).read_text().splitlines()[1:]
        except OSError:
            continue
        for row in rows:
            f = row.split()
            if len(f) > 9 and f[3] == "01" and int(f[2].rsplit(":", 1)[1], 16) == port and f[9] != "0":
                found.add(f[9])
    return found


class Session:
    def __init__(self, work, src, label):
        self.work, self.src, self.label = pathlib.Path(work), pathlib.Path(src), label
        if not pathlib.Path("/proc/net/tcp").exists():
            raise SystemExit("cannot prove which process owns the port on this system (no /proc); refusing to run")
        self.data = self.work / "data"
        self.data.mkdir()
        self.port = str(_free_port())
        ext = self.work / "external-ffmpeg.json"
        ext.write_text(json.dumps({"version": 1, "path": os.environ.get("EXTERNAL_FFMPEG", "/usr/bin/ffmpeg")}))
        self.env = {**os.environ, "FABLECUT_DATA_DIR": str(self.data), "FABLECUT_PORT": self.port, "PORT": self.port,
                    "FABLECUT_NO_AUTOSTART": "1", "MONTCLIP_SRC": str(self.src), "MONTCLIP_EXTERNAL_FFMPEG_SETTINGS": str(ext)}
        self.log = self.work / "server.log"
        self.srv = subprocess.Popen(["node", "server.js"], cwd=self.src, env=self.env,
                                    stdout=open(self.log, "w"), stderr=subprocess.STDOUT)
        self.foreign, self.browsers, self._stop, self.editor = [], {}, threading.Event(), None
        try:
            self._wait_until_ours()
            self.assert_owned()
        except BaseException:
            self.close()
            raise
        self._watch = threading.Thread(target=self._watch_loop, daemon=True)
        self._watch.start()

    def _check(self):
        """Record clients of our port that are not in our process tree, and our server's headless browsers."""
        port, parents = int(self.port), _parents()
        server = _tree(self.srv.pid, parents)
        ours = server | _tree(os.getpid(), parents)
        mine = set()
        for pid in ours:
            try:
                mine |= _process_sockets(pid)
            except OSError:
                pass
        stray = _client_inodes(port) - mine
        if stray:
            # a socket can be created by a child that has just exited; look again before calling it foreign
            time.sleep(0.2)
            parents = _parents(); ours = _tree(self.srv.pid, parents) | _tree(os.getpid(), parents)
            mine = set().union(*[self._socks(p) for p in ours])
            stray = _client_inodes(port) & stray - mine
        if stray:
            self.foreign.append({"time": time.time(), "inodes": sorted(stray)})
        for pid in server - {self.srv.pid}:
            try:
                # Chrome rewrites its process title, so its cmdline can be one space-separated string
                cmd = pathlib.Path(f"/proc/{pid}/cmdline").read_bytes().replace(b"\0", b" ").split()
            except OSError:
                continue
            prof = [a.decode() for a in cmd if a.startswith(b"--user-data-dir=")]
            if prof and b"--type=" not in b" ".join(cmd) and pid not in self.browsers:
                chain, p = [], pid
                while p and p != self.srv.pid and len(chain) < 16:
                    chain.append(p); p = parents.get(p)
                self.browsers[pid] = {"exe": cmd[0].decode(), "profile": prof[0].split("=", 1)[1],
                                      "parent_chain_to_server": chain + [self.srv.pid], "first_seen": time.time()}
        return not stray

    def open_editor(self, chrome=None, timeout=60):
        exe = chrome or os.environ.get("FABLECUT_CHROME") or next(
            (c for c in ("/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser") if os.path.exists(c)), None)
        if not exe:
            raise SystemExit(f"{self.label}: no Chrome/Chromium found to open our own editor tab (set FABLECUT_CHROME)")
        self.assert_owned()
        profile = self.work / "editor-profile"
        profile.mkdir()
        self.editor = subprocess.Popen([exe, "--headless=new", f"--user-data-dir={profile}", "--no-first-run",
                                        "--no-default-browser-check", "--disable-extensions", "--mute-audio",
                                        "--autoplay-policy=no-user-gesture-required", "--disable-background-timer-throttling",
                                        "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows",
                                        "--window-size=1600,900", f"http://127.0.0.1:{self.port}/"],
                                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        self.editor_info = {"pid": self.editor.pid, "exe": exe, "profile": str(profile), "parent": os.getpid()}
        deadline = time.time() + timeout
        while time.time() < deadline:
            if self.editor.poll() is not None:
                raise SystemExit(f"{self.label}: our editor browser exited before it connected")
            tree = _tree(self.editor.pid, _parents())
            if _client_inodes(int(self.port)) & set().union(*[self._socks(p) for p in tree]) and self._tab_ready():
                self.assert_owned()
                return
            time.sleep(0.5)
        raise SystemExit(f"{self.label}: our editor browser did not connect within {timeout}s")

    def _tab_ready(self):
        """True once the server has an editor tab: a tab-only frame request is accepted (409 until then).
        The probe job is waited for, so it does not hold the tab. Only our own tab can be connected here:
        assert_owned() has just checked every client of the port."""
        self.assert_owned()
        base = f"http://127.0.0.1:{self.port}"
        req = urllib.request.Request(base + "/api/scopes/request", data=b'{"where":"tab","image":false}',
                                     headers={"Content-Type": "application/json"}, method="POST")
        try:
            job = json.loads(urllib.request.urlopen(req, timeout=5).read())
        except urllib.error.HTTPError as e:
            if e.code == 409:
                return False
            raise
        for _ in range(240):
            if job.get("status") not in ("pending", "running"):
                return job.get("status") == "done"
            time.sleep(0.25)
            job = json.loads(urllib.request.urlopen(f"{base}/api/export/job?id={job['id']}", timeout=5).read())
        return False

    @staticmethod
    def _socks(pid):
        try:
            return _process_sockets(pid)
        except OSError:
            return set()

    def assert_owned(self):
        if not self._check() or self.foreign:
            raise SystemExit(f"{self.label}: a process outside this run is connected to our server (port {self.port}): "
                             f"{self.foreign[-1:]}; stopping")

    def _watch_loop(self):
        while not self._stop.wait(0.5):
            if self.srv.poll() is not None:
                return
            self._check()

    def _wait_until_ours(self):
        port = int(self.port)
        for _ in range(80):
            if self.srv.poll() is not None:
                raise SystemExit(f"{self.label}: our MontClip server exited before it was ready:\n{self.log.read_text()[-800:]}")
            inodes = _listen_inodes(port)
            if inodes:
                if not inodes & _process_sockets(self.srv.pid):
                    raise SystemExit(f"{self.label}: port {port} is held by another process, not the server we started "
                                     f"(pid {self.srv.pid}); stopping before any request")
                try:
                    if urllib.request.urlopen(f"http://127.0.0.1:{port}/api/project", timeout=2).status == 200:
                        return
                except OSError:
                    pass
            time.sleep(0.25)
        raise SystemExit(f"{self.label}: our MontClip server did not come up on port {port}")

    def call(self, calls, tag):
        self.assert_owned()  # before anything is sent, in particular before the project is written
        f = self.work / f"{tag}.json"
        f.write_text(json.dumps(calls, ensure_ascii=False, indent=1))
        r = subprocess.run(["node", str(HERE / "mcp-call.cjs"), str(f)], env=self.env, capture_output=True, text=True, timeout=1500)
        (self.work / f"{tag}.out.txt").write_text(r.stdout + r.stderr)
        print(r.stdout[:3000])
        if r.returncode != 0:
            raise SystemExit(f"{self.label}: MCP call failed in {tag} (exit {r.returncode}); see {self.work / (tag + '.out.txt')}")
        self.assert_owned()  # and nothing foreign connected while it ran
        return r.stdout

    def close(self):
        if getattr(self, "_stop", None):
            self._stop.set()
        if getattr(self, "editor", None) and self.editor.poll() is None:
            self.editor.kill()
            self.editor.wait(timeout=10)
        (self.work / "ownership.json").write_text(json.dumps(
            {"server_pid": self.srv.pid, "port": int(self.port), "foreign_clients": getattr(self, "foreign", []),
             "headless_browsers": getattr(self, "browsers", {}), "editor_tab": getattr(self, "editor_info", None)},
            indent=1, default=str))
        if self.srv.poll() is None:
            self.srv.kill()
            self.srv.wait(timeout=10)

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()
