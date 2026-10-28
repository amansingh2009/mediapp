"""Strict, transparent prescription-field scoring for labeled examples."""

import re


def normalize(value):
    return re.sub(r"\s+", " ", str(value or "").strip()).casefold()


def edit_distance(reference, prediction):
    previous = list(range(len(prediction) + 1))
    for index, expected in enumerate(reference, 1):
        current = [index]
        for other, actual in enumerate(prediction, 1):
            current.append(min(current[-1] + 1, previous[other] + 1,
                               previous[other - 1] + (expected != actual)))
        previous = current
    return previous[-1]


def transcription_errors(reference, prediction):
    """Return CER/WER only when a human-verified transcription exists."""
    if reference is None:
        return {"cer": None, "wer": None}
    expected, actual = normalize(reference), normalize(prediction)
    words, predicted_words = expected.split(), actual.split()
    return {
        "cer": edit_distance(expected, actual) / max(1, len(expected)),
        "wer": edit_distance(words, predicted_words) / max(1, len(words)),
    }


def score_case(expected, actual):
    """Exact medicine names are required before evaluating other fields."""
    unused = list(actual)
    matched = []
    misses = []
    for target in expected:
        index = next((i for i, row in enumerate(unused) if normalize(row.get("name")) == normalize(target["name"])), None)
        if index is None:
            misses.append(target["name"])
            continue
        row = unused.pop(index)
        fields = {key: normalize(row.get(key)) == normalize(target.get(key)) for key in ("strength", "instruction") if target.get(key)}
        matched.append({"name": target["name"], "fields": fields})
    return {
        "expected": len(expected),
        "predicted": len(actual),
        "name_matches": len(matched),
        "name_precision": len(matched) / len(actual) if actual else None,
        "name_recall": len(matched) / len(expected) if expected else None,
        "name_f1": 2 * len(matched) / (len(expected) + len(actual)) if expected or actual else None,
        "missed_names": misses,
        "unmatched_candidates": [row.get("name", "") for row in unused],
        "matched_fields": matched,
    }
