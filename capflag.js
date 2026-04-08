RUN="capflag.js";

var gfxConnected = null;

if (typeof window.GFX === "undefined") window.GFX = 0;

var gfxConnected = null;

// Player state variables for avatar selection
var PName = "Player";
var PObj = "";
var PX = 2;
var PY = 9;
var PZ = 0;
var PUP = "";
var PopForce = "";

qdosScript("gfx.js");
startup();

var ts=3000;
setTimeout(function() { startup(); },200);

function startup(){
  if (window.GFX==0) {
  	 ts=ts-200;
  	 if (ts>0) { 
      setTimeout(function() { 
        startup();
      },200);
    }
    return;
  } else {
    flagConnect();
  }
}

window.flagConnect = async function() {
  try {
    await print("\n");
    await print ("\x1b[97m\x1b[101mQandyland Servers:\x1b[40m\x1b[37m\n\n");

    // Properly capture server selection
    gfxConnected = await flagServers("gfx");
    if (!gfxConnected) {
      await print("Server selection cancelled.\n");
      return 'Connection cancelled';
    }

    await print("\nConnecting "+gfxConnected.host+":"+gfxConnected.port+"...");

    // Fix protocol detection - localhost should use HTTP
    var proto = 'http';
    if (gfxConnected.host !== 'localhost' && gfxConnected.host !== '127.0.0.1') {
      try { proto = new URL(_registryUrl).protocol.replace(':', ''); } catch (e) { proto = 'http'; }
    }
    _serverUrl = proto + '://' + gfxConnected.host + ':' + gfxConnected.port + '/qandyland.js';

    var drive = "gfx";
    var gameState = await gfxPing("GS", {d: drive});
    await print("\nGame state: " + gameState + "\n");

    // Handle "no world" - create one with big bang, then fall through to normal handling
    if (gameState.startsWith("XW")) {
      await print("No world found.\nCreating new world...");
      var mapString = maps('A', 'L', 1, 8);
      var players = "SaSbScTaTbTc";
      var isRound = false;
      gameState = await gfxPing("BB", {d: drive, m: mapString, p: players, f: isRound ? 0 : 1});
      if (gameState.startsWith("XX")) {
        var bbErrorMsg = gameState.substring(2);
        await print("Error creating world: " + bbErrorMsg + "\n");
        return flagConnect();
      }
      await print("\nWorld created. Game state: " + gameState + "\n");
      // Now fall through to normal JS/IP handling
    }

    if (gameState.startsWith("XX")) {
      var errorMsg = gameState.substring(2);
      await print("Error: " + errorMsg + "\n");
      return flagConnect();
    }

    if (gameState.startsWith("IP")) {
      await print("Game in progress. Returning to server selection...\n");
      return flagConnect();
    }

    if (gameState.startsWith("JS")) {
      var manifest = gameState.substring(2);
      var slots = manifest.split('.');
      // Empty slot: exactly 2-char player code with no avatar data (e.g. "Sa")
      // Occupied slot: player code + avatar data (e.g. "SaM3N2L3")
      var emptySlots = slots.filter(function(slot) { return slot.length === 2; });

      if (emptySlots.length === 0) {
        await print("Server full. Returning to server selection...\n");
        return flagConnect();
      }

      await print("Empty slots available: " + emptySlots.length + "\n");

      // Initialize graphics and render lobby map (96 Ga grass tiles)
      var lobbyMap = "Ga".repeat(96);
      await gfxInit();
      gfx(lobbyMap);

      // Start avatar selection
      NewChar("");
      return;
    }
  } catch (error) {
    await print("Connection failed: " + error.message + " " + (gfxConnected ? gfxConnected.host : '') + "\n");
    throw error;
  }
};

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
    char(PName,PObj,PZ); PForce="hidden"; hpop(); mainloop();
  	} else {
    PX=2; PY=9; PZ=(PY*(mapx+1))+PX;
    pop("<p>Male or Female?<br><a href=\"javascript:NewChar(\'M\');\"><img src=\"c/B1.png\" height=128 width=64></a> &nbsp; <a href=\"javascript:NewChar(\'F\');\"><img src=\"c/F5.png\" height=128 width=64></a>");
   }
  }
 }
};

function mainloop() {
 // Avatar selection complete - PObj holds the 4-character avatar string
}

// flagServers.js
// opts: { driveFilter='gfx', prompt, defaultIndex=0, allowCancel=true }
async function flagServers(opts) {
  opts = opts || {};
  const driveFilter = opts.driveFilter || 'gfx';
  const prompt = opts.prompt || "Server [0]? ";
  const defaultIndex = (typeof opts.defaultIndex === 'number') ? opts.defaultIndex : 0;
  const allowCancel = (opts.allowCancel === false) ? false : true;

  // 1) get registry
  var res = await gfxServers();
  if (res.error) { await print(res.error + "\n"); throw new Error(res.error); }

  // 2) build options: injected localhost first, then registry servers that host the drive
  var servers = Array.isArray(res.servers) ? res.servers : (Array.isArray(res.list) ? res.list : []);
  var options = [{ name: 'localhost', host: 'localhost', port: 8080, drives: [] }];
  for (var i = 0; i < servers.length; i++) {
    var s = servers[i];
    if (!s) continue;
    if (!driveFilter || (Array.isArray(s.drives) && s.drives.indexOf(driveFilter) !== -1)) {
      options.push(s);
    }
  }
  window._gfxOptions = options; // optional debug handle

  // 3) print options line-by-line (<=31 chars, alternating greens)
  if (options.length === 0) {
    await print("\x1b[38;5;28mNo servers available\x1b[0m\n");
  } else {
    for (var j = 0; j < options.length; j++) {
      var e = options[j];
      var label = (e.name && String(e.name).trim()) ? String(e.name).trim() : (String(e.host) + ':' + String(e.port || 8080));
      var prefix = String(j) + '. ';
      var maxLabelLen = 31 - prefix.length;
      if (label.length > maxLabelLen) label = label.slice(0, maxLabelLen - 1) + '…';
      var line = prefix + label;
      var color = (j % 2 === 0) ? '\x1b[38;5;28m' : '\x1b[38;5;46m';
      await print(color + line + '\x1b[0m\n');
    }
  }

  // 4) prompt & input loop -> return selected server object
  while (true) {
    await print("\n" + prompt);
    var i = await input();
    i = (typeof i === 'string') ? i.trim() : '';

    if (i === '') {
      // default selects injected localhost (index 0) unless defaultIndex chosen
      var idx = Math.max(0, Math.min(defaultIndex, options.length - 1));
      var chosen = options[idx];
      return { name: chosen.name, host: chosen.host, port: String(chosen.port || 8080), raw: chosen };
    }

    // numeric index
    var n = parseInt(i, 10);
    if (!isNaN(n) && options[n]) {
      var s = options[n];
      return { name: s.name, host: s.host, port: String(s.port || 8080), raw: s };
    }

    // host:port typed directly
    if (i.indexOf(':') !== -1) {
      var parts = i.split(':');
      return { name: i, host: parts[0], port: String(parts[1] || '8080'), raw: { name: i, host: parts[0], port: parts[1] } };
    }

    // cancel
    if (allowCancel && (i.toLowerCase() === 'q' || i.toLowerCase() === 'quit' || i.toLowerCase() === 'c')) {
      return null;
    }

    await print("Invalid selection. Enter a number, host:port, or press Enter for default.\n");
  }
}

async function flagCreate() {
  var drive="gfx";
  var mapString="A1A2A3A4A5A6A7A8B1B2B3B4B5B6B7N8C1C2C3C4C5C6C7V8D1D2D3D4D5D6D7D8E1E2E3E4E5E6E7E8F1F2F3F4F5F6F7F8G1G2G3G4G5G6G7G8H1H2H3H4H5H6H7H8I1I2I3IAUAIAIAI8J1J2J3J4J5J6J7J8K1K2K3K4K5K6K7K8L1L2L3L4L5L6L7L8";
  var players="SaSbScTaTbTc";
  var isRound=false;
  var res = await gfxPing("BB", {d: drive, m: mapString, p: players, f: isRound ? 0 : 1});
  await print(res);
}
