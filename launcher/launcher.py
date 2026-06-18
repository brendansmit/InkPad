import tkinter as tk
import subprocess, threading, os, time, socket

BASE  = os.path.dirname(os.path.abspath(__file__))
ROOT  = os.path.dirname(BASE)
LOGO  = "/Users/brendansmit/Documents/InkHeron/Logo.png"

# Absolute runtime paths
PY_FLASK  = "/Library/Frameworks/Python.framework/Versions/3.12/bin/python3"
PY_VENV   = os.path.join(ROOT, "Writing analyzer", ".venv", "bin", "python")
NODE      = "/usr/local/bin/node"


# ── helpers ────────────────────────────────────────────────────────────────────

def _port_open(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(("localhost", port)) == 0

def _wait(port, timeout=10):
    for _ in range(timeout * 5):
        if _port_open(port):
            return
        time.sleep(0.2)

def _open(url):
    subprocess.Popen(["open", url])

def _bg(cmd, cwd):
    subprocess.Popen(cmd, cwd=cwd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


# ── launchers ──────────────────────────────────────────────────────────────────

def launch_grade_importer():
    d = os.path.join(ROOT, "grade-importer")
    if not _port_open(5050):
        _bg([PY_FLASK, "app.py"], d)
        _wait(5050)
    _open("http://localhost:5050")

def launch_writing_analyzer():
    d = os.path.join(ROOT, "Writing analyzer")
    py = PY_VENV if os.path.exists(PY_VENV) else PY_FLASK
    _bg([py, "app.py"], d)

def launch_maestro():
    d = os.path.join(ROOT, "class-grouper")
    if not _port_open(3456):
        _bg([NODE, "server.js"], d)
        _wait(3456)
    _open("http://localhost:3456/v2/")

def launch_bugsmash():
    html = os.path.join(ROOT, "bug-detector", "index.html")
    subprocess.Popen(["open", html])

def launch_speed_dating():
    d = os.path.join(ROOT, "speed-dating")
    if not _port_open(3464):
        _bg([NODE, "server.js"], d)
        _wait(3464)
    _open("http://localhost:3464")


# ── app definitions ────────────────────────────────────────────────────────────

APPS = [
    {"name": "Grade\nImporter",   "short": "GI", "desc": "Import & export grades",     "color": "#3b82f6", "fn": launch_grade_importer},
    {"name": "Writing\nAnalyzer", "short": "WA", "desc": "Essay revision tracker",     "color": "#8b5cf6", "fn": launch_writing_analyzer},
    {"name": "Maestro",           "short": "M",  "desc": "Group & seating tool",       "color": "#10b981", "fn": launch_maestro},
    {"name": "BugSmash",          "short": "BS", "desc": "Code debugging helper",      "color": "#f59e0b", "fn": launch_bugsmash},
    {"name": "Speed\nDating",     "short": "SD", "desc": "Venue layout builder",       "color": "#ef4444", "fn": launch_speed_dating},
]


# ── colours ────────────────────────────────────────────────────────────────────

BG          = "#0f1117"
CARD_IDLE   = "#1a1d2e"
CARD_HOVER  = "#22263a"
CARD_PRESS  = "#2d3250"
TEXT        = "#f1f5f9"
MUTED       = "#64748b"
DIVIDER     = "#1e2235"


# ── card widget ────────────────────────────────────────────────────────────────

class AppCard(tk.Canvas):
    W, H, R = 138, 172, 14

    def __init__(self, parent, app, on_launch, **kw):
        super().__init__(parent, width=self.W, height=self.H,
                         bg=BG, highlightthickness=0, **kw)
        self.app = app
        self.on_launch = on_launch
        self._state = "idle"
        self._draw()
        self.bind("<Enter>",    self._on_enter)
        self.bind("<Leave>",    self._on_leave)
        self.bind("<Button-1>", self._on_down)
        self.bind("<ButtonRelease-1>", self._on_up)

    # ── drawing ────────────────────────────────────────────────────────────────

    def _draw(self):
        self.delete("all")
        W, H, R = self.W, self.H, self.R
        bg = {"idle": CARD_IDLE, "hover": CARD_HOVER, "press": CARD_PRESS}[self._state]
        color = self.app["color"]

        # Card body
        self._rrect(0, 0, W, H, R, fill=bg, outline="")

        # Accent bar
        self._rrect(0, 0, W, 5, 3, fill=color, outline="")

        # Icon circle
        cx, cy, cr = W // 2, 62, 30
        self.create_oval(cx - cr, cy - cr, cx + cr, cy + cr, fill=CARD_IDLE, outline=color, width=2)
        self.create_text(cx, cy, text=self.app["short"],
                         font=("SF Pro Display", 15, "bold"), fill=color, anchor="center")

        # App name
        self.create_text(W // 2, 108, text=self.app["name"],
                         font=("SF Pro Display", 13, "bold"), fill=TEXT,
                         anchor="center", justify="center")

        # Description
        self.create_text(W // 2, 148, text=self.app["desc"],
                         font=("SF Pro Text", 10), fill=MUTED,
                         anchor="center", justify="center", width=W - 16)

    def _rrect(self, x1, y1, x2, y2, r, **kw):
        self.create_polygon(
            x1+r, y1,  x2-r, y1,
            x2,   y1,  x2,   y1+r,
            x2,   y2-r, x2,  y2,
            x2-r, y2,  x1+r, y2,
            x1,   y2,  x1,   y2-r,
            x1,   y1+r, x1,  y1,
            smooth=True, **kw)

    # ── events ─────────────────────────────────────────────────────────────────

    def _on_enter(self, _):
        self._state = "hover"; self._draw()

    def _on_leave(self, _):
        self._state = "idle"; self._draw()

    def _on_down(self, _):
        self._state = "press"; self._draw()

    def _on_up(self, _):
        self._state = "hover"; self._draw()
        self.on_launch(self.app)


# ── main window ────────────────────────────────────────────────────────────────

class Launcher(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("InkHeron Apps")
        self.configure(bg=BG)
        self.resizable(False, False)

        W = len(APPS) * AppCard.W + (len(APPS) - 1) * 12 + 48
        H = AppCard.H + 130
        sw, sh = self.winfo_screenwidth(), self.winfo_screenheight()
        self.geometry(f"{W}x{H}+{(sw-W)//2}+{(sh-H)//2}")

        self._logo = None
        self._load_logo()
        self._build()

    def _load_logo(self):
        try:
            from PIL import Image, ImageTk
            img = Image.open(LOGO).convert("RGBA")
            h = 42
            w = int(img.width * h / img.height)
            self._logo = ImageTk.PhotoImage(img.resize((w, h), Image.LANCZOS))
            # Dock icon
            big = ImageTk.PhotoImage(img.resize((256, 256), Image.LANCZOS))
            self.wm_iconphoto(True, big)
            self._logo_big = big
        except Exception:
            pass

    def _build(self):
        # ── header ─────────────────────────────────────────────────────────────
        header = tk.Frame(self, bg=BG)
        header.pack(fill="x", padx=24, pady=(20, 0))

        if self._logo:
            tk.Label(header, image=self._logo, bg=BG).pack(side="left", padx=(0, 14))

        text_col = tk.Frame(header, bg=BG)
        text_col.pack(side="left")
        tk.Label(text_col, text="InkHeron Apps",
                 font=("SF Pro Display", 20, "bold"), bg=BG, fg=TEXT).pack(anchor="w")
        tk.Label(text_col, text="Select an app to launch",
                 font=("SF Pro Text", 12), bg=BG, fg=MUTED).pack(anchor="w")

        # ── divider ────────────────────────────────────────────────────────────
        tk.Frame(self, bg=DIVIDER, height=1).pack(fill="x", padx=24, pady=(14, 16))

        # ── card grid ──────────────────────────────────────────────────────────
        grid = tk.Frame(self, bg=BG)
        grid.pack(padx=24)

        for i, app in enumerate(APPS):
            card = AppCard(grid, app, self._launch)
            card.grid(row=0, column=i, padx=6)

        # ── status bar ─────────────────────────────────────────────────────────
        self._status = tk.StringVar(value="")
        tk.Label(self, textvariable=self._status,
                 font=("SF Pro Text", 11), bg=BG, fg=MUTED).pack(pady=(14, 0))

    def _launch(self, app):
        name = app["name"].replace("\n", " ")
        self._status.set(f"Launching {name}…")
        self.update()

        def run():
            try:
                app["fn"]()
                self.after(0, lambda: self._status.set(f"{name} is open."))
                self.after(3000, lambda: self._status.set(""))
            except Exception as e:
                self.after(0, lambda: self._status.set(f"Error: {e}"))

        threading.Thread(target=run, daemon=True).start()


if __name__ == "__main__":
    Launcher().mainloop()
