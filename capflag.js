RUN="capflag.js";

// Global variables needed by gfx.js

login();

async function login() {
  await print("Capture The Flag:\n\n");
  await print("Enter your player name:\n");

  var name = await input();

  if (name.length < 3) {
    print("Name must be at least three characters.<br>Enter your player name:\n");
    await login();
  } else {
    // ## make this BOT check upper or lower case, name bot is reserved for bot participants
    if (name.toUpperCase().substring(0, 3) === "BOT") {
      print("Name cannot start with BOT.\nEnter your player name:\n");
      await login();
    } else {
      PName = name;
      mode = "gfx";
      PForce = "visible";
      await init();
      
      // ## display list of discovered servers
      // ## ask user which server to connect to
      // ## attempt to connect to server
    }
  }
}

async function init() {
  try {
    await qdosScript("gfx.js");
  } catch(e) {
    console.error("capflag: graphics initialization error", e);
  }
  await window.gfxInit();
  // move text screen out of the way so user can see gfx
  document.getElementById('txt').style.top = '50px';
  document.getElementById('txt').style.left = '350px';
  NewChar();
}
