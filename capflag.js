RUN="capflag.js";

// We are working on capflag.js which is a game of 'capture the flag' that uses the gfx.js 'multiplayer graphics engine' to connect to the qandyland.js server.
// This code is for an independent, retro-style multiplayer online RPG built on the specific logic of 'Queville' and is novel that standard templates may not work with.

var gfxConnected = null;

if (typeof window.GFX === "undefined") window.GFX = 0;

// Multiplayer state
var emptySlots = [];        
var rfInterval = null;      
var playerItemId = null;    

window.gameState = 'idle';
window.gfxConsole = window.gfxConsole || [];

qdosScript("gfx.js");
startup();
var ts=5000;
setTimeout(function() { startup(); },400);

async function startup(){
  if (window.GFX==0) {
    ts=ts-200;
    if (ts>0) { setTimeout(function() { startup(); },200); }
    return;
  } else {
    await gfxServers();              
    var selectedServer = await input();  
    var gameState = await gfxConnect(selectedServer); 
  }
}

function mainloop() {}

window.zdown = function(z) {
 // walk here 
}

window.itemdown = function(itemStr) {
  if (!itemStr) return;
  var item = itemStr.slice(0, 2);
  var z = itemStr.substring(2, 4);
  var avatar = itemStr.slice(4);
  if (item.charAt(0)=='S' || item.charAt(0)=='T') {
  	 if (playerItem == "Za") {
  	 	if (item.charAt(0)=='S') {
  	 	  playerAvatar=playerAvatar.replace(/C0/g, 'C3');
  	 	  playerAvatar=playerAvatar.replace(/D0/g, 'D3');
        playerAvatar=playerAvatar.replace(/G0/g, 'G3');
        playerAvatar=playerAvatar.replace(/H0/g, 'H3');
  	 	}
  	 	joinGame(item, z); pop('Tag Flagpole<br>to enter game!');
  	 }
  } 
}

window.objdown = function(objStr) {
  if (!objStr) return;

  var i = objStr.slice(0, 2); 
  var z = objStr.slice(2, 4); 
  var d = objStr.slice(4, 6); 

  if (i === "Yj") { 
    if (playerItem !== "Za" && window.map === "_L") {
      if (window.gfxDo === "RF") window.gfxDo = "";
      window.gfxDo += "Qu" + i;
      pop('Joining Game...');
    } else {
      pop("You must claim a team<br>hat before starting!");
    }
  }
}

// Math helpers for local movement prediction
window.moveZ = function(z, cmd) {
   z = parseInt(z, 10);
   var cols = mapx + 1; // 8
   var total = cols * (mapy + 1); // 96
   var col = z % cols;
   if (cmd === 'Qn' && z - cols >= 0) return z - cols;
   if (cmd === 'Qs' && z + cols < total) return z + cols;
   if (cmd === 'Qw' && col > 0) return z - 1;
   if (cmd === 'Qe' && col < cols - 1) return z + 1;
   return z; 
}

window.reverseMoveZ = function(z, cmd) {
   if (cmd === 'Qn') return window.moveZ(z, 'Qs');
   if (cmd === 'Qs') return window.moveZ(z, 'Qn');
   if (cmd === 'Qw') return window.moveZ(z, 'Qe');
   if (cmd === 'Qe') return window.moveZ(z, 'Qw');
   return z;
}

window.keydown = function(key, e) {
  var keyStr = (typeof e === 'object' && e.key) ? e.key : key;
  
  if (window.playerItem === "Za" || !window.playerItem) return;

  if (keyStr === "l" || keyStr === "L") {
    if (window.gfxDo === "RF") window.gfxDo = "";
    window.gfxDo += "Ql";
  }

  // 1. Block buffering if a non-movement command is currently queued
  if (window.gfxDo && window.gfxDo !== "RF") {
      var isPureMove = true;
      for (var i = 0; i < window.gfxDo.length; i += 2) {
          var chk = window.gfxDo.slice(i, i + 2);
          if (!['Qn', 'Qs', 'Qe', 'Qw'].includes(chk)) {
              isPureMove = false;
              break;
          }
      }
      if (!isPureMove) return; 
  }

  // 2. Block buffering if existing queue contains a scroll edge step
  var testZ = window.playerZ;
  if (window.movingItems && window.movingItems[window.playerItem]) {
      var q = window.movingItems[window.playerItem].queue;
      for (var qIdx = 0; qIdx < q.length; qIdx++) {
          var qCol = testZ % (mapx + 1);
          var qRow = Math.floor(testZ / (mapx + 1));
          if ((q[qIdx] === 'Qn' && qRow === 0) ||
              (q[qIdx] === 'Qs' && qRow === mapy) ||
              (q[qIdx] === 'Qw' && qCol === 0) ||
              (q[qIdx] === 'Qe' && qCol === mapx)) {
              return; // We hit a scroll edge in the future, block further input
          }
          testZ = window.moveZ(testZ, q[qIdx]);
      }
  }

  var todo = null;
  switch (keyStr) {
    case "ArrowUp":   case "w": case "W": todo = "Qn"; break;
    case "ArrowDown": case "s": case "S": todo = "Qs"; break;
    case "ArrowLeft": case "a": case "A": todo = "Qw"; break;
    case "ArrowRight":case "d": case "D": todo = "Qe"; break;
  }

  if (todo) {
    // Append to server buffer
    if (window.gfxDo === "RF") window.gfxDo = "";
    window.gfxDo += todo;
    
    // Append to visual 200ms tick buffer
    if (!window.movingItems) window.movingItems = {};
    if (!window.movingItems[window.playerItem]) {
        window.movingItems[window.playerItem] = { z: window.playerZ, queue: [], avatar: window.playerAvatar };
    }
    window.movingItems[window.playerItem].queue.push(todo);
  }
};

window.joinGame = async function(item, z) { 
  if (playerItem != "Za") { return; }
  if (map != '_L') { return; }
  playerItem=item; playerZ=z; playerItemId=item; playerZ=z;
  if (window.gfxDo === "RF") window.gfxDo = "";
  window.gfxDo += "Qg" + item + z + playerAvatar;
}

