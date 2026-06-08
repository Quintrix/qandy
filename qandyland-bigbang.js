// ── bigbang() – GFX World Generation ─────────────────────────────────────────
//
// Creates a multiplayer world on the server by reading capflag.gfx from the
// server's working directory.  The client is never trusted for map data.
//
// bigbang(driveName, session)
//   driveName – drive name to create world on (e.g. "gfx")
//   session   – caller session token
//
// .gfx file format (one sector per line):
//   [sector]=[96 tiles][valid exits].[item id][item z][item data]...
//   sector  – upper-case letter + lower-case letter or numeral (e.g. A1, _L)
//   tiles   – 2-char code each, 96 tiles = 192 chars
//   exits   – 2-char sector codes for allowed movement (after tile chars)
//   .       – separator before item list
//   items   – 6-char entries: 2=id, 2=z-location, 2=data
//
// A system file will always be 1 character 
// A static object filename will always be 6 characters (item z-location data)
// A dynamic item filename will always be 4 characters (item z-location)
// A player item will always be at least 8 characters (item a-location face body)
//


function bigbang(driveName, session) {

  if (!drives[driveName]) return { success: false, error: 'drive not mounted: ' + driveName };

  // Load capflag.gfx from the server's working directory
  var gfxPath = path.join(process.cwd(), sysopGfx);
  var raw;
  try {
    raw = fs.readFileSync(gfxPath, 'utf8');
  } catch (e) {
    return { success: false, error: 'cannot read ' + sysopGfx + ': ' + (e.message || String(e)) };
  }

  var lines = raw.split('\n');
  var sectors = [];   // { id, exits, items[] }
  var playerCodes = [];
  var seenCodes   = {};

  for (var li = 0; li < lines.length; li++) {
    var line = lines[li].trim();
    if (!line) continue;

    var eqIdx = line.indexOf('=');
    if (eqIdx < 0) continue;

    var sectorId  = line.substring(0, eqIdx);
    var rest      = line.substring(eqIdx + 1);

    // Single-character keys are flat script files inside /w/, not map sectors
    if (sectorId.length === 1) {
    	// validate text first
      fileSave(driveName, '/', 'w/a', rest, 'UNIVAC', 'UNIVAC');
      continue;
    }


    var dotIdx    = rest.indexOf('.');
    var mapData   = dotIdx >= 0 ? rest.substring(0, dotIdx) : rest;
    var itemData  = dotIdx >= 0 ? rest.substring(dotIdx + 1) : '';

    // tiles are first 192 chars (96 × 2); exits are the remainder
    var tiles = mapData.substring(0, 192); 
    var exitStr = mapData.substring(192);
    // NEW: Parse items using comma separation
    var items = [];
    if (itemData) {
      var rawItems = itemData.split(',');
      for (var ri = 0; ri < rawItems.length; ri++) {
        var blob = rawItems[ri].trim();
        if (blob) items.push(blob);
      }
    }
    sectors.push({ id: sectorId, exits: exitStr, items: items });
  }

  if (sectors.length === 0) {
    return { success: false, error: sysopGfx + ' contains no valid world sectors' };
  }

  var created = [];
  var errors  = [];

  // Create /w/ root directory
  var wDir = dirMake(driveName, '/', 'w', session);
  if (!wDir.success && wDir.error !== 'directory already exists') {
    return { success: false, error: 'failed to create /w/ directory: ' + wDir.error };
  }
  
  // Process Sector Items
  for (var si = 0; si < sectors.length; si++) {
    var sector  = sectors[si];
    var dirPath = 'w/' + sector.id;

    var mkResult = dirMake(driveName, '/', dirPath, session);
    if (!mkResult.success && mkResult.error !== 'directory already exists') {
      errors.push('mkdir ' + dirPath + ': ' + mkResult.error);
      continue;
    }

    // e(.txt) – valid exits
    var eResult = fileSave(driveName, '/', dirPath + '/e', sector.exits, session, 'bigbang');
    if (!eResult.success) errors.push(dirPath + '/e: ' + eResult.error);

    // Create item files with Bytecode inside
    for (var ii = 0; ii < sector.items.length; ii++) {
      var parts = sector.items[ii].split(':');
      var itemMeta = parts[0];
      var itemCode = (parts[1] || '').slice(0, sysopCardWidth);
      
      var itemId=parts[0].substring(0,2); 

      var pDir = dirMake(driveName, '/', 'p', session);
      
      var iResult = fileSave(driveName, '/', dirPath + '/' + itemMeta, itemCode, '', 'bigbang');
      if (!iResult.success) errors.push(dirPath + '/' + itemMeta + ': ' + iResult.error);
    }


    created.push(sector.id);
  }

  // 
  // need a File System Consistency Checker:
  //
  // it should ensure all directories and files created have known path names
  // to prevent malicious user from 'hiding' data files in directories that 
  // don't exist preventing the terminal operator to know they exist
  //

  if (errors.length > 0) {
    return { success: false, error: errors.join('; '), maps: created };
  }

  return {
    success: true,
    result:  'World created: ' + created.length + ' sector(s), ' + playerCodes.length + ' player slots',
    maps:    created,
    players: playerCodes
  };
}

