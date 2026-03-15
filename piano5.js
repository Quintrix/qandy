run="piano.js"; 

if (typeof beep === 'undefined' || typeof playNote === 'undefined') {
  var soundScript=document.createElement('script');
  soundScript.src='sound.js';
  soundScript.onload=function() { run="piano.js"; initializePiano(); };
  soundScript.onerror=function() { print("ERROR: sound.js not loaded\n"); };
  document.head.appendChild(soundScript);
  // Define initializePiano as a placeholder that will be called after sound.js loads
  var initializePiano;
}

// Piano keyboard mapping
// Top row (black keys): W E  T Y U  (sharps/flats)
// Bottom row (white keys): A S D F G H J K (natural notes C-C)

var pianoKeyMap = {
  // White keys (natural notes)
  'a': 'C4', 's': 'D4', 'd': 'E4', 'f': 'F4', 'g': 'G4', 'h': 'A4', 'j': 'B4', 'k': 'C5',
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

function drawPiano() {
  pokeCursorOff();
  print("[-black][cls]\n[bold][bgreen]  ╔══════════════════════════╗\n");
  print("  ║        [yellow]QANDY PIANO[bgreen]       ║\n");
  print("  ╚══════════════════════════╝\n");
  print("\n");
  
  // Compact piano keyboard (32 chars max)

  keyWht="  [down][left][left]  [down][left][left]  "
  keyBlk="[black][-white]▐[-black] [-white]▌[down][left][left][left][-white]▐[-black] [-white]▌[down][left][left][left][-white]▐[-black] [-white]▌";  
  
  pokeCursorOff();
   print("[white][-black]");
   print("\033[7;5H[-white]"+keyWht+"[-black]");
   print("\033[7;8H[-white]"+keyWht+"[-black]");
  print("\033[7;11H[-white]"+keyWht+"[-black]");
  print("\033[7;14H[-white]"+keyWht+"[-black]");
  print("\033[7;17H[-white]"+keyWht+"[-black]");
  print("\033[7;20H[-white]"+keyWht+"[-black]");
  print("\033[7;23H[-white]"+keyWht+"[-black]");
  print("\033[7;26H[-white]"+keyWht+"[-black]");
   print("\033[10;5H[-white]"+keyWht+"[-black]");
   print("\033[10;8H[-white]"+keyWht+"[-black]");
  print("\033[10;11H[-white]"+keyWht+"[-black]");
  print("\033[10;14H[-white]"+keyWht+"[-black]");
  print("\033[10;17H[-white]"+keyWht+"[-black]");
  print("\033[10;20H[-white]"+keyWht+"[-black]");
  print("\033[10;23H[-white]"+keyWht+"[-black]");
  print("\033[10;26H[-white]"+keyWht+"[-black]");

   print("\033[7;6H"+keyBlk+"");
   print("\033[7;9H"+keyBlk+"");
  print("\033[7;15H"+keyBlk+"");
  print("\033[7;18H"+keyBlk+"");
  print("\033[7;21H"+keyBlk+"");

  print("\033[14;5H[-black][cyan]C  D  E  F   G  A  B  C\n\n");
  
}

  window.keydown = function (kc, ev) {
    try {
      // Normalize key string: prefer ev.key when available
      var keyRaw = (ev && typeof ev.key === 'string' && ev.key.length > 0) ? ev.key : String.fromCharCode(kc || 0);
      // If named key (e.g., 'Escape') handle special cases
      if (keyRaw === 'Escape' || keyRaw === 'Esc') {
        window.dosExit();
        return;
      }

      var keyChar = keyRaw.length === 1 ? keyRaw.toLowerCase() : keyRaw.toLowerCase();
      // Only handle single-character letter keys mapped in pianoKeyMap
      if (!pianoKeyMap.hasOwnProperty(keyChar)) return false;

      // Prevent repeats from starting new notes if already pressed
      if (pressedKeys[keyChar]) return true;

      // Ensure sound subsystem loaded
      //if (!soundLoaded) {
      //  ensureSound(function () {
      //    soundLoaded = (typeof playNote !== 'undefined');
      //    // Start the note after ensuring sound is available
      //    var note = pianoKeyMap[keyChar];
      //    var handle = startNote(note);
      //    pressedKeys[keyChar] = handle;
      //    updateNowPlayingDisplay();
      //  });
      //  return true;
      //}

      var note = pianoKeyMap[keyChar];
      var handle = startNote(note);
      pressedKeys[keyChar] = handle;
      updateNowPlayingDisplay();
      return true;
    } catch (e) {
      print("Error: keydown() "+e);
      return false;
    }
  };

  window.keyup = function (kc, ev) {
    try {
      var keyRaw = (ev && typeof ev.key === 'string' && ev.key.length > 0) ? ev.key : String.fromCharCode(kc || 0);
      var keyChar = keyRaw.length === 1 ? keyRaw.toLowerCase() : keyRaw.toLowerCase();
      if (!pressedKeys[keyChar]) return false;
      var handle = pressedKeys[keyChar];
      delete pressedKeys[keyChar];
      stopNoteHandle(handle);
      updateNowPlayingDisplay();
      return true;
    } catch (e) {
      safeError(e, 'keyup');
      return false;
    }
  };



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
  SYNC=0;
  switch (note) {
    case "C4":
      pokeBG(4,6,33,2); pokeBG(4,7,33,2); pokeBG(4,8,33,2);
      pokeBG(4,9,33,2); pokeBG(4,10,33,2); pokeBG(4,11,33,2);
      break;
    case "D4":
      pokeBG(7,6,33,2); pokeBG(7,7,33,2); pokeBG(7,8,33,2);
      pokeBG(7,9,33,2); pokeBG(7,10,33,2); pokeBG(7,11,33,2);
      break;
    case "E4":
      pokeBG(10,6,33,2); pokeBG(10,7,33,2); pokeBG(10,8,33,2);
      pokeBG(10,9,33,2); pokeBG(10,10,33,2); pokeBG(10,11,33,2);
      break;
    case "F4":
      pokeBG(13,6,33,2); pokeBG(13,7,33,2); pokeBG(13,8,33,2);
      pokeBG(13,9,33,2); pokeBG(13,10,33,2); pokeBG(13,11,33,2);
      break;
    case "G4":
      pokeBG(16,6,33,2); pokeBG(16,7,33,2); pokeBG(16,8,33,2);
      pokeBG(16,9,33,2); pokeBG(16,10,33,2); pokeBG(16,11,33,2);
      break;
    case "A4":
      pokeBG(19,6,33,2); pokeBG(19,7,33,2); pokeBG(198,33,2);
      pokeBG(19,9,33,2); pokeBG(19,10,33,2); pokeBG(19,11,33,2);
      break;
    case "B4":
      pokeBG(22,6,33,2); pokeBG(22,7,33,2); pokeBG(22,8,33,2);
      pokeBG(22,9,33,2); pokeBG(22,10,33,2); pokeBG(22,11,33,2);
      break;
    case "C5":
      pokeBG(25,6,33,2); pokeBG(25,7,33,2); pokeBG(25,8,33,2);
      pokeBG(25,9,33,2); pokeBG(25,10,33,2); pokeBG(25,11,33,2);
      break;
  }
  SYNC=1; pokeRefresh();
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



















  // playChord helper: plays notes with small stagger
  function playChord(notes, duration) {
    duration = duration || 500;
    for (var i = 0; i < notes.length; i++) {
      (function (note, delay) {
        setTimeout(function () {
          try { playNote && playNote(note, duration); } catch (e) { /* ignore */ }
        }, delay);
      })(notes[i], i * 10);
    }
    safePrint("♫ Chord: " + notes.join(' '));
  }

  // Safe dosExit - restore host, clear handlers and modifiers, and focus
  window.dosExit = window.dosExit || function () {
    try {
      RUN = "qandy.js";
    } catch (e) {}
    try { delete window.keydown; } catch (e) { window.keydown = undefined; }
    try { delete window.keyup; } catch (e) { window.keyup = undefined; }
    try { delete window.input; } catch (e) { /* optional */ }

    try { ctrl = 0; alt = 0; shift = 0; ctrlPhysical = false; altPhysical = false; } catch (e) {}
    try { if (typeof updateKeyLabels === 'function') updateKeyLabels(); } catch (e) {}
    try { window.focus(); if (document && document.body && document.body.focus) document.body.focus(); } catch (e) {}
    try { safePrint('Returned to host (qandy.js)'); } catch (e) {}
  };

  // Initialize UI and sound if available
  initializePiano = function () {
    try { drawPiano(); updateNowPlayingDisplay(); } catch (e) { safeError(e, 'initializePiano'); }
  };

  // Try to initialize immediately if sound already present
  if (soundLoaded) initializePiano();
  else ensureSound(initializePiano);

  // Expose for interactive debugging (optional)
  window.pianoDebug = window.pianoDebug || {
    pressedKeys: pressedKeys,
    map: pianoKeyMap,
    labels: pianoKeyLabels
  };

})();

