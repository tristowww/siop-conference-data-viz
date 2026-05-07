# 2026 Whova Scraping Plan

## What we need

For year-over-year comparison, prioritize session/program metadata:

- session id
- title
- description
- date
- start and end time
- location
- track or topic tags
- session format
- speaker names and affiliations, if available in session records

Avoid collecting private networking data, attendee lists, direct messages, private comments, or
profile details that are not necessary for the public-facing visualization.

## Best path

1. Open the 2026 SIOP Whova event with normal authorized access.
2. Run `scripts/capture_whova.py` with the Whova URL.
3. Log in manually in the launched browser.
4. Navigate to the agenda.
5. Search/filter/scroll enough that the app loads all sessions.
6. Save captured JSON responses into `data/raw/2026/private_api_captures/`.
7. Inspect the response shape and write a targeted parser into `scripts/normalize_sessions.py`.

## Why this approach

The 2025 workbook appears to be a flattened Whova export. The 2026 app likely loads session data
through JSON API responses after authentication. Capturing those responses after normal login is
more reliable than scraping rendered text from the page and avoids brittle HTML selectors.

## Before making anything public

Create a sanitized public dataset from `data/processed/` that removes:

- attendee identifiers
- personal profile details
- private app interactions
- comments or discussion-board content
- session materials or slide links unless they are explicitly public

The eventual GitHub Pages visualization can live in a public repo or a public branch after the data
is reviewed.
