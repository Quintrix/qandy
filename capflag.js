RUN="capflag.js";

var gfxConnected = null;

if (typeof window.GFX === "undefined") window.GFX = 0;

// Multiplayer state
var gfxConnected = null;
var emptySlots = [];        // available empty player slot codes from GS response
var rfInterval = null;      // handle for the RF refresh timer
var playerItemId = null;    // this client's chosen player slot ItemID (e.g. "Sa")
var playerAvatarStr = "";   // this client's 4-char avatar string (e.g. "B0D0")

// Game console: master log of all game events, kept in sync with server c.txt
window.gfxConsole = window.gfxConsole || [];

qdosScript("gfx.js");
startup();
var ts=3000;
setTimeout(function() { startup(); },400);

function startup(){
  if (window.GFX==0) {
  	 ts=ts-200;
  	 if (ts>0) { setTimeout(function() { startup(); },200); }
    return;
  } else {
    flagConnect();
  }
}

window.flagConnect = async function() {
  try {
    await print("\n");
    await print ("\x1b[36mQandyland Servers:\x1b[40m\x1b[37m\n\n");
    // Properly capture server selection
    gfxConnected = await flagServers("gfx");
    if (!gfxConnected) {
      await print("Server selection cancelled.\n");
      return 'Connection cancelled';
    }
    await print("\nConnecting "+gfxConnected.host+":"+gfxConnected.port+"...");
    // Fix protocol detection - localhost should use HTTP
    var proto = 'http';
    if (gfxConnected.host !== 'localhost' && gfxConnected.host !== '127.0.0.1') {
      try { proto = new URL(_registryUrl).protocol.replace(':', ''); } catch (e) { proto = 'http'; }
    }
    _serverUrl = proto + '://' + gfxConnected.host + ':' + gfxConnected.port + '/qandyland.js';

    var drive = "gfx";
    var gameState = await gfxPing("GS", {d: drive});
    await print("\nGame state: " + gameState + "\n");

    // Handle "no world" - create one with big bang, then fall through to normal handling
    if (gameState.startsWith("XW")) {
      await print("No world found.\nCreating new world...");
      gameState = await gfxPing("BB", {d: drive});
      if (gameState.startsWith("XX")) {
        var bbErrorMsg = gameState.substring(2);
        await print("Error creating world: " + bbErrorMsg + "\n");
        return flagConnect();
      }
      await print("\nWorld created. Game state: " + gameState + "\n");
      // Now fall through to normal JS/IP handling
    }

    if (gameState.startsWith("XX")) {
      var errorMsg = gameState.substring(2);
      await print("Error: " + errorMsg + "\n");
      return flagConnect();
    }

    if (gameState.startsWith("IP")) {
      await print("Game in progress. Returning to server selection...\n");
      return flagConnect();
    }

    if (gameState.startsWith("JS")) {
    	var flagMap="capflag.gfx";
    	await print("Loading map: " + flagMap + "\n");
      var map = await gfxFetchMap(flagMap);
      if (!map) {
        await print("Failed to load map.\n");
        return flagConnect();
      }

      var manifest = gameState.substring(2);
      var slots = manifest.split('.');
      emptySlots = slots.filter(function(slot) { return slot.length === 2; });
      if (emptySlots.length === 0) {
        await print("Server full.\n");
        return flagConnect();
      }

      // Initialize graphics and render lobby sector tiles and items
      await gfxInit();
      document.getElementById('txt').style.top = '50px';
      document.getElementById('txt').style.left = '350px';
      gfxRenderMap("_L");
      NewChar("");
      return;
    }
  } catch (error) {
    await print("Connection failed: " + error.message + " " + (gfxConnected ? gfxConnected.host : '') + "\n");
    throw error;
  }
};

window.NewChar = function(a) {
 PopForce="visible";
 if (a=="M") {
  PUP="Select Character:<p>";
  PUP=PUP+"<a href=\"javascript:NewChar(\'B0\');\"><img src=\"c/B0.png\" height=64 width=32></a> &nbsp; ";
  PUP=PUP+"<a href=\"javascript:NewChar(\'B1\');\"><img src=\"c/B1.png\" height=64 width=32></a> &nbsp; ";
  PUP=PUP+"<a href=\"javascript:NewChar(\'B2\');\"><img src=\"c/B2.png\" height=64 width=32></a><br>";
  PUP=PUP+"<a href=\"javascript:NewChar(\'B3\');\"><img src=\"c/B3.png\" height=64 width=32></a> &nbsp; ";
  PUP=PUP+"<a href=\"javascript:NewChar(\'B4\');\"><img src=\"c/B4.png\" height=64 width=32></a> &nbsp; ";
  PUP=PUP+"<a href=\"javascript:NewChar(\'B5\');\"><img src=\"c/B5.png\" height=64 width=32></a> &nbsp; ";
  PUP=PUP+"<a href=\"javascript:NewChar(\'B6\');\"><img src=\"c/B6.png\" height=64 width=32></a><p>";
  PUP=PUP+"<a href=\"javascript:NewChar(\'\');\">Go Back</a><p>";
  pop(PUP);
 } else {
  if (a=="F") {
   PUP="Select Character:<p>";
   PUP=PUP+"<a href=\"javascript:NewChar(\'F0\');\"><img src=\"c/F0.png\" height=64 width=32></a> &nbsp; ";
   PUP=PUP+"<a href=\"javascript:NewChar(\'F1\');\"><img src=\"c/F1.png\" height=64 width=32></a> &nbsp; ";
   PUP=PUP+"<a href=\"javascript:NewChar(\'F2\');\"><img src=\"c/F2.png\" height=64 width=32></a><br>";
   PUP=PUP+"<a href=\"javascript:NewChar(\'F3\');\"><img src=\"c/F3.png\" height=64 width=32></a> &nbsp; ";
   PUP=PUP+"<a href=\"javascript:NewChar(\'F4\');\"><img src=\"c/F4.png\" height=64 width=32></a> &nbsp; ";
   PUP=PUP+"<a href=\"javascript:NewChar(\'F5\');\"><img src=\"c/F5.png\" height=64 width=32></a> &nbsp; ";
   PUP=PUP+"<a href=\"javascript:NewChar(\'F6\');\"><img src=\"c/F6.png\" height=64 width=32></a><p>";
   PUP=PUP+"<a href=\"javascript:NewChar(\'\');\">Go Back</a><p>";
   pop(PUP);
  } else {
  	if (a.length==2) {
  	 if (a.charAt(0)=="F") { PObj=a+"H0"; } else { PObj=a+"D0"; }
    selectPlayerSlot(PObj);
  	} else {
    PX=2; PY=9; PZ=(PY*(mapx+1))+PX;
    pop("<p>Male or Female?<br><a href=\"javascript:NewChar(\'M\');\"><img src=\"c/B1.png\" height=128 width=64></a> &nbsp; <a href=\"javascript:NewChar(\'F\');\"><img src=\"c/F5.png\" height=128 width=64></a>");
   }
  }
 }
};

function mainloop() {
 // Avatar selection complete - PObj holds the 4-character avatar string
}



// @@ //

// Handle item clicks from gfx.js - called with the z-location of the clicked item.
// Finds any items at that location in the current lobby sector and shows a Join Game popup.
window.gfxZDown = function(z) {
 var sector = window.gfxSector && window.gfxSector["_L"];
 if (!sector || !sector.items) return;
 var PUP = "";
 for (var i = 0; i < sector.items.length; i++) {
  var item = sector.items[i];
  if (parseInt(item.z, 10) === z) {
   var safeId = String(item.id).replace(/[^A-Za-z0-9]/g, '');
   var name = (typeof window.ItemID === 'function') ? window.ItemID(safeId) : safeId;
   var safeName = String(name).replace(/[<>&"']/g, '');
   PUP += "<a href='javascript:joinGame(\"" + safeId + "\");'>Join Game (" + safeName + ")</a><br>";
  }
 }
 if (PUP) { pop(PUP); }
};

window.selectPlayerSlot = function(avatarStr) {
 playerAvatarStr = avatarStr;
 var html = "Select player slot:<p>";
 for (var i = 0; i < emptySlots.length; i++) {
  var slot = emptySlots[i];
  html += "<a href=\"javascript:joinGame('" + slot + "');\"><img src=\"i/" + slot + ".png\" height=32 width=32 title='" + slot + "'></a> &nbsp; ";
 }
 html += "<p><small>Team One (S-slots) &nbsp; Team Two (T-slots)</small>";
 pop(html);
};

// Step 3 of join flow: send JG (Join Game) command with chosen ItemID + avatar.
// Server updates p.txt manifest and creates the player file in the map directory.
window.joinGame = async function(itemId) {
 hpop();
 playerItemId = itemId;
 var drive = "gfx";
 try {
  var res = await gfxPing("JG", { d: drive, id: itemId, av: playerAvatarStr });
  if (res.startsWith("OK")) {
   // Start the 1-second RF (Refresh) tick for real-time updates
   var mapId = (itemId.charAt(0) === 'S') ? 'A1' : 'L8';
   if (rfInterval) clearInterval(rfInterval);
   rfInterval = setInterval(async function() {
    try {
     var rfRes = await gfxPing("RF", { d: drive, m: mapId });
     processRFResponse(rfRes);
    } catch (e) { console.error('RF tick error:', e); }
   }, 1000);
  } else {
   pop("Error joining: " + res + "<p><a href=\"javascript:selectPlayerSlot(playerAvatarStr);\">Try again</a>");
  }
 } catch (e) {
  pop("Connection error.<p><a href=\"javascript:selectPlayerSlot(playerAvatarStr);\">Try again</a>");
 }
};

// Process an RF response string in Queville format.
// rfStr format: "[items]-[player1]-[player2]..."
//   items   – concatenated 4-char codes: ItemID + zz (non-player items)
//   players – each section is "[playerId][zz][avatarStr]" e.g. "Sa43B1D0"
function processRFResponse(rfStr) {
 var parts = rfStr.split('-');
 var sectorData = parts[0];

 // Clear existing MP players before re-rendering
 var oldPlayers = document.querySelectorAll('.mp-player');
 for (var p = 0; p < oldPlayers.length; p++) { oldPlayers[p].parentNode.removeChild(oldPlayers[p]); }

 // Render non-player items (first section)
 renderMPItems(sectorData);

 // Render players (remaining sections)
 for (var i = 1; i < parts.length; i++) {
  if (parts[i]) renderPlayer(parts[i]);
 }
}

// Handle a single game console entry, updating client game state as needed.
function processConsoleEntry(entry) {
 if (typeof entry !== 'string') return;
 if (entry.startsWith('JG ')) {
  // "JG <hatId> <avatar>" – a player joined; refresh empty slots display
  var entryParts = entry.split(' ');
  var hatId = entryParts[1];
  // Remove the newly-occupied slot from the emptySlots list
  if (hatId) {
   emptySlots = emptySlots.filter(function(s) { return s !== hatId; });
  }
 }
}

// Convert a z-position to {x, y} tile coordinates using the current map width.
function zToXY(z) {
 var y = Math.floor(z / (mapx + 1));
 var x = z - (y * (mapx + 1));
 return { x: x, y: y };
}

// Render non-player items from the items section of an RF response string.
// rfStr is a sequence of 4-char codes: 2-char ItemID + 2-digit z-location, e.g. "Ab12Cd34".
function renderMPItems(rfStr) {
 // Remove previously rendered MP items
 var old = document.querySelectorAll('.mp-item');
 for (var i = 0; i < old.length; i++) { old[i].parentNode.removeChild(old[i]); }
 // Render each item at its z-position on the map
 for (var j = 0; j + 4 <= rfStr.length; j += 4) {
  var iId = rfStr.slice(j, j + 2);
  var z = parseInt(rfStr.slice(j + 2, j + 4), 10);
  if (isNaN(z)) continue;
  var coords = zToXY(z);
  var img = document.createElement('img');
  img.className = 'mp-item';
  img.src = 'i/' + iId + '.png';
  img.style.position = 'absolute';
  img.style.top  = (32 + 20 + (coords.y * 32)) + 'px';
  img.style.left = (32 + 22 + (coords.x * 32)) + 'px';
  img.style.zIndex = '120';
  document.body.appendChild(img);
 }
}

// Render a single player from a Queville player section string.
// playerStr format: "[playerId][zz][avatarStr][^movements]"
//   e.g. "Sa43B1D0C2" or "Tb22A2E1F3^NSW"
// Minimum 6 chars: 2 (playerId) + 2 (zz) + 2 (at least one avatar part).
function renderPlayer(playerStr) {
 if (!playerStr || playerStr.length < 6) return;
 var playerId  = playerStr.substring(0, 2);            // "Sa"
 var zLocation = parseInt(playerStr.substring(2, 4), 10); // 43
 if (isNaN(zLocation)) return;
 var movementIdx = playerStr.indexOf('^');
 var avatarStr = (movementIdx !== -1)
  ? playerStr.substring(4, movementIdx)
  : playerStr.substring(4);
 var movements = (movementIdx !== -1)
  ? playerStr.substring(movementIdx + 1)
  : '';
 renderPlayerAvatar(playerId, zLocation, avatarStr, movements);
}

// Render a player avatar at the given z-location by stacking 2-char part images.
// avatarStr contains up to 5 two-character codes: [head][body][hat][sword][shield]
// Each code maps to an image in c/<code>.png that is layered at the player's tile.
function renderPlayerAvatar(playerId, z, avatarStr, movements) {
 var coords = zToXY(z);
 var top  = 32 + 20 + (coords.y * 32);
 var left = 32 + 22 + (coords.x * 32);
 for (var k = 0; k + 2 <= avatarStr.length; k += 2) {
  var partCode = avatarStr.slice(k, k + 2);
  var img = document.createElement('img');
  img.className = 'mp-player';
  img.dataset.player = playerId;
  img.src = 'c/' + partCode + '.png';
  img.style.position = 'absolute';
  img.style.top  = top + 'px';
  img.style.left = left + 'px';
  img.style.zIndex = '125';
  document.body.appendChild(img);
 }
}

// flagServers.js
// opts: { driveFilter='gfx', prompt, defaultIndex=0, allowCancel=true }
async function flagServers(opts) {
  opts = opts || {};
  const driveFilter = opts.driveFilter || 'gfx';
  const prompt = opts.prompt || "Server [0]? ";
  const defaultIndex = (typeof opts.defaultIndex === 'number') ? opts.defaultIndex : 0;
  const allowCancel = (opts.allowCancel === false) ? false : true;

  // 1) get registry
  var res = await gfxServers();
  if (res.error) { await print(res.error + "\n"); throw new Error(res.error); }

  // 2) build options: injected localhost first, then registry servers that host the drive
  var servers = Array.isArray(res.servers) ? res.servers : (Array.isArray(res.list) ? res.list : []);
  var options = [{ name: 'localhost', host: 'localhost', port: 8080, drives: [] }];
  for (var i = 0; i < servers.length; i++) {
    var s = servers[i];
    if (!s) continue;
    if (!driveFilter || (Array.isArray(s.drives) && s.drives.indexOf(driveFilter) !== -1)) {
      options.push(s);
    }
  }
  window._gfxOptions = options; // optional debug handle

  // 3) print options line-by-line (<=31 chars, alternating greens)
  if (options.length === 0) {
    await print("\x1b[38;5;28mNo servers available\x1b[0m\n");
  } else {
    for (var j = 0; j < options.length; j++) {
      var e = options[j];
      var label = (e.name && String(e.name).trim()) ? String(e.name).trim() : (String(e.host) + ':' + String(e.port || 8080));
      var prefix = String(j) + '. ';
      var maxLabelLen = 31 - prefix.length;
      if (label.length > maxLabelLen) label = label.slice(0, maxLabelLen - 1) + '…';
      var line = prefix + label;
      var color = (j % 2 === 0) ? '\x1b[38;5;28m' : '\x1b[38;5;46m';
      await print(color + line + '\x1b[0m\n');
    }
  }

  // 4) prompt & input loop -> return selected server object
  while (true) {
    await print("\n" + prompt);
    var i = await input();
    i = (typeof i === 'string') ? i.trim() : '';

    if (i === '') {
      // default selects injected localhost (index 0) unless defaultIndex chosen
      var idx = Math.max(0, Math.min(defaultIndex, options.length - 1));
      var chosen = options[idx];
      return { name: chosen.name, host: chosen.host, port: String(chosen.port || 8080), raw: chosen };
    }

    // numeric index
    var n = parseInt(i, 10);
    if (!isNaN(n) && options[n]) {
      var s = options[n];
      return { name: s.name, host: s.host, port: String(s.port || 8080), raw: s };
    }

    // host:port typed directly
    if (i.indexOf(':') !== -1) {
      var parts = i.split(':');
      return { name: i, host: parts[0], port: String(parts[1] || '8080'), raw: { name: i, host: parts[0], port: parts[1] } };
    }

    // cancel
    if (allowCancel && (i.toLowerCase() === 'q' || i.toLowerCase() === 'quit' || i.toLowerCase() === 'c')) {
      return null;
    }

    await print("Invalid selection. Enter a number, host:port, or press Enter for default.\n");
  }
}

async function flagCreate() {
  var drive="gfx";
  var res = await gfxPing("BB", {d: drive});
  await print(res);
}
