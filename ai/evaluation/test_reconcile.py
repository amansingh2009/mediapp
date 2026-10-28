import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from inference.reconcile import reconcile


def test_disagreeing_readers_keep_both_unsafe_candidates():
    result = reconcile(
        {"medicines": [{"name": "Verlin 16", "dosage": ""}], "raw_text": "① Verlin 16"},
        {"medicines": [{"drug_name": "Vertin", "strength": "16 mg", "verified": True}]},
    )
    assert [row["name"] for row in result["candidates"]] == ["Verlin 16", "Vertin"]
    assert all(row["verified"] is False for row in result["candidates"])
    assert result["selection"] is None and result["review_required"] is True


def test_different_segmentation_is_not_aligned_by_position():
    result = reconcile({"medicines": []}, {"medicines": [{"drug_name": "Example"}]})
    assert len(result["candidates"]) == 1
    assert result["candidates"][0]["source"] == "indian_qwen"
    assert result["selection"] is None
