"""Summarize labeled benchmark errors without accessing personal uploads."""

import argparse
import json
from pathlib import Path


def summarize(report):
    rows = report.get("results", [])
    return {
        "documents": len(rows),
        "missed_names": [name for row in rows for name in row.get("missed_names", [])],
        "unmatched_candidates": [name for row in rows for name in row.get("unmatched_candidates", [])],
        "strength_mismatches": sum(not match["fields"].get("strength", True)
                                   for row in rows for match in row.get("matched_fields", [])),
        "instruction_mismatches": sum(not match["fields"].get("instruction", True)
                                      for row in rows for match in row.get("matched_fields", [])),
        "worst_latency_seconds": max((row.get("seconds", 0) for row in rows), default=None),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("report", type=Path)
    args = parser.parse_args()
    print(json.dumps(summarize(json.loads(args.report.read_text())), indent=2))


if __name__ == "__main__":
    main()
