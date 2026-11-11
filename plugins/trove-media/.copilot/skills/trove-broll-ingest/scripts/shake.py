#!/usr/bin/env python3
"""Score how much a clip shakes, so a stabilize decision has a number behind it.

Samples frames at a fixed step, scales each to a small grayscale image, and
reports the mean absolute difference between consecutive frames. A locked shot
that jitters scores high. A deliberate pan or tilt also scores high, so the
number alone never decides. Stabilize only a locked shot, and only keep the
result when its score is lower than the original.

This is the one place in the skill that calls ffmpeg directly. trove-ffmpeg's
look.py writes a contact sheet, and the score needs the separate frames behind
it. The command only extracts scaled frames to a temporary directory.

Needs Pillow, which is optional. Says so and exits non-zero when it is absent
instead of installing it.
"""

import argparse
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

try:
    from PIL import Image, ImageStat
except ImportError:
    Image = None


def frames(source, step, directory):
    """Extract one grayscale frame every `step` seconds."""
    subprocess.run(
        ["ffmpeg", "-v", "error", "-i", str(source), "-vf", f"fps=1/{step},scale=64:64,format=gray",
         str(directory / "f%04d.png")],
        check=True,
    )
    return sorted(directory.glob("f*.png"))


def mean_difference(paths):
    values = []
    previous = None
    for path in paths:
        current = Image.open(path).tobytes()
        if previous is not None:
            values.append(sum(abs(a - b) for a, b in zip(previous, current)) / len(current))
        previous = current
    if not values:
        raise SystemExit("the clip yielded fewer than two frames")
    return sum(values) / len(values)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source")
    parser.add_argument("--step", type=float, default=0.5, help="seconds between samples (default 0.5)")
    args = parser.parse_args()

    if Image is None:
        raise SystemExit("Pillow is not installed. The score needs it: pip install Pillow")
    if shutil.which("ffmpeg") is None:
        raise SystemExit("ffmpeg is not on PATH")

    with tempfile.TemporaryDirectory() as scratch:
        paths = frames(Path(args.source), args.step, Path(scratch))
        score = mean_difference(paths)
    # 0 means identical frames. Read it against the same shot's other version,
    # not against a fixed cutoff: a moving camera scores high on purpose.
    print(f"{score:.2f}")


if __name__ == "__main__":
    sys.exit(main())
