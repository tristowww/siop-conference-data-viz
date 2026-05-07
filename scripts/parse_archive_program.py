"""Parse archived SIOP program OCR text into the shared session schema."""

from __future__ import annotations

import argparse
import re
from datetime import datetime
from pathlib import Path

import pandas as pd


SESSION_FORMATS = [
    "Alternative Presentation",
    "Alternative Session Type",
    "Alternative Session",
    "Community of Interest",
    "Panel Discussion",
    "Partner Showcase",
    "Master Tutorial",
    "Special Event",
    "Symposium",
    "Tutorial",
    "Poster",
    "IGNITE!",
    "IGNITE",
    "Debate",
]

SESSION_RE = re.compile(
    r"(?m)^(?P<title>(?:[^\n()]{3,220}\n){0,3}[^\n()]{3,240})\s*"
    r"\(\s*(?P<format>" + "|".join(re.escape(item) for item in SESSION_FORMATS) + r")"
    r"\s*(?:-|–|—)\s*(?P<id>\d{5,6})\s*\)",
    re.IGNORECASE,
)

TIME_RE = re.compile(
    r"(?P<start>\d{1,2}:\d{2}\s*[AP]M)\s*(?:-|–|—|to)\s*"
    r"(?P<end>\d{1,2}:\d{2}\s*[AP]M)",
    re.IGNORECASE,
)
DATE_RE = re.compile(r"\b(?P<month>Apr|May)\.?\s+(?P<day>\d{1,2})\b", re.IGNORECASE)
LOCATION_RE = re.compile(r"(?:Location:\s*)?(?P<location>(?:Hyatt|Swissotel|Hynes|Exhibit|The |Virtual|VIRTUAL)[^\n]{3,120})")

COMMON_COLUMNS = [
    "conference_year",
    "session_id",
    "display_session_id",
    "title",
    "date",
    "date_label",
    "start_time",
    "end_time",
    "location",
    "tracks",
    "speakers",
    "speaker_affiliations",
    "description",
    "session_format",
    "adds",
    "likes",
    "comments",
    "source",
]


def clean_text(value: object) -> str:
    text = "" if value is None else str(value)
    text = text.replace("\u2014", "-").replace("\u2013", "-")
    text = re.sub(r"\bAl\b", "AI", text)
    text = re.sub(r"\bl-O\b|\|\-O\b|\|\s*O\b", "I-O", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def clean_title(value: str) -> str:
    title = clean_text(value)
    title = re.sub(r"^[^A-Za-z0-9]+", "", title)
    title = re.sub(r"\s*\bAuthors?:.*$", "", title, flags=re.IGNORECASE)
    return title.strip(" -")


def parse_date(year: int, block: str) -> tuple[str, str]:
    match = DATE_RE.search(block)
    if not match:
        return "", ""
    label = f"{match.group('month').title()[:3]} {int(match.group('day'))}"
    try:
        parsed = datetime.strptime(f"{year} {label}", "%Y %b %d")
        return parsed.date().isoformat(), label
    except ValueError:
        return "", label


def parse_location(block: str) -> str:
    for line in block.splitlines():
        cleaned = clean_text(line)
        if not cleaned:
            continue
        if "Location:" in cleaned:
            return cleaned.split("Location:", 1)[1].strip()
        match = LOCATION_RE.search(cleaned)
        if match:
            location = clean_text(match.group("location"))
            if not TIME_RE.search(location):
                return location
    return ""


def parse_description(block: str) -> str:
    cleaned = clean_text(block)
    cleaned = TIME_RE.sub("", cleaned)
    cleaned = DATE_RE.sub("", cleaned)
    cleaned = re.sub(r"^Location:\s*[^.]{3,140}", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\b(?:Authors?|Speakers?|Sponsor):\s*", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\b(T Speakers|Conference Career Center|EVENTS AND RECEPTIONS)\b.*", "", cleaned)
    return cleaned[:1200].strip()


def parse_records(year: int, text: str) -> list[dict[str, object]]:
    matches = list(SESSION_RE.finditer(text))
    records: list[dict[str, object]] = []
    seen: dict[str, int] = {}

    for index, match in enumerate(matches):
        start = match.end()
        end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        block = text[start:end]
        title = clean_title(match.group("title"))
        if len(title) < 8 or title.lower().startswith(("authors:", "speaker:", "sponsor:")):
            continue

        session_id = match.group("id")
        time_match = TIME_RE.search(block)
        date, date_label = parse_date(year, block)
        record = {
            "conference_year": year,
            "session_id": session_id,
            "display_session_id": session_id,
            "title": title,
            "date": date,
            "date_label": date_label,
            "start_time": clean_text(time_match.group("start")) if time_match else "",
            "end_time": clean_text(time_match.group("end")) if time_match else "",
            "location": parse_location(block),
            "tracks": "",
            "speakers": "",
            "speaker_affiliations": "",
            "description": parse_description(block),
            "session_format": clean_text(match.group("format")),
            "adds": pd.NA,
            "likes": pd.NA,
            "comments": pd.NA,
            "source": f"{year} SIOP archived program OCR",
        }

        if session_id in seen:
            existing = records[seen[session_id]]
            if len(str(record["description"])) > len(str(existing["description"])):
                for key in ["description", "location", "date", "date_label", "start_time", "end_time"]:
                    existing[key] = record[key]
            if len(str(record["title"])) > len(str(existing["title"])):
                existing["title"] = record["title"]
            continue

        seen[session_id] = len(records)
        records.append(record)

    return records


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--year", required=True, type=int)
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()

    text = args.input.read_text(encoding="utf-8", errors="replace")
    rows = parse_records(args.year, text)
    df = pd.DataFrame(rows, columns=COMMON_COLUMNS)
    df = df.sort_values(["conference_year", "date", "start_time", "title"], na_position="last")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(args.output, index=False)
    print(f"Wrote {len(df):,} {args.year} archived-program rows to {args.output}")


if __name__ == "__main__":
    main()
