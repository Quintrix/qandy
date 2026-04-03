RUN="capflag.js";

login();
async function login() {
  await print(await qdosScript("gfx.js"));
  await print(gfxConnect());
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
