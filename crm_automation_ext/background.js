
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url && /^https?:\/\//.test(tab.url)) {
        chrome.scripting.executeScript({
            target: { tabId: tabId, allFrames: true },
            files: ["content.js"]
        }).catch(() => {});
    }
});
