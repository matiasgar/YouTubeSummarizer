/**
 * Background script for YouTube Summarizer extension
 * Handles tab management and messaging between content scripts
 */


chrome.action.onClicked.addListener((tab) => {
    if (tab.url.includes("youtube.com/watch")) {
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['content.js']
        });
    }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
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