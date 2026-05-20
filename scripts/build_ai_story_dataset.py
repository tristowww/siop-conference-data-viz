"""Build public-safe story data for the SIOP AI shift portfolio visualization."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity


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

THEME_DEFINITIONS = [
    {
        "theme": "Assessment automation",
        "side_lean": "I-side selection/assessment",
        "seed_terms": [
            "assessment automation",
            "item generation",
            "test development",
            "psychometric",
            "scoring",
            "readability",
            "validity",
            "measurement",
            "automated assessment",
        ],
    },
    {
        "theme": "Selection and hiring",
        "side_lean": "I-side selection/assessment",
        "seed_terms": [
            "selection",
            "hiring",
            "applicant",
            "candidate",
            "interview",
            "recruiting",
            "staffing",
            "personnel selection",
            "assessment center",
        ],
    },
    {
        "theme": "Learning, coaching, and development",
        "side_lean": "O-side org/development",
        "seed_terms": [
            "training",
            "learning",
            "coaching",
            "mentoring",
            "development",
            "career",
            "feedback",
            "graduate education",
            "employee development",
        ],
    },
    {
        "theme": "Leadership, culture, and teams",
        "side_lean": "O-side org/development",
        "seed_terms": [
            "leadership",
            "leader",
            "culture",
            "teams",
            "teamwork",
            "engagement",
            "employee experience",
            "psychological safety",
            "wellbeing",
        ],
    },
    {
        "theme": "Future of work and job design",
        "side_lean": "O-side org/development",
        "seed_terms": [
            "future of work",
            "job design",
            "work design",
            "skills",
            "reskilling",
            "workforce",
            "task analysis",
            "automation impact",
            "job redesign",
        ],
    },
    {
        "theme": "AI governance, ethics, and trust",
        "side_lean": "Cross-cutting",
        "seed_terms": [
            "governance",
            "ethics",
            "ethical ai",
            "trust",
            "privacy",
            "accountability",
            "transparency",
            "human oversight",
            "responsible ai",
        ],
    },
    {
        "theme": "Education, methods, and research tools",
        "side_lean": "Cross-cutting",
        "seed_terms": [
            "methods",
            "research",
            "teaching",
            "education",
            "graduate education",
            "tutorial",
            "text analysis",
            "natural language processing",
            "large language models",
        ],
    },
    {
        "theme": "DEI, accessibility, and fairness",
        "side_lean": "O-side org/development",
        "seed_terms": [
            "diversity",
            "equity",
            "inclusion",
            "accessibility",
            "fairness",
            "bias",
            "adverse impact",
            "deia",
            "inclusive",
        ],
    },
]

THEME_ORDER = [definition["theme"] for definition in THEME_DEFINITIONS]
THEME_SIDE_LEAN = {definition["theme"]: definition["side_lean"] for definition in THEME_DEFINITIONS}
THEME_SEED_DOCS = [
    " ".join([definition["theme"], *definition["seed_terms"]]) for definition in THEME_DEFINITIONS
]
THEME_PATTERNS = {
    "Assessment automation": re.compile(
        r"\b(?:assessment|assessments|automated assessment|item generation|item refinement|"
        r"psychometric|scoring|score|measurement|test development|testing|validity|validation|"
        r"readability|factor analysis|fairness audit)\b",
        re.IGNORECASE,
    ),
    "Selection and hiring": re.compile(
        r"\b(?:selection|hiring|applicant|candidate|interview|interviews|recruiting|recruitment|"
        r"staffing|talent acquisition|personnel selection)\b",
        re.IGNORECASE,
    ),
    "Learning, coaching, and development": re.compile(
        r"\b(?:training|learning|coaching|coach|mentoring|development|career|feedback|"
        r"graduate education|student|students|education|teaching)\b",
        re.IGNORECASE,
    ),
    "Leadership, culture, and teams": re.compile(
        r"\b(?:leadership|leader|leaders|culture|teams|team|teamwork|collaboration|engagement|"
        r"employee experience|psychological safety|wellbeing|well-being|loneliness)\b",
        re.IGNORECASE,
    ),
    "Future of work and job design": re.compile(
        r"\b(?:future of work|job design|work design|workforce|skills|skill|reskilling|"
        r"task analysis|job redesign|automation impact|remote work|working from home|work technology|"
        r"technology rollout|talent practices)\b",
        re.IGNORECASE,
    ),
    "AI governance, ethics, and trust": re.compile(
        r"\b(?:governance|ethic|ethical|trust|privacy|accountability|transparency|"
        r"human oversight|responsible ai|explainable|adoption|acceptance|fear|risk)\b",
        re.IGNORECASE,
    ),
    "Education, methods, and research tools": re.compile(
        r"\b(?:research|methods|method|tutorial|computational|text analysis|sentiment analysis|"
        r"natural language processing|nlp|large language model|large language models|llm|llms|"
        r"language model|models|modeling|summarization)\b",
        re.IGNORECASE,
    ),
    "DEI, accessibility, and fairness": re.compile(
        r"\b(?:diversity|equity|inclusion|accessibility|fairness|bias|biased|adverse impact|"
        r"deia|dei|inclusive)\b",
        re.IGNORECASE,
    ),
}
THEME_TERM_EXCLUDE = {
    "ai",
    "artificial",
    "artificial intelligence",
    "conference",
    "industrial",
    "intelligence",
    "io",
    "organizational",
    "psychological",
    "psychologists",
    "psychology",
    "panel",
    "poster",
    "session",
    "sessions",
    "siop",
    "society",
    "technology",
    "united",
    "workplace",
}


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


def theme_model_text(row: pd.Series) -> str:
    return " ".join(
        clean_text(row.get(column, ""))
        for column in ["title", "description", "tracks", "session_format", "normalized_tracks"]
    )


def assign_guided_themes(df: pd.DataFrame) -> tuple[pd.DataFrame, list[dict[str, object]]]:
    df = df.copy()
    df["guided_ai_theme"] = ""
    df["guided_ai_secondary_themes"] = ""
    df["guided_ai_theme_score"] = 0.0
    ai_index = df.index[df["is_ai_related"]].tolist()
    if not ai_index:
        return df, [{"theme": theme, "terms": []} for theme in THEME_ORDER]

    ai_texts = [theme_model_text(df.loc[index]) for index in ai_index]
    vectorizer = TfidfVectorizer(
        stop_words="english",
        ngram_range=(1, 2),
        min_df=1,
        max_df=0.92,
        max_features=3200,
    )
    matrix = vectorizer.fit_transform(ai_texts + THEME_SEED_DOCS)
    session_matrix = matrix[: len(ai_texts)]
    seed_matrix = matrix[len(ai_texts) :]
    similarities = cosine_similarity(session_matrix, seed_matrix)

    for row_offset, index in enumerate(ai_index):
        raw_scores = similarities[row_offset]
        scores = raw_scores.copy()
        text = ai_texts[row_offset]
        for theme_index, theme in enumerate(THEME_ORDER):
            if THEME_PATTERNS[theme].search(text):
                scores[theme_index] += 0.18
        ranked = sorted(range(len(THEME_ORDER)), key=lambda theme_index: scores[theme_index], reverse=True)
        primary_index = ranked[0]
        primary_score = float(scores[primary_index])
        secondary = [
            THEME_ORDER[theme_index]
            for theme_index in ranked[1:3]
            if float(scores[theme_index]) >= max(0.08, primary_score * 0.72)
        ]
        df.at[index, "guided_ai_theme"] = THEME_ORDER[primary_index]
        df.at[index, "guided_ai_secondary_themes"] = " | ".join(secondary)
        df.at[index, "guided_ai_theme_score"] = round(primary_score, 4)

    feature_names = vectorizer.get_feature_names_out()
    theme_terms = []
    ai_df = df.loc[ai_index]
    for theme in THEME_ORDER:
        theme_offsets = [
            offset for offset, (_, row) in enumerate(ai_df.iterrows()) if row["guided_ai_theme"] == theme
        ]
        if not theme_offsets:
            theme_terms.append({"theme": theme, "terms": []})
            continue
        weights = session_matrix[theme_offsets].sum(axis=0).A1
        ranked_term_indices = weights.argsort()[::-1]
        terms = []
        for term_index in ranked_term_indices:
            term = clean_text(feature_names[term_index])
            if not term or term in THEME_TERM_EXCLUDE or weights[term_index] <= 0:
                continue
            terms.append(term)
            if len(terms) >= 8:
                break
        theme_terms.append({"theme": theme, "terms": terms})

    return df, theme_terms


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


def summarize_themes(df: pd.DataFrame) -> list[dict[str, object]]:
    ai_df = df[df["is_ai_related"]].copy()
    if ai_df.empty:
        return []
    counts = (
        ai_df.groupby(["conference_year", "guided_ai_theme"])["session_id"]
        .nunique()
        .reset_index(name="sessions")
    )
    totals = ai_df.groupby("conference_year")["session_id"].nunique().to_dict()
    count_lookup = {
        (int(row["conference_year"]), row["guided_ai_theme"]): int(row["sessions"])
        for _, row in counts.iterrows()
    }
    rows = []
    for year in sorted(totals):
        for sort_order, theme in enumerate(THEME_ORDER):
            sessions = count_lookup.get((int(year), theme), 0)
            rows.append(
                {
                    "conference_year": int(year),
                    "theme": theme,
                    "sessions": sessions,
                    "share": round(sessions / totals[year], 4) if totals[year] else 0,
                    "side_lean": THEME_SIDE_LEAN[theme],
                    "sort_order": sort_order,
                }
            )
    return rows


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
            "theme": clean_text(row.get("guided_ai_theme", "")),
            "secondary_themes": [
                theme
                for theme in clean_text(row.get("guided_ai_secondary_themes", "")).split(" | ")
                if theme
            ],
            "tracks": row["normalized_tracks"],
            "session_format": row["normalized_session_format"],
            "date": clean_text(row.get("date", "")),
            "start_time": clean_text(row.get("start_time", "")),
            "location": clean_text(row.get("location", "")),
            "speakers": clean_text(row.get("speakers", ""))[:260],
            "visible_ai_signal": bool(row.get("has_visible_ai_signal", False)),
            "description": clean_text(row.get("description", ""))[:240],
        }
        for _, row in ai_df.iterrows()
    ]


def missing_author_rows(df: pd.DataFrame) -> pd.DataFrame:
    ai_df = df[df["is_ai_related"]].copy()
    missing = ai_df[ai_df["speakers"].map(clean_text).eq("")].copy()
    missing = missing.sort_values(["conference_year", "primary_ai_context_group", "title"])
    rows = []
    for _, row in missing.iterrows():
        rows.append(
            {
                "conference_year": int(row["conference_year"]),
                "session_id": clean_text(row.get("session_id", "")),
                "title": clean_text(row.get("title", "")),
                "session_format": clean_text(row.get("normalized_session_format", "")),
                "date": clean_text(row.get("date", "")),
                "start_time": clean_text(row.get("start_time", "")),
                "location": clean_text(row.get("location", "")),
                "ai_context_group": clean_text(row.get("primary_ai_context_group", "")),
                "source": clean_text(row.get("source", "")),
                "description_excerpt": clean_text(row.get("description", ""))[:320],
                "author_recovery_status": "needs_source",
                "author_source_url": "",
                "recovered_speakers": "",
                "notes": "",
            }
        )
    return pd.DataFrame(rows)


def build_story(input_path: Path) -> tuple[pd.DataFrame, dict[str, object], pd.DataFrame]:
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
    df, theme_terms = assign_guided_themes(df)

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
        "guided_ai_theme",
        "guided_ai_secondary_themes",
        "source",
    ]
    story_sessions = df[public_columns].copy()
    story_sessions = story_sessions.rename(
        columns={
            "normalized_tracks": "tracks",
            "normalized_session_format": "session_format",
            "primary_ai_context_group": "ai_context_group",
            "guided_ai_theme": "theme",
            "guided_ai_secondary_themes": "secondary_themes",
        }
    )

    contexts = context_rows(df)
    author_missing = missing_author_rows(df)
    ai_sessions = df[df["is_ai_related"]]
    author_count = int(ai_sessions["speakers"].map(clean_text).ne("").sum())
    payload = {
        "summary": {
            "title": "SIOP AI shift",
            "method_note": (
                "AI-related sessions are flagged from public title, description, track, and format text. "
                "Visible AI signals are flagged only from title, track, and format text. "
                "Context groups use public track labels and may count a session once in more than one context. "
                "Guided themes use TF-IDF similarity to human-labeled seed themes for exploratory clustering."
            ),
            "row_counts": {
                "combined": int(len(df)),
                "by_year": {
                    str(year): int(count) for year, count in df["conference_year"].value_counts().sort_index().items()
                },
            },
            "author_coverage": {
                "ai_related_sessions": int(len(ai_sessions)),
                "with_parsed_authors": author_count,
                "missing_parsed_authors": int(len(author_missing)),
            },
        },
        "ai_summary": summarize_ai(df),
        "context_summary": summarize_contexts(contexts),
        "theme_summary": summarize_themes(df),
        "theme_terms": theme_terms,
        "context_network": build_context_network(df),
        "track_summary": summarize_tracks(df),
        "format_summary": summarize_formats(df),
        "rhythm_summary": summarize_rhythm(df),
        "session_explorer": session_explorer_rows(df),
    }
    return story_sessions, payload, author_missing


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", default="data/processed/sessions_comparison.csv", type=Path)
    parser.add_argument("--sessions-output", default="data/processed/siop_ai_story_sessions.csv", type=Path)
    parser.add_argument("--json-output", default="app/data/siop_ai_story.json", type=Path)
    parser.add_argument("--missing-authors-output", default="data/processed/siop_ai_missing_authors.csv", type=Path)
    args = parser.parse_args()

    story_sessions, payload, author_missing = build_story(args.input)
    args.sessions_output.parent.mkdir(parents=True, exist_ok=True)
    args.json_output.parent.mkdir(parents=True, exist_ok=True)
    args.missing_authors_output.parent.mkdir(parents=True, exist_ok=True)
    story_sessions.to_csv(args.sessions_output, index=False)
    author_missing.to_csv(args.missing_authors_output, index=False)
    args.json_output.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"Wrote {len(story_sessions):,} rows to {args.sessions_output}")
    print(f"Wrote {len(author_missing):,} missing-author rows to {args.missing_authors_output}")
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
