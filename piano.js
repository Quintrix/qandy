RUN="piano.js"; 

if (typeof beep === 'undefined' || typeof playNote === 'undefined') {
  var soundScript=document.createElement('script');
  soundScript.src='sound.js';
  soundScript.onload=function() { run="piano.js"; initializePiano(); };
  soundScript.onerror=function() { print("ERROR: sound.js not loaded\n"); };
  document.head.appendChild(soundScript);
  // Define initializePiano as a placeholder that will be called after sound.js loads
  var initializePiano;
}

function drawPiano() {
  cls();
  pokeCursorOff();
  print("[-black]\n[bold][bgreen]  ╔══════════════════════════╗\n");
  print("  ║        [yellow]QANDY PIANO[bgreen]       ║\n");
  print("  ╚══════════════════════════╝\n\n");
  
  // Compact piano keyboard (32 chars max)

  keyWht="  [down][left][left]  [down][left][left]  "
  keyBlk="[black][-white]▐[-black] [-white]▌[down][left][left][left][-white]▐[-black] [-white]▌[down][left][left][left][-white]▐[-black] [-white]▌";  
  
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
  print("\033[7;8H"+keyBlk+"");
  print("\033[7;11H"+keyBlk+"");
  print("\033[7;17H"+keyBlk+"");
  print("\033[7;20H"+keyBlk+"");
  print("\033[7;23H"+keyBlk+"");
  print("\033[14;7H[-black][cyan]C  D  E  F   G  A  B\n\n");
}

function updateNowPlayingDisplay() {
  var keys = Object.keys(pressedKeys);
  if (keys.length === 0) {
  
  } else { 
    if (keys.length === 1) {
      // Single note
      var note = pressedKeys[keys[0]];
      keyHighlight(note);
      var keyLabel = pianoKeyLabels[note];
      print(keyLabel+"→"+note+" ");
    } else {
      // Multiple notes (chord)
      var notesList = [];
      var keysList = [];
      for (var i = 0; i < keys.length; i++) {
        var note = pressedKeys[keys[i]];
        notesList.push(note);
        keysList.push(pianoKeyLabels[note]);
      }
      print("\x1b[1;35m♫ Chord: " + keysList.join('+') + " → " + notesList.join('+') + "\x1b[0m");
    }
  }
}

function keyHighlight(note) {
  switch (note) {
    case "C4":
      pokeBG(6,6,103,2); pokeBG(6, 7,103,2); pokeBG(6, 8,103,2);
      pokeBG(6,9,103,2); pokeBG(6,10,103,2); pokeBG(6,11,103,2);
      break;
    case "D4":
      pokeBG(9,6,103,2); pokeBG(9, 7,103,2); pokeBG(9, 8,103,2);
      pokeBG(9,9,103,2); pokeBG(9,10,103,2); pokeBG(9,11,103,2);
      break;
    case "E4":
      pokeBG(12,6,103,2); pokeBG(12, 7,103,2); pokeBG(12, 8,103,2);
      pokeBG(12,9,103,2); pokeBG(12,10,103,2); pokeBG(12,11,103,2);
      break;
    case "F4":
      pokeBG(15,6,103,2); pokeBG(15, 7,103,2); pokeBG(15, 8,103,2);
      pokeBG(15,9,103,2); pokeBG(15,10,103,2); pokeBG(15,11,103,2);
      break;
    case "G4":
      pokeBG(18,6,103,2); pokeBG(18, 7,103,2); pokeBG(18, 8,103,2);
      pokeBG(18,9,103,2); pokeBG(18,10,103,2); pokeBG(18,11,103,2);
      break;
    case "A4":
      pokeBG(21,6,103,2); pokeBG(21, 7,103,2); pokeBG(21, 8,103,2);
      pokeBG(21,9,103,2); pokeBG(21,10,103,2); pokeBG(21,11,103,2);
      break;
    case "B4":
      pokeBG(24,6,103,2); pokeBG(24, 7,103,2); pokeBG(24, 8,103,2);
      pokeBG(24,9,103,2); pokeBG(24,10,103,2); pokeBG(24,11,103,2);
      break;
    case "C#4":
      pokeFG(7,6,33,1); pokeBG(8,6,43,1); pokeFG(9,6,33,1);
      pokeFG(7,7,33,1); pokeBG(8,7,43,1); pokeFG(9,7,33,1);
      pokeFG(7,8,33,1); pokeBG(8,8,43,1); pokeFG(9,8,33,1); 
      break;
    case "D#4":
      pokeFG(10,6,33,1); pokeBG(11,6,43,1); pokeFG(12,6,33,1);
      pokeFG(10,7,33,1); pokeBG(11,7,43,1); pokeFG(12,7,33,1);
      pokeFG(10,8,33,1); pokeBG(11,8,43,1); pokeFG(12,8,33,1);
      break;
    case "F#4":
      pokeFG(16,6,33,1); pokeBG(17,6,43,1); pokeFG(18,6,33,1);
      pokeFG(16,7,33,1); pokeBG(17,7,43,1); pokeFG(18,7,33,1);
      pokeFG(16,8,33,1); pokeBG(17,8,43,1); pokeFG(18,8,33,1);
      break;
    case "G#4":
      pokeFG(19,6,33,1); pokeBG(20,6,43,1); pokeFG(21,6,33,1);
      pokeFG(19,7,33,1); pokeBG(20,7,43,1); pokeFG(21,7,33,1);
      pokeFG(19,8,33,1); pokeBG(20,8,43,1); pokeFG(21,8,33,1);
      break;
    case "A#4":
      pokeFG(22,6,33,1); pokeBG(23,6,43,1); pokeFG(24,6,33,1);
      pokeFG(22,7,33,1); pokeBG(23,7,43,1); pokeFG(24,7,33,1);
      pokeFG(22,8,33,1); pokeBG(23,8,43,1); pokeFG(24,8,33,1);
      break;
  }
}

function keyRestore(note) {
  switch (note) {
    case "C4":
      pokeBG(6,6,47,2); pokeBG(6, 7,47,2); pokeBG(6, 8,47,2);
      pokeBG(6,9,47,2); pokeBG(6,10,47,2); pokeBG(6,11,47,2);
      break;
    case "D4":
      pokeBG(9,6,47,2); pokeBG(9, 7,47,2); pokeBG(9, 8,47,2);
      pokeBG(9,9,47,2); pokeBG(9,10,47,2); pokeBG(9,11,47,2);
      break;
    case "E4":
      pokeBG(12,6,47,2); pokeBG(12, 7,47,2); pokeBG(12, 8,47,2);
      pokeBG(12,9,47,2); pokeBG(12,10,47,2); pokeBG(12,11,47,2);
      break;
    case "F4":
      pokeBG(15,6,47,2); pokeBG(15, 7,47,2); pokeBG(15, 8,47,2);
      pokeBG(15,9,47,2); pokeBG(15,10,47,2); pokeBG(15,11,47,2);
      break;
    case "G4":
      pokeBG(18,6,47,2); pokeBG(18, 7,47,2); pokeBG(18, 8,47,2);
      pokeBG(18,9,47,2); pokeBG(18,10,47,2); pokeBG(18,11,47,2);
      break;
    case "A4":
      pokeBG(21,6,47,2); pokeBG(21, 7,47,2); pokeBG(21, 8,47,2);
      pokeBG(21,9,47,2); pokeBG(21,10,47,2); pokeBG(21,11,47,2);
      break;
    case "B4":
      pokeBG(24,6,47,2); pokeBG(24, 7,47,2); pokeBG(24, 8,47,2);
      pokeBG(24,9,47,2); pokeBG(24,10,47,2); pokeBG(24,11,47,2);
      break;
  }
}


var pianoKeyMap = {
  // White keys (natural notes)
  'a': 'C4', 's': 'D4', 'd': 'E4', 'f': 'F4', 'g': 'G4', 'h': 'A4', 'j': 'B4',
  // Black keys (sharps/flats)
  'w': 'C#4', 'e': 'D#4', 't': 'F#4', 'y': 'G#4', 'u': 'A#4'
};

var pianoKeyLabels = {
  'C4': 'A', 'C#4': 'W',
  'D4': 'S', 'D#4': 'E',
  'E4': 'D',
  'F4': 'F', 'F#4': 'T',
  'G4': 'G', 'G#4': 'Y',
  'A4': 'H', 'A#4': 'U',
  'B4': 'J',
  'C5': 'K'
};

// Track which keys are currently pressed (for visual feedback)
var pressedKeys = {};

// Track the line number where we display the currently playing note
var noteDisplayLine = 20; // Updated for compact layout

function keydown(keyCode, event) {
  // keyCode: numeric event.keyCode from press()
  // event: the original event object (optional)
  if (typeof keyCode !== 'number') return false;

  // Escape -> exit
  if (keyCode === 27) { dosExit(); return; }

  // Convert keyCode (e.g. 65) to character 'a'
  var keyChar = String.fromCharCode(keyCode).toLowerCase();

  // Look up the note for that piano key
  var note = pianoKeyMap[keyChar];
  if (!note) return false;

  // Only play if key wasn't already pressed (prevents key repeat)
  if (!pressedKeys[keyChar]) {
    playNote(note, 300);
    pressedKeys[keyChar] = note;
    updateNowPlayingDisplay();
  }

  return true;
}

function keyup(keyCode, event) {
  // Expect numeric keyCode from press()
  if (typeof keyCode !== 'number') return false;

  // Convert keyCode to lowercase character used by pianoKeyMap/pressedKeys
  var keyChar = String.fromCharCode(keyCode).toLowerCase();

  // If this key maps to a piano note and is currently marked pressed, release it
  if (pianoKeyMap[keyChar] && pressedKeys[keyChar]) {
    keyRestore(pianoKeyMap[keyChar]);
    delete pressedKeys[keyChar];
    updateNowPlayingDisplay();
    return true;
  }

  return false;
}


// Example songs using the music API

function playScale() {
  // Use cursor positioning to display message without scrolling
  print("\x1b[" + noteDisplayLine + ";1H\x1b[K");
  print("\x1b[1;32mPlaying C Major Scale...\x1b[0m");
  playTune("C4:300 D4:300 E4:300 F4:300 G4:300 A4:300 B4:300 C5:500");
}

function playTwinkleTwinkle() {
  print("\x1b[" + noteDisplayLine + ";1H\x1b[K");
  print("\x1b[1;32mPlaying Twinkle Twinkle Little Star...\x1b[0m");
  // Twinkle twinkle little star, how I wonder what you are
  playTune("C4:300 C4:300 G4:300 G4:300 A4:300 A4:300 G4:600 " +
           "F4:300 F4:300 E4:300 E4:300 D4:300 D4:300 C4:600 " +
           "G4:300 G4:300 F4:300 F4:300 E4:300 E4:300 D4:600 " +
           "G4:300 G4:300 F4:300 F4:300 E4:300 E4:300 D4:600 " +
           "C4:300 C4:300 G4:300 G4:300 A4:300 A4:300 G4:600 " +
           "F4:300 F4:300 E4:300 E4:300 D4:300 D4:300 C4:600");
}

function playMaryHadALamb() {
  print("\x1b[" + noteDisplayLine + ";1H\x1b[K");
  print("\x1b[1;32mPlaying Mary Had a Little Lamb...\x1b[0m");
  // Mary had a little lamb, little lamb, little lamb
  playTune("E4:300 D4:300 C4:300 D4:300 E4:300 E4:300 E4:600 " +
           "D4:300 D4:300 D4:600 E4:300 G4:300 G4:600 " +
           "E4:300 D4:300 C4:300 D4:300 E4:300 E4:300 E4:300 E4:300 " +
           "D4:300 D4:300 E4:300 D4:300 C4:800");
}

function playHappyBirthday() {
  print("\x1b[" + noteDisplayLine + ";1H\x1b[K");
  print("\x1b[1;32mPlaying Happy Birthday...\x1b[0m");
  // Happy birthday to you
  playTune("C4:200 C4:200 D4:400 C4:400 F4:400 E4:800 " +
           "C4:200 C4:200 D4:400 C4:400 G4:400 F4:800 " +
           "C4:200 C4:200 C5:400 A4:400 F4:400 E4:400 D4:800 " +
           "A#4:200 A#4:200 A4:400 F4:400 G4:400 F4:800");
}

function playChord(notes, duration) {
  // Play multiple notes simultaneously (or very close together)
  // Notes should be an array like ['C4', 'E4', 'G4']
  duration = duration || 500;
  
  for (var i = 0; i < notes.length; i++) {
    (function(note, delay) {
      setTimeout(function() {
        playNote(note, duration);
      }, delay);
    })(notes[i], i * 10); // IIFE to capture note and delay correctly
  }
  
  // Use cursor positioning to display message without scrolling
  print("\x1b[" + noteDisplayLine + ";1H\x1b[K");
  print("\x1b[1;35m♫ Chord: " + notes.join(' ') + "\x1b[0m");
}

function playCMajorChord() {
  playChord(['C4', 'E4', 'G4'], 600);
}

function playFMajorChord() {
  playChord(['F4', 'A4', 'C5'], 600);
}

function playGMajorChord() {
  playChord(['G4', 'B4', 'D5'], 600);
}

function playChordProgression() {
  print("\x1b[" + noteDisplayLine + ";1H\x1b[K");
  print("\x1b[1;32mPlaying Chord Progression (C-F-G-C)...\x1b[0m");
  
  setTimeout(function() { playCMajorChord(); }, 0);
  setTimeout(function() { playFMajorChord(); }, 800);
  setTimeout(function() { playGMajorChord(); }, 1600);
  setTimeout(function() { playCMajorChord(); }, 2400);
}

// Function to initialize the piano display
initializePiano = function() { drawPiano(); };
if (typeof beep !== 'undefined' && typeof playNote !== 'undefined') {
  initializePiano();
}
