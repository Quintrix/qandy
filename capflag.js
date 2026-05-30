RUN="capflag.js";

// We are working on capflag.js which is a game of 'capture the flag' that uses the gfx.js 'multiplayer graphics engine' to connect to the qandyland.js server.
// This code is for an independent, retro-style multiplayer online RPG built on the specific logic of 'Queville' and is novel that standard templates may not work with.

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
  	 window.gfxDrive = 'capflag.gfx';
    var gameState = await gfxConnect(0);
  }
}

function mainloop() {}

window.zdown = function(z) {
  // Logic for walking or targeting a tile
  console.log("Player clicked tile:", z);
};

window.itemdown = function(code) {
 console.log('item down = '+code);
  
  hpop();
    
  var itemid = code.substring(0, 2);
  var itemz = code.substring(2, 4); 
  
  if (itemid === "VA") {
  	 gfxSelectAvatar(itemz);
  	 return;
  }
  
  // items Sa-Tz are player items
  console.log("itemid="+itemid+" playerZ="+playerZ+" itemz="+itemz);
  if (itemid > 'Rz' && itemid < 'Ua' && playerItem === 'Za') {
  	 // if player has not selected a player-item yet, they cannot 'move' to the object
    if (playerItem === "Za") { playerZ=itemz; } 
  }

  if (playerZ != itemz)  {
  	 // walk player to item then set gfxDo
  } else {
  	 console.log("gfxDo="+gfxDo);
    window.gfxDo += "ID" + itemid + itemz;
  }
};

window.objdown = function(code) {
  console.log("objdown -> code="+code);
  var itemid = code.substring(0, 2); 
  var itemz = code.substring(2, 4); 

  if (itemid < 'Sa' || itemid > "Tz") {
  	 gfxDo="OD"+itemid+itemz;
  } else {
  	 // logic for selecting a player-item for new players
  	 if (playerItem === "Za") { gfxDo="OD" + itemid + itemz; } 
  }
  
  // walk player to itemz, then execute 
   
};

// Math helpers for local movement prediction
window.moveZ = function(z, cmd) {
   z = parseInt(z, 10);
   var cols = mapx + 1; // 8
   var total = cols * (mapy + 1); // 96
   var col = z % cols;
   if (cmd === 'Vn' && z - cols >= 0) return z - cols;
   if (cmd === 'Vs' && z + cols < total) return z + cols;
   if (cmd === 'Vw' && col > 0) return z - 1;
   if (cmd === 'Ve' && col < cols - 1) return z + 1;
   return z; 
}

window.reverseMoveZ = function(z, cmd) {
   if (cmd === 'Vn') return window.moveZ(z, 'Vs');
   if (cmd === 'Vs') return window.moveZ(z, 'Vn');
   if (cmd === 'Vw') return window.moveZ(z, 'Ve');
   if (cmd === 'Ve') return window.moveZ(z, 'Vw');
   return z;
}

window.keydown = function(key, e) {
  var keyStr = (typeof e === 'object' && e.key) ? e.key : key;
  
  if (window.playerItem === "Za" || !window.playerItem) return;

  // enter 'look around' mode
  if (keyStr === "l" || keyStr === "L") {
    if (window.gfxDo === "RF") window.gfxDo = "";
    window.gfxDo += "Vl";
  }

  // 1. Block buffering if a non-movement command is currently queued
  if (window.gfxDo && window.gfxDo !== "RF") {
      var isPureMove = true;
      for (var i = 0; i < window.gfxDo.length; i += 2) {
          var chk = window.gfxDo.slice(i, i + 2);
          if (!['Vn', 'Vs', 'Ve', 'Vw'].includes(chk)) {
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
          if ((q[qIdx] === 'Vn' && qRow === 0) ||
              (q[qIdx] === 'Vs' && qRow === mapy) ||
              (q[qIdx] === 'Vw' && qCol === 0) ||
              (q[qIdx] === 'Ve' && qCol === mapx)) {
              return; // We hit a scroll edge in the future, block further input
          }
          testZ = window.moveZ(testZ, q[qIdx]);
      }
  }

  var todo = null;
  switch (keyStr) {
    case "ArrowUp":   case "w": case "W": todo = "Vn"; break;
    case "ArrowDown": case "s": case "S": todo = "Vs"; break;
    case "ArrowLeft": case "a": case "A": todo = "Vw"; break;
    case "ArrowRight":case "d": case "D": todo = "Ve"; break;
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

