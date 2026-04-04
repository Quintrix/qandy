RUN="capflag.js";

startup();
async function startup() {
  // append the script (HOST appends it asynchronously)
  qdosScript("gfx.js");

  try {
    // wait up to 7s for gfxConnect to exist
    await waitForFunction("gfxConnect", 7000);
  } catch (e) {
    print("Error: gfx.js not loaded: " + e.message + "\n");
    dosExit();
    return;
  }

  // safe to call now
  try {
    await gfxConnect();
  } catch (e) {
    print("gfxConnect failed: " + (e && e.message ? e.message : String(e)) + "\n");
    dosExit();
  }
}

function waitForFunction(name, timeoutMs) {
  timeoutMs = typeof timeoutMs === 'number' ? timeoutMs : 3000;
  return new Promise(function(resolve, reject) {
    const start = Date.now();
    (function check() {
      if (typeof window[name] === 'function') return resolve();
      if (Date.now() - start >= timeoutMs) return reject(new Error('timeout'));
      setTimeout(check, 40);
    })();
  });
}
//init();
async function oldinit() {
  await gfxInit();
  // move text screen out of the way so user can see gfx
  document.getElementById('txt').style.top = '50px';
  document.getElementById('txt').style.left = '350px';
  NewChar();
}

//window.gfxServers = async function() {
//  var url = _registryUrl;
//  if (!url) return 'Error: no registry URL configured';
//  try {
//    var response = await fetch(url, { method: 'GET' });
//    if (!response.ok) {
//      return 'Error: registry responded with ' + response.status;
//    }
//    var data = await response.json();
//    if (!data.success) {
//      return 'Error: ' + (data.error || 'registry request failed');
//    }
//    var list = data.servers || [];
//    if (list.length === 0) return 'No servers available\n';
//    var out = 'Available Servers:\n';
//    for (var i = 0; i < list.length; i++) {
//      var s = list[i];
//      var drives = (s.drives && s.drives.length) ? s.drives.join(',') : 'none';
//      out += '- ' + s.name + ' (' + s.host + ':' + s.port + ')' +
//             ' - ' + drives + '\n';
//    }
//  } catch (e) {
//    return 'Error: ' + (e.message || String(e));
//  }
//};

async function flagCreate() {
  var drive="gfx.js";
  var mapString="A1A2A3A4A5A6A7A8B1B2B3B4B5B6B7N8C1C2C3C4C5C6C7V8D1D2D3D4D5D6D7D8E1E2E3E4E5E6E7E8F1F2F3F4F5F6F7F8G1G2G3G4G5G6G7G8H1H2H3H4H5H6H7H8I1I2I3IAUAIAIAI8J1J2J3J4J5J6J7J8K1K2K3K4K5K6K7K8L1L2L3L4L5L6L7L8";
  var lobbyMap="F4";
  var isRound=false;
  var res = await gfxCreation(drive, mapString, lobbyMap, isRound);
  await print(res);
}
