RUN = "piano5.js";
try { if (typeof globalThis !== 'undefined') globalThis.RUN = RUN; else if (typeof window !== 'undefined') window.RUN = RUN; } catch (e) {}
print("Piano ready. Use keys A S D F G H J K L. ESC to exit.");
var __piano_pressed = Object.create(null);
var __piano_map = { a:261.63, s:293.66, d:329.63, f:349.23, g:392.00, h:440.00, j:493.88, k:523.25, l:587.33 };
function __hasSound() { return !!(typeof startNote === 'function' || typeof playNote === 'function' || typeof beep === 'function'); }
try { print("sound: " + (__hasSound() ? "available" : "none") + "\n"); } catch (e) {}
function __normalizeKey(k, keyData) {
  try {
    if (k && typeof k === 'object' && k.key) return String(k.key).toLowerCase();
    if (typeof k === 'string') return k.length === 1 ? k.toLowerCase() : k.toLowerCase();
    if (typeof k === 'number') {
      if (keyData && keyData.originalEvent && typeof keyData.originalEvent.key === 'string') return String(keyData.originalEvent.key).toLowerCase();
      try { return String.fromCharCode(k).toLowerCase(); } catch (e) { return String(k); }
    }
    if (keyData && keyData.key) return String(keyData.key).toLowerCase();
  } catch (e) {}
  return String(k || '').toLowerCase();
}
function __piano_start(freq) {
  try {
    if (typeof startNote === 'function') return startNote(freq);
    if (typeof playNote === 'function') { playNote(freq, 0.5); return null; }
    if (typeof beep === 'function') { beep(freq, 300, 0.05); return null; }
  } catch (e) {}
  return null;
}
function __piano_stop(idOrFreq) {
  try {
    if (typeof stopNote === 'function') return stopNote(idOrFreq);
  } catch (e) {}
  return;
}
function keydown(key, keyData) {
  try {
    var k = __normalizeKey(key, keyData);
    if (!k) return false;
    if (k === 'esc' || k === 'escape') {
      try { if (typeof exit === 'function') exit(); else if (typeof window.__qandy_program_cleanup === 'function') window.__qandy_program_cleanup('esc'); else RUN = "qandy.js"; } catch (e) {}
      return true;
    }
    if (__piano_pressed[k]) return true;
    var freq = __piano_map[k];
    if (!freq) return false;
    var id = __piano_start(freq);
    __piano_pressed[k] = id || freq;
    return true;
  } catch (e) { return false; }
}
function keyup(key, keyData) {
  try {
    var k = __normalizeKey(key, keyData);
    if (!k) return false;
    var idOrFreq = __piano_pressed[k];
    if (!idOrFreq) return false;
    __piano_stop(idOrFreq);
    try { delete __piano_pressed[k]; } catch (e) { __piano_pressed[k] = null; }
    return true;
  } catch (e) { return false; }
}
window.__qandy_program_cleanup = function(reason) {
  try {
    for (var p in __piano_pressed) {
      try { if (__piano_pressed[p]) __piano_stop(__piano_pressed[p]); } catch (e) {}
    }
  } catch (e) {}
  try { delete window.keydown; } catch (e) {}
  try { delete window.keyup; } catch (e) {}
  try { delete window.__qandy_program_cleanup; } catch (e) {}
  try { RUN = "qandy.js"; } catch (e) {}
  try { if (typeof document !== 'undefined') document.getElementById("run").innerHTML = "qandy.js"; } catch (e) {}
  print("piano5: cleaned up\n");
};
try { if (typeof window !== 'undefined') { window.keydown = keydown; window.keyup = keyup; } else { this.keydown = keydown; this.keyup = keyup; } } catch (e) {}
try { if (typeof qandySignalReady === 'function') qandySignalReady(RUN); } catch (e) {}