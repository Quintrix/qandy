RUN="capflag.js";

if (typeof window.GFX === "undefined") window.GFX = 0;

qdosScript("gfx.js");
startup();

var ts=3000;
setTimeout(function() { startup(); },200);

function startup(){
  if (GFX==0) {
  	 console.log(ts);
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
    print ("\x1b[97m\x1b[101mQandyland Servers:\x1b[40m\x1b[37m\n\n");
    var res = await gfxServers();

    if (res.error) {
      await print(res.error + "\n");
      throw new Error(res.error);
    }

    // print formatted listing (res.formatted) and keep the actual array in res.list
    await print(res.formatted);

    await print("\nConnect to which server [0]? ");
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
    var proto = 'http';
    _serverUrl = proto + '://' + s.host + ':' + s.port + '/qandyland.js';

    var drive="gfx.js";
    var mapString=maps('A', 'L', 1, 8);
    var lobbyMap="F4";
    var isRound=false;

    // trying to inject creation to create first world
    var res = await gfxCreation(drive, mapString, lobbyMap, isRound);
    await print(res);
    
    await print("Connected successfully!\n");
    return 'Connected to ' + s.name + ' at ' + s.host + ':' + s.port + '\n';
  } catch (error) {
    await print("Connection failed: " + error.message + " "+(typeof s !== 'undefined' && s ? s.host : '')+ "\n");
    throw error;
  }
};








async function flagCreate() {
  var drive="gfx.js";
  var mapString="A1A2A3A4A5A6A7A8B1B2B3B4B5B6B7N8C1C2C3C4C5C6C7V8D1D2D3D4D5D6D7D8E1E2E3E4E5E6E7E8F1F2F3F4F5F6F7F8G1G2G3G4G5G6G7G8H1H2H3H4H5H6H7H8I1I2I3IAUAIAIAI8J1J2J3J4J5J6J7J8K1K2K3K4K5K6K7K8L1L2L3L4L5L6L7L8";
  var lobbyMap="F4";
  var isRound=false;
  var res = await gfxCreation(drive, mapString, lobbyMap, isRound);
  await print(res);
}
