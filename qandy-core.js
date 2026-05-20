//
// ──── Qandy Core ─────────────────────────────────────────────────────────────────────
//

function qandy_js() {
  RUN="qandy.js"; 

  window.button=function(b, event) {
    pokeCursorOff(); 
    var virtualclick=!!(event && event.source === 'virtual'); 
    if (event && typeof event.shiftKey !== 'undefined') shift = !!event.shiftKey;
    var k = "", l = "";
    if (b===32 && event) { if (!virtualclick) { event.preventDefault(); }}

  // Fast-path: if a user script (not qandy.js) is running and defines keydown(),
  // deliver the event directly to that function for lowest latency.
  // BUT: if input() is waiting for line input, fall through to button() instead.
  if (typeof RUN !== 'undefined' && RUN !== "qandy.js" && typeof keydown === 'function') {
    var _pendingInput = window.QandyKeyboard ? QandyKeyboard._pendingState() : null;
    if (!_pendingInput) {
      var kdEvent = event || {};
      // populate minimal useful fields without allocating new objects where possible
      if (!kdEvent.key) {
        try { kdEvent.key = k || l || String.fromCharCode(b || 0); } catch (e) { kdEvent.key = ''; }
      }
      // Ensure modifier fields reflect current host flags if event didn't have them
      kdEvent.shiftKey = !!(kdEvent.shiftKey || shift);
      kdEvent.ctrlKey  = !!(kdEvent.ctrlKey  || ctrl);
      kdEvent.altKey   = !!(kdEvent.altKey   || alt);
      kdEvent.source = kdEvent.source || 'physical';
      try {
        keydown(b, kdEvent);
      } catch (err) {
        console.error("script keydown() threw:", err);
      }
      pokeCursorOn();
      return;
    }
    // input() is pending - fall through to normal line input processing below
  }

  // MAP special keys first
  switch (b) {
    case 16: // SHIFT
      if (event && typeof event.shiftKey !== 'undefined') shift = !!event.shiftKey;
      else shift = !shift;
      if (typeof updateKeyLabels === 'function') updateKeyLabels();
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

  if (!k && keyMap[b]) { l = (shift || caps) ? keyMap[b][1] : keyMap[b][0]; k = l; }
  if (!k && b < 32) { pokeCursorOn(); return; }

alert("here");

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

  // Host editing / navigation / input handling
  if (k === "back") {
    if (!virtualclick) { event && event.preventDefault(); }
    if (window.QandyKeyboard) {
      var _bp = QandyKeyboard._pendingState();
      if (_bp && !_bp.echo) {
        if (_bp.buffer && _bp.buffer.length > 0) {
          _bp.buffer = _bp.buffer.slice(0, -1);
        }
        pokeCursorOn(); return;
      }
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
    pokeCursorOn();
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
    if (!virtualclick) { event && event.preventDefault(); }
    var str = String(LINE || "");
    // If text is selected, delete the selection
    if (SSTART >= 0 && SEND >= 0) {
      var s = Math.max(0, Math.min(SSTART, SEND));
      var e = Math.max(0, Math.min(Math.max(SSTART, SEND), str.length));
      if (s < e) {
        // copy to clipboard if shift-held and available
        if (shift && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
          navigator.clipboard.writeText(str.substring(s, e)).catch(function(err){
            console.warn('clipboard write failed', err);
          });
        }
        // Delete selection
        LINE = str.substring(0, s) + str.substring(e);
        CURP = s;
        SSTART = -1;
        SEND = -1;
      }
    } else {
      // No selection: delete character at cursor position
      if (CURP < str.length) {
        LINE = str.substring(0, CURP) + str.substring(CURP + 1);
        // CURP stays the same (cursor doesn't move)
      }
      // If CURP is at end of line, delete does nothing (correct behavior)
    }
    pokeInput();
  } else if (k === "left") {
    if (!virtualclick) { event && event.preventDefault(); }
    if (CURP > 0) {
      if (shift) {
        if (SSTART === -1) SSTART = CURP;   // anchor at the starting cursor pos
        CURP = Math.max(0, CURP - 1);
        SEND = CURP;
        var absCol = LINEX + CURP;
        CURY = LINEY + Math.floor(absCol / W);
        CURX = absCol % W;
        pokeSelect(true);
      } else {
        if (SSTART > -1) { pokeSelect(false); SSTART = -1; SEND = -1; }
        CURP = Math.max(0, CURP - 1);
        var absCol = LINEX + CURP;
        CURY = LINEY + Math.floor(absCol / W);
        CURX = absCol % W;
      }
    }
  } else if (k === "right") {
    if (!virtualclick) { event && event.preventDefault(); }
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
    if (!virtualclick) { event && event.preventDefault(); }
    if (shift) {
      if (SSTART === -1) SSTART = CURP; // anchor
      SEND = 0;
      CURP = 0;
      var absCol = LINEX + CURP;
      CURY = LINEY + Math.floor(absCol / W);
      CURX = absCol % W;
      pokeSelect(true);
    } else {
      if (SSTART > -1) { pokeSelect(false); SSTART = -1; SEND = -1; }
      CURP = 0;
      var absCol = LINEX + CURP;
      CURY = LINEY + Math.floor(absCol / W);
      CURX = absCol % W;
    }
  } else if (k === "end") {
    if (!virtualclick) { event && event.preventDefault(); }
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
    if (!virtualclick) { event && event.preventDefault(); }
    if (commandHistory && commandHistory.length > 0) {
      if (historyIndex === -1) {
        tempCommand = LINE || "";
        historyIndex = commandHistory.length;
      }
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
    if (!virtualclick) { event && event.preventDefault(); }
    if (historyIndex !== -1) {
      if (historyIndex < commandHistory.length - 1) {
        historyIndex++;
        LINE = commandHistory[historyIndex] || "";
      } else {
        historyIndex = -1;
        LINE = tempCommand || "";
      }
      CURP = LINE.length;
      var absCol2 = LINEX + CURP;
      CURY = LINEY + Math.floor(absCol2 / W);
      CURX = absCol2 % W;
      pokeInput();
    }
  } else if (k === "enter") {
    if (!virtualclick) { event && event.preventDefault(); }
    if (SSTART>-1) { pokeSelect(false); SSTART = -1; SEND = -1; }
    if (LINE !== undefined) {
      // Check if there's a pending input() awaiting a response
      if (window.QandyKeyboard) {
        var _ep = QandyKeyboard._pendingState();
        if (_ep) {
          var _val = !_ep.echo ? (_ep.buffer || "") : (LINE || "");
          try { lastin = ""; } catch(e) {}
          CURX = 0;
          CURY = (typeof CURY === 'number' && typeof H === 'number') ? Math.min(H - 1, CURY + 1) : ((typeof CURY === 'number') ? CURY + 1 : 0);
          LINEX = CURX;
          LINEY = CURY;
          LINE = "";
          CURP = 0;
          QandyKeyboard.acceptPending(_val);
          pokeCursorOn();
          return;
        }
      }
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
      cmd=LINE; LINE=""; CURP=0; LINEX=CURX; LINEY=CURY; if (CURMORE>-1) { CURMORE=0; }
      command(cmd);
      pokeCursorOn();
      return;
    }
  } else if (l) {
    // Insert printable character(s)
    var finalChar = l;
    var hasAltFlag = !!((typeof alt !== 'undefined' && alt) || (typeof altPhysical !== 'undefined' && altPhysical) || (event && !!event.altKey));
    var hasCtrlFlag = !!((typeof ctrl !== 'undefined' && ctrl) || (typeof ctrlPhysical !== 'undefined' && ctrlPhysical) || (event && !!event.ctrlKey));
    var hasAltShift = hasAltFlag && (!!shift || !!caps);

    if (hasAltFlag) {
      var baseLower = (typeof l === 'string' && l.length > 0) ? l.toLowerCase() : '';
      if (hasAltShift && altShiftKeys.hasOwnProperty(baseLower)) {
        finalChar = altShiftKeys[baseLower];
      } else if (altKeys.hasOwnProperty(baseLower)) {
        finalChar = altKeys[baseLower];
      }
    }
    if (hasCtrlFlag) {
      // Handle ctrl shortcuts
      // if (ctrlPhysical) { ctrl = 0; ctrlPhysical = false; }
      var cel = document.getElementById("ctrl");
      if (cel) { cel.style.backgroundColor = modifierFlagBgColorOff; cel.style.color = modifierFlagFgColorOff; }
      var lc = finalChar.toLowerCase();
      if (lc === 'c') {
        var copyText = "";
        if (SSTART !== -1 && SEND !== -1) {
          var cs = Math.min(SSTART, SEND);
          var ce = Math.max(SSTART, SEND);
          copyText = LINE.substring(cs, ce);
        } else {
          copyText = LINE;
        }
        if (copyText.length > 0) { navigator.clipboard.writeText(copyText).catch(function(){}); }
        pokeCursorOn();
        return;
      }
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
        pokeCursorOn();
        return;
      }
      if (lc === 'a') {
        if (LINE.length > 0) {
          SSTART = 0; SEND = LINE.length;
          pokeSelect(true);
        }
        pokeCursorOn();
        return;
      }
      pokeCursorOn();
      return;
    }

    // Typing clears any active selection (replacing selected text)
    if (SSTART !== -1 && SEND !== -1) {
      // deleteSelection();  // keep your existing deletion routine if needed
    }
    if (SSTART>-1) { pokeSelect(false); SSTART = -1; SEND = -1; }

    // Silent input (echo disabled): store char in buffer, don't display
    if (window.QandyKeyboard) {
      var _cp = QandyKeyboard._pendingState();
      if (_cp && !_cp.echo) {
        _cp.buffer = (_cp.buffer || "") + finalChar;
        pokeCursorOn(); return;
      }
    }

    LINE = (LINE || "").substring(0, CURP) + finalChar + (LINE || "").substring(CURP);
    CURP += finalChar.length;
    CURX += finalChar.length;
    while (CURX >= W) { CURX -= W; CURY++; if (CURY >= H) { CURY = H - 1; } }
    pokeInput();
    if (typeof historyIndex !== 'undefined' && historyIndex !== -1) { historyIndex = -1; tempCommand = ""; }
  }

  // No guest script fast-path and not handled above - final housekeeping
  pokeCursorOn();
}

document.addEventListener('keydown', function (event) {
 if (event.keycode === 32) { event.preventDefault(); }
 press(event);
});

document.addEventListener('keyup', function (event) { pressup(event); });

// Reset modifier keys when window regains focus
window.addEventListener('focus', function(e) {
  // Reset physical modifier key states that may have been missed
  alt = 0; altPhysical = false;
  ctrl = 0; ctrlPhysical = false;
  altVirtual = false;
  ctrlVirtual = false;
  // Update UI to reflect reset state
  var kid = (typeof HOST !== 'undefined' && HOST) ? "host-" : "guest-";
  var altBtn = document.getElementById(kid + "alt");
  //if (altBtn) {
  //  altBtn.style.backgroundColor = modifierFlagBgColorOff || "#222";
  //  altBtn.style.color = modifierFlagFgColorOff || "#fff";
  //}
  //var ctrlBtn = document.getElementById(kid + "ctrl");
  //if (ctrlBtn) {
  //  ctrlBtn.style.backgroundColor = modifierFlagBgColorOff || "#222";
  //  ctrlBtn.style.color = modifierFlagFgColorOff || "#fff";
  //}
  // Update keyboard labels if available
  if (typeof updateKeyLabels === 'function') {
    updateKeyLabels();
  }
});

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

function keyToChar(event) {
  // Special keys
  if (event.key === 'Enter') return '\n';
  if (event.key === 'Tab') return '\t';
  if (event.key === 'Backspace') return '\b';
  if (event.key === 'Escape') return '\x1b';
  
  // Regular character
  if (event.key && event.key.length === 1) return event.key;
  
  // Fallback
  var code = event.charCode || event.keyCode;
  return code ? String.fromCharCode(code) : '';
}

var _inkey_waiting = false;
var _inkey_resolve = null;

window.inkey = function() {
  return new Promise(function(resolve) {
    _inkey_waiting = true;
    _inkey_resolve = resolve;
  });
};

window.press=function(event) { 
  key=""; k=event.keyCode; shift=event.shiftKey;
  if (HOST) { kid="host-"; } else { kid="guest-"; }

  var altActive = !!(alt || altPhysical || altVirtual);
  // Only convert if ALT is pressed WITHOUT SHIFT or CAPS
  if (altActive && !shift && !caps) {
    // WASD → Arrow keys
    if (k === 87) { k = 38; }  // ALT-W → Up (38)
    if (k === 65) { k = 37; }  // ALT-A → Left (37)
    if (k === 83) { k = 40; }  // ALT-S → Down (40)
    if (k === 68) { k = 39; }  // ALT-D → Right (39)
    // QERF → Cursor keys
    if (k === 81) { k = 36; }  // ALT-Q → Home (36)
    if (k === 69) { k = 35; }  // ALT-E → End (35)
    if (k === 82) { k = 33; }  // ALT-R → Page Up (33)
    if (k === 70) { k = 34; }  // ALT-F → Page Down (34)
  }

  if (_inkey_waiting && _inkey_resolve) {
    if (k === 16 || k === 17 || k === 18 || k === 20) return;
    // Don't process function keys (F1-F12: keyCode 112-123)
    if (k >= 112 && k <= 123) return;

    _inkey_waiting = false;
    var char = keyToChar(event);
    var resolve = _inkey_resolve;
    _inkey_resolve = null;
  
    if (char) {
      event.preventDefault && event.preventDefault();
      highlightKey(k);
      resolve(char);
      return;
    }
  }
  if (SOUND && typeof beep === 'function') { try { beep(900, 25, 0.01); } catch (e) {}}
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
    l = document.getElementById(kid+"kcaps") || document.getElementById(kid+"caps");
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

    // Ensure lab.pressel updates
    if (typeof updateKeyLabels === 'function') updateKeyLabels();

    // If we just turned it off, explicitly unhighlight the element (clear inline styles)
    if (!caps) {
      unhighlightKey('caps');
    } else {
      // Ensure locked appearance
      if (l) { l.style.backgroundColor = "#ddd"; l.style.color = "#000"; }
    }

    // Prevent default browser handling side-effects and stop further processing for this key event
    event.preventDefault && event.preventDefault();
    return;
  } 

  if (event.keyCode === 27) { 
    event.preventDefault();
    if (document.getElementById('popWeb') && document.getElementById('popWeb').style.visibility === "visible") {
      hpopWeb();
      pokeCursorOn();
      return;
    }
  }
  
  if (event.keyCode === 16) {
    if (event.source === 'virtual') {
      // Virtual SHIFT: toggle the shift lock state
      shift = shift ? 0 : 1;
    }
    // Physical SHIFT: shift already set from event.shiftKey at top of press()
    var capsBtn = document.getElementById(kid+"caps");
    if (capsBtn) { capsBtn.style.backgroundColor = shift ? "#444" : ""; capsBtn.style.color = shift ? "#fff" : ""; }
    if (typeof updateKeyLabels === 'function') updateKeyLabels();
    return;
  }
  if (event.keyCode === 17) {
   if (event.source !== 'virtual') {
    if (!ctrl) {
     ctrl=1; ctrlPhysical=true;
     document.getElementById(kid+"ctrl").style.backgroundColor = modifierFlagBgColorPhysical;
     document.getElementById(kid+"ctrl").style.color = modifierFlagFgColor;
    } 
    return;
   }
   // Virtual CTRL: toggle lock and return early
   ctrlVirtual = !ctrlVirtual;
   ctrl = ctrlVirtual ? 1 : 0;
   var elCtrl = document.getElementById(kid+"ctrl");
   if (elCtrl) { elCtrl.style.backgroundColor = ctrlVirtual ? modifierFlagBgColor : modifierFlagBgColorOff; elCtrl.style.color = ctrlVirtual ? modifierFlagFgColor : modifierFlagFgColorOff; }
   if (typeof updateKeyLabels === 'function') updateKeyLabels();
   return;
  }
  if (event.keyCode === 18) {
   if (event.source !== 'virtual') {
    event.preventDefault();
    if (!alt) {
     highlightKey(k);
     alt = 1; altPhysical = true;
     document.getElementById(kid+"alt").style.backgroundColor = modifierFlagBgColor;
     document.getElementById(kid+"alt").style.color = modifierFlagFgColor;
     updateKeyLabels();
    }
    return; // Physical ALT: don't call button()
   }
   // Virtual ALT: toggle lock and return early
   altVirtual = !altVirtual;
   alt = altVirtual ? 1 : 0;
   var elAlt = document.getElementById(kid+"alt");
   if (elAlt) { elAlt.style.backgroundColor = altVirtual ? modifierFlagBgColor : modifierFlagBgColorOff; elAlt.style.color = altVirtual ? modifierFlagFgColor : modifierFlagFgColorOff; }
   if (typeof updateKeyLabels === 'function') updateKeyLabels();
   return;
  }

  // For Ctrl+key combos, pass specific ones through to button() (Ctrl+C, Ctrl+A, Ctrl+V)
  if ((event.ctrlKey || ctrl) && event.source !== 'virtual') {
    var ctrlKey = event.key ? event.key.toLowerCase() : '';
    if (ctrlKey === 'c' || ctrlKey === 'a' || ctrlKey === 'v') {
      if (event.preventDefault && typeof event.preventDefault === 'function') { event.preventDefault(); }
      highlightKey(k);
      button(k, event); 
    }
    // All other ctrl combos: let browser handle
    return;
  }
  if (typeof RUN !== 'undefined' && RUN !== "qandy.js" && typeof keydown === 'function') {
    if (!event.key) { try { event.key = String.fromCharCode(event.keyCode || 0); } catch (e) { event.key = ""; } }
    event.source = event.source || 'physical';
    event.shiftKey = !!(event.shiftKey || shift);
    event.ctrlKey = !!(event.ctrlKey || ctrl);
    event.altKey  = !!(event.altKey  || alt);
    var remappedKeyCode = event.keyCode;
    var keyChar = String.fromCharCode(event.keyCode).toLowerCase();
    
    if (event.altKey || alt) {
      if ((event.shiftKey || shift) && typeof altShiftKeys === 'object' && altShiftKeys.hasOwnProperty(keyChar)) {
        // ALT+SHIFT pressed - use altShiftKeys table
        var newChar = altShiftKeys[keyChar];
        remappedKeyCode = newChar.charCodeAt(0);
      } else if (typeof altKeys === 'object' && altKeys.hasOwnProperty(keyChar)) {
        // ALT only - use altKeys table
        var newChar = altKeys[keyChar];
        remappedKeyCode = newChar.charCodeAt(0);
      }
    }
    
    // Check if input() is waiting for line input - if so, fall through to button()
    var _pendingPress = window.QandyKeyboard ? QandyKeyboard._pendingState() : null;
    if (!_pendingPress) {
      try {
        keydown(remappedKeyCode, event);  // ← Pass remapped keyCode
      } catch (err) {
        // again, what to do with this error?
        // need to terminate running script and alert user
        console.error("Error: keydown() ", err);
      }
      //event.preventDefault && event.preventDefault();
      //event.stopPropagation && event.stopPropagation();
      // Auto-clear virtual modifier locks after key delivery (one-shot behavior)
      // if (ctrlVirtual) { ctrlVirtual = false; ctrl = ctrlPhysical ? 1 : 0; var elCk=document.getElementById(kid+"ctrl"); if (elCk) { elCk.style.backgroundColor = ctrl ? modifierFlagBgColorPhysical : modifierFlagBgColorOff; elCk.style.color = ctrl ? modifierFlagFgColor : modifierFlagFgColorOff; } }
      // if (altVirtual) { altVirtual = false; alt = altPhysical ? 1 : 0; var elAk=document.getElementById(kid+"alt"); if (elAk) { elAk.style.backgroundColor = alt ? modifierFlagBgColor : modifierFlagBgColorOff; elAk.style.color = alt ? modifierFlagFgColor : modifierFlagFgColorOff; } if (typeof updateKeyLabels === 'function') updateKeyLabels(); }
      return;
    }
    // input() is pending - fall through to button() for line input processing
  }
  // Default host behavior: highlight and send to emulator button()
  highlightKey(k);
  button(k, event);
  // Auto-clear virtual modifier locks after key delivery (one-shot behavior)
  // if (ctrlVirtual) { ctrlVirtual = false; ctrl = ctrlPhysical ? 1 : 0; var elCb=document.getElementById(kid+"ctrl"); if (elCb) { elCb.style.backgroundColor = ctrl ? modifierFlagBgColorPhysical : modifierFlagBgColorOff; elCb.style.color = ctrl ? modifierFlagFgColor : modifierFlagFgColorOff; } }
  // if (altVirtual) { altVirtual = false; alt = altPhysical ? 1 : 0; var elAb=document.getElementById(kid+"alt"); if (elAb) { elAb.style.backgroundColor = alt ? modifierFlagBgColor : modifierFlagBgColorOff; elAb.style.color = alt ? modifierFlagFgColor : modifierFlagFgColorOff; } if (typeof updateKeyLabels === 'function') updateKeyLabels(); }
}

  window.pressup=function(event) {
    // Prevent browser from handling ALT key - must be done before any conditionals
    if (HOST) { kid="host-"; } else { kid="guest-"; }
    if (event.keyCode === 18 || event.altKey) {
      if (event.source !== 'virtual') { event.preventDefault(); }
    }
    // Handle physical CTRL key release (unhighlight)
    if (event.keyCode === 17 && ctrlPhysical) {
      ctrl = 0;
      ctrlPhysical = false;
      document.getElementById(kid+"ctrl").style.backgroundColor = modifierFlagBgColorOff;
      document.getElementById(kid+"ctrl").style.color = modifierFlagFgColorOff;
      return;
    }
    // Handle physical SHIFT key release (unhighlight CAPS unless caps mode is active)
    if (event.keyCode === 16) {
      if (event.source !== 'virtual') {
        shift = 0;
        if (typeof updateKeyLabels === 'function') updateKeyLabels();
        if (!caps) { unhighlightKey('caps'); }
      }
      return;
    }
    // Handle physical ALT key release (unhighlight)
    if (event.keyCode === 18 && altPhysical) {
      alt = 0;
      altPhysical = false;
      document.getElementById(kid+"alt").style.backgroundColor = modifierFlagBgColorOff;
      document.getElementById(kid+"alt").style.color = modifierFlagFgColorOff;
      updateKeyLabels();
      return;
    }
    // Route keyup to active script if RUN is set and not the host
    if (RUN !== "qandy.js" && typeof keyup === 'function') {
      event = event || {};
      if (!event.key) { try { event.key = String.fromCharCode(event.keyCode || 0); } catch (e) { event.key = ""; }}
      // mark source so scripts can tell physical vs synthetic
      event.source = event.source || 'physical';
      try {
        keyup(event.keyCode, event);
  	     // we need way to terminate running script and alert programmer
      } catch (err) {
  	     // what is best thing to do with this error??
        console.log("script keyup() threw:", err);
      }
      return;
    }
  }

  function formatError(e) {
    if (e == null) return String(e);
    if (typeof e === 'string') return e;
    // Error instances
    if (e instanceof Error) {
      return e.name + (e.message ? ': ' + e.message : '') + (e.stack ? '\n' + e.stack : '');
    }
    // Some environments use .message on non-Error objects
    if (e && typeof e.message === 'string') {
      return (e.name ? (e.name + ': ') : '') + e.message + (e.stack ? '\n' + e.stack : '');
    }
    // Fallback: JSON stringify with circular replacer
    try {
      const seen = new WeakSet();
      return JSON.stringify(e, function(k, v) {
        if (v && typeof v === 'object') {
          if (seen.has(v)) return '[Circular]';
          seen.add(v);
        }
        if (typeof v === 'function') return '[Function]';
        return v;
      }, 2);
    } catch (err) {
      return Object.prototype.toString.call(e);
    }
  }
  
  window.waitForCursorIdle=function(timeoutMs) {
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

  window.dosExit=function() {
    // guest scripts use this to exit back to qandy.js
    print("\n[white]Exit to Qandy\n");
    RUN="qandy.js"
  }
	
  function clearScreen() { cls(); }

  window.cls=function() {
    pokeCursorOff();
    pokeText(0,0," ",800); pokeColor(0,0,CURFG, CURBG, 800); pokeAttr(0,0,0, 800);
    CURX=0; CURY=0; LINEX=0; LINEY=0;
    pokeCursorOn();
  }
  
  // sleep(ms) or window.sleep(ms)
  window.sleep = ms => new Promise(res => setTimeout(res, ms));

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
        // invoke pokeCursor to print this job.text (pokeCursor is async — await it so
        // morePrompt() pauses are respected before resolving the print job)
        try {
          await pokeCursor(job.text, job.fg, job.bg, job.attr, job.mouse);
        } catch (e) {
          // If pokeCursor thrown, still resolve so callers don't hang
        }
        // wait for any residual paced output to finish
        await waitForCursorIdle();
        // resolve the enqueue promise if present
        try { job.resolve(); } catch (e) {}
      }
    } finally {
      q.running = false;
    }
  }

  window.print=function(t) {
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
  
    text = text.replace(/\[bblue\]/g, ANSIblue_bright);
    text = text.replace(/\[bblack\]/g, ANSIblack_bright);
    text = text.replace(/\[bred\]/g, ANSIred_bright);
    text = text.replace(/\[bgreen\]/g, ANSIgreen_bright);
    text = text.replace(/\[byellow\]/g, ANSIyellow_bright);
    text = text.replace(/\[bmagenta\]/g, ANSImagenta_bright);
    text = text.replace(/\[bcyan\]/g, ANSIcyan_bright);
    text = text.replace(/\[bwhite\]/g, ANSIwhite_bright);

    text = text.replace(/\[-blue\]/g, ANSIbgblue);
    text = text.replace(/\[-black\]/g, ANSIbgblack);
    text = text.replace(/\[-red\]/g, ANSIbgred);
    text = text.replace(/\[-green\]/g, ANSIbggreen);
    text = text.replace(/\[-yellow\]/g, ANSIbgyellow);
    text = text.replace(/\[-magenta\]/g, ANSIbgmagenta);
    text = text.replace(/\[-cyan\]/g, ANSIbgcyan);
    text = text.replace(/\[-white\]/g, ANSIbgwhite);

    text = text.replace(/\[-bblue\]/g, ANSIbgblue_bright);
    text = text.replace(/\[-bblack\]/g, ANSIbgblack_bright);
    text = text.replace(/\[-bred\]/g, ANSIbgred_bright);
    text = text.replace(/\[-bgreen\]/g, ANSIbggreen_bright);
    text = text.replace(/\[-byellow\]/g, ANSIbgyellow_bright);
    text = text.replace(/\[-bmagenta\]/g, ANSIbgmagenta_bright);
    text = text.replace(/\[-bcyan\]/g, ANSIbgcyan_bright);
    text = text.replace(/\[-bwhite\]/g, ANSIbgwhite_bright);

    text = text.replace(/\[bold\]/g, ANSIbold);
    text = text.replace(/\[dim\]/g, ANSIdim);
    text = text.replace(/\[italic\]/g, ANSIitalic);
    text = text.replace(/\[line\]/g, ANSIunderline);
    text = text.replace(/\[inverse\]/g, ANSIinverse);
    text = text.replace(/\[hidden\]/g, ANSIhidden);
    text = text.replace(/\[strike\]/g, ANSIstrikethrough);
    text = text.replace(/\[blink\]/g, "\033[5m");
    text = text.replace(/\[reset\]/g, ANSIresetAll);

    text = text.replace(/\[up\]/g, "\x1b[A");
    text = text.replace(/\[down\]/g, "\x1b[B");
    text = text.replace(/\[right\]/g, "\x1b[C");
    text = text.replace(/\[left\]/g, "\x1b[D");
    text = text.replace(/\[home\]/g, "\x1b[H");
    text = text.replace(/\[cls\]/g, "\033[2J");

    // pokeCursor(text);
  
    var q = window._qandy_print_queue;
    return new Promise(function(resolve) {
      // Capture the mouse tag AT THIS MOMENT
      q.items.push({
        text: text, 
        fg: window.CURFG,
        bg: window.CURBG,
        attr: window.CURATTR,
        mouse: window.CURMOUSE,
        resolve: resolve 
      });
      _processPrintQueue();
    });
  }

//
// ──── Qandy Pop Functions ────────────────────────────────────────────────────────
//

  window.PopAlign = "center"; // "center", "click", or "full"
  window.PopUpVis = "hidden"; // current target visibility
  window.PopForce = "hidden";   // forced visibility on mouseout
  window.PUV = null;           // timeout id
  window.lastClickedZ = 0;     // last grid coordinate clicked

  const popStyle = document.createElement('style');
  popStyle.textContent = `
    .pop { position:absolute; top:260; left:190; z-index:300;
           font-family: arial; font-size: 14px; weight: bold;
           color: navy;
           background-color: rgba(221, 221, 221, 0.95);
           visibility:hidden;
           text-align: center;
           padding: 8px;
         }
    .pop a { color: navy; text-decoration: none; }
    .pop a:hover { color: blue; text-decoration: underline; }
  `;
  document.head.appendChild(popStyle);

  window.popup = document.createElement('div');
  popup.id = 'pop';
  popup.className = 'pop';
  popup.style.visibility = "hidden";

  popup.addEventListener('mouseover', () => {
     window.PopUpVis = "visible";
     popup.style.visibility = "visible";
  })
  popup.addEventListener('mouseout', () => {
    window.PopUpVis = window.PopForce;
    clearTimeout(window.PUV);
    window.PUV = setTimeout(() => { popup.style.visibility = window.PopUpVis; }, 100);
  })

  document.body.appendChild(popup);

const POP_WRAPPER_PREFIX = `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { 
            margin: 0; padding: 8px; 
            font-family: arial, sans-serif; font-size: 14px; font-weight: bold;
            color: navy; background-color: rgba(221, 221, 221, 0.95);
            z-index: 251;
            overflow: hidden; display: inline-block;
            white-space: nowrap; /* Forces content to stay side-by-side */
        }
        a { color: navy; text-decoration: none; }
        a:hover { color: blue; text-decoration: underline; }
        img { 
            max-width: 256px; 
            height: auto; 
            display: inline-block; /* Changed from block to inline-block */
            vertical-align: middle; /* Aligns images with the text/spaces */
            margin: 4px; 
        }
    </style>
</head>
<body>
    <div id="content-wrapper" style="display: inline-block;">
`;

  const POP_WRAPPER_SUFFIX = `
    </div>
    <script>
        const wrapper = document.getElementById('content-wrapper');
        // Report size to parent whenever content changes
        const observer = new ResizeObserver(entries => {
            for (let entry of entries) {
                const { width, height } = entry.contentRect;
                window.parent.postMessage({
                    type: 'resize',
                    width: width + 16, 
                    height: height + 16
                }, '*');
            }
        });
        observer.observe(wrapper);

        // Forward clicks with "cmd:" prefix to the parent machine
        document.addEventListener('click', (e) => {
            const link = e.target.closest('a');
            if (link && link.getAttribute('href')) {
                const href = link.getAttribute('href');
                if (href.startsWith('click:')) {
                    e.preventDefault();
                    window.parent.postMessage({
                        type: 'click',
                        cmd: href.split('cmd:')[1]
                    }, '*');
                }
            }
        });
    </script>
</body>
</html>
`;

  window.popHtml = function(htm) {
    const parentDiv = document.getElementById("pop");
    if (!parentDiv) return;
    window.hpop();
    parentDiv.style.visibility = "visible";
    window.PopUpVis = "visible";
    const ifr = document.createElement('iframe');
    ifr.id = "pop-frame";
    ifr.setAttribute('sandbox', 'allow-scripts');
    
    ifr.style.border = "none";
    ifr.style.background = "transparent";
    ifr.style.width = "1px"; // Start tiny, ResizeObserver will fix it
    ifr.style.height = "1px";
    ifr.style.display = "block";

    // 4. Inject the content
    ifr.srcdoc = POP_WRAPPER_PREFIX + htm + POP_WRAPPER_SUFFIX;
    parentDiv.appendChild(ifr);
};

// Replace your old hpop with this one
window.hpop = function() { 
    const p = document.getElementById("pop");
    if (p) {
        // This is the "Destroy" step. Setting innerHTML to "" 
        // kills the iframe and its process immediately.
        p.innerHTML = ""; 
        p.style.visibility = "hidden";
    }
    window.PopUpVis = "hidden";
}
// New function to handle the math once the iframe reports its size
  function repositionPop(w, h) {
  	console.log(w+' '+h);
  	
    const popup = document.getElementById("pop");
    const ifr = document.getElementById("pop-frame");
    if (!popup || !w || !h) return;

    const ScreenTop = 47; 
    const ScreenLeft = 47;
    const ScreenWidth = 256;
    const ScreenHeight = 384;

    let PopX, PopY;
    let finalW = w;
    let finalH = h;

    // Handle "Full" mode early - it occupies the whole screen regardless of content size
    if (window.PopAlign === "full") {
        PopX = ScreenLeft;
        PopY = ScreenTop;
        finalW = ScreenWidth;
        finalH = ScreenHeight;
        if (ifr) {
            ifr.style.width = ScreenWidth + "px";
            ifr.style.height = ScreenHeight + "px";
        }
    } else {
        // Standard Positioning Math
        switch (window.PopAlign) {
            case "center":
                PopX = ScreenLeft + ((ScreenWidth - w) / 2);
                PopY = ScreenTop + ((ScreenHeight - h) / 2);
                break;
                
            case "click":
                const mX = (window.mapx || 7) + 1;
                // Default to top-left of screen if no click data
                PopX = ScreenLeft;
                PopY = ScreenTop;

                if (typeof window.lastClickedZ !== 'undefined') {
                    const clickY = Math.floor(window.lastClickedZ / mX);
                    const clickX = window.lastClickedZ % mX;
                    PopX = ScreenLeft + (clickX * 32);
                    PopY = ScreenTop + (clickY * 32);
                    
                    // Keep it inside the screen boundaries
                    if (PopX + w > ScreenLeft + ScreenWidth) PopX = (ScreenLeft + ScreenWidth) - w;
                    if (PopY + h > ScreenTop + ScreenHeight) PopY = (ScreenTop + ScreenHeight) - h;
                    if (PopX < ScreenLeft) PopX = ScreenLeft;
                    if (PopY < ScreenTop) PopY = ScreenTop;
                }
                break;
                
            default: // Fallback to center
                PopX = ScreenLeft + ((ScreenWidth - w) / 2);
                PopY = ScreenTop + ((ScreenHeight - h) / 2);
        }
    }

    // Apply values with "px" units (CRITICAL: ensure they are numbers)
    popup.style.left = Math.floor(PopX) + "px";
    popup.style.top = Math.floor(PopY) + "px";
    popup.style.width = Math.floor(finalW) + "px";
    popup.style.height = Math.floor(finalH) + "px";
  }

  window.addEventListener('message', function(event) {
    const data = event.data;
    if (!data || typeof data !== 'object') return;

    console.log('type='+data.type+' click = '+data.cmd);
        
    // Handle Resize
    if (data.type === 'resize') {
        const ifr = document.getElementById("pop-frame");
        // We removed the event.source check temporarily to ensure it's not a timing issue
        if (ifr) {
            ifr.style.width = data.width + "px";
            ifr.style.height = data.height + "px";
            repositionPop(data.width, data.height);
        }
    }

    // Handle Commands
    if (data.type === 'click') {
        if (typeof window.command === 'function') {
            window.command(data.cmd);
        }
    }
  });

// 5. The Message Listener 
// This should be added near your other event listeners in qandy_js()
window.addEventListener('message', function(event) {
    const data = event.data;
    if (!data || typeof data !== 'object') return;

    // Resize event from the popup iframe
    if (data.type === 'qandy-pop-resize') {
        const ifr = document.getElementById("pop-frame");
        if (ifr) {
            ifr.style.width = data.width + "px";
            ifr.style.height = data.height + "px";
            repositionPop(data.width, data.height);
        }
    }

    // Forwarded click event (e.g. <a href="cmd:OPENDIR">)
    if (data.type === 'qandy-pop-click') {
        console.log("Popup Command Received:", data.cmd);
        // Call your existing command processor
        if (typeof window.command === 'function') {
            window.command(data.cmd);
        }
    }
});

const popWebStyle = document.createElement('style');
popWebStyle.textContent = `
  .popWeb { 
    position: absolute; 
    top: 50px; 
    left: 54px; 
    width: 256px; 
    height: 384px; 
    z-index: 400;
    visibility: hidden;
    background-color: #fff; 
    border: 1px solid #444;
    overflow: hidden; /* Hide the overflow of the large internal iframe */
  }
  
  /* The Scaler simulates a 1024px wide desktop and shrinks it by 0.25 (to 256px) */
  .popWeb-scaler {
    width: 1024px;   /* 256 * 4 */
    height: 1536px;  /* 384 * 4 */
    transform: scale(0.25);
    transform-origin: 0 0;
  }

  .popWeb-scaler iframe { 
    width: 100%; 
    height: 100%; 
    border: none; 
  }
`;
document.head.appendChild(popWebStyle);

window.popWebContainer = document.createElement('div');
popWebContainer.id = 'popWeb';
popWebContainer.className = 'popWeb';
document.body.appendChild(popWebContainer);

window.popWeb = function(url) {
    const container = document.getElementById('popWeb');
    if (!container) return;
    
    // Create a scaler wrapper so the iframe "thinks" it is a large desktop
    container.innerHTML = `
        <div class="popWeb-scaler">
            <iframe 
                src="${url}" 
                sandbox="allow-scripts allow-popups allow-forms allow-same-origin">
            </iframe>
        </div>`;
    
    container.style.visibility = "visible";
};

window.hpopWeb = function() {
    const container = document.getElementById('popWeb');
    if (container) {
        container.innerHTML = ""; // Destroy iframe and stop audio/scripts
        container.style.visibility = "hidden";
    }
};

window.pop = popHtml;


  pokeCursorOn(); 
  
  window.qandy_js = qandy_js;
  window.button = button;
  window.press = press;
  window.pressup = pressup;
  window.keyToChar = keyToChar;
  window.inkey = inkey;
  window.waitForCursorIdle = waitForCursorIdle;
  window._qandy_print_queue = _qandy_print_queue;
  window._processPrintQueue = _processPrintQueue;
  window.dosExit = dosExit;
  window.clearScreen = clearScreen;
  window.cls = cls;
  window.print = print;
  window.formatError = formatError;
  // Signal that qandy.js is ready
  if (typeof window.qandySignalReady === 'function') {
    window.qandySignalReady('qandy_js');
  }
}
