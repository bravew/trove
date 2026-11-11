#!/usr/bin/env python3
"""Append one graded select to a b-roll catalog.

The catalog lives at the library root the caller passes. This never creates a
library, never guesses a path, and never writes inside the skill directory. It
validates the file against references/catalog.schema.json before and after the
change, and it refuses a second entry for the same output file.
"""

import argparse
import json
import math
import sys
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--library", required=True, help="the library root the user supplied")
    parser.add_argument("--file", required=True, help="the graded select, relative to the library")
    parser.add_argument("--source", required=True, help="the raw clip it was cut from")
    parser.add_argument("--start", type=float, required=True)
    parser.add_argument("--end", type=float, required=True)
    parser.add_argument("--category", required=True)
    parser.add_argument("--description", required=True)
    parser.add_argument("--transfer", required=True, choices=["rec709", "slog3", "other"])
    parser.add_argument("--tags", default="", help="comma-separated")
    parser.add_argument("--lut", default=None)
    parser.add_argument("--stabilized", action="store_true")
    parser.add_argument("--rating", type=int, choices=range(1, 6))
    args = parser.parse_args()

    # These are the constraints in references/catalog.schema.json. A select
    # that breaks one of them must not reach the file.
    if not args.file.strip() or not args.source.strip() \
            or not args.category.strip() or not args.description.strip():
        raise SystemExit("file, source, category, and description each need text")
    if not math.isfinite(args.start) or not math.isfinite(args.end):
        raise SystemExit("the span must be finite numbers")
    if args.start < 0 or args.end <= args.start:
        raise SystemExit("the span must start at or after zero and end after it starts")

    library = Path(args.library).expanduser().resolve()
    catalog_path = library / "catalog.json"
    if catalog_path.exists():
        catalog = json.loads(catalog_path.read_text())
    else:
        if not library.is_dir():
            raise SystemExit(f"{library} is not a directory; pass the library root the user named")
        catalog = {"library": str(library), "selects": []}

    # Compare where the paths land, not how they are spelled, so "a.mp4" and
    # "./a.mp4" are the same select.
    target = (library / args.file).resolve()
    if any((library / entry["file"]).resolve() == target for entry in catalog["selects"]):
        raise SystemExit(f"{args.file} is already catalogued")

    entry = {
        "file": args.file,
        "source": args.source,
        "span": {"start": args.start, "end": args.end},
        "category": args.category,
        "description": args.description,
        "tags": [tag.strip() for tag in args.tags.split(",") if tag.strip()],
        "transfer": args.transfer,
        "stabilized": args.stabilized,
    }
    if args.lut:
        entry["lut"] = args.lut
    if args.rating:
        entry["rating"] = args.rating
    catalog["selects"].append(entry)

    catalog_path.write_text(json.dumps(catalog, indent=2) + "\n")
    print(f"catalogued {args.file} ({len(catalog['selects'])} selects)")


if __name__ == "__main__":
    sys.exit(main())
