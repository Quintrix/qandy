// Qandy keyboard input glue
// Exposes: window.QandyKeyboard and global input(...) for guest scripts.
// Use: name = await input("Name: "); password = await input({ prompt: "Password: ", mask: true });

(function(global) {
  if (global.QandyKeyboard) return; // don't re-install

  var pending = null; // { resolve, reject, options, buffer, timeoutId, savedLINE, savedCURP }

  function _ensureString(s) { return (typeof s === 'string') ? s : String(s || ""); }

  // Accept the pending input value and resolve the Promise
  function acceptPending(value) {
    if (!pending) return false;
    var p = pending;
    pending = null;
    try { if (p.timeoutId) clearTimeout(p.timeoutId); } catch(e) {}
    // resolve asynchronously to avoid reentrancy with key handlers
    setTimeout(function() {
      try { p.resolve(value); } catch (e) { p.reject(e); }
    }, 0);
    return true;
  }

  // Cancel pending input (reject)
  function cancelPending(reason) {
    if (!pending) return false;
    var p = pending;
    pending = null;
    try { if (p.timeoutId) clearTimeout(p.timeoutId); } catch(e) {}
    p.reject(reason || new Error('input cancelled'));
    return true;
  }

  // Called by key handler for printable character; return true if consumed
  function handleTypedChar(ch) {
    if (!pending) return false;
    var o = pending.options || {};
    if (o.mask) {
      // Append to internal buffer and show '*' in LINE at CURP
      pending.buffer = (pending.buffer || "") + ch;
      LINE = (LINE || "");
      LINE = LINE.substring(0, CURP) + '*' + LINE.substring(CURP);
      CURP = CURP + 1;
      pokeInput();
      return true;
    }
    // Not masked -> let normal insertion happen (not consumed)
    return false;
  }

  // Called by key handler for backspace; return true if consumed
  function handleBackspace() {
    if (!pending) return false;
    var o = pending.options || {};
    if (o.mask) {
      if (!pending.buffer || pending.buffer.length === 0) return true; // nothing to delete
      // remove last char from buffer
      pending.buffer = pending.buffer.slice(0, -1);
      // remove last '*' from LINE before CURP
      if (CURP > 0) {
        LINE = LINE.substring(0, CURP-1) + LINE.substring(CURP);
        CURP = Math.max(0, CURP - 1);
        pokeInput();
      }
      return true;
    }
    // not masked -> don't consume (let normal backspace handler run)
    return false;
  }

  // Called by key handler for Enter; return true if consumed
  function handleEnter() {
    if (!pending) return false;
    var o = pending.options || {};
    var val;
    if (o.mask) {
      val = pending.buffer || "";
    } else {
      val = _ensureString(LINE || "");
    }
    // Optionally trim final newline/CR
    // val = val.replace(/\r?\n$/, "");
    // Prevent pokeInput / eraseInput from erasing what was just typed.
    // pokeInput/eraseInput uses `lastin` to remove previous input; clear it.
    try { lastin = ""; } catch (e) { /* ignore if not defined */ }

    // Move the logical cursor to the start of the next line BEFORE resolving
    try {
      // Advance to column 0, next row
      CURX = 0;
      CURY = (typeof CURY === 'number' && typeof H === 'number') ? Math.min(H - 1, CURY + 1) :
             ((typeof CURY === 'number') ? CURY + 1 : 0);

      // Sync the LINE insertion coordinates to the new cursor position
      LINEX = (typeof CURX === 'number') ? CURX : 0;
      LINEY = (typeof CURY === 'number') ? CURY : 0;

      // Reset visible edit buffer and cursor-in-line, but DO NOT call pokeInput()
      // (calling pokeInput might call eraseInput and remove visible characters).
      LINE = "";
      CURP = 0;

      // Refresh UI cursor/viewport — avoid calling pokeInput which may erase;
      // a lightweight refresh is safer.
      pokeRefresh(); pokeCursorOn();
    } catch (e) {
      // ignore UI errors and still resolve the input
    }
    acceptPending(val);
    return true;
  }

  // helper: resolve when any paced pokeCursor output finishes (or immediately if none)
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

  // Read-only access to pending state (debug)
  function _pendingState() { return pending; }

})(window);






// Public input API (replaces the previous implementation)
  function input(opts) {
    if (pending) return Promise.reject(new Error('input already pending'));
    var options = {};
    if (typeof opts === 'string') options.prompt = opts;
    else if (typeof opts === 'object' && opts !== null) options = Object.assign({}, opts);

    // create the pending promise object early so we can return it immediately
    var p = {};
    var promise = new Promise(function(resolve, reject) {
      p.resolve = resolve;
      p.reject = reject;
    });
    // attach common fields now (pending will be set only after prompt printing finishes)
    p.options = options;
    p.buffer = "";
    p.savedLINE = LINE;
    p.savedCURP = CURP;

    // async setup: wait for any current printing to finish, then print prompt and wait for that,
    // then enable interactive pending state (so prompt doesn't cancel earlier output).
    (async function() {
      try {
        // 1) wait for any existing paced output (e.g., previous print()) to finish
        await waitForCursorIdle();

        // 2) print the prompt (if any)
        if (options.prompt) {
          print(options.prompt);
        }

        // 3) wait for the prompt's paced printing to finish
        await waitForCursorIdle();

        // 4) now it's safe to enable pending input without cancelling the printed prompt
        pending = p;

        // timeout handling
        if (typeof options.timeout === 'number' && options.timeout > 0) {
          p.timeoutId = setTimeout(function() {
            if (pending === p) {
              pending = null;
              p.reject(new Error('input timeout'));
            }
          }, options.timeout);
        }

        // Ensure the cursor is visible for user input
        try { pokeCursorOn(); } catch (e) {}

      } catch (err) {
        // If any error during setup, reject the promise
        try { p.reject(err); } catch (e) {}
      }
    })();

    // ensure finalizers clear timeout if any
    return promise.finally(function() {
      if (p.timeoutId) try { clearTimeout(p.timeoutId); } catch (e) {}
    });
  }


  // Expose API
  var API = {
    input: input,
    acceptPending: acceptPending,
    cancelPending: cancelPending,
    handleTypedChar: handleTypedChar,
    handleBackspace: handleBackspace,
    handleEnter: handleEnter,
    _pendingState: _pendingState
  };

  global.QandyKeyboard = API;
  // convenience global for guest scripts: await input(...)
  global.input = input;
