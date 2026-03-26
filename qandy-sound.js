
// ──── Qandy Sound Card ──────────────────────────────────────────────────────────────

window.sound_js=function() {
  window.audioContext = null;
  window.noteFrequencies = {
    'C0': 16.35, 'C#0': 17.32, 'Db0': 17.32, 'D0': 18.35, 'D#0': 19.45, 'Eb0': 19.45, 'E0': 20.60,
    'F0': 21.83, 'F#0': 23.12, 'Gb0': 23.12, 'G0': 24.50, 'G#0': 25.96, 'Ab0': 25.96, 'A0': 27.50,
    'A#0': 29.14, 'Bb0': 29.14, 'B0': 30.87, 'C1': 32.70, 'C#1': 34.65, 'Db1': 34.65, 'D1': 36.71,
    'D#1': 38.89, 'Eb1': 38.89, 'E1': 41.20, 'F1': 43.65, 'F#1': 46.25, 'Gb1': 46.25, 'G1': 49.00,
    'G#1': 51.91, 'Ab1': 51.91, 'A1': 55.00, 'A#1': 58.27, 'Bb1': 58.27, 'B1': 61.74, 'C2': 65.41,
    'C#2': 69.30, 'Db2': 69.30, 'D2': 73.42, 'D#2': 77.78, 'Eb2': 77.78, 'E2': 82.41, 'F2': 87.31,
    'F#2': 92.50, 'Gb2': 92.50, 'G2': 98.00, 'G#2': 103.83, 'Ab2': 103.83, 'A2': 110.00,
    'A#2': 116.54, 'Bb2': 116.54, 'B2': 123.47,
    'C3': 130.81, 'C#3': 138.59, 'Db3': 138.59, 'D3': 146.83, 'D#3': 155.56, 'Eb3': 155.56,
    'E3': 164.81, 'F3': 174.61, 'F#3': 185.00, 'Gb3': 185.00, 'G3': 196.00, 'G#3': 207.65, 'Ab3': 207.65,
    'A3': 220.00, 'A#3': 233.08, 'Bb3': 233.08, 'B3': 246.94,
    'C4': 261.63, 'C#4': 277.18, 'Db4': 277.18, 'D4': 293.66, 'D#4': 311.13, 'Eb4': 311.13,
    'E4': 329.63, 'F4': 349.23, 'F#4': 369.99, 'Gb4': 369.99, 'G4': 392.00, 'G#4': 415.30, 'Ab4': 415.30,
    'A4': 440.00, 'A#4': 466.16, 'Bb4': 466.16, 'B4': 493.88,
    'C5': 523.25, 'C#5': 554.37, 'Db5': 554.37, 'D5': 587.33, 'D#5': 622.25, 'Eb5': 622.25,
    'E5': 659.25, 'F5': 698.46, 'F#5': 739.99, 'Gb5': 739.99, 'G5': 783.99, 'G#5': 830.61, 'Ab5': 830.61,
    'A5': 880.00, 'A#5': 932.33, 'Bb5': 932.33, 'B5': 987.77,
    'C6': 1046.50, 'C#6': 1108.73, 'Db6': 1108.73, 'D6': 1174.66, 'D#6': 1244.51, 'Eb6': 1244.51,
    'E6': 1318.51, 'F6': 1396.91, 'F#6': 1479.98, 'Gb6': 1479.98, 'G6': 1567.98, 'G#6': 1661.22, 'Ab6': 1661.22,
    'A6': 1760.00, 'A#6': 1864.66, 'Bb6': 1864.66, 'B6': 1975.53,
    'C7': 2093.00, 'C#7': 2217.46, 'Db7': 2217.46, 'D7': 2349.32, 'D#7': 2489.02, 'Eb7': 2489.02,
    'E7': 2637.02, 'F7': 2793.83, 'F#7': 2959.96, 'Gb7': 2959.96, 'G7': 3135.96, 'G#7': 3322.44, 'Ab7': 3322.44,
    'A7': 3520.00, 'A#7': 3729.31, 'Bb7': 3729.31, 'B7': 3951.07,
    'C8': 4186.01, 'C#8': 4434.92, 'Db8': 4434.92, 'D8': 4698.63, 'D#8': 4978.03, 'Eb8': 4978.03,
    'E8': 5274.04, 'F8': 5587.65, 'F#8': 5919.91, 'Gb8': 5919.91, 'G8': 6271.93, 'G#8': 6644.88, 'Ab8': 6644.88,
    'A8': 7040.00, 'A#8': 7458.62, 'Bb8': 7458.62, 'B8': 7902.13
   };

   window.playNote = function(note, duration = 200) {
    // Convert note to uppercase and trim whitespace
    note = note.toString().trim().toUpperCase();
  
    // If only a letter is provided (e.g., "C"), default to octave 4 (middle C)
    const validNotes = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
    if (note.length === 1 && validNotes.indexOf(note) !== -1) {
      note = note + '4';
    } else if (note.length === 2 && (note[1] === '#' || note[1] === 'B')) {
      // If note is like "C#" or "DB" (flat after uppercase), default to octave 4
      note = note + '4';
    }
  
    // Look up the frequency for the note
    const frequency = noteFrequencies[note];
  
    if (!frequency) {
      // Error: Unknown note - valid notes are C, C#/Db, D, D#/Eb, E, F, F#/Gb, G, G#/Ab, A, A#/Bb, B
      // Octaves: 0-8 (e.g., 'C4' is middle C, 'A4' is 440Hz)
      return false;
    }
  
    // Use the existing beep function with the note's frequency
    return beep(frequency, duration);
   }
   currentTune = null;  // Currently playing tune (can be stopped)
   var tuneTimeout = null;  // Timeout for next note
   window.playTune = function(musicString, onComplete) {
    stopTune();
    window.notes = parseMusicString(musicString);
    if (!notes || notes.length === 0) { return false; }
    currentTune = { notes: notes, index: 0, onComplete: onComplete };
    playNextNote();
    return true;
   }
   window.parseMusicString = function(musicString) {
    const notes = []; const tokens = musicString.trim().split(/\s+/);
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      const parts = token.split(':');
      const noteName = parts[0].trim().toUpperCase();
      let duration = parts[1] ? parseInt(parts[1]) : 200;
      if (isNaN(duration) || duration <= 0) { duration = 200; }
      if (noteName === 'R' || noteName === 'REST') { notes.push({ type: 'rest', duration: duration }); } else { notes.push({ type: 'note', note: noteName, duration: duration });}
    }
    return notes;
   }
  window.playNextNote = function() {
  if (!currentTune || currentTune.index >= currentTune.notes.length) {
    const callback = currentTune ? currentTune.onComplete : null;
    currentTune = null;
    if (callback) { callback(); }
    return;
  }
  const noteInfo = currentTune.notes[currentTune.index];
  currentTune.index++;
  if (noteInfo.type === 'rest') {
    tuneTimeout = setTimeout(playNextNote, noteInfo.duration);
  } else {
    playNote(noteInfo.note, noteInfo.duration);
    tuneTimeout = setTimeout(playNextNote, noteInfo.duration);
  }
 }

window.stopTune = function() { if (tuneTimeout) { clearTimeout(tuneTimeout); tuneTimeout = null; } currentTune = null; }
window.loopTune = function(musicString) { playTune(musicString, function() { loopTune(musicString); });}
window.loopNotes = function(gwbasicString) { playNotes(gwbasicString, function() { loopNotes(gwbasicString); }); }
window.playMelody = function(notesArray, onComplete) {
  const musicString = notesArray.map(function(note) {
    if (note[0] === 'R' || note[0] === 'rest') { return 'R:' + (note[1] || 200); }
    return note[0] + ':' + (note[1] || 200);
  }).join(' ');
  return playTune(musicString, onComplete);
}
window.playNotes = function(gwbasicString, onComplete) {
  const notes = parseGWBasicString(gwbasicString);
  if (!notes || notes.length === 0) { return false; }
  const musicString = notes.map(function(note) {
    if (note.type === 'rest') { return 'R:' + note.duration; }
    return note.note + ':' + note.duration;
  }).join(' ');
  return playTune(musicString, onComplete);
}
window.parseGWBasicString = function(str) {
  const notes = [];
  let currentOctave = 4;  // Default octave
  let currentLength = 4;  // Default quarter note (L4)
  let currentTempo = 120; // Default tempo (120 BPM = quarter notes per minute)
  function getDuration(length) { return Math.round((60000 / currentTempo) * (4 / length)); }
  str = str.trim().toUpperCase();
  let i = 0;
  while (i < str.length) {
    const char = str[i];
    if (char === ' ' || char === '\t') { i++; continue; }
    if (char === 'T') { i++; let numStr = '';
      while (i < str.length && str[i] >= '0' && str[i] <= '9') { numStr += str[i]; i++; }
      if (numStr) { const tempo = parseInt(numStr); if (tempo > 0 && tempo <= 255) { currentTempo = tempo; } }
      continue;
    }
    if (char === 'L') {
      i++; let numStr = '';
      while (i < str.length && str[i] >= '0' && str[i] <= '9') { numStr += str[i]; i++; }
      if (numStr) { const length = parseInt(numStr); if (length > 0 && length <= 64) { currentLength = length; } }
      continue;
    }
    if (char === 'O') {
      i++; if (i < str.length && str[i] >= '0' && str[i] <= '6') { currentOctave = parseInt(str[i]); i++; }
      continue;
    }
    
    if (char === 'P') {
      i++; let numStr = '';
      while (i < str.length && str[i] >= '0' && str[i] <= '9') { numStr += str[i]; i++; }
      const length = numStr ? parseInt(numStr) : currentLength;
      notes.push({ type: 'rest', duration: getDuration(length) });
      continue;
    }
    if (char >= 'A' && char <= 'G') {
      let noteName = char; i++;
      if (i < str.length && (str[i] === '#' || str[i] === '+')) {
        noteName += '#'; i++;
      } else if (i < str.length && str[i] === '-') {
        const flats = { 'D': 'C#', 'E': 'D#', 'G': 'F#', 'A': 'G#', 'B': 'A#' };
        if (flats[noteName]) { noteName = flats[noteName]; }
        i++;
      }
      let noteLength = currentLength; let numStr = '';
      while (i < str.length && str[i] >= '0' && str[i] <= '9') { numStr += str[i]; i++; }
      if (numStr) { noteLength = parseInt(numStr); }
      notes.push({ type: 'note', note: noteName + currentOctave, duration: getDuration(noteLength) });
      continue;
    }
    i++;
  }
  return notes;
}
window.BEEP_VOLUME = (typeof window.BEEP_VOLUME !== 'undefined') ? window.BEEP_VOLUME : 0.3;
window.beep = function(frequency = 800, duration = 200, volume) {
  try {
    if (!audioContext) {
      if (!window.AudioContext && !window.webkitAudioContext) { throw new Error('Web Audio API is not supported in this browser'); }
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    var vol = (typeof volume === 'number') ? volume : (window.BEEP_VOLUME || 0.3);
    vol = Math.max(0, Math.min(1, vol)); // clamp 0.0..1.0
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;
    gainNode.gain.value = vol;
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    const startTime = audioContext.currentTime;
    const endTime = startTime + (duration / 1000);
    oscillator.start(startTime);
    oscillator.stop(endTime);
    return true;
  } catch (error) {
    return false;
  }
}

window.volume = function(level) {
  if (typeof level === 'undefined') { return (typeof window.BEEP_VOLUME === 'number') ? window.BEEP_VOLUME : 0.3; }
  var prev = (typeof window.BEEP_VOLUME === 'number') ? window.BEEP_VOLUME : 0.3;
  var v = Number(level);
  if (isNaN(v)) v = 0;
  window.BEEP_VOLUME = Math.max(0, Math.min(1, v));
  return prev;
}

// if (isGuest) { beep(); }

// Signal that sound.js is ready
if (typeof window.qandySignalReady === 'function') {
  window.qandySignalReady('sound.js');
}
}