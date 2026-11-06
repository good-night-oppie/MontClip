"""Run one MontClip server for a demo script and talk to it over MCP, failing closed.

- fresh_dir(): the work directory must not exist yet, or be an empty real directory (no symlink);
  nothing in an existing directory is deleted or overwritten.
- Session: starts `node server.js` on a free port with its own FABLECUT_DATA_DIR, then proves that the
  socket listening on that port belongs to the process it started (Linux /proc: the listening socket's
  inode must be one of that process's open sockets). If that cannot be shown, it stops: an HTTP 200 alone
  could come from any other MontClip on the machine.
- Session.call(): runs mcp-call.cjs and stops on a non-zero exit (any tool error stops the run there).
"""
import json, os, pathlib, socket, subprocess, sys, time, urllib.request

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
        try:
            self._wait_until_ours()
        except BaseException:
            self.close()
            raise

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
        f = self.work / f"{tag}.json"
        f.write_text(json.dumps(calls, ensure_ascii=False, indent=1))
        r = subprocess.run(["node", str(HERE / "mcp-call.cjs"), str(f)], env=self.env, capture_output=True, text=True, timeout=1500)
        (self.work / f"{tag}.out.txt").write_text(r.stdout + r.stderr)
        print(r.stdout[:3000])
        if r.returncode != 0:
            raise SystemExit(f"{self.label}: MCP call failed in {tag} (exit {r.returncode}); see {self.work / (tag + '.out.txt')}")
        return r.stdout

    def close(self):
        if self.srv.poll() is None:
            self.srv.kill()
            self.srv.wait(timeout=10)

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()
