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

// In capflag.js startup():
async function startup(){
  if (window.GFX==0) {
    ts=ts-200;
    if (ts>0) { setTimeout(function() { startup(); },200); }
    return;
  } else {
    await gfxServers();              // Display server list
    var selectedServer = await input();  // Get user selection  
    var gameState = await gfxConnect(selectedServer); // Connect & return game state
    
    // Handle game state
    if (gameState === "just starting") {
      NewChar('');
    } else {
      await print("Game in progress (" + (window._gameTime || "??:??") + ").\n");
      setTimeout(function() { startup(); },200);
    }
  }
  setTimeout(function() {
    console.log("=== RENDER DEBUG ===");
    console.log("Static items:", window.gfxSectorData?._L?.items);
    console.log("Dynamic items:", window.gfxSectorData?._L?.dyn);
    console.log("All lobby elements:", document.querySelectorAll('.item, .mp-item').length);
  }, 2000);
}


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
}
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
   if (/^[ST][a-z]$/.test(itemId)) { joinGame(fullItemString); }
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
