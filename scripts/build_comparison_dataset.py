"""Build a shared comparison table from normalized SIOP session datasets."""

from __future__ import annotations

import argparse
from pathlib import Path

import pandas as pd


DATE_LABELS_2026 = {
    "Wednesday, April 29": "2026-04-29",
    "Thursday, April 30": "2026-04-30",
    "Friday, May 1": "2026-05-01",
    "Saturday, May 2": "2026-05-02",
}


def common_from_2025(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path)
    return pd.DataFrame(
        {
            "conference_year": df["conference_year"],
            "session_id": df["session_id"],
            "display_session_id": df["display_session_id"],
            "title": df["title"],
            "date": df["date"],
            "date_label": df["date"],
            "start_time": df["start_time"],
            "end_time": df["end_time"],
            "location": df["location"],
            "tracks": df["tracks"],
            "speakers": df["speakers"],
            "speaker_affiliations": "",
            "description": df["description"],
            "session_format": df["session_format"],
            "adds": df["adds"],
            "likes": df["likes"],
            "comments": df["comments"],
            "source": "2025 Whova export workbook",
        }
    )


def common_from_2026_public(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path)
    is_enriched = "date" in df.columns and "description" in df.columns
    return pd.DataFrame(
        {
            "conference_year": df["conference_year"],
            "session_id": df["session_id"] if "session_id" in df else "",
            "display_session_id": df["display_session_id"],
            "title": df["title"],
            "date": df["date"] if is_enriched else df["date_label"].map(DATE_LABELS_2026).fillna(""),
            "date_label": df["date_label"],
            "start_time": df["start_time"],
            "end_time": df["end_time"],
            "location": df["location"],
            "tracks": df["tracks"],
            "speakers": df["speakers"],
            "speaker_affiliations": df["speaker_affiliations"] if "speaker_affiliations" in df else "",
            "description": df["description"] if "description" in df else "",
            "session_format": df["session_format"] if "session_format" in df else "",
            "adds": pd.NA,
            "likes": pd.NA,
            "comments": pd.NA,
            "source": "2026 public SIOP Whova agenda API" if is_enriched else "2026 public SIOP Whova embed",
        }
    )


def common_from_archive(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path)
    return pd.DataFrame(
        {
            "conference_year": df["conference_year"],
            "session_id": df["session_id"],
            "display_session_id": df["display_session_id"],
            "title": df["title"],
            "date": df["date"],
            "date_label": df["date_label"],
            "start_time": df["start_time"],
            "end_time": df["end_time"],
            "location": df["location"],
            "tracks": df["tracks"],
            "speakers": df["speakers"],
            "speaker_affiliations": df["speaker_affiliations"],
            "description": df["description"],
            "session_format": df["session_format"],
            "adds": pd.NA,
            "likes": pd.NA,
            "comments": pd.NA,
            "source": df["source"],
        }
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--archive-years", nargs="*", default=[2022, 2023, 2024], type=int)
    parser.add_argument("--sessions-2025", default="data/processed/sessions_2025.csv", type=Path)
    parser.add_argument("--sessions-2026", type=Path)
    parser.add_argument("--output", default="data/processed/sessions_comparison.csv", type=Path)
    args = parser.parse_args()

    sessions_2026 = args.sessions_2026
    if sessions_2026 is None:
        enriched = Path("data/processed/sessions_2026_enriched.csv")
        sessions_2026 = enriched if enriched.exists() else Path("data/processed/sessions_2026_public.csv")

    frames = []
    for year in args.archive_years:
        archive_path = Path(f"data/processed/sessions_{year}_archive.csv")
        if archive_path.exists():
            frames.append(common_from_archive(archive_path))

    frames.extend([common_from_2025(args.sessions_2025), common_from_2026_public(sessions_2026)])
    comparison = pd.concat(frames, ignore_index=True)
    comparison = comparison.sort_values(["conference_year", "date", "start_time", "title"], na_position="last")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    comparison.to_csv(args.output, index=False)
    print(f"Wrote {len(comparison):,} rows to {args.output}")


if __name__ == "__main__":
    main()
