window.GFX = 0; // set to true when gfx.js ready to use

window.gfxDrive = ''; // current drive context; set by gfxCreation / gfxGameState
window.gfxDo = "RF";     // Default refresh command
window.gfxPong = "..";   // server response
window.gfxSession = null;
window.gfxConnected = null;

var _serverUrl = 'http://localhost:8080/qandyland.js';
var _registryUrl = 'https://qandy.vercel.app/api/servers';

var mapx=7;
var mapy=11;

window.map="F2";         // map player-item is on
window.mapTiles=[];      // tiles on player's current map
window.mapExits=[];      // valid exits for map sectors
window.mapObjs=[];       // objs on map sectors
window.mapItems;         // items on player's current map
window.playerItem="Za";  // item-id of object player has claimed (nothing)
window.playerZ=-1;       // z-locatin of playerItem
window.playerAvatar = "";   // players avatar (ie "B0D0")

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
  if (res.startsWith("ST")) {
    window.gfxSession = res.substring(2); 
    await gfxInit();
    gfxTiles(map);
    gfxObjects(map);
    gfxTick();
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

  // Reordered: Bottom layer first, top layer last
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

window.gfxZClick = function(z, clickedElement) {
  var zNum = parseInt(z, 10);
  window.lastClickedZ = zNum; 
  if (typeof window.zdown === 'function') { window.zdown(zNum); }
  var htm = '';

  // 1. Updated Static Objects Parser (comma-separated)
  var objsData = mapObjs[window.map]; 
  if (objsData) {
    var objs = objsData.split(',');
    for (var i = 0; i < objs.length; i++) {
      var entry = objs[i].trim();
      if (!entry) continue;
      
      var meta = entry.split(':')[0];
      var objId = meta.substring(0, 2);
      var objZ  = parseInt(meta.substring(2, 4), 10);
      
      if (objZ === zNum) {
        htm += '<a href="gfx:OD'+objId+objZ+'">'+gfxItemID(objId)+'</a><br>';
      }
    }
  }

  // 2. Dynamic Items (already comma-delimited)
  if (mapItems) {
    var items = mapItems.split(',');
    for (var j=0; j<items.length; j++) {
      var id = items[j].substring(0, 2);
      var itemZ = parseInt(items[j].substring(2, 4), 10);
      if (itemZ === zNum) {
        htm += '<a href="gfx:ID'+id+itemZ+'">'+gfxItemID(id)+'</a><br>';        
      }
    }
  }

  if (htm) { 
    pop(htm); 
  }
}

window.gfxSelectAvatar = function(a) {

 window.PopAlign = "center";
 window.PopUpVis = "hidden";
 window.PopForce = "visible"; 

 if (a=="00") {
  PUP="Select Character:<p>";
  PUP=PUP+"<a href=\"gfx:VAB0\"><img src=\"c/B0.png\" height=64 width=32></a> &nbsp; ";
  PUP=PUP+"<a href=\"gfx:VAB1\"><img src=\"c/B1.png\" height=64 width=32></a> &nbsp; ";
  PUP=PUP+"<a href=\"gfx:VAB2\"><img src=\"c/B2.png\" height=64 width=32></a><br>";
  PUP=PUP+"<a href=\"gfx:VAB3\"><img src=\"c/B3.png\" height=64 width=32></a> &nbsp; ";
  PUP=PUP+"<a href=\"gfx:VAB4\"><img src=\"c/B4.png\" height=64 width=32></a> &nbsp; ";
  PUP=PUP+"<a href=\"gfx:VAB5\"><img src=\"c/B5.png\" height=64 width=32></a> &nbsp; ";
  PUP=PUP+"<a href=\"gfx:VAB6\"><img src=\"c/B6.png\" height=64 width=32></a><p>";
  PUP=PUP+"<a href=\"gfx:VA\">Go Back</a><p>";
  pop(PUP);
 } else {
  if (a=="01") {
   PUP="Select Character:<p>";
   PUP=PUP+"<a href=\"gfx:VAF0\"><img src=\"c/F0.png\" height=64 width=32></a> &nbsp; ";
   PUP=PUP+"<a href=\"gfx:VAF1\"><img src=\"c/F1.png\" height=64 width=32></a> &nbsp; ";
   PUP=PUP+"<a href=\"gfx:VAF2\"><img src=\"c/F2.png\" height=64 width=32></a><br>";
   PUP=PUP+"<a href=\"gfx:VAF3\"><img src=\"c/F3.png\" height=64 width=32></a> &nbsp; ";
   PUP=PUP+"<a href=\"gfx:VAF4\"><img src=\"c/F4.png\" height=64 width=32></a> &nbsp; ";
   PUP=PUP+"<a href=\"gfx:VAF5\"><img src=\"c/F5.png\" height=64 width=32></a> &nbsp; ";
   PUP=PUP+"<a href=\"gfx:VAF6\"><img src=\"c/F6.png\" height=64 width=32></a><p>";
   PUP=PUP+"<a href=\"gfx:VA;\">Go Back</a><p>";
   pop(PUP);
  } else {
  	if (a.length==2) {
  	 if (a.charAt(0)=="F") { PObj=a+"H0"; } else { PObj=a+"D0"; }
  	 gfxDo="VA"+PObj+"..";
    PopForce = "hidden";
    window.lastClickedZ=42; PopAlign='click';
    pop("Tag Flagpole<br>join game!");
  	} else {
    PX=2; PY=9; PZ=(PY*(mapx+1))+PX;
    PUP="<p align=center>Male or Female?<br>";
    PUP=PUP+'<a href=\"gfx:VA00\"><img src=\"c/B1.png\" height=128 width=64></a>';
    PUP=PUP+'&nbsp;&nbsp;&nbsp;'; 
    PUP=PUP+'<a href=\"gfx:VA01\"><img src=\"c/F5.png\" height=128 width=64></a>';
    pop(PUP);
   }
  }
 }
}

async function gfxTick() {
  // send plugs to qandyland.js plugboard() for UNIVAC processing
  if (window.gfxTimeout) clearTimeout(window.gfxTimeout);
  try {
  	if (gfxDo === "") { window.gfxDo = "RF"; }
  	plugs=gfxDo;
  	gfxDo=""; // reset for next tick

    // no plugs work in 'look' mode, must exit look mode to get/use items    
    if (typeof isLooking !== 'undefined' && isLooking === true) { 
      plugs = "Ql"; 
      window.gfxDo = "Ql"; 
    }

    console.log("plugs="+plugs);
    var gfxPong = await gfxPing(plugs);
    console.log("gfxPong="+gfxPong);

    // Ensure we received a valid string before processing
    if (typeof gfxPong === 'string') {
      let ptr = 0;
      while (ptr < gfxPong.length) {
        let verb = gfxPong.substring(ptr, ptr + 2); ptr += 2;
        if (verb === "SP") {
          let endPtr = gfxPong.indexOf("..", ptr);
          let noun="";
          if (endPtr !== -1) {
            noun = gfxPong.substring(ptr, endPtr); ptr = endPtr + 2; 
          } else {
            noun = gfxPong.substring(ptr); ptr = gfxPong.length;
          }
          console.log("###131###"+noun);
          if (typeof window.gfxServerPlug === 'function') { gfxServerPlug(noun); }
        }

        if (verb === "VA") {
          if (typeof window.gfxSelectAvatar === 'function') {
            window.gfxSelectAvatar("");
          }
        }
        
        if (verb === "PI") {
          window.playerItem = gfxPong.substring(ptr, ptr + 2); ptr += 2;
          window.playerZ = parseInt(gfxPong.substring(ptr, ptr + 2), 10); ptr += 2;
          console.log("playerItem="+playerItem+" playerZ="+playerZ);
        }

        // 2. Handle Refresh (Variable-Length Command)
        if (verb === "RF") {
          let noun = gfxPong.substring(ptr); 
          gfxRefresh(noun); 
          ptr = gfxPong.length; // no more commands after RF
        }

        // 3. Handle Look Mode (Variable-Length Command)
        if (verb === "Ql") {
          window.isLooking = true; 
          let myMap = gfxPong.substring(ptr, ptr + 2);
          let myZ = gfxPong.substring(ptr + 2, ptr + 4);
          let playerData = gfxPong.substring(ptr + 4); 
          window.gfxRenderGlobalCanvas(myMap, myZ, playerData);
          ptr = gfxPong.length; // no more commands after RF
        }
      }
    }
  } catch (e) { 
    console.error('Server tick error:', e); 
  }

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
    if (resText.startsWith("ST")) {
      window.gfxSession = resText.substring(2);
    }
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
        var entries = rawObjData.split(',');
        for (var j = 0; j < entries.length; j++) {
          var entry = entries[j].trim();
          if (!entry) continue;
          
          // Split off the server-side punch code (after the colon) to check base length
          var basePart = entry.split(':')[0];
          
          // Static objects have a base length of 6 (item-id + item-z + item-data)
          if (basePart.length === 6) {
            filteredObjs.push(entry);
          }
        }
      }
      
      mapTiles[sectorId] = mapData.substring(0, 192); 
      mapExits[sectorId] = mapData.substring(192); 
      mapObjs[sectorId] = filteredObjs.join(','); 
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
    var objects = objsStr.split(',');

    for (var i = 0; i < objects.length; i++) {
      var entry = objects[i].trim();
      if (!entry) continue;

      // Split metadata from bytecode (if present)
      // bytecode is not saved in gfxFetchMap(), there will be no ':' found
      var parts = entry.split(':');
      var objid = parts[0]; // e.g., "Yj44Sa"
      var objcode = parts[1];
            
      var iId = objid.slice(0, 2);
      var z = parseInt(objid.slice(2, 4), 10);
      var data = objid.slice(4, 6);

      var coords = zToXY(z);
      var img = document.createElement('img');
      img.id = 'obj_' + iId + '_' + z; 
      img.className = 'objs';
      img.src = 'i/' + iId + '.png';
      img.style.position = 'absolute';
      img.style.top = (32 + 20 + (coords.y * 32)) + "px";
      img.style.left = (32 + 22 + (coords.x * 32)) + "px";
      img.style.zIndex = '110'; 

      // Adjustment logic for large items (Flagpoles, Buildings)
      if (iId.charAt(0)==="Y") {
        img.onload = function() {
          var currentTop = parseInt(this.style.top, 10) || 0;
          var currentLeft = parseInt(this.style.left, 10) || 0;
          this.style.top = (currentTop - this.height + 32) + "px";
          this.style.left = (currentLeft - this.width + 32) + "px";
        }
      }

      img.onclick = (function(capturedZ) {
        return function() { gfxZClick(capturedZ, this); };
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
  window.items = items.split(',');

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
    var destZ = parseInt(entry.slice(2, 4), 10);
    if (isNaN(destZ)) continue;
    
    var rawAvatar = entry.length > 4 ? entry.slice(4) : '';
    var avatar = rawAvatar;
    var moves = [];
    
    // NO DASH: Find the first 'Q' command in the avatar string
    var qIdx = rawAvatar.indexOf('Q');
    if (qIdx > -1) {
        avatar = rawAvatar.substring(0, qIdx);
        var historyStr = rawAvatar.substring(qIdx);
        moves = historyStr.match(/Q[nsew]/g) || []; // Extract movement items
    }

    if (iId === window.playerItem) {
      window.playerAvatar = avatar;
      window.playerZ = resolvedPlayerZ;
      window.movingItems[iId].z = resolvedPlayerZ;
      gfxChar(iId, avatar, window.playerZ);
    } else {
      if (avatar) {
        var startZ = destZ;
        for (var k = moves.length - 1; k >= 0; k--) {
            startZ = window.reverseMoveZ(startZ, moves[k]);
        }
        if (moves.length > 0) {
            window.movingItems[iId] = { z: startZ, destZ: destZ, queue: moves, avatar: avatar };
            gfxChar(iId, avatar, startZ);
        } else {
            gfxChar(iId, avatar, destZ);
        }
      } else {
        var coords = zToXY(destZ);
        var img = document.createElement('img');
        img.className = 'item';
        img.src = 'i/' + iId + '.png';
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

window.gfxRenderGlobalCanvas = function(myMap, myZ, playerData) {
  // 1. Setup Constants and Canvas
  const sectorsY = "ABCDEFGH".split("");
  
  // Split the data: [0] is the CSV player list, [1] is the visible sectors string
  const parts = playerData.split(':');
  const pCSV = parts[0];
  const knownSectors = parts[1] || ""; 

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

  // 2. Pre-render Terrain Cache if missing
  if (!window.terrainCache) {
    window.terrainCache = document.createElement('canvas');
    window.terrainCache.width = 256;
    window.terrainCache.height = 384;
    const tCtx = window.terrainCache.getContext('2d');

    var tileId="";
    for (let sy = 0; sy < 8; sy++) {
      for (let sx = 0; sx < 8; sx++) {
        const sectorId = sectorsY[sy] + (sx + 1);
        const data = window.mapTiles[sectorId];
        if (!data) continue;
        for (let t = 0; t < 96; t++) {
        	 if (!knownSectors.includes(sectorId)) {
        	 	tileId = 'Qf';
        	 } else {
            tileId = data.substring(t * 2, t * 2 + 2);
          }
          const tx = t % 8; const ty = Math.floor(t / 8);
          const img = new Image();
          img.src = 'm/' + tileId + '.png';
          img.onload = function() {
            tCtx.drawImage(img, (sx * 32) + (tx * 4), (sy * 48) + (ty * 4));
          }
        }
      }
    }
  }

  // 3. DRAWING PHASE
  // A. Draw full terrain first
  ctx.drawImage(window.terrainCache, 0, 0);


  // C. Draw Players
  const pList = pCSV.split(',');
  pList.forEach(p => {
    if (p.length < 6) return;
    const id = p.substring(0, 2);
    const sec = p.substring(2, 4);
    const z = parseInt(p.substring(4, 6), 10);
    
    const sy = sec.charCodeAt(0) - 65; 
    const sx = parseInt(sec.charAt(1), 10) - 1; 
    const tx = z % 8; const ty = Math.floor(z / 8);

    if (id.charAt(0) === 'S') ctx.fillStyle = '#00FFFF';
    else if (id.charAt(0) === 'T') ctx.fillStyle = '#FF00FF';
    else ctx.fillStyle = '#FFFFFF';

    if (id === window.playerItem) {
        ctx.fillStyle = '#FFFF00';
        ctx.fillRect((sx * 32) + (tx * 4) - 1, (sy * 48) + (ty * 4) - 1, 6, 6);
    } else {
        ctx.fillRect((sx * 32) + (tx * 4), (sy * 48) + (ty * 4), 4, 4);
    }
  });
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
  var type = bytecode.substring(0, 2); // ZD, ID, OD, VA
  var data = bytecode.substring(2);    // Remainder of the code
  
  switch (type) {
    case "ZD": // Z-Down
      if (typeof window.zdown === 'function') window.zdown(parseInt(data, 10));
      break;
    
    case "ID": // Item-Down (Dynamic)
      if (typeof window.itemdown === 'function') window.itemdown(data);
      break;

    case "OD": // Object-Down (Static)
      if (typeof window.objdown === 'function') window.objdown(data);
      break;

    case "VA": // Internal Avatar Logic
      if (typeof gfxSelectAvatar === 'function') gfxSelectAvatar(data);
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
  // 1. Static Objects
  var objsData = mapObjs[window.map]; 
  if (objsData) {
    var objs = objsData.split(',');
    for (var i = 0; i < objs.length; i++) {
      var entry = objs[i].trim();
      if (!entry) continue;
      var meta = entry.split(':')[0];
      var objId = meta.substring(0, 2);
      var objZ  = parseInt(meta.substring(2, 4), 10);
      
      if (objZ === zNum && !/^[ST][a-z]$/.test(objId)) {
        // NEW: OD + Vu (Use) + objId
        htm += `<a href="gfx:OD${objId}${objZ}">${gfxItemID(objId)}</a><br>`;
      }
    }
  }

  // 2. Dynamic Items
  if (mapItems) {
    var items = mapItems.split(',');
    for (var j = 0; j < items.length; j++) {
      var id = items[j].substring(0, 2);
      var itemZ = parseInt(items[j].substring(2, 4), 10);
      if (itemZ === zNum) {
        htm += '<a href="gfx:ID' + id + itemZ + '">' + gfxItemID(id) + '</a><br>';
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
