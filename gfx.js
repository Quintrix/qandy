
window.GFX = 0; // set to true when gfx.js ready to use

var PopAlign = "click"; // "center", "click"
var PopUpVis = "hidden"; // current target visibility
var PForce = "hidden";   // forced visibility on mouseout in your original code
var PUV;                 // timeout id (used to clear/set the timeout)

var mapx=7;
var mapy=11;

var _serverUrl = 'http://localhost:8080/qandyland.js';
var _registryUrl = 'https://qandy.vercel.app/api/servers';

// Initialization state tracking
window._gfxInitialized = false;
window._gfxInitializing = false;
window._gfxInitQueue = []; // Pending callbacks waiting for initialization

window.gfxInit = async function() {
  if (window._gfxInitialized) { return; }
  if (window._gfxInitializing) {
    // Queue a promise that resolves when current initialization completes
    return new Promise(function(resolve) { window._gfxInitQueue.push(resolve); });
  }
  window._gfxInitializing = true;
  try {
    await qdosScript('gfx-itemid.js');
    window.tiles();
    window._gfxInitialized = true;
  } catch(e) {
    console.error('Error: gfxInit()', e);
  } finally {
    window._gfxInitializing = false;
    // Resolve all queued callers
    var queue = window._gfxInitQueue.splice(0);
    for (var i = 0; i < queue.length; i++) { queue[i](); }
  }
  const style = document.createElement('style');
  style.textContent = `
  .pop { position:absolute; top:260; left:190; z-index:249;
         font-family: arial; font-size: 14px; weight: bold;
         color: navy; background-color: #999; visibility:hidden;
         text-align: center;
         padding-top: 0px; padding-bottom: 0px;  
         padding-right: 4px; padding-left: 4px; }
  .tile { position: absolute; top: 0px; left: 0px; }
  .item { position: absolute; top: 0px; left: 0px; }
  .char { position: absolute; top: 0px; left: 0px; }
  `;
  document.head.appendChild(style);

  const popup = document.createElement('div');
  popup.id = 'pop';
  popup.className = 'pop';
  popup.style.visibility = PopUpVis;
  popup.addEventListener('mouseover', () => {
    PopUpVis = "visible";
    popup.style.visibility = PopUpVis;
  });
  popup.addEventListener('mouseout', () => {
    PopUpVis = PForce;
    clearTimeout(PUV);
    PUV = setTimeout(() => { popup.style.visibility = PopUpVis; }, 100);
  });
  document.body.appendChild(popup);
};

window.tiles = function() {
  // Use the host's map dimensions, but the tile count is mapx+1, mapy+1
  const tileCountX = (typeof mapx !== 'undefined') ? mapx + 1 : 7;
  const tileCountY = (typeof mapy !== 'undefined') ? mapy + 1 : 11;

  let topOffset = 50;
  let leftOffset = 54;

  // remove any existing tiles
  let cleanupIndex = 0;
  while (true) {
    const old = document.getElementById('T' + cleanupIndex);
    if (!old) break;
    old.parentNode && old.parentNode.removeChild(old);
    cleanupIndex++;
  }

  // create tiles: 0 to mapx = mapx+1 tiles, 0 to mapy = mapy+1 tiles
  for (let z=0, y=0; y < tileCountY; y++) {
    for (let x=0; x < tileCountX; x++, z++) {
      const t=document.createElement('img');
      t.id = 'T' + z;
      t.src = 't/Ga.png';
      t.style.height = '32px';
      t.style.width = '32px';
      t.className = 'tile';
      t.style.position = 'absolute';
      t.style.top = (topOffset + y * 32) + 'px';
      t.style.left = (leftOffset + x * 32) + 'px';
      t.style.zIndex = '10';
      const tileZ = z;
      t.onclick = function() { dispatchZClick(tileZ, t); };
      document.body.appendChild(t);
    }
  }
};

window.gfx = function(scr) { 
 a=0;
 for (b=0; b<=mapy; b++) { 
  for (c=0; c<=mapx; c++) {
  	 e=document.getElementById("T"+a).src="t/"+scr.charAt(a*2)+scr.charAt((a*2)+1)+".png";
  	 a++;
  }
 }
}

window.hpop=function() { document.getElementById("pop").style.visibility="hidden"; }

window.pop=function(htm) {
  const popup = document.getElementById("pop");
  popup.innerHTML = "<p>" + htm;
  
  const TopYPos = 32 + 22; 
  const TopXPos = 32 + 22;
  
  // Get popup dimensions after setting content
  popup.style.visibility = "visible"; // Make visible to measure
  const popupWidth = popup.offsetWidth;
  const popupHeight = popup.offsetHeight;
  
  let PopX, PopY;
  
  switch (PopAlign) {
    case "center":
      // Center on the 256x384 game screen
      PopX = TopXPos + ((256 - popupWidth) / 2);
      PopY = TopYPos + ((384 - popupHeight) / 2);
      break;
      
    case "click":
      // Display at the clicked z-location
      if (typeof lastClickedZ !== 'undefined') {
        const clickY = Math.floor(lastClickedZ / (mapx + 1));
        const clickX = lastClickedZ - (clickY * (mapx + 1));
        PopX = TopXPos + (clickX * 32);
        PopY = TopYPos + (clickY * 32);
        
        // Keep popup within screen bounds
        if (PopX + popupWidth > TopXPos + 256) {
          PopX = TopXPos + 256 - popupWidth;
        }
        if (PopY + popupHeight > TopYPos + 384) {
          PopY = TopYPos + 384 - popupHeight;
        }
        if (PopX < TopXPos) PopX = TopXPos;
      } else {
        // Fallback to center if no click location
        PopX = TopXPos + ((256 - popupWidth) / 2);
        if (PopY < TopYPos) PopY = TopYPos;
        PopY = TopYPos + ((384 - popupHeight) / 2);
      }
      break;
      
    default:
      // Default to center
      PopX = TopXPos + ((256 - popupWidth) / 2);
      PopY = TopYPos + ((384 - popupHeight) / 2);
  }
  
  popup.style.top = PopY + "px";
  popup.style.left = PopX + "px";
}

window.char = function(C,O,Z) {
 let y=Math.floor(Z/(mapx+1)); let x=Z-(y*(mapx+1)); y--;
 idface="cf"+C; idbody="cb"+C; idwpn="cw"+C; idarm="ca"+C; idhat="ch"+C;
 face=""; body=""; wpn=""; arm=""; hat="";

 if (O.indexOf("A")>-1) { face="A"+O.charAt(O.indexOf("A")+1); }
 if (O.indexOf("B")>-1) { face="B"+O.charAt(O.indexOf("B")+1); }
 if (O.indexOf("E")>-1) { face="E"+O.charAt(O.indexOf("E")+1); }
 if (O.indexOf("F")>-1) { face="F"+O.charAt(O.indexOf("F")+1); }

 if (O.indexOf("C")>-1) { body="C"+O.charAt(O.indexOf("C")+1); }
 if (O.indexOf("D")>-1) { body="D"+O.charAt(O.indexOf("D")+1); }
 if (O.indexOf("G")>-1) { body="G"+O.charAt(O.indexOf("G")+1); }
 if (O.indexOf("H")>-1) { body="H"+O.charAt(O.indexOf("H")+1); }

 if (document.getElementById("cb"+C)) {
  e=document.getElementById("cb"+C).src="c/"+body+".png";
  e=document.getElementById("cb"+C).style.top=32+22+(y*32)+"px";
  e=document.getElementById("cb"+C).style.left=(32+22+(x*32))+"px";
 } else {
  let chr=document.createElement("img");
  chr.id="cb"+C; chr.src="c/"+body+".png";
  chr.className="char";  
  chr.style.position="absolute"; chr.style.height=64; chr.style.width=32;
  chr.style.top=32+22+(y*32)+"px"; chr.style.left=(32+22+(x*32))+"px";
  chr.onclick=function(){dispatchZClick(Z,this);};
  chr.style.zIndex="150";  
  document.body.appendChild(chr);
 }
 if (document.getElementById("cf"+C)) {
  e=document.getElementById("cf"+C).src="c/"+face+".png";
  e=document.getElementById("cf"+C).style.top=32+22+(y*32)+"px";
  e=document.getElementById("cf"+C).style.left=(32+22+(x*32))+"px";
 } else {
  let chr=document.createElement("img");
  chr.id="cf"+C; chr.src="c/"+face+".png";
  chr.className="char";  
  chr.style.position="absolute"; chr.style.height=64; chr.style.width=32;
  chr.style.top=32+22+(y*32)+"px"; chr.style.left=(32+22+(x*32))+"px";
  chr.onclick=function(){dispatchZClick(Z,this);};
  chr.style.zIndex="151";
  document.body.appendChild(chr);
 }

 if (O.indexOf("I")>-1) { hat="I"+O.charAt(O.indexOf("I")+1); }
 if (O.indexOf("J")>-1) { hat="J"+O.charAt(O.indexOf("J")+1); }
 if (hat) {
  if (document.getElementById("ch"+C)) {
   e=document.getElementById("ch"+C).src="c/"+hat+".png";
   e=document.getElementById("ch"+C).style.top=32+22+(y*32)+"px";
   e=document.getElementById("ch"+C).style.left=(32+22+(x*32))+"px";
  } else {
   let chr=document.createElement("img");
   chr.id="ch"+C; chr.src="c/"+hat+".png";
   chr.className="char";  
   chr.style.position="absolute"; chr.style.height=64; chr.style.width=32;
   chr.style.top=32+22+(y*32)+"px"; chr.style.left=(32+22+(x*32))+"px";
   chr.onclick=function(){dispatchZClick(Z,this);};
   chr.style.zIndex="152";
   document.body.appendChild(chr);
  } 
 } else {
  if (document.getElementById("ch"+PName)) { document.getElementById("ch"+PName).remove(); } 
 }
}

window.dispatchZClick=function(z, clickedElement) {
  // Store the clicked location for popup positioning
  window.lastClickedZ = z;
  
  let y = Math.floor(z / (mapx + 1)); 
  let x = z - (y * (mapx + 1));
  let itemType = 'tile';
  
  if (clickedElement) {
    if (clickedElement.className === 'char') {
      itemType = 'character';
    } else if (clickedElement.id && clickedElement.id.charAt(0) === 'i' &&
               clickedElement.id.length > 1 && !isNaN(parseInt(clickedElement.id.charAt(1), 10))) {
      itemType = 'item';
    } else if (clickedElement.id && clickedElement.id.charAt(0) === 'd' &&
               clickedElement.id.length > 1 && !isNaN(parseInt(clickedElement.id.charAt(1), 10))) {
      itemType = 'droppedItem';
    }
  }
  
  const event = new CustomEvent('zclick', {
    detail: {
      z: z,
      x: x,
      y: y,
      itemType: itemType,
      itemData: {},
      clickedElement: clickedElement
    }
  });
  document.dispatchEvent(event);
  if (typeof window.zclick === 'function') {
    window.zclick(z, event);
  }
}

window.gfxServers = async function() {
  var url = _registryUrl;
  if (!url) return { error: 'Error: no registry URL configured' };
  try {
    var response = await fetch(url, { method: 'GET' });
    if (!response.ok) return { error: 'Error: registry responded with ' + response.status };
    var data = await response.json();
    // Validate shape minimally
    if (!data || !Array.isArray(data.servers)) return { error: 'Error: invalid registry format' };
    return data; // e.g. { success: true, servers: [ ... ] }
  } catch (e) {
    return { error: 'Error: ' + (e.message || String(e)) };
  }
};

function maps(startChar,endChar,startNum,endNum) {
  const startCode = startChar.charCodeAt(0);
  const endCode = endChar.charCodeAt(0);
  let out = '';
  for (let code = startCode; code <= endCode; code++) {
    const letter = String.fromCharCode(code);
    for (let n = startNum; n <= endNum; n++) {
      out += letter + n;
    }
  }
  return out;
}

async function checkWorldExists() {
  try {
    var result = await qdosServerExists("capflag.js/A1/a.txt");
    return result === true;
  } catch (e) {
    return false;
  }
}

async function loadWorldConfig() {
  try {
    // Load essential config files
    var aConfig = await qdosServerLoad("capflag.js/A1/a.txt");
    var mTiles = await qdosServerLoad("capflag.js/A1/m.txt");
    
    // Store globally for gfx engine
    window.worldConfig = aConfig;
    window.currentMapData = mTiles;
    
  } catch (error) {
    throw new Error("Failed to load world config: " + error.message);
  }
}

async function renderMap(mapId) {
  try {
    // Load map tile data
    var mapData = await qdosServerLoad("capflag.js/" + mapId + "/m.txt");
    
    // Initialize graphics if not done
    if (!gfxInitialized) {
      await initializeGfx();
    }
    
    // Render the tiles
    gfx(mapData);
    
    // Load and render any existing items on this map
    await renderMapItems(mapId);
    
  } catch (error) {
    throw new Error("Failed to render map: " + error.message);
  }
}

async function renderMapItems(mapId) {
  try {
    // Get directory listing for this map
    var items = await qdosServerList("capflag.js/" + mapId + "/");
    
    // Filter for item files (two-char codes + position + .json)
    var itemFiles = items.split('\n').filter(f => 
      f.length > 6 && f.endsWith('.json') && 
      f.match(/^[A-Z][a-z]\d+\.json$/)
    );
    
    // Render each item
    for (var file of itemFiles) {
      await renderItem(mapId, file);
    }
    
  } catch (error) {
    console.warn("Failed to render items:", error.message);
  }
}

async function createPlayerOnServer(avatar, mapId, zPos) {
  try {
    var playerData = {
      name: PName,
      avatar: avatar,
      map: mapId,
      position: zPos,
      created: Date.now()
    };
    
    // Create player file in map directory
    var playerFile = "capflag.js/" + mapId + "/player_" + PName + ".json";
    await qdosServerSave(playerFile, JSON.stringify(playerData));
    
    // Add player to map's player list
    var players = await qdosServerLoad("capflag.js/" + mapId + "/p.txt");
    if (players && !players.includes(PName)) {
      players += (players ? "," : "") + PName;
      await qdosServerSave("capflag.js/" + mapId + "/p.txt", players);
    }
    
  } catch (error) {
    throw new Error("Failed to create player on server: " + error.message);
  }
}




window.LoadMap = async function(a) {
 if (maps[a]) {} else { maps[a]="UaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUa.."; }
 gfx(maps[a]);
 items=[]; if (maps[a].length>194) { ilist=maps[a].substring(194).match(/.{1,6}/g); }
 for (b=0;b<ilist.length;b++) {
  i=ilist[b].substring(0,2);
  z=ilist[b].substring(2,4);
  d=ilist[b].substring(4,6);
  y=Math.floor(z/(mapx+1));
  x=z-(y*(mapx+1));
  c=document.createElement("img");
  c.id="i"+b;
  c.src="i/"+ilist[b].substring(0,2)+".png";
  c.style.position="absolute";
  c.style.top=32+20+(y*32)+"px";
  c.style.left=(32+22+(x*32))+"px";
  c.style.zIndex="120";
  c.onload = () => { c.style.top = parseInt(c.style.top) - (c.height - 32) + "px"; c.style.left = parseInt(c.style.left) - (c.width - 32) + "px"; };
  (function(itemZ){c.onmousedown=function(){dispatchZClick(parseInt(itemZ,10),this);};})(z);
  document.body.appendChild(c);
 }
 RefDItems();
 if (PName && PObj) { 
  try { 

   await qdosSave('player-name', PName);
   await qdosSave('player-obj', PObj);
   await qdosSave('player-wear', PWear);
   await qdosSave('player-inv', PInv);
   await qdosSave('player-map', PMap);
   await qdosSave('player-z', String(PZ));
  } catch(e) {}
 }
 return maps[a];
}

//   drive     – server drive to build world on (e.g. "gfx.js")
//   mapString – topology string, e.g. "A1A2A3B1B2B3"
//   lobbyMap  – 2-char map ID where all players start, e.g. "A1"
//   isRound   – true if world edges wrap (A↔Z, 1↔9); false for flat world

window.gfxCreation = async function(drive, mapString, lobbyMap, isRound) {
  if (!drive)     throw new Error('gfxBigBang: drive is required');
  if (!mapString) throw new Error('gfxBigBang: mapString is required');
  if (!lobbyMap)  throw new Error('gfxBigBang: lobbyMap is required');

  var payload = {
    method:    'bigbang',
    drive:     String(drive),
    mapString: String(mapString),
    lobbyMap:  String(lobbyMap),
    isRound:   isRound === true || isRound === 'true'
  };

  try {
    var response = await fetch(_serverUrl, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload)
    });
    if (!response.ok) {
      throw new Error('Server error: ' + response.status);
    }
    var result = await response.json();
    if (!result.success) {
      throw new Error(result.error || 'bigbang failed');
    }
    return result;
  } catch (e) {
    throw new Error('gfxBigBang: ' + (e.message || String(e)));
  }
};

splash(1000);
async function splash(durationMs) {
  _CURSOR=CURSOR; CURSOR=0;
  await print("\n\n\n");
  header="Quintrix and Crew Software";
  footer="Multiplayer Graphics Engine";
  const L1 = header.split('');
  const L2 = footer.split('');
  // State: 0=Black, 1=Dark(22), 2=Mid(28), 3=Bright(46)
  let state1 = new Array(L1.length).fill(0);
  let state2 = new Array(L2.length).fill(0);
  const colors = ["\x1b[30m", "\x1b[38;5;22m", "\x1b[38;5;28m", "\x1b[38;5;46m"];
  const startTime = Date.now();
  while (state1.concat(state2).some(s => s < 3)) {
    let output = "\x1b[2A"; // Move up to overwrite
    // Randomly "evolve" characters
    for (let i = 0; i < state1.length; i++) {
      if (state1[i] < 3 && Math.random() > 0.8) state1[i]++;
      output += colors[state1[i]] + L1[i];
    }
    output += "\n";
    for (let i = 0; i < state2.length; i++) {
      if (state2[i] < 3 && Math.random() > 0.8) state2[i]++;
      output += colors[state2[i]] + L2[i];
    }
    if (CURMORE>-1) { CURMORE=0; }
    // beeping sound effects
    //if (Math.random() > 0.2) { 
    //  // High-pitched, very short blips (800Hz to 1200Hz)
    //  let freq = 700 + Math.floor(Math.random() * 400);
    //  beep(freq, 10); // 20ms duration is a sharp 'click' or 'tick'
    //}
    await print(output + "\x1b[0m\n");
    await sleep(40); // Fast enough to look like data "streaming" in
    // Safety timeout to prevent infinite loops
    if (Date.now() - startTime > durationMs) break; 
  }
  await print("\x1b[2A\x1b[38;5;46m"+header+"\n"+footer+"\x1b[0m\n");
  CURSOR=_CURSOR; await print("\n");
  window.GFX=1;
}

// Backwards compatibility alias
window.LMap = window.LoadMap;
