"""Build public-safe story data for the SIOP AI shift portfolio visualization."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

import pandas as pd


AI_PATTERN = re.compile(
    r"\b(?:ai|a\.i\.|artificial intelligence|machine learning|automation|automated|"
    r"algorithmic|algorithm|algorithms|generative ai|chatgpt|gpt|llm|large language model|"
    r"deep learning|natural language processing|nlp|technology)\b",
    re.IGNORECASE,
)

CONTEXT_PATTERNS = {
    "Selection/assessment/methods": re.compile(
        r"\b(?:selection|assessment|testing|test|hiring|applicant|individual differences|"
        r"measurement|psychometric|validation|predictive|research methods|statistics|statistical)\b",
        re.IGNORECASE,
    ),
    "Org/development/training": re.compile(
        r"\b(?:training|coaching|mentoring|learning|career|teaching|leadership|leader|"
        r"organizational|organisation|culture|development|work design|teams|team|"
        r"occupational health|well[- ]?being|wellbeing|engagement|job attitudes|"
        r"work and family|onboarding|socialization|change management|strategic hr)\b",
        re.IGNORECASE,
    ),
    "DEI/accessibility": re.compile(
        r"\b(?:diversity|equity|inclusion|accessibility|dei|deia)\b",
        re.IGNORECASE,
    ),
    "Explicit tech/AI": re.compile(
        r"\b(?:technology|artificial intelligence|ai|a\.i\.|machine learning|automation|"
        r"algorithm|generative|chatgpt|llm)\b",
        re.IGNORECASE,
    ),
}

FORMAT_MAP = {
    "alternative session": "Alternative session",
    "alternative session type": "Alternative session",
    "alternative presentation": "Alternative session",
    "alternative": "Alternative session",
    "panel": "Panel",
    "panel discussion": "Panel",
    "invited panel": "Panel",
    "symposium": "Symposium",
    "sympoisum": "Symposium",
    "master tutorial": "Tutorial",
    "tutorial": "Tutorial",
    "ignite": "IGNITE",
    "ignite!": "IGNITE",
    "debate": "Debate",
    "community of interest": "Community of interest",
    "poster": "Poster",
}

CONTEXT_ORDER = [
    "Explicit tech/AI",
    "Selection/assessment/methods",
    "Org/development/training",
    "DEI/accessibility",
    "Other/special",
]


def clean_text(value: object) -> str:
    return re.sub(r"\s+", " ", "" if pd.isna(value) else str(value)).strip()


def split_tracks(value: object) -> list[str]:
    text = clean_text(value)
    if not text:
        return []
    return [track.strip() for track in text.split(" | ") if track.strip()]


def normalized_format(value: object) -> str:
    text = clean_text(value)
    if not text:
        return "Unspecified"
    return FORMAT_MAP.get(text.lower(), text[:1].upper() + text[1:])


def classify_context(text: str) -> str:
    for group, pattern in CONTEXT_PATTERNS.items():
        if pattern.search(text):
            return group
    return "Other/special"


def primary_context(row: pd.Series) -> str:
    combined_text = " ".join(
        clean_text(row.get(column, "")) for column in ["tracks", "title", "session_format", "description"]
    )
    context = classify_context(combined_text)
    if context == "Explicit tech/AI":
        for track in split_tracks(row.get("tracks", "")):
            track_context = classify_context(track)
            if track_context != "Explicit tech/AI":
                return track_context
    return context


def context_rows(df: pd.DataFrame) -> pd.DataFrame:
    rows = []
    ai_sessions = df[df["is_ai_related"]]
    for _, row in ai_sessions.iterrows():
        for group in context_set(row):
            rows.append(
                {
                    "conference_year": int(row["conference_year"]),
                    "ai_context_group": group,
                    "session_id": row["session_id"],
                }
            )
    return pd.DataFrame(rows)


def context_set(row: pd.Series) -> set[str]:
    groups = {classify_context(track) for track in split_tracks(row.get("tracks", ""))}
    groups.discard("")
    primary = clean_text(row.get("primary_ai_context_group", ""))
    if primary:
        groups.add(primary)
    if not groups:
        groups.add("Other/special")
    if clean_text(row.get("has_visible_ai_signal", "")).lower() == "true" and not groups:
        groups.add("Explicit tech/AI")
    return groups


def summarize_ai(df: pd.DataFrame) -> list[dict[str, object]]:
    summary = []
    for year, group in df.groupby("conference_year", sort=True):
        ai_count = int(group["is_ai_related"].sum())
        visible_count = int(group["has_visible_ai_signal"].sum())
        total = int(len(group))
        summary.append(
            {
                "year": int(year),
                "total_sessions": total,
                "ai_related_sessions": ai_count,
                "ai_share": round(ai_count / total, 4),
                "visible_ai_sessions": visible_count,
                "visible_ai_share": round(visible_count / total, 4),
            }
        )
    return summary


def summarize_contexts(context_df: pd.DataFrame) -> list[dict[str, object]]:
    if context_df.empty:
        return []
    counts = (
        context_df.groupby(["conference_year", "ai_context_group"])["session_id"]
        .nunique()
        .reset_index(name="sessions")
    )
    totals = counts.groupby("conference_year")["sessions"].transform("sum")
    counts["share"] = (counts["sessions"] / totals).round(4)
    counts["sort_order"] = counts["ai_context_group"].map({name: index for index, name in enumerate(CONTEXT_ORDER)})
    counts = counts.sort_values(["sort_order", "conference_year"])
    return counts.drop(columns=["sort_order"]).to_dict(orient="records")


def build_context_network(df: pd.DataFrame) -> dict[str, list[dict[str, object]]]:
    ai_df = df[df["is_ai_related"]].copy()
    node_counts: dict[tuple[int, str], set[str]] = {}
    link_counts: dict[tuple[int, str, str], set[str]] = {}

    for _, row in ai_df.iterrows():
        year = int(row["conference_year"])
        session_id = clean_text(row["session_id"]) or clean_text(row["title"])
        groups = sorted(context_set(row), key=lambda group: CONTEXT_ORDER.index(group))
        for group in groups:
            node_counts.setdefault((year, group), set()).add(session_id)
        for index, source in enumerate(groups):
            for target in groups[index + 1 :]:
                link_counts.setdefault((year, source, target), set()).add(session_id)

    nodes = [
        {
            "year": year,
            "id": group,
            "sessions": len(session_ids),
            "sort_order": CONTEXT_ORDER.index(group),
        }
        for (year, group), session_ids in node_counts.items()
    ]
    links = [
        {
            "year": year,
            "source": source,
            "target": target,
            "sessions": len(session_ids),
        }
        for (year, source, target), session_ids in link_counts.items()
    ]
    return {
        "nodes": sorted(nodes, key=lambda item: (item["year"], item["sort_order"])),
        "links": sorted(links, key=lambda item: (item["year"], item["source"], item["target"])),
    }


def summarize_tracks(df: pd.DataFrame) -> list[dict[str, object]]:
    rows = []
    ai_df = df[df["is_ai_related"]]
    for _, row in ai_df.iterrows():
        for track in split_tracks(row.get("tracks", "")):
            rows.append(
                {
                    "conference_year": int(row["conference_year"]),
                    "track": track,
                    "session_id": row["session_id"],
                }
            )
    if not rows:
        return []
    track_df = pd.DataFrame(rows)
    counts = (
        track_df.groupby(["conference_year", "track"])["session_id"]
        .nunique()
        .reset_index(name="sessions")
        .sort_values(["conference_year", "sessions", "track"], ascending=[True, False, True])
    )
    return counts.groupby("conference_year").head(8).to_dict(orient="records")


def summarize_formats(df: pd.DataFrame) -> list[dict[str, object]]:
    ai_df = df[df["is_ai_related"]]
    counts = (
        ai_df.groupby(["conference_year", "normalized_session_format"])["session_id"]
        .nunique()
        .reset_index(name="sessions")
        .rename(columns={"normalized_session_format": "session_format"})
        .sort_values(["conference_year", "sessions", "session_format"], ascending=[True, False, True])
    )
    return counts.groupby("conference_year").head(5).to_dict(orient="records")


def summarize_rhythm(df: pd.DataFrame) -> list[dict[str, object]]:
    ai_df = df[df["is_ai_related"]].copy()
    ai_df["hour"] = pd.to_numeric(ai_df["start_time"].astype(str).str.slice(0, 2), errors="coerce")
    ai_df = ai_df[ai_df["hour"].notna()]
    counts = (
        ai_df.groupby(["conference_year", "date_label", "date", "hour"])["session_id"]
        .nunique()
        .reset_index(name="sessions")
        .sort_values(["conference_year", "date", "hour"])
    )
    return [
        {
            "year": int(row["conference_year"]),
            "date_label": row["date_label"],
            "date": row["date"],
            "hour": int(row["hour"]),
            "sessions": int(row["sessions"]),
        }
        for _, row in counts.iterrows()
    ]


def session_explorer_rows(df: pd.DataFrame) -> list[dict[str, object]]:
    ai_df = df[df["is_ai_related"]].copy()
    ai_df = ai_df.sort_values(["conference_year", "primary_ai_context_group", "title"])
    return [
        {
            "year": int(row["conference_year"]),
            "title": row["title"],
            "context": row["primary_ai_context_group"],
            "context_groups": sorted(context_set(row), key=lambda group: CONTEXT_ORDER.index(group)),
            "tracks": row["normalized_tracks"],
            "session_format": row["normalized_session_format"],
            "date": clean_text(row.get("date", "")),
            "start_time": clean_text(row.get("start_time", "")),
            "location": clean_text(row.get("location", "")),
            "visible_ai_signal": bool(row.get("has_visible_ai_signal", False)),
            "description": clean_text(row.get("description", ""))[:240],
        }
        for _, row in ai_df.iterrows()
    ]


def build_story(input_path: Path) -> tuple[pd.DataFrame, dict[str, object]]:
    df = pd.read_csv(input_path)
    df["visible_text_for_classification"] = (
        df["title"].fillna("")
        + " "
        + df["tracks"].fillna("")
        + " "
        + df["session_format"].fillna("")
    )
    df["text_for_classification"] = (
        df["visible_text_for_classification"] + " " + df["description"].fillna("")
    )
    df["is_ai_related"] = df["text_for_classification"].map(lambda value: bool(AI_PATTERN.search(value)))
    df["has_visible_ai_signal"] = df["visible_text_for_classification"].map(
        lambda value: bool(AI_PATTERN.search(value))
    )
    df["primary_ai_context_group"] = df.apply(primary_context, axis=1)
    df["normalized_tracks"] = df["tracks"].map(lambda value: " | ".join(split_tracks(value)) or "Untracked")
    df["normalized_session_format"] = df["session_format"].map(normalized_format)
    df["description"] = df["description"].map(clean_text)
    df["speaker_affiliations"] = df.get("speaker_affiliations", "").map(clean_text)

    public_columns = [
        "conference_year",
        "session_id",
        "display_session_id",
        "title",
        "date",
        "date_label",
        "start_time",
        "end_time",
        "location",
        "normalized_tracks",
        "speakers",
        "speaker_affiliations",
        "description",
        "normalized_session_format",
        "is_ai_related",
        "has_visible_ai_signal",
        "primary_ai_context_group",
        "source",
    ]
    story_sessions = df[public_columns].copy()
    story_sessions = story_sessions.rename(
        columns={
            "normalized_tracks": "tracks",
            "normalized_session_format": "session_format",
            "primary_ai_context_group": "ai_context_group",
        }
    )

    contexts = context_rows(df)
    payload = {
        "summary": {
            "title": "SIOP AI shift",
            "method_note": (
                "AI-related sessions are flagged from public title, description, track, and format text. "
                "Visible AI signals are flagged only from title, track, and format text. "
                "Context groups use public track labels and may count a session once in more than one context."
            ),
            "row_counts": {
                "combined": int(len(df)),
                "by_year": {
                    str(year): int(count) for year, count in df["conference_year"].value_counts().sort_index().items()
                },
            },
        },
        "ai_summary": summarize_ai(df),
        "context_summary": summarize_contexts(contexts),
        "context_network": build_context_network(df),
        "track_summary": summarize_tracks(df),
        "format_summary": summarize_formats(df),
        "rhythm_summary": summarize_rhythm(df),
        "session_explorer": session_explorer_rows(df),
    }
    return story_sessions, payload


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", default="data/processed/sessions_comparison.csv", type=Path)
    parser.add_argument("--sessions-output", default="data/processed/siop_ai_story_sessions.csv", type=Path)
    parser.add_argument("--json-output", default="app/data/siop_ai_story.json", type=Path)
    args = parser.parse_args()

    story_sessions, payload = build_story(args.input)
    args.sessions_output.parent.mkdir(parents=True, exist_ok=True)
    args.json_output.parent.mkdir(parents=True, exist_ok=True)
    story_sessions.to_csv(args.sessions_output, index=False)
    args.json_output.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"Wrote {len(story_sessions):,} rows to {args.sessions_output}")
    print(f"Wrote story JSON to {args.json_output}")
    print(
        "AI-related sessions: "
        + ", ".join(
            f"{item['year']}={item['ai_related_sessions']}/{item['total_sessions']}"
            for item in payload["ai_summary"]
        )
    )


if __name__ == "__main__":
    main()
