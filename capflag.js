RUN="capflag.js";

var gfxConnected = null;

if (typeof window.GFX === "undefined") window.GFX = 0;

// Multiplayer state
var emptySlots = [];        
var rfInterval = null;      
var playerItemId = null;    

window.gameState = 'idle';
window.gfxConsole = window.gfxConsole || [];

window.gfxMoveTo = null;
window.gfxDoThis = "";

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
  z = parseInt(z, 10);
  if (window.playerItem === "Za" || !window.playerItem) return;
  if (isNaN(z)) return;
  if (z === window.playerZ) {
    window.gfxMoveTo = null;
    window.gfxDoThis = "";
    return;
  }
  window.gfxMoveTo = z;
  window.gfxDoThis = "";
}

window.itemdown = function(itemStr) {
  if (!itemStr) return;
  var item = itemStr.slice(0, 2);
  var z = itemStr.substring(2, 4);
  var avatar = itemStr.slice(4);
  if (item.charAt(0)=='S' || item.charAt(0)=='T') {
  	 if (playerItem == "Za") { joinGame(item, z); }
  } 
}

window.objdown = function(objStr) {
  if (!objStr) return;

  var i = objStr.slice(0, 2); 
  var z = objStr.slice(2, 4); 
  var d = objStr.slice(4, 6); 

  if (i === "Yj") { 
    if (playerItem !== "Za" && window.map === "_L") {
      window.gfxMoveTo = parseInt(z, 10);
      window.gfxDoThis = "Qu" + i;
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

window.queueMoveCommand = function(todo) {
  if (!todo) return false;
  if (window.playerItem === "Za" || !window.playerItem) return false;

  // Block buffering if a non-movement command is currently queued
  if (window.gfxDo && window.gfxDo !== "RF") {
    var isPureMove = true;
    for (var i = 0; i < window.gfxDo.length; i += 2) {
      var chk = window.gfxDo.slice(i, i + 2);
      if (!['Qn', 'Qs', 'Qe', 'Qw'].includes(chk)) {
        isPureMove = false;
        break;
      }
    }
    if (!isPureMove) return false;
  }

  // Block buffering if existing queue contains a scroll edge step
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
        return false;
      }
      testZ = window.moveZ(testZ, q[qIdx]);
    }
  }

  if (window.gfxDo === "RF") window.gfxDo = "";
  window.gfxDo += todo;

  if (!window.movingItems) window.movingItems = {};
  if (!window.movingItems[window.playerItem]) {
    window.movingItems[window.playerItem] = { z: window.playerZ, queue: [], avatar: window.playerAvatar };
  }
  window.movingItems[window.playerItem].queue.push(todo);
  return true;
};

window.getQueuedPlayerZ = function() {
  var z = parseInt(window.playerZ, 10);
  if (isNaN(z)) return -1;
  if (window.movingItems && window.movingItems[window.playerItem]) {
    var q = window.movingItems[window.playerItem].queue;
    for (var i = 0; i < q.length; i++) {
      z = window.moveZ(z, q[i]);
    }
  }
  return z;
};

window.getStepTowardZ = function(fromZ, toZ) {
  fromZ = parseInt(fromZ, 10);
  toZ = parseInt(toZ, 10);
  var cols = mapx + 1;
  var fromRow = Math.floor(fromZ / cols);
  var fromCol = fromZ % cols;
  var toRow = Math.floor(toZ / cols);
  var toCol = toZ % cols;
  if (fromRow > toRow) return "Qn";
  if (fromRow < toRow) return "Qs";
  if (fromCol > toCol) return "Qw";
  if (fromCol < toCol) return "Qe";
  return null;
};

window.appendActionCommand = function(cmd) {
  if (!cmd) return false;
  if (!window.gfxDo || window.gfxDo === "RF") {
    window.gfxDo = cmd;
    return true;
  }
  var isPureMove = true;
  for (var i = 0; i < window.gfxDo.length; i += 2) {
    var chk = window.gfxDo.slice(i, i + 2);
    if (!['Qn', 'Qs', 'Qe', 'Qw'].includes(chk)) {
      isPureMove = false;
      break;
    }
  }
  if (!isPureMove) return false;
  window.gfxDo += cmd;
  return true;
};

window.gfxMoveTick = function() {
  if (window.gfxMoveTo === null || window.gfxMoveTo === undefined) return;
  if (window.playerItem === "Za" || !window.playerItem) {
    window.gfxMoveTo = null;
    window.gfxDoThis = "";
    return;
  }
  var currentZ = window.getQueuedPlayerZ();
  if (currentZ < 0) return;

  if (currentZ === window.gfxMoveTo) {
    if (window.gfxDoThis) {
      if (!window.appendActionCommand(window.gfxDoThis)) {
        return; // buffer busy, retry next tick
      }
    }
    window.gfxMoveTo = null;
    window.gfxDoThis = "";
    return;
  }

  var nextCmd = window.getStepTowardZ(currentZ, window.gfxMoveTo);
  if (!nextCmd) {
    window.gfxMoveTo = null;
    window.gfxDoThis = "";
    return;
  }

  window.queueMoveCommand(nextCmd);
};

window.keydown = function(key, e) {
  var keyStr = (typeof e === 'object' && e.key) ? e.key : key;

  if (window.playerItem === "Za" || !window.playerItem) return;

  var todo = null;
  switch (keyStr) {
    case "ArrowUp":   case "w": case "W": todo = "Qn"; break;
    case "ArrowDown": case "s": case "S": todo = "Qs"; break;
    case "ArrowLeft": case "a": case "A": todo = "Qw"; break;
    case "ArrowRight":case "d": case "D": todo = "Qe"; break;
  }

  if (todo) {
    window.gfxMoveTo = null;
    window.gfxDoThis = "";
    window.queueMoveCommand(todo);
  }
};

window.joinGame = async function(item, z) { 
  if (playerItem != "Za") { return; }
  if (playerMap != '_L') { return; }
  playerItem=item; playerZ=z; playerItemId=item; playerZ=z;
  if (window.gfxDo === "RF") window.gfxDo = "";
  window.gfxDo += "Qg" + item + z + playerAvatar;
}