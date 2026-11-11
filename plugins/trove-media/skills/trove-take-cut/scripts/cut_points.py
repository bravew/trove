#!/usr/bin/env python3
"""Refine each keeper window in takes.json to the real speech edges.

Word timestamps drift by up to a few tenths of a second, so they locate a take
but cannot place a cut. This scans the waveform inward from outside each
window: forward to the first sample above the threshold, back from the end to
the last. Scanning outward from the middle would stop at a pause inside the
line and split it.

The threshold is absolute, not relative to the window's peak. A loud line would
push a relative threshold high enough to clip the quiet word that opens it. The
default sits between a breath and a spoken word.

Prints a JSON array of {start, end} in seconds, one per line, for trove-ffmpeg's
cut.py --segments. The windows in takes.json are not modified.
"""

import argparse
import json
import math
import sys
import wave


def edges(samples, rate, start, end, threshold):
    """Speech onset and offset inside [start, end], in seconds."""
    first = max(0, int(start * rate))
    last = min(len(samples), int(end * rate))
    span = samples[first:last]
    if not span:
        raise SystemExit(f"window {start:.2f}-{end:.2f}s is outside the audio")
    loud = [index for index, sample in enumerate(span) if abs(sample) >= threshold]
    if not loud:
        raise SystemExit(
            f"nothing above {threshold} between {start:.2f}s and {end:.2f}s; "
            "the window is silence or the threshold is too high"
        )
    # A pulse one sample wide starts and ends on the same instant, and a cut
    # with no duration is dropped. Hold the offset open by one sample so the
    # span always contains the last loud sample.
    return (first + loud[0]) / rate, (first + loud[-1] + 1) / rate


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--audio", required=True, help="mono PCM WAV extracted from the source")
    parser.add_argument("--takes", required=True, help="takes.json decision record")
    parser.add_argument("--threshold", type=float, default=0.005,
                        help="absolute sample amplitude that counts as speech (default 0.005)")
    args = parser.parse_args()

    with wave.open(args.audio) as handle:
        if handle.getsampwidth() != 2 or handle.getnchannels() != 1:
            raise SystemExit("audio must be mono 16-bit PCM WAV")
        rate = handle.getframerate()
        raw = handle.readframes(handle.getnframes())
    samples = [int.from_bytes(raw[i:i + 2], "little", signed=True) / 32768
               for i in range(0, len(raw), 2)]

    record = json.load(open(args.takes))
    points = []
    for line in record["lines"]:
        window = line["window"]
        if window["end"] <= window["start"]:
            raise SystemExit(f"line {line['line']} has a window that ends before it starts")
        onset, offset = edges(samples, rate, window["start"], window["end"], args.threshold)
        # Round the onset down and the offset up, so a span shorter than the
        # reported precision still contains the speech instead of collapsing.
        start = math.floor(onset * 1000) / 1000
        end = math.ceil(offset * 1000) / 1000
        points.append({"line": line["line"], "start": start, "end": end})

    # Keepers stay in script order, but a line retaken late in the session sits
    # later in the source than the line after it. Compare them in source order.
    by_source = sorted(points, key=lambda point: point["start"])
    for earlier, later in zip(by_source, by_source[1:]):
        if later["start"] < earlier["end"]:
            print(
                f"line {earlier['line']} overlaps line {later['line']} in source time; "
                "two windows cover the same words", file=sys.stderr,
            )
            return 1

    json.dump(points, sys.stdout, indent=2)
    print()
    return 0


if __name__ == "__main__":
    sys.exit(main())
