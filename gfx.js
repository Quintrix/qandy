window.GFX = 0; // set to true when gfx.js ready to use

var _serverUrl = 'http://localhost:8080/qandyland3.js';
var _registryUrl = 'https://qandy.vercel.app/api/servers';
var _gfxDrive = 'gfx'; // current drive context; set by gfxCreation / gfxGameState


var PopAlign = "click"; // "center", "click"
var PopUpVis = "hidden"; // current target visibility
var PForce = "visible";   // forced visibility on mouseout in your original code
var PUV;                 // timeout id (used to clear/set the timeout)

var mapx=7;
var mapy=11;

window.gfxDo = "RF";     // Default refresh command
window.gfxPong = "..";   // server response
window.gfxSession = null;

window.map="_L";         // map player item is on (default lobby)
window.mapTiles=[];      // tiles on player's current map
window.mapExits=[];      // valid exits for map sectors
window.mapObjs=[];       // objs on map sectors
window.mapItems;         // items on player's current map
window.playerItem="Za";  // item id of object player has claimed (nothing)
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
  const style = document.createElement('style');
  style.textContent = `
  .pop { position:absolute; top:260; left:190; z-index:249;
         font-family: arial; font-size: 14px; weight: bold;
         color: navy; background-color: #999; visibility:hidden;
         text-align: center;
         padding-top: 0px; padding-bottom: 0px;  
         padding-right: 4px; padding-left: 4px; }
  .tile { position: absolute; top: 0px; left: 0px; }
  .item { position: absolute; top: 0px; left: 0px; }
  .char { position: absolute; top: 0px; left: 0px; }
  `;
  document.head.appendChild(style);

  const popup = document.createElement('div');
  popup.id = 'pop';
  popup.className = 'pop';
  popup.style.visibility = PopUpVis;
  popup.addEventListener('mouseover', () => {
    PopUpVis = "visible";
    popup.style.visibility = PopUpVis;
  });
  popup.addEventListener('mouseout', () => {
    PopUpVis = PForce;
    clearTimeout(PUV);
    PUV = setTimeout(() => { popup.style.visibility = PopUpVis; }, 100);
  });
  document.body.appendChild(popup);
  // move txt screen over to reveal gfx
  document.getElementById('txt').style.top = '50px';
  document.getElementById('txt').style.left = '350px';
}

window.gfxTiles = function(sector) { 
 // renders tiles for map sector
 a=0;
 for (b=0; b<=mapy; b++) { 
  for (c=0; c<=mapx; c++) {
  	 e=document.getElementById("T"+a).src="t/"+mapTiles[sector].charAt(a*2)+mapTiles[sector].charAt((a*2)+1)+".png";
  	 a++;
  }
 }
}

window.gfxTiles = function(sector) {
	// ai version 
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
};

window.gfxZClick = function(z, clickedElement) {
  var zNum = parseInt(z, 10);
  // Track the last clicked Z for the popup positioning logic
  window.lastClickedZ = zNum; 
  if (typeof window.zdown === 'function') { window.zdown(zNum); }
  var htm = '';

  // 1. Handle OBJS: 6-character segments (ID[2], Z[2], DATA[2])
  // No delimiters used here
  var objsData = mapObjs[window.map]; 
  if (objsData) {
    for (var i = 0; i < objsData.length; i += 6) {
      var objId = objsData.substring(i, i + 2);
      var objZ  = parseInt(objsData.substring(i + 2, i + 4), 10);
      
      if (objId.charAt(0)=='S') { continue; }
      if (objId.charAt(0)=='T') { continue; }
      if (objZ === zNum) {
        htm += '<a href="javascript:objdown(\''+objId+'\')">'+gfxItemID(objId)+'</a><br>';
      }
    }
  }

  // 2. Handle ITEMS: Comma-delimited strings
  // Example: "Sa33,Sb34,Sc57"
  if (mapItems) {
    var items=mapItems.split(',');
    for (var j=0; j<items.length; j++) {
      var id=items[j].substring(0, 2);
      var z=parseInt(items[j].substring(2, 4), 10);
      if (z === zNum) {
        htm += '<a href="javascript:itemdown(\''+items[j]+'\')">'+gfxItemID(id)+'</a><br>';        
      }
    }
  }

  if (htm) { 
    pop(htm); 
  }
}

window.gfxServers = async function() {
  var url = _registryUrl;
  if (!url) return { error: 'Error: no registry URL configured' };
  try {
    var response = await fetch(url, { method: 'GET' });
    if (!response.ok) return { error: 'Error: registry responded with ' + response.status };
    var data = await response.json();
    
    // Build server options
    var servers = data.servers || [];
    var options = [{ name: 'localhost', host: 'localhost', port: 8080, drives: [] }];
    
    for (var i = 0; i < servers.length; i++) {
      var s = servers[i];
      if (s.drives && s.drives.includes(_gfxDrive)) {
        options.push(s);
      }
    }
    
    // Store for gfxConnect to use
    window._serverOptions = options;
    
    // Display the list
    await print("Available servers:\n");
    for (var j = 0; j < options.length; j++) {
      var server = options[j];
      var label = server.name || (server.host + ":" + server.port);
      await print(j + ". " + label + "\n");
    }
    await print("Server [0]: ");
    
    return options;
    
  } catch (e) {
    await print("Error fetching servers: " + e.message + "\n");
    return null;
  }
}

window.gfxConnect = async function(serverIndex) {
  // Get server from the list stored by gfxServers()
  var server = window._serverOptions[serverIndex || 0];
  if (!server) { server = { host: 'localhost', port: 8080 }; }
  _serverUrl = "http://" + server.host + ":" + server.port + "/qandyland3.js";
  try {
  	
    var res = await gfxPing("ST");
    if (res.startsWith("ST")) { window.gfxSession = res.substring(2); }

    var gameState = await gfxPing("GS");
    if (gameState.startsWith("XW")) {
      await print("Creating new world...\n");
      gameState = await gfxPing("BB");
    }
    await gfxInit();
    var minutes = gameState.slice(0, 2);
    var seconds = gameState.slice(2, 4);
    var mapName = gameState.slice(4);
    window._gameTime    = minutes + ':' + seconds;
    window._gameMapFile = mapName + '.gfx';
    // Load the map file specified by the server
    if (window._gameMapFile) {
      await gfxFetchMap(window._gameMapFile);
      gfxTiles("_L"); // display lobby first
      gfxObjects("_L");
    }
    gfxSelectAvatar("");
    gfxTick();
    return window.gameState;
  } catch (e) {
  	 await print("Error: "+e.message+"\n\n");
    gfxServers();
  }
}

window.gfxSelectAvatar = function(a) {
 PopForce="visible";
 if (a=="M") {
  PUP="Select Character:<p>";
  PUP=PUP+"<a href=\"javascript:gfxSelectAvatar(\'B0\');\"><img src=\"c/B0.png\" height=64 width=32></a> &nbsp; ";
  PUP=PUP+"<a href=\"javascript:gfxSelectAvatar(\'B1\');\"><img src=\"c/B1.png\" height=64 width=32></a> &nbsp; ";
  PUP=PUP+"<a href=\"javascript:gfxSelectAvatar(\'B2\');\"><img src=\"c/B2.png\" height=64 width=32></a><br>";
  PUP=PUP+"<a href=\"javascript:gfxSelectAvatar(\'B3\');\"><img src=\"c/B3.png\" height=64 width=32></a> &nbsp; ";
  PUP=PUP+"<a href=\"javascript:gfxSelectAvatar(\'B4\');\"><img src=\"c/B4.png\" height=64 width=32></a> &nbsp; ";
  PUP=PUP+"<a href=\"javascript:gfxSelectAvatar(\'B5\');\"><img src=\"c/B5.png\" height=64 width=32></a> &nbsp; ";
  PUP=PUP+"<a href=\"javascript:gfxSelectAvatar(\'B6\');\"><img src=\"c/B6.png\" height=64 width=32></a><p>";
  PUP=PUP+"<a href=\"javascript:gfxSelectAvatar(\'\');\">Go Back</a><p>";
  pop(PUP);
 } else {
  if (a=="F") {
   PUP="Select Character:<p>";
   PUP=PUP+"<a href=\"javascript:gfxSelectAvatar(\'F0\');\"><img src=\"c/F0.png\" height=64 width=32></a> &nbsp; ";
   PUP=PUP+"<a href=\"javascript:gfxSelectAvatar(\'F1\');\"><img src=\"c/F1.png\" height=64 width=32></a> &nbsp; ";
   PUP=PUP+"<a href=\"javascript:gfxSelectAvatar(\'F2\');\"><img src=\"c/F2.png\" height=64 width=32></a><br>";
   PUP=PUP+"<a href=\"javascript:gfxSelectAvatar(\'F3\');\"><img src=\"c/F3.png\" height=64 width=32></a> &nbsp; ";
   PUP=PUP+"<a href=\"javascript:gfxSelectAvatar(\'F4\');\"><img src=\"c/F4.png\" height=64 width=32></a> &nbsp; ";
   PUP=PUP+"<a href=\"javascript:gfxSelectAvatar(\'F5\');\"><img src=\"c/F5.png\" height=64 width=32></a> &nbsp; ";
   PUP=PUP+"<a href=\"javascript:gfxSelectAvatar(\'F6\');\"><img src=\"c/F6.png\" height=64 width=32></a><p>";
   PUP=PUP+"<a href=\"javascript:gfxSelectAvatar(\'\');\">Go Back</a><p>";
   pop(PUP);
  } else {
  	if (a.length==2) {
  	 if (a.charAt(0)=="F") { PObj=a+"H0"; } else { PObj=a+"D0"; }
    playerAvatar = PObj;
    PForce = "hidden";
    pop("Select Player<br>Hat to join game!");
  	} else {
    PX=2; PY=9; PZ=(PY*(mapx+1))+PX;
    pop("<p>Male or Female?<br><a href=\"javascript:gfxSelectAvatar(\'M\');\"><img src=\"c/B1.png\" height=128 width=64></a> &nbsp; <a href=\"javascript:gfxSelectAvatar(\'F\');\"><img src=\"c/F5.png\" height=128 width=64></a>");
   }
  }
 }
}

function gfxTick() {
  if (window.gfxInterval) clearInterval(window.gfxInterval);
  window.gfxInterval = setInterval(async function() {
    //try {
      var command = window.gfxDo || "RF";
      window.gfxDo = "RF"; 
      
      var gfxPong = await gfxPing(command);
      
      let ptr = 0;
      while (ptr < gfxPong.length) {
        let verb = gfxPong.substring(ptr, ptr + 2);
        ptr += 2;

        // TERMINAL VERB: RF (Refresh)
        // This is always the last command. It consumes the rest of the string.
        if (verb === "RF") {
          let noun = gfxPong.substring(ptr);
          gfxRefresh(noun); 
          break; // Exit loop, processing finished
        }

        // MAP TRANSITION VERBS: Lm, Ma, Mp, etc.
        // Noun is always 2 characters (the Map ID)
        //if (verb === "Lm" || verb === "Ma" || verb === "Mp") {
        //  let newMap = s.substring(ptr, ptr + 2);
        //  ptr += 2;
        //  processMapChange(newMap);
        //  continue;
        //}

        // ACTION VERBS: Fs (Fish), Mn (Mine), In (Inventory)
        // These look for the 'Za' delimiter
        if (verb === "Fs" || verb === "Mn" || verb === "In") {
          let endIdx = gfxPong.indexOf("Za", ptr);
          if (endIdx === -1) {
            // Safety: if Za is missing, skip or log error
            ptr = gfxPong.length; 
          } else {
            let data = gfxPong.substring(ptr, endIdx);
            alert(verb+" "+data);
            //processAction(verb, data);
            ptr = endIdx + 2; // Skip the data and the 'Za'
          }
          continue;
        }

        // If we don't recognize the verb, we have a "sync error" or unknown card
        // For safety, if we don't know the verb, we stop to prevent infinite loops
        console.warn("Unknown punch card verb:", verb);
        break;
      }
    //} catch (e) { 
    //  console.error('Server tick error:', e); 
    //}
  }, 1000);
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
      var objData = dotIdx >= 0 ? rest.substring(dotIdx + 1) : '';
      
      mapTiles[sectorId] = mapData.substring(0, 192); 
      mapExits[sectorId] = mapData.substring(192); 
      mapObjs[sectorId] = objData; 
           
      // this should be saving strings not arrays?
      // I think this is done, no longer needed?
      //window.gfxSectorData[sectorId] = {
      //  tiles: tiles,   // 96-element array
      //  exits: exits,   // variable-length array of 2-char sector codes
      //  objs: objs,     // variable-length array of {id, z, data} objects
      //  itmes: "",
      //};
    }
    
    //await print("Loaded " + Object.keys(window.gfxSectorData).length + " sectors.\n");
    return true;
    
  } catch (e) {
    await print("Error loading " + filename + ": " + e.message + "\n");
    return false;
  }
}

window.gfxObjects = function(sector) {
  var objsStr = window.mapObjs[sector];
  var oldObjs = document.querySelectorAll('.objs');
  for (var k = 0; k < oldObjs.length; k++) { if (oldObjs[k].parentNode) { oldObjs[k].parentNode.removeChild(oldObjs[k]); }}
  if (objsStr) {
    var safeObjs = String(objsStr || "");
    var newObjs = safeObjs.match(/.{1,6}/g) || [];

    for (var i = 0; i < newObjs.length; i++) {
      var entry = newObjs[i];
      var iId = entry.slice(0, 2);
      var z = parseInt(entry.slice(2, 4), 10);
      var idata = entry.slice(4, 6);
      
      if (/^[ST][a-z]$/.test(iId)) { continue; }
      
      var coords = zToXY(z);
      var img = document.createElement('img');
      img.className = 'objs';
      img.src = 'i/' + iId + '.png';
      img.style.position = 'absolute';
      var initialTop = (32 + 20 + (coords.y * 32));
      var initialLeft = (32 + 22 + (coords.x * 32));
      img.style.top = initialTop + "px";
      img.style.left = initialLeft + "px";
      img.style.zIndex = '110'; 

      // The adjustment logic
      img.onload = function() {
        // Subtracting the image's own dimensions from the starting coordinates
        this.style.top = (initialTop - this.height + 32) + "px";
        this.style.left = (initialLeft - this.width + 32) + "px";
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
  const oldItems = document.querySelectorAll('.item');
  for (let i = 0; i < oldItems.length; i++) { oldItems[i].remove(); }
  const oldChars = document.querySelectorAll('.char');
  for (let i = 0; i < oldChars.length; i++) { oldChars[i].remove(); }

  // New wire format: [mapId(2)][zLocation(2)][items]
  window.playerMap = rfStr.substring(0, 2);
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

window.gfxPing = async function(commandString) {
  if (!commandString || commandString.length < 2) throw new Error('gfxPing: invalid command');

  var body = commandString;
  // Ensure the URL matches exactly what the server is listening for
  var url = _serverUrl + '?d=' + encodeURIComponent(_gfxDrive);

  // Send the session token in a header instead of the URL for better security
  var headers = { 'Content-Type': 'text/plain' };
  if (window.gfxSession) {
    headers['X-Session-Token'] = window.gfxSession;
  }

  try {
    var response = await fetch(url, {
      method:  'POST',
      headers: headers,
      body:    body
    });
    
    if (!response.ok) throw new Error('Server error: ' + response.status);
    //console.log(response.status+" "+response.text);
    
    var resText = await response.text();
    
    // If the server returns an ST command, save it as our session
    if (resText.startsWith("ST")) {
      window.gfxSession = resText.substring(2);
    }
    
    return resText;
  } catch (e) {
    throw new Error('gfxPing: ' + (e.message || String(e)));
  }
}

window.gfxCreation = async function(drive, mapString, players, isRound) {
//   drive     – server drive to build world on (e.g. "gfx")
//   mapString – topology string of 2-char map IDs (unused; server reads capflag.gfx)
//   players   – player string of concatenated 2-char codes (unused; server reads capflag.gfx)
//   isRound   – unused; server determines world topology from capflag.gfx

// A1-L8 = small game  (8 rows wide, 12 rows tall) (fits on cell phone screen)
// A0-Z9 = big game (10 rows wide, 26 rows tall)
// Aa-Zz = huge game (26 rows wide, 26 rows tall)

// Sets drive context and delegates to gfxPing("BB").

  if (drive) _gfxDrive = drive;
  return await gfxPing("BB");
}

window.gfxGameState = async function(drive) {
// Query game state and player manifest for a drive.
// Returns the raw retro response string: e.g. "JSSa.Sb.Sc.Ta.Tb.Tc"
//   state prefix: JS = just starting (no active players), IP = in progress
//   each dot-separated slot: <playerCode><mapId><avatarData> if occupied, <playerCode> if empty
  if (drive) _gfxDrive = drive;
  return await gfxPing("GS");
}

splash(1000);
window.hpop=function() { document.getElementById("pop").style.visibility="hidden"; }
window.pop=function(htm) {
  const popup = document.getElementById("pop");
  popup.innerHTML = "<p>" + htm;
  
  const TopYPos = 32 + 22; 
  const TopXPos = 32 + 22;
  
  // Get popup dimensions after setting content
  popup.style.visibility = "visible"; // Make visible to measure
  const popupWidth = popup.offsetWidth;
  const popupHeight = popup.offsetHeight;
  
  let PopX, PopY;
  
  switch (PopAlign) {
    case "center":
      // Center on the 256x384 game screen
      PopX = TopXPos + ((256 - popupWidth) / 2);
      PopY = TopYPos + ((384 - popupHeight) / 2);
      break;
      
    case "click":
      // Display at the clicked z-location
      if (typeof lastClickedZ !== 'undefined') {
        const clickY = Math.floor(lastClickedZ / (mapx + 1));
        const clickX = lastClickedZ - (clickY * (mapx + 1));
        PopX = TopXPos + (clickX * 32);
        PopY = TopYPos + (clickY * 32);
        
        // Keep popup within screen bounds
        if (PopX + popupWidth > TopXPos + 256) {
          PopX = TopXPos + 256 - popupWidth;
        }
        if (PopY + popupHeight > TopYPos + 384) {
          PopY = TopYPos + 384 - popupHeight;
        }
        if (PopX < TopXPos) PopX = TopXPos;
      } else {
        // Fallback to center if no click location
        PopX = TopXPos + ((256 - popupWidth) / 2);
        if (PopY < TopYPos) PopY = TopYPos;
        PopY = TopYPos + ((384 - popupHeight) / 2);
      }
      break;
      
    default:
      // Default to center
      PopX = TopXPos + ((256 - popupWidth) / 2);
      PopY = TopYPos + ((384 - popupHeight) / 2);
  }
  
  popup.style.top = PopY + "px";
  popup.style.left = PopX + "px";
}

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
