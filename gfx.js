window.GFX = 0; // set to true when gfx.js ready to use

window.gfxDrive = ''; // current drive context; set by gfxCreation / gfxGameState
window.gfxDo = "RF";     // Default refresh command
window.gfxPong = "..";   // server response
window.gfxSession = null;
window.gfxConnected = null;

var _serverUrl = 'http://localhost:8080/qandyland.js';
var _serverUrl = 'https://qandy.onrender.com/qandyland.js';

var mapx=7;
var mapy=11;

window.playerItem="Za";   // item-id of team item player has claimed (Sa Sb Sc Sd or Za for 'nothing')
window.playerZ=-1;        // z-locatin of playerItem
window.playerAvatar = ""; // players avatar (ie "B0D0")
window.playerInven = "";  // inventory
window.playerId = "";     // unique 4 character player id
window.playerWalk = -1;   // z-location player clicks to walk to, -1 = standing still
window.playerDo = "";     // command to send server when player reaches destination
  
window.map="A1";          // map player-item is on
window.mapTiles=[];       // tiles on player's current map
window.mapExits=[];       // valid exits for map sectors
window.mapObjs=[];        // objs on map sectors
window.mapItems;          // items on player's current map

var gfxInterval = null;  // The 1-second loop

// Initialization state tracking
window._gfxInitialized = false;
window._gfxInitializing = false;
window._gfxInitQueue = []; // Pending callbacks waiting for initialization

window.gfxInit = async function() {
	
  if (window._gfxInitialized) { return; }
  if (window._gfxInitializing) {
    // Queue a promise that resolves when current initialization completes
    return new Promise(function(resolve) { window._gfxInitQueue.push(resolve); });
  }
  window._gfxInitializing = true;
  try {
    await qdosScript('gfx-itemid.js');
    // inject the tiles
    // Use the host's map dimensions, but the tile count is mapx+1, mapy+1
    const tileCountX = (typeof mapx !== 'undefined') ? mapx + 1 : 7;
    const tileCountY = (typeof mapy !== 'undefined') ? mapy + 1 : 11;

    let topOffset = 50;
    let leftOffset = 54;

    // remove any existing tiles
    let cleanupIndex = 0;
    while (true) {
      const old = document.getElementById('T' + cleanupIndex);
      if (!old) break;
      old.parentNode && old.parentNode.removeChild(old);
      cleanupIndex++;
    }
    // create tiles: 0 to mapx = mapx+1 tiles, 0 to mapy = mapy+1 tiles
    for (let z=0, y=0; y < tileCountY; y++) {
      for (let x=0; x < tileCountX; x++, z++) {
        const t=document.createElement('img');
        t.id = 'T' + z;
        t.src = 't/Ga.png';
        t.style.height = '32px';
        t.style.width = '32px';
        t.className = 'tile';
        t.style.position = 'absolute';
        t.style.top = (topOffset + y * 32) + 'px';
        t.style.left = (leftOffset + x * 32) + 'px';
        t.style.zIndex = '10';
        const tileZ = z;
        t.onclick = function() { gfxZClick(tileZ, t); };
        document.body.appendChild(t);
      }
    }
    window._gfxInitialized = true;
  } catch(e) {
    console.error('Error: gfxInit()', e);
  } finally {
    window._gfxInitializing = false;
    // Resolve all queued callers
    var queue = window._gfxInitQueue.splice(0);
    for (var i = 0; i < queue.length; i++) { queue[i](); }
  }

  document.body.appendChild(popup);
  // move txt screen over to reveal gfx
  document.getElementById('txt').style.top = '50px';
  document.getElementById('txt').style.left = '350px';
}

window.gfxConnect = async function(serverIndex) {
  // hard coded for development
  server = { host: 'localhost', port: 8080 };
  _serverUrl = "http://" + server.host + ":" + server.port + "/qandyland.js";

  try {
    await gfxFetchMap(gfxDrive);
  } catch (e) {
    await print("Error: " + e.message + "\n\n");
    dosExit();
    return;
  }
  
  var res = await gfxPing("ST");
  console.log(res); // gfx.js:106 STDSFVvmtmngogRFA100

  if (res.startsWith("ST")) {
    window.gfxSession = res.substring(2);
    await gfxInit();
    gfxTiles(map);
    gfxObjects(map);
    window.gfxTimeout = setTimeout(gfxTick, 1000);
    return;
  }

  await print("Error: No session token\n\n");
  dosExit;
};

window.gfxTiles = function(sector) {
  var a = 0;
  var scr = window.mapTiles[sector];
  if (!scr) { console.error("Sector " + sector + " not found in memory!"); return; }
  for (var b = 0; b <= mapy; b++) { 
    for (var c = 0; c <= mapx; c++) {
      document.getElementById("T" + a).src = "t/" + scr.charAt(a * 2) + scr.charAt((a * 2) + 1) + ".png";
      a++;
    }
  }
}

window.gfxChar = function(charID, avatarStr, zPos) {
  const y = Math.floor(zPos / (mapx + 1));
  const x = zPos % (mapx + 1);
  const topPos = (32 + 22 + (y - 1) * 32) + "px";
  const leftPos = (32 + 22 + x * 32) + "px";

  // --- Handle overlays and modifiers (-[itemId] and -[register%]) ---
  let overlayId = null;
  let registerVal = null;
  let originalAvatarStr = avatarStr;

  while (true) {
    // 1. Check for tag register meter (-00 to -99)
    const regMatch = avatarStr.match(/\-([0-9]{2})$/);
    if (regMatch) {
      registerVal = parseInt(regMatch[1], 10);
      avatarStr = avatarStr.substring(0, avatarStr.length - 3);
      continue;
    }
    
    // 2. Check for one-shot item overlay (Requires upper-case first character)
    const itemMatch = avatarStr.match(/\-([A-Z][A-Za-z0-9])$/);
    if (itemMatch) {
      overlayId = itemMatch[1];
      avatarStr = avatarStr.substring(0, avatarStr.length - 3);
      continue;
    }
    
    // Break ensures the loop safely exits when no more modifiers exist
    break; 
  }

  // Strip modifiers from the source string so this block only fires once per event
  if (originalAvatarStr !== avatarStr) {
    if (charID === window.playerItem) {
      window.playerAvatar = avatarStr;
    }
    if (window.movingItems && window.movingItems[charID]) {
      window.movingItems[charID].avatar = avatarStr;
    }
  }

  // 1. Render One-Shot Item Overlay (-XX)
  if (overlayId) {
    const overlayDomId = "cOverlay" + charID;
    let overlayEl = document.getElementById(overlayDomId);
    if (!overlayEl) {
      overlayEl = document.createElement("img");
      overlayEl.id = overlayDomId;
      overlayEl.className = "char";
      overlayEl.style.position = "absolute";
      overlayEl.style.height = "32px";
      overlayEl.style.width = "32px";
      overlayEl.style.zIndex = "160"; // above hat/sword/shield
      document.body.appendChild(overlayEl);
    }
    overlayEl.src = "i/" + overlayId + ".png";
    overlayEl.style.top = (parseInt(topPos, 10) - 32) + "px"; // one tile above the head
    overlayEl.style.left = leftPos;
    overlayEl.style.display = "block";

    // Auto-remove after .8s
    if (overlayEl.hideTimeout) clearTimeout(overlayEl.hideTimeout);
    overlayEl.hideTimeout = setTimeout(function() {
      overlayEl.style.display = "none";
    }, 800);
  }

  // 2. Render Tag Register Meter (-##)
  const meterDomId = "cMeter" + charID;
  let meterEl = document.getElementById(meterDomId);

  if (registerVal !== null) {
    if (!meterEl) {
      meterEl = document.createElement("div");
      meterEl.id = meterDomId;
      meterEl.className = "char"; // Standard cleanup using gfxRefresh
      meterEl.style.position = "absolute";
      meterEl.style.height = "6px";
      meterEl.style.width = "32px";
      meterEl.style.zIndex = "165"; 
      
      const greenBar = document.createElement("img");
      greenBar.id = meterDomId + "_g";
      greenBar.src = "i/Zn.png";
      greenBar.style.position = "absolute";
      greenBar.style.height = "6px";
      greenBar.style.left = "0px";
      greenBar.style.top = "0px";
      
      const redBar = document.createElement("img");
      redBar.id = meterDomId + "_r";
      redBar.src = "i/Zm.png";
      redBar.style.position = "absolute";
      redBar.style.height = "6px";
      redBar.style.top = "0px";
      
      meterEl.appendChild(greenBar);
      meterEl.appendChild(redBar);
      document.body.appendChild(meterEl);
    }
    
    meterEl.style.top = (parseInt(topPos, 10) - 8) + "px"; // 8 pixels above character head
    meterEl.style.left = leftPos;
    meterEl.style.display = "block";
    
    // Calculate widths (Using floor leaves a thin 1px red sliver at 99%)
    const greenWidth = Math.floor(32 * (registerVal / 100));
    const redWidth = 32 - greenWidth;
    
    const greenBar = document.getElementById(meterDomId + "_g");
    const redBar = document.getElementById(meterDomId + "_r");
    
    if (greenBar && redBar) {
      greenBar.style.width = greenWidth + "px";
      redBar.style.width = redWidth + "px";
      redBar.style.left = greenWidth + "px"; // Red starts exactly where green ends
    }
  } else if (meterEl) {
    // Hide it if the register state clears but the user remains rendered
    meterEl.style.display = "none";
  }

  // 3. Render base components (Reordered: Bottom layer first, top layer last)
  const partOrder = ['body', 'head', 'hat', 'sword', 'shield'];
    
  const idPrefixes = { 
    body: 'b',   // Base layer
    head: 'f',   // Face sits on body
    hat: 'h',    // Hat sits on head
    sword: 's',  // Weapon
    shield: 'a'  // Shield/Armor outermost
  };

  const currentParts = { body: null, head: null, hat: null, sword: null, shield: null };
  
  const typeMap = {
    'A': 'head', 'B': 'head', 'E': 'head', 'F': 'head',
    'C': 'body', 'D': 'body', 'G': 'body', 'H': 'body',
    'I': 'hat',  'J': 'hat',  'K': 'hat',  'L': 'hat',
    'M': 'sword', 'N': 'sword',
    'O': 'shield', 'P': 'shield'
  };

  for (let i = 0; i < avatarStr.length; i += 2) {
    const partCode = avatarStr.substring(i, i + 2);
    const type = typeMap[partCode.charAt(0)];
    if (type && !currentParts[type]) {
      currentParts[type] = partCode;
    }
  }

  partOrder.forEach((type, index) => {
    const partCode = currentParts[type];
    const domId = "c" + idPrefixes[type] + charID; 
    let el = document.getElementById(domId);

    if (partCode) {
      if (!el) {
        el = document.createElement("img");
        el.id = domId;
        el.className = "char";
        el.style.position = "absolute";
        el.style.height = "64px";
        el.style.width = "32px";
        el.onclick = function() { gfxZClick(zPos); };
        document.body.appendChild(el);
      }
      
      el.src = "c/" + partCode + ".png";
      el.style.top = topPos;
      el.style.left = leftPos;
      // Body is 150, Head is 151, Hat is 152, etc.
      el.style.zIndex = 150 + index; 
      el.style.display = "block";
    } else if (el) {
      el.style.display = "none";
    }
  });
}

async function gfxTick() {
  // send plugs to qandyland.js plugboard() for UNIVAC processing
  if (window.gfxTimeout) clearTimeout(window.gfxTimeout);
  // try {
  	if (gfxDo === "") { window.gfxDo = "RF"; }
  	plugs=gfxDo;
  	gfxDo=""; // reset for next tick

    // no plugs work in 'look' mode, must exit look mode to get/use items    
    if (typeof isLooking !== 'undefined' && isLooking === true) { 
      plugs = "Vl"; 
      window.gfxDo = "Vl"; 
    }

    console.log("plugs="+plugs);
    var gfxPong = await gfxPing(plugs);
    console.log("gfxPong="+gfxPong);

    // Ensure we received a valid string before processing
    if (typeof gfxPong === 'string') {
      let ptr = 0;
      while (ptr < gfxPong.length) {
        let verb = gfxPong.substring(ptr, ptr + 2); ptr += 2;

        if (verb === "S^") {
          let endPtr = gfxPong.indexOf("^S", ptr);
          let noun="";
          if (endPtr !== -1) {
            noun = gfxPong.substring(ptr, endPtr); ptr = endPtr + 2; 
          } else {
            noun = gfxPong.substring(ptr); ptr = gfxPong.length;
          }
          if (typeof window.serverdown === 'function') { serverdown(noun); }
        }

        if (verb === "PI") {
          // Read player-item results: [playerItem 2][playerZ 2][playerId 4]
          window.playerItem = gfxPong.substring(ptr, ptr + 2); ptr += 2;
          window.playerZ    = parseInt(gfxPong.substring(ptr, ptr + 2), 10); ptr += 2;
          window.playerId   = gfxPong.substring(ptr, ptr + 4); ptr += 4;
          console.log("playerItem=" + window.playerItem + " playerZ=" + window.playerZ
            + " playerId=" + window.playerId + " avatar=" + window.playerAvatar);
        }

        // 2. Handle Refresh (Variable-Length Command)
        if (verb === "RF") {
          let noun = gfxPong.substring(ptr); 
          gfxRefresh(noun); 
          ptr = gfxPong.length; // no more commands after RF
        }
        
        if (verb === "Vi") {
          // get player inventory data
          let endPtr = gfxPong.indexOf("--", ptr);
          if (endPtr !== -1) {
            window.playerInven = gfxPong.substring(ptr, endPtr);
            ptr = endPtr + 2; // Advance pointer past the "--" terminator
          } else {
            // Fallback just in case the string is malformed
            window.playerInven = gfxPong.substring(ptr);
            ptr = gfxPong.length; 
          }
        }

        // 3. Handle Look Mode (Variable-Length Command)
        if (verb === "Vl") {
        	 console.log("###308### gfxPong="+gfxPong);
          window.isLooking = true; 
          let myMap = gfxPong.substring(ptr, ptr + 2);
          let myZ = gfxPong.substring(ptr + 2, ptr + 4);
          let playerData = gfxPong.substring(ptr + 4); 
          window.gfxRenderGlobalCanvas(myMap, myZ, playerData);
          ptr = gfxPong.length; // no more commands after RF
        }
      }
    }
  // } catch (e) { 
  //   console.error('Server tick error:', e); 
  // }

  window.gfxTimeout = setTimeout(gfxTick, 1000);
  if (!window.gfxVisualInterval) {
    window.gfxVisualInterval = setInterval(window.gfxVisualTick, 200);
  }
}

window.gfxPing = async function(commandString) {
  if (!commandString || commandString.length < 2) throw new Error('gfxPing: invalid command');

  // Queville Style: Create form data
  var formData = new URLSearchParams();
  formData.append('c', commandString);      // 'c' for Command (e.g., "RF")
  formData.append('d', window.gfxDrive);    // 'd' for Drive
  if (window.gfxSession) {
    formData.append('s', window.gfxSession); // 's' for Session
  }

  try {
    var response = await fetch(_serverUrl, {
      method: 'POST',
      headers: { 
        // This is the key "Queville" header
        'Content-Type': 'application/x-www-form-urlencoded' 
      },
      body: formData.toString() // formatted as: c=RF&d=capflag.gfx&s=xyz
    });

    if (!response.ok) throw new Error('Server error: ' + response.status);
    
    var resText = await response.text();
    return resText;
  } catch (e) {
    console.error('gfxPing failed:', e);
    throw e;
  }
} 

window.gfxVisualTick = function() {
    if (!window.movingItems) window.movingItems = {};
    for (var iId in window.movingItems) {
        var mi = window.movingItems[iId];
        if (mi.queue.length > 0) {
            var move = mi.queue.shift();
            mi.z = window.moveZ(mi.z, move);

            if (iId === window.playerItem) {
                window.playerZ = mi.z;
                gfxChar(iId, window.playerAvatar, window.playerZ);
            } else {
                if (mi.avatar) gfxChar(iId, mi.avatar, mi.z);
            }
        }
    }
    
    if (playerWalk > -1) {
    	// if player is walking, let client know it is time to take next step
    	walkdown();
    }
    
}

var tiles = [];

async function gfxFetchMap(filename) {
  filename = filename || "capflag.gfx";
  try {
    await print("Loading " + filename + "...\n");
    
    var gfxContent = await qdosLoad(filename);
    if (!gfxContent) { throw new Error("Failed to load " + filename); }

    var lines = gfxContent.split('\n').filter(line => line.trim());
    window.gfxSectorData = {}; // Clear existing data
    
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;
      
      var eqIdx = line.indexOf('=');
      if (eqIdx < 0) continue;
      
      var sectorId = line.substring(0, eqIdx);
      var rest = line.substring(eqIdx + 1);
      var dotIdx = rest.indexOf('.');
      var mapData = dotIdx >= 0 ? rest.substring(0, dotIdx) : rest;
      var rawObjData = dotIdx >= 0 ? rest.substring(dotIdx + 1) : '';
      
      // Parse entries to separate static objects from dynamic items
      var filteredObjs = [];
      if (rawObjData) {
        var entries = rawObjData.split('~');
        for (var j = 0; j < entries.length; j++) {
          var entry = entries[j].trim();
          if (!entry) continue;
          
          // Split off the server-side punch code (after the colon) to check base length
          var basePart = entry.split('|')[0];
          
          // Static objects have a base length of 6 (item-id + item-z + item-data)
          if (basePart.length === 6) {
            filteredObjs.push(entry);
          }
        }
      }
      
      mapTiles[sectorId] = mapData.substring(0, 192); 
      mapExits[sectorId] = mapData.substring(192); 
      mapObjs[sectorId] = filteredObjs.join('~'); 
    }
    return true;
    
  } catch (e) {
    await print("Error loading " + filename + ": " + e.message + "\n");
    return false;
  }
}

window.gfxObjects = function(sector) {
  var objsStr = window.mapObjs[sector];
  var oldObjs = document.querySelectorAll('.objs');
  for (var k = 0; k < oldObjs.length; k++) { 
    if (oldObjs[k].parentNode) { oldObjs[k].parentNode.removeChild(oldObjs[k]); }
  }

  console.log("objsStr="+objsStr);
   
  if (objsStr) {
    // NEW: Split by comma for variable length objects
    var objects = objsStr.split('~');

    for (var i = 0; i < objects.length; i++) {
      var entry = objects[i].trim();
      if (!entry) continue;

      // Split metadata from bytecode (if present)
      // bytecode is not saved in gfxFetchMap(), there will be no ':' found
      var parts = entry.split('|');
      var objid = parts[0]; // e.g., "Yj44Sa"
      var objcode = parts[1];

      var iId = objid.slice(0, 2);
      var zStr = objid.slice(2, 4);
      var z = parseInt(zStr, 10);
      var data = objid.slice(4, 6);
      
      var coords = zToXY(z);
      var img = document.createElement('img');
      img.id = 'obj_' + iId + '_' + z; 
      img.className = 'objs';
      img.src = 'i/' + iId + '.png';
      
      // Store exact data tracking properties so marker updates find and read them cleanly!
      img.setAttribute('data-orig-id', iId);
      img.setAttribute('data-id', iId);
      img.setAttribute('data-z', z);
      img.setAttribute('data-zstr', zStr);
      
      img.style.position = 'absolute';
      img.style.top = (32 + 20 + (coords.y * 32)) + "px";
      img.style.left = (32 + 22 + (coords.x * 32)) + "px";
      img.style.zIndex = '110'; 

      // Adjustment logic for large items (Flagpoles, Buildings)
      img.onload = function() {
        var currentId = this.getAttribute('data-id');
        if (currentId.charAt(0) === "T" || currentId.charAt(0) === "U") {
          var baseTop = 32 + 20 + (zToXY(parseInt(this.getAttribute('data-z'), 10)).y * 32);
          var baseLeft = 32 + 22 + (zToXY(parseInt(this.getAttribute('data-z'), 10)).x * 32);
          this.style.top = (baseTop - this.height + 32) + "px";
          this.style.left = (baseLeft - this.width + 32) + "px";
        }
      }

      // Note: We leave onclick static here because gfxZClick now polls the DOM dynamically for exact z location!
      img.onclick = (function(capturedZ) {
        return function() { gfxZClick(parseInt(this.getAttribute('data-z'), 10), this); };
      })(z);
      document.body.appendChild(img);
    }
  }
}

function zToXY(z) {
 var y = Math.floor(z / (mapx + 1));
 var x = z - (y * (mapx + 1));
 return { x: x, y: y };
}

function gfxRefresh(rfStr) {
  window.isLooking = false; // Receiving a standard RF turns off Look Mode
  if (window.lookCanvas) window.lookCanvas.style.display = 'none';
	
  const oldItems = document.querySelectorAll('.item');
  for (let i = 0; i < oldItems.length; i++) { oldItems[i].remove(); }
  const oldChars = document.querySelectorAll('.char');
  for (let i = 0; i < oldChars.length; i++) { oldChars[i].remove(); }

  if (window.map != rfStr.substring(0, 2)) {
    // load new map sector
    var oldObjs = document.querySelectorAll('.objs');
    for (var k = 0; k < oldObjs.length; k++) { 
        if (oldObjs[k].parentNode) { oldObjs[k].parentNode.removeChild(oldObjs[k]); }
    }
    window.map = rfStr.substring(0, 2);
    gfxTiles(map);   
    gfxObjects(map); 
  }
  	
  var serverPlayerZ = rfStr.length >= 4 ? parseInt(rfStr.substring(2, 4), 10) : NaN;
  var items = rfStr.length >= 4 ? rfStr.substring(4) : '';
  mapItems = items;
  window.items = items.split('~');

  var oldPlayerQueue = [];
  if (window.movingItems && window.movingItems[window.playerItem]) {
      oldPlayerQueue = window.movingItems[window.playerItem].queue;
  }

  // Use authoritative server z when no local movement is in-flight.
  var resolvedPlayerZ = (!isNaN(serverPlayerZ) && oldPlayerQueue.length === 0)
      ? serverPlayerZ
      : window.playerZ;

  window.movingItems = {};
  if (window.playerItem && window.playerItem !== "Za") {
      window.movingItems[window.playerItem] = { z: resolvedPlayerZ, queue: oldPlayerQueue, avatar: window.playerAvatar };
  }

  for (var j = 0; j < window.items.length; j++) {
    var entry = window.items[j];
    if (!entry || entry.length < 4) continue;
    var iId = entry.slice(0, 2);

    // --- PUNCH CODE MARKER INTERCEPTION ---
    // --- PUNCH CODE MARKER INTERCEPTION ---
    if (iId.charAt(0) === 'V' || iId.charAt(0) === 'X') {
        var param1 = entry.substring(2, 4);
        var param2 = entry.substring(4, 6);
        
        switch (iId) {
            case 'Vx': {
                var objEl = document.querySelector('.objs[data-orig-id="' + param1 + '"]');
                if (objEl) {
                    objEl.setAttribute('data-id', param2);
                    objEl.src = 'i/' + param2 + '.png'; // Triggers onload resizing for large items
                }
                break;
            }
            case 'Vy': {
                var objEl = document.querySelector('.objs[data-orig-id="' + param1 + '"]');
                if (objEl) {
                    var newZ = parseInt(param2, 10);
                    var coords = zToXY(newZ);
                    objEl.setAttribute('data-z', newZ);
                    objEl.setAttribute('data-zstr', param2);
                    
                    // Reposition (onload will take over logic if it's a large item)
                    var baseTop = 32 + 20 + (coords.y * 32);
                    var baseLeft = 32 + 22 + (coords.x * 32);
                    var currentId = objEl.getAttribute('data-id');
                    
                    if (currentId.charAt(0) === 'T' || currentId.charAt(0) === 'U') {
                        baseTop -= (objEl.height - 32);
                        baseLeft -= (objEl.width - 32);
                    }
                    
                    objEl.style.top = baseTop + "px";
                    objEl.style.left = baseLeft + "px";
                }
                break;
            }
            case 'Xz': {
                var targetZ = parseInt(param1, 10);
                var tileCode = param2;
                
                // 1. Update the DOM visually
                var tileEl = document.getElementById("T" + targetZ);
                if (tileEl) {
                    tileEl.src = "t/" + tileCode + ".png";
                }
                
                // 2. Update the client map cache so it persists if the sector redrawn
                var mapData = window.mapTiles[window.map];
                if (mapData) {
                    var charIdx = targetZ * 2;
                    while (mapData.length < charIdx + 2) mapData += 'Ga'; // Safety pad
                    window.mapTiles[window.map] = mapData.substring(0, charIdx) + tileCode + mapData.substring(charIdx + 2);
                    
                    // Invalidate the look canvas cache so it redraws the updated tile if viewed
                    if (window.terrainCache) { window.terrainCache = null; }
                }
                break;
            }
        }
        continue; // Skip normal item rendering logic for this marker
    }

    var destZ = parseInt(entry.slice(2, 4), 10);
    if (isNaN(destZ)) continue;
    
    var rawAvatar = entry.length > 4 ? entry.slice(4) : '';
    var uid = '';
    var avatar = rawAvatar;

    // 1. EXTRACT 4-CHARACTER UNIQUE ID
    if (rawAvatar.length >= 4) {
      // Read backwards to find valid avatar parts (A-P followed by 0-9, or Q moves)
      var avatarMatch = rawAvatar.match(/(([A-P][0-9])|(Q[nsew]))*$/);
      if (avatarMatch && avatarMatch[0].length < rawAvatar.length) {
        var prefix = rawAvatar.substring(0, rawAvatar.length - avatarMatch[0].length);
        if (prefix.length === 4) {
          uid = prefix; // We successfully isolated the 4-char UID
          avatar = avatarMatch[0];
        } else if (rawAvatar.length >= 6) {
          // Fallback split just in case the format varies
          uid = rawAvatar.substring(0, 4);
          avatar = rawAvatar.substring(4);
        }
      }
    }

    // Combine item-id and uid to uniquely track players in the client DOM
    var uniqueIId = uid ? iId + uid : iId;
    var moves = [];
    
    var isLocalPlayer = (uniqueIId === window.playerItem) || 
                        (iId === window.playerItem && (!uid || uid === window.playerId));

    // 2. EXTRACT MOVEMENT HISTORY (Must be done AFTER UID extraction)
    var qIdx = avatar.indexOf('Q');
    if (qIdx > -1) {
        var historyStr = avatar.substring(qIdx);
        avatar = avatar.substring(0, qIdx);
        moves = historyStr.match(/Q[nsew]/g) || []; 
    }

    // Match local player (supports old 2-char matching and new 6-char matching)
    // var isLocalPlayer = (uniqueIId === window.playerItem) || (iId === window.playerItem);

    if (isLocalPlayer) {
      window.playerAvatar = avatar;
      window.playerZ = resolvedPlayerZ;
      
      // Auto-upgrade the client's player item string to use the Unique ID 
      // so other players sharing this base item-id don't overwrite our local player.
      if (window.playerItem === iId && uid) {
          window.playerItem = uniqueIId;
          if (window.movingItems[iId]) {
              window.movingItems[uniqueIId] = window.movingItems[iId];
              delete window.movingItems[iId];
          }
      }

      if (!window.movingItems[uniqueIId]) {
          window.movingItems[uniqueIId] = { z: resolvedPlayerZ, queue: oldPlayerQueue, avatar: window.playerAvatar };
      } else {
          window.movingItems[uniqueIId].z = resolvedPlayerZ;
      }
      
      gfxChar(uniqueIId, avatar, window.playerZ);
    } else {
      if (avatar) {
        var startZ = destZ;
        for (var k = moves.length - 1; k >= 0; k--) {
            startZ = window.reverseMoveZ(startZ, moves[k]);
        }
        if (moves.length > 0) {
            window.movingItems[uniqueIId] = { z: startZ, destZ: destZ, queue: moves, avatar: avatar };
            gfxChar(uniqueIId, avatar, startZ);
        } else {
            gfxChar(uniqueIId, avatar, destZ);
        }
      } else {
        var coords = zToXY(destZ);
        var img = document.createElement('img');
        img.className = 'item';
        img.id = 'itm_' + iId + '_' + destZ;   // <-- ADD THIS LINE
        img.src = 'i/' + iId + '.png'; // Base item-id is still used for non-avatar files
        img.style.position = 'absolute';
        img.style.top  = (32 + 20 + (coords.y * 32)) + 'px';
        img.style.left = (32 + 22 + (coords.x * 32)) + 'px';
        img.style.zIndex = '120'; 
        img.onclick = (function(capturedZ) { return function() { gfxZClick(capturedZ, this); }; })(destZ);
        document.body.appendChild(img);
      }
    }
  }
}

window.isLooking = false;
window.terrainCache = null;
window.lastKnownSectors = "";

window.gfxRenderGlobalCanvas = function(myMap, myZ, playerData) {
  // 1. Setup Constants and Canvas
  const sectorsY = "ABCDEFGH".split("");
  
  // Split the data: [0] is the CSV player list, [1] is the visible sectors string
  const parts = playerData.split('|');
  const pCSV = parts[0];
  const knownSectors = parts[1] || ""; 

  if (window.lastKnownSectors !== knownSectors) {
    window.terrainCache = null;
    window.lastKnownSectors = knownSectors;
  }

  if (!window.lookCanvas) {
    window.lookCanvas = document.createElement('canvas');
    window.lookCanvas.id = 'lookCanvas';
    window.lookCanvas.width = 256; 
    window.lookCanvas.height = 384;
    window.lookCanvas.style.position = 'absolute';
    window.lookCanvas.style.top = '50px';
    window.lookCanvas.style.left = '54px';
    window.lookCanvas.style.zIndex = '1000';
    document.body.appendChild(window.lookCanvas);
  }
    
  window.lookCanvas.style.display = 'block';
  const ctx = window.lookCanvas.getContext('2d');

  // Fill main canvas with black first, so the normal map doesn't show through transparent areas
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, window.lookCanvas.width, window.lookCanvas.height);

  // Helper function to draw players accurately
  function drawPlayers() {
    if (!pCSV) return;
    const pList = pCSV.split('~');
    pList.forEach(p => {
      if (p.length < 6) return;
      const id = p.substring(0, 2);
      const sec = p.substring(2, 4);
      const z = parseInt(p.substring(4, 6), 10);
      
      const sy = sec.charCodeAt(0) - 65; // 'A' -> 0
      const sx = sec.charCodeAt(1) - 97; // 'a' -> 0
      
      if (sy < 0 || sy > 7 || sx < 0 || sx > 7) return;

      const tx = z % 8; const ty = Math.floor(z / 8);

      if (id.charAt(0) === 'S') ctx.fillStyle = '#00FFFF';
      else if (id.charAt(0) === 'T') ctx.fillStyle = '#FF00FF';
      else ctx.fillStyle = '#FFFFFF';

      // Use startsWith to ensure players remain highlighted even if client adds unique IDs
      if (window.playerItem && window.playerItem.startsWith(id)) {
          ctx.fillStyle = '#FFFF00';
          ctx.fillRect((sx * 32) + (tx * 4) - 1, (sy * 48) + (ty * 4) - 1, 6, 6);
      } else {
          ctx.fillRect((sx * 32) + (tx * 4), (sy * 48) + (ty * 4), 4, 4);
      }
    });
  }

  // 2. Pre-render Terrain Cache if missing
  if (!window.terrainCache) {
    window.terrainCache = document.createElement('canvas');
    window.terrainCache.width = 256;
    window.terrainCache.height = 384;
    const tCtx = window.terrainCache.getContext('2d');

    // Pre-fill terrain cache with black initially
    tCtx.fillStyle = '#000000';
    tCtx.fillRect(0, 0, 256, 384);

    for (let sy = 0; sy < 8; sy++) {
      for (let sx = 0; sx < 8; sx++) {
        // Corrected sector generation ('a' -> 97)
        const sectorId = sectorsY[sy] + String.fromCharCode(97 + sx);
        
        // Only load and draw tiles if we have terrain data AND it is a known sector
        const data = window.mapTiles[sectorId];
        if (!data || !knownSectors.includes(sectorId)) {
          continue;
        }

        for (let t = 0; t < 96; t++) {
          const tileId = data.substring(t * 2, t * 2 + 2);
          if (tileId === 'Qf') continue; // Optimize: 'Qf' (Fog/Black) is already filled
          
          const tx = t % 8; const ty = Math.floor(t / 8);
          const img = new Image();
          img.src = 'm/' + tileId + '.png';
          
          // Render individually as they are fetched
          img.onload = function() {
            tCtx.drawImage(img, (sx * 32) + (tx * 4), (sy * 48) + (ty * 4));
            // Draw to the active view directly to stop visually lagging loads
            if (window.isLooking) {
              ctx.drawImage(img, (sx * 32) + (tx * 4), (sy * 48) + (ty * 4));
              drawPlayers(); // Redraw players so they aren't hidden under fresh tiles
            }
          }
        }
      }
    }
  }

  // 3. DRAWING PHASE
  // A. Draw full terrain cache
  ctx.drawImage(window.terrainCache, 0, 0);

  // B. Draw Players initially
  drawPlayers();
};

window.gfxGameState = async function(drive) {
// Query game state and player manifest for a drive.
// Returns the raw retro response string: e.g. "JSSa.Sb.Sc.Ta.Tb.Tc"
//   state prefix: JS = just starting (no active players), IP = in progress
//   each dot-separated slot: <playerCode><mapId><avatarData> if occupied, <playerCode> if empty
  if (drive) gfxDrive = drive;
  return await gfxPing("GS");
}

function gfxClick(bytecode) {
  console.log("gfxClick() bytecode="+bytecode);
  var type = bytecode.substring(0, 2); // ZD, ID, OD, VA
  var data = bytecode.substring(2);    // Remainder of the code
  console.log("gfxClick() data="+data);
  
  switch (type) {
    case "ZD": // Z-Down
      if (typeof window.zdown === 'function') window.zdown(parseInt(data, 10));
      break;
    
    case "IN": // Inventory-Down (Dynamic)
      if (typeof window.invdown === 'function') window.invdown(data);
      break;
    
    case "ID": // Item-Down (Dynamic)
      if (typeof window.itemdown === 'function') window.itemdown(data);
      break;

    case "OD": // Object-Down (Static)
      if (typeof window.objdown === 'function') window.objdown(data);
      break;

    case "VA": // Internal Avatar Logic
      if (typeof window.serverdown === 'function') {
        gfxDo="Va"+data; 
      }
      break;
            
    case "SD": // Server-Down (send command to server)
      hpop();
      gfxDo=data;
      break;   
    
    default:
      console.warn("Unknown GFX event type:", type);
  }
}

window.gfxZClick = function(z, clickedElement) {
  var zNum = parseInt(z, 10);
  var zStr = zNum.toString().padStart(2, '0');
  window.lastClickedZ = zNum; 
  
  // Immediately notify game of the raw Z click
  gfxClick("ZD" + zStr);
  
  var htm = '';

  // 1. Static Objects (Reads directly from visually updated DOM elements)
  var staticObjs = document.querySelectorAll('.objs');
  for (var i = 0; i < staticObjs.length; i++) {
    var el = staticObjs[i];
    var objZ = parseInt(el.getAttribute('data-z'), 10);
    if (objZ === zNum) {
      var objId = el.getAttribute('data-id');
      var objZStr = el.getAttribute('data-zstr');
      htm += `<a href="gfx:OD${objId}${objZStr}">${gfxItemID(objId)}</a><br>`;
    }
  }

  // 2. Dynamic Items
  if (mapItems) {
    var items = mapItems.split('~');
    for (var j = 0; j < items.length; j++) {
      var id = items[j].substring(0, 2);
      
      // Skip punch code markers, they are not clickable items
      if (id.charAt(0) === 'V' || id.charAt(0) === 'W' || id.charAt(0) === 'X') continue;
      
      var itemZStr = items[j].substring(2, 4); // Added String Variant
      var itemZ = parseInt(itemZStr, 10);      // Changed parseInt reference
      var uniqueid = items[j].length >= 8 ? items[j].substring(4, 8) : "";
      if (itemZ === zNum) {
        // Use itemZStr to maintain zero padding in server punch code
        if (uniqueid === playerId) {
        	 htm += '<a href="gfx:ID' + id + itemZStr + uniqueid + '">Inventory</a><br>';
        } else {
        	 htm += '<a href="gfx:ID' + id + itemZStr + uniqueid + '">' + gfxItemID(id) + '</a><br>';
        }
      }
    }
  }
  
  if (htm) { pop(htm); }
}

splash(1000);

async function splash(durationMs) {
  _CURSOR=CURSOR; CURSOR=0;
  await print("\n\n\n");
  header="Quintrix and Crew Software";
  footer="Multiplayer Graphics Engine";
  const L1 = header.split('');
  const L2 = footer.split('');
  // State: 0=Black, 1=Dark(22), 2=Mid(28), 3=Bright(46)
  let state1 = new Array(L1.length).fill(0);
  let state2 = new Array(L2.length).fill(0);
  const colors = ["\x1b[30m", "\x1b[38;5;22m", "\x1b[38;5;28m", "\x1b[38;5;46m"];
  const startTime = Date.now();
  while (state1.concat(state2).some(s => s < 3)) {
    let output = "\x1b[2A"; // Move up to overwrite
    // Randomly "evolve" characters
    for (let i = 0; i < state1.length; i++) {
      if (state1[i] < 3 && Math.random() > 0.8) state1[i]++;
      output += colors[state1[i]] + L1[i];
    }
    output += "\n";
    for (let i = 0; i < state2.length; i++) {
      if (state2[i] < 3 && Math.random() > 0.8) state2[i]++;
      output += colors[state2[i]] + L2[i];
    }
    if (CURMORE>-1) { CURMORE=0; }
    // beeping sound effects
    //if (Math.random() > 0.2) { 
    //  // High-pitched, very short blips (800Hz to 1200Hz)
    //  let freq = 700 + Math.floor(Math.random() * 400);
    //  beep(freq, 10); // 20ms duration is a sharp 'click' or 'tick'
    //}
    await print(output + "\x1b[0m\n");
    await sleep(40); // Fast enough to look like data "streaming" in
    // Safety timeout to prevent infinite loops
    if (Date.now() - startTime > durationMs) break; 
  }
  await print("\x1b[2A\x1b[38;5;46m"+header+"\n"+footer+"\x1b[0m\n");
  CURSOR=_CURSOR; await print("\n");
  window.GFX=1;
}

// Backwards compatibility aliases
window.LMap = window.LoadMap;
window.gfxMap = window.gfxTiles;
window.gfx = window.gfxTiles;
window.tiles = function() {};
