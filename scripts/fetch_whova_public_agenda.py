"""Fetch a public Whova agenda JSON feed into an analysis-ready CSV.

This uses Whova's public embedded-agenda endpoint. It does not log in and it intentionally excludes
person-profile URLs, profile IDs, pictures, and social-profile indicators from the exported dataset.
"""

from __future__ import annotations

import argparse
import json
import re
import urllib.parse
import urllib.request
from datetime import datetime
from pathlib import Path
from typing import Any

import pandas as pd
from lxml import html


DEFAULT_EVENT_ID = "txIFuC91zxfXmk1Kefw1Z-3npWvIIX@kh469Fy-hO5k="
DEFAULT_API_ROOT = "https://whova.com/xems/apis/event_webpage/agenda/public"
SESSION_ID_PATTERN = re.compile(r"\(Session ID\s+([^)]*)\)", re.IGNORECASE)
FORMAT_PATTERN = re.compile(r"\[([^\[\]]{2,80})\]")


def clean_text(value: str) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def html_to_text(value: str) -> str:
    if not value:
        return ""
    doc = html.fromstring(f"<div>{value}</div>")
    return clean_text(" ".join(doc.itertext()))


def as_list(value: Any) -> list[Any]:
    if value is None or value == "":
        return []
    if isinstance(value, list):
        return value
    return [value]


def join_unique(values: list[str]) -> str:
    output = []
    for value in values:
        value = clean_text(str(value))
        if value and value not in output:
            output.append(value)
    return " | ".join(output)


def extract_display_session_id(title: str) -> str:
    match = SESSION_ID_PATTERN.search(title or "")
    return match.group(1).strip() if match else ""


def extract_session_format(description: str) -> str:
    match = FORMAT_PATTERN.search(description or "")
    return clean_text(match.group(1)) if match else ""


def date_label_from_api(day: str, date_value: str) -> str:
    if not date_value:
        return ""
    parsed = datetime.strptime(date_value, "%b %d, %Y")
    return f"{parsed.strftime('%A')}, {parsed.strftime('%B')} {parsed.day}"


def fetch_agenda(event_id: str, api_root: str) -> dict[str, Any]:
    query = urllib.parse.urlencode({"event_id": event_id})
    url = f"{api_root.rstrip('/')}/get_agendas/?{query}"
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (compatible; SIOP data viz research)",
            "Referer": f"https://whova.com/embedded/event/{urllib.parse.quote(event_id, safe='')}/",
        },
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        payload = json.load(response)
    if payload.get("result") != "success":
        raise RuntimeError(f"Whova agenda request failed: {payload!r}")
    return payload["data"]


def iter_sessions(agenda_data: dict[str, Any]):
    for day in agenda_data.get("agenda", []):
        date_value = day.get("date", "")
        day_name = day.get("day", "")
        for block in day.get("time_ranges", []):
            if len(block) < 2:
                continue
            for group in block[1]:
                for item in group:
                    for session in item.get("sessions", []):
                        yield day_name, date_value, session


def speakers_from_session(session: dict[str, Any]) -> tuple[str, str, str, str]:
    speaker_groups = session.get("speaker") or {}
    names: list[str] = []
    affiliations: list[str] = []
    titles: list[str] = []
    labels: list[str] = []

    if isinstance(speaker_groups, dict):
        iterable = speaker_groups.items()
    else:
        iterable = []

    for group_label, speakers in iterable:
        for speaker in as_list(speakers):
            if not isinstance(speaker, dict):
                continue
            names.append(speaker.get("name", ""))
            affiliations.append(speaker.get("aff", ""))
            titles.append(speaker.get("title", ""))
            labels.append(speaker.get("label") or str(group_label))

    return join_unique(names), join_unique(affiliations), join_unique(titles), join_unique(labels)


def flatten_session(day_name: str, date_value: str, session: dict[str, Any], year: int, event_id: str) -> dict[str, Any]:
    title = clean_text(session.get("name", ""))
    description_html = session.get("desc", "") or ""
    description = html_to_text(description_html)
    speakers, speaker_affiliations, speaker_titles, speaker_labels = speakers_from_session(session)
    tracks = as_list(session.get("tracks"))
    programs = as_list(session.get("programs"))
    sponsors = as_list(session.get("sponsors"))
    tags = as_list(session.get("tags"))
    session_id = str(session.get("id", "") or "")

    return {
        "conference_year": year,
        "session_id": session_id,
        "display_session_id": extract_display_session_id(title),
        "title": title,
        "date": (session.get("calendar_stime") or "")[:10],
        "date_label": date_label_from_api(day_name, date_value),
        "start_time": session.get("start_time", ""),
        "end_time": session.get("end_time", ""),
        "start_ts": session.get("calendar_stime", ""),
        "end_ts": session.get("calendar_etime", ""),
        "location": clean_text(session.get("place", "")),
        "tracks": join_unique([track.get("name", "") for track in tracks if isinstance(track, dict)]),
        "track_ids": join_unique([track.get("id", "") for track in tracks if isinstance(track, dict)]),
        "programs": join_unique([program.get("name", "") for program in programs if isinstance(program, dict)]),
        "speakers": speakers,
        "speaker_affiliations": speaker_affiliations,
        "speaker_titles": speaker_titles,
        "speaker_labels": speaker_labels,
        "description": description,
        "description_html": description_html,
        "session_format": extract_session_format(description),
        "whova_type": session.get("type", ""),
        "sponsors": join_unique([sponsor.get("name", "") for sponsor in sponsors if isinstance(sponsor, dict)]),
        "tags": join_unique([tag.get("name", tag) if isinstance(tag, dict) else tag for tag in tags]),
        "detail_href": f"/embedded/session/{urllib.parse.quote(event_id, safe='')}/{session_id}/?widget=primary"
        if session_id
        else "",
    }


def build_dataframe(agenda_data: dict[str, Any], year: int, event_id: str) -> pd.DataFrame:
    rows = [flatten_session(day, date_value, session, year, event_id) for day, date_value, session in iter_sessions(agenda_data)]
    output = pd.DataFrame(rows)
    if not output.empty:
        output = output.drop_duplicates(subset=["session_id"])
    return output


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--event-id", default=DEFAULT_EVENT_ID)
    parser.add_argument("--year", default=2026, type=int)
    parser.add_argument("--api-root", default=DEFAULT_API_ROOT)
    parser.add_argument("--output", default="data/processed/sessions_2026_enriched.csv", type=Path)
    parser.add_argument("--raw-output", type=Path)
    args = parser.parse_args()

    agenda_data = fetch_agenda(args.event_id, args.api_root)
    if args.raw_output:
        args.raw_output.parent.mkdir(parents=True, exist_ok=True)
        args.raw_output.write_text(json.dumps(agenda_data, indent=2), encoding="utf-8")

    sessions = build_dataframe(agenda_data, args.year, args.event_id)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    sessions.to_csv(args.output, index=False)
    print(f"Wrote {len(sessions):,} rows to {args.output}")
    print(f"Descriptions: {sessions['description'].astype(bool).sum():,}")
    print(f"Session formats parsed: {sessions['session_format'].astype(bool).sum():,}")


if __name__ == "__main__":
    main()
