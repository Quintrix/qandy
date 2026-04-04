
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
    if (!data.success) return { error: 'Error: ' + (data.error || 'registry request failed') };
    var list = data.servers || [];
    if (list.length === 0) {
      return { list: [], formatted: 'No servers available\n' };
    }
    var out = 'Available Servers:\n\n';
    for (var i = 0; i < list.length; i++) {
      var s = list[i];
      var drives = (s.drives && s.drives.length) ? s.drives.join(',') : 'none';
      out += i +' '+ s.name+'\n';
    }
    return { list: list, formatted: out };
  } catch (e) {
    return { error: 'Error: ' + (e.message || String(e)) };
  }
};

// add support for passing server if already known, if no known server sent then display server list
window.gfxConnect = async function() {
  try {
    await print("\nQandyland Servers:\n\n");
    var res = await gfxServers();

    if (res.error) {
      await print(res.error + "\n");
      throw new Error(res.error);
    }

    // print formatted listing (res.formatted) and keep the actual array in res.list
    await print(res.formatted);

    await print("Enter server to connect to (or press Enter for localhost):\n");
    var i = await input();
    if (i.trim() === "") i = "localhost:8080";

    var s = null;
    // try numeric index first
    var idx = parseInt(i, 10);
    if (!isNaN(idx) && res.list[idx]) {
      s = res.list[idx];
    } else if (i.includes(':')) {
      // treat as host:port input
      var parts = i.split(':');
      s = { name: i, host: parts[0], port: parts[1] || '8080' };
    } else {
      throw new Error('Invalid server selection');
    }

    await print("Connecting to " + s.host+":"+s.port+"...\n");

    var proto = 'http';
    try { proto = new URL(_registryUrl).protocol.replace(':', ''); } catch (e) {}
    _serverUrl = proto + '://' + s.host + ':' + s.port + '/qandyland.js';

    var drive="gfx.js";
    var mapString="A1A2A3A4A5A6A7A8B1B2B3B4B5B6B7N8C1C2C3C4C5C6C7V8D1D2D3D4D5D6D7D8E1E2E3E4E5E6E7E8F1F2F3F4F5F6F7F8G1G2G3G4G5G6G7G8H1H2H3H4H5H6H7H8I1I2I3IAUAIAIAI8J1J2J3J4J5J6J7J8K1K2K3K4K5K6K7K8L1L2L3L4L5L6L7L8";
    var lobbyMap="F4";
    var isRound=false;
    var res = await gfxCreation(drive, mapString, lobbyMap, isRound);
    await print(res);

    await print("Connected successfully!\n");
    return 'Connected to ' + s.name + ' at ' + s.host + ':' + s.port + '\n';
  } catch (error) {
    await print("Connection failed: " + error.message + "\n");
    throw error;
  }
};

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

print("\nQuintrix and Crew Software\nMultiplayer Graphics Engine\n\n");

// Backwards compatibility alias
window.LMap = window.LoadMap;
