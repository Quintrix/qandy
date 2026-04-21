RUN='whack-a-mole.js';

//
// ──── Qandy-Catch: Mouse Demo ────────────────────────────────────────────────
//

init();

async function init() {
  
  let score = 0;
  let moleX = 10;
  let moleY = 10;
  let gameTimer = null;

  // 1. Define the mousedown handler
  window.mousedown = function(x, y, tag, button) {
    if (tag === "MOLE") {
      score++;
      clearMole();
      spawnMole();
      updateScore();
    } else {
      window.pokeCell(x, y, "X", 91, 40); 
    }
  };

  function updateScore() {
    CURMOUSE = ""; CURFG=97; CURBG=44;
    window.pokeText(1, 0, " SCORE: " + score); // White on Blue
  }

  function clearMole() {
    // Clear previous mole position
    window.CURMOUSE = "";
    window.pokeCell(moleX, moleY, " ", 37, 40);
    window.pokeCell(moleX + 1, moleY, " ", 37, 40);
  }

  function spawnMole() {
    moleX = Math.floor(Math.random() * (32 - 5)) + 2;
    moleY = Math.floor(Math.random() * (24 - 5)) + 2;
    window.CURMOUSE = "MOLE"; 
    window.CURFG = 93; // Bright Yellow
    window.CURBG = 40; // Black
    window.pokeText(moleX, moleY, "☻");
    window.CURMOUSE = ""; 
  }

  // Initialize Game
  window.cls();
  updateScore();
  spawnMole();
    
  console.log("Qandy-Catch Started. Click the yellow smileys!");
}
