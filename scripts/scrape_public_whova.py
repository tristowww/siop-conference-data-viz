"""Scrape the public SIOP Whova agenda embed into a compact CSV.

This uses Chrome's headless DOM renderer against the public embedded agenda. It does not log in and
does not access private attendee areas.
"""

from __future__ import annotations

import argparse
import re
import subprocess
from pathlib import Path

import pandas as pd
from lxml import html


DEFAULT_EVENT_ID = "txIFuC91zxfXmk1Kefw1Z-3npWvIIX%40kh469Fy-hO5k%3D"
DEFAULT_CHROME_PATHS = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
]

SESSION_ID_PATTERN = re.compile(r"\(Session ID\s+([^)]*)\)", re.IGNORECASE)


def find_browser(explicit_path: str | None) -> str:
    candidates = [explicit_path] if explicit_path else DEFAULT_CHROME_PATHS
    for candidate in candidates:
        if candidate and Path(candidate).exists():
            return candidate
    raise FileNotFoundError("Could not find Chrome or Edge. Pass --browser with an executable path.")


def has_class(node, class_name: str) -> bool:
    classes = (node.get("class") or "").split()
    return class_name in classes


def text_one(node, class_name: str) -> str:
    matches = node.xpath(f'.//*[contains(concat(" ", normalize-space(@class), " "), " {class_name} ")]')
    if not matches:
        return ""
    return clean_text(" ".join(matches[0].itertext()))


def text_many(node, class_name: str) -> str:
    matches = node.xpath(f'.//*[contains(concat(" ", normalize-space(@class), " "), " {class_name} ")]')
    values = []
    for match in matches:
        value = clean_text(" ".join(match.itertext()))
        value = value.lstrip("·").strip()
        if value and value not in values:
            values.append(value)
    return " | ".join(values)


def clean_text(value: str) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def split_time_range(value: str) -> tuple[str, str]:
    parts = re.split(r"\s+[–-]\s+", value)
    if len(parts) == 2:
        return parts[0].strip(), parts[1].strip()
    return value.strip(), ""


def extract_display_session_id(title: str) -> str:
    match = SESSION_ID_PATTERN.search(title)
    return match.group(1).strip() if match else ""


def render_dom(browser_path: str, url: str, virtual_time_ms: int) -> str:
    command = [
        browser_path,
        "--headless=new",
        "--disable-gpu",
        "--no-sandbox",
        f"--virtual-time-budget={virtual_time_ms}",
        "--dump-dom",
        url,
    ]
    completed = subprocess.run(command, check=True, capture_output=True, text=True, encoding="utf-8")
    return completed.stdout


def parse_sessions(dom: str, year: int) -> pd.DataFrame:
    doc = html.fromstring(dom)
    rows = []
    current_date = ""

    nodes = doc.xpath(
        '//*[contains(concat(" ", normalize-space(@class), " "), " day-tab-header ") '
        'or contains(concat(" ", normalize-space(@class), " "), " session-date ") '
        'or contains(concat(" ", normalize-space(@class), " "), " session ")]'
    )

    for node in nodes:
        if has_class(node, "day-tab-header") or has_class(node, "session-date"):
            current_date = clean_text(" ".join(node.itertext()))
            continue
        if not has_class(node, "session"):
            continue

        title = text_one(node, "session-title")
        time_range = text_one(node, "session-time")
        start_time, end_time = split_time_range(time_range)
        detail_href = ""
        links = node.xpath('.//a[contains(concat(" ", normalize-space(@class), " "), " read-more ")]/@href')
        if links:
            detail_href = links[0]

        rows.append(
            {
                "conference_year": year,
                "display_session_id": extract_display_session_id(title),
                "title": title,
                "date_label": current_date,
                "start_time": start_time,
                "end_time": end_time,
                "location": text_one(node, "session-location"),
                "tracks": text_many(node, "track-badge"),
                "speakers": text_many(node, "speaker-name-underline"),
                "speaker_affiliations": text_many(node, "speaker-aff"),
                "detail_href": detail_href,
            }
        )

    output = pd.DataFrame(rows)
    if not output.empty:
        output = output.drop_duplicates(subset=["title", "date_label", "start_time", "location"])
    return output


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--event-id", default=DEFAULT_EVENT_ID)
    parser.add_argument("--year", default=2026, type=int)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--browser")
    parser.add_argument("--virtual-time-ms", default=12000, type=int)
    args = parser.parse_args()

    browser = find_browser(args.browser)
    url = f"https://whova.com/embedded/event/{args.event_id}/"
    dom = render_dom(browser, url, args.virtual_time_ms)
    sessions = parse_sessions(dom, args.year)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    sessions.to_csv(args.output, index=False)
    print(f"Wrote {len(sessions):,} rows to {args.output}")


if __name__ == "__main__":
    main()
