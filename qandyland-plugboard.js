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
    if (player.avatar.indexOf('-') !== -1) {
      let cleanAvatar = player.avatar.replace(/\-../g, '');
      runtape("Va" + cleanAvatar + "--");
    }
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

  if (tape) { runtape(tape); tape=""; }
  
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
    output += "RF" + player.map + z + items.join('~');
  }
  return respondRetro(stacker, output, session);
}

