# SIOP Conference Data Viz

Private working repo for comparing SIOP Annual Conference session data across years.

## Project goal

Build a standalone data visualization that compares recent SIOP conference sessions, with a focus
on AI-related program structure, topics, use-case contexts, timing, locations, and session metadata
where available.

## Current status

- 2025 Whova-style workbook added in `data/raw/2025/`.
- 2025 normalized session CSV generated in `data/processed/sessions_2025.csv`.
- 2026 public Whova embed scrape workflow added.
- 2026 public Whova agenda API workflow added for richer public session metadata.
- 2022, 2023, and 2024 archived SIOP program OCR files parsed from Internet Archive text exports.
- Static D3 portfolio app now reads a five-year AI-shift story dataset.
- Archived-program author names are parsed from both local session blocks and global citation lines
  when the OCR includes a reliable title match; schedule-only rows may still have blank authors.

## Data workflow

```text
data/raw/2025/siop2025sessions_updated.xlsx
  -> scripts/normalize_sessions.py
  -> data/processed/sessions_2025.csv

data/raw/{2022,2023,2024}/archive_*_djvu.txt
  -> scripts/parse_archive_program.py
  -> data/processed/sessions_{year}_archive.csv

2026 public Whova agenda API
  -> scripts/fetch_whova_public_agenda.py
  -> data/processed/sessions_2026_enriched.csv

data/processed/sessions_*_archive.csv + 2025/2026 processed files
  -> scripts/build_comparison_dataset.py
  -> scripts/build_ai_story_dataset.py
  -> app visualization
```

## Scraping guardrails

Use the scraper only with normal access to the SIOP Whova app. Do not bypass login, paywalls,
CAPTCHAs, rate limits, or access controls. Treat attendee profile details, private comments, and
networking data as sensitive. The portfolio-ready dataset should focus on public program/session
metadata.

## Public archive sources

- SIOP attendee information page links to the historical conference-program archive.
- Internet Archive SIOP conference-program collection provides the 2022, 2023, and 2024 OCR text
  exports used for the archived-program parser.

## Useful commands

Normalize the 2025 workbook:

```bash
python scripts/normalize_sessions.py --input data/raw/2025/siop2025sessions_updated.xlsx --year 2025 --output data/processed/sessions_2025.csv
```

Scrape the public Whova agenda embed:

```bash
python scripts/scrape_public_whova.py --output data/processed/sessions_2026_public.csv
```

Fetch the richer public Whova agenda API data:

```bash
python scripts/fetch_whova_public_agenda.py --output data/processed/sessions_2026_enriched.csv
```

Parse archived SIOP program OCR:

```bash
python scripts/parse_archive_program.py --year 2022 --input data/raw/2022/archive_2022_djvu.txt --output data/processed/sessions_2022_archive.csv
python scripts/parse_archive_program.py --year 2023 --input data/raw/2023/archive_2023_djvu.txt --output data/processed/sessions_2023_archive.csv
python scripts/parse_archive_program.py --year 2024 --input data/raw/2024/archive_2024_djvu.txt --output data/processed/sessions_2024_archive.csv
```

Build the year-over-year comparison table:

```bash
python scripts/build_comparison_dataset.py
```

Build the AI shift story dataset used by the static app:

```bash
python scripts/build_ai_story_dataset.py
```

Preview the static app locally:

```bash
python -m http.server 8000 --directory app
```

Start the assisted authenticated Whova capture workflow only if the public embed is not enough:

```bash
python scripts/capture_whova.py --url "PASTE_WHOVA_EVENT_URL_HERE" --out data/raw/2026/private_api_captures
```

After capture, we will inspect the JSON payloads and write a small parser for the exact 2026
response shape.
