
function UNIVAC(req, res, raw, driveName) {
	
  // not sure what all this data is being sent to UNIVAC for, it doesn't care who is logged in
  // it requires two fields of data, each a file on the RAM drive:
  // 1. the item file being processed, ie: a player-item like Sa44 (team S player a at z-location 44)
  // 2. the object with the punch code, ie: Yj44 = 'player sent 'use flagpole' which contains the code 'VtA1' for teleport to A1
  // 3. the UNIVAC should loop through the punch code and apply each code the the item it is processing
  //    so if the flagpole code is 'VtA1' it will teleport the play-item to A1
  // 4. when finished, the player-item file should be re-saved updating any changes to it's z-location or avatar
  //    the object is static and does not need to be changed, other than the 'data' field if it was udated during the execution 

  var session = getSession(req); 
  var cmd, cmdData, drive;

  if (driveName !== null && driveName !== undefined) {
    cmd     = String(raw).slice(0, 2);
    cmdData = String(raw).slice(2);
    drive   = String(driveName || '');
  }

  var result;
  var movementResponse = null;

  var isMove = ['Vn', 'Vs', 'Ve', 'Vw'].includes(cmd); 

  if (isMove) {
    var mvOwner = _playerOwnership[session];
    if (!mvOwner) { res.writeHead(204); return res.end(); }

    var mvDrive = mvOwner.drive;
    var mvItemId = mvOwner.itemId;
    var mvMapId = mvOwner.mapId;
    if (!isValidDriveName(mvDrive) || !drives[mvDrive]) { res.writeHead(204); return res.end(); }

    var mvDir = (mvMapId === '_L') ? 'w' : 'w/' + mvMapId;
    var manifest = _readManifest(mvDrive);
    var mvCurrentFile = null;
    var mvCurrentZ = -1;
    var mvPureAvatar = '';
    var prefix = (mvDir === 'w') ? 'w/' : mvDir + '/';

    for (var mvi = 0; mvi < manifest.length; mvi++) {
      var entry = manifest[mvi];
      if (entry.name.startsWith(prefix) && entry.name.indexOf('/', prefix.length) === -1) {
        var basename = entry.name.substring(prefix.length);
        
        // Match base structure: ID(2) + Z(2) + FullAvatar
        var mvMatch = basename.match(/^([A-Z][a-z])(\d{2})(.*)$/);
        if (mvMatch && mvMatch[1] === mvItemId && entry.session === session) {
          mvCurrentFile = basename;
          mvCurrentZ = parseInt(mvMatch[2], 10);
          
          // Step 2: Strip any stale Q-move suffix from the avatar part so old moves
          // cannot be re-applied on the next tick (root fix for movement ghosting).
          var fullAvatar = mvMatch[3];
          var qIdx = fullAvatar.indexOf('V');
          mvPureAvatar = (qIdx > -1) ? fullAvatar.substring(0, qIdx) : fullAvatar;
          break;
        }
      }
    }

    if (mvCurrentFile && mvCurrentZ >= 0) {
      var ptr = 0;
      var fullCmdString = String(raw);
      var finalZ = mvCurrentZ;
      var finalMap = mvMapId;
      var movesExecuted = '';
      var scrolled = false;

      var GFX_COLS = 8;
      var GFX_ROWS = 12;
      var GFX_TOTAL_TILES = GFX_COLS * GFX_ROWS;

      while (ptr < fullCmdString.length) {
        var chunk = fullCmdString.slice(ptr, ptr + 2);
        if (['Vn', 'Vs', 'Ve', 'Vw'].includes(chunk)) {
          var col = finalZ % GFX_COLS;
          var row = Math.floor(finalZ / GFX_COLS);
          
          var targetZ = finalZ;
          var isEdge = false;
          var dirChar = '';
          var moveBlocked = false;

          // Check destination tile (targetZ) and trigger scroll if landing on an edge.
          if (chunk === 'Vn') { 
              if (row === 0) { 
                  moveBlocked = true; // "Airlock" rule: Already on North edge, can't move North
              } else {
                  targetZ = finalZ - GFX_COLS;
                  if (Math.floor(targetZ / GFX_COLS) === 0) { isEdge = true; dirChar = 'N'; }
              }
          }
          else if (chunk === 'Vs') { 
              if (row === GFX_ROWS - 1) { 
                  moveBlocked = true; // "Airlock" rule: Already on South edge, can't move South
              } else {
                  targetZ = finalZ + GFX_COLS;
                  if (Math.floor(targetZ / GFX_COLS) === GFX_ROWS - 1) { isEdge = true; dirChar = 'S'; }
              }
          }
          else if (chunk === 'Ve') { 
              if (col === GFX_COLS - 1) { 
                  moveBlocked = true; // "Airlock" rule: Already on East edge, can't move East
              } else {
                  targetZ = finalZ + 1;
                  if (targetZ % GFX_COLS === GFX_COLS - 1) { isEdge = true; dirChar = 'E'; }
              }
          }
          else if (chunk === 'Vw') { 
              if (col === 0) { 
                  moveBlocked = true; // "Airlock" rule: Already on West edge, can't move West
              } else {
                  targetZ = finalZ - 1;
                  if (targetZ % GFX_COLS === 0) { isEdge = true; dirChar = 'W'; }
              }
          }

          if (moveBlocked) {
              console.log("Move blocked: " + mvItemId + " already standing on boundary for " + chunk);
              ptr += 2;
              continue; // Drop the illegal move entirely
          }

          if (isEdge) {
            var eLoad = fileLoad(mvDrive, '/', mvDir + '/e.txt', session);
            var exits = (eLoad.success && eLoad.content) ? eLoad.content : '';
            
            // Mathematically calculate the expected target sector
            var targetSector = calculateTargetSector(finalMap, dirChar);
            var nextMap = '..';

            if (targetSector) {
                // Loop through e.txt in 2-character chunks to see if target is permitted
                for (var ei = 0; ei < exits.length; ei += 2) {
                    if (exits.substring(ei, ei + 2) === targetSector) {
                        nextMap = targetSector;
                        break;
                    }
                }
            }
            
            if (nextMap && nextMap !== '..' && nextMap !== '  ' && nextMap !== '00') {
              // Apply wrap-around math to targetZ (the edge tile they stepped onto)
              if (chunk === 'Vn') { finalZ = targetZ + GFX_TOTAL_TILES - GFX_COLS; }
              else if (chunk === 'Vs') { finalZ = targetZ - GFX_TOTAL_TILES + GFX_COLS; }
              else if (chunk === 'Ve') { finalZ = targetZ - GFX_COLS + 1; }
              else if (chunk === 'Vw') { finalZ = targetZ + GFX_COLS - 1; }

              finalMap = nextMap;
              scrolled = true;
              movesExecuted += chunk;
              ptr += 2;
              break; 
            } else {
              ptr += 2; // Block the step because the edge leads nowhere (Acts as a wall)
            }
          } else {
            // Normal step inside the map bounds
            finalZ = targetZ;
            movesExecuted += chunk;
            ptr += 2;
          }
        } else {
          break; // Non-movement command
        }
      }

      if (movesExecuted.length > 0) {
        // ── Flip avatar to face the direction of the last east/west move ──────
        var lastEWCmd = null;
        for (var edi = movesExecuted.length - 2; edi >= 0; edi -= 2) {
          var ediCmd = movesExecuted.slice(edi, edi + 2);
          if (ediCmd === 'Ve' || ediCmd === 'Vw') { lastEWCmd = ediCmd; break; }
        }
        if (lastEWCmd) {
          mvPureAvatar = flipAvatarDirection(mvPureAvatar, lastEWCmd);
        }

        var newZStr = (finalZ < 10 ? '0' : '') + finalZ;
        var newDir = (finalMap === '_L') ? 'w' : 'w/' + finalMap;
        // Canonical filename: NO Q-move suffix appended.
        // Stale movement commands can never survive across ticks and be re-applied,
        // which is the root fix for the movement ghosting / snapback bug.
        var newFile = mvItemId + newZStr + mvPureAvatar;

        // Step 3: Load player inventory from the current player file.
        var mvFileLoad = fileLoad(mvDrive, '/', mvDir + '/' + mvCurrentFile, session);
        var mvFileContent = (mvFileLoad.success && mvFileLoad.content) ? mvFileLoad.content : '';

        // Step 4: Save inventory to the new path then delete the old file.
        var saveRes = fileSave(mvDrive, '/', newDir + '/' + newFile, mvFileContent, session, 'Move');
        if (saveRes.success) {
          var delRes = fileDelete(mvDrive, '/', mvDir + '/' + mvCurrentFile, session);
          if (!delRes.success) console.error("Delete of old player file failed:", mvDir + '/' + mvCurrentFile, delRes.error);
          if (scrolled) {
            _playerOwnership[session].mapId = finalMap;
            var pLoad = fileLoad(mvDrive, '/', 'p.txt', session);
            if (pLoad.success && pLoad.content) {
              var escId = mvItemId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              var pUpdated = pLoad.content.replace(
                new RegExp('^(' + escId + ')=.*$', 'm'),
                '$1=' + finalMap + mvPureAvatar
              );
              fileSave(mvDrive, '/', 'p.txt', pUpdated, session, 'Move');
            }
          }
        } else {
            console.error("Save failed during movement:", saveRes.error);
        }
      }

      if (ptr < fullCmdString.length && !scrolled) {
        cmd = fullCmdString.slice(ptr, ptr + 2);
        cmdData = fullCmdString.slice(ptr + 2);
      } else {
        // Step 5: Return RF immediately so the client receives authoritative state
        // in the same transaction — no separate cleanup pass needed.
        var mvRfPath = (finalMap === '_L') ? 'w' : 'w/' + finalMap;
        var mvRfList = fileList(mvDrive, mvRfPath, null, session);
        var mvRfItems = [];
        if (mvRfList.success && mvRfList.listing) {
          var mvRfFiles = mvRfList.listing.split('\n');
          for (var mvRfi = 0; mvRfi < mvRfFiles.length; mvRfi++) {
            var mvRfFile = mvRfFiles[mvRfi].trim();
            if (!mvRfFile) continue;
            var mvRfBase = mvRfFile.substring(mvRfFile.lastIndexOf('/') + 1);
            
            if (mvRfBase.length === 4) {
                // Dynamic Item: Sa33 (Now length 4)
                var mvRfItemMatch = mvRfBase.match(/^([A-Z][a-z]\d{2})$/);
                if (mvRfItemMatch) mvRfItems.push(mvRfItemMatch[1]);
            } else if (mvRfBase.length >= 8) {
                // Player: Sa33B0D0 (Now length 8+)
                var mvRfPlayerMatch = mvRfBase.match(/^([A-Z][a-z])(\d{2})(.+)$/);
                if (mvRfPlayerMatch) {
                    mvRfItems.push(mvRfPlayerMatch[1] + mvRfPlayerMatch[2] + mvRfPlayerMatch[3]);
                }
            }
            
          }
        }
        // Determine authoritative player z from the just-built sector list.
        var mvRfPlayerZ = '00';
        for (var mvRfi2 = 0; mvRfi2 < mvRfItems.length; mvRfi2++) {
          if (mvRfItems[mvRfi2].slice(0, 2) === mvItemId && /^\d{2}$/.test(mvRfItems[mvRfi2].slice(2, 4))) {
            mvRfPlayerZ = mvRfItems[mvRfi2].slice(2, 4);
            break;
          }
        }
        return respondRetro(res, 'RF' + finalMap + mvRfPlayerZ + mvRfItems.join(','));
      }
    }
  }

console.log("driveName="+driveName+" drive="+drive+" cmd="+cmd);

  switch (cmd) {

     case 'RF': {
      var rfDrive, rfMapId;
      var rfOwner = _playerOwnership[session];
      if (rfOwner && rfOwner.drive && rfOwner.mapId) {
        rfDrive = rfOwner.drive;
        rfMapId = rfOwner.mapId;
        // Safety fallback: strip any stale Q-move suffix that may have survived.
        var rfDir = (rfMapId === '_L') ? 'w' : 'w/' + rfMapId;
        var rfManifest = _readManifest(rfDrive);
        var rfPrefix = (rfDir === 'w') ? 'w/' : rfDir + '/';
        for (var mvi = 0; mvi < rfManifest.length; mvi++) {
          var entry = rfManifest[mvi];
          if (entry.session === session && entry.name.startsWith(rfPrefix) && entry.name.indexOf('/', rfPrefix.length) === -1) {
            var basename = entry.name.substring(rfPrefix.length);
            // Start searching for 'Q' AFTER the ID(2) and Z(2) to be safe
            var qIdx = basename.indexOf('Q', 4); 
            if (qIdx > -1) {
              var strippedName = basename.substring(0, qIdx);
              fileRename(rfDrive, '/', rfDir + '/' + basename, rfDir + '/' + strippedName, session);
            }
            break;
          }
        }
      } else {
        rfDrive = drive;
        rfMapId = '_L';
      }

      if (!isValidDriveName(rfDrive))  return respondRetro(res, 'XXInvalid  drive');
      if (!drives[rfDrive])            return respondRetro(res, 'XXDrive not found');

      var rfPath = (rfMapId === '_L') ? 'w' : 'w/' + rfMapId;

      var rfList = fileList(rfDrive, rfPath, null, session);
      var rfAllItems = [];

      if (rfList.success && rfList.listing) {
        var rfFiles = rfList.listing.split('\n');
        for (var rfi = 0; rfi < rfFiles.length; rfi++) {
          var rfFile = rfFiles[rfi].trim();
          if (!rfFile) continue;
          var rfBase = rfFile.substring(rfFile.lastIndexOf('/') + 1).replace('.txt', '');
          if (rfBase.length === 6) continue; // Skip Static Objects (Terrain, Signs)
          if (rfBase.length === 4 || rfBase.length >= 8) {
            rfAllItems.push(rfBase);
          }
        }
      }

      // Determine authoritative player z from the player's own item entry in the sector.
      // rfOwner.itemId (2 chars) matches the first 2 chars of each rfAllItems entry.
      // Items in rfAllItems are always built from regex-matched filenames guaranteeing \d{2} at [2-4].
      var rfPlayerZ = '00';
      if (rfOwner && rfOwner.itemId) {
        for (var rfi2 = 0; rfi2 < rfAllItems.length; rfi2++) {
          if (rfAllItems[rfi2].slice(0, 2) === rfOwner.itemId && /^\d{2}$/.test(rfAllItems[rfi2].slice(2, 4))) {
            rfPlayerZ = rfAllItems[rfi2].slice(2, 4);
            break;
          }
        }
     }

      // Response: RF + mapId(2) + playerZ(2) + items
      var rfResponse = 'RF'+rfMapId + rfPlayerZ + rfAllItems.join(',');
      logRequest(req, 'RF', rfDrive, rfMapId, session, { success: true, result: rfResponse });
      return respondRetro(res, rfResponse);
    }

    case 'Vl': {
      const mvOwner = _playerOwnership[session];
      if (!mvOwner) return respondRetro(res, 'XXNot logged in');

      const qDrive = mvOwner.drive;
      const pLoad = fileLoad(qDrive, '/', 'p.txt', session);
      if (!pLoad.success) return respondRetro(res, 'XXMap error');

      const mySector = mvOwner.mapId;
      const myTeam = mvOwner.itemId.charAt(0);
      const myTerrain = getSectorTerrain(qDrive, mySector);

      const visibleSectors = new Set();
      visibleSectors.add(mySector); // Always see your own sector

      const players = (pLoad.content || '').split('\n');
      const playerManifest = [];

      // Pass 1: Teammates always reveal their sectors
      players.forEach(line => {
        const m = line.match(/^([A-Z][a-z])=([A-Z][a-z0-9]{2})/);
        if (m) {
           if (m[1].charAt(0) === myTeam) visibleSectors.add(m[2]);
        }
      });

      // Pass 2: Calculate LOS for the observer based on Diamond Pattern
      // We check every potential sector on an 8x8 grid (A1-H8)
      for (let y = 65; y <= 72; y++) { // A-H
        for (let x = 1; x <= 8; x++) {
          let checkSec = String.fromCharCode(y) + x;
          if (visibleSectors.has(checkSec)) continue; // Already visible via teammate

          let tarTerrain = getSectorTerrain(qDrive, checkSec);
          if (canSeeTarget(mySector, checkSec, myTerrain, tarTerrain)) {
            visibleSectors.add(checkSec);
          }
        }
      }

      // Pass 3: Build the return string
      const filteredPlayers = [];
      players.forEach(line => {
        const m = line.match(/^([A-Z][a-z])=([A-Z][a-z0-9]{2})(.*)/);
        if (m) {
           const pID = m[1]; const pSec = m[2]; const pData = m[3];
           if (visibleSectors.has(pSec)) {
             // Return ID + Sector + Z + Data (stripped of movement Qs)
             let cleanData = pData.indexOf('Q') > -1 ? pData.substring(0, pData.indexOf('Q')) : pData;
             filteredPlayers.push(pID + pSec + cleanData);
           }
        }
      });
  
      const sectorList = Array.from(visibleSectors).join('');
      return respondRetro(res, 'Ql' + mySector + '00' + filteredPlayers.join(',') + ':' + sectorList);
    }

    case 'ST': {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
      let token = '';
      for (let i = 0; i < 8; i++) {
        token += chars.charAt(Math.floor(Math.random() * chars.length));
      }

      const ip = (req.headers['x-forwarded-for'] || (req.socket && req.socket.remoteAddress) || 'unknown')
        .replace('::ffff:', '').replace('::1', 'local').slice(0, 15);

      // Use the memory drive to track sessions
      fileAppendJSON(drive, '/', 's.txt', { t: token, ip: ip, ts: Date.now() }, 'system', 'system');

      // Explicitly allow CORS and return plain text
      res.writeHead(200, { 
        'Content-Type': 'text/plain',
        'Access-Control-Allow-Origin': '*' 
      });
      return res.end("ST" + token);
    }
      
    case 'GS': {
      // Game State: return compact game state: MMSSmapname
      var gsDrive = drive;

      // Validate drive name: safe filesystem characters only
      if (!isValidDriveName(gsDrive)) {
        return respondRetro(res, 'XXInvalid drive name');
      }

      // Check drive is mounted
      if (!drives[gsDrive]) {
        return respondRetro(res, 'XXDrive not found');
      }

      // Check world exists (p.txt must be present)
      var gsLoad = fileLoad(gsDrive, '/', 'p.txt', session);
      if (!gsLoad.success) {
        return respondRetro(res, 'XWNo game world');
      }

      // Return compact game state: MMSSmapname
      var gsResponse = buildGameState();
      logRequest(req, 'GS', gsDrive, '', session, { success: true, result: gsResponse });
      return respondRetro(res, gsResponse);
    }

    case 'JG': {
      // Join Game (legacy): claim a player slot in the lobby (w/ directory).
      // Scans the lobby for a file starting with the player item code (e.g. "Sa").
      // If the slot exists and is unclaimed (4-char base name, e.g. "Sa33.txt"),
      // renames it to append the player's avatar (e.g. "Sa33B0D0.txt").
      // Parameters (legacy): d=drive, id=itemId (e.g. "Sa"), av=avatar (e.g. "B0D0")
      var jgDrive  = drive;
      var jgItemId = legacyParam('id');
      var jgAvatar = legacyParam('av');

      if (!isValidDriveName(jgDrive))              return respondRetro(res, 'XXInvalid drive');
      if (!/^[A-Z][a-z]$/.test(jgItemId))          return respondRetro(res, 'XXInvalid item ID');
      if (!/^[A-Za-z0-9]{2,20}$/.test(jgAvatar))   return respondRetro(res, 'XXInvalid avatar');
      if (!drives[jgDrive])                         return respondRetro(res, 'XXDrive not found');

      // Scan lobby directory (w/) for a file starting with this itemId
      var jgScanResult = fileList(jgDrive, 'w', null, session);
      var jgSlotFile = null;
      if (jgScanResult.success && jgScanResult.listing) {
        var jgScanFiles = jgScanResult.listing.split('\n');
        for (var jgSi = 0; jgSi < jgScanFiles.length; jgSi++) {
          var jgSf = jgScanFiles[jgSi].trim();
          if (!jgSf) continue;
          var jgSb = jgSf.substring(jgSf.lastIndexOf('/') + 1);
          if (jgSb.indexOf(jgItemId) === 0) {
            jgSlotFile = jgSb;
            break;
          }
        }
      }

      if (!jgSlotFile) return respondRetro(res, 'XXNot a valid player slot');

      // Base name = filename without .txt extension (e.g. "Sa33" from "Sa33.txt")
      // Unclaimed slot files have exactly 4 chars: 2-char itemId + 2-digit z-position
      var jgBase = jgSlotFile.replace(/\.txt$/i, '');
      if (jgBase.length > 4) return respondRetro(res, 'XXSlot already in use');
      if (jgBase.length < 4) return respondRetro(res, 'XXNot a valid player slot');

      // Rename: append the avatar string to claim the slot (e.g. "Sa33B0D0.txt")
      var jgZ = jgBase.substring(2); // 2-digit z-position encoded in slot filename
      var jgNewName = jgBase + jgAvatar;
      var jgRename = fileRename(jgDrive, '/', 'w/' + jgSlotFile, 'w/' + jgNewName, session);
      if (!jgRename.success) return respondRetro(res, 'XXFailed to claim slot: ' + jgRename.error);

      // Record session ownership so future move/SG commands can be authorised
      _playerOwnership[session] = { itemId: jgItemId, mapId: '_L', drive: jgDrive };

      // Update p.txt: mark slot as claimed with lobby map + avatar
      var jgPLoad = fileLoad(jgDrive, '/', 'p.txt', session);
      if (jgPLoad.success) {
        var jgEscId = jgItemId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        var jgPUpdated = jgPLoad.content.replace(
          new RegExp('^(' + jgEscId + ')=.*$', 'm'),
          '$1=_L' + jgAvatar
        );
        fileSave(jgDrive, '/', 'p.txt', jgPUpdated, session, 'JG');
      }

      // Log join event to game console
      fileAppendJSON(jgDrive, '/', 'c.txt', 'JG ' + jgItemId + ' ' + jgAvatar, session, 'JG');

      logRequest(req, 'JG', jgDrive, jgItemId, session, { success: true });
      return respondRetro(res, 'OK' + jgItemId + jgZ);
    }

    case 'SG': {
      // Start Game: move the player from the lobby (w/ directory) to a world map.
      // Finds the claimed lobby slot file in w/ (e.g. "Sa33B0D0.txt"), creates an
      // active player file in w/[mapId]/, then removes the lobby slot file.
      // New protocol body data: itemId(2) + avatar
      // Legacy parameters: d=drive, id=itemId (e.g. "Sa"), av=avatar (e.g. "B1D0C2")
      var sgDrive  = drive;
      var sgItemId, sgAvatar;
      if (driveName !== null && driveName !== undefined) {
        // New protocol: cmdData = itemId(2) + avatar
        sgItemId = cmdData.slice(0, 2);
        sgAvatar = cmdData.slice(2);
      } else {
        sgItemId = legacyParam('id');
        sgAvatar = legacyParam('av');
      }

      if (!isValidDriveName(sgDrive)) return respondRetro(res, 'XXInvalid drive');
      if (!/^[A-Z][a-z]$/.test(sgItemId)) return respondRetro(res, 'XXInvalid item ID');
      if (!/^[A-Za-z0-9]{2,20}$/.test(sgAvatar)) return respondRetro(res, 'XXInvalid avatar');
      if (!drives[sgDrive]) return respondRetro(res, 'XXDrive not found');

      // Verify session owns this player slot (set during Qg/JG)
      var sgOwner = _playerOwnership[session];
      if (!sgOwner || sgOwner.itemId !== sgItemId)           return respondRetro(res, 'XXUnauthorized');

      // Find the claimed lobby slot file in w/ for this player (base name > 4 chars)
      var sgLobbyList = fileList(sgDrive, 'w', null, session);
      var sgLobbyBase = null;
      var sgZLocation = null;
      if (sgLobbyList.success && sgLobbyList.listing) {
        var sgLobbyFiles = sgLobbyList.listing.split('\n');
        for (var sgi = 0; sgi < sgLobbyFiles.length; sgi++) {
          var sgLF = sgLobbyFiles[sgi].trim();
          if (!sgLF) continue;
          var sgLB = sgLF.substring(sgLF.lastIndexOf('/') + 1);
          var sgSlotMatch = sgLB.match(/^([A-Z][a-z])(\d{2})[A-Za-z0-9]+\.txt$/);
          if (sgSlotMatch && sgSlotMatch[1] === sgItemId) {
            sgLobbyBase = sgLB;
            sgZLocation = sgSlotMatch[2];
            break;
          }
        }
      }

      if (!sgLobbyBase) return respondRetro(res, 'XXPlayer not found in lobby');

      // Determine target world map: Team S → A1, Team T → H8
      var sgMapId = (sgItemId.charAt(0) === 'S') ? 'A1' : 'H8';

      // Create the active player file in the world map directory
      var sgWorldFile = 'w/' + sgMapId + '/' + sgItemId + sgZLocation + sgAvatar;
      var sgWorldSave = fileSave(sgDrive, '/', sgWorldFile, '', session, 'SG');
      if (!sgWorldSave.success) return respondRetro(res, 'XXFailed to create world player: ' + sgWorldSave.error);

      // Remove the lobby slot file; roll back world file if deletion fails
      var sgLobbyDelete = fileDelete(sgDrive, '/', 'w/' + sgLobbyBase, session);
      if (!sgLobbyDelete.success) {
        var sgRollback = fileDelete(sgDrive, '/', sgWorldFile, session);
        var rollbackMsg = sgRollback.success ? ' (world file rolled back)' : ' (rollback also failed - state inconsistent)';
        return respondRetro(res, 'XXFailed to remove lobby slot: ' + sgLobbyDelete.error + rollbackMsg);
      }

      // Update player ownership to reflect the world map
      _playerOwnership[session] = { itemId: sgItemId, mapId: sgMapId, drive: sgDrive };

      // Update p.txt to reflect player's new map sector
      var sgPLoad = fileLoad(sgDrive, '/', 'p.txt', session);
      if (sgPLoad.success) {
        var sgEscId = sgItemId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        var sgPUpdated = sgPLoad.content.replace(
          new RegExp('^(' + sgEscId + ')=.*$', 'm'),
          '$1=' + sgMapId + sgAvatar
        );
        fileSave(sgDrive, '/', 'p.txt', sgPUpdated, session, 'SG');
      }

      logRequest(req, 'SG', sgDrive, sgItemId, session, { success: true });
      return respondRetro(res, 'OK' + sgItemId);
    }

    case 'Vg': {
      var qgDrive  = drive;
      var qgItemId = cmdData.slice(0, 2);
      var qgZ      = cmdData.slice(2, 4);
      var qgAvatar = cmdData.slice(4);

      if (!isValidDriveName(qgDrive))            return respondRetro(res, 'XXInvalid drive');
      if (!/^[A-Z][a-z]$/.test(qgItemId))        return respondRetro(res, 'XXInvalid item ID');
      if (!/^\d{2}$/.test(qgZ))                  return respondRetro(res, 'XXInvalid z-location');
      if (!/^[A-Za-z0-9]{2,20}$/.test(qgAvatar)) return respondRetro(res, 'XXInvalid avatar');
      if (!drives[qgDrive])                       return respondRetro(res, 'XXDrive not found');

      // Dispatch by item type
      var qgItemType = qgItemId.charAt(0);
      switch (qgItemType) {
        case 'S':
        case 'T': {
          // Player hat items: claim the slot and join the game
          // Scan lobby directory (w/) for the matching unclaimed slot file
          var manifest = _readManifest(qgDrive);
          var qgScanResult = fileList(qgDrive, 'w', null, session);
          var qgSlotFile = null;
          if (qgScanResult.success && qgScanResult.listing) {
            var qgScanFiles = qgScanResult.listing.split('\n');
            for (var qgSi = 0; qgSi < qgScanFiles.length; qgSi++) {
              var qgSf = qgScanFiles[qgSi].trim();
              if (!qgSf) continue;
              var qgSb = qgSf.substring(qgSf.lastIndexOf('/') + 1);
              if (qgSb.indexOf(qgItemId + qgZ) === 0) { // Match both ID and Z
                qgSlotFile = qgSb;
                break;
              }
            }
          }

          if (!qgSlotFile) return respondRetro(res, 'XXItem not found');

          // Verify the slot is unclaimed (base name = exactly 4 chars: itemId + z)
          var qgBase = qgSlotFile;
          if (qgBase.length > 4) return respondRetro(res, 'XXSlot already in use');
          if (qgBase.length < 4) return respondRetro(res, 'XXNot a valid player slot');

          var canonical = resolveName('w', qgSlotFile);
          var entry = manifest.find(e => e.name === canonical);
          if (entry && entry.session && entry.session !== '') {
            return respondRetro(res, 'XXItem already claimed');
          }

          // Rename: Sa33.txt → Sa33B0D0La.txt (append avatar + player hat La)
          var hat='';
          if (qgItemType=="S") { hat="J0"; }
          if (qgItemType=="T") { hat="J1"; }
          var qgNewName = qgItemId + qgZ + qgAvatar + hat;
          var qgRename = fileRename(qgDrive, '/', 'w/' + qgSlotFile, 'w/' + qgNewName, session);

          if (!qgRename.success) return respondRetro(res, 'XXFailed to claim slot: ' + qgRename.error);

          // Record session ownership so future move commands can be authorised
          _playerOwnership[session] = { itemId: qgItemId, mapId: '_L', drive: qgDrive };

          // Update p.txt: mark slot as claimed with lobby map + avatar + hat
          var qgPLoad = fileLoad(qgDrive, '/', 'p.txt', session);
          if (qgPLoad.success) {
            var qgEscId = qgItemId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            
            if (hat != "") {
              var qgPUpdated = qgPLoad.content.replace(
                new RegExp('^(' + qgEscId + ')=.*$', 'm'),
                '$1=_L' + qgAvatar + hat
              );
            }
            fileSave(qgDrive, '/', 'p.txt', qgPUpdated, session, 'Qg');
          }

          // Log join event to game console
          fileAppendJSON(qgDrive, '/', 'c.txt', 'Vg ' + qgItemId + ' ' + qgAvatar, session, 'Vg');

          logRequest(req, 'Vg', qgDrive, qgItemId, session, { success: true });
          return respondRetro(res, 'OK' + qgItemId + qgZ);
        }
        default:
          return respondRetro(res, 'XXUnknown item type for Vg');
      }
    }

    case 'Vu': {
      var objToUse = cmdData.slice(0, 2);
      var mvOwner = _playerOwnership[session];
      if (!mvOwner) return respondRetro(res, 'XXNot logged in');
      
      var qDrive = mvOwner.drive;
      var qItemId = mvOwner.itemId; 
      var qMapId = mvOwner.mapId;

      // Define the path based on current location
      var qPath = (qMapId === '_L') ? 'w' : 'w/' + qMapId;

      // 2. Determine Destination
      var destSector = (qItemId.charAt(0) === 'S') ? 'A1' : 'H8';

      // 3. Find Player File (Using robust iteration instead of fragile pattern matching)
      var pList = fileList(qDrive, qPath, null, session);
      var currentFile = null;
      var fileNameOnly = null;
      var avatarPart = '';

      if (pList.success && pList.listing) {
        var pFiles = pList.listing.split('\n');
        for (var i = 0; i < pFiles.length; i++) {
          var pf = pFiles[i].trim();
          if (!pf) continue;
          
          var pb = pf.substring(pf.lastIndexOf('/') + 1);
          
          // Match standard player file structure: ID(2) + Z(2 digits) + Avatar(var) + .txt
          var match = pb.match(/^([A-Z][a-z])(\d{2})(.*)$/);
          if (match && match[1] === qItemId) {
            currentFile = pf;        // e.g., "w/A1/Sa33B0D0"
            fileNameOnly = pb;       // e.g., "Sa33B0D0"
            avatarPart = match[3];   // e.g., "B0D0"
            break;
          }
        }
      }

      // If no match was found, return the error
      if (!currentFile) {
          return respondRetro(res, 'XXPlayer file not found');
      }
      
      // 4. Relocate Player File (Respecting the _L special path)
      var targetDir = (destSector === '_L') ? 'w' : 'w/' + destSector;
      var destPath = targetDir + '/' + fileNameOnly;
      
      var moveResult = fileRename(qDrive, '/', currentFile, destPath, session);

      if (moveResult.success) {
        _playerOwnership[session].mapId = destSector;

        // Update p.txt
        var pLoad = fileLoad(qDrive, '/', 'p.txt', session);
        if (pLoad.success && pLoad.content) {
          var escId = qItemId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          
          var pUpdated = pLoad.content.replace(
            new RegExp('^(' + escId + ')=.*$', 'm'),
            '$1=' + destSector + avatarPart // Safely appends the clean avatar string
          );
          fileSave(qDrive, '/', 'p.txt', pUpdated, session, 'Qu');
        }

        logRequest(req, 'Vu', qDrive, qItemId + ' to ' + destSector, session, { success: true });
        return respondRetro(res, 'Mp' + destSector);
      } else {
        return respondRetro(res, 'XXMove failed: ' + moveResult.error);
      }

    
      if (!mvCurrentFile || mvCurrentZ < 0) {
        // Player file not found or session mismatch
        res.writeHead(204);
        return res.end();
      }}

    default:
      result = { success: false, error: 'unknown command: ' + cmd };
      logRequest(req, cmd || '(unknown)', '', '', session, result);
      return respondRetro(res, 'XXUnknown command');
  }
}
