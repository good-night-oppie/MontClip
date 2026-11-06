"""Run one MontClip server for a demo script and talk to it over MCP, failing closed. Linux only.

Isolation (the guarantee): before anything starts, the process enters a new user + network namespace of its
own (isolate()). Its loopback is private: no process outside the namespace (a browser tab, another MontClip,
another script) can reach the server at all, however short its connection. Everything this script starts
(the server, mcp-call, headless browsers) is inside the namespace. What it does not stop: a process of the
same user that deliberately joins the namespace (setns/nsenter); the watcher below looks for that, but
polling cannot prove a negative, so that case is a stated limit, not a guarantee. The process is also a child
subreaper, so descendants that double-fork stay in its process tree.

- fresh_dir(): the work directory must not exist yet, or be an empty real directory (no symlink).
- Session: starts `node server.js` (HOST=127.0.0.1) with its own FABLECUT_DATA_DIR, then before any request:
  (1) the socket listening on the port must be one the server process holds (/proc inode check), and
  (2) the server must serve a random proof file written into this run's data directory (authentication of
      this run's service, not just "something answers 200"). The proof stays for the whole session and
      mcp-call.cjs checks it, and the session's dead-marker, before initialize and before every tool request.
- Lifecycle: the session becomes dead, for good, as soon as the server exits, the listening socket is no
  longer the server's, a process inside our namespace is not in our process tree, or the watcher itself
  fails. assert_owned() fails on a dead session; the dead-marker is written at once, so mcp-call sends no
  further tool request, and the running batch (mcp-call and its MCP server) is killed as well. call() kills
  and waits for its batch on any exit, including an exception (Ctrl-C); close() first writes the marker,
  then kills and waits for a running batch, and only then stops the watcher.
- open_editor(): our own headless Chrome (a child of this script, new profile in the work directory) on the
  editor page; ready once the server accepts a tab-only frame request. Headless browsers the server starts
  for exports are recorded (pid, parent chain to the server, profile).
"""
import ctypes, fcntl, json, os, pathlib, secrets, socket, struct, subprocess, sys, threading, time, urllib.error, urllib.request

HERE = pathlib.Path(__file__).resolve().parent
_ISOLATION = {}


def isolate():
    """Enter a new user + network namespace (once per process; must run before any thread starts)."""
    if _ISOLATION:
        return _ISOLATION
    if threading.active_count() > 1:
        raise SystemExit("isolate() must run before any thread is started")
    host_net = os.readlink("/proc/self/ns/net")
    uid, gid = os.getuid(), os.getgid()
    libc = ctypes.CDLL(None, use_errno=True)
    if libc.unshare(0x10000000 | 0x40000000) != 0:  # CLONE_NEWUSER | CLONE_NEWNET
        raise SystemExit(f"cannot create a private network namespace (errno {ctypes.get_errno()}); refusing to run "
                         "without request isolation (unprivileged user namespaces must be enabled)")
    for name, text in (("setgroups", "deny"), ("uid_map", f"{uid} {uid} 1"), ("gid_map", f"{gid} {gid} 1")):
        with open(f"/proc/self/{name}", "w") as f:
            f.write(text)
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:  # bring up the private loopback
        flags = struct.unpack("16sH14s", fcntl.ioctl(s, 0x8913, struct.pack("16sH14s", b"lo", 0, b"\0" * 14)))[1]
        fcntl.ioctl(s, 0x8914, struct.pack("16sH14s", b"lo", flags | 1, b"\0" * 14))
    # orphaned descendants (double-forked helpers such as Chrome's crash handler) are re-parented to us, so
    # every process we start stays in our tree; only a process that joins the namespace from outside is not
    if libc.prctl(36, 1, 0, 0, 0) != 0:  # PR_SET_CHILD_SUBREAPER
        raise SystemExit("cannot become a child subreaper; refusing to run")
    net = os.readlink("/proc/self/ns/net")
    if net == host_net or os.getuid() != uid:
        raise SystemExit("network namespace isolation did not take effect; refusing to run")
    _ISOLATION.update({"host_netns": host_net, "netns": net, "pid": os.getpid()})
    return _ISOLATION


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


def _table(state, port, side):
    """Socket inodes in `state` (hex, e.g. 0A LISTEN, 01 ESTABLISHED) whose local (side=1) or remote (side=2)
    port is `port`, from /proc/net/tcp and tcp6 (which show only our own network namespace)."""
    found = set()
    for table in ("/proc/net/tcp", "/proc/net/tcp6"):
        try:
            rows = pathlib.Path(table).read_text().splitlines()[1:]
        except OSError:
            continue
        for row in rows:
            f = row.split()
            if len(f) > 9 and f[3] == state and int(f[side].rsplit(":", 1)[1], 16) == port and f[9] != "0":
                found.add(f[9])
    return found


def _process_sockets(pid):
    out = set()
    try:
        fds = list(pathlib.Path(f"/proc/{pid}/fd").iterdir())
    except OSError:
        return out
    for fd in fds:
        try:
            target = os.readlink(fd)
        except OSError:
            continue
        if target.startswith("socket:["):
            out.add(target[8:-1])
    return out


def _processes():
    """pid -> (ppid, network namespace or None) for every process we can see. The parent always counts, even
    when the namespace cannot be read (e.g. Chrome's non-dumpable helpers), so the process tree stays whole."""
    out = {}
    for d in pathlib.Path("/proc").iterdir():
        if d.name.isdigit():
            try:
                ppid = int((d / "stat").read_text().rsplit(")", 1)[1].split()[1])
            except (OSError, IndexError, ValueError):
                continue
            try:
                ns = os.readlink(d / "ns" / "net")
            except OSError:
                ns = None
            out[int(d.name)] = (ppid, ns)
    return out


def _describe(pid, procs):
    """Command line and parent chain of a process, for the record."""
    try:
        cmd = pathlib.Path(f"/proc/{pid}/cmdline").read_bytes().replace(b"\0", b" ").decode(errors="replace")[:160]
    except OSError:
        cmd = "?"
    chain, p = [], procs.get(pid, (None,))[0]
    while p and len(chain) < 8:
        chain.append(p); p = procs.get(p, (None,))[0]
    return {"pid": pid, "cmdline": cmd, "parents": chain}


def _tree(root, procs):
    kids, out, todo = {}, {root}, [root]
    for pid, (pp, _) in procs.items():
        kids.setdefault(pp, []).append(pid)
    while todo:
        for k in kids.get(todo.pop(), []):
            if k not in out:
                out.add(k); todo.append(k)
    return out


class Session:
    def __init__(self, work, src, label):
        self.iso = isolate()
        self.work, self.src, self.label = pathlib.Path(work), pathlib.Path(src), label
        self.dead, self.foreign, self.browsers, self.editor, self.editor_info = None, [], {}, None, None
        self._stop, self._lock, self._batch = threading.Event(), threading.Lock(), None
        self.data = self.work / "data"
        self.data.mkdir()
        self.port = str(_free_port())
        ext = self.work / "external-ffmpeg.json"
        ext.write_text(json.dumps({"version": 1, "path": os.environ.get("EXTERNAL_FFMPEG", "/usr/bin/ffmpeg")}))
        self.env = {**os.environ, "FABLECUT_DATA_DIR": str(self.data), "FABLECUT_PORT": self.port, "PORT": self.port,
                    "HOST": "127.0.0.1", "FABLECUT_NO_AUTOSTART": "1", "MONTCLIP_SRC": str(self.src),
                    "MONTCLIP_EXTERNAL_FFMPEG_SETTINGS": str(ext)}
        self.log = self.work / "server.log"
        self.srv = subprocess.Popen(["node", "server.js"], cwd=self.src, env=self.env,
                                    stdout=open(self.log, "w"), stderr=subprocess.STDOUT)
        try:
            self._wait_until_ours()
            self._authenticate()
            self.assert_owned()
        except BaseException:
            self.close()
            raise
        self._watch = threading.Thread(target=self._watch_loop, daemon=True)
        self._watch.start()

    # ---- ownership -------------------------------------------------------------------------------------
    def _listener_is_servers(self):
        inodes = _table("0A", int(self.port), 1)
        return bool(inodes) and inodes <= _process_sockets(self.srv.pid)

    def _wait_until_ours(self):
        port = int(self.port)
        for _ in range(80):
            if self.srv.poll() is not None:
                raise SystemExit(f"{self.label}: our MontClip server exited before it was ready:\n{self.log.read_text()[-800:]}")
            inodes = _table("0A", port, 1)
            if inodes:
                if not inodes <= _process_sockets(self.srv.pid):
                    raise SystemExit(f"{self.label}: port {port} is held by another process, not the server we started "
                                     f"(pid {self.srv.pid}); stopping before any request")
                try:
                    if urllib.request.urlopen(f"http://127.0.0.1:{port}/api/project", timeout=2).status == 200:
                        return
                except OSError:
                    pass
            time.sleep(0.25)
        raise SystemExit(f"{self.label}: our MontClip server did not come up on port {port}")

    def _authenticate(self):
        """The server must serve a random proof written into this run's data directory just now."""
        exports = self.data / "exports"
        exports.mkdir(exist_ok=True)
        name, proof = f"owner-proof-{secrets.token_hex(8)}.txt", secrets.token_hex(32)
        (exports / name).write_text(proof)
        self.proof_file = exports / name  # kept for the whole session: mcp-call checks it before every tool request
        url = f"http://127.0.0.1:{self.port}/exports/{name}"
        try:
            got = urllib.request.urlopen(url, timeout=5).read().decode()
        except OSError as e:
            raise SystemExit(f"{self.label}: could not read this run's proof file from the server ({e}); stopping")
        if got != proof:
            raise SystemExit(f"{self.label}: the server on port {self.port} did not serve this run's proof file; stopping")
        if not self._listener_is_servers():
            raise SystemExit(f"{self.label}: the listening socket changed hands during authentication; stopping")
        self.dead_marker = self.work / "session-dead"
        self.env.update(MONTCLIP_GATE_PROOF_URL=url, MONTCLIP_GATE_PROOF=proof, MONTCLIP_GATE_DEAD=str(self.dead_marker))
        self.authenticated = {"proof_file": name, "time": time.time()}

    def _kill(self, why):
        with self._lock:
            if self.dead is None:
                self.dead = {"why": why, "time": time.time()}
                marker = getattr(self, "dead_marker", None)
                if marker is not None:
                    marker.write_text(why)  # mcp-call refuses every further tool request
            batch = self._batch
        if batch and batch.poll() is None:
            try:
                os.killpg(batch.pid, 9)
            except OSError:
                pass

    def _check(self):
        """One pass: lifecycle, listener, processes in our namespace, clients of our port, our browsers."""
        if self.srv.poll() is not None:
            return self._kill(f"server exited (code {self.srv.returncode})")
        if not self._listener_is_servers():
            return self._kill("the socket listening on our port is not the server's any more")
        procs = _processes()
        ours = _tree(self.iso["pid"], procs)
        strangers = sorted(p for p, (_, ns) in procs.items() if ns == self.iso["netns"] and p not in ours)
        if strangers:
            self.foreign.append({"time": time.time(), "processes_in_our_netns_outside_our_tree":
                                 [_describe(p, procs) for p in strangers], "our_root": self.iso["pid"]})
            return self._kill(f"processes in our network namespace are not ours: {strangers}")
        mine = set().union(*[_process_sockets(p) for p in ours])
        clients = _table("01", int(self.port), 2)
        unattributed = clients - mine
        # A client socket whose owner has already exited cannot be attributed. It can only have come from a
        # process inside our namespace, and every such process is checked above; it is counted, not erased.
        if unattributed:
            self.unattributed = getattr(self, "unattributed", 0) + len(unattributed)
        server = _tree(self.srv.pid, procs)
        for pid in server - {self.srv.pid}:
            if pid in self.browsers:
                continue
            try:
                cmd = pathlib.Path(f"/proc/{pid}/cmdline").read_bytes().replace(b"\0", b" ").split()
            except OSError:
                continue
            prof = [a.decode() for a in cmd if a.startswith(b"--user-data-dir=")]
            if prof and not any(a.startswith(b"--type=") for a in cmd):
                chain, p = [], pid
                while p and p != self.srv.pid and len(chain) < 16:
                    chain.append(p); p = procs.get(p, (None,))[0]
                self.browsers[pid] = {"exe": cmd[0].decode(), "profile": prof[0].split("=", 1)[1],
                                      "parent_chain_to_server": chain + [self.srv.pid], "first_seen": time.time()}

    def assert_owned(self):
        self._check()
        if getattr(self, "_watch", None) is not None and not self._watch.is_alive() and not self._stop.is_set():
            self._kill("the ownership watcher stopped")
        if self.dead:
            raise SystemExit(f"{self.label}: session is no longer trusted ({self.dead['why']}); stopping")

    def _watch_loop(self):
        try:
            while not self._stop.wait(0.1):
                self._check()
                if self.dead:
                    return
        except BaseException as e:  # a failing watcher must not leave a session that looks fine
            self._kill(f"ownership watcher failed: {e!r}")

    # ---- our own editor tab ------------------------------------------------------------------------------
    def open_editor(self, chrome=None, timeout=90):
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
            if self._tab_ready():
                self.assert_owned()
                return
            time.sleep(0.5)
        raise SystemExit(f"{self.label}: our editor browser did not connect within {timeout}s")

    def _tab_ready(self):
        """True once the server has an editor tab: a tab-only frame request is accepted (409 until then).
        Only our own tab can be connected: nothing outside our namespace can reach the server."""
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

    # ---- MCP -----------------------------------------------------------------------------------------------
    def call(self, calls, tag):
        self.assert_owned()  # before anything is sent, in particular before the project is written
        f = self.work / f"{tag}.json"
        f.write_text(json.dumps(calls, ensure_ascii=False, indent=1))
        out = open(self.work / f"{tag}.out.txt", "w+")
        with self._lock:
            self._batch = subprocess.Popen(["node", str(HERE / "mcp-call.cjs"), str(f)], env=self.env,
                                           stdout=out, stderr=subprocess.STDOUT, start_new_session=True)
        batch, deadline = self._batch, time.time() + 1500
        try:
            while batch.poll() is None:
                if self.dead or time.time() > deadline:
                    self._kill(self.dead["why"] if self.dead else "batch timed out")
                    batch.wait()
                    break
                time.sleep(0.1)
        finally:  # also on an exception (e.g. Ctrl-C): never leave our batch running
            self._stop_batch(batch)
        out.seek(0); text = out.read(); out.close()
        print(text[:3000])
        if self.dead:
            raise SystemExit(f"{self.label}: stopped batch {tag}: {self.dead['why']}")
        if batch.returncode != 0:
            raise SystemExit(f"{self.label}: MCP call failed in {tag} (exit {batch.returncode}); see {self.work / (tag + '.out.txt')}")
        self.assert_owned()  # and nothing went wrong while it ran
        return text

    def _stop_batch(self, batch):
        """Kill our batch's whole process group (mcp-call and its MCP server) and wait for it."""
        if batch is not None:
            try:
                os.killpg(batch.pid, 9)  # the whole group: mcp-call and its MCP server
            except OSError:
                pass
            batch.wait()
            # members whose parent died were re-parented to us (child subreaper): reap them too, so nothing of
            # the group is left, not even a zombie
            deadline = time.time() + 5
            while True:
                try:
                    pid, _ = os.waitpid(-batch.pid, os.WNOHANG)
                except ChildProcessError:
                    break
                if pid == 0:
                    if time.time() > deadline:
                        raise SystemExit(f"{self.label}: processes of batch group {batch.pid} survived SIGKILL; stopping")
                    time.sleep(0.05)
        with self._lock:
            if self._batch is batch:
                self._batch = None

    def close(self):
        # order matters: first refuse every further tool request for good, then stop our running batch,
        # and only then stop the watcher
        self.closed = True
        marker = getattr(self, "dead_marker", None)
        if marker is not None and not marker.exists():
            marker.write_text("session closed")
        with self._lock:
            batch = self._batch
        self._stop_batch(batch)
        self._stop.set()
        if getattr(self, "_watch", None) is not None:
            self._watch.join(timeout=5)
        for p in (self.editor, self.srv):
            if p is not None and p.poll() is None:
                p.kill()
                p.wait(timeout=10)
        if getattr(self, "proof_file", None) is not None:
            self.proof_file.unlink(missing_ok=True)
        (self.work / "ownership.json").write_text(json.dumps(
            {"isolation": self.iso, "server_pid": self.srv.pid, "port": int(self.port), "closed": True,
             "authenticated": getattr(self, "authenticated", None), "dead": self.dead,
             "foreign": self.foreign, "unattributed_client_sockets": getattr(self, "unattributed", 0),
             "headless_browsers": self.browsers, "editor_tab": self.editor_info}, indent=1, default=str))

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()
