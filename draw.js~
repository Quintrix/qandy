RUN="draw.js"; // tells qandy.js to send input to keydown() and keyup()
keyboard=false; // Route to keydown() instead of window.button()

cls(); // clears screen, moves cursor to 0,0

// ANSI cell grid: { char, fg, bg, attr }
var grid = [];
var menuMode = false; // Toggle between grid-edit and menu modes
var selectedMenuItem = 0; // FG (0), BG (1), ATTR (2)

function initGrid() {
  for (let i = 0; i < W * H; i++) {
    grid.push({ char: ' ', fg: CURFG, bg: CURBG, attr: 0 });
  }
}

function cellAt(x, y) {
  return grid[y * W + x];
}

function drawGrid() {
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let cell = cellAt(x, y);
      pokeCell(x, y, cell.char, cell.fg, cell.bg, cell.attr);
    }
  }
  pokeCursorOn();
}

function drawMenu() {
  // Bottom row: "  FG: 37  BG: 40  ATTR: 0  "
  pokeMenu(`  FG: ${CURFG}   BG: ${CURBG}   ATTR: ${CURATTR}  `);
}

function keydown(keyCode, event) {
  event.preventDefault();
  
  // Cursor movement: always available
  if (keyCode === 37) { // LEFT
    pokeCursorOff();
    CURX = Math.max(0, CURX - 1);
    pokeCursorOn();
    return;
  }
  if (keyCode === 38) { // UP
    pokeCursorOff();
    CURY = Math.max(0, CURY - 1);
    pokeCursorOn();
    return;
  }
  if (keyCode === 39) { // RIGHT
    pokeCursorOff();
    CURX = Math.min(W - 1, CURX + 1);
    pokeCursorOn();
    return;
  }
  if (keyCode === 40) { // DOWN
    pokeCursorOff();
    CURY = Math.min(H - 1, CURY + 1);
    pokeCursorOn();
    return;
  }

  // Printable character: draw at cursor, advance
  if (keyCode >= 32 && keyCode < 127 && !event.ctrlKey && !event.altKey) {
    let char = String.fromCharCode(keyCode);
    let cell = cellAt(CURX, CURY);
    cell.char = char;
    cell.fg = CURFG;
    cell.bg = CURBG;
    cell.attr = CURATTR;
    
    pokeCell(CURX, CURY, char, CURFG, CURBG, CURATTR);
    
    // Auto-advance: move right (or wrap to next line)
    CURX++;
    if (CURX >= W) {
      CURX = 0;
      CURY = Math.min(H - 1, CURY + 1);
    }
    pokeCursorOn();
    return;
  }

  // TAB: cycle through FG → BG → ATTR
  if (keyCode === 9) {
    event.preventDefault();
    selectedMenuItem = (selectedMenuItem + 1) % 3;
    drawMenu();
    return;
  }

  // +/- keys: adjust selected attribute
  if (event.shiftKey) {
    if (keyCode === 187 || keyCode === 61) { // Shift-+ or Shift-=
      if (selectedMenuItem === 0) CURFG = Math.min(97, CURFG + 1);      // FG
      else if (selectedMenuItem === 1) CURBG = Math.min(107, CURBG + 1); // BG
      else if (selectedMenuItem === 2) CURATTR = Math.min(0xFFFF, CURATTR + 1);
      drawMenu();
      return;
    }
    if (keyCode === 189 || keyCode === 173) { // Shift-- or Shift-_
      if (selectedMenuItem === 0) CURFG = Math.max(30, CURFG - 1);
      else if (selectedMenuItem === 1) CURBG = Math.max(40, CURBG - 1);
      else if (selectedMenuItem === 2) CURATTR = Math.max(0, CURATTR - 1);
      drawMenu();
      return;
    }
  }

  // SPACE: toggle inverse on current cell
  if (keyCode === 32) {
    let cell = cellAt(CURX, CURY);
    cell.attr ^= ATTR_INVERSE;
    CURATTR ^= ATTR_INVERSE;
    pokeCell(CURX, CURY, cell.char, cell.fg, cell.bg, cell.attr);
    pokeCursorOn();
    return;
  }

  // ESC: save and exit
  if (keyCode === 27) {
    saveANS();
    dosExit();
    return;
  }
}

function keyup(keyCode, event) {
  // Optional: handle key releases for held-key behavior
  // For now, nothing needed
}

function saveANS() {
  // Convert grid to .ANS format and save
  let ansText = "";
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let cell = cellAt(x, y);
      // Append ANSI codes for color/attr changes
      ansText += `\x1b[${cell.fg}m\x1b[${cell.bg}m`;
      ansText += cell.char;
    }
    ansText += "\r\n";
  }
  // Save to localStorage or export
  localStorage.setItem("screen.ans", ansText);
}

// Initialize
initGrid();
drawGrid();
drawMenu();