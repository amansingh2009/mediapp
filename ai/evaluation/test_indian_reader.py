import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "inference"))
from indian_qwen import parse_response


def test_missing_instruction_is_not_invented():
    result = parse_response(json.dumps({
        "doctor_name": "Dr. Example",
        "clinic_name": "Example Clinic",
        "medications": [{"drug_name": "Unreadable 16", "frequency": "", "dosage": ""}],
    }))
    assert result["review_required"] is True
    assert result["medicines"][0]["dosage"] == ""
    assert result["medicines"][0]["confidence"] is None
    assert result["medicines"][0]["verified"] is False


def test_invalid_model_output_is_rejected():
    with pytest.raises((ValueError, json.JSONDecodeError)):
        parse_response("The patient should take a pill")
    with pytest.raises(ValueError):
        parse_response('{"medications":["Metformin"]}')
