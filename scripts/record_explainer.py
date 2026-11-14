"""Record a dark-mode walkthrough of Super Hero File Manager.

The spoken voice is en-US-JennyNeural, the same voice used for the Project Grandma how-to.
Requires the Next dev server at http://127.0.0.1:3123 (mock files, not Electron).
"""
import asyncio
import re
import subprocess
import time
from pathlib import Path

import edge_tts
import imageio_ffmpeg
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
WORK = ROOT / "scripts" / "_explainer_work"
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
URL = "http://127.0.0.1:3123"
VOICE = "en-US-JennyNeural"
GAP = 0.35

BEATS = [
    ("ready", "stack", "Super Hero File Manager. Dark mode. The folder is on the left. The stack is the same folder, largest first."),
    ("down", "list", "Arrow down walks the stack. The callout names the item you are on."),
    ("space", "preview", "Space opens a preview, and you stay in the folder."),
    ("esc", "stack", "Escape closes the preview."),
    ("find", "find", "Control F finds a name in this folder. Tab would search every subfolder."),
    ("rail", "rail", "The right rail lists volumes. Press T, then choose a volume, to copy the selected item."),
    ("term", "term", "Control J opens a terminal in the folder you are looking at."),
    ("end", "stack", "That is the desk. List, stack, preview, find, transfer, and a terminal."),
]


def run(cmd):
    done = subprocess.run(cmd, capture_output=True, text=True)
    if done.returncode != 0:
        raise SystemExit((done.stderr or done.stdout or "ffmpeg failed")[-2000:])


def duration(path: Path) -> float:
    out = subprocess.run(
        [FFMPEG, "-i", str(path), "-f", "null", "-"],
        capture_output=True,
        text=True,
    ).stderr
    for line in out.splitlines():
        if "Duration:" in line:
            h, m, s = line.split("Duration:", 1)[1].split(",", 1)[0].strip().split(":")
            return int(h) * 3600 + int(m) * 60 + float(s)
    raise RuntimeError(f"no duration for {path}")


async def speak_all():
    WORK.mkdir(parents=True, exist_ok=True)
    paths = []
    for i, (_, _, text) in enumerate(BEATS):
        dest = WORK / f"line-{i:02d}.mp3"
        if not dest.exists() or dest.stat().st_size < 1000:
            await edge_tts.Communicate(text, VOICE, rate="-6%").save(str(dest))
        paths.append(dest)
    return paths


def patch_cues(starts, origin):
    lines = ["    const CUES = ["]
    for (i, (_, region, text)) in enumerate(BEATS):
        t = max(0, starts[i] - origin)
        safe = text.replace("\\", "\\\\").replace('"', '\\"')
        comma = "," if i < len(BEATS) - 1 else ""
        lines.append(f'      {{ t: {t:.2f}, region: "{region}", text: "{safe}" }}{comma}')
    lines.append("    ];")
    block = "\n".join(lines)
    view = DOCS / "view.html"
    html = view.read_text(encoding="utf-8")
    html, n = re.subn(
        r"/\* CUES:START \*/.*?/\* CUES:END \*/",
        "/* CUES:START */\n" + block + "\n    /* CUES:END */",
        html,
        count=1,
        flags=re.S,
    )
    if n != 1:
        raise SystemExit("could not patch voice cues")
    view.write_text(html, encoding="utf-8")


def main():
    lines = asyncio.run(speak_all())
    lengths = [duration(p) for p in lines]

    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            args=["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"],
        )
        context = browser.new_context(
            viewport={"width": 1280, "height": 720},
            color_scheme="dark",
            device_scale_factor=1,
        )
        page = context.new_page()
        page.add_init_script(
            """() => {
              localStorage.setItem('stark.theme', 'dark');
              document.documentElement.dataset.theme = 'dark';
              document.documentElement.style.colorScheme = 'dark';
            }"""
        )
        page.goto(URL, wait_until="domcontentloaded", timeout=60000)
        page.wait_for_selector(".dir-row", timeout=30000)
        page.wait_for_function(
            "() => { const s = document.querySelector('.status'); return s && !s.classList.contains('is-busy') && s.textContent.includes('READY'); }",
            timeout=180000,
        )
        page.wait_for_timeout(2500)
        record_t0 = time.perf_counter()
        starts = []

        frames_dir = WORK / "frames"
        frames_dir.mkdir(parents=True, exist_ok=True)
        for old in frames_dir.glob("*.jpg"):
            old.unlink()
        frames = []  # (seconds since record_t0, path)

        def grab():
            path = frames_dir / f"f{len(frames):05d}.jpg"
            before = time.perf_counter()
            page.screenshot(path=str(path), type="jpeg", quality=88)
            at = (before + time.perf_counter()) / 2 - record_t0
            frames.append((at, path))

        def hold(index, action=None):
            starts.append(time.perf_counter())
            if action:
                action()
            end_at = starts[-1] + lengths[index] + GAP
            while time.perf_counter() < end_at:
                grab()

        def ready():
            pass

        def down():
            page.keyboard.press("ArrowDown")
            page.wait_for_timeout(180)
            page.keyboard.press("ArrowDown")

        def space():
            page.keyboard.press("Space")
            page.wait_for_timeout(400)

        def esc():
            page.keyboard.press("Escape")

        def find():
            page.keyboard.press("Control+f")
            page.wait_for_timeout(200)
            page.keyboard.type("doc", delay=80)

        def rail():
            page.keyboard.press("Escape")
            page.wait_for_timeout(150)
            page.keyboard.press("t")

        def term():
            page.keyboard.press("Escape")
            page.wait_for_timeout(150)
            page.keyboard.press("Control+j")

        def end():
            page.keyboard.press("Escape")

        actions = {
            "ready": ready,
            "down": down,
            "space": space,
            "esc": esc,
            "find": find,
            "rail": rail,
            "term": term,
            "end": end,
        }
        for i, (key, _, _) in enumerate(BEATS):
            hold(i, actions[key])

        poster_at = starts[2] - record_t0
        total = time.perf_counter() - record_t0
        context.close()
        browser.close()

    # Each screenshot is shown from the moment it was taken until the next one.
    listing = WORK / "frames.txt"
    rows = []
    for i, (at, path) in enumerate(frames):
        nxt = frames[i + 1][0] if i + 1 < len(frames) else total
        start = 0.0 if i == 0 else at
        rows.append(f"file '{path.as_posix()}'")
        rows.append(f"duration {max(0.01, nxt - start):.3f}")
    rows.append(f"file '{frames[-1][1].as_posix()}'")
    listing.write_text("\n".join(rows), encoding="utf-8")
    raw = WORK / "screen.mp4"
    run([
        FFMPEG, "-y", "-f", "concat", "-safe", "0", "-i", str(listing),
        "-vf", "fps=30,format=yuv420p", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", str(raw),
    ])

    voice = WORK / "voice.m4a"
    filters, labels = [], []
    mix = [FFMPEG, "-y"]
    for line in lines:
        mix += ["-i", str(line)]
    for i, start in enumerate(starts):
        ms = max(0, int((start - record_t0) * 1000))
        filters.append(f"[{i}:a]adelay={ms}|{ms},apad=pad_dur=1[a{i}]")
        labels.append(f"[a{i}]")
    filters.append("".join(labels) + f"amix=inputs={len(starts)}:duration=longest:dropout_transition=0:normalize=0[a]")
    mix += ["-filter_complex", ";".join(filters), "-map", "[a]", "-c:a", "aac", "-b:a", "160k", str(voice)]
    run(mix)

    final = DOCS / "explainer.mp4"
    run([
        FFMPEG, "-y", "-i", str(raw), "-i", str(voice),
        "-map", "0:v:0", "-map", "1:a:0",
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "veryfast", "-crf", "23",
        "-c:a", "aac", "-shortest", str(final),
    ])
    poster = DOCS / "poster.jpg"
    run([
        FFMPEG, "-y", "-ss", f"{max(0, poster_at):.2f}", "-i", str(final),
        "-frames:v", "1", "-update", "1", str(poster),
    ])

    # A tight narration for the voice view, with the same words and the same gaps.
    tight = DOCS / "voice.mp3"
    concat = WORK / "concat.txt"
    silence = WORK / "gap.mp3"
    run([
        FFMPEG, "-y", "-f", "lavfi", "-i", "anullsrc=r=24000:cl=mono",
        "-t", str(GAP), "-c:a", "libmp3lame", "-q:a", "6", str(silence),
    ])
    parts = []
    for i, line in enumerate(lines):
        parts.append(f"file '{line.as_posix()}'")
        if i < len(lines) - 1:
            parts.append(f"file '{silence.as_posix()}'")
    concat.write_text("\n".join(parts), encoding="utf-8")
    run([FFMPEG, "-y", "-f", "concat", "-safe", "0", "-i", str(concat), "-c:a", "libmp3lame", "-q:a", "4", str(tight)])

    cursor = 0.0
    view_starts = []
    for i, length in enumerate(lengths):
        view_starts.append(cursor)
        cursor += length + (GAP if i < len(lengths) - 1 else 0)
    patch_cues(view_starts, 0)
    print("wrote", final)
    print("wrote", tight)


if __name__ == "__main__":
    main()
