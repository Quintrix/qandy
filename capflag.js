RUN="capflag.js";

var gfxConnected = null;

if (typeof window.GFX === "undefined") window.GFX = 0;

// Multiplayer state
var gfxConnected = null;
var emptySlots = [];        // available empty player slot codes from GS response
var rfInterval = null;      // handle for the RF refresh timer
var playerItemId = null;    // this client's chosen player slot ItemID (e.g. "Sa")

// Game phase for click handler state machine.
// 'idle'          – before connecting to a server
// 'just starting' – connected to lobby (JS response), awaiting player slot selection
// 'in progress'   – game active (IP response)
window.gameState = 'idle';

// Game console: master log of all game events, kept in sync with server c.txt
window.gfxConsole = window.gfxConsole || [];

qdosScript("gfx.js");
startup();
var ts=5000;
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
    
    NewChar();
    
    
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
    playerAvatar = PObj;
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
}

window.zdown = function(z) {
 // walk to z-location
}

window.objdown = function(objStr) {
  if (!objStr) return;

  // Parsing the 6-character byte logic
  var i = objStr.slice(0, 2);        // ID (e.g., "Yj")
  var z = objStr.slice(2, 4);        // Z-location
  var d = objStr.slice(4, 6);        // Optional Data/Avatar

  if (i === "Yj") { startGame(); }
}

window.itemdown = function(itemStr) {
  if (!itemStr) return;
  var item = itemStr.slice(0, 2);
  var z = itemStr.substring(2, 4);
  var avatar = itemStr.slice(4);
  if (item.charAt(0)=='S') { joinGame(item, z); } 
  if (item.charAt(0)=='T') { joinGame(item, z); } 
}

window.joinGame = async function(item, z) { 
  console.log(item);
  if (playerMap != '_L') { return; }
  // validate playerItemId??
  playerItemId=item; playerZ=z;
  // send server command to 'get item'
  window.gfxDo = "Qg" + item + z + playerAvatar;
}
