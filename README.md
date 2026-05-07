# SIOP Conference Data Viz

Private working repo for comparing SIOP Annual Conference session data across years.

## Project goal

Build a standalone data visualization that compares last year's SIOP conference sessions with this
year's sessions, with a focus on program structure, topics, tracks, timing, locations, and session
engagement signals where available.

## Current status

- 2025 Whova-style workbook added in `data/raw/2025/`.
- 2025 normalized session CSV generated in `data/processed/sessions_2025.csv`.
- 2026 public Whova embed scrape workflow added.

## Data workflow

```text
data/raw/2025/siop2025sessions_updated.xlsx
  -> scripts/normalize_sessions.py
  -> data/processed/sessions_2025.csv

2026 public Whova embed scrape
  -> scripts/normalize_sessions.py
  -> data/processed/sessions_2026.csv

data/processed/sessions_*.csv
  -> app visualization
```

## Scraping guardrails

Use the scraper only with normal access to the SIOP Whova app. Do not bypass login, paywalls,
CAPTCHAs, rate limits, or access controls. Treat attendee profile details, private comments, and
networking data as sensitive. The portfolio-ready dataset should focus on public program/session
metadata.

## Useful commands

Normalize the 2025 workbook:

```bash
python scripts/normalize_sessions.py --input data/raw/2025/siop2025sessions_updated.xlsx --year 2025 --output data/processed/sessions_2025.csv
```

Scrape the public Whova agenda embed:

```bash
python scripts/scrape_public_whova.py --output data/processed/sessions_2026_public.csv
```

Build the year-over-year comparison table:

```bash
python scripts/build_comparison_dataset.py
```

Start the assisted authenticated Whova capture workflow only if the public embed is not enough:

```bash
python scripts/capture_whova.py --url "PASTE_WHOVA_EVENT_URL_HERE" --out data/raw/2026/private_api_captures
```

After capture, we will inspect the JSON payloads and write a small parser for the exact 2026
response shape.
