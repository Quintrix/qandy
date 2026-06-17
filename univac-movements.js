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

