
window.GFX = 0; // set to true when gfx.js ready to use

var PopAlign = "click"; // "center", "click"
var PopUpVis = "hidden"; // current target visibility
var PForce = "visible";   // forced visibility on mouseout in your original code
var PUV;                 // timeout id (used to clear/set the timeout)

var mapx=7;
var mapy=11;

var _serverUrl = 'http://localhost:8080/qandyland.js';
var _registryUrl = 'https://qandy.vercel.app/api/servers';

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
window.gfxTiles = function(scr) { 
 a=0;
 for (b=0; b<=mapy; b++) { 
  for (c=0; c<=mapx; c++) {
  	 e=document.getElementById("T"+a).src="t/"+scr.charAt(a*2)+scr.charAt((a*2)+1)+".png";
  	 a++;
  }
 }
}
window.gfxChar = function(C,O,Z) {
 let y=Math.floor(Z/(mapx+1)); let x=Z-(y*(mapx+1)); y--;
 idface="cf"+C; idbody="cb"+C; idwpn="cw"+C; idarm="ca"+C; idhat="ch"+C;
 face=""; body=""; wpn=""; arm=""; hat="";

 if (O.indexOf("A")>-1) { face="A"+O.charAt(O.indexOf("A")+1); }
 if (O.indexOf("B")>-1) { face="B"+O.charAt(O.indexOf("B")+1); }
 if (O.indexOf("E")>-1) { face="E"+O.charAt(O.indexOf("E")+1); }
 if (O.indexOf("F")>-1) { face="F"+O.charAt(O.indexOf("F")+1); }

 if (O.indexOf("C")>-1) { body="C"+O.charAt(O.indexOf("C")+1); }
 if (O.indexOf("D")>-1) { body="D"+O.charAt(O.indexOf("D")+1); }
 if (O.indexOf("G")>-1) { body="G"+O.charAt(O.indexOf("G")+1); }
 if (O.indexOf("H")>-1) { body="H"+O.charAt(O.indexOf("H")+1); }

 if (document.getElementById("cb"+C)) {
  e=document.getElementById("cb"+C).src="c/"+body+".png";
  e=document.getElementById("cb"+C).style.top=32+22+(y*32)+"px";
  e=document.getElementById("cb"+C).style.left=(32+22+(x*32))+"px";
 } else {
  let chr=document.createElement("img");
  chr.id="cb"+C; chr.src="c/"+body+".png";
  chr.className="char";  
  chr.style.position="absolute"; chr.style.height=64; chr.style.width=32;
  chr.style.top=32+22+(y*32)+"px"; chr.style.left=(32+22+(x*32))+"px";
  chr.onclick = (function(capturedZ) { return function() { gfxZClick(capturedZ); }; })(Z);
  chr.style.zIndex="150";  
  document.body.appendChild(chr);
 }
 if (document.getElementById("cf"+C)) {
  e=document.getElementById("cf"+C).src="c/"+face+".png";
  e=document.getElementById("cf"+C).style.top=32+22+(y*32)+"px";
  e=document.getElementById("cf"+C).style.left=(32+22+(x*32))+"px";
 } else {
  let chr=document.createElement("img");
  chr.id="cf"+C; chr.src="c/"+face+".png";
  chr.className="char";  
  chr.style.position="absolute"; chr.style.height=64; chr.style.width=32;
  chr.style.top=32+22+(y*32)+"px"; chr.style.left=(32+22+(x*32))+"px";
  chr.style.zIndex="151";
  chr.onclick = (function(capturedZ) { return function() { gfxZClick(capturedZ); }; })(Z);
  document.body.appendChild(chr);
 }

 if (O.indexOf("I")>-1) { hat="I"+O.charAt(O.indexOf("I")+1); }
 if (O.indexOf("J")>-1) { hat="J"+O.charAt(O.indexOf("J")+1); }
 if (hat) {
  if (document.getElementById("ch"+C)) {
   e=document.getElementById("ch"+C).src="c/"+hat+".png";
   e=document.getElementById("ch"+C).style.top=32+22+(y*32)+"px";
   e=document.getElementById("ch"+C).style.left=(32+22+(x*32))+"px";
  } else {
   let chr=document.createElement("img");
   chr.id="ch"+C; chr.src="c/"+hat+".png";
   chr.className="char";  
   chr.style.position="absolute"; chr.style.height=64; chr.style.width=32;
   chr.style.top=32+22+(y*32)+"px"; chr.style.left=(32+22+(x*32))+"px";
   chr.onclick = (function(capturedZ) { return function() { gfxZClick(capturedZ); }; })(Z);
   chr.style.zIndex="152";
   document.body.appendChild(chr);
  } 
 } else {
  if (document.getElementById("ch"+PName)) { document.getElementById("ch"+PName).remove(); } 
 }
}
window.gfxZClick=function(z, clickedElement) {
  var zNum = parseInt(z, 10);
  // Map z-values are stored as 2-char strings (max z=95 for 8x12 grid)
  var zStr = ('0' + zNum).slice(-2);

  // Call zdown() if defined by the game
  if (typeof window.zdown === 'function') {
    window.zdown(zNum);
  }

  // Collect all items at this z-location from all sector data sources
  var items = [];
  if (window.gfxCurrentSector && window.gfxSectorData && window.gfxSectorData[window.gfxCurrentSector]) {
    var sector = window.gfxSectorData[window.gfxCurrentSector];

    // Static sector items: {id, z, data}
    if (sector.items) {
      for (var si = 0; si < sector.items.length; si++) {
        var item = sector.items[si];
        if (parseInt(item.z, 10) === zNum) {
          items.push(item.id + zStr + item.data);
        }
      }
    }

    // Dynamic multiplayer items: {id, z, avatar}
    if (sector.dyn) {
      for (var di = 0; di < sector.dyn.length; di++) {
        var dynItem = sector.dyn[di];
        if (dynItem.z === zNum) {
          items.push(dynItem.id + zStr + dynItem.avatar);
        }
      }
    }

    // Character/player data: string "Sa43B1D0C2" or object {id, outfit, z}
    if (sector.chars) {
      for (var ci = 0; ci < sector.chars.length; ci++) {
        var charEntry = sector.chars[ci];
        if (typeof charEntry === 'string' && charEntry.length >= 4) {
          if (parseInt(charEntry.slice(2, 4), 10) === zNum) {
            items.push(charEntry);
          }
        } else if (typeof charEntry === 'object' && charEntry !== null && parseInt(charEntry.z, 10) === zNum) {
          items.push(charEntry.id + zStr + (charEntry.outfit || ''));
        }
      }
    }
  }

  // If exactly one item and itemdown() is defined, call it directly
  if (items.length === 1 && typeof window.itemdown === 'function') {
    window.itemdown(items[0]);
    return;
  }

  // Build popup HTML listing all items at this z-location
  var htm = '';
  for (var pi = 0; pi < items.length; pi++) {
    var fullStr = items[pi];
    var iId = fullStr.slice(0, 2);
    var rawName = (typeof window.ItemID === 'function') ? window.ItemID(iId) : iId;
    var name = String(rawName).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    var safeStr = fullStr.replace(/'/g, '');
    if (typeof window.itemdown === 'function') {
      htm += "<a href=\"javascript:itemdown('" + safeStr + "')\">" + name + "</a><br>";
    } else {
      htm += name + "<br>";
    }
  }

  if (htm) { pop(htm); }
}
window.gfxServers = async function() {
  var url = _registryUrl;
  if (!url) return { error: 'Error: no registry URL configured' };
  try {
    var response = await fetch(url, { method: 'GET' });
    if (!response.ok) return { error: 'Error: registry responded with ' + response.status };
    var data = await response.json();
    // Validate shape minimally
    if (!data || !Array.isArray(data.servers)) return { error: 'Error: invalid registry format' };
    return data; // e.g. { success: true, servers: [ ... ] }
  } catch (e) {
    return { error: 'Error: ' + (e.message || String(e)) };
  }
}
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
      var itemData = dotIdx >= 0 ? rest.substring(dotIdx + 1) : '';
      
      // Parse tiles (first 192 chars = 96 tiles × 2 chars each)
      var tileString = mapData.substring(0, 192);
      var tiles = [];
      for (var t = 0; t < tileString.length; t += 2) {
        tiles.push(tileString.substring(t, t + 2));
      }
      
      // Parse exits (remaining chars after tiles, 2 chars each)
      var exitString = mapData.substring(192);
      var exits = [];
      for (var e = 0; e < exitString.length; e += 2) {
        exits.push(exitString.substring(e, e + 2));
      }
      
      // Parse items (6 chars each: 2=id, 2=z, 2=data)
      var items = [];
      if (itemData) {
        for (var j = 0; j + 6 <= itemData.length; j += 6) {
          items.push({
            id:   itemData.substring(j,     j + 2),
            z:    parseInt(itemData.substring(j + 2, j + 4), 10),
            data: itemData.substring(j + 4, j + 6)
          });
        }
      }
      
      window.gfxSectorData[sectorId] = {
        tiles: tiles,   // 96-element array
        exits: exits,   // variable-length array of 2-char sector codes
        items: items,   // variable-length array of {id, z, data} objects
        chars: [],      // character/player data for this sector
        dyn:   []       // dynamic items for this sector
      };
    }
    
    await print("Loaded " + Object.keys(window.gfxSectorData).length + " sectors.\n");
    return true;
    
  } catch (e) {
    await print("Error loading " + filename + ": " + e.message + "\n");
    return false;
  }
}
async function renderMap(mapId) {
  try {
    // Load map tile data
    var mapData = await qdosServerLoad("capflag.js/" + mapId + "/m.txt");
    
    // Initialize graphics if not done
    if (!gfxInitialized) {
      await initializeGfx();
    }
    
    // Render the tiles
    gfx(mapData);
    
    // Load and render any existing items on this map
    await renderMapItems(mapId);
    
  } catch (error) {
    throw new Error("Failed to render map: " + error.message);
  }
}
async function renderMapItems(mapId) {
  try {
    // Get directory listing for this map
    var items = await qdosServerList("capflag.js/" + mapId + "/");
    
    // Filter for item files (two-char codes + position + .json)
    var itemFiles = items.split('\n').filter(f => 
      f.length > 6 && f.endsWith('.json') && 
      f.match(/^[A-Z][a-z]\d+\.json$/)
    );
    
    // Render each item
    for (var file of itemFiles) {
      await renderItem(mapId, file);
    }
    
  } catch (error) {
    console.warn("Failed to render items:", error.message);
  }
}
window.gfxItems = function(items) {
 // Remove existing sector item elements
 var oldItems = document.querySelectorAll('.item');
 for (var k = 0; k < oldItems.length; k++) {
  if (oldItems[k].parentNode) { oldItems[k].parentNode.removeChild(oldItems[k]); }
 }

 // Render items on top of tiles with click handlers
 if (items) {
  for (var b = 0; b < items.length; b++) {
   var item = items[b];
   var z = parseInt(item.z, 10);
   if (isNaN(z)) { continue; }
   var y = Math.floor(z / (mapx + 1));
   var x = z - (y * (mapx + 1));
   var c = document.createElement("img");
   c.id = "i" + b;
   c.src = "i/" + item.id + ".png";
   c.className = "item";
   c.style.position = "absolute";
   c.style.top = (32 + 20 + (y * 32)) + "px";
   c.style.left = (32 + 22 + (x * 32)) + "px";
   c.style.zIndex = "120";
   (function(el) {
    el.onload = function() {
     el.style.top = (parseInt(el.style.top) - (el.height - 32)) + "px";
     el.style.left = (parseInt(el.style.left) - (el.width - 32)) + "px";
    };
   })(c);
   c.onclick = function() { gfxZClick(z); };
   document.body.appendChild(c);
  }
 }
}
function zToXY(z) {
 var y = Math.floor(z / (mapx + 1));
 var x = z - (y * (mapx + 1));
 return { x: x, y: y };
}
function _renderPlayer(playerStr) {
// Internal: render a single player from a Queville player string.
// playerStr format: "[playerId][zz][avatarStr]" e.g. "Sa43B1D0C2"
 if (!playerStr || playerStr.length < 6) return;
 var playerId  = playerStr.substring(0, 2);
 var zLocation = parseInt(playerStr.substring(2, 4), 10);
 if (isNaN(zLocation)) return;
 var remaining = playerStr.substring(4);
 var dashIdx = remaining.indexOf('-');
 var avatarStr = (dashIdx !== -1) ? remaining.substring(0, dashIdx) : remaining;
 var movements = (dashIdx !== -1) ? remaining.substring(dashIdx + 1) : '';
 if (avatarStr.length < 2) return;
 gfxChar(playerId, zLocation, avatarStr);
}
function _renderPlayerAvatar(playerId, z, avatarStr, movements) {
// Internal: render a player avatar at the given z-location by stacking 2-char part images.
// Parts are categorised by their first letter (matching the gfxChar() convention):
//   face/head – A B E F  (z-index 151)
//   body      – C D G H  (z-index 150, rendered first so head appears on top)
//   hat/other – everything else (z-index 152)
 var coords = zToXY(z);
 var top  = 32 + 20 + (coords.y * 32);
 var left = 32 + 22 + (coords.x * 32);

 // Split avatarStr into categorised buckets so we can render in the correct order.
 var bodyParts = [], headParts = [], hatParts = [];
 for (var k = 0; k + 2 <= avatarStr.length; k += 2) {
  var partCode  = avatarStr.slice(k, k + 2);
  var firstChar = partCode.charAt(0).toUpperCase();
  if ('CDGH'.indexOf(firstChar) !== -1)      { bodyParts.push(partCode); }
  else if ('ABEF'.indexOf(firstChar) !== -1) { headParts.push(partCode); }
  else                                        { hatParts.push(partCode); }
 }

 // Render: body (base) → head → hat, each layer getting a higher z-index.
 var layers = [
  { parts: bodyParts, zIndex: '150' },
  { parts: headParts, zIndex: '151' },
  { parts: hatParts,  zIndex: '152' }
 ];
 for (var li = 0; li < layers.length; li++) {
  var layer = layers[li];
  for (var pi = 0; pi < layer.parts.length; pi++) {
   var img = document.createElement('img');
   img.className = 'mp-player';
   img.dataset.player = playerId;
   img.src = 'c/' + layer.parts[pi] + '.png';
   img.style.position = 'absolute';
   img.style.top  = top + 'px';
   img.style.left = left + 'px';
   img.style.zIndex = layer.zIndex;
   img.onclick = (function(capturedZ) {
    return function() { gfxZClick(capturedZ, this); };
   })(z);
   document.body.appendChild(img);
  }
 }
 if (movements) _processPlayerMovements(playerId, movements);
}
function _processPlayerMovements(playerId, movements) {
	// Internal: store movement buffer for a player (NSEW sequence).
 console.log('Player ' + playerId + ' movements: ' + movements);
}
function _renderMPItems(rfStr) {
// Internal: render all dynamic items from an RF response string.
// rfStr is a comma-separated list of item codes.
// Each code: "<id(2)><z(2-digit)>" for plain items/empty slots,
//            "<id(2)><z(2-digit)><avatarStr>" for items with avatar data (e.g. active players).
// Avatar strings may include a movements suffix separated by "-": "<avatarStr>-<movements>".
// Plain items are rendered as images from i/.
// Items with avatar are rendered as layered character sprites via _renderPlayer.
// Stores all parsed entries in gfxSectorData[gfxCurrentSector].dyn as {id, z, avatar} objects.

 var old = document.querySelectorAll('.mp-item, .mp-player');
 for (var i = 0; i < old.length; i++) { old[i].parentNode.removeChild(old[i]); }
 var dynItems = [];
 if (!rfStr) {
  if (window.gfxCurrentSector && window.gfxSectorData && window.gfxSectorData[window.gfxCurrentSector]) {
   window.gfxSectorData[window.gfxCurrentSector].dyn = dynItems;
  }
  return;
 }
 var entries = rfStr.split(',');
 for (var j = 0; j < entries.length; j++) {
  var entry = entries[j];
  if (!entry || entry.length < 4) continue;
  var iId = entry.slice(0, 2);
  var z = parseInt(entry.slice(2, 4), 10);
  if (isNaN(z)) continue;
  var avatar = entry.length > 4 ? entry.slice(4) : '';
  dynItems.push({ id: iId, z: z, avatar: avatar });
  if (avatar) {
   _renderPlayer(entry); // entry is "<id><z><avatarStr>", matching _renderPlayer's expected format
  } else {
   var coords = zToXY(z);
   var img = document.createElement('img');
   img.className = 'mp-item';
   img.src = 'i/' + iId + '.png';
   img.style.position = 'absolute';
   img.style.top  = (32 + 20 + (coords.y * 32)) + 'px';
   img.style.left = (32 + 22 + (coords.x * 32)) + 'px';
   img.style.zIndex = '120';
   img.onclick = (function(capturedZ) {
     return function() { gfxZClick(capturedZ, this); };
   })(z);
   document.body.appendChild(img);
  }
 }
 if (window.gfxCurrentSector && window.gfxSectorData && window.gfxSectorData[window.gfxCurrentSector]) {
  window.gfxSectorData[window.gfxCurrentSector].dyn = dynItems;
 }
}
window.gfxChars = function(players) {
// Render multiplayer characters/players from an array of player strings.
// Each entry is a Queville player string: "[playerId][zz][avatarStr]" e.g. "Sa43B1D0".
// Also supports static characters by passing {id, outfit, z} objects (calls gfxChar()).
// Stores the player array in gfxSectorData[gfxCurrentSector].chars when players is non-null.
 var oldPlayers = document.querySelectorAll('.mp-player');
 for (var p = 0; p < oldPlayers.length; p++) { oldPlayers[p].parentNode.removeChild(oldPlayers[p]); }
 if (players) {
  if (window.gfxCurrentSector && window.gfxSectorData && window.gfxSectorData[window.gfxCurrentSector]) {
   window.gfxSectorData[window.gfxCurrentSector].chars = players.slice();
  }
  for (var i = 0; i < players.length; i++) {
   var player = players[i];
   if (!player) continue;
   if (typeof player === 'string') {
    _renderPlayer(player);
   } else if (typeof player === 'object' && player.id) {
    gfxChar(player.id, player.outfit || '', player.z || 0);
   }
  }
 }
}
window.gfxPong = function(rfStr) {
// Process an RF server response: render all dynamic items and players.
// rfStr format: comma-separated item codes, e.g. "Sa43,Tb22,Sa43B1D0C2,Tb22F0H0-NSW"
//   plain item / empty slot: "<id(2)><z(2-digit)>"           e.g. "Sa43"
//   item with avatar:        "<id(2)><z(2-digit)><avatarStr>" e.g. "Sa43B1D0C2"
 _renderMPItems(rfStr);
}
window.gfxSector = function(sectorId) {
 if (!window.gfxSectorData || !window.gfxSectorData[sectorId]) { return; }
 window.gfxCurrentSector = sectorId;
 var sector = window.gfxSectorData[sectorId];

 if (sector.tiles && sector.tiles.length > 0) {
  gfxTiles(sector.tiles.join(""));
 }

 gfxItems(sector.items);

 // Reset dynamic data for the sector and clear any rendered MP elements
 sector.chars = [];
 sector.dyn = [];
 var oldPlayers = document.querySelectorAll('.mp-player');
 for (var p = 0; p < oldPlayers.length; p++) { oldPlayers[p].parentNode.removeChild(oldPlayers[p]); }
 var oldItems = document.querySelectorAll('.mp-item');
 for (var q = 0; q < oldItems.length; q++) { oldItems[q].parentNode.removeChild(oldItems[q]); }
}
window.gfxPing = async function(command, dataObject) {
// Universal gateway for all 2-character commands to the multiplayer server.
// command    – 2-char uppercase command code, e.g. "BB"
// dataObject – plain JS object whose keys/values are appended as form fields
// HOST sends directly via fetch(); GUEST proxies through HOST via postMessage.

  if (!command || !/^[A-Z]{2}$/.test(command)) throw new Error('gfxPing: invalid command');

  // Build form-encoded body: c=<command>&key=val&...
  var parts = ['c=' + command];
  if (dataObject && typeof dataObject === 'object') {
    var keys = Object.keys(dataObject);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      // Strip non-printable characters (keep only printable ASCII and escaped newlines)
      var v = String(dataObject[k]).replace(/[^\x20-\x7E\n]/g, '');
      parts.push(k + '=' + v);
    }
  }
  var body = parts.join('&');

  if (typeof HOST !== 'undefined' && HOST) {
    try {
      var response = await fetch(_serverUrl, {
        method:  'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body:    body
      });
      if (!response.ok) throw new Error('Server error: ' + response.status);
      return await response.text();
    } catch (e) {
      throw new Error('gfxPing: ' + (e.message || String(e)));
    }
  } else {
    return qdosXmitDos('gfxPing', { body: body });
  }
}
window.gfxCreation = async function(drive, mapString, players, isRound) {
//   drive     – server drive to build world on (e.g. "gfx")
//   mapString – topology string of 2-char map IDs, e.g. "A1A2A3B1B2B3"
//   players   – player string of concatenated 2-char codes, e.g. "SaSbScTaTbTc"
//   isRound   – true if world edges wrap (A↔Z, 1↔9); false for flat world

// A1-L8 = small game  (8 rows wide, 12 rows tall) (fits on cell phone screen)
// A0-Z9 = big game (10 rows wide, 26 rows tall)
// Aa-Zz = huge game (26 rows wide, 26 rows tall)

// Compatibility wrapper: delegates to the universal gfxPing gateway.

  return await gfxPing("BB", {
    d: drive,
    m: mapString,
    p: players,
    f: isRound ? 0 : 1
  });
}
window.gfxGameState = async function(drive) {
// Query game state and player manifest for a drive.
// Returns the raw retro response string: e.g. "JSSa.Sb.Sc.Ta.Tb.Tc"
//   state prefix: JS = just starting (no active players), IP = in progress
//   each dot-separated slot: <playerCode><avatarData> if occupied, <playerCode> if empty
  return await gfxPing("GS", { d: drive });
}
splash(1000);
qdosScript("gfx-itemid.js");
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
