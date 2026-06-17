
// ── UNIVAC ────────────────────────────────────────────────────────────────────
//   ie: UNIVAC(capflag.gfx, w/F2/Sc44B2D0, w/F2/Yj44Sa)
function UNIVAC(driveName, itemfile, objfile, sessionToken) {
  sessionToken = sessionToken || 'UNIVAC';

  if (!_deps) {
    console.error('UNIVAC: dependencies not injected – call UNIVAC.inject(deps) at startup');
    return;
  }

  var _global = typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this);
  if (!_global.register) _global.register = {};
  var register = _global.register;

// ── 1. Parse the item file path ───────────────────────────────────────────
  var parsedItem = null;
  var content = '';
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

  // ── stuff W[] with user-register values (Wa-Wz) from the item file ─────
  for (var _rk in register) { if (/^W[a-z]$/.test(_rk)) delete register[_rk]; }
  var _userRegMatches = content.match(/W[a-z]\d{2}/g) || [];
  _userRegMatches.forEach(function(m) {
    register[m.substring(0, 2)] = m.substring(2, 4);
  });
    
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

  // ── Register Math Helpers ─────────────────────────────────────────────────
  // Parses a 2-char code to find its experiential/numeric value
  function parseRegValue(valStr) {
    if (!valStr || valStr.length !== 2) return 1; // Default to 1

    if (/^[A-Z]/.test(valStr)) {
      var c2 = valStr.charAt(1);
      if (/[0-9]/.test(c2)) return parseInt(c2, 10);
      if (/[a-z]/.test(c2)) return c2.charCodeAt(0) - 96; 
    }
    
    if (/^\d{2}$/.test(valStr)) return parseInt(valStr, 10);

    return 1;
  }

  // Resolves "05", "W2", "Wa" etc. directly to its numeric value
  function getRegValue(valStr) {
    if (!valStr || valStr.length !== 2) return 0;

    // 1. If it's a register reference (e.g., 'Wa', 'W0'), pull the value stored in the register
    if (valStr.charAt(0) === 'W') {
      return resolveToValue(register[valStr] || "00");
    }

    // 2. Otherwise, resolve the raw 2-character string directly
    return resolveToValue(valStr);
  }

  function resolveToValue(str) {
    // If it's pure numbers (00-99), treat as integer
    if (/^\d{2}$/.test(str)) {
      return parseInt(str, 10);
    }

    // If it's an Item ID (A-Z followed by a-z or 0-9)
    // We use the character codes to turn these into a sortable number
    // A=65, B=66... a=97, 0=48. 
    // This ensures 'Aa' < 'Ab' and 'A0' < 'A1' and 'Aa' < 'Ba'
    return (str.charCodeAt(0) * 100) + str.charCodeAt(1);
  }

  // ── 3. Process punch code ─────────────────────────────────────────────────
  
  // if the switch is open, electricity can not pass through it and commands
  // get read from the tape, but do not get executed. The 'Xc' command will close
  // switch and electricity can again pass through and commands get executed. 
  var switchopen = false; 
  
  // The 'Xn' not flag is used to give some punch codes the ability to
  // perform two tasks, ie: if (ifnot) {} else {}  
  var ifnot = false;   

  while (column < tape.length) {
    var word = tape.slice(column, column + 2);
    column += 2;
    
    switch (word) {
      case 'Xn': 
        ifnot = true; 
        break;   

      case 'Xc': 
        ifnot = false; 
        switchopen = false; // Close the switch, electricity flows again
        break;  

      // ── Xa — Claim player-item / assign team ─────────────────────────────
      case 'Xa': {
        // Read arguments to keep tape in sync
        var newId = tape.slice(column, column + 2); column += 2;
        var inventoryString = "";
        var endCol = tape.indexOf('--', column);
        if (endCol !== -1) {
          inventoryString = tape.slice(column, endCol);
          column = endCol + 2;
        } else {
          inventoryString = tape.slice(column);
          column = tape.length; 
        }

        if (!switchopen) {
          if (!state.playerid) {
            state.id = newId;
            loadconfig(driveName);
            state.playerid = tickOdometer(driveName);
            if (register['W0']) state.sector = register['W0'];
            if (register['W1']) {
              state.zStr = register['W1'];
              state.z = parseInt(state.zStr, 10);
            }
            state.avatar = '';   
            state.content = inventoryString;
          } else if (state.id === 'Za') {
            state.id = newId;
            state.avatar = '';   
            state.content = inventoryString;
            output += "S^Va--^S";
          } else {
            console.log("UNIVAC() Xa: team already set to " + state.id + ", ignoring " + newId);
          }
        }
        break;
      }

      // ── Va — Set avatar string ───────────────────────────────────────────
      case 'Va': {
        // Read arguments to keep tape in sync
        var avatarStr = "";
        var endCol = tape.indexOf('--', column);
        if (endCol !== -1) {
          avatarStr = tape.slice(column, endCol);
          column = endCol + 2;
        } else {
          avatarStr = tape.slice(column, column + 2);
          column += 2;
        }

        if (!switchopen && state.playerid) {
          state.avatar = avatarStr;
        }
        break;
      }

      // ── Logic Switches ───────────────────────────────────────────

      case 'Xi': { 
        // if file has inventory item 
        var noun = tape.slice(column, column + 2); column += 2;
        var ifinv = false;
        if (state.content.indexOf(noun) === -1) { ifinv = true; }
        if (ifnot) ifinv = !ifinv;
        if (ifinv) { switchopen = true; }
        break;
      }
      
      case 'Xs': {
        // set register noun to value 
        var regKey = tape.slice(column, column + 2); column += 2;
        var val = tape.slice(column, column + 2); column += 2;
        // validate that it is a user register before setting
        if (!switchopen && /^W[a-z]$/.test(regKey)) {
          // If the value is a register (e.g., 'Wa'), use its current value, else use the raw value
          register[regKey] = (val.charAt(0) === 'W') ? (register[val] || "00") : val;
        }
        break;
      }
      
      case 'Xd': {
        // dice roll, set register to random number from value of register to ##
        var value1 = tape.slice(column, column + 2); column += 2;
        var target = value1; // e.g., "Wd"
        var value2 = tape.slice(column, column + 2); column += 2;
        
        if (target.charAt(0) === "W") {
          // Get the actual integer values from the registers
          var v1 = parseInt(getRegValue(value1), 10);
          var v2 = parseInt(getRegValue(value2), 10);
          // Determine min and max
          var min = Math.min(v1, v2);
          var max = Math.max(v1, v2);
          // Calculate random number between min and max inclusive
          var roll = Math.floor(Math.random() * (max - min + 1)) + min;
          console.log("dice roll: target="+target+" v1="+v1+" v2="+v2+" roll="+roll);
          // Clamp the result
          if (roll < 0) roll = 0;
          if (roll > 99) roll = 99;
          // Store as 2-digit string
          register[target] = roll.toString().padStart(2, '0');
        }
        break;
      }
      
      case 'Xm': {
        // math, add ## to register W$, use Xn not to subtract
        var value1 = tape.slice(column, column + 2); column += 2;
        var target = value1; // e.g., "Wd"
        var value2 = tape.slice(column, column + 2); column += 2;
        
        if (target.charAt(0) === "W") {
          // Get the actual integer values from the registers
          var v1 = parseInt(getRegValue(value1), 10);
          var v2 = parseInt(getRegValue(value2), 10);
          // do the math
          if (ifnot) {
            var result = v1 - v2;
            if (result < 0) { result=0; }
          if (roll > 99) roll = 99;
          	var result = v1 + v2;
          	if (result > 99) { result=99; }
          }
          register[target] = result.toString().padStart(2, '0');
        }
      }
      
      case 'Xl': {
        // if value1 is less than value2
        var value1 = tape.slice(column, column + 2); column += 2;
        var value2 = tape.slice(column, column + 2); column += 2;
        var v1 = getRegValue(value1);
        var v2 = getRegValue(value2);
        // Apply ifnot (Xn) inversion
        var result = (v1 < v2);
        if (ifnot) result = !result;
        if (result) { switchopen = true; }
        break;
      }

      case 'Xe': {
        var value1 = tape.slice(column, column + 2); column += 2;
        var value2 = tape.slice(column, column + 2); column += 2;
        var v1 = getRegValue(value1);
        var v2 = getRegValue(value2);
        // Apply ifnot (Xn) inversion
        var result = (v1 == v2);
        if (ifnot) result = !result;
        if (result) { switchopen = true; }
        break;      
      }            

      // ── Item Management ───────────────────────────────────────────

      case 'Vm': { 
        // Read arguments
        var noun = tape.slice(column, column + 2); column += 2;
        var zToken = tape.slice(column, column + 2); column += 2;

        if (!switchopen) {
          var resolvedZ = state.zStr; 
          if (/^\d{2}$/.test(zToken)) {
            resolvedZ = zToken; 
          } else if (/^[A-Z]/.test(zToken)) {
            if (typeof _deps.fileList === 'function') {
              var listRes = _deps.fileList(driveName, 'w/' + state.sector, null, 'UNIVAC');
              if (listRes && listRes.success && listRes.listing) {
                var paddedList = ' ' + listRes.listing;
                var searchToken = ' ' + zToken;
                var idx = paddedList.indexOf(searchToken);
                if (idx !== -1) {
                  var zStart = idx + searchToken.length;
                  resolvedZ = paddedList.substring(zStart, zStart + 2);
                }
              }
            }
          }
          var targetPath = 'w/' + state.sector + '/' + noun + resolvedZ;
          console.log("make item "+targetPath);
          if (ifnot) {
            _deps.fileDelete(driveName, '/', targetPath, sessionToken);
            console.log("UNIVAC() Vm: removed " + targetPath);
          } else {
            let ts = 'X' + _deps.futureTimestamp(1); 
            _deps.fileSave(driveName, '/', targetPath, '', sessionToken, sessionToken, ts);
            console.log("UNIVAC() Vm: created " + targetPath);
          }
        }
        break;
      }

      case 'Xr': { 
        // replace inven item $$ with $$
        // if this is a  'W' it should use the value in the register
        // 
        var noun1 = tape.slice(column, column + 2); column += 2; 
        var noun2 = tape.slice(column, column + 2); column += 2;
        if (!switchopen) {
          state.content = state.content.replace(noun1, noun2);
        }
        break;
      }      

      case 'Vr': { // remove object $$ from client's map (spawns on scroll on)
        // Read arguments
        var noun = tape.slice(column, column + 2); column += 2;
        var zloc = tape.slice(column, column + 2); column += 2;
        if (!switchopen) {
          var zNum = (zloc < 10 ? '0' : '') + zloc;
          output += "S^Vr" + noun + zNum + "^S";
        }
        break;
      }

      case 'Vd': {
        // Read arguments
        var noun = tape.slice(column, column + 2); column += 2;
        if (!switchopen) {
          if (ifnot) {
            if (state.content.indexOf('Za') > -1) {
              var targetPath = 'w/' + state.sector + '/' + noun + state.zStr;
              var checkLoad = _deps.fileLoad(driveName, '/', targetPath, sessionToken);
              if (checkLoad.success) {
                state.content = state.content.replace('Za', noun);
                _deps.fileDelete(driveName, '/', targetPath, sessionToken);
              }
            }
          } else {
             if (state.content.indexOf(noun) > -1) {
               state.content = state.content.replace(noun, 'Za');
               var targetPath = 'w/' + state.sector + '/' + noun + state.zStr;
              let ts = 'X' + _deps.futureTimestamp(1); 
              _deps.fileSave(driveName, '/', targetPath, '', sessionToken, sessionToken, ts);
            }
          }
        }
        break;
      }

      case 'Vn':
      case 'Vs':
      case 'Ve':
      case 'Vw': {
        // No arguments to read. Execute if switch closed.
        if (!switchopen) {
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
            if (row === 0) moveBlocked = true;
            else {
              targetZ = currentZ - GFX_COLS;
              if (Math.floor(targetZ / GFX_COLS) === 0) isEdge = true;
            }
          } else if (word === 'Vs') {
            dirChar = 'S';
            if (row === GFX_ROWS - 1) moveBlocked = true;
            else {
              targetZ = currentZ + GFX_COLS;
              if (Math.floor(targetZ / GFX_COLS) === GFX_ROWS - 1) isEdge = true;
            }
          } else if (word === 'Ve') {
            dirChar = 'E';
            if (col === GFX_COLS - 1) moveBlocked = true;
            else {
              targetZ = currentZ + 1;
              if (targetZ % GFX_COLS === GFX_COLS - 1) isEdge = true;
            }
          } else if (word === 'Vw') {
            dirChar = 'W';
            if (col === 0) moveBlocked = true;
            else {
              targetZ = currentZ - 1;
              if (targetZ % GFX_COLS === 0) isEdge = true;
            }
          }

          if (moveBlocked) break; 

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
        }
        break;
      }

      case 'Vt': {
        // Read strictly 4 arguments to keep tape in sync
        var targetSector = tape.slice(column, column + 2); column += 2;
        var zToken       = tape.slice(column, column + 2); column += 2;
        
        if (!switchopen) {
          var targetZStr = state.zStr;
          if (!_isValidExit(driveName, state.sector, targetSector)) {
             console.log("not a valid exit");
             break; 
          }
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
          state.sector = targetSector;
          state.zStr   = targetZStr;
          state.z      = parseInt(targetZStr, 10);
        }
        break;
      }

      case 'Xp': { 
        // Read arguments
        var noun = tape.slice(column, column + 2); column += 2;
        if (!switchopen) {
          state.avatar += '-' + noun;
        }
        break;
      }
      
      case 'S^': {
        // Read through block safely to keep tape head synced
        var endCol = tape.indexOf('^S', column);
        var plugContent = "";
        
        if (endCol !== -1) {
          plugContent = tape.slice(column, endCol);
          column = endCol + 2;
        } else {
          plugContent = tape.slice(column);
          column = tape.length;
        }
        
        // Execute block only if electricity is flowing
        if (!switchopen) {
          output += 'S^' + plugContent + '^S';
        }
        break;
      }
      
      default: {
          break; // break switch(word)
      }

        // If it didn't start with W, it's a true unknown command
        console.log('UNIVAC: unknown word [' + word + '] at column ' + (column - 2) + ' – abort script');
        break;
    }
  }

  // ── 4. Save and Cleanup ───────────────────────────────────────────────────

  for (var _rk in register) {
    if (!/^W[a-z]$/.test(_rk)) continue; // only user registers (Wa-Wz) live in inventory
    var _rv = register[_rk];
    var _re = new RegExp(_rk + '\\d{2}');
    if (!_rv || _rv === '00') {
      // Undeclared / zeroed registers are simply absent from the inventory string
      state.content = state.content.replace(_re, '');
    } else if (_re.test(state.content)) {
      state.content = state.content.replace(_re, _rk + _rv);
    } else {
      state.content += _rk + _rv;
    }
  }

  var newPath = 'w/' + state.sector + '/' + state.id + state.zStr + state.playerid + state.avatar;
  var saveRes = _deps.fileSave(driveName, '/', newPath, state.content, sessionToken, sessionToken);
  
  if (!saveRes.success) {
    console.error('UNIVAC: Failed to save to path ' + newPath + ': ' + saveRes.error);
    return; 
  }
  
  if (oldPath && oldPath !== newPath) {
    _deps.fileDelete(driveName, '/', oldPath, sessionToken);
    
    // Check if player just claimed this file. 
    // If it started unassigned, but now has a player ID:
    if (!originalPlayerId && state.playerid) {
      _deps.fileDelete(driveName, '/', 'p/' + originalId, sessionToken);
    }
    
    // Save to the /p/ directory using the new playerid if claimed, otherwise the slot ID
    var pName = state.playerid ? state.playerid : state.id;
    _deps.fileSave(driveName, '/', 'p/' + pName, state.sector + state.zStr + state.avatar, sessionToken, sessionToken);
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

