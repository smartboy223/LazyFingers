
(function() {
    // PREVENT DOUBLE EXECUTION
    if (window.crmControlPanelLoaded) return;
    window.crmControlPanelLoaded = true;

    console.log("%c AUTOMATION RECORDER LOADED ", "background: #000; color: #0f0; font-size: 20px;");

    window.isAutomationRunning = false;
    window.isRecording = false;
    window.recordedEvents = [];
    let currentFlow = null;
    let currentFlowSource = "default";
    let isEnabled = true;

    const STORAGE_KEYS = {
        enabled: "crm_extension_enabled",
        lastRecording: "crm_last_recording",
        lastSource: "crm_last_source",
        isRecording: "crm_is_recording",
        currentSessionEvents: "crm_current_session_events",
        panelVisible: "crm_panel_visible",
        isPlaying: "crm_is_playing",
        currentPlayIndex: "crm_current_play_index",
        playEvents: "crm_play_events",
        scheduledTime: "crm_scheduled_time"
    };

    function hasStorage() {
        return typeof chrome !== "undefined" && chrome.storage && chrome.storage.local;
    }

    function storageGet(keys) {
        return new Promise(resolve => {
            if (!hasStorage()) {
                resolve({});
                return;
            }
            chrome.storage.local.get(keys, resolve);
        });
    }

    function storageSet(items) {
        return new Promise(resolve => {
            if (!hasStorage()) {
                resolve();
                return;
            }
            chrome.storage.local.set(items, resolve);
        });
    }

    // --- SELECTOR GENERATOR ---
    function getCssSelector(el) {
        if (!(el instanceof Element)) return;
        
        const path = [];
        while (el.nodeType === Node.ELEMENT_NODE) {
            let selector = el.nodeName.toLowerCase();
            if (el.id) {
                selector += '#' + el.id;
                path.unshift(selector);
                break; // ID is unique enough
            } else {
                let sib = el, nth = 1;
                while (sib = sib.previousElementSibling) {
                    if (sib.nodeName.toLowerCase() == selector)
                       nth++;
                }
                if (nth != 1)
                    selector += ":nth-of-type("+nth+")";
            }
            path.unshift(selector);
            el = el.parentNode;
        }
        return path.join(" > ");
    }

    // --- RECORDER LOGIC ---
    async function startRecording() {
        window.isRecording = true;
        window.recordedEvents = [];
        
        // Initial page load event
        window.recordedEvents.push({
            type: 'page_status',
            url: window.location.href,
            title: document.title,
            readyState: document.readyState,
            timestamp: Date.now()
        });

        // Save initial state to storage
        await storageSet({
            [STORAGE_KEYS.isRecording]: true,
            [STORAGE_KEYS.currentSessionEvents]: window.recordedEvents
        });

        updateStatus("🔴 Recording... Perform actions now.", "red");
        
        // Attach listeners
        attachRecordingListeners();
        
        const btn = document.getElementById("crm-record-btn");
        if (btn) {
            btn.textContent = "⏹ Stop & Save Recording";
            btn.onclick = stopAndSaveRecording;
            btn.style.backgroundColor = "#dc3545"; // Red
        }
    }

    async function stopAndSaveRecording() {
        window.isRecording = false;
        
        // Clear recording state from storage
        await storageSet({
            [STORAGE_KEYS.isRecording]: false,
            [STORAGE_KEYS.currentSessionEvents]: []
        });

        updateStatus("Recording saved! Downloading...", "green");
        
        // Remove listeners
        removeRecordingListeners();

        // Calculate delays based on timestamps to reproduce recorded speed
        calculateDelays(window.recordedEvents);

        setActiveFlow(window.recordedEvents, "recording", true);
        downloadRecording();

        const btn = document.getElementById("crm-record-btn");
        if (btn) {
            btn.textContent = "🔴 Record Behavior";
            btn.onclick = startRecording;
            btn.style.backgroundColor = "#ffc107"; // Yellow/Orange
            btn.style.color = "black";
        }
    }

    function calculateDelays(events) {
        if (!events || events.length === 0) return;
        
        for (let i = 0; i < events.length - 1; i++) {
            const curr = events[i];
            const next = events[i+1];
            if (curr.timestamp && next.timestamp) {
                let diff = next.timestamp - curr.timestamp;
                // Enforce a sensible minimum for stability, but respect recorded speed
                curr.delay = Math.max(50, diff); 
            } else {
                curr.delay = 1000; // Default fallback
            }
        }
        
        // Last event gets a default delay
        if (events.length > 0) {
            events[events.length - 1].delay = 1000;
        }
    }

    function attachRecordingListeners() {
        document.addEventListener('click', recordClick, true);
        document.addEventListener('change', recordChange, true);
        document.addEventListener('input', recordInput, true);
        document.addEventListener('keydown', recordKeydown, true);
    }

    function removeRecordingListeners() {
        document.removeEventListener('click', recordClick, true);
        document.removeEventListener('change', recordChange, true);
        document.removeEventListener('input', recordInput, true);
        document.removeEventListener('keydown', recordKeydown, true);
    }

    async function saveEvent(event) {
        window.recordedEvents.push(event);
        // Sync to storage for crash/reload recovery
        await storageSet({
            [STORAGE_KEYS.currentSessionEvents]: window.recordedEvents
        });
    }

    function recordClick(e) {
        if (!window.isRecording) return;
        // Ignore clicks on our own panel
        if (document.getElementById("crm-automation-panel").contains(e.target)) return;

        const selector = getCssSelector(e.target);
        const event = {
            type: 'click',
            selector: selector,
            timestamp: Date.now()
        };
        saveEvent(event);
        console.log("Recorded Click:", selector);
    }

    function recordChange(e) {
        if (!window.isRecording) return;
        const selector = getCssSelector(e.target);
        const event = {
            type: 'change',
            selector: selector,
            value: e.target.value,
            tagName: e.target.tagName.toLowerCase(),
            timestamp: Date.now()
        };
        saveEvent(event);
        console.log("Recorded Change:", selector, e.target.value);
    }

    function recordInput(e) {
        if (!window.isRecording) return;
        const selector = getCssSelector(e.target);
        const tagName = e.target.tagName.toLowerCase();
        const isEditable = e.target.isContentEditable;
        const value = isEditable ? e.target.textContent : e.target.value;
        
        // Debounce input saving or save immediately? 
        // For reliability across reloads, immediate save is safer though slower.
        // Or we can rely on 'change' for final value, but 'input' is needed for real-time replay feel.
        // Let's save it.
        
        const event = {
            type: 'input',
            selector: selector,
            value: value,
            tagName: tagName,
            isContentEditable: isEditable,
            timestamp: Date.now()
        };
        saveEvent(event);
    }

    function recordKeydown(e) {
        if (!window.isRecording) return;
        const allowedKeys = ["Enter", "Tab", "Escape", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];
        if (!allowedKeys.includes(e.key)) return;
        const selector = getCssSelector(e.target);
        const event = {
            type: 'key',
            selector: selector,
            key: e.key,
            timestamp: Date.now()
        };
        saveEvent(event);
    }

    // Global selection state
    let selectedStepIndices = new Set();
    let lastCheckedIndex = null;

    // --- UI RENDERER ---
    function renderStepsList() {
        const container = document.getElementById("crm-steps-container");
        if (!container) return;

        if (!currentFlow || currentFlow.length === 0) {
            container.innerHTML = '<div style="text-align:center; color:#888; padding:10px;">No steps loaded</div>';
            updateBulkUI();
            return;
        }

        container.innerHTML = "";
        
        currentFlow.forEach((step, index) => {
            const stepDiv = document.createElement("div");
            stepDiv.id = `crm-step-${index}`;
            stepDiv.style.cssText = "padding: 8px; border-bottom: 1px solid #444; display: flex; align-items: center; gap: 8px;";
            
            // Selection Checkbox
            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.dataset.index = index;
            checkbox.style.cssText = "cursor: pointer; accent-color: #17a2b8;";
            checkbox.checked = selectedStepIndices.has(index);
            
            checkbox.onclick = (e) => {
                const isChecked = e.target.checked;
                
                // Handle Shift+Click range selection
                if (e.shiftKey && lastCheckedIndex !== null) {
                    const start = Math.min(lastCheckedIndex, index);
                    const end = Math.max(lastCheckedIndex, index);
                    
                    for (let i = start; i <= end; i++) {
                        if (isChecked) {
                            selectedStepIndices.add(i);
                        } else {
                            selectedStepIndices.delete(i);
                        }
                    }
                    
                    // Visually update all checkboxes
                    const allCheckboxes = container.querySelectorAll('input[type="checkbox"]');
                    allCheckboxes.forEach(cb => {
                        const idx = parseInt(cb.dataset.index, 10);
                        cb.checked = selectedStepIndices.has(idx);
                    });
                    
                } else {
                    // Normal click
                    if (isChecked) selectedStepIndices.add(index);
                    else selectedStepIndices.delete(index);
                }
                
                lastCheckedIndex = index;
                updateBulkUI();
            };

            stepDiv.appendChild(checkbox);

            // Type badge
            const badge = document.createElement("span");
            badge.textContent = step.type.toUpperCase();
            badge.style.cssText = "font-size: 11px; padding: 3px 6px; border-radius: 3px; background: #444; color: #e0e0e0; min-width: 55px; text-align: center; font-weight: bold;";
            
            // Content
            const content = document.createElement("div");
            content.style.cssText = "flex: 1; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: 13px; color: #e0e0e0;";
            
            if (step.type === 'click') {
                content.textContent = step.tagName ? `<${step.tagName}> ${step.selector}` : step.selector;
                content.title = step.selector;
            } else if (step.type === 'input' || step.type === 'change') {
                const input = document.createElement("input");
                input.type = "text";
                input.value = step.value;
                input.style.cssText = "width: 100%; border: 1px solid #555; background: #333; color: #fff; border-radius: 2px; padding: 4px 6px; font-size: 13px;";
                
                // Update model immediately on input
                input.oninput = (e) => {
                    step.value = e.target.value;
                };

                // Persist to storage on change (commit)
                input.onchange = (e) => {
                    step.value = e.target.value;
                    console.log(`Updated step ${index} value to: ${step.value}`);
                    // Update stored flow regardless of source so edits persist across reloads
                    storageSet({ [STORAGE_KEYS.lastRecording]: currentFlow });
                };
                content.appendChild(input);
            } else if (step.type === 'navigation') {
                 content.textContent = step.url;
                 content.title = step.url;
                 badge.style.background = "#1a3c61";
                 badge.style.color = "#cce5ff";
            } else {
                 content.textContent = step.selector || step.url || "";
            }

            stepDiv.appendChild(badge);
            stepDiv.appendChild(content);

            // Speed Control
            const speedControl = createSpeedControl(step, index, () => {
                storageSet({ [STORAGE_KEYS.lastRecording]: currentFlow });
                // If this was a bulk update, we might need to re-render to show changes on other rows
                // We can check if multiple items were selected to decide, or just re-render if needed.
                // However, re-rendering loses focus if we are editing.
                // For arrow clicks, re-rendering is fine. For text input, we handle it carefully.
                if (selectedStepIndices.has(index) && selectedStepIndices.size > 1) {
                     renderStepsList();
                }
            });
            stepDiv.appendChild(speedControl);

            container.appendChild(stepDiv);
        });
        
        updateBulkUI();
    }

    function updateBulkUI() {
        const countSpan = document.getElementById("crm-bulk-count");
        const applyBtn = document.getElementById("crm-bulk-apply");
        const plusBtn = document.getElementById("crm-bulk-plus");
        const minusBtn = document.getElementById("crm-bulk-minus");
        const selectAllCb = document.getElementById("crm-select-all");
        
        const selectedCount = selectedStepIndices.size;

        if (countSpan) countSpan.textContent = selectedCount;
        
        [applyBtn, plusBtn, minusBtn].forEach(btn => {
            if (btn) {
                btn.disabled = selectedCount === 0;
                btn.style.opacity = selectedCount === 0 ? "0.5" : "1";
            }
        });

        if (selectAllCb && currentFlow) {
            selectAllCb.checked = selectedCount === currentFlow.length && currentFlow.length > 0;
        }
    }

    function createSpeedControl(step, index, onUpdate) {
        const container = document.createElement("div");
        container.className = "crm-speed-control";
        container.style.cssText = "display:flex; align-items:center; font-size:11px; color:#aaa; margin-left:5px; padding:2px 4px; border-radius:3px; border:1px solid transparent; min-width:55px; justify-content:center; user-select:none; gap: 4px;";
        container.title = "Delay after step (ms) - Lower value = Faster speed";
        
        // Initialize value
        if (typeof step.delay !== 'number') step.delay = 100; // Default 100ms

        // Value Wrapper (Click to Edit)
        const valWrapper = document.createElement("div");
        valWrapper.style.cssText = "cursor:pointer; min-width: 30px; text-align: right; border-bottom: 1px dashed #555;";
        
        const display = document.createElement("span");
        display.textContent = `${step.delay}ms`;
        valWrapper.appendChild(display);

        // Arrows Container
        const arrowContainer = document.createElement("div");
        arrowContainer.style.cssText = "display:flex; flex-direction:column; gap:2px;";
        
        const upArrow = document.createElement("div");
        upArrow.textContent = "▲";
        upArrow.style.cssText = "font-size:8px; line-height:6px; cursor:pointer; color:#666; padding: 1px;";
        upArrow.onmouseover = () => upArrow.style.color = "#fff";
        upArrow.onmouseout = () => upArrow.style.color = "#666";
        
        const downArrow = document.createElement("div");
        downArrow.textContent = "▼";
        downArrow.style.cssText = "font-size:8px; line-height:6px; cursor:pointer; color:#666; padding: 1px;";
        downArrow.onmouseover = () => downArrow.style.color = "#fff";
        downArrow.onmouseout = () => downArrow.style.color = "#666";

        arrowContainer.appendChild(upArrow);
        arrowContainer.appendChild(downArrow);

        container.appendChild(valWrapper);
        container.appendChild(arrowContainer);

        // Helper to update value
        const updateVal = (newVal) => {
            const oldVal = step.delay;
            const delta = newVal - oldVal;
            
            // Apply to current step
            step.delay = Math.max(50, newVal); // Min 50ms for stability
            display.textContent = `${step.delay}ms`;

            // If selected and there are other selected items, apply delta to them too
            if (selectedStepIndices.has(index) && selectedStepIndices.size > 1) {
                selectedStepIndices.forEach(idx => {
                    if (idx !== index && currentFlow[idx]) {
                        // Apply delta
                        const current = currentFlow[idx].delay || 0;
                        currentFlow[idx].delay = Math.max(50, current + delta); // Min 50ms
                    }
                });
            }

            onUpdate();
        };

        // Auto-repeat helper for long clicks
        const setupAutoRepeat = (element, getNewVal) => {
            let timer = null;
            let repeatRate = 100;

            const stop = () => {
                if (timer) {
                    clearTimeout(timer);
                    timer = null;
                }
                repeatRate = 100;
                window.removeEventListener('mouseup', stop);
            };

            const start = (e) => {
                e.stopPropagation();
                e.preventDefault(); // Prevent text selection
                
                // Add global listener to catch release anywhere
                window.addEventListener('mouseup', stop);

                // Immediate action
                updateVal(getNewVal());
                
                const loop = () => {
                    // Safety: Stop if element was removed from DOM (e.g. by re-render)
                    if (!element.isConnected) {
                        stop();
                        return;
                    }

                    timer = setTimeout(() => {
                        if (!element.isConnected) {
                            stop();
                            return;
                        }
                        updateVal(getNewVal());
                        repeatRate = Math.max(20, repeatRate * 0.85); // Accelerate
                        loop();
                    }, repeatRate);
                };
                
                timer = setTimeout(loop, 400); // Initial delay before repeating
            };

            element.onmousedown = start;
            element.onmouseleave = stop;
            element.onclick = (e) => e.stopPropagation();
        };

        // Arrow Click Handlers (Inverted: Up = Faster = Less Delay)
        setupAutoRepeat(upArrow, () => step.delay - 10);
        setupAutoRepeat(downArrow, () => step.delay + 10);

        // Edit functionality
        valWrapper.onclick = (e) => {
            if (valWrapper.classList.contains("editing")) return;
            startEditing();
        };

        function startEditing() {
            valWrapper.classList.add("editing");
            display.style.display = "none";
            valWrapper.style.borderBottom = "none";
            
            const input = document.createElement("input");
            input.type = "text"; 
            input.value = step.delay;
            input.style.cssText = "width:30px; border:none; outline:none; font-size:11px; text-align:right; padding:0; margin:0; background:transparent; color:#fff; border-bottom: 1px solid #4da3ff;";
            input.ariaLabel = "Step delay in milliseconds";
            
            valWrapper.appendChild(input);
            input.focus();
            input.select();

            // Commit changes
            const commit = () => {
                let val = parseInt(input.value, 10);
                if (isNaN(val) || val < 50) val = 50; // Min 50ms
                
                // If selected and there are other selected items, apply absolute value to them too
                // Direct edit implies "Set to X"
                if (selectedStepIndices.has(index) && selectedStepIndices.size > 1) {
                    selectedStepIndices.forEach(idx => {
                        if (currentFlow[idx]) {
                            currentFlow[idx].delay = val;
                        }
                    });
                } else {
                    step.delay = val;
                }
                
                // Note: If we bulk updated, step.delay was updated in the loop above (if index is in selectedStepIndices)
                // But just in case index wasn't in the set (shouldn't happen if logic is correct), ensure self is updated
                step.delay = val;

                display.textContent = `${val}ms`;
                input.remove();
                display.style.display = "inline";
                valWrapper.style.borderBottom = "1px dashed #555";
                valWrapper.classList.remove("editing");
                onUpdate();
            };

            // Cancel changes
            const cancel = () => {
                input.remove();
                display.style.display = "inline";
                valWrapper.style.borderBottom = "1px dashed #555";
                valWrapper.classList.remove("editing");
            };

            input.onblur = commit;
            
            // Advanced keyboard handling
            let repeatTimer = null;
            let repeatDelay = 80;
            
            const handleKey = (e) => {
                let val = parseInt(input.value, 10) || 0;
                let stepSize = 10;
                if (e.shiftKey) stepSize = 100;
                if (e.altKey) stepSize = 1;

                if (e.key === "ArrowUp") {
                    // Up = Faster = Less Delay
                    val = Math.max(50, val - stepSize);
                } else if (e.key === "ArrowDown") {
                    // Down = Slower = More Delay
                    val += stepSize;
                } else {
                    return;
                }
                
                input.value = val;
                e.preventDefault();
            };

            input.onkeydown = (e) => {
                if (e.key === "Enter") {
                    commit();
                    return;
                }
                if (e.key === "Escape") {
                    cancel();
                    return;
                }
                
                if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                    if (!repeatTimer) {
                        handleKey(e);
                        const lastKey = e.key;
                        const loop = () => {
                            repeatTimer = setTimeout(() => {
                                handleKey({ key: lastKey, shiftKey: e.shiftKey, altKey: e.altKey, preventDefault: ()=>{} });
                                repeatDelay = Math.max(16, repeatDelay * 0.9);
                                loop();
                            }, repeatDelay);
                        };
                        repeatTimer = setTimeout(loop, 400); // Initial wait
                    }
                    e.preventDefault();
                }
            };

            input.onkeyup = (e) => {
                if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                    clearTimeout(repeatTimer);
                    repeatTimer = null;
                    repeatDelay = 80;
                }
            };
        }

        return container;
    }

    async function handleRunAutomation() {
        if (!isEnabled) return;
        if (!currentFlow || currentFlow.length === 0) {
            alert("No automation loaded!");
            return;
        }
        
        // Save state for persistence before starting
        await storageSet({
            [STORAGE_KEYS.isPlaying]: true,
            [STORAGE_KEYS.playEvents]: currentFlow,
            [STORAGE_KEYS.currentPlayIndex]: 0
        });

        // Check if we need to navigate to the start URL
        const firstEvent = currentFlow[0];
        if (firstEvent && (firstEvent.type === 'page_status' || firstEvent.type === 'navigation')) {
            if (firstEvent.url && window.location.href !== firstEvent.url) {
                updateStatus(`Navigating to start URL: ${firstEvent.url}`, "blue");
                window.location.href = firstEvent.url;
                return; // Navigation will reload page, and initializePanelState will resume playback
            }
        }

        await playRecording(currentFlow);
    }

    // --- PLAYBACK LOGIC ---
    async function playRecording(events, startIndex = 0) {
        if (!events || events.length === 0) {
            alert("No events to play!");
            return;
        }
        
        window.isAutomationRunning = true;
        updateStatus("▶ Playing Recording...", "blue");
        
        const startBtn = document.getElementById("crm-auto-btn");
        if (startBtn) {
             startBtn.textContent = "⏹ Stop Playback";
             startBtn.style.backgroundColor = "#dc3545";
        }

        // Expand steps to show progress
        const stepsContainer = document.getElementById("crm-steps-container");
        const toggleBtn = document.getElementById("crm-toggle-steps-btn");
        if (stepsContainer && stepsContainer.style.display === "none") {
            stepsContainer.style.display = "block";
            toggleBtn.textContent = "▲ Steps";
            renderStepsList();
        }

        for (let i = startIndex; i < events.length; i++) {
            if (!window.isAutomationRunning) break;
            
            // Highlight current step
            const stepEl = document.getElementById(`crm-step-${i}`);
            if (stepEl) {
                stepEl.style.backgroundColor = "#fff3cd";
                stepEl.style.borderLeft = "4px solid #ffc107"; // Strong visual indicator
                stepEl.scrollIntoView({ behavior: "smooth", block: "center" });
            }

            const event = events[i];
            updateStatus(`Playing step ${i+1}/${events.length}: ${event.type}`, "blue");
            
            // Save progress
            await storageSet({ [STORAGE_KEYS.currentPlayIndex]: i });

            // Handle Navigation
            if (event.type === 'navigation') {
                if (window.location.href !== event.url) {
                    updateStatus(`Navigating to ${event.url}...`, "blue");
                    window.location.href = event.url;
                    return; // Stop execution here; page reload will resume
                }
                // If already on URL, continue
            }
            
            // Logic to skip navigation steps if we are already there (implicit check)
            // But if it's a real event, we should handle it.
            // For now, if it's not a navigation event, we try to find element.
            if (event.type !== 'navigation' && event.type !== 'page_status') {
                 const element = await waitForElement([event.selector], 5000);
            
                if (!element) {
                    console.error(`Element not found: ${event.selector}`);
                    updateStatus(`Skipping step ${i+1}: Element not found`, "orange");
                    if (stepEl) stepEl.style.backgroundColor = "#ffe6e6"; // Red tint
                    continue; 
                }

                // Scroll into view
                element.scrollIntoView({behavior: "smooth", block: "center"});
                await sleep(300); // Wait for scroll

                // Add smooth transition for visual feedback
                const originalTransition = element.style.transition;
                const originalBoxShadow = element.style.boxShadow;
                element.style.transition = "box-shadow 0.3s ease";

                if (event.type === 'click') {
                    element.style.boxShadow = "0 0 0 4px rgba(255, 0, 0, 0.5)";
                    await sleep(100);
                    element.click();
                    await sleep(100);
                    element.style.boxShadow = originalBoxShadow;
                } else if (event.type === 'change') {
                    element.style.boxShadow = "0 0 0 4px rgba(0, 128, 0, 0.5)";
                    
                    if (event.tagName === 'select') {
                        element.value = event.value;
                        element.dispatchEvent(new Event('change', { bubbles: true }));
                    } else {
                        await simulateType(element, event.value);
                    }
                    await sleep(100);
                    element.style.boxShadow = originalBoxShadow;
                } else if (event.type === 'input') {
                    element.style.boxShadow = "0 0 0 4px rgba(0, 128, 0, 0.5)";
                    await applyInputValue(element, event.value, event.isContentEditable);
                    await sleep(100);
                    element.style.boxShadow = originalBoxShadow;
                } else if (event.type === 'key') {
                    element.dispatchEvent(new KeyboardEvent('keydown', { key: event.key, bubbles: true }));
                    element.dispatchEvent(new KeyboardEvent('keyup', { key: event.key, bubbles: true }));
                }
                
                // Cleanup transition
                setTimeout(() => {
                    element.style.transition = originalTransition;
                }, 300);
            }
            
            if (stepEl) stepEl.style.backgroundColor = "transparent"; // Reset highlight

            // Wait a bit between steps (or use recorded timestamps for real-time playback)
            const stepDelay = typeof event.delay === 'number' ? event.delay : 100;
            await sleep(stepDelay); 
        }

        window.isAutomationRunning = false;
        await storageSet({ [STORAGE_KEYS.isPlaying]: false });
        updateStatus("Playback Complete!", "green");
        resetButtons();
        alert("Playback Finished!");
    }

    function resetButtons() {
        const startBtn = document.getElementById("crm-auto-btn");
        if (startBtn) {
            startBtn.textContent = "▶ Run Automation";
            startBtn.style.backgroundColor = "#28a745";
            startBtn.onclick = () => handleRunAutomation();
        }
    }

    function loadAndPlayRecording() {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".json";
        input.onchange = e => {
            const file = e.target.files[0];
            if (!file) return;
            
            const reader = new FileReader();
            reader.onload = function(e) {
                try {
                    const events = JSON.parse(e.target.result);
                    setActiveFlow(events, file.name, true);
                    playRecording(events);
                } catch (err) {
                    alert("Invalid JSON file");
                    console.error(err);
                }
            };
            reader.readAsText(file);
        };
        input.click();
    }

    function downloadRecording() {
        const eventsToSave = (currentFlow && currentFlow.length > 0) ? currentFlow : window.recordedEvents;
        
        if (!eventsToSave || eventsToSave.length === 0) {
            alert("No steps to save!");
            return;
        }

        const data = JSON.stringify(eventsToSave, null, 2);
        const blob = new Blob([data], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement("a");
        a.href = url;
        a.download = "automation_flow_" + new Date().getTime() + ".json";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // --- UI HELPERS ---
    function createFloatingPanel() {
        // Remove any existing panel (cleanup zombies from reloads)
        const existing = document.getElementById("crm-automation-panel");
        if (existing) {
            existing.remove();
        }

        const panel = document.createElement("div");
        panel.id = "crm-automation-panel";
        panel.style.position = "fixed";
        panel.style.bottom = "20px";
        panel.style.right = "20px";
        panel.style.backgroundColor = "#1e1e1e"; // Dark bg
        panel.style.color = "#e0e0e0"; // Light text
        panel.style.border = "1px solid #444"; // Subtle border
        panel.style.borderRadius = "8px";
        panel.style.padding = "15px";
        panel.style.boxShadow = "0 4px 12px rgba(0,0,0,0.5)"; // Darker shadow
        panel.style.zIndex = "9999999";
        panel.style.fontFamily = "Arial, sans-serif";
        panel.style.width = "400px";

        panel.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                <div style="font-weight: bold; font-size: 16px; color: #fff;">LazyFingers</div>
                <button id="crm-close-panel" style="background:none; border:none; color:#aaa; cursor:pointer; font-size:20px;">&times;</button>
            </div>
            
            <div id="crm-status-msg" style="margin-bottom: 10px; font-size: 14px; color: #bbb; white-space: normal; overflow-wrap: break-word; line-height: 1.4; max-height: 40px; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;">Ready to start</div>

            <div style="display: flex; gap: 5px; margin-bottom: 10px;">
                <button id="crm-record-btn" style="flex: 1; padding: 12px; background: #ffc107; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 14px; color: #000;">🔴 Rec</button>
                <button id="crm-auto-btn" style="flex: 1; padding: 12px; background: #28a745; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; color: white; font-size: 14px;">▶ Run Now</button>
                <button id="crm-schedule-btn" style="flex: 1; padding: 12px; background: #6f42c1; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; color: white; font-size: 14px;">📅 Schedule</button>
            </div>

            <!-- Schedule UI -->
            <div id="crm-schedule-container" style="display:none; background: #252525; padding: 10px; border-radius: 4px; margin-bottom: 10px; border: 1px solid #444;">
                <label style="display:block; color:#ccc; font-size:12px; margin-bottom:5px;">Run at:</label>
                <input type="datetime-local" id="crm-schedule-time" step="1" style="width:100%; padding:8px; margin-bottom:5px; background:#333; color:#fff; border:1px solid #555; border-radius:3px;">
                
                <!-- Time Adjustment Buttons -->
                <div style="display:flex; gap:5px; margin-bottom:10px;">
                    <button id="crm-sched-minus" style="flex:1; padding:6px; background:#495057; border:none; border-radius:3px; color:white; cursor:pointer; font-size:12px;">- 30s</button>
                    <button id="crm-sched-plus" style="flex:1; padding:6px; background:#495057; border:none; border-radius:3px; color:white; cursor:pointer; font-size:12px;">+ 30s</button>
                </div>

                <div style="display:flex; gap:5px;">
                    <button id="crm-start-schedule" style="flex:1; padding:8px; background:#28a745; border:none; border-radius:3px; color:white; cursor:pointer;">Start Countdown</button>
                    <button id="crm-cancel-schedule" style="flex:1; padding:8px; background:#dc3545; border:none; border-radius:3px; color:white; cursor:pointer;">Cancel</button>
                </div>
            </div>

            <!-- Countdown Display -->
            <div id="crm-countdown-display" style="display:none; text-align:center; padding: 15px; background: #1a1a1a; border: 1px solid #28a745; border-radius: 4px; margin-bottom: 10px; box-shadow: 0 0 10px rgba(40, 167, 69, 0.2);">
                <div style="font-size:12px; color:#aaa; margin-bottom:5px;">Automation starts in:</div>
                <div id="crm-countdown-timer" style="font-size:28px; font-weight:bold; color:#28a745; margin: 5px 0; font-family: monospace;">00:00:00</div>
                <div style="font-size:11px; color:#666; margin-bottom:10px;">Please keep this tab open</div>
                <button id="crm-stop-countdown" style="width:100%; padding:8px; background:#dc3545; border:none; border-radius:3px; color:white; cursor:pointer; font-weight:bold;">STOP / CANCEL</button>
            </div>

            <div style="display: flex; gap: 5px; margin-bottom: 10px;">
                 <button id="crm-load-btn" style="flex: 1; padding: 10px; background: #495057; border: none; border-radius: 4px; cursor: pointer; color: white; font-size: 13px;">📂 Load JSON</button>
                 <button id="crm-save-btn" style="flex: 1; padding: 10px; background: #6c757d; border: none; border-radius: 4px; cursor: pointer; color: white; font-size: 13px;">💾 Save JSON</button>
                 <button id="crm-toggle-steps-btn" style="flex: 0 0 auto; padding: 10px 15px; background: #17a2b8; border: none; border-radius: 4px; cursor: pointer; color: white; font-size: 13px;">▼ Steps</button>
            </div>

            <input type="file" id="crm-file-input" accept=".json" style="display: none;" />

            <!-- Bulk Actions Toolbar -->
            <div id="crm-bulk-toolbar" style="
                display: none;
                flex-direction: column;
                gap: 8px;
                background: #252525;
                border: 1px solid #444;
                border-bottom: none;
                padding: 10px;
                border-radius: 4px 4px 0 0;
                margin-top: 5px;
                font-size: 12px;
            ">
                <!-- Row 1: Selection Info -->
                <div style="display:flex; align-items:center; justify-content:space-between;">
                    <label style="display:flex; align-items:center; gap:6px; cursor:pointer; font-weight:bold; color:#fff;">
                        <input type="checkbox" id="crm-select-all" style="accent-color: #17a2b8; width:16px; height:16px;"> Select All
                    </label>
                    <span style="color: #aaa; background:#333; padding:2px 8px; border-radius:10px;"><span id="crm-bulk-count" style="color:#fff; font-weight:bold;">0</span> selected</span>
                </div>

                <!-- Row 2: Actions -->
                <div style="display:flex; align-items:center; gap:6px; justify-content: space-between;">
                    <div style="display:flex; align-items:center; gap:4px;">
                        <input type="number" id="crm-bulk-delay" placeholder="ms" style="width:60px; background:#333; border:1px solid #555; color:#fff; padding:5px; border-radius:3px; text-align:center;">
                        <button id="crm-bulk-apply" title="Set exact value" style="background:#17a2b8; border:none; color:#fff; border-radius:3px; padding:6px 12px; cursor:pointer; font-weight:bold;">Set</button>
                    </div>
                    <div style="display:flex; gap:4px;">
                        <button id="crm-bulk-minus" title="Make Faster (Reduce Delay)" style="background:#28a745; border:none; color:#fff; border-radius:3px; padding:6px 12px; cursor:pointer; font-weight:bold;">Speed Up</button>
                        <button id="crm-bulk-plus" title="Make Slower (Add Delay)" style="background:#dc3545; border:none; color:#fff; border-radius:3px; padding:6px 12px; cursor:pointer; font-weight:bold;">Slow Down</button>
                    </div>
                </div>
            </div>

            <div id="crm-steps-container" style="
                display: none;
                max-height: 70vh;
                overflow-y: auto;
                background: #2d2d2d;
                border: 1px solid #444;
                border-top: none; /* Connect with toolbar */
                border-radius: 0 0 4px 4px; /* Connect with toolbar */
                padding: 5px;
                margin-top: 0; /* Connect with toolbar */
                font-size: 13px;
                font-family: monospace;
            ">
                <div style="text-align:center; color:#888; padding:10px;">No steps loaded</div>
            </div>

            <div style="text-align: center; margin-top: 10px;">
                <button id="crm-enable-btn" style="font-size: 14px; background:none; border:none; cursor: pointer; color: #17a2b8;">✅ Enabled</button>
            </div>
        `;

        document.body.appendChild(panel);

        // Event Listeners
        document.getElementById("crm-close-panel").onclick = () => {
            panel.remove();
            storageSet({ [STORAGE_KEYS.panelVisible]: false });
        };
        
        document.getElementById("crm-save-btn").onclick = () => {
            downloadRecording();
        };

        // Bulk Actions Listeners
        document.getElementById("crm-select-all").onchange = (e) => {
            if (!currentFlow) return;
            if (e.target.checked) {
                currentFlow.forEach((_, i) => selectedStepIndices.add(i));
            } else {
                selectedStepIndices.clear();
            }
            renderStepsList(); // Re-render to update checkboxes
        };

        document.getElementById("crm-bulk-apply").onclick = () => applyBulkAction("set");
        
        // Auto-repeat for bulk actions
        const setupBulkRepeat = (btnId, actionMode) => {
            const btn = document.getElementById(btnId);
            if (!btn) return;

            let timer = null;
            let repeatRate = 150;

            const stop = () => {
                if (timer) {
                    clearTimeout(timer);
                    timer = null;
                }
                repeatRate = 150;
                window.removeEventListener('mouseup', stop);
            };

            const start = (e) => {
                if (btn.disabled) return;
                e.preventDefault();
                e.stopPropagation();
                
                window.addEventListener('mouseup', stop);
                
                // Immediate action
                applyBulkAction(actionMode);

                const loop = () => {
                    timer = setTimeout(() => {
                        applyBulkAction(actionMode);
                        repeatRate = Math.max(50, repeatRate * 0.9); // Accelerate
                        loop();
                    }, repeatRate);
                };
                
                timer = setTimeout(loop, 400);
            };

            btn.onmousedown = start;
            btn.onmouseleave = stop;
            btn.onclick = (e) => e.stopPropagation();
        };

        setupBulkRepeat("crm-bulk-plus", "add");
        setupBulkRepeat("crm-bulk-minus", "subtract");

        // Schedule Logic
        let countdownInterval = null;

        const formatTimeRemaining = (ms) => {
            if (ms <= 0) return "00:00:00";
            const seconds = Math.floor((ms / 1000) % 60);
            const minutes = Math.floor((ms / (1000 * 60)) % 60);
            const hours = Math.floor((ms / (1000 * 60 * 60)));
            return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        };

        const updateCountdownUI = (targetTime) => {
            const now = Date.now();
            const diff = targetTime - now;
            
            if (diff <= 0) {
                clearInterval(countdownInterval);
                sessionStorage.removeItem(STORAGE_KEYS.scheduledTime);
                document.getElementById("crm-countdown-display").style.display = "none";
                document.getElementById("crm-auto-btn").disabled = false;
                handleRunAutomation();
                return;
            }

            document.getElementById("crm-countdown-timer").textContent = formatTimeRemaining(diff);
        };

        const startScheduleCountdown = (targetTime) => {
            document.getElementById("crm-schedule-container").style.display = "none";
            document.getElementById("crm-countdown-display").style.display = "block";
            document.getElementById("crm-auto-btn").disabled = true; // Prevent double run

            updateCountdownUI(targetTime);
            
            if (countdownInterval) clearInterval(countdownInterval);
            countdownInterval = setInterval(() => {
                updateCountdownUI(targetTime);
            }, 1000);
        };

        // Event Listeners for Schedule
        document.getElementById("crm-schedule-btn").onclick = () => {
            const container = document.getElementById("crm-schedule-container");
            container.style.display = container.style.display === "none" ? "block" : "none";
            
            // Set default time to now + 5 min
            if (!document.getElementById("crm-schedule-time").value) {
                const now = new Date();
                now.setMinutes(now.getMinutes() + 5);
                now.setSeconds(0);
                now.setMilliseconds(0);
                // Format for datetime-local: YYYY-MM-DDTHH:mm:ss
                const pad = (n) => String(n).padStart(2, '0');
                const str = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
                document.getElementById("crm-schedule-time").value = str;
            }
        };

        // Schedule Adjustment Logic
        const adjustScheduleTime = (seconds) => {
            const input = document.getElementById("crm-schedule-time");
            if (!input.value) return;
            const date = new Date(input.value);
            date.setSeconds(date.getSeconds() + seconds);
            
            // Format back to datetime-local string: YYYY-MM-DDTHH:mm:ss
            const pad = (n) => String(n).padStart(2, '0');
            const str = `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
            input.value = str;
        };

        const setupScheduleRepeat = (btnId, seconds) => {
            const btn = document.getElementById(btnId);
            if (!btn) return;
            let timer = null;
            let repeatRate = 100;

            const stop = () => {
                if (timer) { clearTimeout(timer); timer = null; }
                repeatRate = 100;
                window.removeEventListener('mouseup', stop);
            };

            const start = (e) => {
                e.preventDefault(); e.stopPropagation();
                window.addEventListener('mouseup', stop);
                adjustScheduleTime(seconds);
                const loop = () => {
                    timer = setTimeout(() => {
                        adjustScheduleTime(seconds);
                        repeatRate = Math.max(50, repeatRate * 0.9);
                        loop();
                    }, repeatRate);
                };
                timer = setTimeout(loop, 400);
            };
            btn.onmousedown = start;
            btn.onmouseleave = stop;
            btn.onclick = (e) => e.stopPropagation();
        };

        setupScheduleRepeat("crm-sched-minus", -30);
        setupScheduleRepeat("crm-sched-plus", 30);

        document.getElementById("crm-cancel-schedule").onclick = () => {
            document.getElementById("crm-schedule-container").style.display = "none";
        };

        document.getElementById("crm-start-schedule").onclick = () => {
            const input = document.getElementById("crm-schedule-time");
            const targetDate = new Date(input.value);
            const targetTime = targetDate.getTime();
            
            if (isNaN(targetTime) || targetTime <= Date.now()) {
                alert("Please select a future date and time.");
                return;
            }

            sessionStorage.setItem(STORAGE_KEYS.scheduledTime, targetTime);
            startScheduleCountdown(targetTime);
        };

        document.getElementById("crm-stop-countdown").onclick = () => {
            if (countdownInterval) clearInterval(countdownInterval);
            sessionStorage.removeItem(STORAGE_KEYS.scheduledTime);
            document.getElementById("crm-countdown-display").style.display = "none";
            document.getElementById("crm-auto-btn").disabled = false;
        };

        // Check for existing schedule on init (Tab Specific)
        const storedTime = sessionStorage.getItem(STORAGE_KEYS.scheduledTime);
        if (storedTime) {
            const target = parseInt(storedTime, 10);
            if (target > Date.now()) {
                startScheduleCountdown(target);
            } else {
                // Expired or invalid
                sessionStorage.removeItem(STORAGE_KEYS.scheduledTime);
            }
        }

        function applyBulkAction(mode) {
            const delayInput = document.getElementById("crm-bulk-delay");
            let val = parseInt(delayInput.value, 10);
            if (isNaN(val) || val < 0) return; 

            if (selectedStepIndices.size === 0) return;

            selectedStepIndices.forEach(index => {
                if (currentFlow[index]) {
                    let currentVal = currentFlow[index].delay || 0;
                    if (mode === "set") {
                        currentFlow[index].delay = Math.max(50, val);
                    } else if (mode === "add") {
                        currentFlow[index].delay = currentVal + val;
                    } else if (mode === "subtract") {
                        currentFlow[index].delay = Math.max(50, currentVal - val);
                    }
                }
            });

            storageSet({ [STORAGE_KEYS.lastRecording]: currentFlow });
            renderStepsList(); 
        }
        
        // ---

        const enableBtn = document.getElementById("crm-enable-btn");
        enableBtn.onclick = async () => {
            isEnabled = !isEnabled;
            await storageSet({ [STORAGE_KEYS.enabled]: isEnabled });
            applyEnabledState();
            if (isEnabled) {
                checkAndAutoStart();
            }
        };

        document.getElementById("crm-record-btn").onclick = () => {
            if (window.isRecording) {
                stopAndSaveRecording();
            } else {
                startRecording();
            }
        };

        document.getElementById("crm-auto-btn").onclick = async () => {
            if (window.isRecording) return;
            if (window.isAutomationRunning) {
                // Stop playback
                window.isAutomationRunning = false;
                await storageSet({ [STORAGE_KEYS.isPlaying]: false });
                updateStatus("Playback Stopped", "red");
                resetButtons();
                return;
            }
            await handleRunAutomation();
        };

        document.getElementById("crm-load-btn").onclick = () => {
            document.getElementById("crm-file-input").click();
        };

        document.getElementById("crm-file-input").onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                try {
                    const json = JSON.parse(ev.target.result);
                    if (Array.isArray(json)) {
                        setActiveFlow(json, file.name, true);
                        renderStepsList();
                    } else {
                        alert("Invalid JSON format");
                    }
                } catch (err) {
                    alert("Error parsing JSON: " + err.message);
                }
            };
            reader.readAsText(file);
        };
        
        document.getElementById("crm-toggle-steps-btn").onclick = () => {
            const container = document.getElementById("crm-steps-container");
            const toolbar = document.getElementById("crm-bulk-toolbar");
            const btn = document.getElementById("crm-toggle-steps-btn");
            
            if (container.style.display === "none") {
                container.style.display = "block";
                toolbar.style.display = "flex";
                btn.textContent = "▲ Steps";
                renderStepsList();
            } else {
                container.style.display = "none";
                toolbar.style.display = "none";
                btn.textContent = "▼ Steps";
            }
        };

        initializePanelState();
    }

    function checkAndAutoStart() {
        if (!isEnabled) return;
        if (currentFlow && currentFlow.length > 0) {
            updateStatus(`Ready: ${currentFlowSource} flow loaded`, "green");
            return;
        }
        updateStatus("Ready. Record or load JSON.", "green");
    }

    function updateStatus(msg, color = "black") {
        const el = document.getElementById("crm-status-msg");
        if (el) {
            el.textContent = msg;
            el.style.color = color;
            el.title = msg; // Show full message on hover
        }
        console.log("Automation Status: " + msg);
    }

    function setActiveFlow(events, source, persist) {
        if (!Array.isArray(events) || events.length === 0) return;
        currentFlow = events;
        currentFlowSource = source || "recording";
        if (persist) {
            storageSet({
                [STORAGE_KEYS.lastRecording]: events,
                [STORAGE_KEYS.lastSource]: currentFlowSource
            });
        }
        updateStatus(`Ready: ${currentFlowSource} flow loaded`, "green");
    }

    async function initializePanelState() {
        const data = await storageGet([
            STORAGE_KEYS.enabled,
            STORAGE_KEYS.lastRecording,
            STORAGE_KEYS.lastSource,
            STORAGE_KEYS.isRecording,
            STORAGE_KEYS.currentSessionEvents,
            STORAGE_KEYS.isPlaying,
            STORAGE_KEYS.currentPlayIndex,
            STORAGE_KEYS.playEvents
        ]);
        if (data[STORAGE_KEYS.enabled] === false) {
            isEnabled = false;
        }

        // Check for active Recording
        const isRecordingActive = data[STORAGE_KEYS.isRecording];
        const currentSessionEvents = data[STORAGE_KEYS.currentSessionEvents];

        if (isRecordingActive) {
            window.isRecording = true;
            window.recordedEvents = Array.isArray(currentSessionEvents) ? currentSessionEvents : [];
            
            const navEvent = {
                type: 'navigation',
                url: window.location.href,
                title: document.title,
                timestamp: Date.now()
            };
            saveEvent(navEvent);

            attachRecordingListeners();
            updateStatus("🔴 Recording Resumed...", "red");

            const recordBtn = document.getElementById("crm-record-btn");
            if (recordBtn) {
                recordBtn.textContent = "⏹ Stop & Save Recording";
                recordBtn.onclick = stopAndSaveRecording;
                recordBtn.style.backgroundColor = "#dc3545"; 
            }
        }

        // Check for active Playback (Automation)
        const isPlaying = data[STORAGE_KEYS.isPlaying];
        const playEvents = data[STORAGE_KEYS.playEvents];
        const playIndex = data[STORAGE_KEYS.currentPlayIndex] || 0;

        // Restore last loaded flow regardless of playing state, so steps are visible
        const saved = data[STORAGE_KEYS.lastRecording];
        // If we are playing, the active flow is the one being played
        if (isPlaying && Array.isArray(playEvents)) {
             currentFlow = playEvents;
             currentFlowSource = "running_automation";
        } else if (Array.isArray(saved) && saved.length > 0) {
            currentFlow = saved;
            currentFlowSource = data[STORAGE_KEYS.lastSource] || "recording";
        }

        applyEnabledState();

        // Resume Playback if active
        if (isEnabled && isPlaying && Array.isArray(playEvents) && playEvents.length > 0) {
             // Ensure page is fully loaded before starting
            if (document.readyState !== "complete") {
                updateStatus("Waiting for page load...", "blue");
                window.addEventListener("load", () => {
                     playRecording(playEvents, playIndex);
                });
            } else {
                // Give a small delay for any client-side hydration
                setTimeout(() => {
                    playRecording(playEvents, playIndex);
                }, 1000);
            }
        } else if (isEnabled && !isRecordingActive) {
            checkAndAutoStart();
        }
        
        // Render steps if available
        if (currentFlow && currentFlow.length > 0) {
             renderStepsList();
        }
    }

    function applyEnabledState() {
        const btn = document.getElementById("crm-auto-btn");
        const recordBtn = document.getElementById("crm-record-btn");
        const loadBtn = document.getElementById("crm-load-btn");
        const enableBtn = document.getElementById("crm-enable-btn");
        const disabled = !isEnabled;

        if (enableBtn) {
            enableBtn.textContent = isEnabled ? "✅ Enabled" : "🚫 Disabled";
        }
        [btn, recordBtn, loadBtn].forEach(el => {
            if (!el) return;
            el.disabled = disabled;
            el.style.opacity = disabled ? "0.5" : "1";
            el.style.cursor = disabled ? "not-allowed" : "pointer";
        });
        if (disabled) {
            updateStatus("Disabled. Enable to use.", "gray");
        }
    }

    function handleMessage(message) {
        if (!message || !message.action) return;
        if (message.action === "show_panel") {
            createFloatingPanel();
            return;
        }
        if (message.action === "hide_panel") {
            const panel = document.getElementById("crm-automation-panel");
            if (panel) panel.remove();
            return;
        }
        if (message.action === "run") {
            handleRunAutomation();
            return;
        }
        if (message.action === "record_start") {
            if (!window.isRecording) startRecording();
            return;
        }
        if (message.action === "record_stop") {
            if (window.isRecording) stopAndSaveRecording();
            return;
        }
        if (message.action === "load") {
            loadAndPlayRecording();
        }
    }

    if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
        chrome.runtime.onMessage.addListener((message) => {
            handleMessage(message);
        });
    }

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function getXPath(xpath, context = document) {
        return document.evaluate(xpath, context, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
    }

    function findElement(strategies) {
        for (let s of strategies) {
            let el = null;
            try {
                if (s.startsWith("//")) el = getXPath(s);
                else el = document.querySelector(s);
            } catch(e) {}
            if (el) return el;
        }
        return null;
    }

    async function waitForElement(strategies, timeout = 10000) {
        const start = Date.now();
        while (Date.now() - start < timeout) {
            if (!window.isAutomationRunning) return null;
            const el = findElement(strategies);
            if (el) return el;
            await sleep(100);
        }
        return null;
    }

    async function simulateType(element, text) {
        if (!element) return;
        element.focus();
        element.value = text;
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
        element.dispatchEvent(new Event('blur', { bubbles: true }));
        await sleep(50);
    }

    async function applyInputValue(element, value, isContentEditable) {
        if (!element) return;
        element.focus();
        if (isContentEditable || element.isContentEditable) {
            element.textContent = value;
            element.dispatchEvent(new Event('input', { bubbles: true }));
            element.dispatchEvent(new Event('change', { bubbles: true }));
            element.dispatchEvent(new Event('blur', { bubbles: true }));
            await sleep(50);
            return;
        }
        if (element.type === 'checkbox' || element.type === 'radio') {
            element.checked = value === true || value === 'true' || value === '1';
            element.dispatchEvent(new Event('change', { bubbles: true }));
            await sleep(50);
            return;
        }
        element.value = value;
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
        element.dispatchEvent(new Event('blur', { bubbles: true }));
        await sleep(50);
    }


    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => {
            // Check visibility state before creating
            storageGet([STORAGE_KEYS.panelVisible]).then(data => {
                if (data[STORAGE_KEYS.panelVisible] === true) {
                    createFloatingPanel();
                }
            });
        });
    } else {
        storageGet([STORAGE_KEYS.panelVisible]).then(data => {
            if (data[STORAGE_KEYS.panelVisible] === true) {
                createFloatingPanel();
            }
        });
    }

})();
