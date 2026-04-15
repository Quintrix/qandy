// gfx-clean.js
// Clean Graphics Engine Rewrite - Single Responsibility Principles
// Standalone file, safe to test independently before replacing gfx.js.
//
// Public API:
//   gfxInit()              – create tile grid, popup, and CSS
//   gfxTiles(tileString)   – set 96 tile images from a 192-char string
//   gfxChar(id, outfit, z) – place/update a character at grid position z
//   gfxItems(itemArray)    – replace all static items ({id, z, data}[])
//   gfxClear()             – remove all characters and items
//   gfxZClick(z)           – handle a tile/item/character click
//
// Command queue:
//   window.gfxDo           – current pending command, defaults to "RF"
//   gfxSetCommand(cmd,data)– queue a player command (one-per-second rule)
//   gfxGetCommand()        – retrieve + reset the pending command
//
// Data storage (read by gfxZClick and external code):
//   window.gfxGrid.tiles[]       – 96 two-char tile codes
//   window.gfxGrid.items[]       – {id, z, data} objects
//   window.gfxGrid.characters[]  – {id, outfit, z} objects
//   window.gfxGrid.sector        – current sector name

// ---------------------------------------------------------------------------
// Grid constants
// ---------------------------------------------------------------------------
var GFX_COLS  = 8;                    // tiles per row  (mapx+1)
var GFX_ROWS  = 12;                   // rows per screen (mapy+1)
var GFX_TOTAL = GFX_COLS * GFX_ROWS; // 96 total tile positions

// Pixel layout – matches the existing gfx.js conventions
var GFX_TILE        = 32; // tile size in pixels
var GFX_LEFT_OFFSET = 54; // left edge of the grid
var GFX_TILE_TOP    = 50; // top edge for tile row 0
var GFX_CHAR_TOP    = 22; // top edge for character row 0 (sprite extends 2 tiles tall)
var GFX_ITEM_TOP    = 52; // top edge for item row 0

// ---------------------------------------------------------------------------
// Data storage
// ---------------------------------------------------------------------------
window.gfxGrid = {
  tiles:      [],  // 96 two-char tile codes
  items:      [],  // {id, z, data}
  characters: [],  // {id, outfit, z}
  sector:     ""
};

// ---------------------------------------------------------------------------
// Command queue  (gfxDo replaces the old 'toDo' concept)
// ---------------------------------------------------------------------------
window.gfxDo          = "RF";  // default: refresh
window._gfxCmdData    = {};
window._gfxCmdPending = false;
window._gfxCmdTime    = 0;     // timestamp (ms) of the last accepted command

// Queue a player command.  Returns true on success, false if rejected.
// Enforces the one-command-per-second anti-cheat rule.
window.gfxSetCommand = function(cmd, data) {
  var now = Date.now();
  // Allow a 100 ms grace window below 1 second to absorb timer jitter
  if (window._gfxCmdPending && (now - window._gfxCmdTime) < 900) {
    return false; // too soon (< ~1 s since last command) – reject
  }
  window.gfxDo          = cmd;
  window._gfxCmdData    = data || {};
  window._gfxCmdPending = true;
  window._gfxCmdTime    = now;
  return true;
};

// Retrieve the pending command and reset back to "RF".
// Call this just before sending a server ping.
window.gfxGetCommand = function() {
  var result = { cmd: window.gfxDo, data: window._gfxCmdData };
  window.gfxDo          = "RF";
  window._gfxCmdData    = {};
  window._gfxCmdPending = false;
  return result;
};

// ---------------------------------------------------------------------------
// Coordinate helper
// ---------------------------------------------------------------------------
function gfxZtoXY(z) {
  var y = Math.floor(z / GFX_COLS);
  var x = z - (y * GFX_COLS);
  return { x: x, y: y };
}

// ---------------------------------------------------------------------------
// gfxInit() – create tile grid, CSS and popup div
// ---------------------------------------------------------------------------
window.gfxInit = function() {
  var i, el;

  // Remove any existing tile elements
  for (i = 0; i < GFX_TOTAL; i++) {
    el = document.getElementById("T" + i);
    if (el && el.parentNode) { el.parentNode.removeChild(el); }
  }

  // Create tile elements (z=0 … 95)
  for (i = 0; i < GFX_TOTAL; i++) {
    var coords = gfxZtoXY(i);
    var t = document.createElement("img");
    t.id            = "T" + i;
    t.src           = "t/Ga.png";
    t.className     = "tile";
    t.style.position = "absolute";
    t.style.width    = GFX_TILE + "px";
    t.style.height   = GFX_TILE + "px";
    t.style.top      = (GFX_TILE_TOP + coords.y * GFX_TILE) + "px";
    t.style.left     = (GFX_LEFT_OFFSET + coords.x * GFX_TILE) + "px";
    t.style.zIndex   = "10";
    // Direct onclick with proper closure – no addEventListener
    t.onclick = (function(tileZ) {
      return function() { window.gfxZClick(tileZ); };
    })(i);
    document.body.appendChild(t);
  }

  // Reset data store
  window.gfxGrid.tiles      = [];
  window.gfxGrid.items      = [];
  window.gfxGrid.characters = [];
  window.gfxGrid.sector     = "";

  // Inject CSS (once)
  if (!document.getElementById("gfx-clean-style")) {
    var style = document.createElement("style");
    style.id = "gfx-clean-style";
    style.textContent =
      ".tile { position:absolute; }" +
      ".item { position:absolute; }" +
      ".char { position:absolute; }" +
      ".pop  { position:absolute; top:260px; left:190px; z-index:249;" +
      "        font-family:arial; font-size:14px; font-weight:bold;" +
      "        color:navy; background-color:#999; visibility:hidden;" +
      "        text-align:center; padding:0 4px; }";
    document.head.appendChild(style);
  }

  // Create popup div (once)
  if (!document.getElementById("pop")) {
    var popup = document.createElement("div");
    popup.id        = "pop";
    popup.className = "pop";
    document.body.appendChild(popup);
  }

  window.GFX = 1;
};

// Convenience aliases matching the rest of the codebase
window.pop  = window.pop  || function(htm) {
  var p = document.getElementById("pop");
  if (p) { p.innerHTML = "<p>" + htm; p.style.visibility = "visible"; }
};
window.hpop = window.hpop || function() {
  var p = document.getElementById("pop");
  if (p) { p.style.visibility = "hidden"; }
};

// ---------------------------------------------------------------------------
// gfxTiles(tileString) – set 96 tile images from a 192-character string
// ---------------------------------------------------------------------------
window.gfxTiles = function(tileString) {
  window.gfxGrid.tiles = [];
  for (var i = 0; i < GFX_TOTAL; i++) {
    var code = tileString.charAt(i * 2) + tileString.charAt(i * 2 + 1);
    window.gfxGrid.tiles[i] = code;
    var el = document.getElementById("T" + i);
    if (el) { el.src = "t/" + code + ".png"; }
  }
};

// ---------------------------------------------------------------------------
// gfxChar(id, outfit, z) – place/update a character at grid position z
// ---------------------------------------------------------------------------
window.gfxChar = function(id, outfit, z) {
  var O = outfit || "";
  var zNum = parseInt(z, 10);

  // Update data store
  var found = false;
  for (var ci = 0; ci < window.gfxGrid.characters.length; ci++) {
    if (window.gfxGrid.characters[ci].id === id) {
      window.gfxGrid.characters[ci] = { id: id, outfit: O, z: zNum };
      found = true;
      break;
    }
  }
  if (!found) {
    window.gfxGrid.characters.push({ id: id, outfit: O, z: zNum });
  }

  // Decode outfit into face, body, hat part codes
  var face = "", body = "", hat = "";
  if (O.indexOf("A") > -1) { face = "A" + O.charAt(O.indexOf("A") + 1); }
  if (O.indexOf("B") > -1) { face = "B" + O.charAt(O.indexOf("B") + 1); }
  if (O.indexOf("E") > -1) { face = "E" + O.charAt(O.indexOf("E") + 1); }
  if (O.indexOf("F") > -1) { face = "F" + O.charAt(O.indexOf("F") + 1); }
  if (O.indexOf("C") > -1) { body = "C" + O.charAt(O.indexOf("C") + 1); }
  if (O.indexOf("D") > -1) { body = "D" + O.charAt(O.indexOf("D") + 1); }
  if (O.indexOf("G") > -1) { body = "G" + O.charAt(O.indexOf("G") + 1); }
  if (O.indexOf("H") > -1) { body = "H" + O.charAt(O.indexOf("H") + 1); }
  if (O.indexOf("I") > -1) { hat  = "I" + O.charAt(O.indexOf("I") + 1); }
  if (O.indexOf("J") > -1) { hat  = "J" + O.charAt(O.indexOf("J") + 1); }

  // Pixel position for this grid cell
  var coords = gfxZtoXY(zNum);
  var top    = GFX_CHAR_TOP + coords.y * GFX_TILE;
  var left   = GFX_LEFT_OFFSET + coords.x * GFX_TILE;

  // Helper: create or update a single character layer image
  function makeOrUpdate(partId, src, zIndex) {
    var el = document.getElementById(partId);
    if (el) {
      el.src         = "c/" + src + ".png";
      el.style.top   = top  + "px";
      el.style.left  = left + "px";
    } else {
      el = document.createElement("img");
      el.id             = partId;
      el.src            = "c/" + src + ".png";
      el.className      = "char";
      el.style.position = "absolute";
      el.style.height   = "64px";
      el.style.width    = "32px";
      el.style.top      = top  + "px";
      el.style.left     = left + "px";
      el.style.zIndex   = zIndex;
      // Direct onclick with closure – captures zNum, not the variable `z`
      el.onclick = (function(capturedZ) {
        return function() { window.gfxZClick(capturedZ); };
      })(zNum);
      document.body.appendChild(el);
    }
  }

  if (body) { makeOrUpdate("cb" + id, body, "150"); }
  if (face) { makeOrUpdate("cf" + id, face, "151"); }
  if (hat)  { makeOrUpdate("ch" + id, hat,  "152"); }

  // Remove the hat layer if the outfit no longer includes one
  if (!hat) {
    var oldHat = document.getElementById("ch" + id);
    if (oldHat && oldHat.parentNode) { oldHat.parentNode.removeChild(oldHat); }
  }
};

// ---------------------------------------------------------------------------
// gfxItems(itemArray) – replace all static items on the grid
// itemArray: [{id, z, data}, …]  (data is a 2-char extra string, may be "")
// ---------------------------------------------------------------------------
window.gfxItems = function(itemArray) {
  // Remove existing item elements
  var oldItems = document.querySelectorAll(".item");
  for (var k = 0; k < oldItems.length; k++) {
    if (oldItems[k].parentNode) { oldItems[k].parentNode.removeChild(oldItems[k]); }
  }

  window.gfxGrid.items = [];
  if (!itemArray) { return; }

  for (var b = 0; b < itemArray.length; b++) {
    var item = itemArray[b];
    var z    = parseInt(item.z, 10);
    if (isNaN(z)) { continue; }

    window.gfxGrid.items.push({ id: item.id, z: z, data: item.data || "" });

    var coords = gfxZtoXY(z);
    var el = document.createElement("img");
    el.id             = "gi" + b;
    el.src            = "i/" + item.id + ".png";
    el.className      = "item";
    el.style.position = "absolute";
    el.style.top      = (GFX_ITEM_TOP  + coords.y * GFX_TILE) + "px";
    el.style.left     = (GFX_LEFT_OFFSET + coords.x * GFX_TILE) + "px";
    el.style.zIndex   = "120";

    // Adjust position once the image loads so items are bottom-aligned on the tile.
    // Math.max(0, …) guards against images smaller than one tile shifting downward.
    (function(imgEl) {
      imgEl.onload = function() {
        imgEl.style.top  = (parseInt(imgEl.style.top,  10) - Math.max(0, imgEl.height - GFX_TILE)) + "px";
        imgEl.style.left = (parseInt(imgEl.style.left, 10) - Math.max(0, imgEl.width  - GFX_TILE)) + "px";
      };
    })(el);

    // Direct onclick with closure – captures z per iteration
    el.onclick = (function(capturedZ) {
      return function() { window.gfxZClick(capturedZ); };
    })(z);

    document.body.appendChild(el);
  }
};

// ---------------------------------------------------------------------------
// gfxClear() – remove all characters and items from the DOM and data store
// ---------------------------------------------------------------------------
window.gfxClear = function() {
  var chars = document.querySelectorAll(".char");
  for (var c = 0; c < chars.length; c++) {
    if (chars[c].parentNode) { chars[c].parentNode.removeChild(chars[c]); }
  }
  var items = document.querySelectorAll(".item");
  for (var i = 0; i < items.length; i++) {
    if (items[i].parentNode) { items[i].parentNode.removeChild(items[i]); }
  }
  window.gfxGrid.items      = [];
  window.gfxGrid.characters = [];
};

// ---------------------------------------------------------------------------
// gfxZClick(z) – clean single-entry-point click handler
//
// Flow:
//   1. Call window.zdown(z) if the game defines it
//   2. Collect all items at z from gfxGrid.items and gfxGrid.characters
//   3a. Exactly one item AND window.itemdown() exists → call itemdown directly
//   3b. Otherwise build a popup listing every item at this location
//
// Item string format: itemId(2) + zPadded(2) + data  e.g. "Sa13B0D0"
// ---------------------------------------------------------------------------
window.gfxZClick = function(z) {
  var zNum = parseInt(z, 10);
  var zStr = ("0" + zNum).slice(-2); // zero-padded 2-digit z

  // 1. Notify the game of the raw tile click
  if (typeof window.zdown === "function") {
    window.zdown(zNum);
  }

  // 2. Collect every item at this z-location
  var items = [];

  // Static items
  for (var si = 0; si < window.gfxGrid.items.length; si++) {
    var item = window.gfxGrid.items[si];
    if (parseInt(item.z, 10) === zNum) {
      items.push(item.id + zStr + (item.data || ""));
    }
  }

  // Characters
  for (var ci = 0; ci < window.gfxGrid.characters.length; ci++) {
    var chr = window.gfxGrid.characters[ci];
    if (parseInt(chr.z, 10) === zNum) {
      items.push(chr.id + zStr + (chr.outfit || ""));
    }
  }

  // 3a. Single item + itemdown() defined → call directly, no popup
  if (items.length === 1 && typeof window.itemdown === "function") {
    window.itemdown(items[0]);
    return;
  }

  // 3b. Build popup HTML.
  // Item strings are stored in window._gfxPopItems and referenced by numeric index
  // so that no untrusted data is embedded inside a javascript: URL (XSS prevention).
  window._gfxPopItems = items.slice();

  var htm = "";
  for (var pi = 0; pi < items.length; pi++) {
    var fullStr = items[pi];
    var iId     = fullStr.slice(0, 2);
    var name    = (typeof window.ItemID === "function") ? String(window.ItemID(iId)) : iId;
    if (typeof window.itemdown === "function") {
      htm += "<a href=\"javascript:window._gfxPickItem(" + pi + ")\">" + name + "</a><br>";
    } else {
      htm += name + "<br>";
    }
  }

  if (htm && typeof window.pop === "function") {
    window.pop(htm);
  }
};

// Internal helper used by popup links – calls itemdown() with the stored item string.
window._gfxPickItem = function(idx) {
  var item = window._gfxPopItems && window._gfxPopItems[idx];
  if (item !== undefined && typeof window.itemdown === "function") {
    window.itemdown(item);
  }
};
