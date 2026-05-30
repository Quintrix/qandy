'use strict';

//
// ──── UNIVAC – Qandyland Punch Card Processor ────────────────────────────────
//
// UNIVAC(driveName, itemfile, objfile)
//
//   driveName – the drive the world lives on (e.g. 'capflag.gfx')
//   itemfile  – full canonical path to the player-item file being processed
//               e.g. 'w/F2/Sa25B1D3J0'
//               filename anatomy: [team][slot][z-padded-2][avatar-string]
//   objfile   – full canonical path to the static object file whose punch code
//               will be run against the item
//               e.g. 'w/F2/Yj44sa'
//               filename anatomy: [obj-id-2][z-padded-2][data-2]
//               file content: punch code string, e.g. 'VtA1'
//
// The UNIVAC reads the object's punch code one two-character word at a time and
// applies each instruction to the item file.  The item file is re-saved when
// anything changes; the object file is never modified.
//
// Current instruction set  (will grow to ~40 commands):
//
//   Vt[XX]  – Teleport item to sector XX (2-char sector code)
//             Validates target sector against the current sector's 'e' exit file.
//             Moves the item file from its current sector directory to the new one.
//             Updates player map state and the 'p' registry file.
//

// ── Dependency injection ──────────────────────────────────────────────────────
//
// UNIVAC needs fileLoad, fileSave, fileDelete, fileRename, and playerIndex from
// the host server.  Rather than coupling the files with require() cycles,
// the host calls UNIVAC.inject(deps) once at startup to hand them in.
//

var _deps = null;

function inject(deps) {
  _deps = deps;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

//
// Parse the canonical item file path into its components.
//
// Item filename rules (from qandyland.js comments):
//   4 chars  – dynamic item:     [id-2][z-2]
//   6 chars  – static object:    [id-2][z-2][data-2]
//   8+ chars – player item:      [id-2][z-2][avatar-string]
//
// Path format:  w/[sector]/[filename]
// Returns { sector, filename, id, z, avatar } or null on parse failure.
//
function _parseItemPath(itemfile) {
  if (!itemfile) return null;

  // Strip leading slash if present
  var p = itemfile.replace(/^\//, '');

  // Expect:  w / [sector] / [filename]
  var parts = p.split('/');
  if (parts.length < 3 || parts[0] !== 'w') return null;

  var sector   = parts[1];            // e.g. 'F2'
  var filename = parts[2];            // e.g. 'Sa25B1D3J0'

  if (filename.length < 4) return null;

  var id     = filename.substring(0, 2);                // e.g. 'Sa'
  var zRaw   = filename.substring(2, 4);                // e.g. '25'
  var z      = parseInt(zRaw, 10);
  var avatar = filename.length > 4 ? filename.substring(4) : ''; // e.g. 'B1D3J0'

  if (isNaN(z)) return null;

  return { sector: sector, filename: filename, id: id, z: z, zStr: zRaw, avatar: avatar };
}

//
// Check whether targetSector appears in the current sector's 'e' exit file.
// The e file is a flat string of 2-character sector codes, e.g. 'D2E1E3F2'.
// Returns true if found.
//
function _isValidExit(driveName, currentSector, targetSector) {
  var eLoad = _deps.fileLoad(driveName, '/', 'w/' + currentSector + '/e', 'UNIVAC');
  if (!eLoad.success || !eLoad.content) return false;
  // Simple string match is safe because sector codes are strictly [Upper][Lower/Num]
  return eLoad.content.indexOf(targetSector) > -1;
}

//
// Update the 'p' registry file so all clients see the player's new location.
// The p file format is one line per player:  [item-id]=[sector][z][avatar]\n
// e.g.  Sa=F225B1D3J0
//
function _updatePFile(driveName, id, newSector, zStr, avatar) {
  var pLoad = _deps.fileLoad(driveName, '/', 'p', 'UNIVAC');
  if (!pLoad.success || !pLoad.content) return;

  var escaped  = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  var pUpdated = pLoad.content.replace(
    new RegExp('^(' + escaped + ')=.*$', 'm'),
    '$1=' + newSector + zStr + avatar
  );
  _deps.fileSave(driveName, '/', 'p', pUpdated, 'UNIVAC', 'UNIVAC');
}

// ── UNIVAC ────────────────────────────────────────────────────────────────────

//   ie: UNIVAC(capflag.gfx, w/F2/Sc44B2D0, w/F2/Yj44Sa)
function UNIVAC(driveName, itemfile, objfile) {

  if (!_deps) {
    console.error('UNIVAC: dependencies not injected – call UNIVAC.inject(deps) at startup');
    return;
  }

  // ── 1. Parse the item file path ───────────────────────────────────────────

  var item = _parseItemPath(itemfile);
  if (!item) {
    console.error('UNIVAC: cannot parse item file path: ' + itemfile);
    return;
  }

  console.log("item.sector = "+item.sector);
  
  // ── 2. Load the object's punch code ──────────────────────────────────────

  var objLoad = _deps.fileLoad(driveName, '/', objfile, 'UNIVAC');
  if (!objLoad.success || !objLoad.content) {
    console.error('UNIVAC: cannot load object file: ' + objfile);
    return;
  }
  console.log("object punch code = "+objLoad.content);

  var tape   = objLoad.content;   // e.g. 'VtA1'
  var column = 0;                 // read-head position on the tape

  // Mutable working state – will be committed at the end if anything changed
  var state = {
    sector : item.sector,
    z      : item.z,
    zStr   : item.zStr,
    avatar : item.avatar,
    dirty  : false          // set to true whenever state is mutated
  };

  // ── 3. Process punch code ─────────────────────────────────────────────────

  while (column < tape.length) {

    var word = tape.slice(column, column + 2);
    column += 2;

    switch (word) {

      // ── Vt[XX] – Teleport to sector XX ─────────────────────────────────
      //
      // Reads the next 2 characters as the target sector code.
      // Validates the target against the current sector's 'e' exit file.
      // Moves the item file from the old sector directory to the new one.
      // Updates player map state in the p file.
      //
      case 'Vt': {

        if (column + 2 > tape.length) {
          console.error('UNIVAC: Vt instruction missing sector operand in tape: ' + tape);
          column = tape.length; // halt
          break;
        }

        var targetSector = tape.slice(column, column + 2);
        column += 2;

        // Validate the exit
        if (!_isValidExit(driveName, state.sector, targetSector)) {
          console.log('UNIVAC: Vt' + targetSector + ' blocked – not in ' + state.sector + '/e');
          break;
        }

        // Build old and new canonical paths
        var oldPath = 'w/' + state.sector + '/' + item.id + state.zStr + state.avatar;
        var newPath = 'w/' + targetSector  + '/' + item.id + state.zStr + state.avatar;

        // Load item content before moving (it carries the player's inventory)
        var itemContent = _deps.fileLoad(driveName, '/', oldPath, 'UNIVAC');
        var content     = itemContent.success ? itemContent.content : '';

        // Save to new location first, then remove old location
        var saveRes = _deps.fileSave(driveName, '/', newPath, content, 'UNIVAC', 'UNIVAC');
        if (!saveRes.success) {
          console.error('UNIVAC: Vt failed to save to new path ' + newPath + ': ' + saveRes.error);
          break;
        }

        _deps.fileDelete(driveName, '/', oldPath, 'UNIVAC');

        // Commit new sector into working state
        state.sector = targetSector;
        state.dirty  = true;

        console.log('UNIVAC: Vt moved ' + item.id + ' → ' + targetSector);
        break;
      }

      // ── Unknown word – skip (forward-compatible) ────────────────────────
      default: {
        console.log('UNIVAC: unknown word [' + word + '] at column ' + (column - 2) + ' – skipping');
        break;
      }
    }
  }

  // ── 4. Commit: update the 'p' registry if state changed ──────────────────

  if (state.dirty) {
    _updatePFile(driveName, item.id, state.sector, state.zStr, state.avatar);
  }  
  
  // Return the final state so the host server can update its session memory
  return {
    sector: state.sector,
    z: state.z,
    avatar: state.avatar,
    fullPath: 'w/' + state.sector + '/' + item.id + state.zStr + state.avatar
  };
  
}

// ── Exports ───────────────────────────────────────────────────────────────────

UNIVAC.inject = inject;

module.exports = UNIVAC;




// ── 4. Commit: update the 'p' registry if state changed ──────────────────

