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

  // Mutable working state – will be committed at the end if anything changed
  var state = {
    sector  : item.sector,
    z       : item.z,
    zStr    : item.zStr,
    avatar  : item.avatar,
    content : itemLoad.content || '',   // ← the card's data, loaded once and reused
    dirty   : false                     // set to true whenever state is mutated
  };
  
  // ── 2. Load the object's punch code ──────────────────────────────────────

  var objLoad = _deps.fileLoad(driveName, '/', objfile, 'UNIVAC');
  if (!objLoad.success || !objLoad.content) {
    console.error('UNIVAC: cannot load object file: ' + objfile);
    return;
  }
  console.log("object punch code = " + objLoad.content);

  var tape   = objLoad.content;   // e.g. 'XiLaVtA1ZeXcXiLbVtH8ZeXc'
  var column = 0;                 // read-head position on the tape

  // ── 3. Process punch code ─────────────────────────────────────────────────

  var gateopen = true; // logic gate, if gate gets closed codes are ignored until 'Xc' clears all gates  
  var ifnot = false;   // inverses a code: if in inventory becomes if not in inventory, plus becomes minus, add becomes remove, etc

  while (column < tape.length) {
    var word = tape.slice(column, column + 2);
    column += 2;
    
    switch (word) {
      case 'Xn': ifnot = true; break;
      case 'Xc': ifnot = false; break;
 
      case 'Xr': {
      console.log("### 170 ###");
        var noun = tape.slice(column, column + 2); column += 2;

        // Delineate Inventory (Aa-Pz) vs Memory (Qa-Zz)
        var isInventory = (noun >= 'Aa' && noun <= 'Pz');
        var isMemory    = (noun >= 'Qa' && noun <= 'Zz');
        
        // Track content change to determine if we need to write to disk
        var oldContent = state.content;

        if (ifnot) {
        	 console.log("### 181 ###");
          // ── ADD ITEM ───────────────────────────────────────────────────────
          if (isInventory) {
            state.content = state.content.replace('Za', noun);
            console.log("### 184 ### "+state.content);
          } 
          else if (isMemory) {
          	console.log("### 187 ###");
            // Check if memory stack already exists (e.g. 'Wm01')
            var memAddRegex = new RegExp(noun + '(\\d{2})');
            var matchAdd = state.content.match(memAddRegex);
            
            if (matchAdd) {
              console.log("### 193 ###");
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

        // Flag state as dirty if any mutation actually occurred
        if (state.content !== oldContent) {
          state.dirty = true;
        }
        
        break;
      }
      
      case 'Xi': {
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
      // Save to new location first, utilizing the pre-loaded state.content
      var saveRes = _deps.fileSave(driveName, '/', newPath, state.content, 'UNIVAC', 'UNIVAC');
      
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
