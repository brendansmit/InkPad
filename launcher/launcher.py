import tkinter as tk
import subprocess
import threading
import os
import time
import socket

BASE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(BASE)


def port_in_use(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(("localhost", port)) == 0


def launch_grade_importer():
    if not port_in_use(5050):
        app_dir = os.path.join(ROOT, "grade-importer")
        python = _find_python()
        subprocess.Popen(
            [python, "app.py"],
            cwd=app_dir,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        _wait_for_port(5050)
    subprocess.Popen(["open", "http://localhost:5050"])


def launch_writing_analyzer():
    app_dir = os.path.join(ROOT, "Writing analyzer")
    venv_python = os.path.join(app_dir, ".venv", "bin", "python")
    python = venv_python if os.path.exists(venv_python) else _find_python()
    subprocess.Popen(
        [python, "app.py"],
        cwd=app_dir,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def launch_class_grouper():
    if not port_in_use(3456):
        app_dir = os.path.join(ROOT, "class-grouper")
        node = _find_node()
        subprocess.Popen(
            [node, "server.js"],
            cwd=app_dir,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        _wait_for_port(3456)
    subprocess.Popen(["open", "http://localhost:3456/v2/"])


def launch_bug_detector():
    html = os.path.join(ROOT, "bug-detector", "index.html")
    subprocess.Popen(["open", html])


def launch_speed_dating():
    if not port_in_use(3464):
        app_dir = os.path.join(ROOT, "speed-dating")
        node = _find_node()
        subprocess.Popen(
            [node, "server.js"],
            cwd=app_dir,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        _wait_for_port(3464)
    subprocess.Popen(["open", "http://localhost:3464"])


def _wait_for_port(port, timeout=8):
    start = time.time()
    while time.time() - start < timeout:
        if port_in_use(port):
            return
        time.sleep(0.2)


def _find_python():
    for p in ["/usr/bin/python3", "/usr/local/bin/python3", "/opt/homebrew/bin/python3"]:
        if os.path.exists(p):
            return p
    return "python3"


def _find_node():
    for p in ["/opt/homebrew/bin/node", "/usr/local/bin/node"]:
        if os.path.exists(p):
            return p
    # Try nvm
    nvm_dir = os.path.expanduser("~/.nvm/versions/node")
    if os.path.isdir(nvm_dir):
        versions = sorted(os.listdir(nvm_dir))
        if versions:
            return os.path.join(nvm_dir, versions[-1], "bin", "node")
    return "node"


APPS = [
    {
        "name": "Grade Importer",
        "emoji": "📊",
        "desc": "Import & export grades",
        "color": "#3b82f6",
        "fn": launch_grade_importer,
    },
    {
        "name": "Writing Analyzer",
        "emoji": "✍️",
        "desc": "Essay revision tracker",
        "color": "#8b5cf6",
        "fn": launch_writing_analyzer,
    },
    {
        "name": "Class Grouper",
        "emoji": "🎲",
        "desc": "Group & seating tool",
        "color": "#10b981",
        "fn": launch_class_grouper,
    },
    {
        "name": "Bug Detector",
        "emoji": "🐛",
        "desc": "Code debugging helper",
        "color": "#f59e0b",
        "fn": launch_bug_detector,
    },
    {
        "name": "Speed Dating",
        "emoji": "💘",
        "desc": "Venue layout builder",
        "color": "#ef4444",
        "fn": launch_speed_dating,
    },
]

BG = "#0f1117"
CARD_BG = "#1e2130"
CARD_HOVER = "#262b3d"
TEXT_WHITE = "#f1f5f9"
TEXT_MUTED = "#64748b"


class AppCard(tk.Canvas):
    def __init__(self, parent, app, on_launch, **kwargs):
        super().__init__(parent, bg=BG, highlightthickness=0, cursor="hand2", **kwargs)
        self.app = app
        self.on_launch = on_launch
        self._draw(CARD_BG)
        self.bind("<Enter>", self._hover)
        self.bind("<Leave>", self._leave)
        self.bind("<Button-1>", self._click)

    def _draw(self, bg):
        self.delete("all")
        w = int(self["width"])
        h = int(self["height"])
        r = 12

        # Rounded rect
        self._round_rect(0, 0, w, h, r, fill=bg, outline="")

        # Color accent bar top
        self._round_rect(0, 0, w, 4, 2, fill=self.app["color"], outline="")

        # Emoji
        self.create_text(w // 2, 38, text=self.app["emoji"], font=("Apple Color Emoji", 26), anchor="center")

        # Name
        self.create_text(w // 2, 72, text=self.app["name"], font=("-apple-system", 13, "bold"),
                         fill=TEXT_WHITE, anchor="center")

        # Desc
        self.create_text(w // 2, 90, text=self.app["desc"], font=("-apple-system", 10),
                         fill=TEXT_MUTED, anchor="center")

    def _round_rect(self, x1, y1, x2, y2, r, **kw):
        self.create_polygon(
            x1 + r, y1,
            x2 - r, y1,
            x2, y1,
            x2, y1 + r,
            x2, y2 - r,
            x2, y2,
            x2 - r, y2,
            x1 + r, y2,
            x1, y2,
            x1, y2 - r,
            x1, y1 + r,
            x1, y1,
            smooth=True, **kw
        )

    def _hover(self, _):
        self._draw(CARD_HOVER)

    def _leave(self, _):
        self._draw(CARD_BG)

    def _click(self, _):
        self._draw(self.app["color"] + "33")
        self.on_launch(self.app)


class Launcher(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("InkHeron Apps")
        self.configure(bg=BG)
        self.resizable(False, False)

        # Centre on screen
        w, h = 520, 280
        sw = self.winfo_screenwidth()
        sh = self.winfo_screenheight()
        self.geometry(f"{w}x{h}+{(sw-w)//2}+{(sh-h)//2}")

        self._build()

    def _build(self):
        # Header
        header = tk.Frame(self, bg=BG)
        header.pack(fill="x", padx=20, pady=(18, 4))

        tk.Label(header, text="InkHeron Apps", font=("-apple-system", 16, "bold"),
                 bg=BG, fg=TEXT_WHITE).pack(side="left")
        tk.Label(header, text="click to launch", font=("-apple-system", 11),
                 bg=BG, fg=TEXT_MUTED).pack(side="left", padx=(8, 0))

        # Divider
        div = tk.Frame(self, bg="#2d3348", height=1)
        div.pack(fill="x", padx=20, pady=(6, 14))

        # Cards grid
        grid = tk.Frame(self, bg=BG)
        grid.pack(padx=16, pady=(0, 16))

        card_w, card_h = 88, 106
        cols = 5
        gap = 8

        for i, app in enumerate(APPS):
            col = i % cols
            row = i // cols
            card = AppCard(grid, app, self._launch,
                           width=card_w, height=card_h)
            card.grid(row=row, column=col, padx=gap // 2, pady=gap // 2)

        # Status bar
        self.status_var = tk.StringVar(value="")
        tk.Label(self, textvariable=self.status_var, font=("-apple-system", 10),
                 bg=BG, fg=TEXT_MUTED).pack(pady=(0, 10))

    def _launch(self, app):
        self.status_var.set(f"Launching {app['name']}…")
        self.update()

        def run():
            try:
                app["fn"]()
                self.after(0, lambda: self.status_var.set(f"{app['name']} opened."))
                self.after(2000, lambda: self.status_var.set(""))
            except Exception as e:
                self.after(0, lambda: self.status_var.set(f"Error: {e}"))

        threading.Thread(target=run, daemon=True).start()


if __name__ == "__main__":
    Launcher().mainloop()
