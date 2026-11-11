#!/usr/bin/env python3
"""Check an assembled cut for the two failures that pass a visual glance.

A phrase that appears twice means two windows covered the same words, so the
same line plays twice. Silence at the very start means the first cut landed
before the speech. Both come from trusting word timestamps instead of the
waveform.

Reads words.json for the assembled file, the same shape transcribe.py writes,
and exits non-zero unless the cut is clean. A cut is not done until it is.
"""

import argparse
import json
import sys


def repeats(words, longest=6):
    """Phrases of 1 to `longest` words that occur more than once."""
    seen = {}
    for length in range(1, longest + 1):
        for index in range(len(words) - length + 1):
            phrase = tuple(word["text"].lower() for word in words[index:index + length])
            seen.setdefault(phrase, []).append(index)
    return {phrase: hits for phrase, hits in seen.items() if len(hits) > 1}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--words", required=True, help="words.json transcribed from the assembled cut")
    parser.add_argument("--max-lead", type=float, default=0.05,
                        help="silence allowed before the first word, in seconds (default 0.05)")
    args = parser.parse_args()

    transcript = json.load(open(args.words))
    words = transcript["words"]
    problems = []

    if not words:
        problems.append("the cut transcribes as silence")
    else:
        lead = words[0]["start"]
        if lead > args.max_lead:
            problems.append(f"{lead:.3f}s of silence before the first word")
        for index, word in enumerate(words, start=1):
            start, end = word.get("start"), word.get("end")
            # Recognizers give a short filler a zero-length range, so only a
            # range that runs backwards is malformed.
            if not isinstance(start, (int, float)) or not isinstance(end, (int, float)) \
                    or end < start or start < 0:
                problems.append(f"word {index} has a time range that runs backwards")
        for phrase, hits in sorted(repeats(words).items(), key=lambda item: -len(item[0])):
            # A repeated single common word is speech. A repeated run of three or
            # more is the same line played twice.
            if len(phrase) >= 3:
                problems.append(f"\"{' '.join(phrase)}\" occurs {len(hits)} times")

    if problems:
        print("CONTENT: failed")
        for problem in problems:
            print(f"  {problem}")
        return 1

    print(f"CONTENT: clean ({len(words)} words)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
