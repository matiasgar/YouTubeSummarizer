/**
 * Content script for YouTube Summarizer extension
 * Features:
 * - Extraction of video transcript from YouTube page
 * - Extraction of visible text from any web page (articles, blog posts, etc.)
 * - Automatic summarization chatbot selection based on text length
 */
(function () {

    //=============================================================================
    // Section 0: Shared helpers (used by both the ChatGPT and Claude handlers)
    //=============================================================================

    // Visual diagnostic banner shown on the page (so the user can screenshot
    // the failure mode without having to copy console logs).
    function instantSwitchBanner() {
        let b = document.getElementById('instant-switch-diag');
        if (!b) {
            b = document.createElement('div');
            b.id = 'instant-switch-diag';
            b.style.cssText = 'position:fixed;top:80px;right:20px;background:#111;color:#0f0;padding:10px 14px;border-radius:6px;z-index:99999;max-width:480px;font-family:ui-monospace,monospace;font-size:11px;line-height:1.4;white-space:pre-wrap;border:1px solid #0f0;pointer-events:auto;';
            document.body.appendChild(b);
        }
        return {
            log: (line) => { b.textContent += line + '\n'; },
            fadeAfter: (ms) => setTimeout(() => { b.style.transition = 'opacity 2s'; b.style.opacity = '0'; setTimeout(() => b.remove(), 2500); }, ms),
        };
    }

    // Wait until checkFn() returns truthy. Uses MutationObserver — fires on
    // actual DOM changes and is NOT throttled in background tabs (unlike
    // setTimeout, which Chrome throttles to ~500ms+ when the tab is hidden).
    function waitForDom(checkFn, timeoutMs) {
        return new Promise(resolve => {
            if (checkFn()) return resolve(true);
            let done = false;
            let obs = null;
            let timer = null;
            const finish = (val) => {
                if (done) return;
                done = true;
                if (obs) obs.disconnect();
                if (timer) clearTimeout(timer);
                resolve(val);
            };
            obs = new MutationObserver(() => { if (checkFn()) finish(true); });
            obs.observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });
            timer = setTimeout(() => finish(false), timeoutMs);
        });
    }

    // Synthetic pointer helpers. Radix/React menus listen for pointer event
    // sequences, not bare .click(); submenus open on pointer hover.
    const fire = (el) => ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']
        .forEach(t => el.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, view: window, button: 0 })));
    const hover = (el) => ['pointerover', 'pointerenter', 'pointermove']
        .forEach(t => el.dispatchEvent(new PointerEvent(t, { bubbles: true, cancelable: true, view: window, pointerType: 'mouse' })));

    //=============================================================================
    // Section 1: YouTube Page Handler
    // Handles the initial user interaction, transcript extraction, and notification
    //=============================================================================

    if (window.location.href.includes('youtube.com/watch')) {
        async function getTranscriptAndSummarize() {
            console.log('Running getTranscriptAndSummarize()...');

            // Create and store unique notification ID
            const notificationId = 'notification-' + Date.now();
            await chrome.storage.local.set({
                'notification_active': true,
                'notification_id': notificationId,
                'youtube_notification_active': true  // New flag for YouTube tab notification
            });

            // Show centered notification
            const notificationHTML = `
                    <div id="${notificationId}" class="youtube-summary-notification" style="
                        position: fixed;
                        top: 20px;
                        left: 50%;
                        transform: translateX(-50%);
                        background:rgb(255, 107, 240);
                        padding: 16px 24px;
                        border-radius: 8px;
                        z-index: 10000;
                        max-width: 300px;
                        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
                        font-family: system-ui, -apple-system, sans-serif;
                        animation: slideIn 0.5s ease-out;
                    ">
                        <div style="
                            color: #FFFFFF;
                            font-size: 16px;
                            font-weight: 600;
                            margin-bottom: 8px;
                        ">
                            YouTube Summarizer says:
                        </div>
                        <div class="notification-text" style="
                            color: #FFFFFF;
                            font-size: 14px;
                            line-height: 1.5;
                        ">
                            Extracting transcript...
                        </div>
                    </div>
    
                    <style>
                        @keyframes slideIn {
                            from {
                                transform: translate(-50%, -100%);
                                opacity: 0;
                            }
                            to {
                                transform: translate(-50%, 0);
                                opacity: 1;
                            }
                        }
                    </style>
                `;

            const notificationContainer = document.createElement('div');
            notificationContainer.innerHTML = notificationHTML;
            document.body.appendChild(notificationContainer);

            // Remove YouTube notification when tab loses focus.
            // Guard: if the extension was reloaded while this listener is still
            // attached, chrome.runtime?.id becomes undefined and any chrome.*
            // call throws "Extension context invalidated". Bail silently.
            window.addEventListener('blur', async () => {
                if (!chrome.runtime?.id) return;
                try {
                    const youtubeNotificationActive = await chrome.storage.local.get('youtube_notification_active');
                    if (youtubeNotificationActive.youtube_notification_active) {
                        await chrome.storage.local.remove('youtube_notification_active');
                        const notification = document.querySelector('.youtube-summary-notification');
                        if (notification) notification.remove();
                    }
                } catch (e) {
                    // Extension was reloaded — ignore.
                }
            });

            // Wait for page to be fully loaded
            await new Promise(resolve => setTimeout(resolve, 2000));
            console.log('Waited for 2 seconds.');

            // The "Show transcript" button usually lives inside the video description,
            // which is collapsed by default on many videos. Expand it so the button is
            // actually reachable. Safe no-op if already expanded or expander missing.
            try {
                const descExpander = document.querySelector('#description-inline-expander[collapsed] #expand') ||
                                     document.querySelector('ytd-text-inline-expander[collapsed] #expand') ||
                                     document.querySelector('#description-inline-expander #expand');
                if (descExpander) {
                    descExpander.click();
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
            } catch (e) {
                console.log('Description expander click failed (non-fatal):', e.message);
            }

            // Prefer a VISIBLE "Show transcript" button — YouTube renders multiple copies
            // (description, menu, etc.) and the first one in DOM order may be hidden.
            const transcriptButtons = Array.from(document.querySelectorAll('button[aria-label="Show transcript"]'));
            const transcriptButton = transcriptButtons.find(b => b.offsetParent !== null) || transcriptButtons[0];
            console.log('Transcript button:', transcriptButton, '(visible variants:', transcriptButtons.filter(b => b.offsetParent !== null).length, '/', transcriptButtons.length, ')');

            if (!transcriptButton) {
                alert('No transcript button found, or selector might be outdated.');
                await chrome.storage.local.remove(['notification_active', 'notification_id', 'youtube_notification_active']);
                notificationContainer.remove();
                return;
            }

            transcriptButton.click();
            console.log('Clicked on transcript button.');

            // Poll until transcript segments appear (YouTube loads them async)
            let transcriptElements = [];
            const maxWaitMs = 10000;
            const pollInterval = 500;
            let waited = 0;
            while (waited < maxWaitMs) {
                await new Promise(resolve => setTimeout(resolve, pollInterval));
                waited += pollInterval;
                // Current YouTube DOM (April 2026): transcript-segment-view-model elements
                // whose clean text lives in a span.ytAttributedStringHost. YouTube renamed
                // the class from yt-core-attributed-string → ytAttributedStringHost.
                transcriptElements = document.querySelectorAll('transcript-segment-view-model span.ytAttributedStringHost');
                if (transcriptElements.length > 0) break;
                // Fallback: previous new-layout class name (March 2026)
                transcriptElements = document.querySelectorAll('transcript-segment-view-model span.yt-core-attributed-string');
                if (transcriptElements.length > 0) break;
                // Fallback: old YouTube DOM (in case they revert)
                transcriptElements = document.querySelectorAll('.segment-text.style-scope.ytd-transcript-segment-renderer');
                if (transcriptElements.length > 0) break;
            }
            console.log('Transcript elements found:', transcriptElements.length);

            const transcript = Array.from(transcriptElements)
                .map(element => element.textContent.trim())
                .join(' ');

            if (!transcript) {
                alert('Could not extract transcript');
                await chrome.storage.local.remove(['notification_active', 'notification_id', 'youtube_notification_active']);
                notificationContainer.remove();
                return;
            }

            console.log('Extracted transcript:', transcript);

            // Video title — primary selector, with a simpler h1-based fallback if YouTube
            // changes the yt-formatted-string markup.
            const titleEl = document.querySelector('yt-formatted-string.style-scope.ytd-watch-metadata[force-default-style]') ||
                            document.querySelector('h1.ytd-watch-metadata yt-formatted-string') ||
                            document.querySelector('h1.ytd-watch-metadata');
            const videoTitle = (titleEl?.textContent || document.title.replace(/ - YouTube$/, '')).trim();

            const prompt = `Below is the transcript of a YouTube video titled "${videoTitle}." 
                 
    Please provide an overview of the transcript (if the transcript is not in English use the transcript language, not English) using the following structure:
    
    # ${videoTitle}
    
    # 1. MAIN TAKE:
    [A single, clear sentence capturing the main thesis, insight, or idea in the video. Only use 2 sentences if it is impossible to summarize the main take in a single sentence.]
    
    # 2. SUMMARY:
    [Overview of every main element, event, or idea discussed in the video.
    - Organize the summary under ## subheadings whenever the content has distinct topics, sections, or groupings. Choose heading names that reflect the actual content.
    - If the title indicates a numeric structure (e.g., "3 Reasons Why Mac Is Better than PC," "Top 10 Luxury Hotels in London"), use each item as its own ## subheading.
    - Under each subheading, use bullet points to capture the specific elements, events, or ideas.
    - If a bullet doesn't fit under any subheading, list it under a final ## Other subheading or before the first subheading.
    - Only skip subheadings entirely if the video is short and genuinely covers a single continuous thread with no distinct sections — in that case, use a flat bullet list.
    - Before moving to the next section, double-check to ensure that you've included all the main elements/events/ideas discussed in the video.]
    
    # 3. FRESH IDEAS:
    State 'Nothing fresh! 🧐' if the transcript doesn't include groundbreaking ideas or fresh insights. However, DO include ideas that feel groundbreaking OR offer a distinct reframing or perspective on a well-known idea, provided it adds clarity, nuance, or deeper understanding.
    - If you include any items here, clearly justify in 1-2 sentences why each listed idea feels fresh.
    - Exceptionally, well-known views or facts can be included if they are explained in a way that offers fresh clarity or perspective.
    - IMPORTANT: It's better to say "Nothing fresh! 🧐" than to force items into this section if none genuinely stand out.]
    
    Transcript:
    ${transcript}`;

            // Check transcript length to decide ChatGPT vs Claude routing.
            // Updated Aug 2026: GPT-5.6 models have a ~1M-token context, and the
            // chatgpt.com composer empirically accepted a 400K-char message on a
            // Plus account (send button stayed enabled). 350K keeps a safety
            // margin — roughly 6+ hours of spoken video before Claude is needed.
            const CHAR_LIMIT = 350000;
            const useClaudeInstead = transcript.length > CHAR_LIMIT;

            await chrome.storage.local.set({ 'youtube_summary_prompt': prompt });
            console.log('Stored prompt in chrome.storage.');

            // Update notification to show which AI service will be used
            const notificationText = notificationContainer.querySelector('.notification-text');
            if (notificationText) {
                notificationText.textContent = useClaudeInstead
                    ? 'Sending video to Claude'
                    : 'Sending video to ChatGPT';
            }

            if (useClaudeInstead) {
                // Cleanup notification state
                await chrome.storage.local.remove(['notification_active', 'notification_id', 'youtube_notification_active']);

                // Use Claude for long transcripts
                await chrome.storage.local.set({ 'opening_claude': true });
                const claudeWindow = window.open('https://claude.ai/new', '_blank');
                if (claudeWindow) {
                    claudeWindow.focus();
                }
                console.log('Transcript too long for ChatGPT, opened Claude instead.');
            } else {
                // Use ChatGPT for normal length transcripts
                await chrome.storage.local.set({ 'opening_chatgpt': true });
                const chatGPTWindow = window.open('https://chat.openai.com/', '_blank');
                if (chatGPTWindow) {
                    chatGPTWindow.focus();
                }
                console.log('Opened ChatGPT in a new tab.');
            }
        }

        getTranscriptAndSummarize();
    }

    //=============================================================================
    // Section 1b: Web Page Handler
    // Handles non-YouTube pages: extracts visible text and sends for summarization
    //=============================================================================

    if (!window.location.href.includes('youtube.com/watch') &&
        window.location.hostname !== 'chat.openai.com' &&
        window.location.hostname !== 'chatgpt.com' &&
        window.location.hostname !== 'claude.ai') {

        async function getPageTextAndSummarize() {
            console.log('Running getPageTextAndSummarize()...');

            // Create and store unique notification ID
            const notificationId = 'notification-' + Date.now();
            await chrome.storage.local.set({
                'notification_active': true,
                'notification_id': notificationId,
                'source_notification_active': true
            });

            // Show centered notification
            const notificationHTML = `
                    <div id="${notificationId}" class="youtube-summary-notification" style="
                        position: fixed;
                        top: 20px;
                        left: 50%;
                        transform: translateX(-50%);
                        background:rgb(255, 107, 240);
                        padding: 16px 24px;
                        border-radius: 8px;
                        z-index: 10000;
                        max-width: 300px;
                        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
                        font-family: system-ui, -apple-system, sans-serif;
                        animation: slideIn 0.5s ease-out;
                    ">
                        <div style="
                            color: #FFFFFF;
                            font-size: 16px;
                            font-weight: 600;
                            margin-bottom: 8px;
                        ">
                            YouTube Summarizer says:
                        </div>
                        <div class="notification-text" style="
                            color: #FFFFFF;
                            font-size: 14px;
                            line-height: 1.5;
                        ">
                            Extracting page text...
                        </div>
                    </div>

                    <style>
                        @keyframes slideIn {
                            from {
                                transform: translate(-50%, -100%);
                                opacity: 0;
                            }
                            to {
                                transform: translate(-50%, 0);
                                opacity: 1;
                            }
                        }
                    </style>
                `;

            const notificationContainer = document.createElement('div');
            notificationContainer.innerHTML = notificationHTML;
            document.body.appendChild(notificationContainer);

            // Remove notification when tab loses focus.
            // Guarded against "Extension context invalidated" after reloads.
            window.addEventListener('blur', async () => {
                if (!chrome.runtime?.id) return;
                try {
                    const notifActive = await chrome.storage.local.get('source_notification_active');
                    if (notifActive.source_notification_active) {
                        await chrome.storage.local.remove('source_notification_active');
                        const notification = document.querySelector('.youtube-summary-notification');
                        if (notification) notification.remove();
                    }
                } catch (e) {
                    // Extension was reloaded — ignore.
                }
            });

            // Extract page text — prefer <article> or <main> for cleaner content,
            // fall back to full body text if neither exists
            const articleEl = document.querySelector('article');
            const mainEl = document.querySelector('main');
            const contentSource = articleEl || mainEl || document.body;
            const pageText = contentSource.innerText;
            const usedFallback = contentSource === document.body;
            const pageTitle = document.title;
            const pageUrl = window.location.href;

            if (!pageText || pageText.trim().length < 50) {
                alert('Could not extract meaningful text from this page.');
                await chrome.storage.local.remove(['notification_active', 'notification_id', 'source_notification_active']);
                notificationContainer.remove();
                return;
            }

            console.log('Extracted page text length:', pageText.length);

            const noiseNote = usedFallback
                ? `\n\nIMPORTANT: This text was extracted from the full page, so it may include navigation menus, sidebars, footers, cookie notices, comment sections, or other UI elements. Focus ONLY on the main article/content and completely ignore any unrelated text fragments.`
                : `\n\nNote: This text was extracted from the main content area, but it may still contain minor peripheral elements. Focus on the core article content.`;

            const prompt = `Below is the text content of a web page titled "${pageTitle}" (${pageUrl}).${noiseNote}

Please provide an overview of this content (if the text is not in English use the text's language, not English) using the following structure:

# ${pageTitle}

# 1. MAIN TAKE:
[A single, clear sentence capturing the main thesis, argument, or insight of this page. Only use 2 sentences if it is impossible to summarize the main take in a single sentence.]

# 2. SUMMARY:
[Overview of every main element, argument, or idea discussed on this page.
- Organize the summary under ## subheadings whenever the content has distinct topics, sections, or groupings. Choose heading names that reflect the actual content.
- If the title or content indicates a numeric structure (e.g., "5 Tips for...", "Top 10..."), use each item as its own ## subheading.
- Under each subheading, use bullet points to capture the specific elements, arguments, or ideas.
- If a bullet doesn't fit under any subheading, list it under a final ## Other subheading or before the first subheading.
- Only skip subheadings entirely if the page is short and genuinely covers a single continuous argument with no distinct sections — in that case, use a flat bullet list.
- Before moving to the next section, double-check to ensure that you've included all the main elements/arguments/ideas discussed on this page.]

# 3. FRESH IDEAS:
State 'Nothing fresh! 🧐' if the content doesn't include groundbreaking ideas or fresh insights. However, DO include ideas that feel groundbreaking OR offer a distinct reframing or perspective on a well-known idea, provided it adds clarity, nuance, or deeper understanding.
- If you include any items here, clearly justify in 1-2 sentences why each listed idea feels fresh.
- Exceptionally, well-known views or facts can be included if they are explained in a way that offers fresh clarity or perspective.
- IMPORTANT: It's better to say "Nothing fresh! 🧐" than to force items into this section if none genuinely stand out.]

Page text:
${pageText}`;

            // 350K chars — see the rationale in the YouTube section above.
            const CHAR_LIMIT = 350000;
            const useClaudeInstead = pageText.length > CHAR_LIMIT;

            await chrome.storage.local.set({ 'youtube_summary_prompt': prompt });
            console.log('Stored prompt in chrome.storage.');

            // Update notification to show which AI service will be used
            const notificationText = notificationContainer.querySelector('.notification-text');
            if (notificationText) {
                notificationText.textContent = useClaudeInstead
                    ? 'Sending page to Claude'
                    : 'Sending page to ChatGPT';
            }

            if (useClaudeInstead) {
                await chrome.storage.local.remove(['notification_active', 'notification_id', 'source_notification_active']);
                await chrome.storage.local.set({ 'opening_claude': true });
                const claudeWindow = window.open('https://claude.ai/new', '_blank');
                if (claudeWindow) {
                    claudeWindow.focus();
                }
                console.log('Page text too long for ChatGPT, opened Claude instead.');
            } else {
                await chrome.storage.local.set({ 'opening_chatgpt': true });
                const chatGPTWindow = window.open('https://chat.openai.com/', '_blank');
                if (chatGPTWindow) {
                    chatGPTWindow.focus();
                }
                console.log('Opened ChatGPT in a new tab.');
            }
        }

        getPageTextAndSummarize();
    }

    //=============================================================================
    // Section 2: ChatGPT Handler
    // Manages interaction with ChatGPT interface and notification updates
    //=============================================================================

    if (window.location.hostname === 'chat.openai.com' ||
        window.location.hostname === 'chatgpt.com') {

        // Force ChatGPT to its lightest configuration before sending, so
        // summaries don't burn expensive model/reasoning quota.
        //
        // As of Aug 2026 the composer pill (e.g. "5.6 SolLight") opens a menu of
        // three submenus — Model (Sol/Terra/Luna), Effort (Light…Max) and Speed
        // (Standard/Fast). We force Model→Luna (cheapest tier), Effort→Light,
        // Speed→Standard. A legacy fallback still handles the pre-2026 flat
        // Instant/Thinking/Pro menu, just in case OpenAI A/B-tests the old UI.
        async function forceChatGPTLightestMode() {
            const TAG = '[LightSwitch]';
            const banner = instantSwitchBanner();
            const say = (s) => { console.log(`${TAG} ${s}`); banner.log(s); };
            const warn = (s) => { console.warn(`${TAG} ${s}`); banner.log('WARN: ' + s); };
            try {
                say(`starting (visibility=${document.visibilityState})`);

                await waitForDom(() => !!document.querySelector('button.__composer-pill'), 10000);
                const pill = document.querySelector('button.__composer-pill');
                if (!pill) {
                    warn('mode pill not found — skipping');
                    banner.log('composer button texts: ' + JSON.stringify(Array.from(document.querySelectorAll('form button')).map(b => b.textContent.trim().slice(0, 40))));
                    banner.fadeAfter(15000);
                    return;
                }
                say(`current pill = "${pill.textContent.trim()}"`);

                const menuOpen = () => pill.getAttribute('aria-expanded') === 'true';
                const openMenu = async () => {
                    if (menuOpen()) return true;
                    fire(pill);
                    return waitForDom(() => menuOpen() && document.querySelectorAll('[role="menuitem"], [role="menuitemradio"]').length > 0, 5000);
                };
                const closeMenu = async () => {
                    if (!menuOpen()) return;
                    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
                    await waitForDom(() => !menuOpen(), 2000);
                };

                // Fast path: pill already shows the target config.
                const pillText = pill.textContent.trim();
                if (/luna/i.test(pillText) && /light/i.test(pillText)) {
                    say('already Luna + Light — done');
                    banner.fadeAfter(5000);
                    return;
                }

                // The three settings we force. Submenu triggers read like
                // "ModelGPT-5.6 Sol" / "EffortLight" / "SpeedStandard" (label
                // concatenated with current value).
                const STEPS = [
                    { label: 'Model', trigger: /^model/i, isTarget: (v) => /luna/i.test(v), radioMatch: (t) => /luna/i.test(t) && !/legacy/i.test(t) },
                    { label: 'Effort', trigger: /^effort/i, isTarget: (v) => /^light\b/i.test(v), radioMatch: (t) => /^light$/i.test(t) },
                    { label: 'Speed', trigger: /^speed/i, isTarget: (v) => /^standard/i.test(v), radioMatch: (t) => /^standard/i.test(t) },
                ];

                // Two passes: pass 2 re-reads each value and retries anything
                // that didn't take (each radio click closes the whole menu).
                let sawAnyTrigger = false;
                for (let pass = 1; pass <= 2; pass++) {
                    for (const step of STEPS) {
                        if (!(await openMenu())) { warn('menu would not open'); continue; }
                        const trigger = Array.from(document.querySelectorAll('[role="menuitem"]'))
                            .find(el => step.trigger.test(el.textContent.trim()));
                        if (!trigger) {
                            if (pass === 1) say(`${step.label}: submenu trigger not found`);
                            continue;
                        }
                        sawAnyTrigger = true;
                        const value = trigger.textContent.trim().replace(step.trigger, '').trim();
                        if (step.isTarget(value)) {
                            if (pass === 1) say(`${step.label}: already "${value}"`);
                            continue;
                        }

                        // Radix submenus open on pointer hover; click and
                        // keyboard are fallbacks.
                        hover(trigger);
                        let ok = await waitForDom(() => Array.from(document.querySelectorAll('[role="menuitemradio"]')).some(r => step.radioMatch(r.textContent.trim())), 3000);
                        if (!ok) {
                            fire(trigger);
                            ok = await waitForDom(() => Array.from(document.querySelectorAll('[role="menuitemradio"]')).some(r => step.radioMatch(r.textContent.trim())), 3000);
                        }
                        if (!ok) { warn(`${step.label}: submenu did not open`); await closeMenu(); continue; }

                        const radio = Array.from(document.querySelectorAll('[role="menuitemradio"]')).find(r => step.radioMatch(r.textContent.trim()));
                        fire(radio);
                        await waitForDom(() => !menuOpen(), 4000);
                        say(`${step.label}: "${value}" → clicked target; pill now "${pill.textContent.trim()}"`);
                        await new Promise(r => setTimeout(r, 300));
                    }
                }

                // Legacy fallback: the old flat Instant/Thinking/Pro menu.
                if (!sawAnyTrigger) {
                    say('no Model/Effort/Speed submenus — trying legacy flat menu');
                    if (await openMenu()) {
                        const instant = Array.from(document.querySelectorAll('[role="menuitemradio"]'))
                            .find(el => /^instant\b/i.test((el.textContent || '').trim()));
                        if (instant) {
                            fire(instant);
                            await waitForDom(() => !menuOpen(), 4000);
                            say('legacy Instant clicked');
                        } else {
                            warn('legacy Instant item not found either');
                        }
                    }
                }

                await closeMenu();
                say(`done; pill final = "${pill.textContent.trim()}"`);
                banner.fadeAfter(8000);
            } catch (err) {
                console.error(`${TAG} error:`, err);
                try { banner.log('ERROR: ' + (err?.message || String(err))); banner.fadeAfter(15000); } catch (_) { }
            }
        }

        async function handleChatGPT() {
            console.log('Running handleChatGPT()...');

            const openingData = await chrome.storage.local.get('opening_chatgpt');
            if (!openingData.opening_chatgpt) {
                console.log('ChatGPT page loaded but not from our extension');
                return;
            }

            // Check for existing notification
            const notificationData = await chrome.storage.local.get(['notification_active', 'notification_id']);
            if (notificationData.notification_active) {
                // Create notification in ChatGPT tab
                const notificationHTML = `
                        <div id="${notificationData.notification_id}" class="youtube-summary-notification" style="
                            position: fixed;
                            top: 20px;
                            left: 50%;
                            transform: translateX(-50%);
                            background: rgb(255, 107, 240);
                            padding: 16px 24px;
                            border-radius: 8px;
                            z-index: 10000;
                            max-width: 300px;
                            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
                            font-family: system-ui, -apple-system, sans-serif;
                        ">
                            <div style="
                                color: #FFFFFF;
                                font-size: 16px;
                                font-weight: 600;
                                margin-bottom: 8px;
                            ">
                                YouTube Summarizer says:
                            </div>
                            <div class="notification-text" style="
                                color: #FFFFFF;
                                font-size: 14px;
                                line-height: 1.5;
                            ">
                                Requesting ChatGPT to summarize content
                            </div>
                        </div>
                    `;

                const notificationContainer = document.createElement('div');
                notificationContainer.innerHTML = notificationHTML;
                document.body.appendChild(notificationContainer);
            }

            await chrome.storage.local.remove('opening_chatgpt');

            // Ensure this ChatGPT tab is focused/visible BEFORE running the
            // mode switch. Chrome throttles timers AND React commits in hidden
            // tabs, so the picker clicks won't settle in a reasonable time
            // unless the tab is visible. focusSenderTab makes background.js
            // focus THIS specific tab (not whichever ChatGPT tab is first).
            try {
                chrome.runtime.sendMessage({ action: 'focusSenderTab' });
            } catch (e) {
                console.warn('focusSenderTab send failed:', e);
            }
            await waitForDom(() => document.visibilityState === 'visible', 3000);
            console.log('Tab visibility before mode switch:', document.visibilityState);

            // Run the mode switch TO COMPLETION before touching the composer.
            // Focusing the composer closes the model-picker menu, so running
            // the switch concurrently with prompt insertion silently kills the
            // switch mid-flight.
            await forceChatGPTLightestMode();

            const data = await chrome.storage.local.get('youtube_summary_prompt');
            const prompt = data.youtube_summary_prompt;
            console.log('Retrieved prompt:', prompt);

            if (!prompt) {
                console.error('No prompt found in storage.');
                await chrome.storage.local.remove(['notification_active', 'notification_id']);
                const notification = document.querySelector('.youtube-summary-notification');
                if (notification) notification.remove();
                return;
            }

            await chrome.storage.local.remove('youtube_summary_prompt');
            console.log('Removed prompt from storage.');

            // Make sure no picker menu is left open before we focus the composer.
            const pillBtn = document.querySelector('button.__composer-pill');
            if (pillBtn?.getAttribute('aria-expanded') === 'true') {
                document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
                await waitForDom(() => pillBtn.getAttribute('aria-expanded') !== 'true', 2000);
            }

            // Wait for the composer, insert, then send.
            const composerReady = await waitForDom(() => !!document.querySelector('div[contenteditable="true"]'), 15000);
            if (!composerReady) {
                console.error('ChatGPT composer never appeared.');
                await chrome.storage.local.remove(['notification_active', 'notification_id']);
                document.querySelector('.youtube-summary-notification')?.remove();
                return;
            }

            const promptArea = document.querySelector('div[contenteditable="true"]');
            try {
                window.focus();
                promptArea.focus();
                await new Promise(resolve => setTimeout(resolve, 500));

                document.execCommand('insertText', false, prompt);
                promptArea.dispatchEvent(new InputEvent('input', { bubbles: true }));

                await new Promise(resolve => setTimeout(resolve, 500));

                const sendButton = document.querySelector('button[data-testid="send-button"]');
                if (!sendButton) {
                    console.error('ChatGPT send button not found.');
                    return;
                }

                let buttonCheckAttempts = 0;
                const maxButtonCheckAttempts = 5;  // Will check for 5 seconds total

                while (buttonCheckAttempts < maxButtonCheckAttempts) {
                    const isDisabled = sendButton.disabled ||
                        sendButton.getAttribute('disabled') !== null ||
                        sendButton.getAttribute('aria-disabled') === 'true';

                    if (!isDisabled) {
                        // Removes notification before sending
                        await chrome.storage.local.remove(['notification_active', 'notification_id']);
                        const notification = document.querySelector('.youtube-summary-notification');
                        if (notification) notification.remove();

                        sendButton.click();
                        console.log('Successfully inserted prompt and clicked send button');
                        break;  // Button is enabled, proceed with sending
                    }

                    buttonCheckAttempts++;
                    if (buttonCheckAttempts === maxButtonCheckAttempts) {
                        console.log('ChatGPT send button remained disabled - showing warning');
                        showTooLongWarning('ChatGPT');
                        break;
                    }

                    console.log(`Waiting for ChatGPT send button to enable... Attempt ${buttonCheckAttempts}`);
                    await new Promise(resolve => setTimeout(resolve, 1000));  // Wait 1 second between checks
                }
            } catch (error) {
                console.error('Error inserting prompt:', error);
            }
        }

        handleChatGPT();
    }

    //=============================================================================
    // Section 3: Claude Handler
    // Manages interaction with Claude interface, including login check
    //=============================================================================

    if (window.location.hostname === 'claude.ai') {
        console.log('1. Detected claude.ai hostname');
        async function handleClaude() {
            console.log('Running handleClaude()...');

            const openingData = await chrome.storage.local.get('opening_claude');
            console.log('3. Opening data:', openingData);
            if (!openingData.opening_claude) {
                console.log('4a. Claude page loaded but not from our extension');
                return;
            }

            console.log('4b. Claude opened from our extension');

            await chrome.storage.local.remove('opening_claude');
            await new Promise(resolve => setTimeout(resolve, 2000));



            // Login Detection

            async function isClaudeLoggedIn() {
                await new Promise(resolve => setTimeout(resolve, 1000));

                // Check for login-related elements
                const buttons = Array.from(document.querySelectorAll('button'));
                const googleSignInButton = buttons.find(button =>
                    button.textContent.includes('Continue with Google')
                );
                const emailInput = document.querySelector('input[type="email"]');
                const emailContinueButton = buttons.find(button =>
                    button.textContent.includes('Continue with email')
                );

                // If we see ANY of these login elements, we're not logged in
                const hasLoginElements = googleSignInButton || emailInput || emailContinueButton;

                // Return true if we DON'T see login elements
                return !hasLoginElements;
            }


            const isLoggedIn = await isClaudeLoggedIn();
            console.log('5. Login check result:', isLoggedIn);
            // Behavior when not logged in

            if (!isLoggedIn) {
                console.log('Showing login modal...');
                const loginModalHTML = `
                        <div id="login-alert" style="
                            position: fixed;
                            top: 50%;
                            left: 50%;
                            transform: translate(-50%, -50%);
                            background: #FF0000;
                            padding: 24px;
                            border-radius: 8px;
                            z-index: 10000;
                            max-width: 400px;
                            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
                            font-family: system-ui, -apple-system, sans-serif;
                        ">
                            <div style="
                                color: #FFFFFF;
                                font-size: 18px;
                                font-weight: 600;
                                margin-bottom: 16px;
                            ">
                                YouTube Summarizer says:
                            </div>
                            <div style="
                                color: #FFFFFF;
                                font-size: 16px;
                                line-height: 1.5;
                                margin-bottom: 20px;
                            ">
                                The content was too long for ChatGPT to summarize, and we tried to use Claude instead. <br><br>However, it looks like you're not logged into Claude. Please log into Claude and try using our extension again.
                            </div>
                            <button id="login-alert-ok" style="
                                background: #FFFFFF;
                                color: #FF0000;
                                border: none;
                                padding: 8px 24px;
                                border-radius: 6px;
                                cursor: pointer;
                                float: right;
                                font-size: 14px;
                                font-weight: 500;
                            ">OK</button>
                        </div>
                        <div id="login-modal-backdrop" style="
                            position: fixed;
                            top: 0;
                            left: 0;
                            right: 0;
                            bottom: 0;
                            background: rgba(0, 0, 0, 0.5);
                            z-index: 9999;
                        "></div>
                    `;

                const loginModalContainer = document.createElement('div');
                loginModalContainer.innerHTML = loginModalHTML;
                document.body.appendChild(loginModalContainer);

                // Add click handlers for login modal
                document.getElementById('login-alert-ok').addEventListener('click', () => {
                    loginModalContainer.remove();
                });
                document.getElementById('login-modal-backdrop').addEventListener('click', () => {
                    loginModalContainer.remove();
                });

                console.log('User not logged into Claude');
                return;
            }

            // Behavior when logged in

            // Bring THIS tab to the foreground — Chrome throttles hidden tabs
            // and the composer may render slowly until the tab is visible.
            try {
                chrome.runtime.sendMessage({ action: 'focusSenderTab' });
            } catch (e) {
                console.warn('focusSenderTab send failed:', e);
            }
            await waitForDom(() => document.visibilityState === 'visible', 3000);

            const data = await chrome.storage.local.get('youtube_summary_prompt');
            const prompt = data.youtube_summary_prompt;

            if (!prompt) {
                console.error('No prompt found in storage.');
                return;
            }

            await chrome.storage.local.remove('youtube_summary_prompt');
            console.log('Removed prompt from storage.');

            const banner = instantSwitchBanner();
            banner.log('[Claude] waiting for composer…');

            // Wait for the TipTap/ProseMirror composer to render (claude.ai/new).
            const composerReady = await waitForDom(
                () => !!document.querySelector('.ProseMirror, div[role="textbox"]'), 20000);
            if (!composerReady) {
                console.error('Claude composer never appeared.');
                banner.log('[Claude] ERROR: composer never appeared');
                banner.fadeAfter(15000);
                return;
            }

            const promptArea = document.querySelector('.ProseMirror') ||
                document.querySelector('div[role="textbox"]');
            window.focus();
            promptArea.focus();

            // Current text length as the editor sees it (TipTap instance is
            // exposed on the DOM node as .editor).
            const editorLen = () => {
                try { if (promptArea.editor) return promptArea.editor.getText().length; } catch (_) { }
                return promptArea.textContent.length;
            };
            const filledEnough = () => editorLen() > prompt.length * 0.5;

            let filled = false;

            // Method 1: TipTap editor API — writes straight into the editor state.
            try {
                if (promptArea.editor?.commands) {
                    promptArea.editor.commands.clearContent(true);
                    promptArea.editor.commands.insertContent(prompt);
                    promptArea.editor.commands.focus('end');
                    await new Promise(r => setTimeout(r, 400));
                    filled = filledEnough();
                    banner.log('[Claude] TipTap API fill: ' + filled);
                }
            } catch (e) {
                console.warn('TipTap API fill failed:', e);
            }

            // Method 2: synthetic paste through the editor's paste pipeline
            // (verified to register and send correctly, Aug 2026).
            if (!filled) {
                try {
                    const dt = new DataTransfer();
                    dt.setData('text/plain', prompt);
                    promptArea.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
                    await new Promise(r => setTimeout(r, 700));
                    filled = filledEnough();
                    banner.log('[Claude] paste-event fill: ' + filled);
                } catch (e) {
                    console.warn('Paste-event fill failed:', e);
                }
            }

            // Method 3: execCommand insertText.
            if (!filled) {
                promptArea.focus();
                document.execCommand('selectAll', false, null);
                document.execCommand('delete', false, null);
                document.execCommand('insertText', false, prompt);
                await new Promise(r => setTimeout(r, 700));
                filled = filledEnough();
                banner.log('[Claude] execCommand fill: ' + filled);
            }

            if (!filled) {
                console.error('Could not insert prompt into Claude composer.');
                banner.log('[Claude] ERROR: all fill methods failed');
                banner.fadeAfter(15000);
                return;
            }

            // Send via a synthetic Enter keydown. Claude no longer renders a
            // send button for synthetic input, but the editor's Enter keymap
            // still submits (verified live: message sent, chat created).
            // Success signal: the composer empties.
            for (let attempt = 1; attempt <= 2; attempt++) {
                promptArea.dispatchEvent(new KeyboardEvent('keydown', {
                    key: 'Enter',
                    code: 'Enter',
                    keyCode: 13,
                    which: 13,
                    bubbles: true,
                    cancelable: true,
                    composed: true
                }));
                const sent = await waitForDom(() => editorLen() < 5, 6000);
                if (sent) {
                    console.log('Prompt sent to Claude.');
                    banner.log('[Claude] sent ✓');
                    banner.fadeAfter(4000);
                    return;
                }
                console.warn(`Enter attempt ${attempt} did not clear the composer; retrying…`);
                banner.log(`[Claude] Enter attempt ${attempt} did not send, retrying…`);
            }

            // Composer still has text after two Enter attempts — most likely
            // the message exceeds Claude's limits.
            banner.fadeAfter(10000);
            showTooLongWarning('Claude');
        }

        handleClaude();
    }

    //=============================================================================
    // Section 4: "Too Long" Warning Modal Function
    // Shows a red modal if the send button is disabled because the text is too long
    //=============================================================================

    // ADDED CODE START: function to show the "too long" warning.
    function showTooLongWarning(botName) {
        const existingWarning = document.getElementById('too-long-alert');
        if (existingWarning) return; // Avoid duplicates

        const warningModalHTML = `
            <div id="too-long-alert" style="
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: #FF0000;
                padding: 24px;
                border-radius: 8px;
                z-index: 10000;
                max-width: 400px;
                box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
                font-family: system-ui, -apple-system, sans-serif;
            ">
                <div style="
                    color: #FFFFFF;
                    font-size: 18px;
                    font-weight: 600;
                    margin-bottom: 16px;
                ">
                    YouTube Summarizer says:
                </div>
                <div style="
                    color: #FFFFFF;
                    font-size: 16px;
                    line-height: 1.5;
                    margin-bottom: 20px;
                ">
                    The content is too long for the current limits of ${botName}.
                </div>
                <button id="too-long-alert-ok" style="
                    background: #FFFFFF;
                    color: #FF0000;
                    border: none;
                    padding: 8px 24px;
                    border-radius: 6px;
                    cursor: pointer;
                    float: right;
                    font-size: 14px;
                    font-weight: 500;
                ">OK</button>
            </div>
            <div id="too-long-modal-backdrop" style="
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.5);
                z-index: 9999;
            "></div>
        `;

        const modalContainer = document.createElement('div');
        modalContainer.innerHTML = warningModalHTML;
        document.body.appendChild(modalContainer);

        document.getElementById('too-long-alert-ok')
            .addEventListener('click', () => modalContainer.remove());
        document.getElementById('too-long-modal-backdrop')
            .addEventListener('click', () => modalContainer.remove());
    }

})();