function keyboard_js() {
  window.normalKeys = {
           "`":"`","[":"[", "]":"]", "\\":"\\","-":"-", "=":"=",
    "1":"1", "2":"2", "3":"3", "4":"4", "5":"5", "6":"6", "7":"7", "8":"8", "9":"9", "0":"0",
    "q":"q", "w":"w", "e":"e", "r":"r", "t":"t", "y":"y", "u":"u", "i":"i", "o":"o", "p":"p",
    "a":"a", "s":"s", "d":"d", "f":"f", "g":"g", "h":"h", "j":"j", "k":"k", "l":"l", "'":"'",
    "z":"z", "x":"x", "c":"c", "v":"v", "b":"b", "n":"n", "m":"m", ";":";",
                      " ":" ",                   ",":",", ".":".", "/":"/"
  };

  window.shiftedKeys = {
             "`":"~","\\":"|", "[":"{", "]":"}", "-":"_", "=":"+",
    "1":"!", "2":"@", "3":"#", "4":"$", "5":"%", "6":"^", "7":"&", "8":"*", "9":"(", "0":")",
    "q":"Q", "w":"W", "e":"E", "r":"R", "t":"T", "y":"Y", "u":"U", "i":"I", "o":"O", "p":"P",
    "a":"A", "s":"S", "d":"D", "f":"F", "g":"G", "h":"H", "j":"J", "k":"K", "l":"L", "'":'"',
    "z":"Z", "x":"X", "c":"C", "v":"V", "b":"B", "n":"N", "m":"M", ";":":",
                      " ":" ",                   ",":"<", ".":">", "/":"?"
  };

  window.altKeys = {
             "`":"¶", "[":"§", "]":"¼", "\\":"½","-":"*", "=":"/",
    "1":"1", "2":"2", "3":"3", "4":"4", "5":"5", "6":"6", "7":"7", "8":"8", "9":"9", "0":"0",
    "q":"Hm","w":"⬆", "e":"Ed","r":"Pu","t":"•", "y":"◘", "u":"4", "i":"5", "o":"6", "p":"-",
    "a":"⬅", "s":"⬇", "d":"➡", "f":"Pd","g":"○", "h":"◙", "j":"1", "k":"2", "l":"3", "'":"+",
    "z":"♪", "x":"♫", "c":"♀", "v":"♂", "b":"¿", "n":"‼", "m":".", ";":"0",
                                         " ":" ", ",":"«", ".":"»", "/":"☼"
  };

  window.altShiftKeys = {
             "`":"█", "[":"▌", "]":"▄","\\":"▀", "-":"▐", "=":"▬",
    "1":"▲", "2":"▼", "3":"◄", "4":"►", "5":"↑", "6":"↓", "7":"←", "8":"→", "9":"↔", "0":"↕ ",
    "q":"┌", "w":"┬", "e":"┐", "r":"│", "t":"╔", "y":"╦", "u":"╗", "i":"║", "o":"♥", "p":"♣",
    "a":"├", "s":"┼", "d":"┤", "f":"─", "g":"╠", "h":"╬", "j":"╣", "k":"═", "l":"♦", "'":"♠",
    "z":"└", "x":"┴", "c":"┘", "v":"☺", "b":"╚", "n":"╩", "m":"╝", ";":"☻",
    " ":" ", ",":"▓", ".":"▒", "/":"░"
  };

  window.keyboardData = [
    {id:"esc", label:"ESC", keyCode:27, x:47, y:446, width:52},
    {id:"backtick", label:"`", keyCode:192, x:103, y:446, width:28},
    {id:"open", label:"[", keyCode:219, x:132, y:446, width:28},
    {id:"close", label:"]", keyCode:221, x:160, y:446, width:28},
    {id:"backslash", label:"\\", keyCode:220, x:189, y:446, width:28},
    {id:"dash", label:"-", keyCode:173, x:218, y:446, width:28},
    {id:"equal", label:"=", keyCode:61, x:247, y:446, width:28},
    {id:"back", label:"BACK", keyCode:8, x:275, y:446, width:52},
    {id:"n1", label:"1", keyCode:49, x:47, y:480, width:28},
    {id:"n2", label:"2", keyCode:50, x:75, y:480, width:28},
    {id:"n3", label:"3", keyCode:51, x:103, y:480, width:28},
    {id:"n4", label:"4", keyCode:52, x:132, y:480, width:28},
    {id:"n5", label:"5", keyCode:53, x:160, y:480, width:28},
    {id:"n6", label:"6", keyCode:54, x:189, y:480, width:28},
    {id:"n7", label:"7", keyCode:55, x:218, y:480, width:28},
    {id:"n8", label:"8", keyCode:56, x:247, y:480, width:28},
    {id:"n9", label:"9", keyCode:57, x:275, y:480, width:28},
    {id:"n0", label:"0", keyCode:48, x:303, y:480, width:28},
    {id:"q", label:"q", keyCode:81, x:47, y:511, width:28},
    {id:"w", label:"w", keyCode:87, x:75, y:511, width:28},
    {id:"e", label:"e", keyCode:69, x:103, y:511, width:28},
    {id:"r", label:"r", keyCode:82, x:132, y:511, width:28},
    {id:"t", label:"t", keyCode:84, x:160, y:511, width:28},
    {id:"y", label:"y", keyCode:89, x:189, y:511, width:28},
    {id:"u", label:"u", keyCode:85, x:218, y:511, width:28},
    {id:"i", label:"i", keyCode:73, x:247, y:511, width:28},
    {id:"o", label:"o", keyCode:79, x:275, y:511, width:28},
    {id:"p", label:"p", keyCode:80, x:303, y:511, width:28},
    {id:"a", label:"a", keyCode:65, x:47, y:542, width:28},
    {id:"s", label:"s", keyCode:83, x:75, y:542, width:28},
    {id:"d", label:"d", keyCode:68, x:103, y:542, width:28},
    {id:"f", label:"f", keyCode:70, x:132, y:542, width:28},
    {id:"g", label:"g", keyCode:71, x:160, y:542, width:28},
    {id:"h", label:"h", keyCode:72, x:189, y:542, width:28},
    {id:"j", label:"j", keyCode:74, x:218, y:542, width:28},
    {id:"k", label:"k", keyCode:75, x:247, y:542, width:28},
    {id:"l", label:"l", keyCode:76, x:275, y:542, width:28},
    {id:"quote", label:"'", keyCode:222, x:303, y:542, width:28},
    {id:"z", label:"z", keyCode:90, x:47, y:573, width:28},
    {id:"x", label:"x", keyCode:88, x:75, y:573, width:28},
    {id:"c", label:"c", keyCode:67, x:103, y:573, width:28},
    {id:"v", label:"v", keyCode:86, x:132, y:573, width:28},
    {id:"b", label:"b", keyCode:66, x:160, y:573, width:28},
    {id:"n", label:"n", keyCode:78, x:189, y:573, width:28},
    {id:"m", label:"m", keyCode:77, x:218, y:573, width:28},
    {id:"colon", label:";", keyCode:59, x:247, y:573, width:28},
    {id:"enter", label:"ENTER", keyCode:13, x:275, y:573, width:52},
    {id:"caps", label:"CAPS", keyCode:20, x:47, y:604, width:52},
    {id:"space", label:"SPACE", keyCode:32, x:103, y:604, width:81},
    {id:"ctrl", label:"CTRL", keyCode:17, x:189, y:604, width:28},
    {id:"alt", label:"ALT", keyCode:18, x:218, y:604, width:28},
    {id:"comma", label:",", keyCode:188, x:247, y:604, width:28},
    {id:"dot", label:".", keyCode:190, x:275, y:604, width:28},
    {id:"slash", label:"/", keyCode:191, x:303, y:604, width:28}
  ];

  window.keyon = 1; window.caps = 0; window.shift = 0; window.ctrl = 0; window.alt = 0;
  window.ctrlPhysical = false; window.altPhysical = false; window.ctrlVirtual = false; window.altVirtual = false;
  window.modifierFlagBgColor = '#fff'; window.modifierFlagFgColor = '#000';
  window.modifierFlagBgColorOff = '#222'; window.modifierFlagFgColorOff = '#fff';
  window.modifierFlagBgColorPhysical = '#bbb'; window.keyboard = 1;
  window.LINE = ""; window.LINEX = 0; window.LINEY = 0; window.CURP = 0;
  window.SSTART = -1; window.SEND = -1;

  function _initKeys() {
    var container = document.getElementById(window.HOST ? 'host-keyboard' : 'guest-keyboard');
    if (!container) return;
    window.keyboardData.forEach(function(key) {
      var btn = document.createElement('div');
      var owner = window.HOST ? 'host' : 'guest';
      btn.id = owner + '-' + key.id;
      btn.dataset.keyChar = (key.label === 'SPACE') ? ' ' : (key.label.length === 1 ? key.label : '');
      btn.innerHTML = key.label;
      btn.className = (key.width === 28) ? 'k1' : (key.width === 52 ? 'k2' : (key.width === 81 ? 'k-space' : 'k-ctrl'));
      if (key.width === 40 || key.width === 81) btn.style.width = key.width + 'px';
      btn.style.left = key.x + 'px'; btn.style.top = key.y + 'px';
      btn.onclick = function() {
        var d = {keyCode: key.keyCode, shiftKey: !!window.shift, ctrlKey: !!window.ctrl, altKey: !!window.alt, source: 'virtual'};
        window.press(d); setTimeout(function() { window.pressup(d); }, 50);
      };
      container.appendChild(btn);
    });
  }
  _initKeys();

  window.updateKeyLabels = function() {
    var altActive = !!window.alt || !!window.altPhysical || !!window.altVirtual;
    var owners = ['host', 'guest'];
    window.keyboardData.forEach(function(key) {
      owners.forEach(function(owner) {
        var el = document.getElementById(owner + '-' + key.id); if (!el) return;
        var lookup = (el.dataset.keyChar || key.label).toLowerCase();
        var label = key.label;
        if (altActive) {
           if ((window.shift || window.caps) && window.altShiftKeys[lookup]) label = window.altShiftKeys[lookup];
           else if (window.altKeys[lookup]) label = window.altKeys[lookup];
        } else {
           if ((window.shift || window.caps) && window.shiftedKeys[lookup]) label = window.shiftedKeys[lookup];
           else if (window.normalKeys[lookup]) label = window.normalKeys[lookup];
        }
        el.textContent = label;
        if (key.id==='caps') { el.style.backgroundColor = window.caps?'#fff':''; el.style.color = window.caps?'#000':''; }
      });
    });
  };

  window.inkey = function() { return new Promise(function(res) { window._inkey_resolve = res; }); };

  (function(global) {
    var pending = null;
    global.input = function(echo) {
       return new Promise(function(res) { pending = {res:res, echo:echo!==false, buffer:""}; });
    };
    global.QandyKeyboard = { _pendingState: function() { return pending; }, acceptPending: function(v) { if(pending){pending.res(v); pending=null;} } };
  })(window);

  if (typeof window.qandySignalReady === 'function') window.qandySignalReady('keyboard.js');
}
