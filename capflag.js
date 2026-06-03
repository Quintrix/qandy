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

window.serverdown = function(code) {
  // executes any punch code the server sends the client
  // will allow each game to customize all aspects of the game
  console.log('serverdown() code='+code);
    
  let column = 0; 

  while (column < code.length) {
    var verb = code.substring(column, column + 2); column += 2;
  
    if (verb === "Va") { gfxSelectAvatar(itemz); }

    if (verb === "Vr") {
    	let noun = code.substring(column, column + 2); column += 2;
      let zloc = code.substring(column, column + 2); column += 2;
      let numericZ = parseInt(zloc, 10);
      let targetObj = document.getElementById('obj_' + noun + '_' + numericZ);
      // If it exists on the current map, remove it
      if (targetObj) { targetObj.remove(); }
    }  

    if (verb === "Vi") { 
      let nextDotDot = code.indexOf("..", column);
      if (nextDotDot < 0) {
        items = code.substring(column, code.length);
        column = code.length;
      } else {
        items = code.substring(column, nextDotDot);
        column = nextDotDot + 2;
      }
      invdown(items);
    }  
  }
  
  return;
}

window.invdown = function(code) {
  console.log("invdown() items="+items);
  let column = 0; 
  let outputItems = "";
  let outputStats = ""
  let statCounts = {}; // Dictionary to tally up multiples of the same stat

  if (code) {
    if (code.charAt(0) === '-') {
    	// clicked a single item on the inventory display
    	item=code.substring(1,3);
    	items=code.substring(3);
    	desc=gfxItemID(item);
    	console.log("inventory down: item="+item+" items = "+items);
    	let PUP = `<div align="center">`;
    	PUP += `${desc}<p>`;
      PUP += `<img src="i/${item}.png" height="32" width="32"><p>`;
      PUP += `<a href="gfx:ID${playerItem}${playerZ}">Drop</a> &nbsp `;
      PUP += `<a href="gfx:ID${playerItem}${playerZ}">Back</a>`;
      PUP += `</div>`;
      pop(PUP);
    	return;
    }
    	
    while (column < items.length) {
      var verb = items.substring(column, column + 2); 
      column += 2;
      // Items less than 'Qa' are standard visual inventory items
      if (verb < "Qa") {
        // Add item image 'i/[verb].png' to outputItems
        // Click calls gfxDisplayInv(item) and prevents default anchor jumping
        outputItems += `<a href="gfx:IN-${verb}${items}">`;
        outputItems += `<img src="i/${verb}.png" height="32" width="32" alt="${verb}"></a> &nbsp; `;
      } else {
        // Items 'Qa' and above are stats. Increment their count.
        num = items.substring(column, column + 2);
        if (num.charAt(0) >= "A" && num.charAt(0) <="Z") {
          // if not a numeral, do NOT advnace read head and add 1 to stat count
          statCounts[verb] = (statCounts[verb] || 0) + 1;
        } else {
        	  column += 2;
        	  statCounts[verb] = (statCounts[verb] || 0) + parseInt(num, 10);
         }
      }
    }
  } else {
  	 // request player's inventory from server
  	 if (playerItem != "Za") {
  	   gfxDo="ID"+playerItem+playerZ;
  	   return;
  	 }
  }  	

  // Build the outputStats string (e.g., "Wm 99")
  for (let stat in statCounts) {
  	 if (stat != "Za") {
      outputStats += `${stat} ${statCounts[stat]}<br>`;
    }
  }

  // Combine them, putting the stats at the beginning of the output
  let output = outputStats;
  if (outputStats !== "" && outputItems !== "") {
    output += "<p>"; // Add some spacing between stats and items if both exist
  }
  output += outputItems;
  
  // Display using the engine's standard popup
  pop(output);  
}

window.gfxSelectAvatar = function(a) {

 window.PopAlign = "center";
 window.PopUpVis = "hidden";
 window.PopForce = "visible"; 

 if (a=="00") {
  PUP="Select Character:<p>";
  PUP=PUP+"<a href=\"gfx:VAB0\"><img src=\"c/B0.png\" height=64 width=32></a> &nbsp; ";
  PUP=PUP+"<a href=\"gfx:VAB1\"><img src=\"c/B1.png\" height=64 width=32></a> &nbsp; ";
  PUP=PUP+"<a href=\"gfx:VAB2\"><img src=\"c/B2.png\" height=64 width=32></a><br>";
  PUP=PUP+"<a href=\"gfx:VAB3\"><img src=\"c/B3.png\" height=64 width=32></a> &nbsp; ";
  PUP=PUP+"<a href=\"gfx:VAB4\"><img src=\"c/B4.png\" height=64 width=32></a> &nbsp; ";
  PUP=PUP+"<a href=\"gfx:VAB5\"><img src=\"c/B5.png\" height=64 width=32></a> &nbsp; ";
  PUP=PUP+"<a href=\"gfx:VAB6\"><img src=\"c/B6.png\" height=64 width=32></a><p>";
  PUP=PUP+"<a href=\"gfx:VA\">Go Back</a><p>";
  pop(PUP);
 } else {
  if (a=="01") {
   PUP="Select Character:<p>";
   PUP=PUP+"<a href=\"gfx:VAF0\"><img src=\"c/F0.png\" height=64 width=32></a> &nbsp; ";
   PUP=PUP+"<a href=\"gfx:VAF1\"><img src=\"c/F1.png\" height=64 width=32></a> &nbsp; ";
   PUP=PUP+"<a href=\"gfx:VAF2\"><img src=\"c/F2.png\" height=64 width=32></a><br>";
   PUP=PUP+"<a href=\"gfx:VAF3\"><img src=\"c/F3.png\" height=64 width=32></a> &nbsp; ";
   PUP=PUP+"<a href=\"gfx:VAF4\"><img src=\"c/F4.png\" height=64 width=32></a> &nbsp; ";
   PUP=PUP+"<a href=\"gfx:VAF5\"><img src=\"c/F5.png\" height=64 width=32></a> &nbsp; ";
   PUP=PUP+"<a href=\"gfx:VAF6\"><img src=\"c/F6.png\" height=64 width=32></a><p>";
   PUP=PUP+"<a href=\"gfx:VA;\">Go Back</a><p>";
   pop(PUP);
  } else {
  	if (a.length==2) {
  	 if (a.charAt(0)=="F") { PObj=a+"H0"; } else { PObj=a+"D0"; }
  	 gfxDo="VA"+PObj+"..";
    PopForce = "hidden";
    window.lastClickedZ=42; PopAlign='click';
    pop("Tag Flagpole<br>join game!");
  	} else {
    PX=2; PY=9; PZ=(PY*(mapx+1))+PX;
    PUP="<p align=center>Male or Female?<br>";
    PUP=PUP+'<a href=\"gfx:VA00\"><img src=\"c/B1.png\" height=128 width=64></a>';
    PUP=PUP+'&nbsp;&nbsp;&nbsp;'; 
    PUP=PUP+'<a href=\"gfx:VA01\"><img src=\"c/F5.png\" height=128 width=64></a>';
    pop(PUP);
   }
  }
 }
}

window.itemdown = function(code) {
  hpop();
  var itemid = code.substring(0, 2);
  var itemz = code.substring(2, 4);
  console.log("itemdown() code="+code+" itemid="+itemid+" playerZ="+playerZ+" itemz="+itemz); 
  if (itemid === "VA") {
  	 gfxSelectAvatar(itemz);
  	 return;
  }
  // items Sa-Tz are player items
  if (itemid >= 'Sa' && itemid < 'Ua') {
    playerdown(itemid, itemz);
    return;
  }
  if (playerZ != itemz)  {
  	 // walk player to item then set gfxDo
  } else {
  	 console.log("gfxDo="+gfxDo);
    window.gfxDo += "ID" + itemid + itemz;
  }
}

window.playerdown = function(itemid, itemz) {
  console.log("playerdown() itemid="+itemid+" itemz="+itemz);
  if (playerItem === "Za") {
  	 // player has not seclected a player item
  	 window.gfxDo += "ID" + itemid + itemz;
  	 return;
  }
  if (itemid === playerItem) { 
    // display inventory
    invdown();
  } else {
    pop("profile "+itemid+itemz);	
  }    	  
  return;
}

window.objdown = function(code) {
  hpop();
  var itemid = code.substring(0, 2); 
  var itemz = code.substring(2, 4); 
  console.log("objdown -> code="+code);
  
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

