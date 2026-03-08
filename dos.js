/*
 * Qandy DOS - Disk Operating System
 *
 * A fresh ground-up rewrite providing disk operations with global scope.
 * Access to file:/// and localStorage through virtual devices.
 *
 * Global Variables:
 *  DOS = true/false — set to true if DOS is enabled, all DOS functions should
 *                     be inside "if (DOS) {}" checks
 *  DEVICE = "name" — local var for active device
 *
 * Supported Devices:
 *  "file"   — file:/// access (default device)
 *  "local"  — localStorage in browser
 *  "echo"   — in-memory echo device (volatile)
 *  "none"   — null device (discards all writes)
 *
 * File Attributes:
 *  filename — includes extension (.js, .txt, .prg, etc)
 *  filesize — number of bytes
 *  timestamp — yyyymmddhhmmss format (first mm = month, second mm = minute)
 *  write-protect — filename starting with ! is read-only
 *
 * Manifest Format (dir.txt):
 *  filename|filesize|timestamp
 *  !qandy.js|30231|20260301021149
 *  video.txt|210000|20260301021149
 */

(function () {
  'use strict';
  if (!HOST) { return "Error: no access\n"; }
  window.DOS = true;
  window.DEVICE = 'local';
  print("DOS enabled for \'"+window.DEVICE+"\'\n");
  var DEVICES = {
    'file': {
      name: 'file',
      type: 'filesystem',
      description: 'file:/// access (default)',
      store: null // Will be fetched via file:///
    },
    'local': {
      name: 'local',
      type: 'localStorage',
      description: 'browser localStorage',
      prefix: 'qandy_',
      store: {} // In-memory cache of localStorage contents
    },
    'echo': {
      name: 'echo',
      type: 'memory',
      description: 'in-memory echo device (volatile)',
      store: {} // In-memory storage
    },
    'none': {
      name: 'none',
      type: 'null',
      description: 'null device (discards writes)',
      store: null
    }
  };

  var MANIFEST_FILENAME = 'dir.txt';
  var MAX_FILENAME_LENGTH = 255;
  var VALID_FILENAME_RE = /^[A-Za-z0-9 \-_.()+=]+$/; // No leading dot, no leading !
  var VALID_FILENAME_WITH_PROTECTION_RE = /^!?[A-Za-z0-9 \-_.()+=]+$/; // Allow ! at start
  var _clipboard = null; 
  function _getByteLength(str) { try { return new TextEncoder().encode(String(str)).length; } catch (e) { return String(str).length; }}
  function _normalizeFilename(name) { if (typeof name !== 'string') { name = String(name == null ? '' : name); } return name.trim(); }
  function _isProtected(filename) { filename = _normalizeFilename(filename); return filename.charAt(0) === '!'; }
  function _stripProtection(filename) { filename = _normalizeFilename(filename); if (filename.charAt(0) === '!') { return filename.substring(1); } return filename; }
  function _validateFilename(name) {
    var filename = _stripProtection(name);
    filename = _normalizeFilename(filename);
    if (!filename) { return { ok: false, reason: 'empty filename' }; }
    if (filename.charAt(0) === '.') { return { ok: false, reason: 'filename cannot start with .' }; }
    if (!VALID_FILENAME_RE.test(filename)) { return { ok: false, reason: 'invalid characters in filename' }; }
    if (_getByteLength(filename) > MAX_FILENAME_LENGTH) { return { ok: false, reason: 'filename exceeds 255 bytes' }; }
    return { ok: true, filename: filename };
  }
  function _formatTimestamp(date) {
    if (!date) { date = new Date(); }
    var yyyy = String(date.getFullYear());
    var mm = String(date.getMonth() + 1).padStart(2, '0');
    var dd = String(date.getDate()).padStart(2, '0');
    var hh = String(date.getHours()).padStart(2, '0');
    var min = String(date.getMinutes()).padStart(2, '0');
    var ss = String(date.getSeconds()).padStart(2, '0');
    return yyyy + mm + dd + hh + min + ss;
  }
  function _parseTimestamp(ts) {
    if (!ts || ts.length < 14) { return new Date(); }
    var yyyy = parseInt(ts.substring(0, 4), 10);
    var mm = parseInt(ts.substring(4, 6), 10) - 1; // Month is 0-indexed
    var dd = parseInt(ts.substring(6, 8), 10);
    var hh = parseInt(ts.substring(8, 10), 10);
    var min = parseInt(ts.substring(10, 12), 10);
    var ss = parseInt(ts.substring(12, 14), 10);
    return new Date(yyyy, mm, dd, hh, min, ss);
  }

  function _formatFileSize(bytes) {
    bytes = parseInt(bytes, 10) || 0;
    if (bytes === 0) return '0b';
    if (bytes < 1024) return bytes + 'b';
    if (bytes < 1048576) return Math.round(bytes / 1024) + 'k';
    return Math.round(bytes / 1048576) + 'm';
  }

  function _formatTimestampHuman(ts) {
    var date = _parseTimestamp(ts);
    var mm = String(date.getMonth() + 1).padStart(2, '0');
    var dd = String(date.getDate()).padStart(2, '0');
    var yyyy = date.getFullYear();
    var hh = String(date.getHours()).padStart(2, '0');
    var min = String(date.getMinutes()).padStart(2, '0');
    var ss = String(date.getSeconds()).padStart(2, '0');
    return mm + '-' + dd + '-' + yyyy + ' ' + hh + ':' + min + ':' + ss;
  }

  function _loadManifest() {
    var device = window.DEVICE || 'file';
    var content = _loadFileFromDevice(MANIFEST_FILENAME, device);
    var content = _loadFileFromDevice(MANIFEST_FILENAME, device);
    var manifest = [];
    if (!content) { return manifest; }
    var lines = content.split('\n');
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;
      var parts = line.split('|');
      if (parts.length < 3) continue;
      var filename = parts[0].trim();
      var filesize = parts[1].trim();
      var timestamp = parts[2].trim();
      var protected_flag = _isProtected(filename);
      filename = _stripProtection(filename);
      manifest.push({
        filename: filename,
        filesize: parseInt(filesize, 10) || 0,
        timestamp: timestamp,
        protected: protected_flag
      });
    }
    return manifest;
  }
  function _saveManifest(manifest) {
    var device = window.DEVICE || 'file';
    var lines = [];
    for (var i = 0; i < manifest.length; i++) {
      var entry = manifest[i];
      var line = '';
      if (entry.protected) { line += '!'; }
      line += entry.filename + '|' + entry.filesize + '|' + entry.timestamp;
      lines.push(line);
    }
    var content = lines.join('\n');
    _saveFileToDevice(MANIFEST_FILENAME, content, device);
  }
  function _findManifestEntry(filename, manifest) {
    filename = _stripProtection(_normalizeFilename(filename));
    for (var i = 0; i < manifest.length; i++) {
      if (manifest[i].filename.toLowerCase() === filename.toLowerCase()) {
        return { index: i, entry: manifest[i] };
      }
    }
    return null;
  }
  function _loadFileFromDevice(filename, device) {
    device = device || window.DEVICE || 'file';
    filename = _stripProtection(_normalizeFilename(filename));
    if (device === 'local') {
      var key = DEVICES.local.prefix + filename;
      try {
        return localStorage.getItem(key) || null;
      } catch (e) {
        return null;
      }
    } else if (device === 'echo') {
      return DEVICES.echo.store[filename] || null;
    } else if (device === 'none') {
      return null;
    } else if (device === 'file') {
    	// non-functional 
    }
    return null;
  }
  function _saveFileToDevice(filename, content, device) {
    device = device || window.DEVICE || 'file';
    filename = _stripProtection(_normalizeFilename(filename));
    if (device === 'local') {
      var key = DEVICES.local.prefix + filename;
      try {
        localStorage.setItem(key, content);
        return true;
      } catch (e) {
        return false;
      }
    } else if (device === 'echo') {
      DEVICES.echo.store[filename] = content;
      return true;
    } else if (device === 'none') {
      return true; // Silently discard
    } else if (device === 'file') {
      // file:/// access - not supported for writes
      return false;
    }
    return false;
  }
  function _deleteFileFromDevice(filename, device) {
    device = device || window.DEVICE || 'file';
    filename = _stripProtection(_normalizeFilename(filename));

    if (device === 'local') {
      var key = DEVICES.local.prefix + filename;
      try {
        localStorage.removeItem(key);
        return true;
      } catch (e) {
        return false;
      }
    } else if (device === 'echo') {
      delete DEVICES.echo.store[filename];
      return true;
    } else if (device === 'none') {
      return true; // Silently succeed
    } else if (device === 'file') {
      // file:/// access - not supported for deletion
      return false;
    }
    return false;
  }
  function _fileExistsOnDevice(filename, device) {
    device = device || window.DEVICE || 'file';
    filename = _stripProtection(_normalizeFilename(filename));
    if (device === 'local') {
      var key = DEVICES.local.prefix + filename;
      try {
        return localStorage.getItem(key) !== null;
      } catch (e) {
        return false;
      }
    } else if (device === 'echo') {
      return DEVICES.echo.store.hasOwnProperty(filename);
    } else if (device === 'none') {
      return false;
    } else if (device === 'file') {
      // file:/// access - check manifest
      // var manifest = _loadManifest();
      // return _findManifestEntry(filename, manifest) !== null;
    }
    return false;
  }

  window.dosMount = function (device) {
    if (!window.DOS) { return { error: 'DOS not enabled' }; }
    if (!DEVICES.hasOwnProperty(device)) { return { error: 'unsupported device: ' + device }; }
    window.DEVICE = device; return { ok: true, device: device };
  };
  window.dosBackup = function (data) {
    if (!window.DOS) { return { error: 'DOS not enabled' }; }
    var device = window.DEVICE || 'file';
    if (typeof data !== 'undefined') {
      // Restore from backup
      try {
        var backup = JSON.parse(data);
        if (device === 'local') {
          // Clear local storage for qandy files
          try {
            for (var key in localStorage) {
              if (key.indexOf(DEVICES.local.prefix) === 0) {
                localStorage.removeItem(key);
              }
            }
          } catch (e) {
            // Ignore
          }
          // Restore from backup
          for (var filename in backup) {
            if (backup.hasOwnProperty(filename)) {
              _saveFileToDevice(filename, backup[filename], device);
            }
          }
        } else if (device === 'echo') {
          DEVICES.echo.store = backup;
        }
        return { ok: true };
      } catch (e) {
        return { error: 'invalid backup format' };
      }
    } else {
      // Create backup
      var backup_obj = {};
      if (device === 'local') {
        try {
          for (var key in localStorage) {
            if (key.indexOf(DEVICES.local.prefix) === 0) {
              var cleanKey = key.substring(DEVICES.local.prefix.length);
              backup_obj[cleanKey] = localStorage.getItem(key);
            }
          }
        } catch (e) {
          // Ignore
        }
      } else if (device === 'echo') {
        backup_obj = DEVICES.echo.store;
      }
      return JSON.stringify(backup_obj);
    }
  };

  window.dosList = function () {
    if (!window.DOS) { return ''; }
    var manifest = _loadManifest();
    var lines = [];
    for (var i = 0; i < manifest.length; i++) { lines.push(manifest[i].filename); }
    return lines.join('\n');
  };

  window.dosDir = function (h) {
    if (!window.DOS) { return ''; }
    h = h ? 1 : 0; // Default to raw (h=0)
    var manifest = _loadManifest();
    var lines = [];
    for (var i = 0; i < manifest.length; i++) {
      var entry = manifest[i];
      var line = entry.filename;
      if (h === 1) {
        line += ' ' + _formatFileSize(entry.filesize);
        lines.push(line);
        lines.push('  ' + _formatTimestampHuman(entry.timestamp));
      } else {
        line += ' ' + entry.filesize;
        lines.push(line);
        lines.push('  ' + entry.timestamp);
      }
    }
    return lines.join('\n');
  };

  window.dosSave = function (file, data) {
    if (!window.DOS) { return "DOS not enabled" }; 
    var device = window.DEVICE || 'file';
    if (_stripProtection(_normalizeFilename(file)) === MANIFEST_FILENAME) { return "File error (read only)\n"; }
    var append = false;
    if (file.charAt(0) === '>') { append = true; file = file.substring(1); }
    var validation = _validateFilename(file);
    if (!validation.ok) { return validation.reason+"\n"; }
    var filename = validation.filename;
    var manifest = _loadManifest();
    var existingEntry = _findManifestEntry(filename, manifest);
    if (append && existingEntry && existingEntry.entry.protected) { return "File error (read only)\n"; }
    var content = String(data || '');
    if (append && existingEntry) {
      var existing = _loadFileFromDevice(filename, device);
      if (existing) { content = existing + content; }
    }
    var success = _saveFileToDevice(filename, content, device);
    if (!success) { return "File error\n"; }
    if (existingEntry) {
      existingEntry.entry.filesize = _getByteLength(content);
      existingEntry.entry.timestamp = _formatTimestamp();
    } else {
      manifest.push({
        filename: filename,
        filesize: _getByteLength(content),
        timestamp: _formatTimestamp(),
        protected: false
      });
    }
    _saveManifest(manifest);
    return true;
  };

  window.dosLoad = function (file) {
    if (!window.DOS) { return ''; }
    file = _normalizeFilename(file);
    // Special handling for dir.txt
    if (file === MANIFEST_FILENAME || file === '!' + MANIFEST_FILENAME) { return window.dosDir(); }
    var filename = _stripProtection(file);
    return _loadFileFromDevice(filename, window.DEVICE) || '';
  };

  window.dosCopy = function (file, dest) {
    if (!window.DOS) { return { error: 'DOS not enabled' }; }
    var device = window.DEVICE || 'file';
    file = _normalizeFilename(file);
    var content = _loadFileFromDevice(file, device);
    if (content === null) { return { error: 'file not found: ' + file }; }
    _clipboard = { filename: file, content: content };
    if (typeof dest !== 'undefined' && dest) {
      var validation = _validateFilename(dest);
      if (!validation.ok) { return { error: validation.reason }; }
      var filename = validation.filename;
      if (_fileExistsOnDevice(filename, device)) { return { error: 'destination file already exists: ' + filename }; }
      var success = _saveFileToDevice(filename, content, device);
      if (!success) { return { error: 'failed to copy to destination' }; }
      var manifest = _loadManifest();
      manifest.push({
        filename: filename,
        filesize: _getByteLength(content),
        timestamp: _formatTimestamp(),
        protected: false
      });
      _saveManifest(manifest);
    }
    return { ok: true, filename: file, clipboard: true };
  };

  window.dosPaste = async function (dest) {
    if (!window.DOS) { return "DOS disabled"; }
    let content = null;
    if (typeof _clipboard !== 'undefined' && _clipboard && _clipboard.content) {
      content = _clipboard.content;
    } else if (navigator.clipboard && typeof navigator.clipboard.readText === 'function') {
      try {
        content = await navigator.clipboard.readText();
      } catch (err) {
        // Clipboard read may be denied or require a user gesture / secure context
        return { error: 'unable to read system clipboard: ' + (err && err.message ? err.message : err) };
      }
    }
    if (!content) { return "clipboard is empty"; }
    var device = window.DEVICE || 'local';
    var append = false;
    if (dest.charAt(0) === '>') { append = true; dest = dest.substring(1); }
    var validation = _validateFilename(dest);
    if (!validation.ok) { return { error: validation.reason }; }
    var filename = validation.filename;
    if (append) {
      var existing = _loadFileFromDevice(filename, device);
      if (existing) { content = existing + content; }
    } else if (_fileExistsOnDevice(filename, device)) {
      return { error: 'destination file already exists: ' + filename };
    }
    var success = _saveFileToDevice(filename, content, device);
    if (!success) { return { error: 'failed to paste file' }; }
    var manifest = _loadManifest();
    var existingEntry = _findManifestEntry(filename, manifest);
    if (existingEntry) {
      existingEntry.entry.filesize = _getByteLength(content);
      existingEntry.entry.timestamp = _formatTimestamp();
    } else {
      manifest.push({
        filename: filename,
        filesize: _getByteLength(content),
        timestamp: _formatTimestamp(),
        protected: false
      });
    }
    _saveManifest(manifest);
    return { ok: true, filename: filename };
  };

  window.dosRename = function (file, dest) {
    if (!window.DOS) { return "DOS disabled"; }
    var device = window.DEVICE || 'file';
    file = _normalizeFilename(file);
    var validation = _validateFilename(dest);
    if (!validation.ok) { return "File error: "+validation.reason; }
    var newFilename = validation.filename;
    var oldFilename = _stripProtection(file);
    var content = _loadFileFromDevice(oldFilename, device);
    if (content === null) { return "File not found\n"; }
    if (_fileExistsOnDevice(newFilename, device)) { return "File already exists\n"; }
    var manifest = _loadManifest();
    var existingEntry = _findManifestEntry(oldFilename, manifest);
    if (!existingEntry) { return "File not found"; }
    // Delete old file and save with new name
    _deleteFileFromDevice(oldFilename, device);
    _saveFileToDevice(newFilename, content, device);
    existingEntry.entry.filename = newFilename;
    _saveManifest(manifest);
    return true;
  };

  window.dosType = function (file) {
    if (!window.DOS) { return; }
    file = _normalizeFilename(file);
    var content;
    if (file === MANIFEST_FILENAME || file === '!' + MANIFEST_FILENAME) {
      content = window.dosDir(0);
    } else {
      content = window.dosLoad(file);
    }
    if (typeof print !== 'undefined') {
      print(content);
    } else if (typeof console !== 'undefined') {
      console.log(content);
    }
  };
  window.dosDelete = function (file) {
    if (!window.DOS) { return { error: 'DOS not enabled\n' }; }
    var device = window.DEVICE || 'file';
    file = _normalizeFilename(file);
    if (_isProtected(file)) { return "File error (read only)\n"; }
    var filename = _stripProtection(file);
    var success = _deleteFileFromDevice(filename, device);
    if (!success) { return "File error\n"; }
    var manifest = _loadManifest();
    var existingEntry = _findManifestEntry(filename, manifest);
    if (existingEntry) {
      manifest.splice(existingEntry.index, 1);
      _saveManifest(manifest);
    }
    return { ok: true, filename: filename };
  };
  window.dosExists = function (file) {
    if (!window.DOS) { return false; }
    file = _normalizeFilename(file);
    var filename = _stripProtection(file);
    return _fileExistsOnDevice(filename, window.DEVICE);
  };

})();