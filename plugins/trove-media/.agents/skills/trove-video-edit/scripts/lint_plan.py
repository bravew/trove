#!/usr/bin/env python3
"""Reject an edit plan that would render as a blank or a contradiction.

The render trusts the plan, so the plan has to be checked first. A beat with no
reason, a time range that runs backwards, two beats covering the same moment, or
an asset that is not on disk all fail here, before any frame is drawn.

Exits non-zero and prints one line per problem. Says nothing when the plan is
sound.
"""

import argparse
import json
import sys
from pathlib import Path

import math

# references/edit-plan.schema.json is the list. A caption renders its text, so
# one with none is a blank beat, the same failure the others have.
KINDS = {"caption", "title", "callout", "stat", "quote", "comparison", "list", "image", "zoom"}
NEEDS_TEXT = KINDS - {"image", "zoom"}
NEEDS_ASSET = {"image"}


def problems(plan, root, fps=30):
    found = []
    source = plan.get("source")
    if not isinstance(source, str) or not source.strip() or "/" in source or source.startswith("."):
        found.append("plan: source must be the bare filename copied into public/")
    duration = plan.get("duration")
    occupied = None
    for index, beat in enumerate(plan.get("beats", []), start=1):
        where = f"beat {index} ({beat.get('kind', '?')})"
        start, end = beat.get("start"), beat.get("end")
        if isinstance(start, bool) or isinstance(end, bool) \
                or not isinstance(start, (int, float)) or not isinstance(end, (int, float)) \
                or not math.isfinite(start) or not math.isfinite(end):
            found.append(f"{where}: start and end must be finite numbers")
            continue
        if start < 0:
            found.append(f"{where}: starts at {start}s, before the source")
        if end <= start:
            found.append(f"{where}: ends at {end}s, before it starts at {start}s")
        if duration is not None and end > duration:
            found.append(f"{where}: ends at {end}s, past the source duration of {duration}s")
        # The render rounds each edge to a frame on its own, so two beats that
        # only touch in seconds can still draw on the same frame.
        first = round(start * fps)
        last = first + max(1, round((end - start) * fps)) - 1
        if occupied is not None and first <= occupied:
            found.append(f"{where}: shares a frame with the previous beat")
        occupied = last

        kind = beat.get("kind")
        if kind not in KINDS:
            found.append(f"{where}: {kind} is not a beat kind")
        if kind in NEEDS_TEXT and not beat.get("text"):
            found.append(f"{where}: needs text, otherwise it renders blank")
        if kind in NEEDS_ASSET:
            asset = beat.get("asset")
            if not asset:
                found.append(f"{where}: needs an asset the user supplied")
            elif not (root / asset).is_file():
                found.append(f"{where}: asset {asset} is not a file")
        if not str(beat.get("reason", "")).strip():
            found.append(f"{where}: needs a reason")
        if not str(beat.get("anchor", "")).strip():
            found.append(f"{where}: needs the words it lands on")
    return found


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("plan")
    parser.add_argument("--duration", type=float, help="source duration in seconds, from the probe")
    parser.add_argument("--assets", default=".", help="directory the asset paths are relative to")
    # The plan carries no frame rate. The composition does, and it defaults to 30.
    parser.add_argument("--fps", type=float, default=30,
                        help="frame rate the composition renders at (default 30)")
    args = parser.parse_args()
    if not math.isfinite(args.fps) or args.fps <= 0:
        parser.error("--fps must be a positive number")

    plan = json.loads(Path(args.plan).read_text())
    if args.duration is not None:
        plan["duration"] = args.duration
    found = problems(plan, Path(args.assets), args.fps)
    if found:
        print(f"PLAN: failed ({len(found)})")
        for line in found:
            print(f"  {line}")
        return 1
    print(f"PLAN: sound ({len(plan.get('beats', []))} beats)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
