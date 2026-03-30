RUN="charmap.js";
keyboard=false; // don't think this script needs this?

var CP437 = {
  // graphics historically shown in codes 1-31
  1: '\u263A',  2: '\u263B',  3: '\u2665',  4: '\u2666',  5: '\u2663',  6: '\u2660',
  7: '\u2022',  8: '\u25D8',  9: '\u25CB', 10: '\u25D9', 11: '\u2642', 12: '\u2640',
  13: '\u266A', 14: '\u266B', 15: '\u263C', 16: '\u25BA', 17: '\u25C4', 18: '\u2195',
  19: '\u203C', 20: '\u00B6', 21: '\u00A7', 22: '\u25AC', 23: '\u21A8', 24: '\u2191',
  25: '\u2193', 26: '\u2192', 27: '\u2190', 28: '\u221F', 29: '\u2194', 30: '\u25B2',
  31: '\u25BC',
  // extended (partial) mapping - 128..159 and 176..223 subset from your ascii_render files
  128: '\u00C7', 129: '\u00FC', 130: '\u00E9', 131: '\u00E2', 132: '\u00E4', 133: '\u00E0', 
  134: '\u00E5', 135: '\u00E7', 136: '\u00EA', 137: '\u00EB', 138: '\u00E8', 139: '\u00EF', 
  140: '\u00EE', 141: '\u00EC', 142: '\u00C4', 143: '\u00C5', 144: '\u00C9', 145: '\u00E6', 
  146: '\u00C6', 147: '\u00F4', 148: '\u00F6', 149: '\u00F2',150: '\u00FB',151: '\u00F9',
  152: '\u00FF',153: '\u00D6',154: '\u00DC',155: '\u00A2',156: '\u00A3',157: '\u00A5',
  158: '\u20A7',159: '\u0192',160: '\u00E1',
  176: '\u2591', 177: '\u2592', 178: '\u2593', 179: '\u2502', 180: '\u2524', 181: '\u2561',
  182: '\u2562', 183: '\u2556', 184: '\u2555', 185: '\u2563', 186: '\u2551', 187: '\u2557',
  188: '\u255D', 189: '\u255C', 190: '\u255B', 191: '\u2510', 192: '\u2514', 193: '\u2534',
  194: '\u252C', 195: '\u251C', 196: '\u2500', 197: '\u253C', 198: '\u255E', 199: '\u255F',
  200: '\u255A', 201: '\u2554', 202: '\u2569', 203: '\u2566', 204: '\u2560', 205: '\u2550',
  206: '\u256C', 207: '\u2567', 208: '\u2568', 209: '\u2564', 210: '\u2565', 211: '\u2559',
  212: '\u2558', 213: '\u2552', 214: '\u2553', 215: '\u256B', 216: '\u256A', 217: '\u2518',
  218: '\u250C', 219: '\u2588', 220: '\u2584', 221: '\u258C', 222: '\u2590', 223: '\u2580'
};

// Helper: produce a string of glyphs for a numeric range [start..end] inclusive.
// If cp437 is true, substitute mapping entries when present.
function buildRangeString(start, end, useCp437) {
  var out = [];
  for (var code = start; code <= end; code++) {
    var ch;
    if (useCp437 && CP437.hasOwnProperty(code)) { ch = CP437[code]; } else { ch = String.fromCharCode(code); }
    out.push(ch);
  }
  return out.join('');
}

// Step A: assemble everything your original script can display (0..255 but using cp437 for substitution)
function buildAllDisplayable(useCp437) {
  // We'll iterate 0..255 but substitute CP437 when requested
  return buildRangeString(0, 255, !!useCp437);
}

// Step B: assemble "printable" Qandy characters (no numeric codes shown)
// Qandy keyboard/display ranges you specified: 1-31 (IBM glyphs), 32-127 (ASCII), 168-223 (extended)
function buildQandyPrintableString() {
  var pieces = [];
  // 1..31 (CP437 glyphs for control positions)
  pieces.push(buildRangeString(1, 31, true));
  // 32..127 (regular ASCII range - printable characters and DEL at 127; included per your note)
  pieces.push(buildRangeString(32, 127, true));
  // 168..223 (extended block/graphics range - include per your note)
  pieces.push(buildRangeString(168, 223, true));
  return pieces.join('');
}

var qandyString=buildAllDisplayable(true);

// Export for later UI code
window._qandy_charmap_all = buildAllDisplayable(true);
window._qandy_charmap_keyboard = qandyString;

_CURSOR=CURSOR; CURSOR=0; 

cls();
print("\n\x1b[35m──── \x1b[33mCharacter Map: \x1b[35m────────────\n\x1b[37m ");

l=0; for (i=0;i<qandyString.length;i++) {
  print(" "+qandyString.charAt(i));
  l++;
  if (l==14) { print("\n "); l=0; }
}

print("\n\n"); if (CURMORE>-1) { CURMORE=0; }

charString=""; // characters the user has selected
charPos=65;    // selected character position, default 65 A

newCoords = getCharCoordinates(charPos);
pokeFG(newCoords.x, newCoords.y, 30, 1);  // 30 = black FG
pokeBG(newCoords.x, newCoords.y, 103, 1); // 103 = bright yellow BG

function keydown(keyCode, event) {
  if (typeof keyCode !== 'number') return false;
  
  var oldPos = charPos;
  
  // Cursor right: advance character position, wrap to 1 if exceeds 255
  if (keyCode === 39) {  // RIGHT arrow
    charPos++;
    if (charPos > 255) { charPos = 1; }
    updateSelection(oldPos);
    return;
  }
  
  // Cursor left: move back, wrap to 255 if below 1
  if (keyCode === 37) {  // LEFT arrow
    charPos--;
    if (charPos < 1) { charPos = 255; }
    updateSelection(oldPos);
    return;
  }
  
  // Cursor down: advance 14 positions (one line), cap at 255
  if (keyCode === 40) {  // DOWN arrow
    charPos = charPos + 14;
    if (charPos > 255) { charPos = 255; }
    updateSelection(oldPos);
    return;
  }
  
  // Cursor up: back 14 positions (one line), floor at 0
  if (keyCode === 38) {  // UP arrow
    charPos = charPos - 14;
    if (charPos < 0) { charPos = 0; }
    updateSelection(oldPos);
    return;
  }
  
  // CTRL-C: copy charString to clipboard
  if (keyCode === 67 && event && event.ctrlKey) {  // CTRL-C
    if (CURMORE>-1) { CURMORE=0; }
    if (charString.length > 0) {
      navigator.clipboard.writeText(charString).then(function() {
        print("\n\nCopied to clipboard\n");
      }).catch(function(err) {
        print("\n\nFailed to copy\n");
      });
    }
    CURSOR=_CURSOR;
    dosExit();
    return;
  }

  // ENTER copy charString to clipboard
  if (keyCode === 13) {  
    if (CURMORE>-1) { CURMORE=0; }
    if (charString.length > 0) {
      navigator.clipboard.writeText(charString).then(function() {
        print("\n\nCopied to clipboard\n");
      }).catch(function(err) {
        print("\n\nFailed to copy\n");
      });
    }
    CURSOR=_CURSOR;
    dosExit();
    return;
  }
  
  // Space: add currently selected charPos character to charString and display it
  if (keyCode === 32) {  // SPACE
    var selectedChar = qandyString.charAt(charPos);
    charString += selectedChar;
    print(selectedChar);
    return;
  }
  
  // Backspace: remove last character from charString and delete from display
  if (keyCode === 8) {  // BACK
    if (charString.length > 0) {
      charString = charString.slice(0, -1);
      // ANSI backspace: move cursor left, delete character
      print('\x08 \x08');  // backspace, space, backspace
    }
    return;
  }
  
  // ESC: exit the program
  if (keyCode === 27) {  // ESC
    CURSOR=_CURSOR;
    if (CURMORE>-1) { CURMORE=0; }
    dosExit();
    return;
  }
}

// Helper function to update selection highlighting
// Use pokeFG/pokeBG to change colors without moving cursor
function updateSelection(oldPos) {
  // Clear old selection (white FG, black BG)
  var oldCoords = getCharCoordinates(oldPos);
  pokeFG(oldCoords.x, oldCoords.y, 37, 1);  // 37 = white FG
  pokeBG(oldCoords.x, oldCoords.y, 40, 1);  // 40 = black BG
  
  // Highlight new selection (black FG, bright yellow BG)
  var newCoords = getCharCoordinates(charPos);
  pokeFG(newCoords.x, newCoords.y, 30, 1);  // 30 = black FG
  pokeBG(newCoords.x, newCoords.y, 103, 1); // 103 = bright yellow BG
}

function getCharCoordinates(charIndex) {
  // Calculate which row and column the charIndex appears at in the display
  // There are 14 characters per row, starting at Qandy coordinates (2, 3)
  // Each character takes up 2 screen positions (char + space)
  
  var row = Math.floor(charIndex / 14);
  var col = charIndex % 14;
  
  var qandyX = 2 + (col * 2);  // 2 chars wide per character (char + space)
  var qandyY = 3 + row;
  
  return { x: qandyX, y: qandyY };
}