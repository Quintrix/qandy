RUN="capflag.js";

// Global variables needed by gfx.js
var mapx = 8;
var mapy = 12;
var mode = "gfx";
var PName = "";
var PX = 3;
var PY = 7;
var PZ = (PY * (mapx + 1)) + PX;
var PopUpVis = "hidden";
var PForce = "hidden";

login();

async function login() {
  await print("Capture The Flag:\n\n");

  // ## ask player their name
  // ## display list of discovered servers
  // ## ask user which server to connect to
  // ## attempt to connect to server
  // ## init() once connected

  var name = await input();
  await print("Hello " + name);
  PName = name;
  init();
}

async function init() {
  if (window.tiles && typeof tiles === 'function') { tiles(); }
  // Render initial map (all grass)
  // currently not working
  var mapData = "Ga".repeat(104);
  if (window.gfx && typeof gfx === 'function') {
    gfx(mapData);
  }
  // move text screen out of the way so user can see gfx
  document.getElementById('txt').style.top = '50px';
  document.getElementById('txt').style.left = '350px';
}
