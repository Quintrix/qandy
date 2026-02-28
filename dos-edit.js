// dosEdit(filename, options)
// - filename (optional string): target filename; if omitted opens a blank editor and requires Save As.
// - options: { device: string (optional), autosaveMs: number (default 0 = off), maxBytes: number (default 5*1024*1024) }
// Returns Promise resolving { action: 'saved', name: filename } or { action: 'cancel' } or rejects on error.
//
// Notes:
// - This runs in the privileged parent. It calls global.dosLoad(), global.dosSave(), global.dosExists().
// - It validates filenames (max 255 bytes, allowed chars). It does simple conflict detection by comparing a checksum
//   of content loaded at editor open vs content in storage at save time.
// - For harddrive device, dosSave/dosLoad may prompt the user for pickers. That must be triggered from a user gesture;
//   callers should call dosEdit in response to a click/tap if they expect a mount picker.
// - This editor is intentionally simple (textarea). You can replace the textarea with a code editor later.

(function (global) {
  'use strict';

  // Basic filename validation (matches dos.js rules)
  var MAX_NAME_BYTES = 255;
  var VALID_NAME_RE = /^(?!\.)[A-Za-z0-9 \-_.()+=]+$/;

  function _utf8len(s) {
    try { return (new TextEncoder()).encode(String(s)).length; } catch (e) { return String(s).length; }
  }
  function _normName(n) { return (typeof n === 'string') ? n.trim() : String(n == null ? '' : n).trim(); }
  function _validateName(name) {
    var n = _normName(name);
    if (!n) return { ok: false, reason: 'empty' };
    if (_utf8len(n) > MAX_NAME_BYTES) return { ok: false, reason: 'too-long' };
    if (!VALID_NAME_RE.test(n)) return { ok: false, reason: 'invalid-chars-or-leading-dot' };
    return { ok: true, name: n };
  }

  // small hash for conflict detection (FNV-1a 32-bit)
  function _hashString(s) {
    var h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h >>> 0;
  }

  // create modal editor DOM
  function _createEditorDom() {
    var overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.left = '0';
    overlay.style.top = '0';
    overlay.style.right = '0';
    overlay.style.bottom = '0';
    overlay.style.zIndex = 100000;
    overlay.style.background = 'rgba(0,0,0,0.6)';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';

    var container = document.createElement('div');
    container.style.width = '90%';
    container.style.maxWidth = '920px';
    container.style.height = '80%';
    container.style.background = '#0b0b0b';
    container.style.color = '#eee';
    container.style.borderRadius = '8px';
    container.style.boxShadow = '0 6px 24px rgba(0,0,0,0.6)';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.overflow = 'hidden';
    overlay.appendChild(container);

    var header = document.createElement('div');
    header.style.display = 'flex';
    header.style.alignItems = 'center';
    header.style.padding = '8px 12px';
    header.style.gap = '8px';
    header.style.background = '#111';
    header.style.borderBottom = '1px solid #222';

    var title = document.createElement('div');
    title.textContent = 'Editor';
    title.style.fontWeight = '600';
    header.appendChild(title);

    var nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.placeholder = 'filename';
    nameInput.style.marginLeft = '8px';
    nameInput.style.flex = '1';
    nameInput.style.background = '#0b0b0b';
    nameInput.style.color = '#fff';
    nameInput.style.border = '1px solid #333';
    nameInput.style.padding = '6px 8px';
    nameInput.style.borderRadius = '4px';
    header.appendChild(nameInput);

    var metaLabel = document.createElement('div');
    metaLabel.style.marginLeft = '8px';
    metaLabel.style.fontSize = '12px';
    metaLabel.style.color = '#9aa';
    header.appendChild(metaLabel);

    container.appendChild(header);

    var textarea = document.createElement('textarea');
    textarea.style.flex = '1';
    textarea.style.width = '100%';
    textarea.style.resize = 'none';
    textarea.style.background = '#050505';
    textarea.style.color = '#ddd';
    textarea.style.border = 'none';
    textarea.style.padding = '12px';
    textarea.style.fontFamily = 'monospace';
    textarea.style.fontSize = '14px';
    textarea.spellcheck = false;
    container.appendChild(textarea);

    var footer = document.createElement('div');
    footer.style.display = 'flex';
    footer.style.alignItems = 'center';
    footer.style.justifyContent = 'space-between';
    footer.style.padding = '8px 12px';
    footer.style.borderTop = '1px solid #222';
    footer.style.background = '#0b0b0b';
    footer.style.gap = '8px';

    var left = document.createElement('div');
    left.style.fontSize = '12px';
    left.style.color = '#9aa';
    left.textContent = 'Press Ctrl-S (or Cmd-S) to save. Esc to cancel.';
    footer.appendChild(left);

    var right = document.createElement('div');
    right.style.display = 'flex';
    right.style.gap = '8px';

    var btnSave = document.createElement('button');
    btnSave.textContent = 'Save';
    btnSave.style.padding = '6px 10px';
    btnSave.style.borderRadius = '4px';
    btnSave.style.border = '1px solid #2a2a2a';
    btnSave.style.background = '#1b7';
    btnSave.style.color = '#012';
    right.appendChild(btnSave);

    var btnSaveAs = document.createElement('button');
    btnSaveAs.textContent = 'Save As...';
    btnSaveAs.style.padding = '6px 10px';
    btnSaveAs.style.borderRadius = '4px';
    btnSaveAs.style.border = '1px solid #333';
    btnSaveAs.style.background = '#222';
    btnSaveAs.style.color = '#ddd';
    right.appendChild(btnSaveAs);

    var btnCancel = document.createElement('button');
    btnCancel.textContent = 'Cancel';
    btnCancel.style.padding = '6px 10px';
    btnCancel.style.borderRadius = '4px';
    btnCancel.style.border = '1px solid #333';
    btnCancel.style.background = '#222';
    btnCancel.style.color = '#ddd';
    right.appendChild(btnCancel);

    footer.appendChild(right);
    container.appendChild(footer);

    return {
      overlay: overlay,
      container: container,
      nameInput: nameInput,
      textarea: textarea,
      metaLabel: metaLabel,
      btnSave: btnSave,
      btnSaveAs: btnSaveAs,
      btnCancel: btnCancel
    };
  }

  // Main exported function
  async function dosEdit(filename, options) {
    options = options || {};
    var dev = options.device || global.DEVICE || 'local';
    var autosaveMs = options.autosaveMs || 0;
    var maxBytes = (typeof options.maxBytes === 'number') ? options.maxBytes : (5 * 1024 * 1024); // default 5MB

    // Prepare DOM
    var ui = _createEditorDom();
    document.body.appendChild(ui.overlay);

    // focus handling
    ui.textarea.focus();

    // initialize state
    var fname = filename ? _normName(filename) : '';
    var validCheck = fname ? _validateName(fname) : { ok: true, name: fname };
    if (!validCheck.ok) validCheck = { ok: false, reason: 'no-filename' };

    if (fname) ui.nameInput.value = fname;
    ui.metaLabel.textContent = 'Device: ' + dev;

    // load initial content if filename provided
    var originalContent = '';
    var originalHash = 0;
    if (fname) {
      try {
        // dosLoad may prompt the user for mount if needed
        var content = await global.dosLoad(fname).catch(function(e){ return null; });
        if (content !== null && typeof content !== 'undefined') {
          originalContent = String(content);
          ui.textarea.value = originalContent;
          originalHash = _hashString(originalContent);
        } else {
          originalContent = '';
          ui.textarea.value = '';
          originalHash = _hashString('');
        }
      } catch (e) {
        // ignore load errors; start with blank
        originalContent = '';
        ui.textarea.value = '';
        originalHash = _hashString('');
      }
    }

    // helper: update file size label
    function _updateSizeLabel() {
      var bytes = _utf8len(ui.textarea.value || '');
      ui.metaLabel.textContent = 'Device: ' + dev + ' • ' + bytes + ' bytes';
    }
    _updateSizeLabel();

    // autosave timer
    var autosaveTimer = null;
    if (autosaveMs > 0) {
      autosaveTimer = setInterval(async () => {
        try {
          await _doSave(ui.nameInput.value, ui.textarea.value, { dev, maxBytes, checkConflict: false });
          // autosave silently ignores conflicts to avoid annoying prompt
        } catch (e) {
          console.warn('autosave failed', e);
        }
      }, autosaveMs);
    }

    // keyboard shortcuts (Ctrl/Cmd+S to save, Esc to cancel)
    function _onKeyDown(ev) {
      if ((ev.ctrlKey || ev.metaKey) && (ev.key === 's' || ev.key === 'S')) {
        ev.preventDefault();
        ui.btnSave.click();
        return false;
      }
      if (ev.key === 'Escape') {
        ev.preventDefault();
        ui.btnCancel.click();
        return false;
      }
      // update size label on typing
      setTimeout(_updateSizeLabel, 0);
    }
    ui.textarea.addEventListener('keydown', _onKeyDown);
    ui.nameInput.addEventListener('keydown', function(ev){ if (ev.key === 'Enter') ev.preventDefault(); });

    // Save implementation with basic conflict detection
    async function _doSave(nameValue, contentValue, opts) {
      opts = opts || {};
      var targetName = _normName(nameValue || '');
      var v = _validateName(targetName);
      if (!v.ok) throw new Error('Invalid filename: ' + (v.reason || 'bad name'));
      var bytes = _utf8len(contentValue || '');
      if (bytes > (opts.maxBytes || maxBytes)) throw new Error('File too large: ' + bytes + ' bytes (max ' + (opts.maxBytes || maxBytes) + ')');

      // conflict detection: if the stored content changed since open, prompt user
      if (opts.checkConflict !== false && fname) {
        try {
          var cur = await global.dosLoad(targetName);
          cur = (cur === null || typeof cur === 'undefined') ? '' : String(cur);
          var curHash = _hashString(cur);
          if (curHash !== originalHash) {
            // conflict: ask user what to do
            var choice = confirm('The file "' + targetName + '" has changed since you opened it. Overwrite anyway? (OK=Overwrite, Cancel=Abort)');
            if (!choice) throw new Error('conflict-detected');
            // if user chooses overwrite, continue
          }
        } catch (e) {
          // ignore load error, allow save
        }
      }

      // actually save using privileged dosSave
      await global.dosSave(targetName, contentValue);
      // update originalHash for subsequent saves in this editor
      originalHash = _hashString(String(contentValue || ''));
      fname = targetName;
      return true;
    }

    // handlers
    var resolveFn, rejectFn;
    var promise = new Promise(function (resolve, reject) { resolveFn = resolve; rejectFn = reject; });

    ui.btnSave.addEventListener('click', async function () {
      try {
        var nameVal = ui.nameInput.value;
        await _doSave(nameVal, ui.textarea.value, { dev: dev, maxBytes: maxBytes, checkConflict: true });
        cleanup();
        resolveFn({ action: 'saved', name: _normName(nameVal) });
      } catch (e) {
        alert('Save failed: ' + String(e));
      }
    });

    ui.btnSaveAs.addEventListener('click', async function () {
      try {
        var newName = prompt('Save As filename:', ui.nameInput.value || '');
        if (!newName) return;
        ui.nameInput.value = newName;
        await _doSave(newName, ui.textarea.value, { dev: dev, maxBytes: maxBytes, checkConflict: true });
        cleanup();
        resolveFn({ action: 'saved', name: _normName(newName) });
      } catch (e) {
        alert('Save As failed: ' + String(e));
      }
    });

    ui.btnCancel.addEventListener('click', function () {
      if (confirm('Discard changes and close editor?')) {
        cleanup();
        resolveFn({ action: 'cancel' });
      }
    });

    // cleanup
    function cleanup() {
      if (autosaveTimer) { clearInterval(autosaveTimer); autosaveTimer = null; }
      ui.textarea.removeEventListener('keydown', _onKeyDown);
      try { ui.overlay.remove(); } catch (e) {}
    }

    // expose a quick programmatic API for special callers (optional)
    var editorApi = {
      setContent: function (s) { ui.textarea.value = String(s || ''); _updateSizeLabel(); },
      getContent: function () { return ui.textarea.value; },
      focus: function () { ui.textarea.focus(); }
    };

    // return the promise
    return promise;
  }

  // Export to global
  try { global.dosEdit = dosEdit; } catch (e) { /* ignore */ }

})(window);