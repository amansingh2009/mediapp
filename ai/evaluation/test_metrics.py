from metrics import score_case, transcription_errors


def test_transcription_errors_require_labels():
    assert transcription_errors(None, "unverified reading") == {"cer": None, "wer": None}
    assert transcription_errors("A B", "A C") == {"cer": 1 / 3, "wer": 1 / 2}


def test_wrong_drug_is_not_counted_as_correct_by_close_spelling():
    result = score_case([{"name": "Metformin"}], [{"name": "Meclformin"}])
    assert result["name_matches"] == 0
    assert result["name_f1"] == 0
