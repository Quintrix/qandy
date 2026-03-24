RUN="piano.js";

if (typeof beep === 'undefined' || typeof playNote === 'undefined') {
  var soundScript = document.createElement('script');
  soundScript.src = 'sound.js';
  soundScript.onload = function() { run = "piano.js"; initializePiano(); };
  soundScript.onerror = function() { print("ERROR: sound.js not loaded\n"); };
  document.head.appendChild(soundScript);
  var initializePiano;
}

function drawPiano() {
  cls();
  pokeCursorOff();
  print("[-black]\n[bold][bgreen]  ╔══════════════════════════╗\n");
  print("  ║        [yellow]QANDY PIANO[bgreen]       ║\n");
  print("  ╚══════════════════════════╝\n\n");

  // Compact piano keyboard (32 chars max)
  keyWht = "  [down][left][left]  [down][left][left]  ";
  keyBlk = "[black][-white]▐[-black] [-white]▌[down][left][left][left][-white]▐[-black] [-white]▌[down][left][left][left][-white]▐[-black] [-white]▌";

  pokeCursorOff();
  print("[white][-black]");
  // top half of white keys
  print("\033[7;7H[-white]"+keyWht+"[-black]");
  print("\033[7;10H[-white]"+keyWht+"[-black]");
  print("\033[7;13H[-white]"+keyWht+"[-black]");
  print("\033[7;16H[-white]"+keyWht+"[-black]");
  print("\033[7;19H[-white]"+keyWht+"[-black]");
  print("\033[7;22H[-white]"+keyWht+"[-black]");
  print("\033[7;25H[-white]"+keyWht+"[-black]");
  // bottom half of white keys
  print("\033[10;7H[-white]"+keyWht+"[-black]");
  print("\033[10;10H[-white]"+keyWht+"[-black]");
  print("\033[10;13H[-white]"+keyWht+"[-black]");
  print("\033[10;16H[-white]"+keyWht+"[-black]");
  print("\033[10;19H[-white]"+keyWht+"[-black]");
  print("\033[10;22H[-white]"+keyWht+"[-black]");
  print("\033[10;25H[-white]"+keyWht+"[-black]");
  // black keys
  print("\033[7;8H"+keyBlk);
  print("\033[7;11H"+keyBlk);
  print("\033[7;17H"+keyBlk);
  print("\033[7;20H"+keyBlk);
  print("\033[7;23H"+keyBlk);
  print("\033[14;7H[-black][cyan]C  D  E  F   G  A  B\n\n");
}

// --- GWBASIC Generator State ---
var gwbasicString = "T120";
var currentOctave = 4;
var currentLengthMode = 3;   // 1-8 sets length mode; 9 toggles REST mode (default 3 = L4 quarter)
var pianoCapsLock = false;   // our own CAPS LOCK tracking (host caps is bypassed)
var restMode = false;        // key 9 toggles rest mode
var lastOctaveInString = null;
var lastLengthInString = null;

// GWBASIC output position tracking (terminal: 32 cols x 25 rows)
var TERM_WIDTH = 32;
var gwbasicRow = 18;
var gwbasicCol = 1;

// Length modes: number key (1-8) -> GWBASIC notation and playback duration at T120
var lengthModes = {
  1: { gwbasic: "1",  ms: 2000, dotted: false, label: "L1 " },
  2: { gwbasic: "2",  ms: 1000, dotted: false, label: "L2 " },
  3: { gwbasic: "4",  ms: 500,  dotted: false, label: "L4 " },
  4: { gwbasic: "8",  ms: 250,  dotted: false, label: "L8 " },
  5: { gwbasic: "16", ms: 125,  dotted: false, label: "L16" },
  6: { gwbasic: "32", ms: 62,   dotted: false, label: "L32" },
  7: { gwbasic: "4",  ms: 750,  dotted: true,  label: "L4." },
  8: { gwbasic: "6",  ms: 333,  dotted: false, label: "L6~" }
};

// Physical key -> note letter (octave applied dynamically from modifier state)
var pianoNoteMap = {
  'a': 'C', 's': 'D', 'd': 'E', 'f': 'F', 'g': 'G', 'h': 'A', 'j': 'B',
  'w': 'C#', 'e': 'D#', 't': 'F#', 'y': 'G#', 'u': 'A#'
};

// Track which piano keys are currently held (prevents key repeat)
var pressedKeys = {};

// ANSI color for each octave
function octaveColor(oct) {
  if (oct === 3) return "\x1b[1;32m";  // bright green
  if (oct === 5) return "\x1b[1;36m";  // bright cyan
  return "\x1b[1;33m";                  // bright yellow (O4)
}

// Derive current octave from CAPS state + ctrlKey in event
// CAPS only -> O3, CTRL only -> O5, both or neither -> O4
function computeOctave(event) {
  var ctrlOn = !!(event && event.ctrlKey);
  if (ctrlOn && !pianoCapsLock) return 5;
  if (!ctrlOn && pianoCapsLock)  return 3;
  return 4;
}

// Reposition cursor to the current GWBASIC output location
function gotoGwbasicCursor() {
  print("\x1b[" + gwbasicRow + ";" + gwbasicCol + "H");
}

// Refresh the status line at row 16 and return cursor to output area
function updateStatusLine() {
  var lm = lengthModes[currentLengthMode];
  var col = octaveColor(currentOctave);
  var restStr = restMode ? "\x1b[1;31m[REST]\x1b[0m" : "      ";
  print("\x1b[16;1H\x1b[K");
  print(col + "O" + currentOctave + "\x1b[0m \x1b[1;37m" + lm.label + "\x1b[0m " + restStr);
  gotoGwbasicCursor();
}

// Append one GWBASIC token to the string and print it (auto-wraps at TERM_WIDTH)
function appendToken(token) {
  var str = token + " ";
  if (gwbasicCol + str.length - 1 > TERM_WIDTH) {
    gwbasicRow++;
    gwbasicCol = 1;
    print("\x1b[" + gwbasicRow + ";1H");
  }
  print(octaveColor(currentOctave) + str + "\x1b[0m");
  gwbasicString += " " + token;
  gwbasicCol += str.length;
}

// Highlight a piano key using octave-specific colors
// noteLetter: 'C', 'D#', etc.  octave: 3, 4, or 5
function keyHighlight(noteLetter, octave) {
  var wc, sg, sb;
  if (octave === 3)      { wc = 102; sg = 32; sb = 42; }   // green
  else if (octave === 5) { wc = 106; sg = 36; sb = 46; }   // cyan
  else                   { wc = 103; sg = 33; sb = 43; }   // yellow (O4)

  switch (noteLetter) {
    case "C":
      pokeBG(6,6,wc,2); pokeBG(6,7,wc,2); pokeBG(6,8,wc,2);
      pokeBG(6,9,wc,2); pokeBG(6,10,wc,2); pokeBG(6,11,wc,2); break;
    case "D":
      pokeBG(9,6,wc,2); pokeBG(9,7,wc,2); pokeBG(9,8,wc,2);
      pokeBG(9,9,wc,2); pokeBG(9,10,wc,2); pokeBG(9,11,wc,2); break;
    case "E":
      pokeBG(12,6,wc,2); pokeBG(12,7,wc,2); pokeBG(12,8,wc,2);
      pokeBG(12,9,wc,2); pokeBG(12,10,wc,2); pokeBG(12,11,wc,2); break;
    case "F":
      pokeBG(15,6,wc,2); pokeBG(15,7,wc,2); pokeBG(15,8,wc,2);
      pokeBG(15,9,wc,2); pokeBG(15,10,wc,2); pokeBG(15,11,wc,2); break;
    case "G":
      pokeBG(18,6,wc,2); pokeBG(18,7,wc,2); pokeBG(18,8,wc,2);
      pokeBG(18,9,wc,2); pokeBG(18,10,wc,2); pokeBG(18,11,wc,2); break;
    case "A":
      pokeBG(21,6,wc,2); pokeBG(21,7,wc,2); pokeBG(21,8,wc,2);
      pokeBG(21,9,wc,2); pokeBG(21,10,wc,2); pokeBG(21,11,wc,2); break;
    case "B":
      pokeBG(24,6,wc,2); pokeBG(24,7,wc,2); pokeBG(24,8,wc,2);
      pokeBG(24,9,wc,2); pokeBG(24,10,wc,2); pokeBG(24,11,wc,2); break;
    case "C#":
      pokeFG(7,6,sg,1); pokeBG(8,6,sb,1); pokeFG(9,6,sg,1);
      pokeFG(7,7,sg,1); pokeBG(8,7,sb,1); pokeFG(9,7,sg,1);
      pokeFG(7,8,sg,1); pokeBG(8,8,sb,1); pokeFG(9,8,sg,1); break;
    case "D#":
      pokeFG(10,6,sg,1); pokeBG(11,6,sb,1); pokeFG(12,6,sg,1);
      pokeFG(10,7,sg,1); pokeBG(11,7,sb,1); pokeFG(12,7,sg,1);
      pokeFG(10,8,sg,1); pokeBG(11,8,sb,1); pokeFG(12,8,sg,1); break;
    case "F#":
      pokeFG(16,6,sg,1); pokeBG(17,6,sb,1); pokeFG(18,6,sg,1);
      pokeFG(16,7,sg,1); pokeBG(17,7,sb,1); pokeFG(18,7,sg,1);
      pokeFG(16,8,sg,1); pokeBG(17,8,sb,1); pokeFG(18,8,sg,1); break;
    case "G#":
      pokeFG(19,6,sg,1); pokeBG(20,6,sb,1); pokeFG(21,6,sg,1);
      pokeFG(19,7,sg,1); pokeBG(20,7,sb,1); pokeFG(21,7,sg,1);
      pokeFG(19,8,sg,1); pokeBG(20,8,sb,1); pokeFG(21,8,sg,1); break;
    case "A#":
      pokeFG(22,6,sg,1); pokeBG(23,6,sb,1); pokeFG(24,6,sg,1);
      pokeFG(22,7,sg,1); pokeBG(23,7,sb,1); pokeFG(24,7,sg,1);
      pokeFG(22,8,sg,1); pokeBG(23,8,sb,1); pokeFG(24,8,sg,1); break;
  }
}

// Restore a piano key to its default white/black appearance
function keyRestore(noteLetter) {
  switch (noteLetter) {
    case "C":
      pokeBG(6,6,47,2); pokeBG(6,7,47,2); pokeBG(6,8,47,2);
      pokeBG(6,9,47,2); pokeBG(6,10,47,2); pokeBG(6,11,47,2); break;
    case "D":
      pokeBG(9,6,47,2); pokeBG(9,7,47,2); pokeBG(9,8,47,2);
      pokeBG(9,9,47,2); pokeBG(9,10,47,2); pokeBG(9,11,47,2); break;
    case "E":
      pokeBG(12,6,47,2); pokeBG(12,7,47,2); pokeBG(12,8,47,2);
      pokeBG(12,9,47,2); pokeBG(12,10,47,2); pokeBG(12,11,47,2); break;
    case "F":
      pokeBG(15,6,47,2); pokeBG(15,7,47,2); pokeBG(15,8,47,2);
      pokeBG(15,9,47,2); pokeBG(15,10,47,2); pokeBG(15,11,47,2); break;
    case "G":
      pokeBG(18,6,47,2); pokeBG(18,7,47,2); pokeBG(18,8,47,2);
      pokeBG(18,9,47,2); pokeBG(18,10,47,2); pokeBG(18,11,47,2); break;
    case "A":
      pokeBG(21,6,47,2); pokeBG(21,7,47,2); pokeBG(21,8,47,2);
      pokeBG(21,9,47,2); pokeBG(21,10,47,2); pokeBG(21,11,47,2); break;
    case "B":
      pokeBG(24,6,47,2); pokeBG(24,7,47,2); pokeBG(24,8,47,2);
      pokeBG(24,9,47,2); pokeBG(24,10,47,2); pokeBG(24,11,47,2); break;
    case "C#":
      pokeFG(7,6,30,1); pokeBG(8,6,40,1); pokeFG(9,6,30,1);
      pokeFG(7,7,30,1); pokeBG(8,7,40,1); pokeFG(9,7,30,1);
      pokeFG(7,8,30,1); pokeBG(8,8,40,1); pokeFG(9,8,30,1); break;
    case "D#":
      pokeFG(10,6,30,1); pokeBG(11,6,40,1); pokeFG(12,6,30,1);
      pokeFG(10,7,30,1); pokeBG(11,7,40,1); pokeFG(12,7,30,1);
      pokeFG(10,8,30,1); pokeBG(11,8,40,1); pokeFG(12,8,30,1); break;
    case "F#":
      pokeFG(16,6,30,1); pokeBG(17,6,40,1); pokeFG(18,6,30,1);
      pokeFG(16,7,30,1); pokeBG(17,7,40,1); pokeFG(18,7,30,1);
      pokeFG(16,8,30,1); pokeBG(17,8,40,1); pokeFG(18,8,30,1); break;
    case "G#":
      pokeFG(19,6,30,1); pokeBG(20,6,40,1); pokeFG(21,6,30,1);
      pokeFG(19,7,30,1); pokeBG(20,7,40,1); pokeFG(21,7,30,1);
      pokeFG(19,8,30,1); pokeBG(20,8,40,1); pokeFG(21,8,30,1); break;
    case "A#":
      pokeFG(22,6,30,1); pokeBG(23,6,40,1); pokeFG(24,6,30,1);
      pokeFG(22,7,30,1); pokeBG(23,7,40,1); pokeFG(24,7,30,1);
      pokeFG(22,8,30,1); pokeBG(23,8,40,1); pokeFG(24,8,30,1); break;
  }
}

// Build the GWBASIC rest token (P notation) for a given length mode
function restToken(lm) {
  return "P" + lm.gwbasic + (lm.dotted ? "." : "");
}

// Build the GWBASIC note token (letter + optional dot) for a given note and length mode
function noteToken(noteLetter, lm) {
  return noteLetter + (lm.dotted ? "." : "");
}

function keydown(keyCode, event) {
  if (typeof keyCode !== 'number') return false;

  // CAPS LOCK (20): toggle our internal CAPS state and recompute octave
  if (keyCode === 20) {
    pianoCapsLock = !pianoCapsLock;
    currentOctave = computeOctave(event);
    updateStatusLine();
    return true;
  }

  // CTRL (17): event.ctrlKey is true when CTRL is being pressed – update status
  if (keyCode === 17) {
    currentOctave = computeOctave(event);
    updateStatusLine();
    return true;
  }

  // ESC (27): wrap the accumulated string as play("...") and copy to clipboard
  if (keyCode === 27) {
    var finalCmd = 'play("' + gwbasicString + '")';
    gotoGwbasicCursor();
    print("\n");
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(finalCmd).then(function() {
        print("\x1b[1;32mCopied!\x1b[0m\n\x1b[1;37m" + finalCmd + "\x1b[0m\n");
        setTimeout(function() { dosExit(); }, 1500);
      }).catch(function() {
        print("\x1b[1;33m" + finalCmd + "\x1b[0m\n");
        setTimeout(function() { dosExit(); }, 1500);
      });
    } else {
      print("\x1b[1;37m" + finalCmd + "\x1b[0m\n");
      setTimeout(function() { dosExit(); }, 1500);
    }
    return true;
  }

  // SPACE (32): insert a rest with the current note length
  if (keyCode === 32) {
    var lm = lengthModes[currentLengthMode];
    appendToken(restToken(lm));
    return true;
  }

  // Number keys 1-9: change length mode (9 toggles REST mode)
  if (keyCode >= 49 && keyCode <= 57) {
    var modeNum = keyCode - 48;
    if (modeNum === 9) {
      restMode = !restMode;
    } else {
      restMode = false;
      currentLengthMode = modeNum;
    }
    updateStatusLine();
    return true;
  }

  // Piano note keys (a-j, w-u)
  var keyChar = String.fromCharCode(keyCode).toLowerCase();
  var noteLetter = pianoNoteMap[keyChar];
  if (!noteLetter) return false;

  // Recompute octave from live modifier state on every note press
  currentOctave = computeOctave(event);

  // Prevent key repeat
  if (pressedKeys[keyChar]) return true;
  pressedKeys[keyChar] = noteLetter;

  var lm = lengthModes[currentLengthMode];

  if (restMode) {
    // REST mode: piano keys insert rests (P notation) instead of notes
    appendToken(restToken(lm));
  } else {
    // Normal mode: emit L/O tokens only when they change, then the note
    var lKey = lm.gwbasic + (lm.dotted ? "." : "");
    if (lastLengthInString !== lKey) {
      appendToken("L" + lKey);
      lastLengthInString = lKey;
    }
    if (lastOctaveInString !== currentOctave) {
      appendToken("O" + currentOctave);
      lastOctaveInString = currentOctave;
    }
    appendToken(noteToken(noteLetter, lm));

    // Play the note audio
    playNote(noteLetter + currentOctave, lm.ms);

    // Highlight the piano key with the octave colour
    keyHighlight(noteLetter, currentOctave);
  }

  return true;
}

function keyup(keyCode, event) {
  if (typeof keyCode !== 'number') return false;
  var keyChar = String.fromCharCode(keyCode).toLowerCase();
  if (pianoNoteMap[keyChar] && pressedKeys[keyChar]) {
    keyRestore(pressedKeys[keyChar]);
    delete pressedKeys[keyChar];
    return true;
  }
  return false;
}

// Initialize the piano display and GWBASIC output area
initializePiano = function() {
  drawPiano();
  // Set output position before first status draw so gotoGwbasicCursor() is valid
  gwbasicRow = 18;
  gwbasicCol = 1;
  // Key hint row (row 15 is blank after drawPiano's \n\n from row 14)
  print("\x1b[15;1H\x1b[2;37mCAP=O3 ^=O5 1-8=L SPC=P ESC=copy\x1b[0m");
  // Status line at row 16
  updateStatusLine();
  // GWBASIC label at row 17
  print("\x1b[17;1H\x1b[1;37mGWBASIC:\x1b[0m");
  // Initial token at row 18
  print("\x1b[18;1H\x1b[1;37mT120 \x1b[0m");
  gwbasicCol = 6;  // 5 visible chars in "T120 " → cursor is now at col 6
};

if (typeof beep !== 'undefined' && typeof playNote !== 'undefined') {
  initializePiano();
}
