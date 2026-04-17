RUN="capflag.js";

var gfxConnected = null;

if (typeof window.GFX === "undefined") window.GFX = 0;

// Multiplayer state
var gfxConnected = null;
var emptySlots = [];        // available empty player slot codes from GS response
var rfInterval = null;      // handle for the RF refresh timer
var playerItemId = null;    // this client's chosen player slot ItemID (e.g. "Sa")
var playerAvatarStr = "";   // this client's 4-char avatar string (e.g. "B0D0")

// Game phase for click handler state machine.
// 'idle'          – before connecting to a server
// 'just starting' – connected to lobby (JS response), awaiting player slot selection
// 'in progress'   – game active (IP response)
window.gameState = 'idle';

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

// Replace the entire flagConnect function with:
window.flagConnect = async function(serverIp) {
  try {
    await print("Connecting to server...\n");
    
    // gfx.js handles all connection logic and starts the loop
    var result = await gfxConnect(serverIp);
    
    await print("Connected! Game state: " + window.gameState + "\n");
    
    // Show avatar selection or game UI
    if (window.gameState === "just starting") {
      await print("Select your avatar and click a player hat to join!\n");
      NewChar(''); // Start avatar selection
    } else {
      await print("Game in progress. Select a hat to join!\n");
    }
    
  } catch (e) {
    await print("Connection failed: " + e.message + "\n");
    await print("Retrying in 5 seconds...\n");
    setTimeout(() => flagConnect(serverIp), 5000);
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
    playerAvatarStr = PObj;
    PForce = "hidden";
    pop("Select Player<br>Hat to join game!");
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



// Game-specific click handler: called by gfxZClick when a z-location is clicked.
window.zdown = function(z) {
 // z-location received; item selection handled via itemdown()
};

// Called by gfxZClick when the player selects an item from the popup (or clicks the only item).
// fullItemString format: itemId(2) + z(2) + data (e.g. "Sa13Za")
window.itemdown = function(fullItemString) {
 var itemId = fullItemString.slice(0, 2);
 switch (window.gameState) {
  case 'just starting':
   // Player slot items start with S or T (e.g. Sa, Tb)
   if (/^[ST][a-z]$/.test(itemId)) { joinGame(fullItemString.slice(0, 4)); }
   break;
  case 'in progress':
   // TODO: Implement gameplay item handling
   break;
 }
};

// Step 3 of join flow: send Qg (Get/Join Game) command with chosen ItemID + z + avatar.
// Server checks item ownership, renames player file with avatar + player hat (La),
// records session ownership, and updates the p.txt manifest.
window.joinGame = async function(fullItemString) {
  hpop();
  
  var itemId = fullItemString.slice(0, 2);
  var zLocation = fullItemString.slice(2, 4); 
  var itemData = fullItemString.slice(4, 6);
  
  // Silent fail if hat already claimed
  if (itemData !== "Za") {
    hpop();
    return;
  }
  
  // Just queue the command - gfx.js handles the timing
  playerItemId = itemId;
  window.gfxDo = "Qg" + itemId + zLocation + playerAvatarStr;
  
  // No more interval management needed!
};

// Handle a single game console entry, updating client game state as needed.
function processConsoleEntry(entry) {
 if (typeof entry !== 'string') return;
 if (entry.startsWith('Qg ') || entry.startsWith('JG ')) {
  // "Qg <hatId> <avatar>" – a player joined via Qg (or legacy JG); refresh empty slots display
  var entryParts = entry.split(' ');
  var hatId = entryParts[1];
  // Remove the newly-occupied slot from the emptySlots list
  if (hatId) {
   emptySlots = emptySlots.filter(function(s) { return s !== hatId; });
  }
 }
}

// Send SG (Start Game) command to move the player from the lobby (w/) to a world
// map, making them visible as an active player in RF responses for that map.
// After SG succeeds, switches the RF polling interval to keep refreshing the map.
window.startGame = async function(itemId, avatar) {
 try {
  var res = await gfxPing("SG" + itemId + avatar);
  if (res.startsWith('OK')) {
   // Switch RF polling to the player's world map (server tracks map via session)
   if (rfInterval) clearInterval(rfInterval);
   rfInterval = setInterval(async function() {
    try {
     var rfRes = await gfxPing("RF");
     gfxPong(rfRes);
    } catch (e) { console.error('RF tick error:', e); }
   }, 1000);
   console.log('Game started for ' + itemId + ' with avatar ' + avatar);
  } else {
   console.error('Start game error: ' + res);
  }
 } catch (e) {
  console.error('Start game error:', e);
 }
};

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
  var res = await gfxPing("BB");
  await print(res);
}
