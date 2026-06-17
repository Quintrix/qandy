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
  	 window.map="Fb"; // first map displayed
    window.PopAlign = "center"; // "center", "click", or "full"
    window.PopUpVis = "visible"; // current target visibility
    window.PopForce = "visible";   // forced visibility on mouseout
    window.lastClickedZ = 0;     // last grid coordinate clicked
  	 window.gfxDrive = 'capflag.gfx';
    var gameState = await gfxConnect(0);

    window.PopForce = "hidden";   // hidden popup on mouseout
    setTimeout(function() {
    	pop("<p align=center>Capture the Flag<p align=center>Select player<br>hat to join team!");
    }, 1000);
  }
}

function mainloop() {}

window.zdown = function(z) {
  // Logic for walking or targeting a tile
  console.log("Player clicked tile:", z);
};

window.invdown = function(code) {
  window.PopForce = "hidden";   // hidden popup on mouseout
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
      PUP += `<a href="gfx:SDVd${item}">Drop</a> &nbsp `;
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
      let zStr = (playerZ < 10 ? '0' : '') + playerZ;
      window.gfxDo += "ID" + playerItem.substring(0,2) + zStr + playerItem.substring(2);
      return;
    }
  }
  
  // Build the outputStats string (e.g., "Wm 99")
  for (let stat in statCounts) {
  	 if (stat != "Za") {
  	 	let type=stat;
      if (type=="Wm") { type="Moves"; }
  	 	if (type=="Wa") { type="Armband"; }
      outputStats += `${type} ${statCounts[stat]}<br>`;
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

window.serverdown = function(code) {
  window.PopForce = "hidden";   // hidden popup on mouseout
  hpop();
  // executes any punch code the server sends the client
  // will allow each game to customize all aspects of the game
  console.log('serverdown() code='+code);
  // capflag.js:42 serverdown() code=VaSa--
  let column = 0; 

  while (column < code.length) {
    var verb = code.substring(column, column + 2); column += 2;
  
    if (verb === "Va") {
    	// Va--     <- avatar = text between Va and -- (in this case null)
      // extract avatar capflagAvatar(team+avatar);
      // call capflagAvatar(avatar);
      capflagAvatar("");
    }

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

// avatar = 'Va'     -> gfx.js:256 gfxPong=SPVa--RFH144Sa44AaAa
window.capflagAvatar = function(avatar) {
  let hat="";
  let body="";
  
  if (playerItem === "Sa") { body="D3"; hat="J0"; }
  if (playerItem === "Sb") { body="D0"; hat="J1"; }

  let PUP = "<p align=center>Select Face:<p align=center>";

  if (body && hat) {
    PUP += `<a href="gfx:SDVAB0${body}${hat}--"><img src="c/B0.png" height=32 width=32></a> &nbsp; `;
    PUP += `<a href="gfx:SDVAB1${body}${hat}--"><img src="c/B1.png" height=32 width=32></a> &nbsp; `;
    PUP += `<a href="gfx:SDVAB2${body}${hat}--"><img src="c/B2.png" height=32 width=32></a><br>`;
    PUP += `<a href="gfx:SDVAB3${body}${hat}--"><img src="c/B3.png" height=32 width=32></a> &nbsp; `;
    PUP += `<a href="gfx:SDVAB4${body}${hat}--"><img src="c/B4.png" height=32 width=32></a> &nbsp; `;
    PUP += `<a href="gfx:SDVAB5${body}${hat}--"><img src="c/B5.png" height=32 width=32></a> &nbsp; `;
    PUP += `<a href="gfx:SDVAB6${body}${hat}--"><img src="c/B6.png" height=32 width=32></a><p>`;

    // change to female bodies
    if (playerItem === "Sa") { body="H3";  }
    if (playerItem === "Sb") { body="H0";  }
    
    PUP += `<p align=center>`;
    PUP += `<a href="gfx:SDVA${avatar}F0H0I1--"><img src="c/F0.png" height=32 width=32></a> &nbsp; `;
    PUP += `<a href="gfx:SDVA${avatar}F1H0I1--"><img src="c/F1.png" height=32 width=32></a> &nbsp; `;
    PUP += `<a href="gfx:SDVA${avatar}F2H0I1--"><img src="c/F2.png" height=32 width=32></a><br>`;
    PUP += `<a href="gfx:SDVA${avatar}F3H0I1--"><img src="c/F3.png" height=32 width=32></a> &nbsp; `;
    PUP += `<a href="gfx:SDVA${avatar}F4H0I1--"><img src="c/F4.png" height=32 width=32></a> &nbsp; `;
    PUP += `<a href="gfx:SDVA${avatar}F5H0I1--"><img src="c/F5.png" height=32 width=32></a> &nbsp; `;
    PUP += `<a href="gfx:SDVA${avatar}F6H0I1--"><img src="c/F6.png" height=32 width=32></a><p>`;
  } else {
  	 PUP="<p align=center><font color=red>ERROR:</font><br>No Team Item Selected";
  }
  window.PopForce = "visible"; 
  pop(PUP);
  return;

}	

window.itemdown = function(code) {
  window.PopForce = "hidden";   // hidden popup on mouseout
  hpop();
  var itemid = code.substring(0, 2);
  var itemz = code.substring(2, 4);
  var uniqueid = code.length >= 8 ? code.substring(4, 8) : "";

  if (itemid === "VA") {
    // Pass the remainder of the code after "VA" (e.g. "Sa" or "SaB0")
    // capflagAvatar(code.substring(2));
    return;
  }

  if (itemid >= 'Sa' && itemid <= 'Sd') {
    if (playerItem === "Za") {
      // player has not seclected a player item
      window.gfxDo += "ID" + itemid + itemz;
      return;
    }
    // Check if the player clicked THEMSELVES
    // this check is failing
    if (itemid+uniqueid === playerItem) { 
      invdown(""); // Request local inventory from server
    } else {
      // They clicked ANOTHER player -> Show Profile Menu
      let PUP = `<div align="center">`;
      PUP += `<b>${gfxItemID(itemid)}</b><br>`;
      PUP += `<span style="font-size:10px;color:gray;">UID: ${uniqueid}</span><p>`;

      // Hook custom server punches for interaction here:
      PUP += `<a href="gfx:ID${itemid}${uniqueid}">Profile Player</a><br>`;
      PUP += `</div>`;
      
      pop(PUP);	
    }    	  
    return;
  }  

  if (playerZ != itemz)  {
  	 // walk player to item then set gfxDo
  } else {
  	 console.log("gfxDo="+gfxDo);
    window.gfxDo += "ID" + itemid + itemz;
  }
}

window.objdown = function(code) {
  hpop();
  var itemid = code.substring(0, 2); 
  var itemz = code.substring(2, 4); 
  console.log("objdown -> code="+code);

  // walk player to itemz, then execute
  gfxDo="OD" + itemid + itemz;
   
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
  hpop();
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

