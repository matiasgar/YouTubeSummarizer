# Session Primer — VideoSummarizer

> **Purpose:** This file is the single source of "what a fresh Claude session needs to know." It gets updated at the end of every session. Read this before starting any task.

---

## What This Project Is

Chrome extension ("Easy YouTube Summary") that extracts YouTube video transcripts and sends them to ChatGPT or Claude for summarization. User clicks the extension icon on a YouTube video page, transcript is extracted, and a summarization prompt is opened in a new AI chat tab.

## Architecture at a Glance

| Layer | What | Where |
|-------|------|-------|
| Extension | Chrome Manifest V3 extension | `extension/` |
| Files | manifest.json, background.js, content.js, icons/ | `extension/` |
| Repo | github.com/matiasgar/VideoSummarizer (private) | remote |

## How It Works

1. User clicks extension icon on a YouTube watch page
2. `background.js` injects `content.js` into the YouTube tab
3. `content.js` (Section 1) clicks "Show transcript" button, extracts text from transcript segments, builds a summarization prompt
4. If transcript < 32K chars → opens ChatGPT; if longer → opens Claude
5. Prompt is stored in `chrome.storage.local` and picked up by the content script running on the AI tab
6. `content.js` (Section 2/3) injects the prompt into ChatGPT/Claude's input field and sends it

## Current State (last updated: 2026-03-13)

- **Version:** 1.0 (imported from ~/Documents/CODE3/easy-youtube-summary/)
- **Git branch:** Working on `dev`
- **What's been built so far:** Full working extension (as of Dec 2024), now broken

## Known Issues / Pending Work

- **CRITICAL:** Extension can't detect/extract YouTube transcripts anymore. Likely cause: YouTube changed their HTML structure. The extension looks for:
  - `button[aria-label="Show transcript"]` — may no longer exist or have a different aria-label
  - `.segment-text.style-scope.ytd-transcript-segment-renderer` — transcript text elements, selectors may have changed
- Need to inspect current YouTube DOM to find updated selectors
- ChatGPT and Claude input injection may also need updating (their UIs change frequently)

## Session Hygiene Reminder

At the end of each session, update this file with anything that changed. A fresh session should never need the user to re-explain something that was already decided or built.
