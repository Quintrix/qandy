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

  var name = await input();

  if (name.length<3) {
    print("Name must be at least three characters.<br>Enter your player name:\n");
  } else {
    // ## make this BOT check upper or lower case, name bot is reserved for bot participants
    if (l.substring(0,2)=="BOT") {
      print("Name cannot start with BOT.\nEnter your player name:\n");
    } else {
      PName=l;
      mode="gfx";
      PForce="visible";
      NewChar("");
      LMap(PMap);
      PName = name;
      init();
    }
  }
  // ## display list of discovered servers
  // ## ask user which server to connect to
  // ## attempt to connect to server
  // ## init() once connected
}

init();
NewChar();

async function init() {
  await qdosScript("gfx.js");
  if (window.tiles && typeof tiles === 'function') { tiles(); }
  // ## render initial map (all tile Ga for grass), currently not working
  var mapData = "Ga".repeat(104);
  if (window.gfx && typeof gfx === 'function') {
    gfx(mapData);
  }
  // move text screen out of the way so user can see gfx
  document.getElementById('txt').style.top = '50px';
  document.getElementById('txt').style.left = '350px';
  // ## get player to select avatar, code for this is in q.js
}

function NewChar(a) {
if (typeof a==="undefined") { a=""; }
  PopForce="visible";
  if (a=="M") {
    // Male character selection
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
  } else if (a=="F") {
    // Female character selection
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
  } else if (a.length==2) {
    // Character selected - finalize
    if (a.charAt(0)=="F") { 
      PObj=a+"H0"; // Female + outfit
    } else { 
      PObj=a+"D0"; // Male + outfit
    }
    char(PName,PObj,PZ); 
    PForce="hidden"; 
    hpop(); 
    mainloop();
  } else {  	
    // Initial gender selection
    PX=2; PY=9; PZ=(PY*(mapx+1))+PX;
    pop("<p>Male or Female?<br><a href=\"javascript:NewChar(\'M\');\"><img src=\"c/B1.png\" height=128 width=64></a> &nbsp; <a href=\"javascript:NewChar(\'F\');\"><img src=\"c/F5.png\" height=128 width=64></a><p>");
  }
}
