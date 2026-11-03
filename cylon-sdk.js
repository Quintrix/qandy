/* --- QANDY POCKET COMPUTER SDK: UI & VIDEO BINDINGS --- */
(function() {
// ========================================================================
// 0. OS TERMINAL BRIDGING
// ========================================================================
// Route native print calls to the Cylon Desktop terminal instead of browser print dialog
window.print = function(text) {
    if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: 'CYLON_PRINT', text: String(text) }, (window.location.origin && window.location.origin !== "null" ? window.location.origin : "*"));
    } else {
        console.log(text);
    }
};

// ========================================================================
// CYLON OS SYSTEM API BRIDGE
// Translates local app requests into secure Cylon OS postMessages
// ========================================================================

// 1. Popup Management (Routes to CylonPopManager in command.js)
window.pop = window.popHtm = function(html) {
    if (window.parent !== window) {
        window.parent.postMessage({ type: 'CYLON_POP_HTM', html: html }, (window.location.origin && window.location.origin !== "null" ? window.location.origin : "*"));
    }
};

window.hpop = function() {
    if (window.parent !== window) {
        window.parent.postMessage({ type: 'CYLON_POP_HIDE' }, (window.location.origin && window.location.origin !== "null" ? window.location.origin : "*"));
    }
};

// 3. Hardware / System Utilities
window.dosExit = function() {
    if (window.parent && typeof window.parent.showTerminal === 'function') {
        window.parent.showTerminal();
    }
};

window.sleep = function(ms) { 
    return new Promise(resolve => setTimeout(resolve, ms)); 
};

window.beep = function(freq, dur, vol) {
    if (window.parent && typeof window.parent.beep === 'function') {
        window.parent.beep(freq, dur, vol);
    }
};

// 4. Input Routing
document.addEventListener('keydown', function(e) {
    if (e.key === 'Tab') {
        e.preventDefault();
        if (window.parent && window.parent !== window && typeof window.parent.toggleAppFocus === 'function') {
            window.parent.toggleAppFocus();
        }
        return;
    }
    if (typeof window.keydown === 'function') {
        window.keydown(e.key, e);
    }
});

// 5. Terminal Command Execution
window.CylonCommand = async function(cmdStr) {
    let trimmed = cmdStr.trim();
    let lower = trimmed.toLowerCase();
    
    // Prevent race conditions by executing GFX commands locally if the engine is present.
    // This stops background apps (like the desktop) from accidentally hijacking the
    // active foreground app when they boot up and request a server connection.
    if (lower === 'gfx' || lower.startsWith('gfx ')) {
        if (window.CylonGFX && typeof window.CylonGFX.handleGfxCommand === 'function') {
            let argsStr = trimmed.substring(3).trim();
            let spaceIdx = argsStr.indexOf(' ');
            let gfxCmd = spaceIdx > -1 ? argsStr.substring(0, spaceIdx) : argsStr;
            let gfxData = spaceIdx > -1 ? argsStr.substring(spaceIdx + 1) : "";
            
            if (!gfxCmd) gfxCmd = "refresh";
            
            await window.CylonGFX.handleGfxCommand(gfxCmd, gfxData);
            return true;
        }
    }

    if (window.parent && typeof window.parent.injectAndExecute === 'function') {
        return await window.parent.injectAndExecute(cmdStr);
    } else {
        throw new Error("Cylon OS terminal interface not available.");
    }
};

// 6. Macro / Batch Script Execution
// Evaluates a multi-line string of commands, executing each sequentially.
window.CylonScript = async function(scriptText) {
    if (typeof scriptText !== 'string') return false;
    
    // Support both literal newlines and escaped \n strings
    let lines = scriptText.replace(/\\n/g, '\n').split('\n');
    
    for (let cmd of lines) {
        cmd = cmd.trim();
        // Ignore empty lines and comments (// or ;)
        if (cmd && !cmd.startsWith('//') && !cmd.startsWith(';')) {
            await window.CylonCommand(cmd);
        }
    }
    return true;
};


// ========================================================================
// 1. INPUT INTERCEPTION (Keyboard & Textarea handling)
// ========================================================================
let autoIdCounter = 0;
let trackedEl = null;
let resizeObs = null;

function rectOf(el) {
    const r = el.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
}

function reportRect(el) {
    if (!el || !el.isConnected) return;
    window.parent.postMessage({
        type: 'QANDY_INPUT_RECT',
        id: el.id,
        rect: rectOf(el)
    }, (window.location.origin && window.location.origin !== "null" ? window.location.origin : "*"));
}

function trackElement(el) {
    if (resizeObs) resizeObs.disconnect();
    trackedEl = el;
    if (!el || typeof ResizeObserver === 'undefined') return;
    resizeObs = new ResizeObserver(() => reportRect(trackedEl));
    resizeObs.observe(el);
    resizeObs.observe(document.body);
}

function stopTracking() {
    if (resizeObs) resizeObs.disconnect();
    resizeObs = null;
    trackedEl = null;
}

function getFieldLabel(el) {
    if (el.placeholder) return el.placeholder;
    if (el.title) return el.title;
    if (el.name) return el.name;
    if (el.id && !el.id.startsWith('qandy-input-auto')) return el.id;
    return el.tagName === 'TEXTAREA' ? 'TEXT' : 'INPUT';
}

function handleInputTap(e) {
    const el = e.target;
    if (el && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && el.type === 'text'))) {
        el.setAttribute('inputmode', 'none');

        if (e.type === 'pointerdown' || (e.type === 'mousedown' && e.pointerType === undefined) || e.type === 'touchstart') {
            
            // Prevent native input from gaining focus to eliminate the double cursor
            e.preventDefault();
            if (document.activeElement) document.activeElement.blur();
            
            // Pass focus back to the parent so physical keyboard input goes to Qandy terminal!
            if (window.parent && window.parent !== window) {
                window.parent.focus();
            }

            if (!el.id) el.id = 'qandy-input-auto-' + (autoIdCounter++);
            
            let maxLen = el.hasAttribute('maxlength') ? parseInt(el.getAttribute('maxlength'), 10) : null;

            window.parent.postMessage({
                type: 'QANDY_REQ_INPUT',
                id: el.id,
                value: el.value,
                isMultiline: el.tagName === 'TEXTAREA',
                label: getFieldLabel(el),
                rect: rectOf(el),
                maxLength: maxLen // Pass to Qandy OS
            }, (window.location.origin && window.location.origin !== "null" ? window.location.origin : "*"));

            trackElement(el);
        }
    } else if (e.type === 'pointerdown') {
        // If the user clicks any non-input visual surface of an app, alert the parent OS
        if (window.parent && window.parent !== window) {
            window.parent.postMessage({ type: 'QANDY_APP_CLICKED' }, (window.location.origin && window.location.origin !== "null" ? window.location.origin : "*"));
        }
    }
}

document.addEventListener('pointerdown', handleInputTap, { capture: true, passive: false });
document.addEventListener('mousedown', handleInputTap, { capture: true, passive: false });
document.addEventListener('touchstart', handleInputTap, { capture: true, passive: false });

window.addEventListener('message', (e) => {
    // --- Security Upgrade: Origin and Source Validation ---
    if (window.location.origin !== "null" && e.origin !== window.location.origin) return;
    if (e.source !== window && e.source !== window.parent) return;
    // ------------------------------------------------------

    // Catch virtual keystrokes forwarded from the parent OS
    if (e.data.type === 'QANDY_VKEY') {
        if (typeof window.keydown === 'function') {
            window.keydown(e.data.key, null); 
        }
    } 
    if (e.data.type === 'QANDY_UPDATE_INPUT' || e.data.type === 'QANDY_COMMIT_INPUT') {
        const el = document.getElementById(e.data.id);
        if (el) {
            el.value = e.data.value;
            el.dispatchEvent(new Event('input', { bubbles: true }));

            if (e.data.type === 'QANDY_COMMIT_INPUT') {
                el.dispatchEvent(new Event('change', { bubbles: true }));
                el.blur(); 
                stopTracking();
            } else {
                requestAnimationFrame(() => reportRect(el));
            }
        }
    }
});

// ========================================================================
// 2. GRAPHICS & DESKTOP RENDERING LIBRARY
// ========================================================================

window.CylonSDK = window.CylonSDK || {};
window.CylonSDK.apps = {}; 

/**
 * Sync CSS Variables from the Parent OS
 */
window.CylonSDK.applyColors = function(vars) {
    if (!vars) return;
    let root = document.documentElement;
    root.style.setProperty('--bg-color', vars.BackgroundColor || '#000');
    root.style.setProperty('--fg-color', vars.ForegroundColor || '#0f0');
    root.style.setProperty('--font-face', (vars.Font || 'monospace') + ', monospace');
    root.style.setProperty('--menu-bg', vars.MenuBgColor || '#111');
    root.style.setProperty('--menu-fg', vars.MenuFgColor || '#aaa');
    root.style.setProperty('--sel-bg', vars.SelectBgColor || '#333');
    root.style.setProperty('--sel-fg', vars.SelectFgColor || '#0f0');
};

/**
 * Register apps for desktop/popup launching.
 */
window.CylonSDK.registerApps = function(appMap) {
    Object.assign(window.CylonSDK.apps, appMap);
};

/**
 * Injects the shared responsive icon grid and background CSS into the document.
 */
window.CylonSDK.injectDesktopStyles = function() {
    if (document.getElementById('cylon-sdk-desktop-styles')) return;
    
    // Immediately pull colors from parent before injecting styles
    if (window.parent && window.parent.CylonColors) {
        window.CylonSDK.applyColors(window.parent.CylonColors);
    }
    
    let tileSize = parseInt(localStorage.getItem('qandy_display_res')) || 64; 
    
    const style = document.createElement('style');
    style.id = 'cylon-sdk-desktop-styles';
    style.textContent = `
        :root { --tile-size: ${tileSize}px; }
        html, body {
            margin: 0; padding: 0; overflow: hidden; height: 100%; width: 100%;
            background-color: var(--bg-color, #000);
            color: var(--fg-color, #0f0);
            font-family: var(--font-face, monospace);
        }
        .cylon-grid-container {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
            grid-auto-rows: 100px; gap: 15px; padding: 20px;
            width: 100%; height: 100%; box-sizing: border-box;
            align-content: start; overflow-y: auto;
        }
        .gfx-icon {
            display: flex; flex-direction: column; align-items: center; justify-content: flex-start;
            cursor: pointer; z-index: 10;
        }
        .gfx-icon img {
            width: var(--tile-size); height: var(--tile-size);
            object-fit: contain; image-rendering: pixelated;
            filter: drop-shadow(2px 2px 3px rgba(0,0,0,0.8));
        }
        .gfx-icon-label {
            margin-top: 5px; color: var(--fg-color, #0f0); font-family: var(--font-face, sans-serif); font-size: 13px;
            text-align: center; text-shadow: 1px 1px 2px var(--bg-color, #000), -1px -1px 2px var(--bg-color, #000);
            word-wrap: break-word; width: 100%;
        }
    `;
    document.head.appendChild(style);
};

/**
 * Renders a generic array of items into a grid container.
 */
window.CylonSDK.renderIconGrid = function(containerId, items) {
    let container = document.getElementById(containerId);
    if (!container) return;
    
    container.innerHTML = '';
    container.classList.add('cylon-grid-container');

    let hostOrigin = window.cylonHostOrigin || '';
    let iconBase = (window.CylonGFX && window.CylonGFX.gfxIconDir) ? window.CylonGFX.gfxIconDir : (hostOrigin + 'i/');
    let fallbackBase = (hostOrigin + 'q/');

    items.forEach(item => {
        let iconWrap = document.createElement('div');
        iconWrap.className = 'gfx-icon';
        iconWrap.title = item.title || item.label;

        let img = document.createElement('img');
        img.src = item.iconPath || `${iconBase}${item.iconId}.png`;
        
        img.onerror = function() { 
            this.onerror = null; 
            this.src = `${fallbackBase}file.png`; 
        }; 

        let label = document.createElement('div');
        label.className = 'gfx-icon-label';
        label.textContent = item.label;

        iconWrap.appendChild(img);
        iconWrap.appendChild(label);

        if (item.action) {
            iconWrap.onclick = (e) => item.action(item, e);
        }

        container.appendChild(iconWrap);
    });
};

/**
 * Fetches a map file (.gfx) via CylonDOS and parses out a specific sector into an items array.
 */
window.CylonSDK.getGFXSectorItems = async function(filename, sectorId) {
    if (!window.parent || !window.parent.CylonDOS) throw new Error("CylonDOS not available.");
    
    let gfxData = await window.parent.CylonDOS.load(filename);
    if (!gfxData) throw new Error("Could not load map file: " + filename);

    let items = [];
    let lines = gfxData.split('\n');
    
    for (let line of lines) {
        let eqIdx = line.indexOf('=');
        if (eqIdx === -1) continue;

        let label = line.substring(0, eqIdx);
        if (label === sectorId) {
            let content = line.substring(eqIdx + 1);
            let parts = content.split('.');
            let itemsData = parts[1] || "";
            
            if (itemsData) {
                itemsData.split('~').forEach(c => {
                    if (!c) return;
                    let [meta, logic] = c.split('|');
                    if (meta.length >= 4) {
                        let id = meta.substring(0, 2);
                        let z = meta.substring(2, 4);
                        
                        let app = window.CylonSDK.apps[id];
                        
                        items.push({
                            iconId: id,
                            label: app ? app.title : id,
                            zLocation: z,
                            originalId: id
                        });
                    }
                });
            }
            break; 
        }
    }
    return items;
};

/**
 * Standard click action for graphical icons (generates popup menu)
 */
window.CylonSDK.showAppPopup = function(item) {
    let itemId = item.iconId;
    let app = window.CylonSDK.apps[itemId];
    let html = '';

    if (!app) {
        html = `<div style="text-align: center; padding: 8px;"><p><strong>Item: ${itemId}</strong></p><p>(No app bound)</p></div>`;
    } else {
        html = `
        <div style="text-align: center; padding: 8px;">
            <div style="margin-bottom: 8px;">
                <img src="${window.cylonHostOrigin || ''}i/${itemId}.png" style="width: 64px; height: 64px; image-rendering: pixelated;" />
            </div>
            <div style="font-weight: bold; margin: 6px 0;">
                <strong>${app.title}</strong>
            </div>
            <div style="font-size: 11px; color: #666; margin: 4px 0;">
                ItemID: <code>${itemId}</code>
            </div>
            <div style="margin-top: 10px;">
                <a href="gfx:launch_${itemId}" style="
                    display: inline-block; padding: 6px 12px;
                    background-color: var(--sel-bg, #0066cc); color: var(--sel-fg, #fff);
                    text-decoration: none; border-radius: 3px;
                    cursor: pointer; font-size: 12px;
                ">Open ${app.title}</a>
            </div>
        </div>`;
    }

    if (typeof window.parent.popHtm === 'function') {
        if (window.parent.PopAlign !== undefined) window.parent.PopAlign = "click";
        if (item.zLocation) {
            let zBase = (window.parent.CylonGFX && window.parent.CylonGFX.gfxZBase) ? window.parent.CylonGFX.gfxZBase : 10;
            window.parent.lastClickedZ = parseInt(item.zLocation, zBase); 
        }
        window.parent.popHtm(html);
    } else if (typeof popHtm === 'function') {
        popHtm(html);
    } else {
        if (app && window.parent && window.parent.PageOpen) {
            window.parent.PageOpen(app.file, app.title);
        }
    }
};

/**
 * Renders a list/tree view of items into a container.
 */
window.CylonSDK.renderListGrid = function(containerId, items) {
    let container = document.getElementById(containerId);
    if (!container) return;
    
    container.innerHTML = '';
    container.className = '';
    container.style.cssText = 'display: flex; flex-direction: column; padding: 10px; overflow-y: auto; height: 100%; box-sizing: border-box; background-color: var(--bg-color, #000);';

    let fallbackBase = (window.cylonHostOrigin || '') + 'q/';

    items.forEach(item => {
        let row = document.createElement('div');
        row.style.cssText = `display: flex; align-items: center; padding: 6px; cursor: pointer; border-bottom: 1px solid var(--fg-color, #0f0); opacity: 0.8; transition: opacity 0.1s;`;
        
        row.onmouseover = () => row.style.opacity = '1';
        row.onmouseout = () => row.style.opacity = '0.8';

        let indent = (item.level || 0) * 24;
        row.style.paddingLeft = (6 + indent) + 'px';

        let img = document.createElement('img');
        img.src = item.iconPath || `${fallbackBase}file.png`;
        img.style.cssText = 'width: 24px; height: 24px; image-rendering: pixelated; margin-right: 12px; filter: drop-shadow(1px 1px 2px rgba(0,0,0,0.5));';
        img.onerror = function() { this.onerror = null; this.src = `${fallbackBase}file.png`; };

        let label = document.createElement('div');
        label.textContent = item.label;
        label.style.cssText = 'flex: 1; color: var(--fg-color, #0f0); font-family: var(--font-face, monospace); font-size: 16px; text-shadow: 1px 1px 2px var(--bg-color, #000);';

        row.appendChild(img);
        row.appendChild(label);

        if (item.action) {
            row.onclick = (e) => item.action(item, e);
        }

        container.appendChild(row);
    });
};

})();