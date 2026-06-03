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

  var itemLoad = _deps.fileLoad(driveName, '/', itemfile, 'UNIVAC');
  if (!itemLoad.success) {
    console.error('UNIVAC: cannot load item file: ' + itemfile);
    return;
  }

  // Mutable working state
  var state = {
    sector  : item.sector,
    z       : item.z,
    zStr    : item.zStr,
    avatar  : item.avatar,
    content : itemLoad.content || ''   // ← the card's data, loaded once and reused
  };
  
  // ── 2. Load the object's punch code ──────────────────────────────────────

  var objLoad;
  if (objfile && objfile.substring(0, 4) === "RAM:") {
     // Use substring(4) to grab everything after "RAM:"
     objLoad = { success: true, content: objfile.substring(4) };
  } else {
    objLoad = _deps.fileLoad(driveName, '/', objfile, 'UNIVAC');
    if (!objLoad.success || !objLoad.content) {
      console.error('UNIVAC: cannot load object file: ' + driveName + objfile);
      return;
    }
  }
  console.log("object punch code = " + objLoad.content);
  
  var tape   = objLoad.content; // e.g. 'XiLaVtA1ZeXcXiLbVtH8ZeXc'
  var column = 0;               // read-head position on the tape
  var output = "";              // output string  

  // ── 3. Process punch code ─────────────────────────────────────────────────

  var gateopen = true; // logic gate, if gate gets closed codes are ignored until 'Xc' clears all gates  
  var ifnot = false;   // inverses a code: if in inventory becomes if not in inventory, plus becomes minus, add becomes remove, etc

  while (column < tape.length) {
    var word = tape.slice(column, column + 2);
    column += 2;
    
    switch (word) {
      case 'Xn': ifnot = true; break;   // not flag
      case 'Xc': ifnot = false; break;  // clear not flag
 
      case 'Vm': { // make dynmic item on map sector 
        var noun = tape.slice(column, column + 2); column += 2;
        var zToken = tape.slice(column, column + 2); column += 2;
        var resolvedZ = state.zStr; // Default to player's z-location
        if (/^\d{2}$/.test(zToken)) {
        	 console.log("verb make item -> "+noun+zToken);
          resolvedZ = zToken; 
        } else if (/^[A-Z]/.test(zToken)) {
          // 2. Item ID: Lookup target item's z-location in the current sector
          var found = false;
          if (typeof _deps.fileList === 'function') {
            var listRes = _deps.fileList(driveName, 'w/' + state.sector, null, 'UNIVAC');
            if (listRes && listRes.success && listRes.listing) {
              var paddedList = ' ' + listRes.listing;
              var searchToken = ' ' + zToken;
              var idx = paddedList.indexOf(searchToken);
              if (idx !== -1) {
                var zStart = idx + searchToken.length;
                resolvedZ = paddedList.substring(zStart, zStart + 2);
                found = true;
              }
            }
          }
        }
        var targetPath = 'w/' + state.sector + '/' + noun + resolvedZ;
        console.log("make item "+targetPath);
        if (ifnot) {
          // XnVm: Remove specific item
          _deps.fileDelete(driveName, '/', targetPath, 'UNIVAC');
          console.log("UNIVAC() Vm: removed " + targetPath);
        } else {
          // Vm: Make item
          let ts = 'X' + _deps.futureTimestamp(1); 
          _deps.fileSave(driveName, '/', targetPath, '', 'UNIVAC', 'UNIVAC', ts);
          console.log("UNIVAC() Vm: created " + targetPath);
        }
        break;
      }

      case 'Xr': { // remove/add item from item's inventory
        var noun = tape.slice(column, column + 2); column += 2;
        // Delineate Inventory (Aa-Pz) vs Memory (Qa-Zz)
        // Delineate Inventory (Aa-Pz) vs Memory (Qa-Zz)
        var isInventory = (noun >= 'Aa' && noun < 'Qa');
        var isMemory    = (noun >= 'Qa' && noun <= 'Zz');
        if (ifnot) {
          // ── ADD ITEM ───────────────────────────────────────────────────────
          if (isInventory) {
            state.content = state.content.replace('Za', noun);
          } 
          else if (isMemory) {
            // Check if memory stack already exists (e.g. 'Wm01')
            var memAddRegex = new RegExp(noun + '(\\d{2})');
            var matchAdd = state.content.match(memAddRegex);
            if (matchAdd) {
              // Increment existing stack (cap at 99)
              var count = parseInt(matchAdd[1], 10);
              if (count < 99) {
                count++;
                var countStr = (count < 10 ? '0' : '') + count;
                state.content = state.content.replace(matchAdd[0], noun + countStr);
              }
            } else {
              // Add new memory stack to the file, starting at '01'
              state.content += noun + '01';
            }
          }
        } 
        else {
          // ── REMOVE ITEM ────────────────────────────────────────────────────
          if (isInventory) {
            // Replace the first occurrence of the item with 'Za' (nothing)
            state.content = state.content.replace(noun, 'Za');
          } 
          else if (isMemory) {
            // Find the memory stack to remove from
            var memRemRegex = new RegExp(noun + '(\\d{2})');
            var matchRem = state.content.match(memRemRegex);
            
            if (matchRem) {
              var count = parseInt(matchRem[1], 10);
              if (count > 1) {
                // Decrement stack
                count--;
                var countStr = (count < 10 ? '0' : '') + count;
                state.content = state.content.replace(matchRem[0], noun + countStr);
              } else {
                // If there's only 1 left, remove the memory item completely
                state.content = state.content.replace(matchRem[0], '');
              }
            }
          }
        }
        break;
      }
      
      case 'Vr': { // remove object from client's map sector
        var noun = tape.slice(column, column + 2); column += 2;
        var zloc = tape.slice(column, column + 2); column += 2;
        var zNum = (zloc < 10 ? '0' : '') + zloc;
        output += "SPVr" + noun + zNum + "..";
      }

      case 'Xi': { // in item has $$ in inventory 
        var noun = tape.slice(column, column + 2); column += 2;
        console.log("UNIVAC() Xi" + noun);
        // Use the pre-loaded player item file content (their inventory)
        var hasItem = state.content.indexOf(noun) > -1;
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
      
      // ── MOVEMENT COMMANDS ─────────────────────────────────────────────────
      case 'Vn':
      case 'Vs':
      case 'Ve':
      case 'Vw': {
        var GFX_COLS = 8;
        var GFX_ROWS = 12;
        var GFX_TOTAL_TILES = GFX_COLS * GFX_ROWS;

        var currentZ   = state.z;
        var currentMap = state.sector;
        var newAvatar  = state.avatar;

        var col = currentZ % GFX_COLS;
        var row = Math.floor(currentZ / GFX_COLS);
        var targetZ     = currentZ;
        var isEdge      = false;
        var dirChar     = '';
        var moveBlocked = false;

        // 1. Calculate step and check for edge/"airlock" conditions
        if (word === 'Vn') {
          dirChar = 'N';
          if (row === 0) {
            moveBlocked = true;
          } else {
            targetZ = currentZ - GFX_COLS;
            if (Math.floor(targetZ / GFX_COLS) === 0) { isEdge = true; }
          }
        } else if (word === 'Vs') {
          dirChar = 'S';
          if (row === GFX_ROWS - 1) {
            moveBlocked = true;
          } else {
            targetZ = currentZ + GFX_COLS;
            if (Math.floor(targetZ / GFX_COLS) === GFX_ROWS - 1) { isEdge = true; }
          }
        } else if (word === 'Ve') {
          dirChar = 'E';
          if (col === GFX_COLS - 1) {
            moveBlocked = true;
          } else {
            targetZ = currentZ + 1;
            if (targetZ % GFX_COLS === GFX_COLS - 1) { isEdge = true; }
          }
        } else if (word === 'Vw') {
          dirChar = 'W';
          if (col === 0) {
            moveBlocked = true;
          } else {
            targetZ = currentZ - 1;
            if (targetZ % GFX_COLS === 0) { isEdge = true; }
          }
        }

        if (moveBlocked) { break; } // Out-of-bounds — silently drop this move

        // 2. Map edge-scrolling logic
        var finalZ   = targetZ;
        var finalMap = currentMap;

        if (isEdge) {
          // calculateTargetSector derives the neighbouring map code from the current
          // map code and the direction being travelled.
          var targetSector = null;
          if (_deps && typeof _deps.calculateTargetSector === 'function') {
            targetSector = _deps.calculateTargetSector(currentMap, dirChar);
          } else if (typeof calculateTargetSector === 'function') {
            targetSector = calculateTargetSector(currentMap, dirChar);
          }

          // Only scroll if the neighbour map is listed as a valid exit
          if (targetSector && targetSector !== '  ' && targetSector !== '00'
              && _isValidExit(driveName, currentMap, targetSector)) {

            // Arrive on the opposite edge of the new map
            if      (word === 'Vn') finalZ = targetZ + GFX_TOTAL_TILES - GFX_COLS;
            else if (word === 'Vs') finalZ = targetZ - GFX_TOTAL_TILES + GFX_COLS;
            else if (word === 'Ve') finalZ = targetZ - GFX_COLS + 1;
            else if (word === 'Vw') finalZ = targetZ + GFX_COLS - 1;

            finalMap = targetSector;
          } else {
            break; // Edge leads nowhere — blocked, drop this move
          }
        }

        // 3. Flip avatar sprite for east/west movement
        if (word === 'Ve' || word === 'Vw') {
          if (_deps && typeof _deps.flipAvatarDirection === 'function') {
            newAvatar = _deps.flipAvatarDirection(newAvatar, word);
          } else if (typeof flipAvatarDirection === 'function') {
            newAvatar = flipAvatarDirection(newAvatar, word);
          }
        }

        // 4. Update memory state (Step 4 of UNIVAC handles the actual file saves/moves)
        state.sector = finalMap;
        state.z      = finalZ;
        state.zStr   = (finalZ < 10 ? '0' : '') + finalZ;
        state.avatar = newAvatar;

        break;
      }

      case 'Vt': { // teleport item to new map new z
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
        break;
      }

      // ── Unknown word – skip (forward-compatible) ────────────────────────
      default: {
        console.log('UNIVAC: unknown word [' + word + '] at column ' + (column - 2) + ' – abort script');
        break;
      }
    }
  }

  // ── 4. Save and Cleanup ───────────────────────────────────────────────────

  var oldPath = 'w/' + item.sector + '/' + item.id + item.zStr + item.avatar;
  var newPath = 'w/' + state.sector + '/' + item.id + state.zStr + state.avatar;
  
  // ALWAYS save to newPath with whatever the final state.content is
  var saveRes = _deps.fileSave(driveName, '/', newPath, state.content, 'UNIVAC', 'UNIVAC');
  
  if (!saveRes.success) {
    console.error('UNIVAC: Failed to save to path ' + newPath + ': ' + saveRes.error);
    return; 
  }
  
  // If the path physically changed (due to 'Vt'), delete the old file & update registry
  if (oldPath !== newPath) {
    _deps.fileDelete(driveName, '/', oldPath, 'UNIVAC');
    console.log('UNIVAC: Successfully moved ' + item.id + ' on disk from ' + oldPath + ' to ' + newPath);
    _updatePFile(driveName, item.id, state.sector, state.zStr, state.avatar);
  } else {
    console.log('UNIVAC: Successfully updated ' + item.id + ' at ' + newPath);
  }
  
  // Return the final state so the host server can update its session memory
  return {
    sector: state.sector,
    z: state.z,
    avatar: state.avatar,
    fullPath: 'w/' + state.sector + '/' + item.id + state.zStr + state.avatar,
    output: output
  };
}


function calculateTargetSector(map, dir) {
  if (!map || map.length !== 2) return null;
  let r = map.charCodeAt(0);
  let c = map.charCodeAt(1);
  if      (dir === 'N') r -= 1;
  else if (dir === 'S') r += 1;
  else if (dir === 'E') c += 1;
  else if (dir === 'W') c -= 1;
  return String.fromCharCode(r) + String.fromCharCode(c);
}

function flipAvatarDirection(avatarStr, cmd) {
  if (!avatarStr || (cmd !== 'Ve' && cmd !== 'Vw')) return avatarStr;
  if (cmd === 'Ve') {
    // Left → Right: A→B, C→D, E→F, G→H, I→J, K→L, M→N, O→P
    return avatarStr.replace(/[ACEGIKMO]/g, function(c) {
      return String.fromCharCode(c.charCodeAt(0) + 1);
    });
  } else {
    // Right → Left: B→A, D→C, F→E, H→G, J→I, L→K, N→M, P→O
    return avatarStr.replace(/[BDFHJLNP]/g, function(c) {
      return String.fromCharCode(c.charCodeAt(0) - 1);
    });
  }
}



// ── Exports ───────────────────────────────────────────────────────────────────

UNIVAC.inject = inject;

module.exports = UNIVAC;
