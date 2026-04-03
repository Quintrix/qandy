
//
// script needs to create this div
// <div id="pop" class="pop" onMouseOver='PopUpVis="visible";' onMouseOut='PopUpVis=PForce; PUV=setTimeout("document.getElementById(\"pop\").style.visibility=PopUpVis;",100);'></div>
//

var PopUpVis = "hidden"; // current target visibility
var PForce = "hidden";   // forced visibility on mouseout in your original code
var PUV;                 // timeout id (used to clear/set the timeout)

var mapx=7;
var mapy=11;

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
 e=document.getElementById("pop").innerHTML="<p>"+htm;
 TopYPos=32+22; TopXPos=32+22;
 
 PopAlign="center";
 
 switch (PopAlign) {
  case "char":
   PopY=TopYPos+(PY*32)+8; PopX=TopXPos+(PX*32)+32; 
   if (PopY<TopYPos) { PopY=TopYPos; } if (PopY<TopYPos+10) { PopY=TopYPos+10; }
   if (PopX<TopXPos) { PopX=TopXPos; } if (PopX<TopXPos+10) { PopX=TopXPos+10; }
   if (PopX+document.getElementById("pop").scrollWidth>TopXPos+256) { PopX=(TopXPos+256)-document.getElementById("PopUp").scrollWidth; }
   if (PopY+document.getElementById("pop").scrollHeight>TopYPos+384) { PopY=(TopYPos+384)-document.getElementById("PopUp").scrollHeight; }
   break;
   // width: 256px; height: 384px;
  case "center":
   PopX=TopXPos+((256-document.getElementById("pop").scrollWidth)/2);
   PopY=TopYPos+((384-document.getElementById("pop").scrollHeight)/2);
   break;
  case "click":
   PopY=Math.floor(PopClick/(MapSizeX+1));
   PopX=PopClick-(PopY*(MapSizeX+1));
   PopY=(PopY*32)+22; PopX=(PopX*32)+22;
   if (PopX+document.getElementById("PopUp").scrollWidth>TopXPos+424) { PopX=(TopXPos+424)-document.getElementById("PopUp").scrollWidth; }
   if (PopY+document.getElementById("PopUp").scrollHeight>TopYPos+300) { PopY=(TopYPos+300)-document.getElementById("PopUp").scrollHeight; }
   break;
 }  
 document.getElementById("pop").style.top=PopY; 
 document.getElementById("pop").style.left=PopX;
 document.getElementById("pop").style.visibility="visible";
 //poptimer=setTimeout('document.getElementById("pop").style.visibility="visible";',200);
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
 let y = Math.floor(z / (mapx + 1)); let x = z - (y * (mapx + 1));
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
