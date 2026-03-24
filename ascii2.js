RUN="ascii2.js";

function pad(num, width) { return String(num).padStart(width, '0'); }

function centerCharCell(ch, width) {
  if (!ch || ch.length === 0) ch = ' ';
  if (ch === ' ') { ch = ' '; }
  if (ch.length >= width) return ch.slice(0, width);
  var left = Math.floor((width - ch.length) / 2);
  var right = width - ch.length - left;
  return ' '.repeat(left) + ch + ' '.repeat(right);
}

var CP437 = {
  // graphics that were historically shown in codes 1-31
  1: '\u263A',  2: '\u263B',  3: '\u2665',  4: '\u2666',  5: '\u2663',  6: '\u2660',
  7: '\u2022',  8: '\u25D8',  9: '\u25CB', 10: '\u25D9', 11: '\u2642', 12: '\u2640',
  13: '\u266A', 14: '\u266B', 15: '\u263C', 16: '\u25BA', 17: '\u25C4', 18: '\u2195',
  19: '\u203C', 20: '\u00B6', 21: '\u00A7', 22: '\u25AC', 23: '\u21A8', 24: '\u2191',
  25: '\u2193', 26: '\u2192', 27: '\u2190', 28: '\u221F', 29: '\u2194', 30: '\u25B2',
  31: '\u25BC',

  // box/line-drawing and block characters (176-223)
  // CP437 mappings: add these entries to your CP437 object
  128: '\u00C7', 129: '\u00FC', 130: '\u00E9', 131: '\u00E2', 132: '\u00E4', 133: '\u00E0', 
  134: '\u00E5', 135: '\u00E7', 136: '\u00EA', 137: '\u00EB', 138: '\u00E8', 139: '\u00EF', 
  140: '\u00EE', 141: '\u00EC', 142: '\u00C4', 143: '\u00C5', 144: '\u00C9', 145: '\u00E6', 
  146: '\u00C6', 147: '\u00F4', 148: '\u00F6', 
  149: '\u00F2',150: '\u00FB',151: '\u00F9',152: '\u00FF',153: '\u00D6',154: '\u00DC', 
  155: '\u00A2', 156: '\u00A3', 157: '\u00A5', 158: '\u20A7', 159: '\u0192', 160: '\u00E1',  
  176: '\u2591', 177: '\u2592', 178: '\u2593', 179: '\u2502', 180: '\u2524', 181: '\u2561',
  182: '\u2562', 183: '\u2556', 184: '\u2555', 185: '\u2563', 186: '\u2551', 187: '\u2557',
  188: '\u255D', 189: '\u255C', 190: '\u255B', 191: '\u2510', 192: '\u2514', 193: '\u2534',
  194: '\u252C', 195: '\u251C', 196: '\u2500', 197: '\u253C', 198: '\u255E', 199: '\u255F',
  200: '\u255A', 201: '\u2554', 202: '\u2569', 203: '\u2566', 204: '\u2560', 205: '\u2550',
  206: '\u256C', 207: '\u2567', 208: '\u2568', 209: '\u2564', 210: '\u2565', 211: '\u2559',
  212: '\u2558', 213: '\u2552', 214: '\u2553', 215: '\u256B', 216: '\u256A', 217: '\u2518',
  218: '\u250C', 219: '\u2588', 220: '\u2584', 221: '\u258C', 222: '\u2590', 223: '\u2580'  
  // NOTE: you can add 128..175 and 224..255 here if you want those specific glyphs
};

function renderAscii(start, end, cols, opts) {
  start = (typeof start === 'number') ? start : 32;
  end   = (typeof end   === 'number') ? end   : 126;
  cols  = (typeof cols  === 'number') ? cols  : 8;
  opts = opts || {};
  var codeWidth = opts.codeWidth || 3;    // number of digits for codes (e.g. 3 -> 065)
  var sep = (typeof opts.separator === 'string') ? opts.separator : ' '; // between columns
  var charCellWidth = codeWidth; // keep characters aligned under the numeric codes

  // Optional: show a visible symbol for space (e.g. '␣') - default false
  var showSpaceSymbol = !!opts.showSpaceSymbol;

  // New option: if true, interpret bytes as CP437 and substitute glyphs
  var useCP437 = !!opts.cp437;

  var lines = [];

  for (var blockStart = start; blockStart <= end; blockStart += cols) {
    var charsCells = [];
    var codesCells = [];

    for (var i = 0; i < cols; i++) {
      var code = blockStart + i;
      if (code > end) {
        charsCells.push(' '.repeat(charCellWidth));
        codesCells.push(' '.repeat(codeWidth));
        continue;
      }

      // Default character from Unicode code point == code
      var ch = String.fromCharCode(code);

      // If user asked for CP437 rendering, substitute from CP437 table when present
      if (useCP437) {
        if (CP437.hasOwnProperty(code)) {
          ch = CP437[code];
        } else if (code >= 128) {
          // optional: fallback behavior for other high bytes; here we still attempt
          // to use a direct Unicode code point mapping for many of the 128..255 range,
          // but for a faithful CP437 result you should add explicit entries for those
          // positions from a full CP437 table (see CP437.TXT / Unicode mapping).
          // For now, just keep the JS default for unmapped high bytes:
          ch = String.fromCharCode(code);
        }
      } else {
        // Make non-printable visible if desired (for control range)
        if (code === 32 && showSpaceSymbol) ch = '␣'; // visible space
        else if (code < 32 || code === 127) {
          if (!opts.showControlsLiteral) ch = '·';
        }
      }

      // If the font lacks the glyph, it may show a box — ensure your font covers these Unicode points.
      charsCells.push(centerCharCell(ch, charCellWidth));
      codesCells.push(pad(code, codeWidth));
    }

    lines.push(charsCells.join(sep));
    lines.push(codesCells.join(sep));
    lines.push('\n'); // blank line between groups
  }

  var out = lines.join('\n');
  print(out);
  return out;
}

window._ascii_rendered = true;

print("\n");
renderAscii(0, 255, 8, { cp437: true, showSpaceSymbol: false });

dosExit();