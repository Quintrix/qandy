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

  var tape   = objLoad.content;   // e.g. 'XiLaVtA1ZeXcXiLbVtH8ZeXc'
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

  var gateopen=true; // logic gate, if gate gets closed codes are ignored until 'Xc' clears all gates  
  var ifnot = false; // inverses a code: if in inventory becomes if not in inventory, plus becomes minus, add becomes remove, etc

  while (column < tape.length) {
    var word = tape.slice(column, column + 2);
    column += 2;
    
    switch (word) {
    	case 'Xn': ifnot=true; break;
    	case 'Xc': ifnot=false; break;
      case 'Xi': {
        var noun = tape.slice(column, column + 2); column += 2;
        console.log("UNIVAC() Xi" + noun);
        // Load the player's item file content (their inventory)
        var invLoad = _deps.fileLoad(driveName, '/', itemfile, 'UNIVAC');
        var inventory = (invLoad.success && invLoad.content) ? invLoad.content : '';
        var hasItem = inventory.indexOf(noun) > -1;
        var conditionMet = ifnot ? !hasItem : hasItem;
        if (!conditionMet) {
          // Fast-forward tape to the next 'Xc' that closes this gate
          while (column < tape.length) {
            var skipWord = tape.slice(column, column + 2); column += 2;
            if (skipWord === 'Xc') { ifnot = false; break; }
          }
        }
        break;
      }
      
      case 'Vt': {
        var noun = tape.slice(column, column + 2); column += 2;
        if (!_isValidExit(driveName, state.sector, noun)) { break; }
        var targetSector = noun; var targetZStr = state.zStr;
        if (column + 2 <= tape.length) {
          var zToken = tape.slice(column, column + 2); column += 2;
          if (/^\d{2}$/.test(zToken)) {
            targetZStr = zToken;
          } else if (/^[A-Z]/.test(zToken)) {
            if (typeof _deps.fileList === 'function') {
              var listRes = _deps.fileList(driveName, 'w/' + targetSector, null, 'UNIVAC');
              if (listRes && listRes.success && listRes.listing) {
                var paddedList = ' ' + listRes.listing;
                var searchToken = ' ' + zToken;
                var idx = paddedList.indexOf(searchToken);
                if (idx !== -1) {
                  var zStart = idx + searchToken.length;
                  targetZStr = paddedList.substring(zStart, zStart + 2);
                }
              }
            }
          }
        }

        // ── FIX: commit the new location to state ────────────────────────────
        state.sector = targetSector;
        state.zStr   = targetZStr;
        state.z      = parseInt(targetZStr, 10);
        state.dirty  = true;

        break;   // ── FIX: don't fall through to default
      }

      // ── Unknown word – skip (forward-compatible) ────────────────────────
      default: {
        console.log('UNIVAC: unknown word [' + word + '] at column ' + (column - 2) + ' – skipping');
        break;
      }
    }
  }

  if (state.dirty) {
    // Construct old path using initial 'item', and new path using mutated 'state'
    var oldPath = 'w/' + item.sector + '/' + item.id + item.zStr + item.avatar;
    var newPath = 'w/' + state.sector + '/' + item.id + state.zStr + state.avatar;
    // Only hit the filesystem if the path actually changed 
    // (This naturally handles any command that updates sectors, Z-locations, or avatars)
    if (oldPath !== newPath) {
      // Load item content before moving (it carries the player's inventory)
      var itemContent = _deps.fileLoad(driveName, '/', oldPath, 'UNIVAC');
      var content     = itemContent.success ? itemContent.content : '';
      // Save to new location first
      var saveRes = _deps.fileSave(driveName, '/', newPath, content, 'UNIVAC', 'UNIVAC');
      if (!saveRes.success) {
        console.error('UNIVAC: Failed to save to new path ' + newPath + ': ' + saveRes.error);
        return; // Halt if save failed so we don't accidentally wipe player from the 'p' registry
      }
      // Remove old location
      _deps.fileDelete(driveName, '/', oldPath, 'UNIVAC');
      console.log('UNIVAC: Successfully moved ' + item.id + ' on disk from ' + oldPath + ' to ' + newPath);
    }
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
