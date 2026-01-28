const STORAGE_KEY_PANEL = "crm_panel_visible";

function updateButton(isVisible) {
  const btn = document.getElementById("toggle-panel-btn");
  if (isVisible) {
    btn.textContent = "Hide Panel";
    btn.className = "off";
  } else {
    btn.textContent = "Show Panel";
    btn.className = "primary";
  }
}

function showStatus(msg) {
  const el = document.getElementById("status-msg");
  if (msg) {
      el.textContent = msg;
      el.style.display = "block";
  } else {
      el.style.display = "none";
  }
}

function showGoogleButton() {
    const btn = document.getElementById("open-google-btn");
    if (btn) btn.style.display = "block";
}

document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("toggle-panel-btn");
  const googleBtn = document.getElementById("open-google-btn");
  
  if (googleBtn) {
      googleBtn.addEventListener("click", () => {
          chrome.tabs.update({ url: "https://www.google.com" });
          window.close(); // Close popup
      });
  }
  
  // Load initial state
  chrome.storage.local.get([STORAGE_KEY_PANEL], (result) => {
    const isVisible = result[STORAGE_KEY_PANEL] === true;
    updateButton(isVisible);
  });

  btn.addEventListener("click", togglePanel);
});

function togglePanel() {
  showStatus(""); // Clear previous errors
  chrome.storage.local.get([STORAGE_KEY_PANEL], (result) => {
    const currentState = result[STORAGE_KEY_PANEL] === true; // Default false if undefined
    const newState = !currentState;

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs || !tabs[0]) {
             showStatus("No active tab found.");
             return;
        }
        const tab = tabs[0];
        if (tab.url.startsWith("chrome://") || tab.url.startsWith("edge://") || tab.url.startsWith("about:") || tab.url.startsWith("view-source:")) {
            showStatus("Cannot run on browser system pages.");
            showGoogleButton();
            return;
        }

        chrome.storage.local.set({ [STORAGE_KEY_PANEL]: newState }, () => {
            updateButton(newState);
            
            const tabId = tab.id;
            const action = newState ? "show_panel" : "hide_panel";
            
            chrome.tabs.sendMessage(tabId, { action }, () => {
              // Inject if not present (error handling)
              if (chrome.runtime.lastError) {
                 chrome.scripting.executeScript({
                   target: { tabId: tabId },
                   files: ["content.js"]
                 }, () => {
                   if (chrome.runtime.lastError) {
                     console.error("Failed to inject script:", chrome.runtime.lastError.message);
                     showStatus("Error: " + chrome.runtime.lastError.message);
                   } else {
                     // Retry sending message after injection
                     setTimeout(() => {
                       chrome.tabs.sendMessage(tabId, { action });
                     }, 100);
                   }
                 });
              }
            });
        });
    });
  });
}

