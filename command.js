
async function command(cmd) {
  if (RUN != "qandy.js") {
    print("\n");
    try { input(cmd); } catch (e) { /* ignore */ }
    // this needs testing AFTER run command works
    LINE = ""; CURP = 0; LINEX = CURX; LINEY = CURY;
    pokeRefresh();
    return;
  }
  // system commands
  print("\n");
  var trimmedCmd = String(cmd || '').trim();

  if (trimmedCmd === 'cls') {
    SYNC=0;
    pokeCursorOff();
    pokeText(0,0," ",800);
    pokeColor(0,0,CURFG, CURBG, 800);
    pokeAttr(0,0,0, 800);
    CURX=0; CURY=0; LINEX=0; LINEY=0;
    SYNC=1;
    pokeRefresh();
    pokeCursorOn();
  } else if (trimmedCmd.endsWith('.js')) {
    if (typeof qdosScript === 'function') {
      var result = await qdosScript(trimmedCmd);
      if (result !== true) print(String(result) + '\n');
    } else if (typeof hostScript === 'function') {
      hostScript(trimmedCmd);
    }
  } else if (trimmedCmd === 'dir') {
    if (typeof qdosDir === 'function') {
      print(await qdosDir());
    } else {
      await evalCode(trimmedCmd);
    }
  } else if (/^delete\s+/i.test(trimmedCmd)) {
    if (typeof qdosDelete === 'function') {
      var match = trimmedCmd.match(/^delete\s+(.+)$/i);
      if (match && match[1]) {
        print(await qdosDelete(match[1].trim()));
      } else {
        print('Error: usage: delete <filename>\n');
      }
    } else {
      await evalCode(trimmedCmd);
    }
  } else if (/^exists\s+/i.test(trimmedCmd)) {
    if (typeof qdosExists === 'function') {
      var match = trimmedCmd.match(/^exists\s+(.+)$/i);
      if (match && match[1]) {
        print(await qdosExists(match[1].trim()));
      } else {
        print('Error: usage: exists <filename>\n');
      }
    } else {
      await evalCode(trimmedCmd);
    }
  } else if (/^rename\s+/i.test(trimmedCmd)) {
    if (typeof qdosRename === 'function') {
      var match = trimmedCmd.match(/^rename\s+(.+?)\s*\/\s*(.+)$/i);
      if (match && match[1] && match[2]) {
        print(await qdosRename(match[1].trim(), match[2].trim()));
      } else {
        print('Error: usage: rename <old> / <new>\n');
      }
    } else {
      await evalCode(trimmedCmd);
    }
  } else if (/^type\s+/i.test(trimmedCmd)) {
    if (typeof qdosType === 'function') {
      var match = trimmedCmd.match(/^type\s+(.+)$/i);
      if (match && match[1]) {
        print(await qdosType(match[1].trim()));
      } else {
        print('Error: usage: type <filename>\n');
      }
    } else {
      await evalCode(trimmedCmd);
    }
  } else if (/^load\s+/i.test(trimmedCmd)) {
    if (typeof qdosLoad === 'function') {
      var match = trimmedCmd.match(/^load\s+(.+)$/i);
      if (match && match[1]) {
        print(await qdosLoad(match[1].trim()));
      } else {
        print('Error: usage: load <filename>\n');
      }
    } else {
      await evalCode(trimmedCmd);
    }
  } else if (/^mount(\s|$)/i.test(trimmedCmd)) {
    if (typeof qdosMount === 'function') {
      var match = trimmedCmd.match(/^mount\s+(.+)$/i);
      print(await qdosMount(match ? match[1].trim() : null));
    } else {
      await evalCode(trimmedCmd);
    }
  } else {
    await evalCode(trimmedCmd);
    pokeCursorOn();
    LINE=""; CURP = 0;
    LINEX = CURX; LINEY = CURY;
    return;
  }
  pokeRefresh();
}

async function evalCode(code) {
  try {
    var trimmed = String(code).trim();
    var simpleNameRE = /^[$A-Za-z_][$A-Za-z0-9_]*(?:\s*\.\s*[$A-Za-z_][$A-Za-z0-9_]*)*$/;

    function handleResult(result) {
      try {
        if (result === undefined) return;
        // If result is a Promise, wait for it and print the resolved value or error
        if (result && typeof result.then === 'function') {
          result.then(function(res) {
            try {
              if (res !== undefined) { print(String(res) + "\n\n"); }
            } catch (e) {
              print("Error printing promise result: " + (e && e.message ? e.message : String(e)) + "\n\n");
            }
          }).catch(function(err) {
            try {
              print("Promise rejection: " + (err && err.message ? err.message : String(err)) + "\n\n");
            } catch (e) {
              /* swallow */
            }
          });
          return;
        }
        // Non-promise: print synchronously
        print(String(result) + "\n\n");
      } catch (e) {
        try { print("Error handling result: " + e.message + "\n\n"); } catch (ee) {}
      }
    }

    if (simpleNameRE.test(trimmed)) {
      try {
        var value = eval(trimmed);
      } catch (e) {
        print("EI assume trror: " + e.message + "\n\n");
        return false;
      }
      if (typeof value === "function") {
        print("ERROR: use: " + trimmed + "()\n\n");
        return true;
      }
      handleResult(value);
      return true;
    }

    var result = eval(code);
    handleResult(result);
    return true;
  } catch (error) {
    print("Error: " + error.message + "\n\n");
    return false;
  }
}

// Signal that memory.js is ready
if (typeof window.qandySignalReady === 'function') {
  window.qandySignalReady('Command');
}
