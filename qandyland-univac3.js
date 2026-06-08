
// ── UNIVAC ────────────────────────────────────────────────────────────────────
//   ie: UNIVAC(capflag.gfx, w/F2/Sc44B2D0, w/F2/Yj44Sa)
function UNIVAC(driveName, itemfile, objfile) {

  if (!_deps) {
    console.error('UNIVAC: dependencies not injected – call UNIVAC.inject(deps) at startup');
    return;
  }

// ── 1. Parse the item file path ───────────────────────────────────────────
  var parsedItem = null;
  var content = '';
  
  // JOE'S FIX: Save the exact loaded filename right away!
  var oldPath = itemfile || null; 

  if (itemfile) {
    parsedItem = _parseItemPath(itemfile);
    var itemLoad = _deps.fileLoad(driveName, '/', itemfile, 'UNIVAC');
    if (!itemLoad.success) {
      console.error('UNIVAC: cannot load item file: ' + itemfile);
      return;
    }
    content = itemLoad.content;
  }
    
  // Mutable working state scratchpad
  var state = {
    id       : parsedItem ? parsedItem.id       : 'Za',
    sector   : parsedItem ? parsedItem.sector   : 'A1',
    z        : parsedItem ? parsedItem.z        : 0,
    zStr     : parsedItem ? parsedItem.zStr     : '00',
    avatar   : parsedItem ? parsedItem.avatar   : '',
    playerid : parsedItem ? parsedItem.playerid : '',
    content  : content || ''
  };

  // Keep track of these two starting values purely for /p/ file claim logic later
  var originalId       = state.id;
  var originalPlayerId = state.playerid;
  
  // ── 2. Load the object's punch code ──────────────────────────────────────
  var objLoad;
  if (objfile && objfile.substring(0, 4) === "RAM:") {
     objLoad = { success: true, content: objfile.substring(4) };
  } else {
    objLoad = _deps.fileLoad(driveName, '/', objfile, 'UNIVAC');
    if (!objLoad.success || !objLoad.content) {
      console.error('UNIVAC: cannot load object file: ' + driveName + objfile);
      return;
    }
  }
  console.log("object punch code = " + objLoad.content);

  var tape = objLoad.content;   
  var column = 0;               
  var output = "";              

  // ── 3. Process punch code ─────────────────────────────────────────────────
  var gateopen = true; 
  var ifnot = false;   

  while (column < tape.length) {
    var word = tape.slice(column, column + 2);
    column += 2;
    
    switch (word) {
      case 'Xn': ifnot = true; break;   
      case 'Xc': ifnot = false; break;  

      // ── NEW: Xa — Claim player-item / assign team ─────────────────────────────
      case 'Xa': {
        var newId = tape.slice(column, column + 2); column += 2;

        if (!state.playerid) {
          state.id = newId;
          loadconfig(driveName);
          state.playerid = tickOdometer(driveName);
          if (register['W0']) state.sector = register['W0'];
          if (register['W1']) {
            state.zStr = register['W1'];
            state.z = parseInt(state.zStr, 10);
          }
          state.avatar = '';   // ← ADD THIS: fresh claim has no avatar yet
        } else if (state.id === 'Za') {
          state.id = newId;
          state.avatar = '';   // ← ADD THIS: lobby→team transition, clear any ghost avatar
          output += "SPVa";
        } else {
          console.log("UNIVAC() Xa: team already set to " + state.id + ", ignoring " + newId);
        }
        break;
      }

      // ── Va — Set avatar string ────────────────────────────────────────────────
      case 'Va': {
        // XbVa--     <- avatar = text between Va and -- (in this case null)
        if (!state.playerid) {
        	 console.log("###220###");
          // Guard: no player ID yet, avatar cannot be set
          console.log("UNIVAC() Va: no player ID assigned, skipping avatar set");
          var endCol = tape.indexOf('--', column);
          if (endCol !== -1) column = endCol + 2;
          else column += 2;
          break;
        }
        var endCol = tape.indexOf('--', column);
        if (endCol !== -1) {
        	 console.log("###230###");
          state.avatar = tape.slice(column, endCol);
          column = endCol + 2;
        } else {
        	 console.log("###234###");
          state.avatar = tape.slice(column, column + 2);
          column += 2;
        }
        break;
      }

      case 'Xb': {
        let clientboard = ""
        var endCol = tape.indexOf('--', column);
        if (endCol !== -1) {
          clientboard = tape.slice(column, endCol);
          column = endCol + 2;
        } else {
          clientboard = tape.slice(column, column + 2);
          column += 2;
        }
        output += "SP" + clientboard + "--";
      }    
                  
      case 'Vm': { 
        var noun = tape.slice(column, column + 2); column += 2;
        var zToken = tape.slice(column, column + 2); column += 2;
        var resolvedZ = state.zStr; 
        if (/^\d{2}$/.test(zToken)) {
          console.log("verb make item -> "+noun+zToken);
          resolvedZ = zToken; 
        } else if (/^[A-Z]/.test(zToken)) {
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
          _deps.fileDelete(driveName, '/', targetPath, 'UNIVAC');
          console.log("UNIVAC() Vm: removed " + targetPath);
        } else {
          let ts = 'X' + _deps.futureTimestamp(1); 
          _deps.fileSave(driveName, '/', targetPath, '', 'UNIVAC', 'UNIVAC', ts);
          console.log("UNIVAC() Vm: created " + targetPath);
        }
        break;
      }

      case 'Xr': { 
        var itemsToProcess = [];
        var nextTwo = tape.slice(column, column + 2);
        column += 2; 
        
        // If the user typed Xr--[items]--
        if (nextTwo === '--') {
          
          var endCol = tape.indexOf('--', column);
          if (endCol !== -1) {
            var chunk = tape.slice(column, endCol);
            for (var idx = 0; idx < chunk.length; idx += 2) {
              itemsToProcess.push(chunk.slice(idx, idx + 2));
            }
            column = endCol + 2;
          }
        } else {
          // Normal single item: Xr[item]
          itemsToProcess.push(nextTwo);
        }

        // Apply Add/Remove logic to all items in the array
        for (var idx = 0; idx < itemsToProcess.length; idx++) {
          var noun = itemsToProcess[idx];
          var isInventory = (noun >= 'Aa' && noun < 'Qa');
          var isMemory    = (noun >= 'Qa' && noun <= 'Zz');

          if (ifnot) { // ADD ITEM
            if (isInventory) {
              state.content = state.content.replace('Za', noun);
            } else if (isMemory) {
              var memAddRegex = new RegExp(noun + '(\\d{2})');
              var matchAdd = state.content.match(memAddRegex);
              if (matchAdd) {
                var count = parseInt(matchAdd[1], 10);
                if (count < 99) {
                  count++;
                  var countStr = (count < 10 ? '0' : '') + count;
                  state.content = state.content.replace(matchAdd[0], noun + countStr);
                }
              } else {
                state.content += noun + '01';
              }
            }
          } else { // REMOVE ITEM
            if (isInventory) {
              state.content = state.content.replace(noun, 'Za');
            } else if (isMemory) {
              var memRemRegex = new RegExp(noun + '(\\d{2})');
              var matchRem = state.content.match(memRemRegex);
              if (matchRem) {
                var count = parseInt(matchRem[1], 10);
                if (count > 1) {
                  count--;
                  var countStr = (count < 10 ? '0' : '') + count;
                  state.content = state.content.replace(matchRem[0], noun + countStr);
                } else {
                  state.content = state.content.replace(matchRem[0], '');
                }
              }
            }
          }
        }
        break;
      }      

      case 'Vr': { 
        var noun = tape.slice(column, column + 2); column += 2;
        var zloc = tape.slice(column, column + 2); column += 2;
        var zNum = (zloc < 10 ? '0' : '') + zloc;
        output += "SPVr" + noun + zNum + "..";
      }

      case 'Xi': { 
        var noun = tape.slice(column, column + 2); column += 2;
        console.log("UNIVAC() Xi" + noun);
        var hasItem = state.content.indexOf(noun) > -1;
        var conditionMet = ifnot ? !hasItem : hasItem;
        if (!conditionMet) {
          while (column < tape.length) {
            var skipWord = tape.slice(column, column + 2); column += 2;
            if (skipWord === 'Xc') { ifnot = false; break; }
          }
        }
        break;
      }
      
      case 'Vd':
        var noun = tape.slice(column, column + 2); column += 2;
        if (ifnot) {
          if (state.content.indexOf('Za') > -1) {
            var targetPath = 'w/' + state.sector + '/' + noun + state.zStr;
            var checkLoad = _deps.fileLoad(driveName, '/', targetPath, 'UNIVAC');
            if (checkLoad.success) {
              state.content = state.content.replace('Za', noun);
              _deps.fileDelete(driveName, '/', targetPath, 'UNIVAC');
            }
          }
        } else {
        	 if (state.content.indexOf(noun) > -1) {
        	   state.content = state.content.replace(noun, 'Za');
        	   var targetPath = 'w/' + state.sector + '/' + noun + state.zStr;
            let ts = 'X' + _deps.futureTimestamp(1); 
            _deps.fileSave(driveName, '/', targetPath, '', 'UNIVAC', 'UNIVAC', ts);
          }
        }
        break;
      
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

        if (moveBlocked) { break; } 

        var finalZ   = targetZ;
        var finalMap = currentMap;

        if (isEdge) {
          var targetSector = null;
          if (_deps && typeof _deps.calculateTargetSector === 'function') {
            targetSector = _deps.calculateTargetSector(currentMap, dirChar);
          } else if (typeof calculateTargetSector === 'function') {
            targetSector = calculateTargetSector(currentMap, dirChar);
          }

          if (targetSector && targetSector !== '  ' && targetSector !== '00'
              && _isValidExit(driveName, currentMap, targetSector)) {
            if      (word === 'Vn') finalZ = targetZ + GFX_TOTAL_TILES - GFX_COLS;
            else if (word === 'Vs') finalZ = targetZ - GFX_TOTAL_TILES + GFX_COLS;
            else if (word === 'Ve') finalZ = targetZ - GFX_COLS + 1;
            else if (word === 'Vw') finalZ = targetZ + GFX_COLS - 1;

            finalMap = targetSector;
          } else {
            break; 
          }
        }

        if (word === 'Ve' || word === 'Vw') {
          if (_deps && typeof _deps.flipAvatarDirection === 'function') {
            newAvatar = _deps.flipAvatarDirection(newAvatar, word);
          } else if (typeof flipAvatarDirection === 'function') {
            newAvatar = flipAvatarDirection(newAvatar, word);
          }
        }

        state.sector = finalMap;
        state.z      = finalZ;
        state.zStr   = (finalZ < 10 ? '0' : '') + finalZ;
        state.avatar = newAvatar;

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
        state.sector = targetSector;
        state.zStr   = targetZStr;
        state.z      = parseInt(targetZStr, 10);
        break;
      }

      default: {
        console.log('UNIVAC: unknown word [' + word + '] at column ' + (column - 2) + ' – abort script');
        break;
      }
    }
  }

  // ── 4. Save and Cleanup ───────────────────────────────────────────────────
  var newPath = 'w/' + state.sector + '/' + state.id + state.zStr + state.playerid + state.avatar;
  var saveRes = _deps.fileSave(driveName, '/', newPath, state.content, 'UNIVAC', 'UNIVAC');
  
  if (!saveRes.success) {
    console.error('UNIVAC: Failed to save to path ' + newPath + ': ' + saveRes.error);
    return; 
  }
  
  if (oldPath && oldPath !== newPath) {
    _deps.fileDelete(driveName, '/', oldPath, 'UNIVAC');
      // Check if player just claimed this file. 
    // If it started unassigned, but now has a player ID:
    if (!originalPlayerId && state.playerid) {
      _deps.fileDelete(driveName, '/', 'p/' + originalId, 'UNIVAC');
    }
    
    // Save to the /p/ directory using the new playerid if claimed, otherwise the slot ID
    var pName = state.playerid ? state.playerid : state.id;
    _deps.fileSave(driveName, '/', 'p/' + pName, state.sector + state.zStr + state.avatar, 'UNIVAC', 'UNIVAC');
  }
  
  return {
    sector:   state.sector,
    id:       state.id,
    z:        state.z,
    avatar:   state.avatar,
    playerid: state.playerid,
    fullPath: newPath,
    item:     state.id,  // Maps back for external function compatibility
    output:   output
 };
}

// Properly declare your register object
const register = {};

function saveconfig(drive) {
  let newconfig = "";
  // Loop through 0 to 9 to build the string dynamically
  for (let i = 0; i <= 9; i++) {
    const key = 'W' + i;
    // If this key exists in our register, append it to the string
    if (register[key]) {
      newconfig += key + register[key];
    }
  }
  _deps.fileSave(drive, '/', 'a', newconfig, 'UNIVAC', 'UNIVAC');
}

// The two valid character sets
const UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const LOWER_NUM = "abcdefghijklmnopqrstuvwxyz0123456789";

function loadconfig(drive) {
  const configfile = _deps.fileLoad(drive, '/', 'w/a', 'UNIVAC');
  
  // Protect against a missing/empty config file crash
  if (!configfile || !configfile.success || typeof configfile.content !== 'string') return;
  
  let config = configfile.content;
  console.log("loadconfig() config=" + config);
  
  for (let column = 0; column < config.length; column += 4) {
    const code = config.substring(column, column + 2); 
    const value = config.substring(column + 2, column + 4);
    
    if (code.startsWith('W')) {
      register[code] = value;
    }
  }
}

function tickOdometer(driveName) {
    var candidatePath = 'p/' + register['W2'] + register['W3'];
    while (_deps.fileLoad(driveName, '/', candidatePath, 'UNIVAC').success) {
      if (register['W3'] === 'Zz') {
        register['W3'] = 'Aa';
        if (register['W2'] === 'Zz') {
           register['W2'] = 'Aa';
        } else {
           registeradd('W2');
        }
      } else {
        registeradd('W3');
      }
      // FIX: This previously said W2 + W2, causing false collisions
      candidatePath = 'p/' + register['W2'] + register['W3']; 
    }
    saveconfig(driveName);
    return register['W2'] + register['W3'];
}

function registeradd(reg) {
  const val = register[reg];

  // Numeric register: "00"–"99", hard limits
  if (/^\d{2}$/.test(val)) {
    const n = parseInt(val, 10);
    if (n < 99) register[reg] = String(n + 1).padStart(2, '0');
    return;
  }

  // Alphanumeric register: first char A–Z (upper), second char a–z or 0–9
  const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const LOWER = 'abcdefghijklmnopqrstuvwxyz0123456789';

  const first = UPPER.indexOf(val[0]);
  const second = LOWER.indexOf(val[1]);

  if (second < LOWER.length - 1) {
    register[reg] = val[0] + LOWER[second + 1];
  } else if (first < UPPER.length - 1) {
    register[reg] = UPPER[first + 1] + LOWER[0];
  } else {
    register[reg] = 'Aa'; // Zz -> Aa overflow
  }
}

function registersub(reg) {
  const val = register[reg];

  // Numeric register: "00"–"99", hard limits
  if (/^\d{2}$/.test(val)) {
    const n = parseInt(val, 10);
    if (n > 0) register[reg] = String(n - 1).padStart(2, '0');
    return;
  }

  // Alphanumeric register: first char A–Z (upper), second char a–z or 0–9
  const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const LOWER = 'abcdefghijklmnopqrstuvwxyz0123456789';

  const first = UPPER.indexOf(val[0]);
  const second = LOWER.indexOf(val[1]);

  if (second > 0) {
    register[reg] = val[0] + LOWER[second - 1];
  } else if (first > 0) {
    register[reg] = UPPER[first - 1] + LOWER[LOWER.length - 1];
  } else {
    register[reg] = 'Z9'; // Aa -> Z9 underflow
  }
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

