// ============================================================================
// Cylon Graphics & Physics Co-Processor (cylon-gfx.js)
// "Everything is a file. The filesystem is the physics engine."
// ============================================================================

// --- Unification with multiplayer gfx.js state variables ---
window.playerItem = "Si";   
window.playerZ = -1;        
window.lastClickZ = -1;     
window.playerAvatar = "";   
window.playerInven = "";    
window.playerId = "";       
window.playerWalk = -1;     
window.playerDo = null;     
window.map = "A1";          

// --- Multiplayer Networking Context ---
window.remoteQandylandUrl = null;
window.desktopDrive = null;
window.cylonGfxSession = null;
window.gfxDo = "RF";

if (typeof UNIVAC !== 'undefined' && window.GfxSyncFS) {
    UNIVAC.inject(window.GfxSyncFS);
}

window.CylonGFX = {
    // --- GFX Configuration Defaults ---
    gfxTileSize: 32,
    gfxTileDir: 't/',
    gfxIconDir: 'i/',   
    gfxCharDir: 'c/',
    gfxMapsDir: 'm/',
    gridWide: 8, 
    gridTall: 4,  
    gfxGridStretch: true,

    // --- Spatial Navigation Defaults ---
    gfxRoundWorld: false, 
    gfxLowerBound: 'Hh',  
    gfxAirLock: false,    
    gfxCommandLog: false, 
    fillTileCode: null, 
    gfxZBase: 10,

    // --- Cursor Walk Variables ---
    gfxCycle: 200,             
    cursorInterval: null,      
    networkInterval: null,

    // Backwards compatibility aliases
    get mapx() { return this.gridWide; },
    set mapx(v) { this.gridWide = v; },
    get mapy() { return this.gridTall; },
    set mapy(v) { this.gridTall = v; },
    get targetCursorZ() { return window.playerWalk; },
    set targetCursorZ(v) { window.playerWalk = v; },
    get pendingCursorAction() { return window.playerDo; },
    set pendingCursorAction(v) { window.playerDo = v; },

    currentPath: '',
    gfxGrid: false, 
    lastRenderedItems: "",
    isSyncing: false,

    persistState: async function(path, data) {
        let safeData = String(data || "\\n");
        if (this.gfxCommandLog && typeof window.CylonCommand === 'function') {
            let cliData = safeData.replace(/\n/g, '\\n');
            if (cliData.trim() === '') cliData = '\\n'; 
            await window.CylonCommand(`save ${path} ${cliData}`);
        } else if (window.parent && window.parent.CylonDOS) {
            await window.parent.CylonDOS.save(path, safeData);
        }
    },

    init: async function(startPath) {
        this.setupListeners();
        this.currentPath = startPath;
        let parts = startPath.replace(/\/$/, '').split('/');
        window.map = parts[parts.length - 1] || "A1";
        let drive = startPath.split(':')[0]; 
        
        if (window.CylonSDK && window.CylonSDK.injectDesktopStyles) {
            window.CylonSDK.injectDesktopStyles();
        }

        let dosObj = window.parent && window.parent.CylonDOS ? window.parent.CylonDOS : window.CylonDOS;
        if (!dosObj) return;

        let tDir = await this.qdosLoadSafe(dosObj, `${drive}:/a/gfxTileDir`);
        let iDir = await this.qdosLoadSafe(dosObj, `${drive}:/a/gfxIconDir`);
        let cDir = await this.qdosLoadSafe(dosObj, `${drive}:/a/gfxCharDir`);
        let mDir = await this.qdosLoadSafe(dosObj, `${drive}:/a/gfxMapsDir`);
        let tSize = await this.qdosLoadSafe(dosObj, `${drive}:/a/gfxTileSize`);
        
        let zBaseLoad = await this.qdosLoadSafe(dosObj, `${drive}:/a/gfxZBase`);
        if (zBaseLoad) this.gfxZBase = parseInt(zBaseLoad, 10) || 10;
        else this.gfxZBase = 10;
        
        let gWide = await this.qdosLoadSafe(dosObj, `${drive}:/a/gfxGridWide`);
        if (!gWide) gWide = await this.qdosLoadSafe(dosObj, `${drive}:/a/mapx`); 
        
        let gTall = await this.qdosLoadSafe(dosObj, `${drive}:/a/gfxGridTall`);
        if (!gTall) gTall = await this.qdosLoadSafe(dosObj, `${drive}:/a/mapy`); 
        
        let gStretch = await this.qdosLoadSafe(dosObj, `${drive}:/a/gfxGridStretch`);
        let cz = await this.qdosLoadSafe(dosObj, `${drive}:/a/playerZ`);
        if (!cz) cz = await this.qdosLoadSafe(dosObj, `${drive}:/a/gfxCursorZ`); 
        
        let pItem = await this.qdosLoadSafe(dosObj, `${drive}:/a/playerItem`);
        
        let rWorld = await this.qdosLoadSafe(dosObj, `${drive}:/a/gfxRoundWorld`);
        let lBound = await this.qdosLoadSafe(dosObj, `${drive}:/a/gfxLowerBound`);
        let aLock = await this.qdosLoadSafe(dosObj, `${drive}:/a/gfxAirLock`);
        let cLog = await this.qdosLoadSafe(dosObj, `${drive}:/a/gfxCommandLog`);
        let tickRate = await this.qdosLoadSafe(dosObj, `${drive}:/a/gfxTickRate`);

        if (tDir) this.gfxTileDir = tDir.trim();
        if (iDir) this.gfxIconDir = iDir.trim();
        if (cDir) this.gfxCharDir = cDir.trim();
        if (mDir) this.gfxMapsDir = mDir.trim();
        if (tSize) this.gfxTileSize = parseInt(tSize, 10);
        if (gWide) this.gridWide = parseInt(gWide, 10);
        if (gTall) this.gridTall = parseInt(gTall, 10);
        if (gStretch) this.gfxGridStretch = (gStretch.trim().toLowerCase() === 'true');
        
        if (rWorld) this.gfxRoundWorld = (rWorld.trim().toLowerCase() === 'true');
        if (lBound) this.gfxLowerBound = lBound.trim();
        if (aLock) this.gfxAirLock = (aLock.trim().toLowerCase() === 'true');
        if (cLog) this.gfxCommandLog = (cLog.trim().toLowerCase() === 'true');
        // Zero means one explicit connection/update only; positive values are
        // the periodic network poll interval in milliseconds.
        this.gfxTickRate = tickRate !== null && tickRate !== undefined && tickRate.trim() !== ''
            ? Math.max(0, parseInt(tickRate, 10) || 0)
            : 250;

        let cycleStr = await this.qdosLoadSafe(dosObj, `${drive}:/a/gfxCycle`);
        if (cycleStr) {
            let val = parseFloat(cycleStr.trim());
            if (!isNaN(val)) this.gfxCycle = Math.floor(val * 1000); 
        }

        if (pItem) window.playerItem = pItem.trim();
        window.playerZ = cz ? parseInt(cz, this.gfxZBase) : 0;
        if (isNaN(window.playerZ)) window.playerZ = 0;
        
        this.startCursorTick();
        window.dispatchEvent(new Event('resize'));
        await this.renderScreen();
    },

    qdosLoadSafe: async function(dos, path) {
        try { return await dos.load(path); } catch(e) { return null; }
    },

    setupListeners: function() {
        if (!this._listenersAdded) {
            window.addEventListener('message', async (e) => {
                if (window.location.origin !== "null" && e.origin !== window.location.origin) return;
                if (e.source !== window && e.source !== window.parent) return;
                
                if (e.data.type === 'QANDY_GFX_CMD') {
                    await this.handleGfxCommand(e.data.cmd, e.data.data);
                } else if (e.data.type === 'gfx') {
                    let fullCmd = String(e.data.cmd).trim();
                    let spaceIdx = fullCmd.indexOf(' ');
                    if (spaceIdx > -1) {
                        await this.handleGfxCommand(fullCmd.substring(0, spaceIdx), fullCmd.substring(spaceIdx + 1));
                    } else {
                        await this.handleGfxCommand(fullCmd, "");
                    }
                }
            });
            this._listenersAdded = true;
        }

        const wrapper = document.getElementById('screen-wrapper') || document.getElementById('desktop-wrapper');
        
        if (wrapper && !this._bgClickBound) {
            wrapper.addEventListener('pointerup', (e) => {
                if (e.button !== 0 && e.pointerType === 'mouse') return;
                
                if (window.parent && window.parent.CylonPopManager) {
                    let contextWrapper = window.parent.document.getElementById('cylon-context-wrapper'); 
                    if (contextWrapper && contextWrapper.style.display !== 'none') {
                        if (typeof window.parent.CylonPopManager.hideContextMenu === 'function') {
                            window.parent.CylonPopManager.hideContextMenu();
                        } else {
                            contextWrapper.style.display = 'none'; 
                        }
                        return; 
                    }
                }
                
                let rect = wrapper.getBoundingClientRect();
                let pctX = (e.clientX - rect.left) / rect.width;
                let pctY = (e.clientY - rect.top) / rect.height;
                let x = Math.floor(pctX * this.gridWide);
                let y = Math.floor(pctY * this.gridTall);
                
                x = Math.max(0, Math.min(x, this.gridWide - 1));
                y = Math.max(0, Math.min(y, this.gridTall - 1));
                let z = y * this.gridWide + x;
                
                window.lastClickZ = z;
                if (window.parent && window.parent !== window) {
                    window.parent.lastClickZ = z;
                }
                
                if (wrapper.id === 'desktop-wrapper') {
                    if (this.enableFileMove && this.pendingMovePath) {
                        const pendingPath = this.pendingMovePath;
                        this.pendingMovePath = null;
                        window.playerWalk = -1;
                        this.setCursorZ(z);
                        this.moveObjectToZ(pendingPath, z).then(() => this.showTargetMenu(z, e.clientX, e.clientY));
                        return;
                    }
                    if (this.clickMovesCursor) {
                        window.playerWalk = -1;
                        this.setCursorZ(z);
                    }
                    this.showTargetMenu(z, e.clientX, e.clientY);
                }
            });

            wrapper.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                if (window.parent && window.parent.document) window.parent.document.dispatchEvent(new Event('click'));

                let rect = wrapper.getBoundingClientRect();
                let pctX = (e.clientX - rect.left) / rect.width;
                let pctY = (e.clientY - rect.top) / rect.height;
                let x = Math.floor(pctX * this.gridWide);
                let y = Math.floor(pctY * this.gridTall);
                
                x = Math.max(0, Math.min(x, this.gridWide - 1));
                y = Math.max(0, Math.min(y, this.gridTall - 1));
                let z = y * this.gridWide + x;

                window.lastClickZ = z;
                if (window.parent && window.parent !== window) { window.parent.lastClickZ = z; }

                if (wrapper.id === 'desktop-wrapper') {
                    window.playerWalk = -1; 
                    this.setCursorZ(z);
                    this.showTargetMenu(z, e.clientX, e.clientY);
                }
            });
            this._bgClickBound = true;
        }
    },

    // ------------------------------------------------------------------------
    // MULTIPLAYER PHYSICS ENGINE NETWORKING LOOP 
    // ------------------------------------------------------------------------
    startNetworkTick: function() {
        if (this.networkInterval) clearInterval(this.networkInterval);
        this.networkInterval = null;
        // Always do one explicit handshake/update. A tick rate of zero disables
        // only the recurring poll, so initial session setup still takes place.
        this.networkTick();
        const rate = Number.isFinite(this.gfxTickRate) ? this.gfxTickRate : 250;
        if (rate > 0) this.networkInterval = setInterval(() => this.networkTick(), rate);
    },

    networkTick: async function() {
        if (this.isSyncing) return;
        this.isSyncing = true;
        
        try {
            let plugs = window.gfxDo || "RF";
            window.gfxDo = "RF"; 
            
            let response = "";
            if (window.remoteQandylandUrl) {
                let serverDrive = window.desktopDrive.endsWith('.gfx') ? window.desktopDrive : window.desktopDrive + '.gfx';
                let res = await fetch(window.remoteQandylandUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: `c=${encodeURIComponent(plugs)}&d=${encodeURIComponent(serverDrive)}&s=${encodeURIComponent(window.cylonGfxSession || '')}`
                });
                response = await res.text();
            }
            
            if (!response) return;

            let col = 0;
            let newItems = "";
            let pathChanged = false;
            
            while (col < response.length) {
                let cmd = response.substring(col, col + 2);
                
                if (cmd === 'ST') {
                    window.cylonGfxSession = response.substring(col + 2, col + 10);
                    col += 10;
                }
                else if (cmd === 'PI') {
                    if (this.gfxTickRate !== 0) {
                        window.playerItem = response.substring(col + 2, col + 4);
                        let zStr = response.substring(col + 4, col + 6);
                        let parsedZ = parseInt(zStr, this.gfxZBase);
                        // Stop server ticks overriding player walk routines when stepping
                        if (window.playerWalk === -1) {
                            window.playerZ = parsedZ;
                        }
                        window.playerId = response.substring(col + 6, col + 10);
                    }
                    col += 10;
                }
                else if (cmd === 'RF') {
                    if (this.gfxTickRate !== 0) {
                        let sector = response.substring(col + 2, col + 4);
                        newItems = response.substring(col + 6);
                        let targetPath = window.desktopDrive + ':/w/' + sector;
                        if (this.currentPath !== targetPath) {
                            this.currentPath = targetPath;
                            window.map = sector;
                            pathChanged = true;
                        }
                    }
                    // RF consumes the remainder of the response in both modes;
                    // in desktop mode do not reconcile or overwrite local files.
                    col = response.length;
                }
                else if (cmd === 'S^') {
                    let end = response.indexOf('^S', col);
                    if (end !== -1) {
                        let sPlugs = response.substring(col + 2, end);
                        if (typeof window.serverdown === 'function') window.serverdown(sPlugs);
                        col = end + 2;
                    } else {
                        if (typeof window.serverdown === 'function') window.serverdown(response.substring(col + 2));
                        col = response.length;
                    }
                } else {
                    col++; 
                }
            }
            
            this.setCursorZ(window.playerZ);
            
            // Sync items safely to DOS mirroring Unix files as objects so they can be interacted with natively
            if (pathChanged || newItems !== this.lastRenderedItems) {
                this.lastRenderedItems = newItems;
                
                let dos = window.parent && window.parent.CylonDOS ? window.parent.CylonDOS : window.CylonDOS;
                if (dos && window.remoteQandylandUrl) {
                    try {
                        let targetPath = window.desktopDrive + ':/w/' + window.map;
                        let serverFileList = newItems.split('~').filter(f => f);
                        let localFiles = await dos.dir(targetPath);
                        
                        for (let lf of localFiles) {
                            let fname = lf.name.substring(lf.name.lastIndexOf('/') + 1);
                            if (fname === 'm' || fname === 'e' || fname === 't') continue;
                            if (!serverFileList.includes(fname)) {
                                await dos.delete(lf.name);
                            }
                        }
                        for (let sf of serverFileList) {
                            let fpath = targetPath + '/' + sf;
                            if (!(await dos.exists(fpath))) {
                                await dos.save(fpath, "");
                            }
                        }
                    } catch(e) {}
                }
                await this.renderScreen();
            }
        } catch (e) {
            console.error("Network tick error:", e);
        } finally {
            this.isSyncing = false;
        }
    },

    handleGfxCommand: async function(cmd, data) {
        switch(cmd) {
            case 'list':
                let output = "[.2]Available GFX Servers:[.]\n\n";
                let dos = window.parent && window.parent.CylonDOS ? window.parent.CylonDOS : window.CylonDOS;
                
                let serverUrl = window.remoteQandylandUrl || window.location.origin + '/qandyland.js';
                let remoteFound = false;
                
                if (serverUrl.startsWith('http')) {
                    try {
                        let res = await fetch(serverUrl, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `c=SYS:DRIVES` });
                        if (res.ok) {
                            let remoteDrives = await res.text();
                            if (remoteDrives.trim()) {
                                remoteDrives.split(',').forEach(d => {
                                    if (d.trim()) output += `  qandyland ${d.trim().replace(/\.gfx$/i, '')}\n`;
                                });
                                remoteFound = true;
                            }
                        }
                    } catch(e) {}
                }
                
                if (!remoteFound) output += "  [.4]qandyland unreachable[.]\n";

                let localFound = false;
                if (dos) {
                    let mnts = await dos.mounts();
                    let gfxMnts = mnts.filter(m => m.name.endsWith('.gfx') || m.name === 'capflag' || m.name === 'queville');
                    if (gfxMnts.length > 0) {
                        gfxMnts.forEach(m => output += `      local ${m.name.replace(/\.gfx$/i, '')}\n`);
                        localFound = true;
                    }
                }

                if (!localFound && !remoteFound) output = "(No GFX servers found)\n";
                if (window.parent && window.parent.print) window.parent.print(output);
                break;

            case 'connect':
                if (data) {
                    let parts = data.trim().split(/\s+/);
                    let url = parts[0];
                    let world = parts[1] || 'capflag';
                    
                    window.remoteQandylandUrl = url;
                    window.desktopDrive = world;
                    window.cylonGfxSession = null;
                    window.gfxDo = "ST";
                    
                    let startSector = 'Aa';
                    let jdos = window.parent && window.parent.CylonDOS ? window.parent.CylonDOS : window.CylonDOS;
                    if (jdos) {
                        try {
                            let loaded = await jdos.load(`${world}:/a/gfxSector`);
                            if (loaded && loaded.trim().length === 2) startSector = loaded.trim();
                        } catch(e) {}
                    }
                    
                    await this.init(`${world}:/w/${startSector}`);
                    
                    if (this.gfxCommandLog && window.parent && window.parent.print) {
                        window.parent.print(`[.3]Connected to GFX Server: ${url} (World: ${world})[.]\n`);
                    }
                    
                    this.startNetworkTick();
                } else {
                    if (window.parent && window.parent.print) window.parent.print(`[.4]GFX Error: 'gfx connect [url] [world]' required.[.]\n`);
                }
                break;
                
            case 'refresh':
                await this.init(this.currentPath);
                if (this.gfxCommandLog && window.parent.print) window.parent.print(`[.3]GFX Engine: Desktop Refreshed.[.]\n`);
                break;

            case 'tile':
                if (typeof this.setTileAtCursor === 'function') {
                    await this.setTileAtCursor(data);
                    this.renderScreen(); 
                }
                break;

            case 'fill':
                if (data) {
                    this.fillTileCode = data;
                    if (this.gfxCommandLog && window.parent.print) window.parent.print(`[.4]GFX Fill Mode ENGAGED: brush set to [${data}][.]\n`);
                } else {
                    this.fillTileCode = null;
                    if (this.gfxCommandLog && window.parent.print) window.parent.print(`[.2]GFX Fill Mode DISABLED.[.]\n`);
                }
                break;

            case 'tele':
                if (data) {
                    let drive = this.currentPath.split(':')[0] || 'ram';
                    await this.init(`${drive}:/w/${data}`);
                    
                    await this.persistState(`${drive}:/a/gfxSector`, data);
                    if (this.gfxCommandLog && window.parent.print) window.parent.print(`[.3]Teleported to sector: ${data}[.]\n`);
                }
                break;

            case 'obj':
                if (data) {
                    let parts = data.trim().split(/\s+/);
                    let id = parts[0];
                    let dataField = parts[1];
                    
                    if (id && id.length > 2 && !dataField) {
                        dataField = id.substring(2);
                        id = id.substring(0, 2);
                    } else if (!dataField) {
                        dataField = 'Za'; 
                    }
                    
                    if (id && id.length === 2) {
                        let zHex = window.playerZ.toString(this.gfxZBase).padStart(2, '0');
                        dataField = dataField.substring(0, 2).padEnd(2, 'a');
                        
                        let filename = id + zHex + dataField;
                        let pathPrefix = this.currentPath.endsWith('/') ? this.currentPath : this.currentPath + '/';
                        let filePath = `${pathPrefix}${filename}`;
                        
                        await this.persistState(filePath, "\\n");
                        if (this.gfxCommandLog && window.parent.print) window.parent.print(`[.4]GFX Engine: Created object '${filename}' at Z:${window.playerZ}[.]\n`);
                        this.renderScreen();
                    } else {
                        if (this.gfxCommandLog && window.parent.print) window.parent.print(`[.4]GFX Error: 'gfx obj [2-char id] [optional 2-char data]' required.[.]\n`);
                    }
                } else {
                    if (this.gfxCommandLog && window.parent.print) window.parent.print(`[.4]GFX Error: 'gfx obj [2-char id] [optional 2-char data]' required.[.]\n`);
                }
                break;

            case 'item':
                if (data) {
                    let parts = data.trim().split(/\s+/);
                    let id = parts[0];
                    
                    if (id && id.length >= 2) {
                        id = id.substring(0, 2);
                        let zHex = window.playerZ.toString(this.gfxZBase).padStart(2, '0');
                        
                        let filename = id + zHex;
                        let pathPrefix = this.currentPath.endsWith('/') ? this.currentPath : this.currentPath + '/';
                        let filePath = `${pathPrefix}${filename}`;
                        
                        await this.persistState(filePath, "\\n");
                        if (this.gfxCommandLog && window.parent.print) window.parent.print(`[.4]GFX Engine: Created item '${filename}' at Z:${window.playerZ}[.]\n`);
                        this.renderScreen();
                    } else {
                        if (this.gfxCommandLog && window.parent.print) window.parent.print(`[.4]GFX Error: 'gfx item [2-char id]' required.[.]\n`);
                    }
                } else {
                    if (this.gfxCommandLog && window.parent.print) window.parent.print(`[.4]GFX Error: 'gfx item [2-char id]' required.[.]\n`);
                }
                break;
        }
    },

    buildAvatarOrIcon: function(container, iconId, avatarStr) {
        let overlayId = null;
        let registerVal = null;
        
        while (avatarStr) {
            let regMatch = avatarStr.match(/\-([0-9]{2})$/);
            if (regMatch) {
                registerVal = parseInt(regMatch[1], 10);
                avatarStr = avatarStr.substring(0, avatarStr.length - 3);
                continue;
            }
            let itemMatch = avatarStr.match(/\-([A-Z][A-Za-z0-9])$/);
            if (itemMatch) {
                overlayId = itemMatch[1];
                avatarStr = avatarStr.substring(0, avatarStr.length - 3);
                continue;
            }
            break;
        }

        if (!avatarStr || avatarStr.length < 2) {
            let img = document.createElement('img');
            img.src = this.gfxIconDir + iconId + '.png';
            img.className = 'icon-img';
            img.style.maxWidth = '60%';
            img.style.maxHeight = '55%';
            img.style.objectFit = 'contain';
            img.style.imageRendering = 'pixelated';
            img.style.filter = 'drop-shadow(2px 2px 2px rgba(0,0,0,0.8))';
            //img.onerror = function() { this.src = 'q/file.png'; };
            img.onerror = function() { this.src = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxIiBoZWlnaHQ9IjEiLz4="; };
            container.appendChild(img);
            return img;
        }

        const typeMap = {
            'A': 'head', 'B': 'head', 'E': 'head', 'F': 'head',
            'C': 'body', 'D': 'body', 'G': 'body', 'H': 'body',
            'I': 'hat',  'J': 'hat',  'K': 'hat',  'L': 'hat',
            'M': 'sword', 'N': 'sword',
            'O': 'shield', 'P': 'shield'
        };
        const partOrder = ['body', 'head', 'hat', 'sword', 'shield'];
        const currentParts = {};

        for (let i = 0; i < avatarStr.length; i += 2) {
            const partCode = avatarStr.substring(i, i + 2);
            const type = typeMap[partCode.charAt(0)];
            if (type && !currentParts[type]) {
                currentParts[type] = partCode;
            }
        }

        partOrder.forEach((type, index) => {
            const partCode = currentParts[type];
            if (partCode) {
                let el = document.createElement('img');
                el.src = this.gfxCharDir + partCode + '.png';
                el.style.position = 'absolute';
                el.style.width = '100%';
                el.style.height = '200%';
                el.style.bottom = '10%';
                el.style.left = '0';
                el.style.objectFit = 'contain';
                el.style.zIndex = (10 + index).toString();
                el.style.imageRendering = 'pixelated';
                container.appendChild(el);
            }
        });

        if (overlayId) {
            let el = document.createElement('img');
            el.src = this.gfxIconDir + overlayId + '.png';
            el.style.position = 'absolute';
            el.style.width = '100%';
            el.style.height = '100%';
            el.style.bottom = '100%';
            el.style.left = '0';
            el.style.objectFit = 'contain';
            el.style.zIndex = '20';
            el.style.imageRendering = 'pixelated';
            container.appendChild(el);
        }

        if (registerVal !== null) {
            let meterEl = document.createElement('div');
            meterEl.style.position = 'absolute';
            meterEl.style.width = '100%';
            meterEl.style.height = '8px';
            meterEl.style.bottom = '180%';
            meterEl.style.left = '0';
            meterEl.style.zIndex = '25';
            
            let greenW = registerVal;
            let redW = 100 - registerVal;
            
            meterEl.innerHTML = `
                <img src="i/Zn.png" style="position:absolute; left:0; top:0; height:100%; width:${greenW}%;" />
                <img src="i/Zm.png" style="position:absolute; right:0; top:0; height:100%; width:${redW}%;" />
            `;
            container.appendChild(meterEl);
        }
        return null; // Return null so outer wrapper understands image hasn't triggered single-tile onload mapping
    },

    renderScreen: async function() {
        let dos = window.parent && window.parent.CylonDOS ? window.parent.CylonDOS : window.CylonDOS;
        const iconsLayer = document.getElementById('icons-layer');
        const tilesLayer = document.getElementById('tiles-layer');
        if (!iconsLayer) return;

        if (this.gfxGrid) {
            iconsLayer.style.backgroundImage = `
                linear-gradient(to right, rgba(255, 255, 255, 0.15) 1px, transparent 1px),
                linear-gradient(to bottom, rgba(255, 255, 255, 0.15) 1px, transparent 1px)
            `;
            iconsLayer.style.backgroundSize = `${100 / this.gridWide}% ${100 / this.gridTall}%`;
            iconsLayer.style.borderRight = '1px solid rgba(255, 255, 255, 0.15)';
            iconsLayer.style.borderBottom = '1px solid rgba(255, 255, 255, 0.15)';
            iconsLayer.style.boxSizing = 'border-box';
        } else {
            iconsLayer.style.backgroundImage = 'none';
            iconsLayer.style.borderRight = 'none';
            iconsLayer.style.borderBottom = 'none';
        }
        
        Array.from(iconsLayer.children).forEach(child => {
            if (child.id !== 'gfx-sys-cursor') child.remove();
        });

        if (tilesLayer) tilesLayer.innerHTML = '';
        
        let tData = "";
        try { tData = await dos.load(`${this.currentPath}/m`); } catch (e) { }

        if (tData) {
            // FIX 2: Strip newlines/spaces so visually formatted 'm' files parse correctly
            tData = tData.replace(/\s+/g, ''); 

            let expectedLen = this.gridWide * this.gridTall * 2;
            
            if (tData.length < expectedLen) {
                let needed = (expectedLen - tData.length) / 2;
                if (needed > 0) tData += 'Za'.repeat(Math.ceil(needed));
            }
            if (tilesLayer) {
                for (let z = 0; z < this.gridWide * this.gridTall; z++) {
                    let code = tData.substring(z * 2, z * 2 + 2);
                    
                    if (code && code !== 'Za') {
                        let x = z % this.gridWide;
                        let y = Math.floor(z / this.gridWide);

                        let img = document.createElement('img');
                        img.src = `${this.gfxTileDir}${code}.png`;
                        img.onerror = function() { this.style.display = 'none'; };
                        img.style.position = 'absolute';
                        img.style.left = ((x / this.gridWide) * 100) + '%';
                        img.style.top = ((y / this.gridTall) * 100) + '%';
                        img.style.width = ((1 / this.gridWide) * 100) + '%';
                        img.style.height = ((1 / this.gridTall) * 100) + '%';
                        img.style.imageRendering = 'pixelated';
                        img.id = `gfx-tile-${z}`;
                        
                        tilesLayer.appendChild(img);
                    }
                }
            }
        }

        let files = [];
        try { files = await dos.dir(this.currentPath); } catch (e) { return; }

        let drive = this.currentPath.split(':')[0] || 'ram';

        for (let file of files) {
            let filename = file.name.substring(file.name.lastIndexOf('/') + 1);

            if (filename === 'm' || filename === 't' || file.type !== 'file') continue;

            if (filename.length >= 4) {
                let iconId = filename.substring(0, 2);
                let zHex = filename.substring(2, 4);
                let pubId = filename.length >= 8 ? filename.substring(4, 8) : "";
                let avatarStr = filename.length > 8 ? filename.substring(8) : "";

                // Intercept our actual local player instance and capture their avatar metadata
                let isLocalPlayer = (iconId === window.playerItem && (pubId === window.playerId || !window.playerId));
                if (isLocalPlayer) {
                    window.playerAvatar = avatarStr;
                    continue; 
                }

                let labelText = typeof window.gfxItemID === 'function' ? window.gfxItemID(iconId) : iconId;
                
                let z = parseInt(zHex, this.gfxZBase);
                if (isNaN(z)) continue; 

                let x = z % this.gridWide;
                let y = Math.floor(z / this.gridWide);

                let fullDosPath = `${drive}:/${file.name.replace(/^\/+/, '')}`;
                this.buildSprite(iconId, x, y, z, labelText, fullDosPath, avatarStr);
            }
        }
        
        this.renderCursor();
    },

    buildSprite: function(iconId, x, y, z, labelText, fullPath, avatarStr) {
        const iconsLayer = document.getElementById('icons-layer');
        if (!iconsLayer) return;
        const self = this;
        
        let wrap = document.createElement('div');
        wrap.className = 'icon-wrap';
        
        wrap.setAttribute('data-z', z);
        wrap.setAttribute('data-path', fullPath);
        wrap.setAttribute('data-label', labelText);
        
        wrap.style.left = ((x / this.gridWide) * 100) + '%';
        wrap.style.top = ((y / this.gridTall) * 100) + '%';
        wrap.style.width = ((1 / this.gridWide) * 100) + '%';
        wrap.style.height = ((1 / this.gridTall) * 100) + '%';
        
        if (this.gfxGrid) {
            wrap.style.border = '1px dashed rgba(0, 255, 255, 0.4)';
            wrap.style.boxSizing = 'border-box';
        }
        
        let visualContainer = document.createElement('div');
        visualContainer.style.position = 'relative';
        visualContainer.style.width = '100%';
        visualContainer.style.height = '100%';
        visualContainer.style.display = 'flex';
        visualContainer.style.justifyContent = 'center';
        visualContainer.style.alignItems = 'center';
        
        let img = this.buildAvatarOrIcon(visualContainer, iconId, avatarStr);
        
        let lbl = document.createElement('div');
        lbl.className = 'icon-label';
        lbl.textContent = labelText;
        
        // Large Item Adjustment (T and U rows anchor their bottom-right to the visual layout)
        if (img && (iconId.charAt(0) === 'T' || iconId.charAt(0) === 'U')) {
            img.onload = function() {
                let tilesX = Math.round(this.naturalWidth / 32);
                let tilesY = Math.round(this.naturalHeight / 32);
                
                if (tilesX > 1 || tilesY > 1) {
                    wrap.style.width = ((tilesX / self.gridWide) * 100) + '%';
                    wrap.style.height = ((tilesY / self.gridTall) * 100) + '%';
                    wrap.style.left = (((x - tilesX + 1) / self.gridWide) * 100) + '%';
                    wrap.style.top = (((y - tilesY + 1) / self.gridTall) * 100) + '%';
                    
                    img.style.maxWidth = '100%';
                    img.style.maxHeight = '100%';
                    img.style.width = '100%';
                    img.style.height = '100%';
                    img.style.objectFit = 'fill';
                    
                    lbl.style.position = 'absolute';
                    lbl.style.bottom = '5px';
                }
            };
        }
        
        wrap.appendChild(visualContainer);
        wrap.appendChild(lbl);

        iconsLayer.appendChild(wrap);
    },

    renderCursor: function() {
        const iconsLayer = document.getElementById('icons-layer');
        if (!iconsLayer) return;
        
        let transTime = Math.max(0.05, (this.gfxCycle * 0.75) / 1000);

        let cursorEl = document.getElementById('gfx-sys-cursor');
        if (!cursorEl) {
            cursorEl = document.createElement('div');
            cursorEl.id = 'gfx-sys-cursor';
            cursorEl.style.position = 'absolute';
            cursorEl.style.pointerEvents = 'none'; 
            cursorEl.style.zIndex = '1000';
            cursorEl.style.display = 'flex';
            cursorEl.style.justifyContent = 'center';
            cursorEl.style.alignItems = 'center';
            iconsLayer.appendChild(cursorEl);
        }

        cursorEl.style.transition = `top ${transTime}s linear, left ${transTime}s linear`;

        let x = window.playerZ % this.gridWide;
        let y = Math.floor(window.playerZ / this.gridWide);

        cursorEl.style.left = ((x / this.gridWide) * 100) + '%';
        cursorEl.style.top = ((y / this.gridTall) * 100) + '%';
        cursorEl.style.width = ((1 / this.gridWide) * 100) + '%';
        cursorEl.style.height = ((1 / this.gridTall) * 100) + '%';
        
        cursorEl.innerHTML = '';
        this.buildAvatarOrIcon(cursorEl, window.playerItem, window.playerAvatar);
    },

    setCursorZ: function(newZ) {
        window.playerZ = newZ;
        this.renderCursor(); 
        
        let drive = this.currentPath.split(':')[0] || 'ram';
        this.persistState(`${drive}:/a/playerZ`, window.playerZ.toString());
    },

    calculateTargetSector: function(currentSector, dirChar, maxMapBounds, roundWorld) {
        if (!currentSector || currentSector.length < 2) return null;
        if (!maxMapBounds || maxMapBounds.length !== 2) maxMapBounds = 'Hh';

        let minY = 65; 
        let minX = 97; 
        let maxY = maxMapBounds.charCodeAt(0);
        let maxX = maxMapBounds.charCodeAt(1);

        let yCode = currentSector.charCodeAt(0);
        let xCode = currentSector.charCodeAt(1);

        if (dirChar === 'N') yCode -= 1;
        else if (dirChar === 'S') yCode += 1;
        else if (dirChar === 'E') xCode += 1;
        else if (dirChar === 'W') xCode -= 1;

        let wrapped = false;

        if (xCode < minX) { xCode = maxX; wrapped = true; }
        else if (xCode > maxX) { xCode = minX; wrapped = true; }

        if (yCode < minY) { yCode = maxY; wrapped = true; }
        else if (yCode > maxY) { yCode = minY; wrapped = true; }

        if (wrapped && !roundWorld) return null; 

        return String.fromCharCode(yCode) + String.fromCharCode(xCode);
    },

    moveCursor: function(dx, dy) {
        let x = window.playerZ % this.gridWide;
        let y = Math.floor(window.playerZ / this.gridWide);
        
        let nx = x + dx;
        let ny = y + dy;
        
        let dirChar = null;
        let triggersScroll = false;
        let moveBlocked = false;

        if (this.gfxAirLock) {
            if (dx > 0) {
                if (x === this.gridWide - 1) moveBlocked = true;
                else if (nx === this.gridWide - 1) { dirChar = 'E'; triggersScroll = true; }
            } else if (dx < 0) {
                if (x === 0) moveBlocked = true;
                else if (nx === 0) { dirChar = 'W'; triggersScroll = true; }
            }
            if (dy > 0) {
                if (y === this.gridTall - 1) moveBlocked = true;
                else if (ny === this.gridTall - 1) { dirChar = 'S'; triggersScroll = true; }
            } else if (dy < 0) {
                if (y === 0) moveBlocked = true;
                else if (ny === 0) { dirChar = 'N'; triggersScroll = true; }
            }
        } else {
            if (nx >= this.gridWide) { dirChar = 'E'; triggersScroll = true; }
            else if (nx < 0) { dirChar = 'W'; triggersScroll = true; }
            if (ny >= this.gridTall) { dirChar = 'S'; triggersScroll = true; }
            else if (ny < 0) { dirChar = 'N'; triggersScroll = true; }
        }

        let tentativeZ = ny * this.gridWide + nx;
        if (typeof window.gfxCollisionHook === 'function') {
            if (!window.gfxCollisionHook(tentativeZ, window.playerItem)) {
                moveBlocked = true;
            }
        }

        if (moveBlocked) {
            window.playerWalk = -1; 
            return;
        }

        if (triggersScroll && dirChar) {
            let parts = this.currentPath.split('/');
            let currentSector = parts[parts.length - 1];
            let driveBase = this.currentPath.substring(0, this.currentPath.lastIndexOf('/'));

            let nextSector = this.calculateTargetSector(currentSector, dirChar, this.gfxLowerBound, this.gfxRoundWorld);

            if (nextSector) {
                let targetZ;

                if (this.gfxAirLock) {
                    if (dirChar === 'E') targetZ = (ny * this.gridWide) + 0;
                    if (dirChar === 'W') targetZ = (ny * this.gridWide) + (this.gridWide - 1);
                    if (dirChar === 'S') targetZ = (0 * this.gridWide) + nx;
                    if (dirChar === 'N') targetZ = ((this.gridTall - 1) * this.gridWide) + nx;
                } else {
                    if (nx >= this.gridWide) nx = 0;
                    if (nx < 0) nx = this.gridWide - 1;
                    if (ny >= this.gridTall) ny = 0;
                    if (ny < 0) ny = this.gridTall - 1;
                    targetZ = (ny * this.gridWide) + nx;
                }

                window.playerWalk = -1; 
                this.currentPath = driveBase + '/' + nextSector;
                window.map = nextSector;
                this.setCursorZ(targetZ);

                let drive = driveBase.split(':')[0] || 'ram';
                this.persistState(`${drive}:/a/gfxSector`, nextSector);

                this.renderScreen();
                return;
            } else {
                window.playerWalk = -1;
                return; 
            }
        }

        if (nx < 0) nx = 0;
        if (nx >= this.gridWide) nx = this.gridWide - 1;
        if (ny < 0) ny = 0;
        if (ny >= this.gridTall) ny = this.gridTall - 1;
        
        let targetZ = ny * this.gridWide + nx;

        // Let UNIVAC or the server handle the filesystem update
        
        this.setCursorZ(targetZ);

        if (this.fillTileCode && typeof this.setTileAtCursor === 'function') {
            this.setTileAtCursor(this.fillTileCode);
        }
    },

    walkToZ: function(newZ, action = null) {
        window.playerWalk = newZ;
        window.playerDo = action;
        
        if (window.playerZ === window.playerWalk) {
            window.playerWalk = -1;
            if (window.playerDo) {
                if (typeof window.playerDo === 'function') window.playerDo();
                window.playerDo = null;
            }
        }
    },

    startCursorTick: function() {
        if (this.cursorInterval) clearInterval(this.cursorInterval);
        let safeCycle = Math.max(50, this.gfxCycle); 
        this.cursorInterval = setInterval(() => this.cursorTick(), safeCycle);
    },

    cursorTick: function() {
        if (window.playerWalk === -1) return;

        if (window.playerZ === window.playerWalk) {
            window.playerWalk = -1;
            if (window.playerDo) {
                if (typeof window.playerDo === 'function') window.playerDo();
                window.playerDo = null;
            }
            return;
        }

        let cx = window.playerZ % this.gridWide;
        let cy = Math.floor(window.playerZ / this.gridWide);
        let tx = window.playerWalk % this.gridWide;
        let ty = Math.floor(window.playerWalk / this.gridWide);

        let dx = tx - cx;
        let dy = ty - cy;

        let stepX = 0;
        let stepY = 0;

        if (Math.abs(dx) > Math.abs(dy)) {
            stepX = dx > 0 ? 1 : -1;
        } else if (Math.abs(dy) > Math.abs(dx)) {
            stepY = dy > 0 ? 1 : -1;
        } else {
            stepX = dx > 0 ? 1 : -1;
        }

        this.moveCursor(stepX, stepY);
    },

    executeCursor: function() {
        let z = window.playerZ;
        let x = z % this.gridWide;
        let y = Math.floor(z / this.gridWide);
        const wrapper = document.getElementById('desktop-wrapper');
        if (!wrapper) return;
        
        let rect = wrapper.getBoundingClientRect();
        let w = rect.width / this.gridWide;
        let h = rect.height / this.gridTall;
        let clientX = rect.left + (x + 0.5) * w;
        let clientY = rect.top + (y + 0.5) * h;
        
        this.showTargetMenu(z, clientX, clientY);
    },

    showTargetMenu: function(z, clientX, clientY) {
        if (!window.parent || !window.parent.CylonPopManager || typeof window.parent.CylonPopManager.showContextMenu !== 'function') return;

        let items = [];
        let iconWraps = document.querySelectorAll(`.icon-wrap[data-z="${z}"]`);
        
        iconWraps.forEach(wrap => {
            let labelText = wrap.getAttribute('data-label');
            let fullPath = wrap.getAttribute('data-path');
            if (labelText && fullPath) {
                items.push({
                    label: labelText,
                    action: () => this.walkToZ(z, () => this.showActionMenu(z, labelText, fullPath))
                });
            }
        });

        let x = z % this.gridWide;
        let y = Math.floor(z / this.gridWide);
        let parts = this.currentPath.split('/');
        let currentSector = parts[parts.length - 1];

        let addScroll = (dirChar, label, dx, dy) => {
            let nextSector = this.calculateTargetSector(currentSector, dirChar, this.gfxLowerBound, this.gfxRoundWorld);
            if (nextSector) {
                items.push({
                    label: label,
                    action: () => this.walkToZ(z, () => this.moveCursor(dx, dy))
                });
            }
        };

        if (y === 0) addScroll('N', 'Scroll North', 0, -1);
        if (y === this.gridTall - 1) addScroll('S', 'Scroll South', 0, 1);
        if (x === this.gridWide - 1) addScroll('E', 'Scroll East', 1, 0);
        if (x === 0) addScroll('W', 'Scroll West', -1, 0);
        
        items.push({
            label: 'Walk Here',
            action: () => this.walkToZ(z)
        });
        
        if (items.length === 1) {
            items[0].action();
            return;
        }
        
        let mockEvent = { clientX, clientY, view: window };
        window.parent.CylonPopManager.showContextMenu(mockEvent, items);
    },
    
    showActionMenu: function(z, labelText, fullPath) {
        if (!window.parent || !window.parent.CylonPopManager || typeof window.parent.CylonPopManager.showContextMenu !== 'function') return;
        let items = [];
        items.push({ label: 'Open ' + labelText, action: () => this.executeScript(fullPath) });
        if (this.enableFileMove) {
            items.push({ label: 'Move ' + labelText, action: () => {
                this.pendingMovePath = fullPath;
                if (window.parent && window.parent.print) window.parent.print('Select a destination tile to move this file.\n');
            }});
        }
        items.push({ label: 'Remove ' + labelText, action: () => this.removeScript(fullPath) });

        let x = z % this.gridWide;
        let y = Math.floor(z / this.gridWide);
        const wrapper = document.getElementById('desktop-wrapper');
        let rect = wrapper.getBoundingClientRect();
        let w = rect.width / this.gridWide;
        let h = rect.height / this.gridTall;
        
        let clientX = rect.left + (x + 0.5) * w;
        let clientY = rect.top + (y + 0.5) * h;
        let mockEvent = { clientX, clientY, view: window };
        window.parent.CylonPopManager.showContextMenu(mockEvent, items);
    },

    moveObjectToZ: async function(filePath, z) {
        const dos = window.parent && window.parent.CylonDOS ? window.parent.CylonDOS : window.CylonDOS;
        if (!dos || typeof dos.rename !== 'function') {
            if (window.parent && window.parent.print) window.parent.print('Cannot move file: DOS rename is unavailable.\n');
            return false;
        }
        const slash = filePath.lastIndexOf('/');
        const basename = filePath.substring(slash + 1);
        if (basename.length < 4) return false;
        const zText = Number(z).toString(this.gfxZBase || 10).padStart(2, '0');
        const newName = basename.substring(0, 2) + zText + basename.substring(4);
        if (newName === basename) {
            await this.renderScreen();
            return true;
        }
        const newPath = filePath.substring(0, slash + 1) + newName;
        try {
            if (await dos.exists(newPath)) {
                if (window.parent && window.parent.print) window.parent.print('That tile already contains a file with this name.\n');
                return false;
            }
            await dos.rename(filePath, newPath);
            await this.renderScreen();
            return true;
        } catch (err) {
            console.error('GFX move failed:', err);
            if (window.parent && window.parent.print) window.parent.print(`Move failed: ${String(err.message || err)}\n`);
            return false;
        }
    },

    executeScript: async function(filePath) {
        let scriptData = await window.qdosLoad(filePath);
        if (!scriptData) return;
        await window.CylonScript(scriptData);
        this.renderScreen();
    },
    
    removeScript: async function(filePath) {
        if (window.parent && window.parent.CylonDOS) {
            try {
                await window.parent.CylonDOS.delete(filePath);
                this.renderScreen();
            } catch(err) {}
        }
    },

        setTileAtCursor: async function(code) {
        let dos = window.parent && window.parent.CylonDOS ? window.parent.CylonDOS : window.CylonDOS;
        if (!dos) return;
        
        let tPath = `${this.currentPath}/m`; 
        let tData = "";
        try { tData = await dos.load(tPath); } catch (e) {}
        if (!tData) tData = "";
        // FIX: Strip spaces from existing data so we don't accidentally corrupt it
        tData = tData.replace(/\s+/g, '');


        let expectedLen = this.gridWide * this.gridTall * 2;
        if (tData.length < expectedLen) {
            let needed = (expectedLen - tData.length) / 2;
            if (needed > 0) tData += 'Za'.repeat(Math.ceil(needed));
        }

        if (!code) {
            let currentCode = tData.substring(window.playerZ * 2, window.playerZ * 2 + 2) || 'Za';
            if (this.gfxCommandLog && window.parent.print) {
                window.parent.print(`\n[.3]GFX Tile Engine: Tile at Cursor (${window.playerZ}) is [${currentCode}][.]\n`);
            }
            let html = `<div> ${currentCode} </div>`;
            if (window.parent && typeof window.parent.popHtm === 'function') {
                window.parent.popHtm(html, 'center');
            } else if (typeof window.pop === 'function') {
                window.pop(html, 'cursor');
            }
            return;
        }

        code = String(code).padEnd(2, 'a').substring(0, 2);
        let prefix = tData.substring(0, window.playerZ * 2);
        let suffix = tData.substring(window.playerZ * 2 + 2);
        tData = prefix + code + suffix;

        await this.persistState(tPath, tData);
        this.updateTileDOM(window.playerZ, code);
    },

    updateTileDOM: function(z, code) {
        const tilesLayer = document.getElementById('tiles-layer');
        if (!tilesLayer) return;
        
        let existing = document.getElementById(`gfx-tile-${z}`);
        
        if (code === 'Za') {
            if (existing) existing.remove();
            return;
        }
        
        if (existing) {
            existing.src = `${this.gfxTileDir}${code}.png`;
            existing.style.display = ''; 
        } else {
            let x = z % this.gridWide;
            let y = Math.floor(z / this.gridWide);

            let img = document.createElement('img');
            img.src = `${this.gfxTileDir}${code}.png`;
            img.onerror = function() { this.style.display = 'none'; };
            img.style.position = 'absolute';
            img.style.left = ((x / this.gridWide) * 100) + '%';
            img.style.top = ((y / this.gridTall) * 100) + '%';
            img.style.width = ((1 / this.gridWide) * 100) + '%';
            img.style.height = ((1 / this.gridTall) * 100) + '%';
            img.style.imageRendering = 'pixelated';
            img.id = `gfx-tile-${z}`;
            tilesLayer.appendChild(img);
        }
    },

    toggleGfxGrid: function(state) {
        this.gfxGrid = typeof state === 'boolean' ? state : !this.gfxGrid;
        this.renderScreen(); 
    }

};

window.CylonGFX.setupListeners(); 

window.qdosLoad = async function(filename) {
    let dos = window.parent && window.parent.CylonDOS ? window.parent.CylonDOS : window.CylonDOS;
    if (!dos) throw new Error("CylonDOS not available");
    let driveName = filename.split(':')[0];
    if (!driveName || driveName === filename) driveName = dos.mountedDrive;
    let mounts = await dos.mounts();
    let targetMount = mounts.find(m => m.name === driveName);
    
    if (targetMount && targetMount.type === 'idb') {
        throw new Error("SECURITY EXCEPTION: GFX Engine cannot access IndexedDB drives.");
    }
    return await dos.load(filename);
};
