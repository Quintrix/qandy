
/* ═══════════════════════════════════════════════════════════════════════════
   Qandy / Cylon Sound Card — cylon-sound.js
   ───────────────────────────────────────────────────────────────────────────
   A square-wave audio driver for the Qandy Pocket Computer.

   WHAT THIS DRIVER DOES
     • One-shot tones ................ beep(freq, ms, gain?) / playNote('C#4', ms)
     • Token tunes ................... playTune("C4:200 E4:200 R:100")
     • GW-BASIC style MML ............ play('T180 O3 L8 CDEFGAB')
     • Multi-track / chords .......... sidplay('T180 O3 CDEFG ; O2 [CEG]2')

   SCHEDULING
     Every sequence is compiled once into an absolute-time event list, then a
     single lookahead scheduler hands notes to Web Audio using absolute
     AudioContext timestamps. Multi-track output therefore stays locked
     together instead of drifting a few ms per note the way chained
     setTimeout() calls do.

   PUBLIC API (all attached to window)
     beep(frequency, duration, volume)   -> boolean   low-level tone
     playNote(note, duration)            -> boolean   'C4', 'A#5', 'Db3'
     playTune(musicString, onComplete)   -> handle    "C4:200 D4:200"
     playMelody(notesArray, onComplete)  -> handle    [['C4',200],['R',100]]
     playNotes / play / gwplay(mml, cb)  -> handle    GW-BASIC PLAY string
     sidplay(mml, onComplete)            -> handle    ';' separates tracks
     loopTune / loopNotes(str, cb)       -> handle    repeats until .stop()
     stopTune() / stopAll()              -> void      silence + cancel
     parseMusicString(str)               -> tokens    (legacy shape)
     parseGWBasicString(str)             -> tokens    (legacy shape)
     compileMML(str)                     -> {events,total}  (new: real timings)
     frequencyOf(name)                   -> Hz | null (new: enharmonic safe)
     volume(level?)                      -> previous
     sound_js()                          -> AudioContext  (init/resume hook)
     noteFrequencies                     -> the reference table (unchanged)
     audioContext / BEEP_VOLUME / tuneTimeout  (legacy handles)

   A play/loop call always returns a HANDLE: { playing, stop() }.
   stopTune() stops whatever is currently playing (only one tune at a time,
   matching the original behaviour).
   ═══════════════════════════════════════════════════════════════════════ */

(function (global) {
'use strict';

// ── Tuning constants ───────────────────────────────────────────────────────
var ATTACK_S    = 0.004;   // gain ramp up — kills the click on note start
var RELEASE_S   = 0.012;   // gain ramp down — kills the click on note end
var MIN_DUR_S   = 0.010;   // shortest audible note
var MAX_DUR_S   = 30;      // sanity cap so a bad duration can't stick a tone
var MAX_VOICES  = 24;      // oldest voice is stolen past this
var LOOKAHEAD_S = 0.20;    // how far ahead of the clock notes are scheduled
var TICK_MS     = 25;      // scheduler poll interval
var LEAD_IN_S   = 0.03;    // small delay before a sequence starts
var DEFAULT_OCT = 4;       // bare 'C' means 'C4'

var DEBUG = !!global.QANDY_SOUND_DEBUG;
function warn() {
  if (!DEBUG || !global.console) return;
  var a = ['[cylon-sound]'];
  for (var i = 0; i < arguments.length; i++) a.push(arguments[i]);
  try { global.console.warn.apply(global.console, a); } catch (e) {}
}
function clamp01(n) { n = Number(n); if (!isFinite(n)) return 0; return n < 0 ? 0 : (n > 1 ? 1 : n); }

// Pre-existing volume setting is honoured if the host page set one.
global.BEEP_VOLUME = (typeof global.BEEP_VOLUME === 'number') ? clamp01(global.BEEP_VOLUME) : 1;
global.audioContext = null;
global.tuneTimeout  = null;

// ── Note table ─────────────────────────────────────────────────────────────
// Kept verbatim: this is public API and stays the source of truth for exact
// legacy values. Anything outside the table (odd octaves, Cb/B#/E#/Fb) is
// derived mathematically further down.
global.noteFrequencies = {
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

// ── Note names ─────────────────────────────────────────────────────────────
var SEMITONE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
// Spellings the table has no key for, so we can still find a frequency.
var ENHARMONIC = { 'Cb': 'B', 'B#': 'C', 'E#': 'F', 'Fb': 'E' };

// ['C', ''], ['C#', '#'], ['Db', 'b'] ...
function parseNoteName(raw) {
  if (raw === null || raw === undefined) return null;
  var m = /^([A-Ga-g])\s*([#+bB-]?)\s*(-?\d+)?$/.exec(String(raw).trim());
  if (!m) return null;
  var acc = m[2] || '';
  if (acc === '#' || acc === '+') acc = '#';
  else if (acc === 'b' || acc === 'B' || acc === '-') acc = 'b';
  else acc = '';
  return {
    letter: m[1].toUpperCase(),
    accidental: acc,
    octave: m[3] === undefined ? null : parseInt(m[3], 10)
  };
}

function midiOf(n) {
  var letter = n.letter, acc = n.accidental;
  if (ENHARMONIC[letter + acc]) { letter = ENHARMONIC[letter + acc]; acc = ''; }
  var oct = (n.octave === null ? DEFAULT_OCT : n.octave);
  return (oct + 1) * 12 + SEMITONE[letter] + (acc === '#' ? 1 : (acc === 'b' ? -1 : 0));
}

// 'Db4' -> 'Db4'   'db4' -> 'Db4'   'C#' -> 'C#4'   'bb' -> 'Bb4'
function canonicalNoteName(raw) {
  var n = parseNoteName(raw);
  if (!n) return null;
  var letter = n.letter, acc = n.accidental;
  if (ENHARMONIC[letter + acc]) { letter = ENHARMONIC[letter + acc]; acc = ''; }
  return letter + acc + (n.octave === null ? DEFAULT_OCT : n.octave);
}

function frequencyOf(raw) {
  var canon = canonicalNoteName(raw);
  if (!canon) { warn('unrecognised note:', raw); return null; }
  var exact = global.noteFrequencies[canon];
  if (exact) return exact;
  var midi = midiOf(parseNoteName(raw));
  if (midi < 0 || midi > 127) { warn('note out of range:', raw); return null; }
  return 440 * Math.pow(2, (midi - 69) / 12);   // A4 = MIDI 69 = 440 Hz
}

function frequencyOfMidi(midi) {
  if (!isFinite(midi) || midi < 0 || midi > 127) return null;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// ── Audio graph ────────────────────────────────────────────────────────────
var ctx = null, master = null, voices = [], unlockBound = false;

function getCtx() {
  if (ctx) return ctx;
  var AC = global.AudioContext || global.webkitAudioContext;
  if (!AC) { warn('Web Audio API unavailable'); return null; }
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = clamp01(global.BEEP_VOLUME);   // per-note gains sit on top of this
  master.connect(ctx.destination);
  global.audioContext = ctx;
  bindUnlock();
  return ctx;
}

function resume() {
  if (!ctx || ctx.state !== 'suspended') return;
  var p = ctx.resume();
  if (p && typeof p.catch === 'function') p.catch(function () {});
}

// Browsers refuse to start audio until a gesture. Anything that creates the
// context before the user touches the machine stays silent until the first
// tap/click/keypress, so hook that once and then get out of the way.
function bindUnlock() {
  if (unlockBound || !global.document || !global.document.addEventListener) return;
  unlockBound = true;
  var EVENTS = ['pointerdown', 'touchstart', 'mousedown', 'keydown'];
  function unlock() {
    resume();
    if (ctx && ctx.state === 'running') {
      for (var i = 0; i < EVENTS.length; i++) {
        global.document.removeEventListener(EVENTS[i], unlock, true);
      }
    }
  }
  for (var i = 0; i < EVENTS.length; i++) {
    global.document.addEventListener(EVENTS[i], unlock, true);
  }
}

function releaseVoice(v) {
  var i = voices.indexOf(v);
  if (i !== -1) voices.splice(i, 1);
  try { v.osc.disconnect(); } catch (e) {}
  try { v.gain.disconnect(); } catch (e) {}
}

// Silent (but inaudible-ramp, not hard-cut) fade. We never call osc.stop()
// a second time here: a later stop() call would move the end time *later*,
// so muting the gain and letting the scheduled stop land is the safe path.
function muteVoice(v) {
  if (!v || !ctx) return;
  var now = ctx.currentTime, g = v.gain.gain;
  try {
    if (typeof g.cancelAndHoldAtTime === 'function') {
      g.cancelAndHoldAtTime(now);
    } else {
      var held = g.value;
      g.cancelScheduledValues(now);
      g.setValueAtTime(held, now);
    }
    g.linearRampToValueAtTime(0, now + RELEASE_S);
  } catch (e) {
    try { g.value = 0; } catch (e2) {}
  }
}

function killAllVoices() {
  for (var i = voices.length - 1; i >= 0; i--) muteVoice(voices[i]);
}

function voice(freq, startTime, durationSec, gainValue) {
  var c = getCtx();
  if (!c || !freq) return false;
  resume();

  var dur = Math.max(MIN_DUR_S, Math.min(MAX_DUR_S, Number(durationSec) || 0.2));
  var t0 = Math.max(startTime, c.currentTime + 0.001);
  var tEnd = t0 + dur;
  var peak = clamp01(gainValue);

  if (voices.length >= MAX_VOICES) muteVoice(voices[0]);   // steal oldest

  var osc = c.createOscillator();
  var g = c.createGain();
  osc.type = 'square';
  osc.frequency.setValueAtTime(freq, t0);

  // Attack / hold / release so square waves don't pop at either end.
  var atk = Math.min(ATTACK_S, dur / 3);
  var rel = Math.min(RELEASE_S, dur / 3);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + atk);
  g.gain.setValueAtTime(peak, tEnd - rel);
  g.gain.linearRampToValueAtTime(0, tEnd);

  osc.connect(g);
  g.connect(master);

  var v = { osc: osc, gain: g, startedAt: t0 };
  osc.onended = function () { releaseVoice(v); };
  voices.push(v);

  osc.start(t0);
  osc.stop(tEnd);
  return true;
}

// ── Scheduler ──────────────────────────────────────────────────────────────
// A job is an absolute-time event list plus a cursor. Each tick pushes every
// event that falls inside the lookahead window into Web Audio, which does the
// sample-accurate part for us.
var job = null, tickId = null;

function stopTicker() {
  if (tickId !== null) { clearInterval(tickId); tickId = null; }
  global.tuneTimeout = null;
}

function finishJob(reason) {
  var finished = job;
  stopTicker();
  job = null;
  if (finished && finished.handle) finished.handle.playing = false;
  if (finished && finished.onComplete) {
    try { finished.onComplete(); } catch (e) { if (global.console) global.console.error(e); }
  }
  if (reason === 'stop') killAllVoices();
}

function tick() {
  var j = job;
  if (!j || !ctx) return;
  var now = ctx.currentTime;
  var horizon = now + LOOKAHEAD_S;
  var guard = 0;

  while (guard++ < 4096) {
    if (j.index < j.events.length) {
      var ev = j.events[j.index];
      var when = j.startAt + ev.time;
      if (when >= horizon) return;            // nothing else due yet
      j.index++;
      if (ev.freq) voice(ev.freq, when, ev.dur, ev.gain);
      continue;
    }
    // Everything is scheduled; wait for the tail of the last note.
    var endsAt = j.startAt + j.total;
    if (now < endsAt) return;
    if (j.loop && j.total > 0) {
      j.startAt = endsAt;                     // seamless: timeline continues
      j.index = 0;
      if (j.onComplete) {
        try { j.onComplete(); } catch (e) { if (global.console) global.console.error(e); }
        if (job !== j) return;                // callback may have stopped us
      }
      continue;
    }
    finishJob('complete');
    return;
  }
}

function startJob(events, total, opts) {
  opts = opts || {};
  var c = getCtx();
  if (!c || !events || !events.length) return null;
  resume();
  stopTune();                                  // one tune at a time

  var handle = { playing: true, stop: null };
  handle.stop = function () {
    handle.playing = false;
    if (job && job.handle === handle) stopTune();
  };

  job = {
    events: events,
    index: 0,
    startAt: c.currentTime + LEAD_IN_S,
    total: total,
    loop: !!opts.loop,
    onComplete: opts.onComplete || null,
    handle: handle
  };

  if (tickId === null) {
    tickId = setInterval(tick, TICK_MS);
    global.tuneTimeout = tickId;               // legacy handle, see stopTune()
  }
  tick();
  return handle;
}

// ── Token tune parser ("C4:200 E4:200 R:100") ──────────────────────────────
function parseMusicString(musicString) {
  var out = [];
  if (!musicString) return out;
  var tokens = String(musicString).trim().split(/\s+/);
  for (var i = 0; i < tokens.length; i++) {
    if (!tokens[i]) continue;
    var parts = tokens[i].split(':');
    var name = parts[0].trim();
    var dur = parts[1] ? parseInt(parts[1], 10) : 200;
    if (!isFinite(dur) || dur <= 0) dur = 200;
    var up = name.toUpperCase();
    if (up === 'R' || up === 'REST' || up === 'P') out.push({ type: 'rest', duration: dur });
    else out.push({ type: 'note', note: name, duration: dur });
  }
  return out;
}

function compileMusicString(musicString) {
  var tokens = parseMusicString(musicString);
  var events = [], t = 0;
  for (var i = 0; i < tokens.length; i++) {
    var tok = tokens[i];
    var d = tok.duration / 1000;
    if (tok.type === 'rest') {
      events.push({ time: t, freq: null, dur: d, gain: 1, name: null });
    } else {
      var f = frequencyOf(tok.note);
      if (f) events.push({ time: t, freq: f, dur: d, gain: 1, name: canonicalNoteName(tok.note) });
    }
    t += d;                                    // unknown notes still advance time
  }
  return { events: events, total: t };
}

// ── MML parser (GW-BASIC PLAY dialect) ─────────────────────────────────────
// T<32-255> tempo   L<1-64> length   O<0-8> octave   V<0-15> velocity
// N<0-127> MIDI note number          M N|L|S articulation   M B|F ignored
// A-G notes, #/+ sharp, - flat, . dotted, P/R rest, [CEG] chord
// Accidentals are only #/+/- (not 'b') so "DB" stays D-then-B, as before.
var FLAT_TO_SHARP = { D: 'C#', E: 'D#', G: 'F#', A: 'G#', B: 'A#' };

function compileMML(mml) {
  var events = [], t = 0;                      // t in ms, events in seconds
  var octave = DEFAULT_OCT, len = 4, tempo = 120, velocity = 15, art = 7 / 8;
  var str = String(mml === null || mml === undefined ? '' : mml).toUpperCase().replace(/\s+/g, '');
  var i = 0;

  function msPerWhole() { return (60000 / tempo) * 4; }

  function durationMs(length, dots) {
    var base = msPerWhole() / Math.max(1, length);
    var total = base, add = base;
    for (var k = 0; k < dots; k++) { add /= 2; total += add; }
    return total;
  }

  function readNumber() {
    var s = '';
    while (i < str.length && str[i] >= '0' && str[i] <= '9') s += str[i++];
    return s === '' ? null : parseInt(s, 10);
  }
  function readDots() { var n = 0; while (str[i] === '.') { i++; n++; } return n; }
  function readAccidental() {
    var c = str[i];
    if (c === '#' || c === '+') { i++; return '#'; }
    if (c === '-') { i++; return 'b'; }
    return '';
  }
  function spell(letter, acc, oct) {
    if (acc === 'b' && FLAT_TO_SHARP[letter]) return FLAT_TO_SHARP[letter] + oct;
    return letter + acc + oct;
  }
  function push(freq, name, ms, dots) {
    var step = durationMs(ms, dots);
    events.push({ time: t / 1000, freq: freq, dur: (step * art) / 1000, gain: velocity / 15, name: name });
    t += step;
  }
  function pushRest(ms, dots) {
    var step = durationMs(ms, dots);
    events.push({ time: t / 1000, freq: null, dur: step / 1000, gain: 1, name: null });
    t += step;
  }

  while (i < str.length) {
    var ch = str[i];

    if (ch === 'T') {
      i++; var n = readNumber();
      if (n !== null && n > 0 && n <= 255) tempo = n; else warn('bad tempo');
    } else if (ch === 'L') {
      i++; var n2 = readNumber();
      if (n2 === null) { /* leave as-is */ }
      else if (n2 === 0) len = 1;                       // L0 == whole note
      else if (n2 >= 1 && n2 <= 64) len = n2;
      else warn('bad length', n2);
    } else if (ch === 'O') {
      i++; var n3 = readNumber();
      if (n3 !== null && n3 >= 0 && n3 <= 8) octave = n3; else warn('bad octave', n3);
    } else if (ch === 'V') {
      i++; var n4 = readNumber();
      if (n4 !== null && n4 >= 0 && n4 <= 15) velocity = n4; else warn('bad velocity', n4);
    } else if (ch === 'M') {
      i++; var m = str[i];
      if (m === 'N') { art = 7 / 8; i++; }
      else if (m === 'L') { art = 1; i++; }
      else if (m === 'S') { art = 3 / 4; i++; }
      else if (m === 'B' || m === 'F') { i++; }         // background/foreground
      else warn('unknown M option');
    } else if (ch === 'N') {
      i++; var n5 = readNumber();
      if (n5 === null) { warn('N needs a number'); }
      else {
        var f = frequencyOfMidi(n5);
        push(f, canonicalNoteNumber(n5), len, readDots());
      }
    } else if (ch === 'P' || ch === 'R') {
      i++; var n6 = readNumber();
      pushRest(n6 === null ? len : n6, readDots());
    } else if (ch === '[') {
      i++;
      var names = [], oct = octave;
      while (i < str.length && str[i] !== ']') {
        var c2 = str[i];
        if (c2 >= 'A' && c2 <= 'G') {
          i++;
          var acc2 = readAccidental();
          var oct2 = oct;
          var dg = readNumber();                        // octave digits inside [ ]
          if (dg !== null) oct2 = dg;
          names.push(spell(c2, acc2, oct2));
        } else { i++; }
      }
      if (str[i] === ']') i++;
      var n7 = readNumber();
      var dots7 = readDots();
      var step7 = durationMs(n7 === null ? len : n7, dots7);
      for (var k = 0; k < names.length; k++) {
        var fk = frequencyOf(names[k]);
        if (fk) events.push({ time: t / 1000, freq: fk, dur: (step7 * art) / 1000, gain: velocity / 15, name: names[k] });
      }
      t += step7;
    } else if (ch >= 'A' && ch <= 'G') {
      i++;
      var acc3 = readAccidental();
      var oct3 = octave;
      var dg3 = readNumber();                           // optional inline octave
      if (dg3 !== null) oct3 = dg3;
      var name3 = spell(ch, acc3, oct3);
      var n8 = readNumber();
      var f8 = frequencyOf(name3);
      push(f8, name3, n8 === null ? len : n8, readDots());
    } else {
      i++; warn('skipping character', ch);
    }
  }
  return { events: events, total: t / 1000 };
}

function canonicalNoteNumber(midi) {
  var oct = Math.floor(midi / 12) - 1;
  var names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  return names[((midi % 12) + 12) % 12] + oct;
}

// Legacy view of the same compile pass: note / chord / rest tokens with
// millisecond durations (the sounded length, i.e. articulation applied).
function parseGWBasicString(mml) {
  var compiled = compileMML(mml);
  var out = [], bucket = null, lastTime = null;

  function flush() {
    if (!bucket) return;
    if (bucket.items.length === 1) {
      var ev = bucket.items[0];
      out.push(ev.freq
        ? { type: 'note', note: ev.name, duration: Math.round(ev.dur * 1000) }
        : { type: 'rest', duration: Math.round(ev.dur * 1000) });
    } else {
      out.push({
        type: 'chord',
        notes: bucket.items.map(function (e) { return e.name; }),
        duration: Math.round(bucket.items[0].dur * 1000)
      });
    }
    bucket = null;
  }

  for (var i = 0; i < compiled.events.length; i++) {
    var ev = compiled.events[i];
    if (ev.time !== lastTime) {
      flush();
      lastTime = ev.time;
      bucket = { items: [ev] };
    } else {
      bucket.items.push(ev);
    }
  }
  flush();
  return out;
}

// ── Public players ─────────────────────────────────────────────────────────
function beep(frequency, duration, volume) {
  var c = getCtx();
  if (!c) return false;
  var f = Number(frequency);
  if (!isFinite(f) || f <= 0) f = 800;
  var d = Number(duration);
  if (!isFinite(d) || d <= 0) d = 200;
  var v = (volume === undefined || volume === null) ? 1 : clamp01(volume);
  return voice(f, c.currentTime + 0.01, d / 1000, v);
}

function playNote(note, duration) {
  var f = frequencyOf(note);
  if (!f) return false;
  var d = Number(duration);
  if (!isFinite(d) || d <= 0) d = 200;
  var c = getCtx();
  if (!c) return false;
  return voice(f, c.currentTime + 0.01, d / 1000, 1);
}

function playTune(musicString, onComplete) {
  var c = compileMusicString(musicString);
  if (!c.events.length) return false;
  return startJob(c.events, c.total, { onComplete: onComplete });
}

function loopTune(musicString, onComplete) {
  var c = compileMusicString(musicString);
  if (!c.events.length) return false;
  return startJob(c.events, c.total, { loop: true, onComplete: onComplete });
}

function playNotes(mml, onComplete) {
  var c = compileMML(mml);
  if (!c.events.length) return false;
  return startJob(c.events, c.total, { onComplete: onComplete });
}

function loopNotes(mml, onComplete) {
  var c = compileMML(mml);
  if (!c.events.length) return false;
  return startJob(c.events, c.total, { loop: true, onComplete: onComplete });
}

function playMelody(notesArray, onComplete) {
  if (!notesArray || !notesArray.length) return false;
  var parts = [];
  for (var i = 0; i < notesArray.length; i++) {
    var n = notesArray[i];
    var name = (n && n[0]) || 'R';
    var dur = (n && n[1]) || 200;
    parts.push((String(name).toUpperCase() === 'R' ? 'R' : name) + ':' + dur);
  }
  return playTune(parts.join(' '), onComplete);
}

// Multi-track: ';' separates voices. All tracks share one timeline, so chords
// and counter-melodies line up instead of drifting apart.
function sidplay(mml, onComplete) {
  var tracks = String(mml === null || mml === undefined ? '' : mml).split(';');
  var all = [], total = 0, seq = 0;
  for (var i = 0; i < tracks.length; i++) {
    var c = compileMML(tracks[i]);
    for (var k = 0; k < c.events.length; k++) {
      var ev = c.events[k];
      all.push({ time: ev.time, freq: ev.freq, dur: ev.dur, gain: ev.gain, name: ev.name, seq: seq++ });
    }
    if (c.total > total) total = c.total;
  }
  if (!all.length) return false;
  all.sort(function (a, b) { return a.time - b.time || a.seq - b.seq; });
  return startJob(all, total, { onComplete: onComplete });
}

function stopTune() {
  if (job && job.handle) job.handle.playing = false;
  finishJob('stop');
}

// ── Volume ─────────────────────────────────────────────────────────────────
// The master gain carries the global volume, so changing it also affects notes
// that are already scheduled. Per-note gains (beep's third arg, V in MML) are
// relative to it.
function volume(level) {
  var prev = clamp01(global.BEEP_VOLUME);
  if (arguments.length === 0) return prev;
  global.BEEP_VOLUME = clamp01(level);
  if (master) master.gain.value = global.BEEP_VOLUME;
  return prev;
}

// Called by the Qandy shell on power-on, inside the unlocking gesture.
function sound_js() {
  var c = getCtx();
  if (c) resume();
  return c;
}

// ── Exports ────────────────────────────────────────────────────────────────
global.beep              = beep;
global.playNote          = playNote;
global.playTune          = playTune;
global.loopTune          = loopTune;
global.playNotes         = playNotes;
global.loopNotes         = loopNotes;
global.playMelody        = playMelody;
global.sidplay           = sidplay;
global.stopTune          = stopTune;
global.stopAll           = stopTune;
global.play              = playNotes;   // legacy aliases
global.gwplay            = playNotes;
global.parseMusicString  = parseMusicString;
global.parseGWBasicString = parseGWBasicString;
global.compileMML        = compileMML;  // new
global.frequencyOf       = frequencyOf; // new
global.volume            = volume;
global.sound_js          = sound_js;

// Single namespace, for new code: QandySound.play('O4 CDEFGAB')
global.QandySound = {
  beep: beep,
  note: playNote,
  tune: playTune,
  play: playNotes,
  loop: loopNotes,
  tracks: sidplay,
  stop: stopTune,
  volume: volume,
  frequencyOf: frequencyOf,
  compile: compileMML,
  init: sound_js
};

})(typeof window !== 'undefined' ? window : this);