RUN="flag.js";

init();
async function init() {
  await print("Capture The Flag:\n\nEnter your player name:\n");
  var name = await input();
  await print("Hello "+name); 
}

function keydown(keyCode, event) {
}

function keyup(keyCode, event) {
}
