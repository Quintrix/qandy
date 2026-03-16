RUN="ascii.js"

cls();
print("[-black]\n[bold][bgreen]  ╔══════════════════════════╗\n");
print("  ║        [yellow]ASCII CHART[bgreen]       ║\n");
print("  ╚══════════════════════════╝\n");

var asciiStart=32;
var asciiEnd=40;

var char=""; 
var code="";

for (ascii=asciiStart; ascii++; ascii<asciiEnd) {
  char=" "+String.fromCharCode(ascii)+"  ";
  code=pad(ascii,3)+" ";
}

print(char+"\n");
print(code+"\n\n");

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



dosExit();
