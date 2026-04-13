/**
 * Content script for YouTube Summarizer extension
 * Features:
 * - Extraction of video transcript from YouTube page
 * - Extraction of visible text from any web page (articles, blog posts, etc.)
 * - Automatic summarization chatbot selection based on text length
 */
(function () {

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

            // Remove YouTube notification when tab loses focus
            window.addEventListener('blur', async () => {
                const youtubeNotificationActive = await chrome.storage.local.get('youtube_notification_active');
                if (youtubeNotificationActive.youtube_notification_active) {
                    await chrome.storage.local.remove('youtube_notification_active');
                    const notification = document.querySelector('.youtube-summary-notification');
                    if (notification) notification.remove();
                }
            });

            // Wait for page to be fully loaded
            await new Promise(resolve => setTimeout(resolve, 2000));
            console.log('Waited for 2 seconds.');

            const transcriptButton = document.querySelector('button[aria-label="Show transcript"]');
            console.log('Transcript button:', transcriptButton);

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
                // New YouTube DOM: transcript-segment-view-model elements
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

            const videoTitle = document.querySelector('yt-formatted-string.style-scope.ytd-watch-metadata[force-default-style]').textContent;

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
            // ChatGPT Plus has a 32K token limit (~128K chars). 60K chars (~15K tokens)
            // gives plenty of headroom for the prompt template, system instructions,
            // and less efficient tokenization of non-English text.
            // Claude handles 200K tokens on all plans, so it easily takes the overflow.
            const CHAR_LIMIT = 60000;
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
                const claudeWindow = window.open('https://claude.ai/chats', '_blank');
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

            // Remove notification when tab loses focus
            window.addEventListener('blur', async () => {
                const notifActive = await chrome.storage.local.get('source_notification_active');
                if (notifActive.source_notification_active) {
                    await chrome.storage.local.remove('source_notification_active');
                    const notification = document.querySelector('.youtube-summary-notification');
                    if (notification) notification.remove();
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

            const CHAR_LIMIT = 60000;
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
                const claudeWindow = window.open('https://claude.ai/chats', '_blank');
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
            await new Promise(resolve => setTimeout(resolve, 3000));

            // Try to disable extended thinking/reasoning models (Thinking, Pro)
            // by switching to Auto. Fails gracefully if selectors change.
            // Note: ChatGPT uses Radix UI which requires PointerEvents, not .click()
            try {
                const modelButton = document.querySelector('button[data-testid="model-switcher-dropdown-button"]');
                if (modelButton) {
                    const ariaLabel = modelButton.getAttribute('aria-label') || '';
                    const currentModel = ariaLabel.toLowerCase();
                    if (currentModel.includes('thinking') || currentModel.includes('pro')) {
                        console.log('Extended thinking model detected, switching to Auto...');
                        // Radix UI dropdowns need pointer events to open
                        modelButton.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
                        modelButton.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true }));
                        modelButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
                        await new Promise(resolve => setTimeout(resolve, 500));
                        const autoOption = document.querySelector('[data-testid="model-switcher-gpt-5-3"]');
                        if (autoOption) {
                            autoOption.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
                            autoOption.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true }));
                            autoOption.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
                            console.log('Switched to Auto model.');
                            await new Promise(resolve => setTimeout(resolve, 500));
                        } else {
                            // Close the menu if we couldn't find Auto
                            document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
                            console.log('Could not find Auto option, proceeding with current model.');
                        }
                    }
                }
            } catch (e) {
                console.log('Model switch failed (selectors may have changed), proceeding:', e.message);
            }

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

            const maxAttempts = 5;
            const attemptInterval = 1000;

            for (let i = 0; i < maxAttempts; i++) {
                const promptArea = document.querySelector('div[contenteditable="true"]');
                if (promptArea) {
                    try {
                        window.focus();
                        promptArea.focus();
                        await new Promise(resolve => setTimeout(resolve, 500));

                        document.execCommand('insertText', false, prompt);
                        promptArea.dispatchEvent(new InputEvent('input', { bubbles: true }));

                        await new Promise(resolve => setTimeout(resolve, 500));

                        const sendButton = document.querySelector('button[data-testid="send-button"]');
                        if (sendButton) {
                            let buttonCheckAttempts = 0;
                            const maxButtonCheckAttempts = 5;  // Will check for 5 seconds total

                            while (buttonCheckAttempts < maxButtonCheckAttempts) {
                                const isDisabled = sendButton.disabled ||
                                    sendButton.getAttribute('disabled') !== null ||
                                    sendButton.getAttribute('aria-disabled') === 'true';

                                if (!isDisabled) {
                                    console.log('ChatGPT send button is enabled - proceeding');
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
                            break;
                        }
                    } catch (error) {
                        console.error('Error inserting prompt:', error);
                    }
                }
                await new Promise(resolve => setTimeout(resolve, attemptInterval));
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

            await new Promise(resolve => setTimeout(resolve, 3000));

            const data = await chrome.storage.local.get('youtube_summary_prompt');
            const prompt = data.youtube_summary_prompt;
            console.log('Retrieved prompt:', prompt);

            if (!prompt) {
                console.error('No prompt found in storage.');
                return;
            }

            await chrome.storage.local.remove('youtube_summary_prompt');
            console.log('Removed prompt from storage.');

            const maxAttempts = 10;
            const attemptInterval = 1000;

            for (let i = 0; i < maxAttempts; i++) {
                console.log(`Attempt ${i + 1} to insert prompt...`);

                const promptArea = document.querySelector('div[role="textbox"]') ||
                    document.querySelector('.ProseMirror');

                if (promptArea) {
                    try {
                        window.focus();
                        promptArea.focus();
                        await new Promise(resolve => setTimeout(resolve, 500));

                        promptArea.innerHTML = prompt.replace(/\n/g, '<br>');
                        promptArea.dispatchEvent(new Event('input', { bubbles: true }));
                        promptArea.dispatchEvent(new Event('change', { bubbles: true }));

                        // Check if the send button is disabled BEFORE attempting to send
                        const sendButton = document.querySelector('button[aria-label="Send Message"]') ||
                            document.querySelector('button[aria-label="Send message"]');
                        await new Promise(resolve => setTimeout(resolve, 500)); // Brief delay for UI to update

                        if (sendButton && sendButton.disabled) {
                            console.log('Send button disabled before sending - text too long for Claude');
                            showTooLongWarning('Claude');
                            return;
                        }

                        // If we get here, the button is enabled so proceed with sending
                        promptArea.dispatchEvent(new KeyboardEvent('keydown', {
                            key: 'Enter',
                            code: 'Enter',
                            keyCode: 13,
                            which: 13,
                            bubbles: true,
                            cancelable: true,
                            composed: true
                        }));

                        // 3 lines after
                        console.log('Simulated Enter key press');
                        break;
                    } catch (error) {
                        console.error('Error inserting prompt:', error);
                    }
                } else {
                    console.log('Prompt area not found, waiting...');
                }
                await new Promise(resolve => setTimeout(resolve, attemptInterval));
            }
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