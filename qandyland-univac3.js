
function plugboard(req, stacker, plugs, drive, session) {
  let output = "";
  if (plugs != "RF") { console.log(plugs+" "+drive+" "+session); }
  function runtape(code) {
    if (code) {
      let uResult = UNIVAC(drive, player.fullPath, "RAM:"+code, session);
      if (uResult) {
        player.map      = uResult.sector;
        player.z        = uResult.z;
        player.avatar   = uResult.avatar;
        if (uResult.playerid) player.pubId = uResult.playerid;
        if (uResult.item) player.item  = uResult.item + player.pubId; // e.g. "ZaAaAa"
        player.fullPath = uResult.fullPath;
        output += uResult.output;
        // this get overwritten at line 1141
      }
    }
  }
  var player = playerIndex.get(session);
  
  if (!player) {
    player = {
      drive: drive,
      fullPath: null,
      map: "A1",
      z: 0,
      item: "",
      avatar: "",
      pubId: ""
    };
  } else {
    if (!player.map) player.map = "A1";
    if (player.z == null) player.z = 0;
    if (!player.item) player.item = "";
    if (!player.avatar) player.avatar = "";
  }

  var refresh = true;
  let column = 0; 
  
  let tape="";  
  while (column < plugs.length) {

    let code = plugs.slice(column, column + 2);
    column += 2; 

    switch (code) {
      case 'Vn':
      case 'Vs':
      case 'Ve':
      case 'Vw':
        if (!player.item || player.item === "") { break; }
        tape += code;
        break;
        
      case 'Vd': 
        if (!player.item || player.item === "") { break; }
        let item = plugs.slice(column, column + 2); column += 2;
        tape += code+item;
        break;      

      case 'OD':
        let objfile = null; 
        let objid = plugs.slice(column, column + 2);
        let objz  = plugs.slice(column + 2, column + 4);
        column += 4;
        
        if (player.item === 'Za') {
        	 if (objid.charAt(0) === 'S') {
        	 	player.z = objz;
        	 }
        }

        let pZStr = (player.z < 10 ? '0' : '') + player.z;

        let odSearchPattern = 'w/' + player.map + '/' + objid + pZStr + '??';
        let odFilesResponse = fileSearch(drive, odSearchPattern);
        
        if (odFilesResponse.success && odFilesResponse.results.length > 0) {
          for (let i = 0; i < odFilesResponse.results.length; i++) {
            let entryName = odFilesResponse.results[i].name;
            let matchedBase = entryName.substring(entryName.lastIndexOf('/') + 1);
            if (matchedBase.length === 6) {
              objfile = entryName;
              break; 
            }
          }
        }

        if (objfile != null) {
          console.log("UNIVAC(" + drive + ", " + player.fullPath + ", " + objfile + ")");
          if (typeof UNIVAC === 'function') {
            let uResult = UNIVAC(drive, player.fullPath, objfile, session);
            if (uResult) {
              player.map = uResult.sector;
              player.z = uResult.z;
              player.avatar = uResult.avatar;
              if (uResult.playerid) player.pubId = uResult.playerid;
              if (uResult.item) player.item = uResult.item + player.pubId;
              
              player.fullPath = uResult.fullPath;
              output += uResult.output;
            }
            console.log("###1205### fullPath="+player.fullPath+" objfile="+objfile);
            // ###1196### fullPath=w/H1/Sa44AaAaAaAa objfile=w/H1/Sa66Za
          }
        }
        break;
                
      case 'ID':
        let itemId = plugs.slice(column, column + 2);
        let itemZ  = plugs.slice(column + 2, column + 4);
        column += 4;
        
        let searchPrefix = 'w/' + player.map + '/' + itemId;
        let filesResponse = fileSearch(drive, searchPrefix + '*');
        
        if (filesResponse.success && filesResponse.results.length > 0) {
          let matchedPath = null;
          let matchedBase = null;
          
          for (let i = 0; i < filesResponse.results.length; i++) {
            let base = filesResponse.results[i].name.split('/').pop();
            if (base.substring(2, 4) === itemZ) {
              matchedPath = filesResponse.results[i].name;
              matchedBase = base;
              break;
            }
          }

          if (matchedPath) {
            let matchedPubId = matchedBase.length >= 8 ? matchedBase.substring(4, 8) : "";
            let matchedFullId = matchedPubId ? itemId + matchedPubId : itemId;

            // If the player clicks their own item, send inventory
            if (matchedFullId === player.item) {
              let invLoad = fileLoad(drive, '/', player.fullPath, session);
              let inventoryData = (invLoad.success && invLoad.content) ? invLoad.content : '';
              output += "S^Vi" + inventoryData + "^S";
              break; 
            }
            
            // ── GHOST PLAYER CREATION TRIGGER ────────────────────────────────
            if (itemId >= 'Sa' && itemId <= 'Sd') {
              if (!player.item || player.item === "") {
                // The user clicked a hat but doesn't exist yet! 
                // Run your custom initialization punch code:
                console.log("###1268###");
                let initTape = "XnXjVaB1D3J0++XnXr++LaZaZaZaZaZaZaZaZaWm99++VtA1ZeVuVa++Xc";
                runtape(initTape);
                break; // Stop processing so we don't accidentally try to pick up the item
              }
            }
            
            // Pick up standard dynamic items
            if (itemId >= 'Aa' && itemId < 'Qa') { tape += 'XnVd'+itemId; }
          }
        }
        break;                  

      case 'ST':
        if (session && playerIndex.has(session)) {
          output += "ST" + session;
        } else {
          let chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
          let pubId = '';
          for (let i = 0; i < 4; i++) pubId += chars.charAt(Math.floor(Math.random() * chars.length));

          let secret = Math.random().toString(36).substring(2, 10);
          session = secret;

          player = {
            drive:    drive,
            fullPath: null,
            map:      "A1",
            item:     "",
            z:        0,
            avatar:   "",
            pubId:    pubId
          };
          playerIndex.set(session, player);

          // Create the ghost player file with Za (empty slot) as the item
          runtape("XaZa");
          player.item = 'Za'; // mark slot as created so item guards pass
          let numericZ = parseInt(player.z, 10) || 0;
          // overwrite UNIVAC output as client has no session token to process it yet
          output += "ST" + session;
          var refresh=false;
        }
        column = plugs.length;
        break;        

      case 'VA':
        let vaAvatar = "";
        let vaTermIdx = plugs.indexOf('--', column);
        if (vaTermIdx !== -1) {
          vaAvatar = plugs.slice(column, vaTermIdx);
          column = vaTermIdx + 2;
        } else {
          vaAvatar = plugs.slice(column);
          column = plugs.length;
        }

        if (!player.item || player.item === "") break; 
        if (vaAvatar !== player.avatar) { runtape("Va" + vaAvatar + "--"); }
        break;                

      case 'OO':
        var refresh=false;
        column = plugs.length; 
        break;        
    }
  }

  if (session) { playerIndex.set(session, player); }

  if (refresh) {
    let list = fileList(drive, 'w/' + player.map, null, session);
    let items = [];
    if (list.success && list.listing) {
      let files = list.listing.split(' ');
      files.forEach(f => {
        if (f.length > 1) { if (f.length !== 6) { items.push(f); }}
      });
    }
    let numericZ = parseInt(player.z, 10) || 0;
    let z = numericZ < 0 ? "00" : (numericZ < 10 ? "0" + numericZ : String(numericZ));

    let pItemId = player.item ? player.item.substring(0, 2) : "Za";
    let pPubId = player.pubId ? player.pubId : "0000";
    if (pPubId.length < 4) pPubId = pPubId.padEnd(4, '0');
    
    output = "PI" + pItemId + z + pPubId + output;
    output += "RF" + player.map + z + items.join(',');
  }
  return respondRetro(stacker, output, session);
}

// ── UNIVAC ────────────────────────────────────────────────────────────────────
//   ie: UNIVAC(capflag.gfx, w/F2/Sc44B2D0, w/F2/Yj44Sa)

function UNIVAC(driveName, itemfile, objfile, sessionToken) {
  sessionToken = sessionToken || 'UNIVAC';

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

  // ── Register Math Helpers ─────────────────────────────────────────────────
  // Parses a 2-char code to find its experiential/numeric value
  function parseRegValue(valStr) {
    if (!valStr || valStr.length !== 2) return 1; // Default to 1

    if (/^[A-Z]/.test(valStr)) {
      var c2 = valStr.charAt(1);
      // If it's a numeral, add the numeral's value
      if (/[0-9]/.test(c2)) return parseInt(c2, 10);
      // If it's a letter, use alphabet position: a=1, b=2, etc.
      if (/[a-z]/.test(c2)) return c2.charCodeAt(0) - 96; 
    }
    
    // Explicit standard numeric code protection (e.g., "05", "10")
    if (/^\d{2}$/.test(valStr)) return parseInt(valStr, 10);

    return 1;
  }

  function plus(reg, valStr) {
    var amount = parseRegValue(valStr);
    if (amount <= 0) return; // Ignores commands that evaluate to 0

    var memRegex = new RegExp(reg + '(\\d{2})');
    var match = state.content.match(memRegex);

    if (match) {
      var count = parseInt(match[1], 10) + amount;
      if (count > 99) count = 99; // Hard cap
      var countStr = (count < 10 ? '0' : '') + count;
      state.content = state.content.replace(match[0], reg + countStr);
    } else {
      // Create new stackable register
      var count = amount > 99 ? 99 : amount;
      var countStr = (count < 10 ? '0' : '') + count;
      state.content += reg + countStr;
    }
  }

  function minus(reg, valStr) {
    var amount = parseRegValue(valStr);
    if (amount <= 0) return; // Ignores commands that evaluate to 0

    var memRegex = new RegExp(reg + '(\\d{2})');
    var match = state.content.match(memRegex);

    if (match) {
      var count = parseInt(match[1], 10) - amount;
      if (count > 0) {
        var countStr = (count < 10 ? '0' : '') + count;
        state.content = state.content.replace(match[0], reg + countStr);
      } else {
        // Remove the register entirely if it drops to 0 or below
        state.content = state.content.replace(match[0], '');
      }
    }
  }

  // ── 3. Process punch code ─────────────────────────────────────────────────
  var gateopen = true; 
  var ifnot = false;   

  while (column < tape.length) {
    var word = tape.slice(column, column + 2);
    column += 2;
    
    switch (word) {
      case 'Xn': ifnot = true; break;   
      case 'Xc': ifnot = false; break;  

      // ── Xa — Claim player-item / assign team ─────────────────────────────
      case 'Xa': {
        var newId = tape.slice(column, column + 2); column += 2;

        // Parse the inventory string up to the '--' terminator
        var inventoryString = "";
        var endCol = tape.indexOf('--', column);
        if (endCol !== -1) {
          inventoryString = tape.slice(column, endCol);
          column = endCol + 2;
        } else {
          // Graceful fallback if terminator is somehow missing: 
          // consume the rest of the tape
          inventoryString = tape.slice(column);
          column = tape.length; 
        }

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
          state.content = inventoryString; // Initialize inventory from punch code
        } else if (state.id === 'Za') {
          state.id = newId;
          state.avatar = '';   
          state.content = inventoryString; // Initialize inventory from punch code
          output += "S^Va--^S";
        } else {
          console.log("UNIVAC() Xa: team already set to " + state.id + ", ignoring " + newId);
        }
        break;
      }

      // ── Va — Set avatar string ────────────────────────────────────────────────
      case 'Va': {
        if (!state.playerid) {
          // Guard: no player ID yet, avatar cannot be set
          var endCol = tape.indexOf('--', column);
          if (endCol !== -1) column = endCol + 2;
          else column += 2;
          break;
        }
        var endCol = tape.indexOf('--', column);
        if (endCol !== -1) {
          state.avatar = tape.slice(column, endCol);
          column = endCol + 2;
        } else {
          state.avatar = tape.slice(column, column + 2);
          column += 2;
        }
        break;
      }

      case 'Vm': { 
        var noun = tape.slice(column, column + 2); column += 2;
        var zToken = tape.slice(column, column + 2); column += 2;
        var resolvedZ = state.zStr; 
        if (/^\d{2}$/.test(zToken)) {
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
          _deps.fileDelete(driveName, '/', targetPath, sessionToken);
          console.log("UNIVAC() Vm: removed " + targetPath);
        } else {
          let ts = 'X' + _deps.futureTimestamp(1); 
          _deps.fileSave(driveName, '/', targetPath, '', sessionToken, sessionToken, ts);
          console.log("UNIVAC() Vm: created " + targetPath);
        }
        break;
      }

      case 'Xr': { 
        // Read the first argument (Target or Register)
        var noun1 = tape.slice(column, column + 2); column += 2; 
        var noun2 = tape.slice(column, column + 2); column += 2;
        state.content = state.content.replace(noun1, noun2);
        break;
      }      

      case 'Vr': { 
        var noun = tape.slice(column, column + 2); column += 2;
        var zloc = tape.slice(column, column + 2); column += 2;
        var zNum = (zloc < 10 ? '0' : '') + zloc;
        output += "S^Vr" + noun + zNum + "^S";
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
        // verb teleport 
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

      case 'S^': {
        // Find the matching ^S terminator
        var endCol = tape.indexOf('^S', column);
        if (endCol !== -1) {
          // Slice the content between S^ and ^S and add to output
          output += 'S^'+tape.slice(column, endCol)+'^S';
          column = endCol + 2;
        } else {
          output += tape.slice(column);
          column = tape.length;
        }
        break;
      }
      
      default: {
        console.log('UNIVAC: unknown word [' + word + '] at column ' + (column - 2) + ' – abort script');
        break;
      }
    }
    
  }
  
  if (tape) { runtape(tape); tape=""; }  

  // ── 4. Save and Cleanup ───────────────────────────────────────────────────
  var newPath = 'w/' + state.sector + '/' + state.id + state.zStr + state.playerid + state.avatar;

  console.log("###561### newPath="+newPath+" state.content="+state.content);  
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

