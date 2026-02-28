
function command(cmd) {
  if (RUN != "qandy.js") {
    print("\n");
    try { input(cmd); } catch (e) { /* ignore */ }
    // this needs testing AFTER run command works
    LINE = ""; CURP = 0; LINEX = CURX; LINEY = CURY;
    pokeRefresh()
  } else {
    // system commands
    print("\n");
    if (cmd.slice(-3) === ".js") {
      //keysoff();
      var scriptName = String(cmd || '').trim();
      hostScript(scriptName);
    } else if (cmd.substr(0,3) === "cls") {
       SYNC=0;
       pokeCursorOff();
       pokeText(0,0," ",800);
       pokeColor(0,0,CURFG, CURBG, 800);
       pokeAttr(0,0,0, 800);
       CURX=0; CURY=0; LINEX=0; LINEY=0;
       SYNC=1;
       pokeRefresh;
       pokeCursorOn();
    } else {
      evalCode(cmd);
      pokeCursorOn();
      LINE=""; CURP = 0;
      LINEX = CURX; LINEY = CURY;
      return;
    }
    pokeRefresh();
  }
}



function evalCode(code) {
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

