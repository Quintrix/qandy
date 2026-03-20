RUN="ascii2.js";

  function pad(num, width) { return String(num).padStart(width, '0'); }

  function centerCharCell(ch, width) {
    // Return a string of length `width` with ch centered (simple strategy)
    if (!ch || ch.length === 0) ch = ' ';
    if (ch === ' ') { ch = ' '; }
    if (ch.length >= width) return ch.slice(0, width);
    var left = Math.floor((width - ch.length) / 2);
    var right = width - ch.length - left;
    return ' '.repeat(left) + ch + ' '.repeat(right);
  }

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

    var lines = [];

    for (var blockStart = start; blockStart <= end; blockStart += cols) {
      var charsCells = [];
      var codesCells = [];

      for (var i = 0; i < cols; i++) {
        var code = blockStart + i;
        if (code > end) {
          // fill with blanks to keep alignment at row end
          charsCells.push(' '.repeat(charCellWidth));
          codesCells.push(' '.repeat(codeWidth));
          continue;
        }

        var ch = String.fromCharCode(code);

        // Make non-printable visible if desired (for control range)
        if (code === 32 && showSpaceSymbol) ch = '␣'; // visible space
        else if (code < 32 || code === 127) {
          // represent control characters compactly like ^@ ^A etc (optional)
          // keep single-char width: use a placeholder like '·' to avoid misalignment
          if (!opts.showControlsLiteral) ch = '·';
        }

        charsCells.push(centerCharCell(ch, charCellWidth));
        codesCells.push(pad(code, codeWidth));
      }

      // join columns with separator and push: chars line, codes line, blank spacer line
      lines.push(charsCells.join(sep));
      lines.push(codesCells.join(sep));
      lines.push('\n'); // blank line between groups
    }

    var out = lines.join('\n');
    print(out);
    return out;
  }

  window._ascii_rendered = true;
  renderAscii(32, 126, 8, { showSpaceSymbol: false });

dosExit();
