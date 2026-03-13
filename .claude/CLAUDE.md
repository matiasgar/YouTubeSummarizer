# VideoSummarizer — Project Rules for Claude

## Session Start

At the beginning of each new session, read `context/session-primer.md` for the current project state. That file is updated at the end of every session and contains everything you need to get up to speed.

## Git & Deployment

- **Single repo:** Everything lives in one git repo (`matiasgar/VideoSummarizer`).
- **Working branch:** `dev`. All commits go here. Push to `dev` freely.
- **Production branch:** `master`. NEVER push directly to `master`.
- **No hosting platform** — this is a Chrome extension loaded locally via chrome://extensions.

## Project Structure

- `extension/` — Chrome extension source code (manifest.json, background.js, content.js, icons/)
- `context/` — Session primer and project context
- No frontend or backend — this is a pure Chrome extension project.

## What This Extension Does

Chrome extension that extracts YouTube video transcripts and sends them to ChatGPT or Claude for summarization. The transcript is extracted from the YouTube page DOM, a prompt is built, and it's injected into the AI chat interface in a new tab.

## Important: Fragile DOM Selectors

This extension depends on CSS selectors for YouTube, ChatGPT, and Claude's page structures. These change without notice. If the extension breaks, the first thing to check is whether the selectors in `content.js` still match the live DOM. The session primer has a table of all selectors with their last-verified dates.

## Testing

To test changes, the extension must be reloaded in Chrome:
1. Go to `chrome://extensions/`
2. Find "Easy YouTube Summary" and click the refresh icon
3. Navigate to a YouTube video with a transcript and click the extension icon
4. Verify transcript extraction, AI tab opening, and prompt injection all work
