/**
 * Background script for YouTube Summarizer extension
 * Handles tab management and messaging between content scripts
 */


chrome.action.onClicked.addListener((tab) => {
    // Inject content.js on any page — content.js decides whether to handle
    // it as a YouTube video or a generic web page
    chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
    });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Focus the SPECIFIC tab the message came from (not whichever ChatGPT tab
    // happens to be first in the list). Used by content.js to bring its own
    // tab to the foreground before doing UI work that depends on the tab
    // being visible (e.g., model picker switch).
    if (message.action === 'focusSenderTab') {
        const tab = sender?.tab;
        if (!tab) {
            sendResponse({ success: false, reason: 'no sender tab' });
            return false;
        }
        (async () => {
            try {
                const win = await chrome.windows.get(tab.windowId);
                if (win.state === 'minimized') {
                    await chrome.windows.update(tab.windowId, { state: 'normal' });
                }
                await chrome.windows.update(tab.windowId, { focused: true });
                await chrome.tabs.update(tab.id, { active: true });
                console.log('Activated sender tab', tab.id);
                sendResponse({ success: true });
            } catch (error) {
                console.error('focusSenderTab error:', error);
                sendResponse({ success: false, reason: String(error) });
            }
        })();
        return true;
    }

    if (message.action === 'focusChatGPTTab') {
        chrome.tabs.query({ url: ['*://chat.openai.com/*', '*://chatgpt.com/*'] }, async (tabs) => {
            if (tabs.length > 0) {
                try {
                    const window = await chrome.windows.get(tabs[0].windowId);
                    if (window.state === 'minimized') {
                        await chrome.windows.update(tabs[0].windowId, { state: 'normal' });
                    }
                    await chrome.windows.update(tabs[0].windowId, { focused: true });
                    await chrome.tabs.update(tabs[0].id, { active: true });
                    console.log('Activated ChatGPT tab from background script.');
                    sendResponse({ success: true });
                } catch (error) {
                    console.error('Error focusing tab:', error);
                    sendResponse({ success: false });
                }
            } else {
                console.error('No ChatGPT tab found.');
                sendResponse({ success: false });
            }
        });
        return true;
    }
    
    if (message.action === 'focusClaudeTab') {
        chrome.tabs.query({ url: ['*://claude.ai/*'] }, async (tabs) => {
            if (tabs.length > 0) {
                try {
                    const window = await chrome.windows.get(tabs[0].windowId);
                    if (window.state === 'minimized') {
                        await chrome.windows.update(tabs[0].windowId, { state: 'normal' });
                    }
                    await chrome.windows.update(tabs[0].windowId, { focused: true });
                    await chrome.tabs.update(tabs[0].id, { active: true });
                    console.log('Activated Claude tab from background script.');
                    sendResponse({ success: true });
                } catch (error) {
                    console.error('Error focusing tab:', error);
                    sendResponse({ success: false });
                }
            } else {
                console.error('No Claude tab found.');
                sendResponse({ success: false });
            }
        });
        return true;
    }
});