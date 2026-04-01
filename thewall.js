// thewall.js – Qandy Graffiti Wall
// Demonstrates server storage functions and input().
//
// Usage:
//   1. Start the server:  node qandyland.js
//   2. In qandy-host.htm: run thewall.js

(async function() {

  var DRIVE   = "thewall";
  var WALL_FILE = "wall.txt";
  var MAX_ENTRIES = 50;
  var DEBUG_MODE = true;

  function debugLog(message) {
    if (DEBUG_MODE) {
      print("[DEBUG] " + message + "\n");
    }
  }

  // ── Helper: timestamp string (yyyymmddhhmmss) ──────────────────────────────
  function ts() {
    var d = new Date();
    var p = function(n) { return String(n).padStart(2, '0'); };
    return String(d.getFullYear()) + p(d.getMonth()+1) + p(d.getDate()) +
           p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
  }

  // ── Connect to the server drive ────────────────────────────────────────────
  print("\x1b[1;36m=== The Wall ===\x1b[0m\n");
  print("Connecting to server...\n");

  // Try mounting an existing drive first
  debugLog("Attempting serverMount('" + DRIVE + "')");
  var mountResult = await serverMount(DRIVE);
  debugLog("Mount result: " + mountResult);
  if (typeof mountResult === 'string' && mountResult.indexOf('Error') === 0) {
    // Drive doesn't exist yet – create it
    print("Creating new wall drive...\n");
    debugLog("Attempting serverCreate('" + DRIVE + "')");
    var createResult = await serverCreate(DRIVE);
    debugLog("Create result: " + createResult);
    if (typeof createResult === 'string' && createResult.indexOf('Error') === 0) {
      print("\x1b[91m" + createResult + "\x1b[0m\n");
      print("Make sure qandyland.js is running:  node qandyland.js\n");
      return;
    }
    print("Wall drive created.\n");
  } else {
    print("Connected: " + mountResult + "\n");
  }

  // ── Load existing wall content ─────────────────────────────────────────────
  print("\n\x1b[1;33m── The Wall ──────────────────\x1b[0m\n");

  debugLog("Loading " + WALL_FILE);
  var wallContent = await serverLoad(WALL_FILE);
  debugLog("Load result: " + (wallContent === null ? "null" : (typeof wallContent === 'string' ? wallContent.length + " chars" : String(wallContent))));
  if (wallContent === null || (typeof wallContent === 'string' && wallContent.indexOf('Error') === 0)) {
    print("(wall is empty)\n");
    wallContent = "";
  } else {
    print(wallContent);
  }

  print("\x1b[1;33m──────────────────────────────\x1b[0m\n\n");

  // ── Ask user for a message ─────────────────────────────────────────────────
  print("Add your message (or press Enter to skip):\n");
  var msg = await input(">> ");

  if (!msg || !msg.trim()) {
    print("No message added.\n");
    return;
  }

  msg = msg.trim();

  // ── Append to wall ─────────────────────────────────────────────────────────
  var entry   = "[" + ts() + "] " + msg + "\n";
  var updated = wallContent + entry;

  // Trim to MAX_ENTRIES lines
  var allLines = updated.split("\n").filter(function(l) { return l.trim(); });
  if (allLines.length > MAX_ENTRIES) {
    allLines = allLines.slice(allLines.length - MAX_ENTRIES);
  }
  updated = allLines.join("\n") + "\n";

  debugLog("Saving " + WALL_FILE + " (" + updated.length + " chars)");
  var saveResult = await serverSave(WALL_FILE, updated);
  debugLog("Save result: " + saveResult);
  if (typeof saveResult === 'string' && saveResult.indexOf('Error') === 0) {
    print("\x1b[91mSave failed: " + saveResult + "\x1b[0m\n");
    return;
  }

  print("\n\x1b[92mMessage added to the wall!\x1b[0m\n");
  print(entry);

})();
