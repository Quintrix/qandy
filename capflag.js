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
  if (item.charAt(0)=='S') {
  	 if (playerItem == "Za") {
  	 	playerAvatar=playerAvatar.replace("D0","D3");
  	 	playerAvatar=playerAvatar.replace("H0","D3");
  	   joinGame(item, z);
  	 }
  } 
  if (item.charAt(0)=='T') {
  	 if (playerItem == "Za") {
      joinGame(item, z);
    }
  } 
}

window.joinGame = async function(item, z) { 
  if (playerItem != "Za") { return; }
  if (playerMap != '_L') { return; }
    // validate playerItemId??
  playerItem=item; playerZ=z; playerItemId=item; playerZ=z;
  // send server command to 'get item'
  window.gfxDo = "Qg" + item + z + playerAvatar;
}
