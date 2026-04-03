
//
// script needs to create this div
// <div id="pop" class="pop" onMouseOver='PopUpVis="visible";' onMouseOut='PopUpVis=PForce; PUV=setTimeout("document.getElementById(\"pop\").style.visibility=PopUpVis;",100);'></div>
//

var PopAlign = "click"; // "center", "click"
var PopUpVis = "hidden"; // current target visibility
var PForce = "hidden";   // forced visibility on mouseout in your original code
var PUV;                 // timeout id (used to clear/set the timeout)

var mapx=7;
var mapy=11;

const style = document.createElement('style');
style.textContent = `
.pop { position:absolute; top:260; left:190; z-index:249;
       font-family: arial; font-size: 14px; weight: bold;
       color: navy; background-color: #999; visibility:hidden;
       text-align: center;
       padding-top: 0px; padding-bottom: 0px;  
       padding-right: 4px; padding-left: 4px; }
.tile { position: absolute; top: 0px; left: 0px; }
.item { position: absolute; top: 0px; left: 0px; }
.char { position: absolute; top: 0px; left: 0px; }
`;
document.head.appendChild(style);

const popup = document.createElement('div');
popup.id = 'pop';
popup.className = 'pop';
popup.style.visibility = PopUpVis;
popup.addEventListener('mouseover', () => {
  PopUpVis = "visible";
  popup.style.visibility = PopUpVis;
});
popup.addEventListener('mouseout', () => {
  PopUpVis = PForce;
  clearTimeout(PUV);
  PUV = setTimeout(() => { popup.style.visibility = PopUpVis; }, 100);
});
document.body.appendChild(popup);

function tiles() {
  // Use the host's map dimensions, but the tile count is mapx+1, mapy+1
  const tileCountX = (typeof mapx !== 'undefined') ? mapx + 1 : 7;
  const tileCountY = (typeof mapy !== 'undefined') ? mapy + 1 : 11;
   

  let topOffset = 50;   
  let leftOffset = 54;  

  // remove any existing tiles
  let cleanupIndex = 0;
  while (true) {
    const old = document.getElementById('T' + cleanupIndex);
    if (!old) break;
    old.parentNode && old.parentNode.removeChild(old);
    cleanupIndex++;
  }

  // create tiles: 0 to mapx = mapx+1 tiles, 0 to mapy = mapy+1 tiles
  for (let z=0, y=0; y < tileCountY; y++) {
    for (let x=0; x < tileCountX; x++, z++) {
      const t=document.createElement('img');
      t.id = 'T' + z;
      t.src = 't/Ga.png';  
      t.style.height = '32px';
      t.style.width = '32px';
      t.className = 'tile';
      t.style.position = 'absolute';
      t.style.top = (topOffset + y * 32) + 'px';
      t.style.left = (leftOffset + x * 32) + 'px';
      t.style.zIndex = '10';
      const tileZ = z;
      t.onclick = function() { dispatchZClick(tileZ, t); };
      document.body.appendChild(t);
    }
  }
}
 

// run tiles() once DOM is ready (device layout is fixed, so one-time placement is fine)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', tiles);
} else {
  tiles();
}

function gfx(scr) { 
 a=0;
 for (b=0; b<=mapy; b++) { 
  for (c=0; c<=mapx; c++) {
  	 e=document.getElementById("T"+a).src="t/"+scr.charAt(a*2)+scr.charAt((a*2)+1)+".png";
  	 a++;
  }
 }
}

function hpop() { document.getElementById("pop").style.visibility="hidden"; }

function pop(htm) {
  const popup = document.getElementById("pop");
  popup.innerHTML = "<p>" + htm;
  
  const TopYPos = 32 + 22; 
  const TopXPos = 32 + 22;
  
  // Get popup dimensions after setting content
  popup.style.visibility = "visible"; // Make visible to measure
  const popupWidth = popup.offsetWidth;
  const popupHeight = popup.offsetHeight;
  
  let PopX, PopY;
  
  switch (PopAlign) {
    case "center":
      // Center on the 256x384 game screen
      PopX = TopXPos + ((256 - popupWidth) / 2);
      PopY = TopYPos + ((384 - popupHeight) / 2);
      break;
      
    case "click":
      // Display at the clicked z-location
      if (typeof lastClickedZ !== 'undefined') {
        const clickY = Math.floor(lastClickedZ / (mapx + 1));
        const clickX = lastClickedZ - (clickY * (mapx + 1));
        PopX = TopXPos + (clickX * 32);
        PopY = TopYPos + (clickY * 32);
        
        // Keep popup within screen bounds
        if (PopX + popupWidth > TopXPos + 256) {
          PopX = TopXPos + 256 - popupWidth;
        }
        if (PopY + popupHeight > TopYPos + 384) {
          PopY = TopYPos + 384 - popupHeight;
        }
        if (PopX < TopXPos) PopX = TopXPos;
        if (PopY < TopYPos) PopY = TopYPos;
      } else {
        // Fallback to center if no click location
        PopX = TopXPos + ((256 - popupWidth) / 2);
        PopY = TopYPos + ((384 - popupHeight) / 2);
      }
      break;
      
    default:
      // Default to center
      PopX = TopXPos + ((256 - popupWidth) / 2);
      PopY = TopYPos + ((384 - popupHeight) / 2);
  }
  
  popup.style.top = PopY + "px";
  popup.style.left = PopX + "px";
}

function char(C,O,Z) {
 let y=Math.floor(Z/(mapx+1)); let x=Z-(y*(mapx+1)); y--;
 idface="cf"+C; idbody="cb"+C; idwpn="cw"+C; idarm="ca"+C; idhat="ch"+C;
 face=""; body=""; wpn=""; arm=""; hat="";

 if (O.indexOf("A")>-1) { face="A"+O.charAt(O.indexOf("A")+1); }
 if (O.indexOf("B")>-1) { face="B"+O.charAt(O.indexOf("B")+1); }
 if (O.indexOf("E")>-1) { face="E"+O.charAt(O.indexOf("E")+1); }
 if (O.indexOf("F")>-1) { face="F"+O.charAt(O.indexOf("F")+1); }

 if (O.indexOf("C")>-1) { body="C"+O.charAt(O.indexOf("C")+1); }
 if (O.indexOf("D")>-1) { body="D"+O.charAt(O.indexOf("D")+1); }
 if (O.indexOf("G")>-1) { body="G"+O.charAt(O.indexOf("G")+1); }
 if (O.indexOf("H")>-1) { body="H"+O.charAt(O.indexOf("H")+1); }

 if (document.getElementById("cb"+C)) {
  e=document.getElementById("cb"+C).src="c/"+body+".png";
  e=document.getElementById("cb"+C).style.top=32+22+(y*32)+"px";
  e=document.getElementById("cb"+C).style.left=(32+22+(x*32))+"px";
 } else {
  let chr=document.createElement("img");
  chr.id="cb"+C; chr.src="c/"+body+".png";
  chr.className="char";  
  chr.style.position="absolute"; chr.style.height=64; chr.style.width=32;
  chr.style.top=32+22+(y*32)+"px"; chr.style.left=(32+22+(x*32))+"px";
  chr.onclick=function(){dispatchZClick(Z,this);};
  chr.style.zIndex="150";  
  document.body.appendChild(chr);
 }
 if (document.getElementById("cf"+C)) {
  e=document.getElementById("cf"+C).src="c/"+face+".png";
  e=document.getElementById("cf"+C).style.top=32+22+(y*32)+"px";
  e=document.getElementById("cf"+C).style.left=(32+22+(x*32))+"px";
 } else {
  let chr=document.createElement("img");
  chr.id="cf"+C; chr.src="c/"+face+".png";
  chr.className="char";  
  chr.style.position="absolute"; chr.style.height=64; chr.style.width=32;
  chr.style.top=32+22+(y*32)+"px"; chr.style.left=(32+22+(x*32))+"px";
  chr.onclick=function(){dispatchZClick(Z,this);};
  chr.style.zIndex="151";
  document.body.appendChild(chr);
 }

 if (O.indexOf("I")>-1) { hat="I"+O.charAt(O.indexOf("I")+1); }
 if (O.indexOf("J")>-1) { hat="J"+O.charAt(O.indexOf("J")+1); }
 if (hat) {
  if (document.getElementById("ch"+C)) {
   e=document.getElementById("ch"+C).src="c/"+hat+".png";
   e=document.getElementById("ch"+C).style.top=32+22+(y*32)+"px";
   e=document.getElementById("ch"+C).style.left=(32+22+(x*32))+"px";
  } else {
   let chr=document.createElement("img");
   chr.id="ch"+C; chr.src="c/"+hat+".png";
   chr.className="char";  
   chr.style.position="absolute"; chr.style.height=64; chr.style.width=32;
   chr.style.top=32+22+(y*32)+"px"; chr.style.left=(32+22+(x*32))+"px";
   chr.onclick=function(){dispatchZClick(Z,this);};
   chr.style.zIndex="152";
   document.body.appendChild(chr);
  } 
 } else {
  if (document.getElementById("ch"+PName)) { document.getElementById("ch"+PName).remove(); } 
 }
}

function ItemID(I) {
 switch (I) {
  case "Aa": return "Travel Boots"; break;
  case "Ab": return "Hiking Boots"; break;
  case "Ac": return "Swamp Boots"; break;
  case "Ad": return "Mountain Boots"; break;
  case "Ae": return "Lava Boots"; break;
  case "Bd": return "Bucket"; break;
  case "Be": return "Lantern"; break;
  case "Cg": return "Log"; break;
  case "Ek": return "Bucket of Tar"; break;
  case "El": return "Bucket of Water"; break;
  case "Fa": return "Tomato"; break;
  case "Fb": return "Tomatoes"; break;
  case "Fc": return "Tomatoes"; break;
  case "Fd": return "Tomatoes"; break;
  case "Jc": return "Candy"; break;
  case "Ka": return "Plant"; break;
  case "Kf": return "Bread"; break;
  case "La": return "DevTeam Hat"; break;
  case "Lb": return "Player Hat"; break;
  case "Lc": return "Player Hat"; break;
  case "Ld": return "Red Bandana"; break;
  case "Lg": return "Blue Bandana"; break;
  case "Ma": return "Cylon Helmet"; break;
  case "Mb": return "Cylon Helmet"; break;
  case "Md": return "Mask"; break;
  case "Ob": return "Shield"; break; 
  case "Pj": return "Sword"; break;
  case "Re": return "Medicine"; break;
   
  case "Va": return "Spider"; break;
  case "Vb": return "Mosquito"; break;
  case "Vc": return "Scorpion"; break;
  case "Vd": return "Fire Ant"; break;
  case "Yb": return "Cart"; break;
  case "Yc": return "Furnace"; break;
  case "Ye": return "Seeds"; break;
  case "Yi": return "Goblin Village"; break;  
  case "Ze": return "Teleport"; break
  case "Zf": return "Sign"; break
  case "Zg": return "Pier"; break  
  case "Zi": return "Fire Pit"; break;  
  case "Zj": return "Fire"; break;
  case "Zh": return "Well"; break;
  case "Zm": return "City"; break
 } 
}

function dispatchZClick(z, clickedElement) {
  // Store the clicked location for popup positioning
  window.lastClickedZ = z;
  
  let y = Math.floor(z / (mapx + 1)); 
  let x = z - (y * (mapx + 1));
  let itemType = 'tile';
  
  if (clickedElement) {
    if (clickedElement.className === 'char') {
      itemType = 'character';
    } else if (clickedElement.id && clickedElement.id.charAt(0) === 'i' &&
               clickedElement.id.length > 1 && !isNaN(parseInt(clickedElement.id.charAt(1), 10))) {
      itemType = 'item';
    } else if (clickedElement.id && clickedElement.id.charAt(0) === 'd' &&
               clickedElement.id.length > 1 && !isNaN(parseInt(clickedElement.id.charAt(1), 10))) {
      itemType = 'droppedItem';
    }
  }
  
  const event = new CustomEvent('zclick', {
    detail: {
      z: z,
      x: x,
      y: y,
      itemType: itemType,
      itemData: {},
      clickedElement: clickedElement
    }
  });
  document.dispatchEvent(event);
  if (typeof window.zclick === 'function') {
    window.zclick(z, event);
  }
}

async function LMap(a) {
 if (maps[a]) {} else { maps[a]="UaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUaUa.."; }
 gfx(maps[a]);
 items=[]; if (maps[a].length>194) { ilist=maps[a].substring(194).match(/.{1,6}/g); }
 for (b=0;b<ilist.length;b++) {
  i=ilist[b].substring(0,2);
  z=ilist[b].substring(2,4);
  d=ilist[b].substring(4,6);
  y=Math.floor(z/(mapx+1));
  x=z-(y*(mapx+1));
  c=document.createElement("img");
  c.id="i"+b;
  c.src="i/"+ilist[b].substring(0,2)+".png";
  c.style.position="absolute";
  c.style.top=32+20+(y*32)+"px";
  c.style.left=(32+22+(x*32))+"px";
  c.style.zIndex="120";
  c.onload = () => { c.style.top = parseInt(c.style.top) - (c.height - 32) + "px"; c.style.left = parseInt(c.style.left) - (c.width - 32) + "px"; };
  (function(itemZ){c.onmousedown=function(){dispatchZClick(parseInt(itemZ,10),this);};})(z);
  document.body.appendChild(c);
 }
 RefDItems();
 if (PName && PObj) { 
  try { 

   await qdosSave('player-name', PName);
   await qdosSave('player-obj', PObj);
   await qdosSave('player-wear', PWear);
   await qdosSave('player-inv', PInv);
   await qdosSave('player-map', PMap);
   await qdosSave('player-z', String(PZ));
  } catch(e) {}
 }
 return maps[a];
}
