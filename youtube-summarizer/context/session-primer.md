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
User navigates to any web page and clicks the extension icon in the Chrome toolbar.

### Step 1: background.js
- Listens for `chrome.action.onClicked`
- Injects `content.js` into the current tab via `chrome.scripting.executeScript` (any page, not just YouTube)

### Step 2a: content.js — Section 1 (YouTube Page Handler)
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

### Step 2b: content.js — Section 1b (Web Page Handler)
- Runs on any page that is NOT YouTube, ChatGPT, or Claude
- Shows a pink notification banner ("Extracting page text...")
- Extracts visible text using smart content detection:
  - First tries `<article>` element (most blog posts/news sites use this)
  - Falls back to `<main>` element
  - Falls back to `document.body.innerText` (full page text)
- Gets the page title from `document.title` and URL from `window.location.href`
- Minimum 50-character check to avoid empty/trivial pages
- Builds an article-adapted summarization prompt with the same 3-section structure (MAIN TAKE, SUMMARY, FRESH IDEAS) but with article/author language instead of video/speaker
- Adds a noise-filtering instruction to the prompt:
  - Stronger warning when using full body fallback ("ignore navigation, sidebars, footers...")
  - Lighter note when using `<article>`/`<main>` extraction
- Same routing logic: < 60K chars → ChatGPT, longer → Claude
- Stores the prompt in `chrome.storage.local` and opens the AI tab

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
| YouTube transcript button | `button[aria-label="Show transcript"]` (prefer visible variant) | 2026-04-14 |
| YouTube transcript text | `transcript-segment-view-model span.ytAttributedStringHost` | 2026-04-14 |
| YouTube video title | `yt-formatted-string.style-scope.ytd-watch-metadata[force-default-style]` (with `h1.ytd-watch-metadata` fallback) | 2026-04-14 |
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

## Current State (last updated: 2026-04-14, end of Session 5)

- **Version:** 1.5
- **Git branch:** Working on `dev`, pushed to remote. `master` has not been updated since Session 0.
- **Status:** Session 5 fixed the broken YouTube transcript extraction (CSS class rename). Tested and confirmed working by Matias in real Chrome.
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

1. **Auto-disable extended thinking on ChatGPT:** When the extension opens ChatGPT, it now checks the model picker's `aria-label`. If "Thinking" or "Pro" mode is active, it opens the model dropdown and switches to "Auto" before injecting the prompt.

2. **Key technical finding — Radix UI requires PointerEvents:** ChatGPT uses Radix UI for its dropdown menus. Simple `.click()` calls are silently ignored. The fix uses `PointerEvent('pointerdown')` → `PointerEvent('pointerup')` → `MouseEvent('click')` sequence, which Radix UI responds to. This applies to both the model picker button and the menu items.

3. **Graceful failure:** The model-switching logic is wrapped in try/catch with null checks at every step. If OpenAI changes their DOM and the selectors break, the extension silently proceeds with whatever model was active — no errors, no interruption.

4. **Claude unchanged:** No changes to the Claude handler.

5. **New selectors documented:** Added ChatGPT model picker button and Auto option to the selector table.

6. **Versioning rule added:** Added rule to `.claude/CLAUDE.md` that the extension version in `manifest.json` must be bumped every session.

7. **Tested and confirmed working** by Matias.

## What Was Done in Session 3 (2026-04-09)

This session added web page summarization support — the extension now works on any page, not just YouTube.

1. **Web page summarization:** Clicking the extension icon on any non-YouTube page now extracts the visible text and sends it to ChatGPT/Claude for summarization using the same routing and injection pipeline.

2. **Smart content extraction:** The extension tries `<article>` first, then `<main>`, and falls back to `document.body.innerText`. This produces cleaner input on sites that use semantic HTML (most blogs and news sites).

3. **Noise-filtering prompt instruction:** The prompt tells the AI model to focus on the main content and ignore navigation, sidebars, footers, etc. The instruction is stronger when using the full-body fallback.

4. **Article-adapted prompt:** Same 3-section structure (MAIN TAKE, SUMMARY, FRESH IDEAS) but with "page/author" language instead of "video/speaker".

5. **Generic notification text:** Updated all modal/notification text to say "content" instead of "video" where the message applies to both YouTube and web pages. YouTube-specific notifications (e.g., "Sending video to ChatGPT") remain unchanged since they only appear on YouTube pages.

6. **Updated toolbar tooltip:** Changed from "Get Video Summary" to "Summarize this page".

7. **background.js simplified:** Removed the YouTube-only URL check — `content.js` is now injected on any page and decides internally how to handle it.

8. **Bumped version** to 1.3.

9. **Tested and confirmed working** by Matias on a web page.

## What Was Done in Session 5 (2026-04-14)

This session fixed a YouTube DOM change that broke transcript extraction.

1. **Root cause diagnosed via Claude-in-Chrome on a live YouTube page:** YouTube renamed the CSS class on the `<span>` that wraps transcript segment text inside `transcript-segment-view-model` custom elements:
   - **Old class:** `yt-core-attributed-string` (Session 0 fix)
   - **New class:** `ytAttributedStringHost` (plus `ytAttributedStringLinkInheritColor` as a secondary class)
   - The outer `transcript-segment-view-model` element name is unchanged.
   - Result: the Session 0 selector `transcript-segment-view-model span.yt-core-attributed-string` now matches 0 elements on every video, so extraction silently fails and the "Could not extract transcript" path fires.

2. **Fix applied to `content.js`:**
   - **New primary selector:** `transcript-segment-view-model span.ytAttributedStringHost`
   - **Fallback chain:** old new-layout class (`span.yt-core-attributed-string`), then the pre-2026 class (`.segment-text.style-scope.ytd-transcript-segment-renderer`). Polling and the 10-second max wait are unchanged.
   - **Robuster "Show transcript" button click:** YouTube renders several `button[aria-label="Show transcript"]` copies (description, menus, engagement panel); some are hidden depending on layout state. The extension now picks the first VISIBLE one and falls back to the first DOM match if none are visible. The extension also attempts to click the description expander first (`#description-inline-expander #expand`) because the button often lives inside the collapsed description.
   - **Video title fallback:** Kept the existing selector as primary and added `h1.ytd-watch-metadata yt-formatted-string` → `h1.ytd-watch-metadata` → `document.title` fallbacks.

3. **Tested via Claude-in-Chrome:**
   - Rick Astley "Never Gonna Give You Up" (music video with description lyrics): 24 segments, 2089 chars, clean lyrics text (no timestamp noise).
   - "Me at the zoo" (oldest YouTube video, real spoken transcript): 3 segments, 217 chars, clean spoken text.
   - Title extraction verified on both.

4. **Non-obvious things learned during diagnosis:**
   - YouTube also rolled out a "modern transcript view" engagement panel (`target-id="PAmodern_transcript_view"`) with `Chapters` / `Transcript` chip tabs and a `Copy Transcript` button. This panel does not use `transcript-segment-view-model` custom elements and remained stuck on a spinner in automated sessions. The legacy `transcript-segment-view-model` path still works on real videos once the click lands correctly, so we stayed on that path.
   - `window.ytInitialPlayerResponse.captions.playerCaptionsTracklistRenderer.captionTracks` still exists and contains signed `baseUrl`s to timedtext — but fetching them returns `200` with a 0-byte body, and `/youtubei/v1/get_transcript` returns 400 FAILED_PRECONDITION when called from the content script. Neither API route is currently viable as a fallback; DOM scraping remains the only working extraction method.

5. **Bumped version** to 1.5.

6. **Tested and confirmed working** by Matias in real Chrome after reload.

## What Was Done in Session 4 (2026-04-11)

This session improved the SUMMARY section of both prompts to use subheadings.

1. **Subheading structure in SUMMARY:** Both YouTube and web page prompts now instruct the AI to organize the summary under `##` subheadings whenever the content has distinct topics, sections, or groupings. Numeric-titled content (e.g. "Top 10…") uses each item as its own subheading. Short single-thread content falls back to a flat bullet list.

2. **Removed "exhaustive" wording** from both prompts at Matias's request.

3. **Bumped version** to 1.4.

4. **Tested and confirmed working** by Matias.

## Known Issues / Potential Future Work

- **Fragile selectors:** The extension depends on specific CSS selectors in YouTube, ChatGPT, and Claude's DOMs. Any of these services can change their HTML at any time and break the extension again. The selector table above documents what was verified and when.
- **No error recovery for transcript panel loading:** If the transcript panel takes more than 10 seconds to load, the extension gives up. Could be made more resilient.
- **No popup/options UI:** The extension has no settings page. The 60K character threshold for ChatGPT vs Claude routing is hardcoded.
- **Platform compatibility:** Works on any OS (Mac, Windows, Linux) with Chrome. No platform-specific code.
- **Could simplify to Claude-only:** Claude's free tier now handles 200K tokens, far more than any YouTube transcript. Dropping ChatGPT support would halve the fragile selectors to maintain. Matias decided against this for now (Session 1).

## YouTube DOM Future Risks — What to Watch For

Notes from Session 5 diagnosis. If transcript extraction breaks again, read this before you start.

### The two layouts YouTube is currently running

YouTube is A/B-testing two transcript UI layouts in parallel. Both can appear on the same account across different sessions/videos:

1. **Legacy transcript panel (what the extension targets today).** The `<engagement-panel-section-list-renderer target-id="engagement-panel-searchable-transcript">` panel populates with `transcript-segment-view-model` custom elements when opened. Each segment has a timestamp, an aria-label (e.g. "1 second"), and a text span. The text span's class has rotated at least twice:
   - Pre-2026: `.segment-text.style-scope.ytd-transcript-segment-renderer`
   - Session 0 fix (March 2026): `span.yt-core-attributed-string`
   - Session 5 fix (April 2026): `span.ytAttributedStringHost`
   These class names are generated by a build process — expect them to churn again. The outer tag name `transcript-segment-view-model` has been stable so far; if *that* changes too, the whole extraction path is gone.
2. **"Modern transcript view" panel (not yet targeted).** A new `target-id="PAmodern_transcript_view"` panel exists in `ytInitialData` on some videos. A separate "engagement-panel-searchable-transcript" that renders a tabbed UI (`Chapters` / `Transcript` chip tabs, `<button role="tab">` inside `chip-shape` inside `chip-view-model`) plus an **"In this video" AI summary** header and a **"Copy Transcript" button** is also showing up. This panel does not use `transcript-segment-view-model` at all — its Transcript tab either lazy-loads content into a different structure (possibly plain divs) or relies entirely on the "Copy Transcript" button to get text out of it. In Session 5 I could never get the automation session to render actual segments inside this modern panel (the spinner stayed forever), so I never captured its target selector. **If/when the legacy panel disappears, this is the next thing to target.**

### Signals that the migration has happened

If you see any of these when debugging:
- `document.querySelectorAll('transcript-segment-view-model').length === 0` on every video after opening the panel
- The expanded transcript panel contains the literal text `"In this video"`, `"Copy Transcript"`, `"Chapters"`, `"Transcript"` and a `tp-yt-paper-spinner` that never resolves
- `ytd-engagement-panel-section-list-renderer[target-id="PAmodern_transcript_view"]` exists *and* is the one being expanded

…then the extension has lost its legacy extraction path and you need a new strategy. Three options in order of preference:

### Extraction strategies to try when selectors break

1. **Click "Copy Transcript" + read clipboard (recommended next attempt).** The modern panel has a `<button>` whose visible text contains "Copy Transcript". Simulating a click on it copies the transcript into the clipboard. Content scripts can read it via `navigator.clipboard.readText()` — but this requires (a) user activation (the extension icon click counts as a gesture) and (b) `"permissions": ["clipboardRead"]` in `manifest.json`. The read must happen on the YouTube tab, *before* we open the ChatGPT/Claude tab (once the user tab loses focus, clipboard access is restricted). This is the cleanest fallback because it sidesteps DOM selectors entirely.

2. **Re-selector the modern panel's Transcript tab content.** Open `PAmodern_transcript_view` (or whichever panel is rendering the tabs), click the `<button role="tab">` whose text is "Transcript", wait for segments. In Session 5 I only saw the spinner stage, so I don't know the final selector. On a real user session that *does* render, use DevTools to find whichever element now carries the segment text and update the primary selector. Keep the old ones as fallbacks below it (we already have a three-deep fallback chain — just prepend the new one).

3. **InnerTube API / timedtext (explored in Session 5, currently dead ends — but document here in case they come back):**
   - `window.ytInitialPlayerResponse.captions.playerCaptionsTracklistRenderer.captionTracks` still exists and lists every caption track with a signed `baseUrl` pointing at `/api/timedtext`. **Fetching those URLs currently returns `200` with a 0-byte body** — YouTube appears to have stopped serving captions to uncredentialed-feeling fetches. If they relax this, this is the most robust path because it reads YouTube's actual data layer, not the UI.
   - `ytInitialData.engagementPanels[*].engagementPanelSectionListRenderer.content.continuationItemRenderer.continuationEndpoint.getTranscriptEndpoint.params` holds an opaque 120-char base64 token that the UI posts to `/youtubei/v1/get_transcript` along with `INNERTUBE_CONTEXT` from `window.ytcfg`. In Session 5 this returned `400 FAILED_PRECONDITION` even with the right client name/version/visitor data headers. It probably needs a `SAPISIDHASH` authorization header derived from the user's login cookies — feasible from a content script but non-trivial. If the DOM path dies and #1 above is also blocked, this is the escape hatch.

### What to do first when transcript extraction breaks again

1. Load the extension, open a YouTube video, click the extension icon, **look at the console log**. The current code already prints "Transcript elements found: N" — if N is 0, selectors are broken; if N > 0 but the prompt is empty, the problem is downstream.
2. Open DevTools on the YouTube page. In the console, run `document.querySelectorAll('transcript-segment-view-model').length` after clicking "Show transcript". If it's non-zero, only the inner `span` class rotated — find the new class by inspecting one segment and update the primary selector in `content.js` around line 134.
3. If step 2 returns 0, check whether the `PAmodern_transcript_view` panel is now the active one (`document.querySelectorAll('ytd-engagement-panel-section-list-renderer[visibility="ENGAGEMENT_PANEL_VISIBILITY_EXPANDED"]')`). If so, jump to strategy #1 (clipboard).
4. **Do not** trust Claude-in-Chrome to reproduce the modern panel fully — in Session 5 it stayed on a perpetual spinner even on videos that render fine in real Chrome. Always verify in Matias's real browser.

### What ChatGPT / Claude selectors to watch

Same fragility applies on the AI side. The current selectors (see table above) that are most likely to rotate:
- ChatGPT send button's `data-testid="send-button"` has been stable but OpenAI renames these every few months
- ChatGPT model picker `data-testid="model-switcher-gpt-5-3"` will break when OpenAI renames models (already happened between GPT-4o and GPT-5)
- Claude's send button has already flipped between `"Send Message"` and `"Send message"` casing — both are checked
- ChatGPT uses Radix UI which requires `PointerEvent('pointerdown') + pointerup + click` on dropdowns. Plain `.click()` is silently ignored. This is documented in Session 2 and used in the model-switcher code path.

## Session Hygiene Reminder

At the end of each session, update this file with anything that changed. A fresh session should never need the user to re-explain something that was already decided or built.
