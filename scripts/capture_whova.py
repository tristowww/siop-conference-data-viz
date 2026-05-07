"""Assisted Whova capture.

This script opens a normal browser session, lets you log in yourself, and saves likely JSON agenda
responses while you browse the event agenda. It is intentionally not a login bypass.
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
from pathlib import Path
from urllib.parse import urlparse

from playwright.async_api import async_playwright


AGENDA_HINTS = ("agenda", "program", "session", "event", "speaker")


def should_capture(url: str, content_type: str) -> bool:
    parsed = urlparse(url)
    haystack = f"{parsed.path}?{parsed.query}".lower()
    return "json" in content_type.lower() and any(hint in haystack for hint in AGENDA_HINTS)


def filename_for(url: str) -> str:
    digest = hashlib.sha1(url.encode("utf-8")).hexdigest()[:12]
    slug = "".join(ch if ch.isalnum() else "-" for ch in urlparse(url).path.strip("/"))[:80]
    return f"{slug or 'response'}-{digest}.json"


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", required=True, help="Whova event/app URL to open.")
    parser.add_argument("--out", required=True, type=Path, help="Directory for captured JSON.")
    parser.add_argument("--profile", default="auth/whova-browser-profile", type=Path)
    args = parser.parse_args()

    args.out.mkdir(parents=True, exist_ok=True)
    args.profile.mkdir(parents=True, exist_ok=True)

    async with async_playwright() as p:
        browser = await p.chromium.launch_persistent_context(
            user_data_dir=str(args.profile),
            headless=False,
            viewport={"width": 1440, "height": 1000},
        )
        page = await browser.new_page()

        async def handle_response(response):
            content_type = response.headers.get("content-type", "")
            if not should_capture(response.url, content_type):
                return
            try:
                payload = await response.json()
            except Exception:
                return
            output = args.out / filename_for(response.url)
            envelope = {"url": response.url, "status": response.status, "payload": payload}
            output.write_text(json.dumps(envelope, indent=2, ensure_ascii=False), encoding="utf-8")
            print(f"captured {output}")

        page.on("response", handle_response)
        await page.goto(args.url, wait_until="domcontentloaded")
        print("Log in normally, open the agenda, search/filter/scroll sessions, then press Enter here.")
        await asyncio.to_thread(input)
        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
