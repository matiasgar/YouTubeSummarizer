# VideoSummarizer — Project Rules for Claude

## Session Start

At the beginning of each new session, read `context/session-primer.md` for the current project state. That file is updated at the end of every session and contains everything you need to get up to speed.

## Git & Deployment

- **Single repo:** Everything lives in one git repo (`matiasgarrido/VideoSummarizer`).
- **Working branch:** `dev`. All commits go here. Push to `dev` freely.
- **Production branch:** `master`. NEVER push directly to `master`.
- **No hosting platform** — this is a Chrome extension loaded locally via chrome://extensions.

## Project Structure

- `extension/` — Chrome extension source code (manifest.json, background.js, content.js, icons/)
- `context/` — Session primer and project context
- No frontend or backend — this is a pure Chrome extension project.

## What This Extension Does

Chrome extension that extracts YouTube video transcripts and sends them to ChatGPT or Claude for summarization. The transcript is extracted from the YouTube page DOM, a prompt is built, and it's injected into the AI chat interface in a new tab.

## Known Issue (March 2026)

YouTube likely changed their HTML structure, breaking transcript detection/extraction. The video transcript is visually present on the page but the extension can't find it with its current DOM selectors.
