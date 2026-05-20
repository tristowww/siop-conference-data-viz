# HTML Editing Guide

This app is a static portfolio page. The source is meant to be easy to annotate in GitHub, VS Code,
or a code review without needing to understand every D3 function first.

## Where To Edit

| What you want to change | File | Search for |
| --- | --- | --- |
| Main story copy, section titles, nav labels | `app/index.html` | `data-edit-id` |
| Home Explorer Map and focus tray text that changes by year/theme | `app/app.js` | `renderShiftMapPanel`, `renderThemeMapPanel` |
| Topic interpretation snippets | `app/app.js` | `contextMicrocopy`, `themeMicrocopy` |
| Visual spacing, colors, layout | `app/styles.css` | the class name from the HTML |
| Counts, session examples, topic rows | `app/data/siop_ai_story.json` | the year or topic name |

## Annotation Anchors

These `data-edit-id` values are stable handles for comments and review notes:

| Section | Useful anchors |
| --- | --- |
| Navigation | `site-nav`, `nav-brand` |
| Home | `section-home`, `home-title`, `home-intro-copy`, `explore-map-intro`, `explore-quick-read`, `explore-detail-panel` |
| Explore | `section-explore`, `explore-title`, `explore-intro-copy`, `explore-note-cards` |
| Meaning | `section-meaning`, `meaning-title`, `meaning-main-copy`, `meaning-side-definition`, `meaning-summary-cards` |
| So what | `section-takeaway`, `takeaway-title`, `takeaway-main-copy`, `takeaway-summary-cards` |

Example annotation language:

```text
On data-edit-id="explore-intro-copy", can we make the shift from selection to org-side clearer?
```

## Safe Editing Rules

Edit visible words between tags freely. It is usually safe to change headings, paragraph text, and
button labels.

Be careful renaming IDs that JavaScript uses:

```text
shift-map
shift-year-range
shift-year-pills
shift-play
shift-mode-controls
shift-quick-read
shift-map-canvas
shift-map-panel
guide-prev
guide-next
guide-progress
tooltip
```

If one of those IDs changes in `app/index.html`, update the matching selector in `app/app.js`.

## Preview Locally

From the repo root:

```bash
python -m http.server 8000 --directory app
```

Then open:

```text
http://localhost:8000/
```

If the browser shows an older version, add a temporary query string:

```text
http://localhost:8000/?v=edit-check
```
