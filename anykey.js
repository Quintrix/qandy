RUN = "anykey.js";
try { if (typeof globalThis !== 'undefined') globalThis.RUN = RUN; else if (typeof window !== 'undefined') window.RUN = RUN; } catch (e) {}
print("Press Any Key:");
var RUN_done = false;
window.keydown=function(key, keyData) {
  if (RUN_done) return false;
  RUN_done = true;
  try { var k = (key && key.key) ? key.key : key; print(String(k)); } catch (e) {}
  try { if (typeof exit === 'function') exit(); else if (typeof window.__qandy_program_cleanup === 'function') window.__qandy_program_cleanup('anykey'); else { try { RUN = "qandy.js"; } catch (e) {} } } catch (e) {}
  try { if (typeof window !== 'undefined') { delete window.keydown; delete window.keyup; } } catch (e) {}
  return true;
}
