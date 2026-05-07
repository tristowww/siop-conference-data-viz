"""Normalize SIOP Whova-style session exports into a compact CSV."""

from __future__ import annotations

import argparse
import re
from pathlib import Path

import pandas as pd


CORE_COLUMNS = {
    "session_id": "result_details_id",
    "program_type": "result_details_program_type",
    "title": "result_details_title",
    "description": "result_details_desc",
    "location": "result_details_loc",
    "date": "result_details_date",
    "start_time": "result_details_start",
    "end_time": "result_details_end",
    "start_ts": "result_details_start_ts",
    "end_ts": "result_details_end_ts",
    "adds": "result_interactions_total_count_add",
    "likes": "result_interactions_total_count_like",
    "comments": "result_interactions_total_count_comment",
}

TRACK_PREFIX = "result_details_tracks_"
SPEAKER_PATTERN = re.compile(r"result_details_speaker_group_\d+_list_\d+_name$")
SESSION_ID_PATTERN = re.compile(r"\(Session ID\s+([^)]*)\)", re.IGNORECASE)
SESSION_FORMAT_PATTERN = re.compile(r"\[([^\]]+)\]")


def clean_text(value: object) -> str:
    if pd.isna(value):
        return ""
    return re.sub(r"\s+", " ", str(value)).strip()


def extract_tracks(row: pd.Series) -> str:
    tracks = []
    for col in row.index:
        if col.startswith(TRACK_PREFIX):
            value = clean_text(row[col])
            if value and value not in tracks:
                tracks.append(value)
    return " | ".join(tracks)


def extract_speakers(row: pd.Series) -> str:
    names = []
    for col in row.index:
        if SPEAKER_PATTERN.match(col):
            value = clean_text(row[col])
            if value and value not in names:
                names.append(value)
    return " | ".join(names)


def extract_display_session_id(title: str) -> str:
    match = SESSION_ID_PATTERN.search(title)
    return match.group(1).strip() if match else ""


def extract_session_format(description: str) -> str:
    match = SESSION_FORMAT_PATTERN.search(description)
    return match.group(1).strip() if match else ""


def normalize(input_path: Path, year: int) -> pd.DataFrame:
    source = pd.read_excel(input_path, sheet_name=0)
    normalized = pd.DataFrame()

    for output_col, input_col in CORE_COLUMNS.items():
        normalized[output_col] = source[input_col] if input_col in source.columns else ""

    normalized["conference_year"] = year
    normalized["title"] = normalized["title"].map(clean_text)
    normalized["description"] = normalized["description"].map(clean_text)
    normalized["tracks"] = source.apply(extract_tracks, axis=1)
    normalized["speakers"] = source.apply(extract_speakers, axis=1)
    normalized["display_session_id"] = normalized["title"].map(extract_display_session_id)
    normalized["session_format"] = normalized["description"].map(extract_session_format)

    for col in ["adds", "likes", "comments"]:
        normalized[col] = pd.to_numeric(normalized[col], errors="coerce").fillna(0).astype(int)

    ordered = [
        "conference_year",
        "session_id",
        "display_session_id",
        "program_type",
        "session_format",
        "title",
        "description",
        "date",
        "start_time",
        "end_time",
        "start_ts",
        "end_ts",
        "location",
        "tracks",
        "speakers",
        "adds",
        "likes",
        "comments",
    ]

    return normalized[ordered].sort_values(["date", "start_time", "title"], na_position="last")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--year", required=True, type=int)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()

    output = normalize(args.input, args.year)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    output.to_csv(args.output, index=False)
    print(f"Wrote {len(output):,} rows to {args.output}")


if __name__ == "__main__":
    main()
