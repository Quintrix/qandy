
RUN="qandy.js";

function button(b, event) {
  pokeCursorOff();
  if (event && typeof event.shiftKey !== 'undefined') shift = !!event.shiftKey;
  var k = "", l = "";
  if (b===32) { event.preventDefault(); }
  switch (b) {
    case 16: // SHIFT
      if (event && typeof event.shiftKey !== 'undefined') shift = !!event.shiftKey;
      else shift = !shift;
      if ((alt || altPhysical) && typeof updateKeyLabels === 'function') updateKeyLabels();
      pokeCursorOn();
      return;
    case 17: k = "ctrl"; break;
    case 18: k = "alt"; break;
    case 20: k = "caps"; break;
    case 27: k = "esc"; break;
    case 13: k = "enter"; break;
    case 8:  k = "back"; break;
    case 45: k = "insert"; break;
    case 46: k = "delete"; break;
    case 37: k = "left"; break;
    case 38: k = "up"; break;
    case 39: k = "right"; break;
    case 40: k = "down"; break;
    case 36: k = "home"; break;
    case 35: k = "end"; break;
    default:
      // fallthrough to printable handling
  }

  // Letters A-Z (respect shift xor caps)
  if (!k && b >= 65 && b <= 90) {
    var base = String.fromCharCode(b);
    var capsOn = !!caps;
    var shiftOn = !!shift;
    var makeUpper = (shiftOn && !capsOn) || (!shiftOn && capsOn);
    l = makeUpper ? base.toUpperCase() : base.toLowerCase();
    k = l;
  }

  var keyMap = {
    // Top-row digits (main keyboard)
    48: ['0', ')'], 49: ['1', '!'], 50: ['2', '@'], 51: ['3', '#'],
    52: ['4', '$'], 53: ['5', '%'], 54: ['6', '^'], 55: ['7', '&'],
    56: ['8', '*'], 57: ['9', '('],
 
    // Numpad digits (NumLock on) - map to same characters
    96: ['0', ')'], 97: ['1', '!'], 98: ['2', '@'], 99: ['3', '#'],
    100: ['4', '$'], 101: ['5', '%'], 102: ['6', '^'], 103: ['7', '&'],
    104: ['8', '*'], 105: ['9', '('],

    // Punctuation / OEM keys
    186: [';', ':'], 59: [';', ':'],        // semicolon (59 on some browsers)
    187: ['=', '+'], 61: ['=', '+'],        // equals (61 in some browsers / layouts)
    188: [',', '<'],
    189: ['-', '_'], 173: ['-', '_'],       // 173 old Firefox hint for minus
    190: ['.', '>'],
    191: ['/', '?'],
    192: ['`', '~'],

    219: ['[', '{'],
    220: ['\\', '|'],
    221: [']', '}'],
    222: ["'", '"'],

    // Numpad operators / fallbacks
    106: ['*', '*'],  // Numpad *
    107: ['+', '+'],  // Numpad +
    109: ['-', '_'],  // Numpad -

    // Numpad decimal
    110: ['.', '>'],

    // Numpad divide (some keyboards report 111)
    111: ['/', '?'],

    // Space
    32: [' ', ' ']
  };

  if (!k && keyMap[b]) { l = shift ? keyMap[b][1] : keyMap[b][0]; k = l; }

  // Ignore raw control codes (<32) that aren't already mapped
  if (!k && b < 32) { pokeCursorOn(); return; }

  // Modifier key toggles (virtual keyboard)
  if (k === "ctrl") {
    ctrl = !ctrl;
    var el = document.getElementById("ctrl");
    if (el) { el.style.backgroundColor = ctrl ? "#fff" : "#222"; el.style.color = ctrl ? "#000" : "#fff"; }
    pokeCursorOn(); return;
  }
  if (k === "alt") {
    alt = !alt;
    var el2 = document.getElementById("alt");
    if (el2) { el2.style.backgroundColor = alt ? "#fff" : "#222"; el2.style.color = alt ? "#000" : "#fff"; }
    updateKeyLabels();
    pokeCursorOn(); return;
  }
  if (k === "caps") {
    caps = !caps;
    var capsEl = document.getElementById("kcaps") || document.getElementById("caps");
    if (capsEl) {
      if (caps) { capsEl.style.backgroundColor = "#fff"; capsEl.style.color = "#000"; }
      else { capsEl.style.backgroundColor = "#222"; capsEl.style.color = "#fff"; }
    }
    updateKeyLabels();
    pokeCursorOn(); return;
  }

  if (keyboard) {
    // If program is running and has keydown, send it there first
    if (RUN && typeof keydown !== 'undefined') {
      try { keydown(k || l); } catch (e) {
        print("ERROR: keydown();\n\n");
      }
    } else {
      if (k === "back") {
        event.preventDefault();
        if (window.QandyKeyboard && QandyKeyboard.handleBackspace()) {
          // consumed (masked mode)
          pokeCursorOn(CURSOR); // or pokeCursorOn() depending on signature
          return;
        }
        if (SSTART !== -1 && SEND !== -1) {
          if (SSTART>SEND) { [SSTART, SEND] = [SEND, SSTART];}
          deleteSelection();
          pokeInput();
        } else if (CURP > 0) {
          LINE = LINE.substring(0, CURP - 1) + LINE.substring(CURP);
          CURP--;
          pokeCell(CURX, CURY, " ");
          pokeInput();
        }
        pokeCursorOn(CURSOR);
        //if (SSTART !== -1 && SEND !== -1) deleteSelection();
      } else if (k === "insert") {
          navigator.clipboard.readText().then(function(text) {
          if (text) {
            if (SSTART !== -1 && SEND !== -1) deleteSelection();
              if (SSTART>-1) { pokeSelect(false); SSTART = -1; SEND = -1; }
              LINE = (LINE || "").substring(0, CURP) + text + (LINE || "").substring(CURP);
              CURP += text.length;
              pokeInput();
            }
          }).catch(function(){});
          pokeCursorOn();
          return;
    	  } else if (k === "delete") {
          event.preventDefault();
          var str = String(LINE || "");
          var maxLen = str.length;
          var s = Math.max(0, Math.min(SSTART, SEND));
          var e = Math.max(0, Math.min(Math.max(SSTART, SEND), maxLen));
          if (s < e) {
            // copy to clipboard only when shift-requested and available
            if (shift && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
              navigator.clipboard.writeText(str.substring(s, e)).catch(function(err){
                console.warn('clipboard write failed', err);
              });
            }
          }
          pokeSelect(false);
          LINE = str.substring(0, s) + str.substring(e);
          CURP = s;
          SSTART = -1;
          SEND = -1;
          pokeInput();
        } else if (k === "left") {
          event.preventDefault();
          if (CURP > 0) {
            if (shift) {
              if (SSTART === -1) SSTART = CURP;   // anchor at the starting cursor pos
              CURP = Math.max(0, CURP - 1);
              SEND = CURP;
              // update visual cursor coordinates (wrap-aware)
              var absCol = LINEX + CURP;
              CURY = LINEY + Math.floor(absCol / W);
              CURX = absCol % W;
              pokeSelect(true);
            } else {
              // non-shift behavior clears selection
              if (SSTART > -1) { pokeSelect(false); SSTART = -1; SEND = -1; }
              CURP = Math.max(0, CURP - 1);
              var absCol = LINEX + CURP;
              CURY = LINEY + Math.floor(absCol / W);
              CURX = absCol % W;
            }
          }
        } else if (k === "right") {
          event.preventDefault();
          if (CURP < LINE.length) {
            if (shift) {
              if (SSTART === -1) SSTART = CURP;
              CURP = Math.min(LINE.length, CURP + 1);
              SEND = CURP;
              var absCol = LINEX + CURP;
              CURY = LINEY + Math.floor(absCol / W);
              CURX = absCol % W;
              pokeSelect(true);
            } else {
              if (SSTART>-1) { pokeSelect(false); SSTART = -1; SEND = -1; }
              CURP = Math.min(LINE.length, CURP + 1);
              var absCol = LINEX + CURP;
              CURY = LINEY + Math.floor(absCol / W);
              CURX = absCol % W;
            }
          }
        } else if (k === "home") {
          event.preventDefault();
          if (shift) {
            if (SSTART === -1) SSTART = CURP; // anchor
            SEND = 0;
            CURP = 0;
            var absCol = LINEX + CURP;
            CURY = LINEY + Math.floor(absCol / W);
            CURX = absCol % W;
            pokeSelect(true);
          } else {
            // non-shift home: clear selection and move cursor to start
            if (SSTART > -1) { pokeSelect(false); SSTART = -1; SEND = -1; }
            CURP = 0;
            var absCol = LINEX + CURP;
            CURY = LINEY + Math.floor(absCol / W);
            CURX = absCol % W;
          }        
        } else if (k === "end") {
          event.preventDefault();
          if (shift) {
            if (SSTART === -1) SSTART = CURP;
            SEND = LINE.length;
            CURP = LINE.length;
            var absCol = LINEX + CURP;
            CURY = LINEY + Math.floor(absCol / W);
            CURX = absCol % W;
            pokeSelect(true);
          } else {
            if (SSTART > -1) { pokeSelect(false); SSTART = -1; SEND = -1; }
            CURP = LINE.length;
            var absCol = LINEX + CURP;
            CURY = LINEY + Math.floor(absCol / W);
            CURX = absCol % W;
          }        
        } else if (k === "up") {
          event.preventDefault();
          if (commandHistory && commandHistory.length > 0) {
            // On first history navigation, save current typing to restore later
            if (historyIndex === -1) {
              tempCommand = LINE || "";
              historyIndex = commandHistory.length;
            }
            // Move back through history if possible
            if (historyIndex > 0) {
              historyIndex--;
              LINE = commandHistory[historyIndex] || "";
            } else {
              LINE = commandHistory[0] || "";
            }
            CURP = LINE.length;
            var absCol = LINEX + CURP;
            CURY = LINEY + Math.floor(absCol / W);
            CURX = absCol % W;
            pokeInput();
          }
        } else if (k === "down") {
          event.preventDefault();
          if (historyIndex !== -1) {
            if (historyIndex < commandHistory.length - 1) {
              historyIndex++;
              LINE = commandHistory[historyIndex] || "";
            } else {
              // Past the newest history entry: restore the saved current edit
              historyIndex = -1;
              LINE = tempCommand || "";
            }
            // Put cursor at end of the current LINE
            CURP = LINE.length;
            var absCol2 = LINEX + CURP;
            CURY = LINEY + Math.floor(absCol2 / W);
            CURX = absCol2 % W;
            pokeInput();
          }
        } else if (k === "enter") {
          event.preventDefault();
          if (window.QandyKeyboard && QandyKeyboard.handleEnter()) { return; }
          if (SSTART>-1) { pokeSelect(false); SSTART = -1; SEND = -1; }
          if (LINE !== undefined) {
            // Save to history
            if (typeof commandHistory !== 'undefined' && LINE.trim().length > 0) {
              if (commandHistory.length === 0 || commandHistory[commandHistory.length - 1] !== LINE) {
                commandHistory.push(LINE);
                if (typeof maxHistorySize !== 'undefined' && commandHistory.length > maxHistorySize) {
                  commandHistory.shift();
                }
              }
            }
            historyIndex = -1;
            tempCommand = "";
            cmd=LINE; LINE = ""; CURP = 0; LINEX = CURX; LINEY = CURY;
            pokeRefresh()
            command(cmd);
            return; 
          }
        } else if (l) {
          // Insert printable character(s)
          var finalChar = l;
          var hasCtrl = !!ctrl;
          var hasAlt = !!alt;
          var hasAltFlag = !!((typeof alt !== 'undefined' && alt) || (typeof altPhysical !== 'undefined' && altPhysical) || (event && !!event.altKey))
          var hasCtrl = !!ctrl;
          var hasCtrlFlag = !!((typeof ctrl !== 'undefined' && ctrl) || (typeof ctrlPhysical !== 'undefined' && ctrlPhysical) || (event && !!event.ctrlKey));
          var hasAltShift = hasAltFlag && !!shift;

          if (hasAltFlag || hasAlt) {
            var baseLower = (typeof l === 'string' && l.length > 0) ? l.toLowerCase() : '';
            if (hasAltShift && altShiftKeys.hasOwnProperty(baseLower)) {
              finalChar = altShiftKeys[baseLower];
            } else if (altKeys.hasOwnProperty(baseLower)) {
              finalChar = altKeys[baseLower];
            }
          }
          if (hasCtrl) {
            ctrl = 0;
            var cel = document.getElementById("ctrl");
            if (cel) { cel.style.backgroundColor = "#222"; cel.style.color = "#fff"; }
            var lc = finalChar.toLowerCase();
            // Ctrl+C: copy selection or whole line
            if (lc === 'c') {
              var copyText = "";
              if (SSTART !== -1 && SEND !== -1) {
                var cs = Math.min(SSTART, SEND);
                var ce = Math.max(SSTART, SEND);
                copyText = LINE.substring(cs, ce);
              } else {
                copyText = LINE;
              }
              if (copyText.length > 0) {
                navigator.clipboard.writeText(copyText).catch(function(){});
              }
              pokeCursorOn()
              return;
            }

            // Ctrl+V: paste from clipboard
            if (lc === 'v') {
              navigator.clipboard.readText().then(function(text) {
                if (text) {
                  if (SSTART !== -1 && SEND !== -1) deleteSelection();
                  if (SSTART>-1) { pokeSelect(false); SSTART = -1; SEND = -1; }
                  LINE = (LINE || "").substring(0, CURP) + text + (LINE || "").substring(CURP);
                  CURP += text.length;
                  pokeInput();
                }
              }).catch(function(){});
              pokeCursorOn()
              return;
            }
            // Ctrl+A: select all input
            if (lc === 'a') {
              if (LINE.length > 0) {
                SSTART = 0; SEND = LINE.length;
                pokeSelect(true);
              }
              pokeCursorOn()
              return;
            }
            pokeCursorOn()
            return;
          }

          // Typing clears any active selection (replacing selected text)
          if (SSTART !== -1 && SEND !== -1) {
            //
            // @@ this routine must be rewritten to use new variable set
            //
            // deleteSelection();
            //
          }
          if (SSTART>-1) { pokeSelect(false); SSTART = -1; SEND = -1; }
          // Insert character into line at CURP (cursor position)
          // insert mode, need overwrite mode

          //if (window.QandyKeyboard && QandyKeyboard.handleTypedChar(char)) {
          //  // consumed (e.g., masked input) — do nothing else
          //} else {
            LINE = (LINE || "").substring(0, CURP) + finalChar + (LINE || "").substring(CURP);
            CURP += finalChar.length;
            CURX += finalChar.length;
            while (CURX >= W) { CURX -= W; CURY++; if (CURY >= H) { CURY = H - 1; } }
            pokeInput();
            if (typeof historyIndex !== 'undefined' && historyIndex !== -1) { historyIndex = -1; tempCommand = ""; }
          //}          
        }
    } // end else (not run+keydown)
  } else {
    if (RUN) { keydown(k || l); }
  }
  if (SOUND) { beep(900, 25, .01); }
  pokeCursorOn();
}

document.addEventListener('keydown', function (event) {
 if (event.keycode === 32) { event.preventDefault(); }
 press(event);
});


document.addEventListener('keyup', function (event) { pressup(event); });
document.addEventListener('paste', function (event) {
 if (keyon) {
  event.preventDefault();
  var pastedText;
  if (event.clipboardData && event.clipboardData.getData) {
   pastedText = event.clipboardData.getData('text/plain');
  } else if (clipboardData && clipboardData.getData) {
   pastedText = clipboardData.getData('Text');
  }
  if (pastedText) {
   if (SSTART>-1) { pokeSelect(false); SSTART = -1; SEND = -1; }
   LINE = (LINE || "").substring(0, CURP) + pastedText + (LINE || "").substring(CURP);
   CURP += pastedText.length;
   pokeInput();
  }
 }
});

function press(event) { 
 key=""; k=event.keyCode; shift=event.shiftKey;

 // Handle physical CapsLock keypress (keyCode 20)
 if (event.keyCode === 20) {
   // Determine the platform state if available
   var platformState = (typeof event.getModifierState === 'function') ? !!event.getModifierState('CapsLock') : null;

   // Compute the new desired caps state:
   // - If platformState is available, use it.
   // - But some browsers report the previous state on keydown; if platformState equals current caps,
   //   assume the toggle has not yet been applied and flip it.
   var newCaps;
   if (platformState === null) {
     newCaps = !caps; // no platform info -> just toggle
   } else {
     newCaps = platformState;
     if (platformState === caps) {
       // likely timing issue -> flip to reflect the user action
       newCaps = !caps;
     }
   }

   caps = !!newCaps;
   l = document.getElementById("kcaps") || document.getElementById("caps");
   if (l) {
     if (caps) { l.style.backgroundColor = "#fff"; l.style.color = "#000"; }
     else { l.style.backgroundColor = "#222"; l.style.color = "#fff"; }
   }

   // Cancel any transient flash timeout for the CAPS element so it won't reapply a flash style
   try {
     if (keyTimeouts && keyTimeouts['caps']) { clearTimeout(keyTimeouts['caps']); delete keyTimeouts['caps']; }
     // Also clear any stored flash marker on the element
     if (l) l.dataset._flash = '';
   } catch (e) { /* ignore */ }

   // Ensure label updates
   if (typeof updateKeyLabels === 'function') updateKeyLabels();

   // If we just turned it off, explicitly unhighlight the element (clear inline styles)
   if (!caps) {
     unhighlightKey('caps');
   } else {
     // Ensure locked appearance
     if (l) { l.style.backgroundColor = "#fff"; l.style.color = "#000"; }
   }

  // Prevent default browser handling side-effects and stop further processing for this key event
  event.preventDefault && event.preventDefault();
  return;
}

  if (event.ctrlKey && (event.key === 'v' || event.key === 'V')) {
    // Let the browser fire the native paste event (handled by the paste listener)
    return;
  }

 if (event.keyCode === 18 || event.altKey) { event.preventDefault(); }
 if (event.keyCode === 27) { event.preventDefault(); }
 if (event.keyCode === 16) {
  var capsBtn = document.getElementById("caps");
  if (capsBtn) { capsBtn.style.backgroundColor = "#444"; capsBtn.style.color = "#fff"; }
  updateKeyLabels();
 }
 if (event.keyCode === 17 && !ctrl) {
  ctrl=1; ctrlPhysical=true;
  document.getElementById("ctrl").style.backgroundColor = "#0a0";
  document.getElementById("ctrl").style.color = "#000";
  return;
 }
 if (event.keyCode === 18 && !alt) {
  highlightKey(k);
  alt = 1; altPhysical = true;
  document.getElementById("alt").style.backgroundColor = "#0a0";
  document.getElementById("alt").style.color = "#000";
  updateKeyLabels();
 }
 // For Ctrl+key combos, pass specific ones through to button() (Ctrl+C, Ctrl+A)
 // Ctrl+V is handled via the native paste event listener instead
 if (event.ctrlKey) {
  var ctrlKey = event.key ? event.key.toLowerCase() : '';
  if (ctrlKey === 'c' || ctrlKey === 'a') {
   event.preventDefault();
   highlightKey(k);
   button(k, event);
  }
  // All other ctrl combos: let browser handle
  return;
 }
 highlightKey(k);
 button(k, event);
}

function pressup(event) {
  // Prevent browser from handling ALT key - must be done before any conditionals
  if (event.keyCode === 18 || event.altKey) {
    event.preventDefault(); // Prevent browser menu from opening
  }
 
  // Handle physical CTRL key release (unhighlight)
  if (event.keyCode === 17 && ctrlPhysical) {
    ctrl = 0;
    ctrlPhysical = false;
    document.getElementById("ctrl").style.backgroundColor = "#222";
    document.getElementById("ctrl").style.color = "#fff";
    return;
  }

  // Handle physical SHIFT key release (unhighlight CAPS unless caps mode is active)
  if (event.keyCode === 16) {
    shift = 0;
    if (typeof updateKeyLabels === 'function') updateKeyLabels();
    if (!caps) { unhighlightKey('caps'); }
    return;
  }

  // Handle physical ALT key release (unhighlight)
  if (event.keyCode === 18 && altPhysical) {
    alt = 0;
    altPhysical = false;
    document.getElementById("alt").style.backgroundColor = "#222";
    document.getElementById("alt").style.color = "#fff";
    updateKeyLabels();
    return;
  }
 
  // Route keyup to active script if run is set
  if (RUN && typeof keyup !== 'undefined') {
    var k = String.fromCharCode(event.keyCode);
    keyup(k);
  }
}

function hostScript(name) {
  if (!name || typeof name !== 'string') return false;
  const s = name.trim();
  name = name.trim();
  if (!/^[A-Za-z0-9.\-]+\.js$/i.test(name)) return false;
  if (/^[.\-]/.test(name) || /[.\-]$/.test(name)) return false;
  if (/\.\./.test(name)) return false;
  if (name.length > 16) return false;
  try {
    const prg = document.createElement('script');
    prg.src = s;
    prg.onerror = function() { print("File Error\n"); };
    prg.onload = function() { /* optional: print(s + " loaded\n"); */ };
    document.head.appendChild(prg);
  } catch (e) {
    print("Error inserting script: " + String(e) + "\n");
  }
}

function showFiles() {
  print("ascii.js\n");
  print("sound.js\n");
  print("piano.js\n");
  print("demo.js\n");
  print("q.js\n");
  print("world.js\n");
  print("\n");
  
  // List files from localStorage
  var userFiles = [];
  for (var i = 0; i < localStorage.length; i++) {
    var key = localStorage.key(i);
    if (key.startsWith("qandy_file_")) {
      userFiles.push(key.substring(11)); // Remove "qandy_file_" prefix
    }
  }
  
  if (userFiles.length > 0) {
    print("\x1b[1;32mUSER FILES:\x1b[0m\n");
    for (var j = 0; j < userFiles.length; j++) {
      print(userFiles[j] + "\n");
    }
    print("\n");
  }
}

function waitForCursorIdle(timeoutMs) {
  timeoutMs = typeof timeoutMs === 'number' ? timeoutMs : 5000;
  return new Promise(function(resolve) {
    if (!window._pokeCursor_state) return resolve();
    var start = Date.now();
    var iv = setInterval(function() {
      if (!window._pokeCursor_state) {
        clearInterval(iv);
        return resolve();
      }
      if (Date.now() - start > timeoutMs) {
        clearInterval(iv);
        return resolve();
      }
    }, 8);
  });
}

window.GUEST = false;
async function determineGuestMode() {
  try {
    if (typeof isGuest === 'function') {
      window.GUEST = !!(await Promise.resolve(isGuest()));
    } else {
      var assembled = !!window._QANDY_ASSEMBLED;
      var inIframe = false;
      try { inIframe = !!(window.top && window.top !== window); } catch (e) { inIframe = false; }
      window.GUEST = !!(assembled || inIframe);
    }
  } catch (err) {
    console.warn('determineGuestMode: check failed; defaulting to guest', err);
    window.GUEST = true;
  }

  // optional: make it read-only so other scripts can't accidentally overwrite it
  try {
    Object.defineProperty(window, 'GUEST', { value: window.GUEST, writable: false, configurable: false });
  } catch (e) { /* ignore in restrictive environments */ }

  // notify anyone waiting
  window.dispatchEvent(new CustomEvent('qandyModeDetermined', { detail: { guest: window.GUEST } }));

  return window.GUEST;
}


window._qandy_print_queue = window._qandy_print_queue || { items: [], running: false };

async function _processPrintQueue() {
  var q = window._qandy_print_queue;
  if (q.running) return;
  q.running = true;
  try {
    while (q.items.length) {
      var job = q.items.shift();
      // wait for any current paced output to finish
      await waitForCursorIdle();
      // invoke pokeCursor to print this job.text
      try {
        pokeCursor(job.text);
      } catch (e) {
        // If pokeCursor thrown, still resolve so callers don't hang
      }
      // wait for this pokeCursor output to finish
      await waitForCursorIdle();
      // resolve the enqueue promise if present
      try { job.resolve(); } catch (e) {}
    }
  } finally {
    q.running = false;
  }
}

function exit() {
  // guest scripts use this to exit back to qandy.js
  RUN="qandy.js"
}

function clearScreen() { cls(); }
function cls() {
  pokeCursorOff();
  pokeText(0,0," ",800);
  CURX=0; CURY=0; LINEX=0; LINEY=0;
  pokeCursorOn();  
}

// public print(...) replacement
function print(t) {
  // do your color tag replacements first
  var text = String(t == null ? "" : t);
  text = text.replace(/\[blue\]/g, ANSIblue);
  text = text.replace(/\[black\]/g, ANSIblack);
  text = text.replace(/\[red\]/g, ANSIred);
  text = text.replace(/\[green\]/g, ANSIgreen);
  text = text.replace(/\[yellow\]/g, ANSIyellow);
  text = text.replace(/\[magenta\]/g, ANSImagenta);
  text = text.replace(/\[cyan\]/g, ANSIcyan);
  text = text.replace(/\[white\]/g, ANSIwhite);
  
  // enqueue the print and start processor
  var q = window._qandy_print_queue;
  return new Promise(function(resolve) {
    q.items.push({ text: text, resolve: resolve });
    // kick the processor (it is safe if already running)
    _processPrintQueue();
  });
}


CURBAUD=9600; CURSOR=4; pokeCursorOn();

pokeRefresh();

//
// system ready
//

if (GUEST) {
  print("\n[cyan]Qandy Pocket\nComputer v1.j\n\n[yellow]Prototype Release\nUse at your own risk!\n[white]\n");
  //(async function(){
  //  if (await dosExists('autoexec.js')) {
  //    const txt = await dosLoad('autoexec.js');
  //    if (txt !== null) hostScript(txt);    
  //  }
  //})();
  // guest system ready 
} else {
  // host system ready
  print("\nQandy Root:");
}










//mySearch=location.search.substr(1).split("&")
//for (i=0;i<mySearch.length;i++) {
// nameVal=mySearch[i].split("=");
// for (j in nameVal) { nameVal[j]=unescape(nameVal[j]); } 
// if (nameVal[0]=="run") {
//  script=document.createElement('script');
//  script.src=nameVal[1];
//  document.head.appendChild(script);
//  SFiles=0;
// }
//}

// if (SFiles) { showFiles(); }
// Signal that qandy.js is ready

if (typeof qandySignalReady === 'function') {
  qandySignalReady('Qandy Core');
}
