
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

  var p = itemfile.replace(/^\//, '');
  var parts = p.split('/');
  if (parts.length < 3 || parts[0] !== 'w') return null;

  var sector   = parts[1];            
  var filename = parts[2];            

  if (filename.length < 4) return null;

  // Always uniform: First 2 are ID, next 2 are Z
  var id   = filename.substring(0, 2);
  var zRaw = filename.substring(2, 4);
  var z    = parseInt(zRaw, 10);
  if (isNaN(z)) return null;

  var playerid = '';
  var avatar = '';

  // If this is a player slot (Sa-Tz) and it has been claimed (length >= 8)
  if (id >= 'Sa' && id < 'Ua' && filename.length >= 8) {
    playerid = filename.substring(4, 8); // The 4-char unique session ID
    avatar = filename.substring(8);   // The actual avatar graphics
  } else {
    avatar = filename.length > 4 ? filename.substring(4) : '';
  }

  return { sector: sector, filename: filename, id: id, z: z, zStr: zRaw, playerid: playerid, avatar: avatar };
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
// Sector codes are [Upper][Lower/Num]. The second character is either a
// lower-case 'world' letter (a-z) or one of 36 'extended city map' characters
// (10 numerals + 16 symbols), reached via the 'Vc' command. The two halves
// share a fixed 1:1 offset so each world letter has exactly one matching
// city character:  Aa<->A0 ... Az<->A}
//
var _CITY_CHARSET = "abcdefghijklmnopqrstuvwxyz0123456789_()[]{}^,:;+-=%@";

// 'a' -> '0', 'b' -> '1', ... 'z' -> '}'. Returns null if not a world letter.
function _cityCharFromWorld(worldChar) {
  var idx = _CITY_CHARSET.indexOf(worldChar);
  if (idx < 0 || idx > 25) return null;
  return _CITY_CHARSET.charAt(idx + 26);
}

// '0' -> 'a', ... '}' -> 'z'. Returns null if not an extended city character.
function _worldCharFromCity(cityChar) {
  var idx = _CITY_CHARSET.indexOf(cityChar);
  if (idx < 26) return null;
  return _CITY_CHARSET.charAt(idx - 26);
}

// True if sector's 2nd character is one of the 36 'extended city map' chars.
function _isCitySector(sector) {
  if (!sector || sector.length < 2) return false;
  return _CITY_CHARSET.indexOf(sector.charAt(1)) >= 26;
}

//
// Update the 'p' registry file so all clients see the player's new location.
function _updatePFile(driveName, id, newSector, zStr, avatar) {
  // Massive Speedup: No more Regex. Just instantly overwrite the player's specific file in the /p/ directory.
  _deps.fileSave(driveName, '/', 'p/' + id, newSector + zStr + avatar, 'UNIVAC', 'UNIVAC');
}

// Terrain codes: A$-K$ walkable | M$ Lava | R$ Forest | S$ Mountain | T$ Swamp
// Boots: Aa (Travel/Master) | Ab (Hiking) | Ac (Swamp) | Ad (Mountain) | Ae (Lava+Mtn)
function _canWalkTerrain(tileCode, inv) {
  if (!tileCode || tileCode.length < 2) return false;
  var t = tileCode.charAt(0);

  // A$ through K$ are universally walkable (Grass, dirt, paths, etc)
  if (t >= 'A' && t <= 'K') return true;

  var has = function(item) { return inv.indexOf(item) !== -1; };
  var master = has('Aa'); // Travel Boots

  switch (t) {
    case 'M': return master || has('Ae');              // Lava
    case 'R': return master || has('Ab');              // Forest
    case 'S': return master || has('Ad') || has('Ae'); // Mountains (Ad OR Ae)
    case 'T': return master || has('Ac');              // Swamp
    default:  return false;                            // L-Z, symbols, Walls
  }
}

// Movement point cost calculator based on W5 Boot Register and Terrain code
function _getMoveCost(w5Value, tileCode) {
  if (!tileCode || tileCode.length < 2) return 1;
  var t = tileCode.charAt(0);
  
  var tier = 0; // Walkable (A$-K$)
  if (t === 'R' || t === 'T') tier = 1; // Forest, Swamp (Requires Travel level)
  if (t === 'S' || t === 'M') tier = 2; // Mountain, Lava (Requires Mtn/Lava level)

  switch (w5Value) {
    case 'Ab': // Hiking Boots: Grass free (0), Tier 1 costs 1
      return (tier === 0) ? 0 : 1;
    case 'Ac': // Swamp Boots: Tier 1 costs 2, Grass costs 1
      return (tier >= 1) ? 2 : 1;
    case 'Ad': // Mountain Boots
    case 'Ae': // Lava+Mtn Boots
      if (tier >= 2) return 3;
      if (tier === 1) return 2;
      return 1;
    case 'Aa': // Travel Boots / Master Boots
      return 1;
    default:   // Boots disabled or no boots equipped: standard 1 pt cost
      return 1;
  }
}

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
  if (!register['W4']) { 
    register['W4']="Dd"; // set default value
    loadconfig(driveName); 
  }

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
  // console.log("object punch code = " + objLoad.content);

  var tape = objLoad.content;   
  var column = 0;               
  var output = "";              

  // ── Helpers ───────────────────────────────────────────────────────────────
  
  // Resolves a target Z location from a sector based on an Item ID token
  function findItemZ(sectorCode, token) {
    if (typeof _deps.fileList === 'function') {
      var listRes = _deps.fileList(driveName, 'w/' + sectorCode, null, 'UNIVAC');
      if (listRes && listRes.success && listRes.listing) {
        var paddedList = ' ' + listRes.listing;
        var searchToken = ' ' + token;
        var idx = paddedList.indexOf(searchToken);
        if (idx !== -1) {
          var zStart = idx + searchToken.length;
          return paddedList.substring(zStart, zStart + 2);
        }
      }
    }
    return null;
  }

  // Finds a 6-character object in the given sector whose last 2 chars are numerals
  function findCityExitZ(sectorCode) {
    if (typeof _deps.fileList === 'function') {
      var listRes = _deps.fileList(driveName, 'w/' + sectorCode, null, 'UNIVAC');
      if (listRes && listRes.success && listRes.listing) {
        var files = listRes.listing.trim().split(/\s+/);
        for (var i = 0; i < files.length; i++) {
          var fname = files[i];
          if (fname.length === 6 && /^\d{2}$/.test(fname.substring(4, 6))) {
            return fname.substring(4, 6);
          }
        }
      }
    }
    return null;
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

  // Cache sector 'm' files in RAM for the duration of this tape read
  var _mapCache = {};
  function getTileAt(sec, zIdx) {
    if (zIdx < 0) return 'Ga'; // Safe fallback for top/left off-map wrapping logic 
    if (!_mapCache[sec]) {
      var mLoad = _deps.fileLoad(driveName, '/', 'w/' + sec + '/m', 'UNIVAC');
      _mapCache[sec] = (mLoad.success && mLoad.content) ? mLoad.content : null;
    }
    var data = _mapCache[sec];
    if (!data) return 'Ga'; // Sector has no 'm' file -> default to Ga (Grass)
    var charIdx = zIdx * 2;
    if (charIdx + 2 > data.length) return 'Ga'; // Map file too short -> default to Ga
    return data.substring(charIdx, charIdx + 2);
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
          var appliedXa = false;
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
            appliedXa = true;
          } else if (state.id === 'Za') {
            state.id = newId;
            state.avatar = '';   
            state.content = inventoryString;
            output += "S^Va--^S";
            appliedXa = true;
          } else {
            console.log("UNIVAC() Xa: team already set to " + state.id + ", ignoring " + newId);
          }

          if (appliedXa) {
            // Scan for W user-registers and apply their value to the register mapping
            // so later math commands read the correct quantity before Cleanup.
            state.content = state.content.replace(/(W[a-z])(\d{2})?/g, function(match, rk, val) {
              if (val) {
                register[rk] = val;
                return match;     // Keep the existing formatted pair (e.g. Wz99)
              } else {
                register[rk] = '01';
                return rk + '01'; // If there's no numeral suffix, treat it as quantity 1 and sanitize
              }
            });
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
        ifnot=false; // reset ifnot
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
        
        if (!switchopen && target.charAt(0) === "W") {
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
        
        if (!switchopen && target.charAt(0) === "W") {
          // Get the actual integer values from the registers
          var v1 = parseInt(getRegValue(value1), 10);
          var v2 = parseInt(getRegValue(value2), 10);
          // do the math
          if (ifnot) {
            var result = v1 - v2;
            if (result < 0) { result=0; }
          } else {
            var result = v1 + v2;
            if (result > 99) { result=99; }
          }
          register[target] = result.toString().padStart(2, '0');
        }
        ifnot=false; // reset ifnot (must stay outside to clear the flag)
        break;
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
        
        // FIX: Open the switch if the condition is NOT met
        if (!result) { switchopen = true; } 
        
        ifnot=false; // reset ifnot
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
        
        // FIX: Open the switch if the condition is NOT met
        if (!result) { switchopen = true; } 
        
        ifnot=false; // reset ifnot
        break;      
      }

      // ── Item Management ───────────────────────────────────────────

      case 'Vi': {
        // send inventory string to client
        if (!switchopen) {
          // Remove all whitespace from the inventory string
          var cleanInv = state.content.replace(/\s+/g, '');
          output += "Vi" + cleanInv + "--";
        }
        break;
      }
      
      case 'Vp': { 
        // Read arguments
        var noun = tape.slice(column, column + 2); column += 2;
        if (!switchopen) {
          state.avatar += '-' + noun;
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

      case 'Vm': { 
        // make item at player's current z-location
        var noun = tape.slice(column, column + 2); column += 2;

        if (!switchopen) {
          // Inherit the player's current Z location directly
          var resolvedZ = state.zStr; 
          
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

      case 'Vr': { 
        // remove object $$ from client's map at player's current z-location
        var noun = tape.slice(column, column + 2); column += 2;
        
        if (!switchopen) {
          // state.zStr is already properly zero-padded (e.g., '05', '44')
          output += "S^Vr" + noun + state.zStr + "^S";
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
          output+="Vi";
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
          
          var tempZ       = currentZ;
          var targetMap   = currentMap;
          var isEdge      = false;
          var dirChar     = '';
          var moveBlocked = false;

          // Calculate destination tile and check if it lands on an edge
          if (word === 'Vn') {
            dirChar = 'N';
            if (row === 0) moveBlocked = true; // Prevent walking off-grid entirely
            else {
              tempZ = currentZ - GFX_COLS;
              if (Math.floor(tempZ / GFX_COLS) === 0) isEdge = true;
            }
          } else if (word === 'Vs') {
            dirChar = 'S';
            if (row === GFX_ROWS - 1) moveBlocked = true;
            else {
              tempZ = currentZ + GFX_COLS;
              if (Math.floor(tempZ / GFX_COLS) === GFX_ROWS - 1) isEdge = true;
            }
          } else if (word === 'Ve') {
            dirChar = 'E';
            if (col === GFX_COLS - 1) moveBlocked = true;
            else {
              tempZ = currentZ + 1;
              if (tempZ % GFX_COLS === GFX_COLS - 1) isEdge = true;
            }
          } else if (word === 'Vw') {
            dirChar = 'W';
            if (col === 0) moveBlocked = true;
            else {
              tempZ = currentZ - 1;
              if (tempZ % GFX_COLS === 0) isEdge = true;
            }
          }

          var w5Active = (register['W5'] && register['W5'] !== '00');
          var w6Active = (register['W6'] && register['W6'] !== '00');

          // Safely determine the local map tile we evaluate terrain/cost against
          var localTile = 'Ga';
          if (isEdge) {
            // If stepping off the map entirely, evaluate cost based on the tile we are leaving
            localTile = getTileAt(currentMap, currentZ);
          } else {
            // Otherwise, evaluate based on the specific tile we are entering
            localTile = getTileAt(currentMap, tempZ);
          }

          // 2. GATEKEEPER A: Validate stepping onto the tile
          if (w5Active) {
            if (!_canWalkTerrain(localTile, state.content)) {
              console.log("UNIVAC: Step blocked on tile [" + localTile + "]");
              column = tape.length;
              break;
            }
          }

          if (moveBlocked) {
            column = tape.length; // Snap tape head on grid-edge collision
            break;
          } 

          // 3. GATEKEEPER B: Movement Points via W6 Register
          if (w6Active && /^W[a-z]$/.test(register['W6'])) {
            var poolReg = register['W6'];
            var currentPoints = parseInt(register[poolReg] || '00', 10);
            if (isNaN(currentPoints)) currentPoints = 0;

            var moveCost = _getMoveCost(register['W5'], localTile);

            if (currentPoints < moveCost) {
              console.log("UNIVAC: Move blocked, insufficient points (Need: " + moveCost + ", Have: " + currentPoints + ")");
              column = tape.length; // Snap tape head
              break;
            }

            // Deduct the point cost
            currentPoints -= moveCost;
            if (currentPoints < 0) currentPoints = 0;
            register[poolReg] = currentPoints.toString().padStart(2, '0');
          }

          var targetZ = tempZ;

          if (isEdge) {
            var nextSector = null;
            var maxMapBounds = register['W4'] || 'Hh'; 
            var cityWorldChar = _isCitySector(currentMap) ? _worldCharFromCity(currentMap.charAt(1)) : null;

            if (cityWorldChar !== null) {
              // Walking off the edge of an 'extended city map' teleports the
              // player back to its matching 'world' lower-case sector
              // (ie: A0 -> Aa ... A} -> Az), instead of scrolling n/s/e/w.
              nextSector = currentMap.charAt(0) + cityWorldChar;
            } else {
              // Calculate the neighboring sector code
              if (_deps && typeof _deps.calculateTargetSector === 'function') {
                nextSector = _deps.calculateTargetSector(currentMap, dirChar, maxMapBounds);
              } else if (typeof calculateTargetSector === 'function') {
                nextSector = calculateTargetSector(currentMap, dirChar, maxMapBounds);
              }
            }

            // Check the 'e' exits file to ensure the new map is a legal exit.
            // City -> world teleports are always legal and skip this check,
            // since that relationship isn't listed in the 'e' exit file.
            if (nextSector && (cityWorldChar !== null || _isValidExit(driveName, currentMap, nextSector))) {
              targetMap = nextSector;
              
              if (cityWorldChar !== null) {
                // We are exiting a city map back to the world. Check for an exit object.
                var exitZ = findCityExitZ(nextSector);
                if (exitZ !== null) {
                  targetZ = parseInt(exitZ, 10);
                } else {
                  // If no specific exit object exists, leave player at exactly the Z location they are at
                  targetZ = currentZ; 
                }
              } else {
                // Wrap the player's position to the opposite side of the new map (normal scroll)
                if (word === 'Vn') targetZ = tempZ + ((GFX_ROWS - 1) * GFX_COLS);
                if (word === 'Vs') targetZ = tempZ - ((GFX_ROWS - 1) * GFX_COLS);
                if (word === 'Ve') targetZ = tempZ - (GFX_COLS - 1);
                if (word === 'Vw') targetZ = tempZ + (GFX_COLS - 1);
              }
            }
          }

          if (word === 'Ve' || word === 'Vw') {
            if (_deps && typeof _deps.flipAvatarDirection === 'function') {
              newAvatar = _deps.flipAvatarDirection(newAvatar, word);
            } else if (typeof flipAvatarDirection === 'function') {
              newAvatar = flipAvatarDirection(newAvatar, word);
            }
          }

          state.sector = targetMap;
          state.z      = targetZ;
          state.zStr   = (targetZ < 10 ? '0' : '') + targetZ;
          state.avatar = newAvatar;
        }
        break;
      }
      
      case 'Vt': {
        var targetSector = tape.slice(column, column + 2); column += 2;
        var zToken       = tape.slice(column, column + 2); column += 2;
        
        if (!switchopen) {
          var targetZStr = state.zStr;
          if (!ifnot) {
          	if (!_isValidExit(driveName, state.sector, targetSector)) {
              console.log("not a valid exit");
              break;
            } 
          }
          
          if (/^\d{2}$/.test(zToken)) {
            targetZStr = zToken;
          } else if (/^[A-Z]/.test(zToken)) {
            var foundZ = findItemZ(targetSector, zToken);
            if (foundZ !== null) {
              targetZStr = foundZ;
            }
          }
          
          state.sector = targetSector;
          state.zStr   = targetZStr;
          state.z      = parseInt(targetZStr, 10);
        }
        break;
      }

      // ── Vc — Enter city: teleport from the current 'world' sector to ──────
      //         its matching 'extended city map' sector (ie: Aa -> A0)
      //         Exit city (XnVc): return to world map using matching map.
      case 'Vc': {
        if (!switchopen) {
          if (!ifnot) {
            // ENTER CITY (Vc)
            var cityChar = _cityCharFromWorld(state.sector.charAt(1));
            if (cityChar === null) {
              console.log("UNIVAC() Vc: " + state.sector + " has no matching city map, ignoring");
            } else {
              var targetSector = state.sector.charAt(0) + cityChar;
              var targetZStr = state.zStr; 

              var exitZ = findCityExitZ(targetSector);
              if (exitZ !== null) { targetZStr = exitZ; }

              state.sector = targetSector;
              state.zStr   = targetZStr;
              state.z      = parseInt(targetZStr, 10);
            }
          } else {
            // EXIT CITY (XnVc)
            var worldChar = _worldCharFromCity(state.sector.charAt(1));
            if (worldChar === null) {
              console.log("UNIVAC() XnVc: " + state.sector + " has no matching world map, ignoring");
            } else {
              var targetSector = state.sector.charAt(0) + worldChar;
              var targetZStr = state.zStr;
              var exitZ = findCityExitZ(targetSector);
              if (exitZ !== null) { targetZStr = exitZ; }
              state.sector = targetSector;
              state.zStr   = targetZStr;
              state.z      = parseInt(targetZStr, 10);
            }
          }
          ifnot = false; // flag was consumed
        } else {
           if (ifnot) ifnot = false; 
        }
        break;
      }
      
      // ── look around commands ───────────────────────────────────────────
      case 'Vl': {
        // Vl: Look mode activation
        if (!switchopen) {
          var activeSectors = {}; 
          
          // 1. Scan the global player registry to find all sectors currently occupied by any player
          var pListRes = _deps.fileList(driveName, 'p/', null, sessionToken);
          if (pListRes && pListRes.success && pListRes.listing) {
            var pFiles = pListRes.listing.trim().split(/\s+/);
            for (var i = 0; i < pFiles.length; i++) {
              if (!pFiles[i]) continue;
              var pLoad = _deps.fileLoad(driveName, '/', 'p/' + pFiles[i], 'UNIVAC');
              if (pLoad.success && pLoad.content && pLoad.content.length >= 2) {
                var sec = pLoad.content.substring(0, 2);
                activeSectors[sec] = true;
              }
            }
          }
          
          // 2. Ensure the player's own immediate sector is always evaluated
          activeSectors[state.sector] = true;
          
          var pCSVArr = [];
          var knownSectorsArr = [];
          
          // Team is determined by the first character of the item ID (e.g., 'S' or 'T')
          var myTeam = state.id.charAt(0); 

          // 3. Evaluate each active sector for visibility and presence of players
          for (var sec in activeSectors) {
            var secListRes = _deps.fileList(driveName, 'w/' + sec, null, sessionToken);
            if (secListRes && secListRes.success && secListRes.listing) {
              var wFiles = secListRes.listing.trim().split(/\s+/);
              var secPlayers = [];
              var teammateInSector = false;
              
              for (var j = 0; j < wFiles.length; j++) {
                var fname = wFiles[j];
                
                // Active player files have: id(2) + zStr(2) + playerId(4) + avatar(0+) => length >= 8
                if (fname && fname.length >= 8) {
                  var fid = fname.substring(0, 2);
                  
                  // Ensure it is a valid player slot (Sa through Tz)
                  if (fid >= 'Sa' && fid < 'Ua') {
                    var fz = fname.substring(2, 4);
                    secPlayers.push(fid + sec + fz);
                    
                    // Check if this player belongs to the client's team
                    if (fid.charAt(0) === myTeam) {
                      teammateInSector = true;
                    }
                  }
                }
              }
              
              // Only expose players and clear the map "Fog of War" if a teammate is physically in this sector
              if (teammateInSector) {
                knownSectorsArr.push(sec);
                pCSVArr = pCSVArr.concat(secPlayers);
              }
            }
          }

          var pCSV = pCSVArr.join('~');
          var knownSectorsStr = knownSectorsArr.join('');
          
          // Return the specific Vl formatted payload expected by the client's canvas rendering logic
          // Format: Vl[sector_2][z_2][csvPlayers]|[knownSectors]
          output += "Vl" + state.sector + state.zStr + pCSV + "|" + knownSectorsStr;
        }
        break;
      }      

      // ── PvP Tag Command ────────────────────────────────────────────────
      case 'Xt': {
        var targetId = tape.slice(column, column + 4); 
        column += 4;
        
        if (!switchopen && !ifnot) {
          // Verify that W7 is set and active to determine attack power
          var w7 = register['W7'];
          if (w7 && w7 !== '00') {
            var attackVal = getRegValue(w7).toString().padStart(2, '0');
            var myTeamId = state.id.charAt(0); // e.g., 'S' from 'Sa'

            // Scan the current sector to locate the target and identify their team
            var listRes = typeof _deps.fileList === 'function' ? _deps.fileList(driveName, 'w/' + state.sector, null, sessionToken) : {success: false, listing: ''};
            if (listRes.success && listRes.listing) {
              var files = listRes.listing.trim().split(/\s+/);
              var targetTeamId = null;

              for (var i = 0; i < files.length; i++) {
                var fname = files[i];
                // Player files: [Team:2][Z:2][PubId:4]... (length >= 8 validates it is claimed)
                if (fname.length >= 8 && fname.substring(4, 8) === targetId) {
                  targetTeamId = fname.charAt(0); // S, T, U etc
                  break;
                }
              }

              // Ensure the target exists in this room and is on an opposing team
              if (targetTeamId && targetTeamId !== myTeamId) {
                // Drop the tag marker!
                // Filename = Xt[targetID]. Contents = [myID][attackPower]
                var tagPath = 'w/' + state.sector + '/Xt' + targetId;
                var tagContent = state.playerid + attackVal;
                
                // Allow the tag to expire via lazy garbage collection after 1 minute if target goes offline
                var tsTag = _deps.futureTimestamp(1);
                _deps.fileSave(driveName, '/', tagPath, tagContent, sessionToken, sessionToken, 'X' + tsTag);
                
                console.log("UNIVAC() Xt: Tagged player " + targetId + " (Power: " + attackVal + ")");
              } else {
                console.log("UNIVAC() Xt: Target " + targetId + " not found or on same team.");
              }
            }
          } else {
            console.log("UNIVAC() Xt: Tag failed, W7 register not set.");
          }
        }
        ifnot = false;
        break;
      }
      
      // ── z-location commands ───────────────────────────────────────────
      case 'Xz': {
        // modify 'm' tile on sector $$ at z-location ## to tile %%
        var secToken = tape.slice(column, column + 2); column += 2;
        var zToken   = tape.slice(column, column + 2); column += 2;
        var tileCode = tape.slice(column, column + 2); column += 2;

        if (!switchopen) {
          // If the sector token is a register (like W0), use its value, otherwise use literal
          var targetSector = (secToken.charAt(0) === 'W') ? (register[secToken] || secToken) : secToken;
          var targetZ = getRegValue(zToken);
          var targetZStr = targetZ.toString().padStart(2, '0');
          
          // --- Marker Logic: Update client map tile visually via file sync ---
          var listRes = typeof _deps.fileList === 'function' ? _deps.fileList(driveName, 'w/' + targetSector, null, sessionToken) : {success: false, listing: ''};
          var files = (listRes.success && listRes.listing) ? listRes.listing.trim().split(/\s+/) : [];
          var markerToDelete = null;

          // Locate any existing Xz marker for this specific z-location
          for (var i = 0; i < files.length; i++) {
            if (files[i].length === 6 && files[i].substring(0, 2) === 'Xz' && files[i].substring(2, 4) === targetZStr) {
              markerToDelete = files[i];
              break;
            }
          }

          if (markerToDelete) { 
            _deps.fileDelete(driveName, '/', 'w/' + targetSector + '/' + markerToDelete, sessionToken); 
          }
          
          // Drop the fresh Xz marker (the filename itself is the payload)
          var markerFile = 'Xz' + targetZStr + tileCode;
          var tsMarker = _deps.futureTimestamp(1);
          _deps.fileSave(driveName, '/', 'w/' + targetSector + '/' + markerFile, '', sessionToken, sessionToken, tsMarker);
          console.log("UNIVAC() Xz: deployed client marker " + markerFile + " to w/" + targetSector);

          // --- Server-side 'm' file modification for physical collision / persistence ---
          var mPath = 'w/' + targetSector + '/m';
          var mLoad = _deps.fileLoad(driveName, '/', mPath, 'UNIVAC');
          var mContent = (mLoad.success && mLoad.content) ? mLoad.content : '';
          
          var charIdx = targetZ * 2;
          
          // Pad with 'Ga' (Grass fallback) if the map file string is too short to reach this Z-index
          while (mContent.length < charIdx + 2) {
            mContent += 'Ga';
          }
          
          // Inject the new tile code
          mContent = mContent.substring(0, charIdx) + tileCode + mContent.substring(charIdx + 2);
          
          // Save and update RAM cache for this tape run
          _deps.fileSave(driveName, '/', mPath, mContent, sessionToken, sessionToken);
          _mapCache[targetSector] = mContent; 
        }
        break;
      }

      case 'Vx': {
        var token = tape.slice(column, column + 2); column += 2;
        
        if (!switchopen) {
          if (ifnot) {
            // Save the object's 2-character item ID into the target register
            if (token.charAt(0) === 'W') {
              if (objfile && objfile.substring(0, 4) !== "RAM:") {
                var oParts = objfile.replace(/^\//, '').split('/');
                if (oParts.length >= 3 && oParts[0] === 'w' && oParts[2].length >= 6) {
                  var oId = oParts[2].substring(0, 2);
                  register[token] = oId;
                  console.log("register["+token+"] = "+oId);
                }
              }
            }
          } else {
            // Change the object's item ID to the token (or value inside register)
            if (objfile && objfile.substring(0, 4) !== "RAM:") {
              var oParts = objfile.replace(/^\//, '').split('/');
              if (oParts.length >= 3 && oParts[0] === 'w') {
                var oSector = oParts[1];
                var oFilename = oParts[2];
                
                if (oFilename.length >= 6) {
                  var oId = oFilename.substring(0, 2);
                  var oZ = oFilename.substring(2, 4);
                  var oData = oFilename.substring(4);
                  
                  // If token is a register (like Wa), use its value, otherwise use literal (like Zc)
                  var newId = (token.charAt(0) === 'W') ? (register[token] || token) : token;
                  
                  if (oId !== newId) {
                    var newFilename = newId + oZ + oData;
                    var newObjFile = 'w/' + oSector + '/' + newFilename;
                    
                    // --- Marker Logic: Update client visual override seamlessly ---
                    var listRes = typeof _deps.fileList === 'function' ? _deps.fileList(driveName, 'w/' + oSector, null, sessionToken) : {success: false, listing: ''};
                    var files = (listRes.success && listRes.listing) ? listRes.listing.split(' ') : [];
                    var originalId = oId;
                    var markerToDelete = null;

                    for (var i = 0; i < files.length; i++) {
                      if (files[i].length === 6 && files[i].substring(0, 2) === 'Vx' && files[i].substring(4, 6) === oId) {
                        originalId = files[i].substring(2, 4);
                        markerToDelete = files[i];
                        break;
                      }
                    }

                    if (markerToDelete) { 
                      _deps.fileDelete(driveName, '/', 'w/' + oSector + '/' + markerToDelete, sessionToken); 
                    }
                    if (originalId !== newId) {
                      var markerFile = 'Vx' + originalId + newId;
                      var tsMarker = _deps.futureTimestamp(1);
                      _deps.fileSave(driveName, '/', 'w/' + oSector + '/' + markerFile, '', sessionToken, sessionToken, tsMarker);
                    }
                    
                    // Modify the actual object file on disk
                    if (typeof _deps.fileRename === 'function') {
                      _deps.fileRename(driveName, '/', objfile, newObjFile, sessionToken);
                    } else {
                      _deps.fileDelete(driveName, '/', objfile, sessionToken);
                      var tsObj = _deps.futureTimestamp(1); 
                      _deps.fileSave(driveName, '/', newObjFile, tape, sessionToken, sessionToken, tsObj);
                    }
                    console.log("UNIVAC() Vx: modified object " + objfile + " -> " + newObjFile);
                    objfile = newObjFile; // Update path for subsequent commands
                  }
                }
              }
            } else {
              console.log("UNIVAC() Vx: cannot modify a RAM object.");
            }
          }
        }
        
        ifnot = false; // flag was consumed
        break;
      }

      case 'Vy': {
        var token = tape.slice(column, column + 2); column += 2;
        
        if (!switchopen) {
          if (ifnot) {
            // Save the object's z-location into the target register
            if (token.charAt(0) === 'W') {
              if (objfile && objfile.substring(0, 4) !== "RAM:") {
                var oParts = objfile.replace(/^\//, '').split('/');
                if (oParts.length >= 3 && oParts[0] === 'w' && oParts[2].length >= 6) {
                  var oZ = oParts[2].substring(2, 4);
                  register[token] = oZ; // oZ is already safely zero-padded (e.g. '05')
                }
              }
            }
          } else {
            // Move the object to the z-location token (or value inside register)
            if (objfile && objfile.substring(0, 4) !== "RAM:") {
              var oParts = objfile.replace(/^\//, '').split('/');
              if (oParts.length >= 3 && oParts[0] === 'w') {
                var oSector = oParts[1];
                var oFilename = oParts[2];
                
                if (oFilename.length >= 6) {
                  var oId = oFilename.substring(0, 2);
                  var oZ = oFilename.substring(2, 4);
                  var oData = oFilename.substring(4);
                  
                  // Use getRegValue to resolve the integer string, then zero-pad it
                  var targetZStr = getRegValue(token).toString().padStart(2, '0');
                  
                  if (oZ !== targetZStr) {
                    var newFilename = oId + targetZStr + oData;
                    var newObjFile = 'w/' + oSector + '/' + newFilename;
                    
                    // --- Marker Logic: Update client visual override seamlessly ---
                    var listRes = typeof _deps.fileList === 'function' ? _deps.fileList(driveName, 'w/' + oSector, null, sessionToken) : {success: false, listing: ''};
                    var files = (listRes.success && listRes.listing) ? listRes.listing.split(' ') : [];
                    var originalId = oId;
                    var markerToDelete = null;

                    // A Vx marker may exist, we need to trace back to the true original ID for the Vy marker.
                    for (var i = 0; i < files.length; i++) {
                      if (files[i].length === 6 && files[i].substring(0, 2) === 'Vx' && files[i].substring(4, 6) === oId) {
                        originalId = files[i].substring(2, 4);
                        break;
                      }
                    }

                    // Locate and remove old Vy marker
                    for (var i = 0; i < files.length; i++) {
                      if (files[i].length === 6 && files[i].substring(0, 2) === 'Vy' && files[i].substring(2, 4) === originalId) {
                        markerToDelete = files[i];
                        break;
                      }
                    }

                    if (markerToDelete) { 
                      _deps.fileDelete(driveName, '/', 'w/' + oSector + '/' + markerToDelete, sessionToken); 
                    }
                    
                    // Drop the fresh Vy marker
                    var markerFile = 'Vy' + originalId + targetZStr;
                    var tsMarker = _deps.futureTimestamp(1);
                    _deps.fileSave(driveName, '/', 'w/' + oSector + '/' + markerFile, '', sessionToken, sessionToken, tsMarker);

                    // Modify the actual object file on disk
                    if (typeof _deps.fileRename === 'function') {
                      _deps.fileRename(driveName, '/', objfile, newObjFile, sessionToken);
                    } else {
                      _deps.fileDelete(driveName, '/', objfile, sessionToken);
                      var tsObj = 'X' + _deps.futureTimestamp(1); 
                      _deps.fileSave(driveName, '/', newObjFile, tape, sessionToken, sessionToken, tsObj);
                    }
                    console.log("UNIVAC() Vy: modified object " + objfile + " -> " + newObjFile);
                    objfile = newObjFile; // Update path for subsequent commands
                  }
                }
              }
            } else {
              console.log("UNIVAC() Vy: cannot modify a RAM object.");
            }
          }
        }
        
        ifnot = false; // flag was consumed
        break;
      }            

      case 'Vz': {
        // move player item's z-location to ## on the current sector
        // this cost no movement points and is not bound by travel restrictions or boots
        // ifnot saves player-z location
        var zToken = tape.slice(column, column + 2); column += 2;
        if (!switchopen) {
          if (ifnot) {
            // Save current z-location to register ## ie: register['Ws']
           if (zToken.charAt(0) === 'W' && LOWER_NUM.indexOf(zToken.charAt(1)) !== -1) {
              register[zToken] = state.zStr;
            }
          } else {
            // Move player to Z-location ##
            var targetZ = getRegValue(zToken);
            state.z = targetZ;
            state.zStr = targetZ.toString().padStart(2, '0');
          }
        }
        ifnot = false; // flag was consumed
        break;
      }
      
      case 'Xx': {
        // exit the script, close all switches
        if (!switchopen) {
        	  column = tape.length;
        	  var switchopen = false; 
           var ifnot = false;
           break;
        }   
        var switchopen = false; 
        var ifnot = false;
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
      	 console.log('UNIVAC: unknown word [' + word + '] at column ' + (column - 2) + ' – abort script');
          break; 
      }
      // If it didn't start with W, it's a true unknown command
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
  _deps.fileSave(drive, '/', 'w/a', newconfig, 'UNIVAC', 'UNIVAC');
}

// The two valid character sets: first character will always be an upper-case letter,
// the second character can be a lower-case letter, numeral, or one of these 16 symbols,
// the lower-case letters are 'world' map sectors the player can walk walk n/s/r/w on.
// the numerals and symbols are 'extended city maps' that the player can access via
// 'enter city' command. This command should teleport the player to it's matching symbol
// (ie: Az = A} and Aa = A0 ... Bz = B} and Ba=B0
// when a player walks off on of these extended city maps, they are teleported back to
// the lower-case letter map sector.  
  
const UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const LOWER_NUM = "abcdefghijklmnopqrstuvwxyz0123456789%()+,-:;=[]^_{}@";

function loadconfig(drive) {
  const configfile = _deps.fileLoad(drive, '/', 'w/a', 'UNIVAC');
  
  // Protect against a missing/empty config file crash
  if (!configfile || !configfile.success || typeof configfile.content !== 'string') return;
  
  let config = configfile.content;
  console.log("loadconfig() config=" + config);
  
  for (let column = 0; column < config.length; column += 4) {
    const code = config.substring(column, column + 2); 
    const value = config.substring(column + 2, column + 4);
    if (code.startsWith('W')) { register[code] = value; }
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
  const LOWER = 'abcdefghijklmnopqrstuvwxyz0123456789%()+,-:;=@[]^_{}';

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
  const LOWER = 'abcdefghijklmnopqrstuvwxyz0123456789%()+,-:;=@[]^_{}';

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

function calculateTargetSector(currentSector, dirChar, maxMapBounds) {
  if (!currentSector || currentSector.length < 2) return null;

  // Default to 8x8 ('Hh') if no W4 bound is provided
  if (!maxMapBounds || maxMapBounds.length !== 2) {
    maxMapBounds = 'Hh';
  }

  // Minimums are always 'A' (Vertical) and 'a' (Horizontal)
  let minY = 65; // 'A'
  let minX = 97; // 'a'
  
  // Maximums are derived from the W4 register
  let maxY = maxMapBounds.charCodeAt(0); // Uppercase Limit
  let maxX = maxMapBounds.charCodeAt(1); // Lowercase Limit

  // Extract current axes based on the [Uppercase][Lowercase] map scheme
  let yCode = currentSector.charCodeAt(0); // Vertical Row (A-Z)
  let xCode = currentSector.charCodeAt(1); // Horizontal Col (a-z)

  if (dirChar === 'N') {
    yCode -= 1;
  } else if (dirChar === 'S') {
    yCode += 1;
  } else if (dirChar === 'E') {
    xCode += 1;
  } else if (dirChar === 'W') {
    xCode -= 1;
  }

  // Wrap X-Axis (East/West scrolling)
  if (xCode < minX) {
    xCode = maxX;
  } else if (xCode > maxX) {
    xCode = minX;
  }

  // Wrap Y-Axis (North/South scrolling)
  if (yCode < minY) {
    yCode = maxY;
  } else if (yCode > maxY) {
    yCode = minY;
  }

  return String.fromCharCode(yCode) + String.fromCharCode(xCode);
}

function flipAvatarDirection(avatarStr, cmd) {
  if (!avatarStr || (cmd !== 'Ve' && cmd !== 'Vw')) return avatarStr;
  
  // Separate the base avatar from any pop-up item (^$$) so we don't accidentally corrupt the item ID
  var parts = avatarStr.split('-');
  var base = parts[0];
  var popup = parts.length > 1 ? '-' + parts.slice(1).join('-') : '';

  if (cmd === 'Ve') {
    // Left → Right: A→B, C→D, E→F, G→H, I→J, K→L, M→N, O→P
    base = base.replace(/[ACEGIKMO]/g, function(c) {
      return String.fromCharCode(c.charCodeAt(0) + 1);
    });
  } else {
    // Right → Left: B→A, D→C, F→E, H→G, J→I, L→K, N→M, P→O
    base = base.replace(/[BDFHJLNP]/g, function(c) {
      return String.fromCharCode(c.charCodeAt(0) - 1);
    });
  }
  return base + popup;
}

// ── Exports ───────────────────────────────────────────────────────────────────

UNIVAC.inject = inject;

module.exports = UNIVAC;
