
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
  var sectors = [];       // { id, tiles, exits, items[] }
  var systemFiles = [];   // { id, data } for global UNIVAC scripts
  var playerCodes = [];
  var seenCodes   = {};

  for (var li = 0; li < lines.length; li++) {
    var line = lines[li].trim();
    if (!line) continue;

    var eqIdx = line.indexOf('=');
    if (eqIdx < 0) continue;

    var sectorId  = line.substring(0, eqIdx);
    var rest      = line.substring(eqIdx + 1);

    // Ignore metadata entirely (e.g. ##=Pa:White Flag)
    if (sectorId === '##') continue;

    // Single-character keys are flat script files inside /w/, not map sectors
    if (sectorId.length === 1) {
      systemFiles.push({ id: sectorId, data: rest });
      continue;
    }

    var dotIdx    = rest.indexOf('.');
    var mapData   = dotIdx >= 0 ? rest.substring(0, dotIdx) : rest;
    var itemData  = dotIdx >= 0 ? rest.substring(dotIdx + 1) : '';

    // tiles are first 192 chars (96 × 2); exits are the remainder
    var tiles = mapData.substring(0, 192); 
    var exitStr = mapData.substring(192);
    
    // Parse items using comma separation
    var items = [];
    if (itemData) {
      var rawItems = itemData.split('~');
      for (var ri = 0; ri < rawItems.length; ri++) {
        var blob = rawItems[ri].trim();
        if (blob) items.push(blob);
      }
    }
    sectors.push({ id: sectorId, tiles: tiles, exits: exitStr, items: items });
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

  // Create empty /p/ root directory for connecting players
  var pDir = dirMake(driveName, '/', 'p', session);
  if (!pDir.success && pDir.error !== 'directory already exists') {
    return { success: false, error: 'failed to create /p/ directory: ' + pDir.error };
  }

  // Save 1-character system files into /w/ using their dynamic keys (e.g. w/a, w/b)
  for (var fi = 0; fi < systemFiles.length; fi++) {
    var sysFile = systemFiles[fi];
    // Strip out whitespace 
    var rawCode=sysFile.data;
    var raw1 = rawCode.replace(/ /g, "");
    var item1 = raw1.replace(/_NL_/g, "");
    var item2 = item1.replace(/\\n/g, "");
    var itemCode = item2.replace(/\\r/g, "").replace(/\\\\/g, "\\");
    
    var sfResult = fileSave(driveName, '/', 'w/' + sysFile.id, itemCode, 'UNIVAC', 'UNIVAC');
    if (!sfResult.success) errors.push('w/' + sysFile.id + ': ' + sfResult.error);  //'
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

    // m(.txt) – valid terrain tiles (192 chars)
    var mResult = fileSave(driveName, '/', dirPath + '/m', sector.tiles, session, 'bigbang');
    if (!mResult.success) errors.push(dirPath + '/m: ' + mResult.error);

    // e(.txt) – valid exits
    var eResult = fileSave(driveName, '/', dirPath + '/e', sector.exits, session, 'bigbang');
    if (!eResult.success) errors.push(dirPath + '/e: ' + eResult.error);

    // Create item files with Bytecode inside
    for (var ii = 0; ii < sector.items.length; ii++) {
      var parts = sector.items[ii].split('|');
      var itemMeta = parts[0];

      // Strip out whitespace then slice the exact limits
      var rawCode = (parts[1] || '').replace(/ /g, "");
      var item1 = rawCode.replace(/_NL_/g, "");
      var item2 = item1.replace(/\\n/g, "");
      var itemCode = item2.replace(/\\r/g, "")

      var itemId = itemCode.substring(0, 2);
      var iResult = fileSave(driveName, '/', dirPath + '/' + itemMeta, itemCode, '', 'bigbang');
      if (!iResult.success) errors.push(dirPath + '/' + itemMeta + ': ' + iResult.error);
    }

    created.push(sector.id);
  }

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

