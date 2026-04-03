RUN="capflag.js";

// Global map dimensions
var mapx = 8;
var mapy = 12;

// Global variables needed by gfx.js
var mode = "gfx";
var PName = "";
var PX = 3;
var PY = 7;
var PZ = (PY * (mapx + 1)) + PX;
var PopUpVis = "hidden";
var PForce = "hidden";

login();

async function login() {
  await print("Capture The Flag:\n\nEnter player name:\n");
  var name = await input();
  await print("Hello " + name);
  PName = name;
  init();
}

async function init() {
  // Inject CSS styles
  const style = document.createElement('style');
  style.textContent = `
    #pop {
      position: absolute;
      background: white;
      border: 2px solid black;
      padding: 10px;
      width: 256px;
      max-height: 384px;
      overflow: auto;
      font-family: monospace;
      box-shadow: 0 0 10px rgba(0,0,0,0.3);
    }

    .tile {
      image-rendering: pixelated;
      image-rendering: -moz-crisp-edges;
      cursor: pointer;
      display: block;
    }

    .char {
      position: absolute;
      cursor: pointer;
    }
  `;
  document.head.appendChild(style);
  
  // Create the pop div for UI overlays
  var popDiv = document.createElement('div');
  popDiv.id = "pop";
  popDiv.style.visibility = PopUpVis;
  popDiv.style.zIndex = "200";
  popDiv.onmouseover = function() { 
    PopUpVis = "visible"; 
  };
  popDiv.onmouseout = function() { 
    PopUpVis = PForce;
    setTimeout(() => {
      document.getElementById("pop").style.visibility = PopUpVis;
    }, 100);
  };
  document.body.appendChild(popDiv);
  
  // Initialize tiles if gfx.js is loaded
  if (window.tiles && typeof tiles === 'function') {
    tiles();
  }
  
  // Render initial map (all grass)
  var mapData = "Ga".repeat(104);
  if (window.gfx && typeof gfx === 'function') {
    alert("here "+mapData);
    gfx(mapData);
  }
}
