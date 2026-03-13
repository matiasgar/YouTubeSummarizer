# Session Primer — VideoSummarizer

> **Purpose:** This file is the single source of "what a fresh Claude session needs to know." It gets updated at the end of every session. Read this before starting any task.

---

## What This Project Is

"Easy YouTube Summary" — a Chrome extension (Manifest V3) that extracts YouTube video transcripts and sends them to ChatGPT or Claude for AI-powered summarization. The user clicks the extension icon while on a YouTube video page, the transcript is extracted from the page DOM, a detailed summarization prompt is built, and it's automatically injected into an AI chat interface in a new tab.

## Architecture at a Glance

| Layer | What | Where |
|-------|------|-------|
| Extension | Chrome Manifest V3 extension | `extension/` |
| Files | manifest.json, background.js, content.js, icons/ | `extension/` |
| Context | Session primer, project docs | `context/` |
| Repo | github.com/matiasgar/VideoSummarizer (**public**) | remote |
| No backend, no frontend, no hosting | Pure Chrome extension, loaded locally via chrome://extensions | — |

## How the Extension Works (Detailed Flow)

### Trigger
User navigates to a YouTube watch page and clicks the extension icon in the Chrome toolbar.

### Step 1: background.js
- Listens for `chrome.action.onClicked`
- Checks if the current tab URL includes `youtube.com/watch`
- If yes, injects `content.js` into the YouTube tab via `chrome.scripting.executeScript`

### Step 2: content.js — Section 1 (YouTube Page Handler)
- Shows a pink notification banner ("Sending video to ChatGPT")
- Waits 2 seconds for page to fully load
- Finds and clicks the `button[aria-label="Show transcript"]` button
- **Polls** (up to 10 seconds, every 500ms) for transcript segments to appear:
  - Primary selector: `transcript-segment-view-model span.yt-core-attributed-string` (current YouTube DOM as of March 2026)
  - Fallback selector: `.segment-text.style-scope.ytd-transcript-segment-renderer` (old YouTube DOM, kept in case they revert)
- Extracts text from all segment elements and joins them
- Gets the video title from `yt-formatted-string.style-scope.ytd-watch-metadata[force-default-style]`
- Builds a detailed summarization prompt with 3 sections: MAIN TAKE, SUMMARY, FRESH IDEAS
- Stores the prompt in `chrome.storage.local`
- **Routing logic:** If transcript < 32,000 chars → opens ChatGPT; if longer → opens Claude (Claude has a larger context window)

### Step 3: content.js — Section 2 (ChatGPT Handler)
- Runs on `chat.openai.com` and `chatgpt.com` pages
- Checks `chrome.storage.local` for the `opening_chatgpt` flag
- Retrieves the stored prompt
- Finds the input area (`div[contenteditable="true"]`), inserts the prompt via `execCommand('insertText')`
- Finds the send button (`button[data-testid="send-button"]`), waits for it to be enabled, then clicks
- If the send button stays disabled (prompt too long), shows a red warning modal

### Step 4: content.js — Section 3 (Claude Handler)
- Runs on `claude.ai` pages
- Checks `chrome.storage.local` for the `opening_claude` flag
- Detects if user is logged into Claude (looks for login form elements)
- If not logged in: shows a red modal explaining the situation
- If logged in: finds input area (`div[role="textbox"]` or `.ProseMirror`), inserts prompt via `innerHTML`
- Checks send button (`button[aria-label="Send Message"]` or `button[aria-label="Send message"]`) for disabled state
- Sends via simulated Enter keypress

### Section 4: Too Long Warning
- Shared `showTooLongWarning()` function showing a red modal if the AI service can't handle the prompt length

## Key DOM Selectors (as of March 2026)

These are the selectors that are most likely to break when YouTube/ChatGPT/Claude update their UIs:

| What | Selector | Last verified |
|------|----------|---------------|
| YouTube transcript button | `button[aria-label="Show transcript"]` | 2026-03-13 |
| YouTube transcript text | `transcript-segment-view-model span.yt-core-attributed-string` | 2026-03-13 |
| YouTube video title | `yt-formatted-string.style-scope.ytd-watch-metadata[force-default-style]` | 2026-03-13 |
| ChatGPT input | `div[contenteditable="true"]` | 2026-03-13 |
| ChatGPT send button | `button[data-testid="send-button"]` | 2026-03-13 |
| Claude input | `div[role="textbox"]` / `.ProseMirror` | 2026-03-13 |
| Claude send button | `button[aria-label="Send message"]` (lowercase m) | 2026-03-13 |

## Origin of the Code

This extension was originally developed by Matias across three iterations:
1. `~/Documents/CODE/youtube-summarizer/` — ChatGPT-only version (Nov 2024)
2. `~/Documents/CODE2/youtube-summary-claude/` — Claude-only version (Nov 2024)
3. `~/Documents/CODE3/easy-youtube-summary/` — Unified version supporting both ChatGPT and Claude (Nov-Dec 2024)

The code in this repo was imported from iteration #3 (the most feature-complete) and then fixed in Session 0.

## Current State (last updated: 2026-03-13, end of Session 0)

- **Version:** 1.1
- **Git branch:** Working on `dev`, both `dev` and `master` pushed to remote
- **Status:** Extension is working. Tested by Matias on 2026-03-13 and confirmed functional.
- **Repo visibility:** Public (https://github.com/matiasgar/VideoSummarizer)

## What Was Done in Session 0 (2026-03-13)

This was the project setup and first bug fix session:

1. **Project scaffolding** — Created the project structure per the Claude Code playbook (adapted for a Chrome extension: no frontend/backend, no hosting config, no deploy triggers):
   - `.claude/CLAUDE.md` — project rules
   - `context/session-primer.md` — this file
   - `extension/` — all extension source code
   - `deploy.sh` — merges dev→master (no hosting auto-deploy, but keeps the workflow consistent)
   - `.gitignore`

2. **Code import** — Copied the latest extension code from `~/Documents/CODE3/easy-youtube-summary/` into `extension/`

3. **Git + GitHub setup** — Initialized repo, created `dev` and `master` branches, created private GitHub repo at `matiasgar/VideoSummarizer`, pushed both branches. Later made repo public at Matias's request.

4. **Diagnosed the broken transcript extraction** — Used browser automation to inspect a live YouTube page. Found that:
   - YouTube replaced `ytd-transcript-segment-renderer` elements with new `transcript-segment-view-model` custom elements
   - The old selector `.segment-text.style-scope.ytd-transcript-segment-renderer` returns 0 results
   - The new text lives in `transcript-segment-view-model span.yt-core-attributed-string`
   - The transcript panel also loads asynchronously (shows a spinner, segments appear later)
   - The "Show transcript" button selector still works
   - The video title selector still works
   - ChatGPT input/send selectors still work
   - Claude send button aria-label changed from "Send Message" to "Send message" (lowercase m)

5. **Applied fixes:**
   - Updated transcript extraction to use new `transcript-segment-view-model span.yt-core-attributed-string` selector
   - Replaced fixed 2-second wait with polling loop (500ms intervals, up to 10 seconds) for transcript segments to appear
   - Kept old selector as fallback in case YouTube reverts
   - Fixed Claude send button selector to try both "Send Message" and "Send message"
   - Bumped version to 1.1

6. **Tested** — Matias loaded the extension and confirmed it works.

## Known Issues / Potential Future Work

- **Fragile selectors:** The extension depends on specific CSS selectors in YouTube, ChatGPT, and Claude's DOMs. Any of these services can change their HTML at any time and break the extension again. The selector table above documents what was verified and when.
- **No error recovery for transcript panel loading:** If the transcript panel takes more than 10 seconds to load, the extension gives up. Could be made more resilient.
- **No popup/options UI:** The extension has no settings page. The 32K character threshold for ChatGPT vs Claude routing is hardcoded.
- **Platform compatibility:** Works on any OS (Mac, Windows, Linux) with Chrome. No platform-specific code.

## Session Hygiene Reminder

At the end of each session, update this file with anything that changed. A fresh session should never need the user to re-explain something that was already decided or built.
