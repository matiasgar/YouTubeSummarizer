# Session Primer — YouTubeSummarizer

> **Purpose:** This file is the single source of "what a fresh Claude session needs to know." It gets updated at the end of every session. Read this before starting any task.

---

## What This Project Is

"YouTube Summarizer" — a Chrome extension (Manifest V3) that extracts YouTube video transcripts and sends them to ChatGPT or Claude for AI-powered summarization. The user clicks the extension icon while on a YouTube video page, the transcript is extracted from the page DOM, a detailed summarization prompt is built, and it's automatically injected into an AI chat interface in a new tab.

## Architecture at a Glance

| Layer | What | Where |
|-------|------|-------|
| Extension | Chrome Manifest V3 extension | `extension/` |
| Files | manifest.json, background.js, content.js, icons/ | `extension/` |
| Context | Session primer, project docs | `context/` |
| Repo | github.com/matiasgar/YouTubeSummarizer (**public**) | remote |
| No backend, no frontend, no hosting | Pure Chrome extension, loaded locally via chrome://extensions | — |

## How the Extension Works (Detailed Flow)

### Trigger
User navigates to a YouTube watch page and clicks the extension icon in the Chrome toolbar.

### Step 1: background.js
- Listens for `chrome.action.onClicked`
- Checks if the current tab URL includes `youtube.com/watch`
- If yes, injects `content.js` into the YouTube tab via `chrome.scripting.executeScript`

### Step 2: content.js — Section 1 (YouTube Page Handler)
- Shows a pink notification banner ("Extracting transcript...", then updates to show which AI service will be used)
- Waits 2 seconds for page to fully load
- Finds and clicks the `button[aria-label="Show transcript"]` button
- **Polls** (up to 10 seconds, every 500ms) for transcript segments to appear:
  - Primary selector: `transcript-segment-view-model span.yt-core-attributed-string` (current YouTube DOM as of March 2026)
  - Fallback selector: `.segment-text.style-scope.ytd-transcript-segment-renderer` (old YouTube DOM, kept in case they revert)
- Extracts text from all segment elements and joins them
- Gets the video title from `yt-formatted-string.style-scope.ytd-watch-metadata[force-default-style]`
- Builds a detailed summarization prompt with 3 sections: MAIN TAKE, SUMMARY, FRESH IDEAS
- Stores the prompt in `chrome.storage.local`
- **Routing logic:** If transcript < 60,000 chars → opens ChatGPT; if longer → opens Claude (Claude has a larger context window). The 60K char threshold (~15K tokens) is conservative — well within ChatGPT Plus's 32K token limit with headroom for the prompt template and non-English tokenization.

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
| ChatGPT model picker button | `button[data-testid="model-switcher-dropdown-button"]` | 2026-03-13 |
| ChatGPT Auto model option | `[data-testid="model-switcher-gpt-5-3"]` | 2026-03-13 |
| Claude input | `div[role="textbox"]` / `.ProseMirror` | 2026-03-13 |
| Claude send button | `button[aria-label="Send message"]` (lowercase m) | 2026-03-13 |

## Origin of the Code

This extension was originally developed by Matias across three iterations:
1. `~/Documents/CODE/youtube-summarizer/` — ChatGPT-only version (Nov 2024)
2. `~/Documents/CODE2/youtube-summary-claude/` — Claude-only version (Nov 2024)
3. `~/Documents/CODE3/easy-youtube-summary/` — Unified version supporting both ChatGPT and Claude (Nov-Dec 2024)

The code in this repo was imported from iteration #3 (the most feature-complete) and then fixed in Session 0.

## Current State (last updated: 2026-03-13, end of Session 2)

- **Version:** 1.2
- **Git branch:** Working on `dev`, pushed to remote. `master` has not been updated since Session 0.
- **Status:** Session 2 changes (auto-disable thinking on ChatGPT) need testing by Matias.
- **Repo visibility:** Public (https://github.com/matiasgar/YouTubeSummarizer)

## What Was Done in Session 0 (2026-03-13)

This was the project setup and first bug fix session:

1. **Project scaffolding** — Created the project structure per the Claude Code playbook (adapted for a Chrome extension: no frontend/backend, no hosting config, no deploy triggers):
   - `.claude/CLAUDE.md` — project rules
   - `context/session-primer.md` — this file
   - `extension/` — all extension source code
   - `deploy.sh` — merges dev→master (no hosting auto-deploy, but keeps the workflow consistent)
   - `.gitignore`

2. **Code import** — Copied the latest extension code from `~/Documents/CODE3/easy-youtube-summary/` into `extension/`

3. **Git + GitHub setup** — Initialized repo, created `dev` and `master` branches, created private GitHub repo at `matiasgar/YouTubeSummarizer`, pushed both branches. Later made repo public at Matias's request.

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

## What Was Done in Session 1 (2026-03-13)

This session focused on research, routing logic update, notification fix, and full rename.

1. **Researched ChatGPT/Claude context window limits (March 2026):**
   - ChatGPT web interface: GPT-4o retired Feb 2026, replaced by GPT-5.x models. Context limits: 8K tokens (free), 32K tokens (Plus), 128K (Pro), 196K (Enterprise)
   - Claude web interface: 200K tokens on all plans (free and paid)
   - Conclusion: the old 32K char routing threshold was very conservative but the dual-routing logic is still valid (ChatGPT has lower limits than Claude for most users)

2. **Raised routing threshold** from 32,000 to 60,000 chars (~15K tokens). Conservative enough to stay well within ChatGPT Plus's 32K token limit with headroom for prompt overhead and non-English tokenization.

3. **Fixed notification banner** — Previously hardcoded "Sending video to ChatGPT" even when routing to Claude. Now shows "Extracting transcript..." initially, then updates to "Sending video to ChatGPT" or "Sending video to Claude" after the routing decision.

4. **Renamed everything:**
   - Chrome extension: "Easy YouTube Summary" → "YouTube Summarizer"
   - All user-facing notification text: "Easy YouTube Summarizer says:" → "YouTube Summarizer says:"
   - GitHub repo: `matiasgar/VideoSummarizer` → `matiasgar/YouTubeSummarizer` (GitHub redirects old URL)
   - Local git remote updated
   - All docs updated (CLAUDE.md, session-primer.md)

5. **Bumped version** to 1.2

6. **Not yet tested** — Matias needs to reload the extension in Chrome and verify all changes work.

## What Was Done in Session 2 (2026-03-13)

1. **Auto-disable extended thinking on ChatGPT:** When the extension opens ChatGPT, it now checks the model picker. If "Thinking" or "Pro" mode is active, it automatically switches to "Auto" before injecting the prompt. This ensures fast responses without reasoning overhead.

2. **Graceful failure:** The model-switching logic is wrapped in try/catch with null checks at every step. If OpenAI changes their DOM and the selectors break, the extension silently proceeds with whatever model was active — no errors, no interruption.

3. **Claude unchanged:** No changes to the Claude handler.

4. **New selectors documented:** Added ChatGPT model picker button and Auto option to the selector table.

## Known Issues / Potential Future Work

- **Fragile selectors:** The extension depends on specific CSS selectors in YouTube, ChatGPT, and Claude's DOMs. Any of these services can change their HTML at any time and break the extension again. The selector table above documents what was verified and when.
- **No error recovery for transcript panel loading:** If the transcript panel takes more than 10 seconds to load, the extension gives up. Could be made more resilient.
- **No popup/options UI:** The extension has no settings page. The 60K character threshold for ChatGPT vs Claude routing is hardcoded.
- **Platform compatibility:** Works on any OS (Mac, Windows, Linux) with Chrome. No platform-specific code.
- **Could simplify to Claude-only:** Claude's free tier now handles 200K tokens, far more than any YouTube transcript. Dropping ChatGPT support would halve the fragile selectors to maintain. Matias decided against this for now (Session 1).

## Session Hygiene Reminder

At the end of each session, update this file with anything that changed. A fresh session should never need the user to re-explain something that was already decided or built.
