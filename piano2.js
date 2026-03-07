// piano_script.js - improved QANDY piano script
// Sets RUN so qandy-host will redirect input to this script
// Usage: run the qandy-host, login as root, then execute "piano.js" (or ensure RUN is set)

RUN = "piano.js"; // ensure host sees uppercase RUN variable

// Load sound.js if needed
if (typeof beep === 'undefined' || typeof playNote === 'undefined') {
  var soundScript = document.createElement('script');
  soundScript.src = 'sound.js';
  soundScript.onload = function() { initializePiano(); };
  soundScript.onerror = function() { print("ERROR: sound.js not loaded\n"); };
  document.head.appendChild(soundScript);
}

// Piano keyboard mapping
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

// pressedKeys: map from key char -> { note: 'C4', start: timestamp, playing: true }
var pressedKeys = {};

// Line where "Now playing" is displayed
var noteDisplayLine = 20; // compact layout

function drawPiano() {
  print("[-black][cls][home]\n[bold][bgreen]  ╔══════════════════════════╗\n");
  print("  ║        [yellow]QANDY PIANO[bgreen]       ║\n");
  print("  ╚══════════════════════════╝\n");
  print("\n");
  
  var keyWht = "  [down][left][left]  [down][left][left]  ";
  var keyBlk = "▌ ▐[down][left][left][left]▌ ▐[down][left][left][left]▌ ▐";
  
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

  // black key row
  print("\033[7;6H[-black]"+keyBlk+"[-black]");
  print("\033[7;9H[-black]"+keyBlk+"[-black]");
  print("\033[7;15H[-black]"+keyBlk+"[-black]");
  print("\033[7;18H[-black]"+keyBlk+"[-black]");
  print("\033[7;21H[-black]"+keyBlk+"[-black]");

  // bottom white row (visual)
  print("\033[10;5H[-white]"+keyWht+"[-black]");
  print("\033[10;8H[-white]"+keyWht+"[-black]");
  print("\033[10;11H[-white]"+keyWht+"[-black]");
  print("\033[10;14H[-white]"+keyWht+"[-black]");
  print("\033[10;17H[-white]"+keyWht+"[-black]");
  print("\033[10;20H[-white]"+keyWht+"[-black]");
  print("\033[10;23H[-white]"+keyWht+"[-black]");
  print("\033[10;26H[-white]"+keyWht+"[-black]");

  print("\033[14;5H[cyan]C  D  E  F   G  A  B  C\n\n");
}

function nowMs() { return (new Date()).getTime(); }

// Compatibility layer for sound: prefer startNote/stopNote if present, else use playNote with fallback
var SoundCompat = {
  playWithDuration: function(note, duration) {
    if (typeof startNote !== 'undefined' && typeof stopNote !== 'undefined') {
      startNote(note);
      if (duration && duration > 0) {
        setTimeout(function() { stopNote(note); }, duration);
      }
      return { method: 'startstop' };
    } else if (typeof playNote !== 'undefined') {
      // playNote plays for a given duration; use it as fallback
      playNote(note, duration || 500);
      return { method: 'playnote' };
    } else {
      print("No sound API available for " + note + "\n");
      return null;
    }
  },
  start: function(note) {
    if (typeof startNote !== 'undefined') { startNote(note); return true; }
    // If only playNote exists, play a large duration and record that we used playnote
    if (typeof playNote !== 'undefined') { playNote(note, 60000); return true; }
    return false;
  },
  stop: function(note) {
    if (typeof stopNote !== 'undefined') { stopNote(note); return true; }
    // If playNote fallback was used, we cannot reliably stop; no-op
    return false;
  }
};

// Update the "now playing" display based on currently pressed keys
function updateNowPlayingDisplay() {
  var keys = Object.keys(pressedKeys);
  print("\x1b[" + noteDisplayLine + ";1H"); // Move to note display line
  print("\x1b[K"); // Clear to end of line
  
  if (keys.length === 0) {
    print("Now playing:");
    return;
  }
  
  if (keys.length === 1) {
    var key = keys[0];
    var item = pressedKeys[key];
    var note = item.note;
    var keyLabel = pianoKeyLabels[note] || key.toUpperCase();
    print("\x1b[1;36m♪ " + keyLabel + " → " + note + "\x1b[0m");
    return;
  }
  
  // chord
  var notesList = [];
  var keysList = [];
  for (var i = 0; i < keys.length; i++) {
    var item = pressedKeys[keys[i]];
    notesList.push(item.note);
    keysList.push(pianoKeyLabels[item.note] || keys[i].toUpperCase());
  }
  print("\x1b[1;35m♫ Chord: " + keysList.join('+') + " → " + notesList.join('+') + "\x1b[0m");
}

// Primary keydown: start note if not already pressed
function keydown(key) {
  if (!key) return false;
  var keyLower = key.toLowerCase();
  if (pianoKeyMap[keyLower]) {
    var note = pianoKeyMap[keyLower];
    if (!pressedKeys[keyLower]) {
      // record start time
      pressedKeys[keyLower] = { note: note, start: nowMs(), playing: true };
      // Start sound (compat)
      SoundCompat.start(note);
      updateNowPlayingDisplay();
    } else {
      // already pressed: ignore repeats
    }
    return true;
  }
  // not a piano key: return false so host can process if needed
  return false;
}

// Key release handler (rename of the previous incorrectly-named function)
function keyup(key) {
  if (!key) return false;
  var keyLower = key.toLowerCase();
  if (pianoKeyMap[keyLower] && pressedKeys[keyLower]) {
    var item = pressedKeys[keyLower];
    var note = item.note;
    var duration = nowMs() - item.start;
    // Try to stop the note if API supports it; otherwise play a short release if needed
    var stopped = SoundCompat.stop(note);
    if (!stopped) {
      // If we used the playNote fallback earlier with a very long duration,
      // we couldn't stop it — as a best-effort, play a short note to represent release
      // (this behavior depends on your sound.js implementation)
      if (typeof playNote !== 'undefined') { playNote(note, Math.max(100, Math.min(1200, duration))); }
    }
    delete pressedKeys[keyLower];
    updateNowPlayingDisplay();
    return true;
  }
  return false;
}

// Provide an input(line) so typed commands routed by RUN can work
// Accept simple commands: scale, twinkle, mary, happy, chord, stop, exit
function input(line) {
  if (!line) return;
  var cmd = line.trim().toLowerCase();
  if (cmd === "scale" || cmd === "play scale") {
    playScale();
    return;
  }
  if (cmd === "twinkle" || cmd === "play twinkle") {
    playTwinkleTwinkle();
    return;
  }
  if (cmd === "mary" || cmd === "play mary") {
    playMaryHadALamb();
    return;
  }
  if (cmd === "happy" || cmd === "play happy") {
    playHappyBirthday();
    return;
  }
  if (cmd.indexOf("chord ") === 0) {
    // simple: "chord C" -> play C major
    var which = cmd.substring(6).trim().toUpperCase();
    if (which === "C") playCMajorChord();
    else if (which === "F") playFMajorChord();
    else if (which === "G") playGMajorChord();
    else print("Unknown chord: " + which + "\n");
    return;
  }
  if (cmd === "stop") {
    // stop all notes if stopNote is available
    Object.keys(pressedKeys).forEach(function(k) {
      try { SoundCompat.stop(pressedKeys[k].note); } catch (e) {}
    });
    pressedKeys = {};
    updateNowPlayingDisplay();
    return;
  }
  if (cmd === "exit" || cmd === "quit") {
    // If your host accepts returning false or clearing RUN, do that here
    RUN = ""; // signal host to stop redirecting to this script (host must honor this)
    print("Exiting piano mode.\n");
    return;
  }
  print("Unrecognized command: " + line + "\nCommands: scale, twinkle, mary, happy, chord <C|F|G>, stop, exit\n");
}

// Example songs using the music API
function playScale() {
  print("\x1b[" + noteDisplayLine + ";1H\x1b[K");
  print("\x1b[1;32mPlaying C Major Scale...\x1b[0m");
  playTune("C4:300 D4:300 E4:300 F4:300 G4:300 A4:300 B4:300 C5:500");
}

function playTwinkleTwinkle() {
  print("\x1b[" + noteDisplayLine + ";1H\x1b[K");
  print("\x1b[1;32mPlaying Twinkle Twinkle Little Star...\x1b[0m");
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
  playTune("E4:300 D4:300 C4:300 D4:300 E4:300 E4:300 E4:600 " +
           "D4:300 D4:300 D4:600 E4:300 G4:300 G4:600 " +
           "E4:300 D4:300 C4:300 D4:300 E4:300 E4:300 E4:300 E4:300 " +
           "D4:300 D4:300 E4:300 D4:300 C4:800");
}

function playHappyBirthday() {
  print("\x1b[" + noteDisplayLine + ";1H\x1b[K");
  print("\x1b[1;32mPlaying Happy Birthday...\x1b[0m");
  playTune("C4:200 C4:200 D4:400 C4:400 F4:400 E4:800 " +
           "C4:200 C4:200 D4:400 C4:400 G4:400 F4:800 " +
           "C4:200 C4:200 C5:400 A4:400 F4:400 E4:400 D4:800 " +
           "A#4:200 A#4:200 A4:400 F4:400 G4:400 F4:800");
}

function playChord(notes, duration) {
  duration = duration || 500;
  for (var i = 0; i < notes.length; i++) {
    (function(note, delay) {
      setTimeout(function() { SoundCompat.playWithDuration(note, duration); }, delay);
    })(notes[i], i * 10);
  }
  print("\x1b[" + noteDisplayLine + ";1H\x1b[K");
  print("\x1b[1;35m♫ Chord: " + notes.join(' ') + "\x1b[0m");
}

function playCMajorChord() { playChord(['C4', 'E4', 'G4'], 600); }
function playFMajorChord() { playChord(['F4', 'A4', 'C5'], 600); }
function playGMajorChord() { playChord(['G4', 'B4', 'D5'], 600); }
function playChordProgression() {
  print("\x1b[" + noteDisplayLine + ";1H\x1b[K");
  print("\x1b[1;32mPlaying Chord Progression (C-F-G-C)...\x1b[0m");
  setTimeout(function() { playCMajorChord(); }, 0);
  setTimeout(function() { playFMajorChord(); }, 800);
  setTimeout(function() { playGMajorChord(); }, 1600);
  setTimeout(function() { playCMajorChord(); }, 2400);
}

// Initialize
initializePiano = function() { drawPiano(); updateNowPlayingDisplay(); };
if (typeof beep !== 'undefined' && typeof playNote !== 'undefined') {
  initializePiano();
}
