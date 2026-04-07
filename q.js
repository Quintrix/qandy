RUN="queville.js"; 

var now=new Date(); function pad(num) { return num.toString().padStart(2, '0'); }

var mode="txt"; // old qandy.htm used this as a global, new qandy.htm does not use it 

var AllowScroll=1;
var ALlowMove=1;

var PName="";
var NInv=16;
var PInv="LaZaZaZaZaZaZaZaZaZaZaZaZaZaZaZa";
var PObj="";
var PWear=""; 
var PMap="Ck";
var PX=3;
var PY=7;
var PZ=(PY*(mapx+1))+PX;
var walk=-1;
var Que="";
 
var TMode=0;
var TFill="";

var objs=[];
var ilist=[]; 
var dlist=[]; 

var world=0;
var map="";
var maps=[];
var sign=[];
var drop=[]; 

//script=document.createElement('script');
//script.src="world.js";
//document.head.appendChild(script);

qdosScript("gfx.js");
qdosScript("world.js");

login();

async function login() {
 await sleep(2000);
 await print("\nWelcome to Queville\n\nEnter your player name:\n");
 while (true) {
  var l = await input();
  if (l.length<3) {
   await print("Name must be at least three characters.<br>Enter your player name:<br>");
  } else if (l.substring(0,3).toUpperCase()==="BOT") {
   await print("Name cannot start with BOT.<br>Enter your player name:<br>");
  } else {
   await gfxInit();
   PName=l;
   PForce="visible";
   NewChar("");
   await LMap(PMap);
   cls();
   await print("Latest Updates:\n\n");
   await print("Wear Sysop Hat to access Sysop Menu and Sysop Help.\n\n");
   await print("Type /help for list of Sysop commands.\n\n");
   await print("Type /help [command] for help on that command.\n\n");
   await print("Have Fun!<p>Press [ESC] Key:");
   return;
  }
 }
}

function oldinput(l) {
 k=1; if (PName) {
  if (PWear.indexOf("La")>-1) {
  	if (l.charAt(0)=="/") {
  	 codes=[]; codes=l.split(" ");
    if (codes[0].substr(0, 2)=="/t") { EraseAll(); PMap=codes[1]; LMap(PMap); char(PName,PObj,PZ); }
    if (codes[0].substr(0, 2)=="/i") {
     if (codes[2]) { 
      maps[PMap]=maps[PMap]+codes[1]+PZ+codes[2];
     } else { 
      maps[PMap]=maps[PMap]+codes[1]+PZ+"..";
     }
     EraseAll();
     LMap(PMap);
     char(PName,PObj,PZ);
    } 
    if (codes[0].substr(0, 2)=="/d") { b=new Date(); c=new Date(b.getTime()+60*1000); tstamp=pad(c.getMinutes())+pad(c.getSeconds()); if (drop[PMap]) { if (drop[PMap].indexOf("--------")>-1) { drop[PMap]=drop[PMap].replace("--------", codes[1]+PZ+tstamp); } else { drop[PMap]=drop[PMap]+codes[1]+PZ+tstamp; }} else { drop[PMap]=codes[1]+PZ+tstamp; }}
    if (codes[0].substr(0, 2)=="/s") { if (codes[1]) { sign[PMap]=l.substring(l.indexOf(" ")+1); pop(sign[PMap]); } else { sign[PMap]=""; }}
    if (codes[0].substr(0, 2)=="/e") { TileMode(); }  
    if (codes[0].substr(0, 2)=="/c") { CopyWorld(); }
    if (codes[0].substr(0, 2)=="/h") {
     if (codes[1]) {
     	if (codes[1].charAt(0)=="t") {
       cls(); print("\nTeleport:\n\n");
       print(" /t [xx]\n\n");
       print("Where [xx] is the two-character map code to teleport to.\n\n");
       print("Map codes are a capital letter followed by a lower case letter.\n\n");
       print("City codes have a symbol instead of a lower case letter.\n\n");
      } 
      if (codes[1].charAt(0)=="i") {
       cls(); print("\nAdd Static Item:\n\n");
       print(" /i [xx] ..\n");
       print("[xx] is the two-character item code of the item.\n\n");
       print("And .. is any optional data that item may need.\n\n");
      }
      if (codes[1].charAt(0)=="d") {
       cls(); print("\nAdd Dynamic Item:\n\n");
       print(" /d [xx]\n\n");
       print("Where [xx] it the two-character item code of the item.\n\n");
       print("Dynamic items disappear after sixty seconds.\n\n");
      }
      if (codes[1].charAt(0)=="s") {
       cls(); print("\nEdit Sign Text:\n\n");
       print(" /s [text]\n\n");
       print("Will update the sign text with [text].\n\n");
       print("There can only be one sign per map screen.\n\n");
      }
     } else {
      cls();
      print("\nSysop Commands:\n\n");
      print(" /tele [xx]\n");
      print(" /item [xx] [..]\n");
      print(" /drop [xx]\n");
      print(" /sign [text]\n");
      print(" /copy world.js\n\n");
     }
    }
   }
  } else {
  	if (l.charAt(0)=="/") {
  	 cls(); print("Help System:<p>");
  	 print("Click on the map to move avatar.<p>");
  	 print("Click on items to use them, ie: Teleport<p>");
  	 print("Wear Sysop Hat for Sysop Menu, use /help for Sysop Help.<p>");
   }  
  }
  if (l=="") { hpop(); }
 } else {
  if (l.length<3) {
   print("Name must be at least three characters.<br>Enter your name:<br>");
  } else {
  	// make this BOT check upper or lower case, bot is reserved for bot participants
   if (l.substring(0,2)=="BOT") {
    print("Name cannot start with BOT.<br>Enter your name:<br>");
   } else {
    PName=l;
    mode="gfx";
    PForce="visible";
    NewChar("");
    LMap(PMap);
    cls();
    print("Latest Updates:\n\n");
    print("Wear Sysop Hat to access Sysop Menu and Sysop Help.\n\n");
    print("Type /help for list of Sysop commands.\n\n");
    print("Type /help [command] for help on that command.\n\n");
    print("Have Fun!<p>Press [ESC] Key:");
   }
  }
 }	
}

function loop() {
 // draw all charcaters
 // draw all items that move?
}

function NewChar(a) {
 PopForce="visible";
 if (a=="M") {
  PUP="Select Character:<p>";
  PUP=PUP+"<a href=\"javascript:NewChar(\'B0\');\"><img src=\"c/B0.png\" height=64 width=32></a> &nbsp; ";
  PUP=PUP+"<a href=\"javascript:NewChar(\'B1\');\"><img src=\"c/B1.png\" height=64 width=32></a> &nbsp; ";
  PUP=PUP+"<a href=\"javascript:NewChar(\'B2\');\"><img src=\"c/B2.png\" height=64 width=32></a><br>";
  PUP=PUP+"<a href=\"javascript:NewChar(\'B3\');\"><img src=\"c/B3.png\" height=64 width=32></a> &nbsp; ";
  PUP=PUP+"<a href=\"javascript:NewChar(\'B4\');\"><img src=\"c/B4.png\" height=64 width=32></a> &nbsp; ";
  PUP=PUP+"<a href=\"javascript:NewChar(\'B5\');\"><img src=\"c/B5.png\" height=64 width=32></a> &nbsp; ";
  PUP=PUP+"<a href=\"javascript:NewChar(\'B6\');\"><img src=\"c/B6.png\" height=64 width=32></a><p>";
  PUP=PUP+"<a href=\"javascript:NewChar(\'\');\">Go Back</a><p>";
  pop(PUP);
 } else {
  if (a=="F") {
   PUP="Select Character:<p>";
   PUP=PUP+"<a href=\"javascript:NewChar(\'F0\');\"><img src=\"c/F0.png\" height=64 width=32></a> &nbsp; ";
   PUP=PUP+"<a href=\"javascript:NewChar(\'F1\');\"><img src=\"c/F1.png\" height=64 width=32></a> &nbsp; ";
   PUP=PUP+"<a href=\"javascript:NewChar(\'F2\');\"><img src=\"c/F2.png\" height=64 width=32></a><br>";
   PUP=PUP+"<a href=\"javascript:NewChar(\'F3\');\"><img src=\"c/F3.png\" height=64 width=32></a> &nbsp; ";
   PUP=PUP+"<a href=\"javascript:NewChar(\'F4\');\"><img src=\"c/F4.png\" height=64 width=32></a> &nbsp; ";
   PUP=PUP+"<a href=\"javascript:NewChar(\'F5\');\"><img src=\"c/F5.png\" height=64 width=32></a> &nbsp; ";
   PUP=PUP+"<a href=\"javascript:NewChar(\'F6\');\"><img src=\"c/F6.png\" height=64 width=32></a><p>";
   PUP=PUP+"<a href=\"javascript:NewChar(\'\');\">Go Back</a><p>";
   pop(PUP);
  } else {
  	if (a.length==2) {
  	 if (a.charAt(0)=="F") { PObj=a+"H0"; } else { PObj=a+"D0"; }
    char(PName,PObj,PZ); PForce="hidden"; hpop(); mainloop();
  	} else {  	
    PX=2; PY=9; PZ=(PY*(mapx+1))+PX;
    pop("<p>Male or Female?<br><a href=\"javascript:NewChar(\'M\');\"><img src=\"c/B1.png\" height=128 width=64></a> &nbsp; <a href=\"javascript:NewChar(\'F\');\"><img src=\"c/F5.png\" height=128 width=64></a>");
   }
  }
 }
}

function mainloop() {
 if (walk>-1) {
  walkY=Math.floor(walk/(mapx+1));
  walkX=walk-(walkY*(mapx+1));
  newZ=PZ; newX=PX; newY=PY; newD="";
  if (PX>walkX) { disX=PX-walkX; } else { disX=walkX-PX;}
  if (PY>walkY) { disY=PY-walkY; } else { disY=walkY-PY; }
  if (disX>disY) {
  	if (PX>walkX) { newX=PX-1; newZ=PZ-1; newD="L"; }
   if (PX<walkX) { newX=PX+1; newZ=PZ+1; newD="R"; }
  } else {
   if (PY>walkY) { newY=PY-1; newZ=PZ-(mapx+1); }
   if (PY<walkY) { newY=PY+1; newZ=PZ+(mapx+1); }
  }
  AllowMove=1;
  
  if (newY<0) { AllowMove=0; }
  if (newY>mapy) { AllowMove=0; }
  if (newX<0) { AllowMove=0; }
  if (newX>mapx) { AllowMove=0; }
  
  // get tile for newz
  // is tile restricted?
  // does player have correct boots?
  
  newT=maps[PMap].slice(newZ*2,(newZ*2)+2);
  if (newT.charAt(0)>="V") { AllowMove=0; }  
  if (newT.charAt(0)=="R") { if (PInv.indexOf("Ab")<0) { AllowMove=0; }}
  if (newT.charAt(0)=="S") { if (PInv.indexOf("Ad")<0) { AllowMove=0; }}
  
  if (TMode) { AllowMove=1; } if (PWear) { if (PWear.indexOf("La")>-1) { AllowMove=1; }}
  
  if (AllowMove) {
   PY=newY; PX=newX; PZ=newZ;
   if (newD=="R") { PObj=FaceR(PObj); } else { if (newD=="L") { PObj=FaceL(PObj); }}
   char(PName,PObj,PZ);
   if (TMode) {
    pop(PZ+" "+maps[PMap].slice(PZ*2,(PZ*2)+2));
    if (TFill) { maps[PMap]=maps[PMap].slice(0,PZ*2)+TFill+maps[PMap].slice((PZ*2)+2,maps[PMap].length); gfx(maps[PMap]); }
   }
   if (walk==PZ) {
    walk=-1; if (Que) { eval(Que); Que=""; }
   }
   
   if (AllowScroll==0) {
    AllowScroll=1;
    if (PX==0)    { AllowScroll=0; }
    if (PX==mapx) { AllowScroll=0; }
    if (PY==0)    { AllowScroll=0; }
    if (PY==mapy) { AllowScroll=0; }
   }
   if (TMode) { AllowScroll=0; }

   if (AllowScroll) {
    if(PX==0)    { AllowScroll=0; walk=-1; stimer=setTimeout('West();',400); }
    if(PX==mapx) { AllowScroll=0; walk=-1; stimer=setTimeout('East();',400); }
    if(PY==0)    { AllowScroll=0; walk=-1; stimer=setTimeout('North();',400); }
    if(PY==mapy) { AllowScroll=0; walk=-1; stimer=setTimeout('South();',400); }
   } 
  }
 }
 if (drop[PMap]) { RefDItems(); } 
 maintimer=setTimeout('mainloop();',200); 
}

function WalkHere(i) {
  HPOP(); PopForce="hidden"; MoveTo=1; DynItem="";
  MoveToY=Math.floor(i/(MapSizeX+1));
  MoveToX=i-(MoveToY*(MapSizeX+1));
  document.getElementById("MH").style.left=MoveToX*32+15;
  document.getElementById("MH").style.top=MoveToY*32+15;
  document.getElementById("MH").style.visibility="visible";
  HideObjs=setTimeout('document.getElementById("MH").style.visibility="hidden";',250);
}

function FaceR(a) {
 a=a.replaceAll("A", "B");
 a=a.replaceAll("C", "D");
 a=a.replaceAll("E", "F"); 
 a=a.replaceAll("G", "H");
 a=a.replaceAll("I", "J");
 return a;
}

function FaceL(a) {
 a=a.replaceAll("B", "A");
 a=a.replaceAll("D", "C");
 a=a.replaceAll("F", "E"); 
 a=a.replaceAll("H", "G");
 a=a.replaceAll("J", "I");
 return a;
}

function StepHere(a) {
  if (Retreat==0) { if (TradeOn==0) {
    Que="";
    Skill=""; IStamp=CStamp;
    HPOP(); MoveTo=1;
    MoveToY=Math.floor(a/(MapSizeX+1));
    MoveToX=a-(MoveToY*(MapSizeX+1));
  }}
}
 
function RefDItems() {
 if (drop[PMap]) {
  newdrop=0; dlist=drop[PMap].match(/.{1,8}/g);
  now=new Date(); tstamp=pad(now.getMinutes())+pad(now.getSeconds());

  for (b=0;b<dlist.length;b++) { 
   i=dlist[b].substring(0,2); z=dlist[b].substring(2,4); d=dlist[b].substring(4,8);
   if (tstamp>d) { 
    newitem=ExpItem(i);
    if (newitem!="--------") { 
     if (newitem=="Za") { 
      dlist[b]="--------"; if (document.getElementById("d"+b)) { document.getElementById("d"+b).remove(); }
     } else {     	
      if (document.getElementById("d"+b)) { document.getElementById("d"+b).remove(); }
      c=new Date(); e=new Date(c.getTime()+60*1000); f=pad(e.getMinutes())+pad(e.getSeconds());
      dlist[b]=newitem+z+f;
     } 
    } else {
     dlist[b]="--------"; if (document.getElementById("d"+b)) { document.getElementById("d"+b).remove(); }
    }
    newdrop=1;
   } else {
    y=Math.floor(z/(mapx+1)); x=z-(y*(mapx+1));
    if (!document.getElementById("d"+b)) { 
     c=document.createElement("img");
     c.id="d"+b;
     c.src="i/"+i+".png";
     c.style.position="absolute";
     c.style.top=32+20+(y*32)+"px";
     c.style.left=(32+22+(x*32))+"px";
     c.onload=function() { this.style.top=parseInt(this.style.top)-(this.height-32)+"px"; this.style.left=parseInt(this.style.left)-(this.width-32)+"px"; }
     (function(itemZ){c.onmousedown=function(){dispatchZClick(parseInt(itemZ,10),this);};})(z);
     document.body.appendChild(c);
    }
   }
  }
  if (newdrop) {
   newdrop=""; for (b=0;b<dlist.length;b++) { newdrop=newdrop+dlist[b]; }
   while (newdrop.endsWith("--------")) { newdrop=newdrop.slice(0, -8); }
   drop[PMap]=newdrop; console.log(drop[PMap]); 
  }   
 }
}  

function ExpItem(a) {
 switch (a) {
  case "Fe": return "Ka"; break;
  case "Fa": if (Math.random()>.8) { return "Ka"; } else { return "Za"; } break;
  case "Fb": if (Math.random()>.6) { return "Ka"; } else { return "Za"; } break;
  case "Fc": if (Math.random()>.4) { return "Ka"; } else { return "Za"; } break;
  case "Fd": if (Math.random()>.2) { return "Ka"; } else { return "Za"; } break;
  case "Ka": 
  if (Math.random()>.8) {
  	return "Fd";
  } else {
   if (Math.random()>.8) {
    return "Fc";
   } else {
    if (Math.random()>.8) {
     return "Fd";
    } else {
     return "Za";
    }
   }  
  }
  break;
 }
 return "--------"; 
}

function EraseAll() {
 for (b=0;b<ilist.length;b++) { if (document.getElementById("i"+b)) { document.getElementById("i"+b).remove(); }} ilist=[];
 if (drop[PMap]) {
  dlist=drop[PMap].match(/.{1,8}/g);  
  for (b=0;b<dlist.length;b++) {
 	i=dlist[b].substring(0,2);
 	if (document.getElementById("d"+b)) { document.getElementById("d"+b).remove(); }
  }
 }
 dlist=[];
 if (document.getElementById("cf"+PName)) { document.getElementById("cf"+PName).remove(); }
 if (document.getElementById("cb"+PName)) { document.getElementById("cb"+PName).remove(); }
 if (document.getElementById("ch"+PName)) { document.getElementById("ch"+PName).remove(); }
 if (document.getElementById("cw"+PName)) { document.getElementById("cw"+PName).remove(); }
 if (document.getElementById("ca"+PName)) { document.getElementById("ca"+PName).remove(); }
}

function North() {
 EraseAll();
 a=PMap.charCodeAt(0);
 b=PMap.charCodeAt(1);
 if (b<97) {+new Date();
  XCity(a,b);
 } else {
  a=a-1; if (a<65) { a=90; }
  PMap=String.fromCharCode(a)+String.fromCharCode(b);
  PY=11; PZ=88+PX; 
  LMap(PMap); char(PName,PObj,PZ);
 }
}

function South() {
 EraseAll();
 a=PMap.charCodeAt(0);
 b=PMap.charCodeAt(1);
 if (b<97) {
  XCity(a,b);
 } else {
  a=a+1; if (a>90) { a=65; }
  PMap=String.fromCharCode(a)+String.fromCharCode(b);
  PY=0; PZ=PX; 
  LMap(PMap); char(PName,PObj,PZ);
 }
}

function East() {
 EraseAll();
 a=PMap.charCodeAt(0);
 b=PMap.charCodeAt(1);
 if (b<97) {
  XCity(a,b);
 } else { 
  b=b+1; if (b>122) { b=97; }
  PMap=String.fromCharCode(a)+String.fromCharCode(b);
  PX=PX-mapx; PZ=PZ-mapx; 
  LMap(PMap); char(PName,PObj,PZ);
 }
} 	
 	
function West() {
 EraseAll();
 a=PMap.charCodeAt(0);
 b=PMap.charCodeAt(1);
 if (b<97) {
  XCity(a,b);
 } else {
  b=b-1; if (b<97) { b=122; }
  PMap=String.fromCharCode(a)+String.fromCharCode(b);
  PX=PX+(mapx); PZ=PZ+(mapx); 
  LMap(PMap); char(PName,PObj,PZ);
 }
}

function XCity(a,b) {
 b=b+58; PMap=String.fromCharCode(a)+String.fromCharCode(b);
 EraseAll();
 LMap(PMap);
 for (b=0;b<ilist.length;b++) {
  if (ilist[b].substring(0,2)=="Zm") { PZ=parseInt(ilist[b].substring(2,4)); PY=Math.floor(PZ/(mapx+1)); PX=PZ-(PY*(mapx+1)); }
 }
 qdosSave('player-z', String(PZ)).catch(function(){});
 char(PName,PObj,PZ);
}

function TileMode() {
 TMode=1-TMode;
 if (TMode==1) {
  keyon=0; 
  pop("Tile Editor Enabled");
 } else {
  keyon=1;
  pop("Tile Editor Off");
 }
}

function TileFill() {
 if (TFill=="") {
  TFill=maps[PMap].slice(PZ*2,(PZ*2)+2);
  pop("Tile Fill On<p>"+TFill);
 } else {
  TFill="";  
  pop("Tile Fill Off");
 }	
}

function EdgeTiles() {
 pop("Not Working<br>Perl code not<br>translating well.");
 
 // a=PMap.charCodeAt(0); b=PMap.charCodeAt(1);
 // b=b+1; if (b>122) { b=97; }
 // c=String.fromCharCode(a)+String.fromCharCode(b);
 // NMap=maps[PMap];
 // for (i=0;i<mapy+1;i++) {
 // NMap = NMap.substring(0,(i*14)*2)+ 
 //        maps[c].substring(((i*9)*2)+16,((i*9)*2)+18) + 
 //        NMap.substring(((i*14)*2)+2);
 // }
 // gfx(NMap); 
  
 // 
 //  NMap=maps[PMap].slice(0,mapx*2)+
 //       maps[c].slice(mapx*2,(mapx*2)+2)+
 //       maps[PMap].slice((8*i)+2,maps[PMap].length);
 //
 // } 
 // gfx(NMap);
 // $FirstMap=$CharMap;
 // $Map=$FORM{'I'};
 // $EdgeMap=$Map;
 // if ($y==-1) { $y="9"; } $CharMap="$x$y"; &LoadMap; for ($i=0;$i<9;$i++) { substr($EdgeMap,($i*14)*2,2)=substr($Map,(($i*14)*2)+26,2); }
 // $x=substr($FirstMap,0,1); $y=substr($FirstMap,1,1)+1; if ($y==10) { $y="0"; } $CharMap="$x$y"; &LoadMap; for ($i=0;$i<9;$i++) { substr($EdgeMap,(($i*14)*2)+26,2)=substr($Map,($i*14)*2,2); }
 // $x=chr(ord(substr($FirstMap,0,1))-1); $y=substr($FirstMap,1,1); if ($x eq "@") { $x="Z"; } $CharMap="$x$y"; &LoadMap; $EdgeMap=substr($Map,252,280).substr($EdgeMap,28,280);
 // $x=chr(ord(substr($FirstMap,0,1))+1); $y=substr($FirstMap,1,1); if ($x eq "[") { $x="A"; } $CharMap="$x$y"; &LoadMap; $EdgeMap=substr($EdgeMap,0,252).substr($Map,0,28);
 // $CharMap=$FirstMap; print "parent.Map=\"$EdgeMap\"; parent.RefMap=1; \n";

 // $x=substr($FirstMap,0,1);
 // $y=substr($FirstMap,1,1)-1;
 // if ($y==-1) { $y="9"; }
 // $CharMap="$x$y";
 // &LoadMap; 
 // for ($i=0;$i<9;$i++) {
 //  substr($EdgeMap,($i*14)*2,2)=substr($Map,(($i*14)*2)+26,2);
 // }
}

function SaveMap() {
 MCode=document.createElement('input');
 MCode.value=maps[PMap];
 document.body.appendChild(MCode);
 MCode.select();
 MCode.setSelectionRange(0, 99999);
 try {
  document.execCommand('copy');
  pop("Map "+PMap+" copied to clipboard");
 } catch (err) {
  pop("Clipboard Error,<br>Browser Issue");
 }
 document.body.removeChild(MCode);
}

function keydown(key, event) {
  // Handle both old format (string) and new format (event object)
  let k;
  if (typeof event === 'string') {
    // Old format - direct key string
    k = event;
  } else {
    // New format - event object
    k = event.key.toLowerCase();
    
    // Map special keys to expected format
    switch(event.key) {
      case 'Escape': k = 'esc'; break;
      case 'ArrowLeft': k = 'left'; break;
      case 'ArrowRight': k = 'right'; break;
      case 'ArrowUp': k = 'up'; break;
      case 'ArrowDown': k = 'down'; break;
      case 'Enter': k = 'enter'; break;
    }
  }
  
  // Handle ESC key to toggle between text and graphics screen
  if (k === 'esc') {
    if (mode === 'txt') {
      mode = 'gfx';
      document.getElementById('txt').style.top = '50px';
      document.getElementById('txt').style.left = '350px';
    } else {
      mode = 'txt';
      document.getElementById('txt').style.top = '50px';
      document.getElementById('txt').style.left = '54px';
    }
    return; // Don't process further
  }
  
  // Tile editor mode
  if (TMode) {
    if (k.length === 1) {
      const charCode = k.charCodeAt(0);
      if (charCode > 64 && charCode < 91) {
        // Uppercase letters - update first character of tile
        maps[PMap] = maps[PMap].slice(0, PZ * 2) + k + maps[PMap].slice((PZ * 2) + 1, maps[PMap].length);
        LMap(PMap);
      } else if (charCode > 96 && charCode < 123) {
        // Lowercase letters - update second character of tile
        maps[PMap] = maps[PMap].slice(0, (PZ * 2) + 1) + k + maps[PMap].slice((PZ * 2) + 2, maps[PMap].length);
        LMap(PMap);
      }
    }
    if (k === 'enter') {
      TileMode();
    }
    return; // Don't process movement in tile mode
  }
  
  // Movement controls
  if (k === 'left') { walk = PZ - 1; }
  if (k === 'right') { walk = PZ + 1; }
  if (k === 'up') { walk = PZ - (mapx + 1); }
  if (k === 'down') { walk = PZ + (mapx + 1); }
}

function zclick(z, event) {
 if (event.detail.itemType === 'character') {
  MenuChar(z);
 } else if (event.detail.itemType === 'item' || event.detail.itemType === 'droppedItem') {
  MenuItem(z);
 } else {
  if (PObj) { hpop(); walk = z; }
 }
}

function MenuItem(IZ) {
 PUP="";
 
 if (drop[PMap]) {
  dlist=drop[PMap].match(/.{1,8}/g);
  for (b=0;b<dlist.length;b++) {
   i=dlist[b].substring(0,2); z=dlist[b].substring(2,4); d=dlist[b].substring(4,8);
   if (IZ==z) { PUP=PUP+"<a href='javascript:GetDItem(\""+b+"\");'>"+ItemID(i)+"<br>"; }
  }
 } 
 
 for (b=0;b<ilist.length;b++) {
  i=ilist[b].substring(0,2);
  z=ilist[b].substring(2,4);
  d=ilist[b].substring(4,6);
  if (IZ==z) {
  	PUP=PUP+"<a href='javascript:ClickItem(\""+ilist[b]+"\");'>"+ItemID(i)+"<br>";
  	if (PWear) { if (PWear.indexOf("La")>-1) { PUP=PUP+"<a href='javascript:DelItem(\""+ilist[b]+"\");'>Delete "+ItemID(i)+"<br>"; }} 
  }
 }
 pop(PUP);
}

function GetDItem(b) {
 dlist=drop[PMap].match(/.{1,8}/g);
 i=dlist[b].substring(0,2); z=dlist[b].substring(2,4); d=dlist[b].substring(4,8);
 if (i!="--") {
  if (z!=PZ) {
   walk=z; Que="GetDItem("+b+");";
  } else {
   a=PInv.indexOf("Za");
   if (a>-1) {
    newdrop=""; dlist[b]="--------"; 
    for (c=0;c<dlist.length;c++) { newdrop=newdrop+dlist[c]; }
    while (newdrop.endsWith("--------")) { newdrop=newdrop.slice(0, -8); }
    drop[PMap]=newdrop; 
  	 if (document.getElementById("d"+b)) { document.getElementById("d"+b).remove(); }
    PInv=PInv.replace("Za", i);
    Inven();
   }
   //i=dlist[b].substring(0,2); z=dlist[b].substring(2,4); d=dlist[b].substring(4,8);
  }
 } 
} 

function ClickItem(a) {
 hpop();
 i=a.substring(0,2); z=a.substring(2,4); d=a.substring(4,6);
 if (PZ!=z) {
  Que="ClickItem(\""+a+"\");"; walk=z;
 } else {
  if (i>="Fa"&&i<="Fd") { PlantTomato(a); }
  if (i<="Sz") { GetItem(a); }
  if (i=="Zh") { PInv=PInv.replace("Bd", "El"); Inven(); }
  if (i=="Zi") {
  	if (PInv.indexOf("Cg")>-1) { 
    PInv=PInv.replace("Cg", "Zj"); Inven();
    pop("<img src=\"i/Zj.png\">");
    stimer=setTimeout('hpop();',1000);
   }
  }   
  if (i=="Zm") { EraseAll(); a=PMap.charCodeAt(0); b=PMap.charCodeAt(1); if (b>96&&b<123) { PMap=String.fromCharCode(a)+String.fromCharCode(b-58); } if (d>-1&&d<96) { PZ=parseInt(d); PY=Math.floor(PZ/(mapx+1)); PX=PZ-(PY*(mapx+1)); } AllowScroll=0; LMap(PMap); char(PName,PObj,PZ); }
  if (i=="Ze") { EraseAll(); PMap=d; LMap(PMap); for (b=0;b<ilist.length;b++) { if (ilist[b].substring(0,2)=="Ze") { PZ=parseInt(ilist[b].substring(2,4)); PY=Math.floor(PZ/(mapx+1)); PX=PZ-(PY*(mapx+1)); qdosSave('player-z', String(PZ)).catch(function(){}); }} char(PName,PObj,PZ); }
  if (i=="Zf") { pop(sign[PMap]); }
  if (i=="Zg") { if (d!="..") { Fish(a); }}
  if (i=="Yb") {
   PUP="Free Clothes<br>"; a="C"; if (PObj.indexOf("D")>-1) { a="D"; } else { if (PObj.indexOf("G")>-1) { a="G"; } else { if (PObj.indexOf("H")>-1) { a="H"; }}}
   PUP=PUP+"<a href=\"javascript:clothes(\'0\');\"><img src=\"c/"+a+"0.png\"></a>";
   PUP=PUP+"<a href=\"javascript:clothes(\'1\');\"><img src=\"c/"+a+"1.png\"></a><br>";
   PUP=PUP+"<a href=\"javascript:clothes(\'2\');\"><img src=\"c/"+a+"2.png\"></a>";
   PUP=PUP+"<a href=\"javascript:clothes(\'3\');\"><img src=\"c/"+a+"3.png\"></a>";
   PUP=PUP+"<a href=\"javascript:clothes(\'4\');\"><img src=\"c/"+a+"4.png\"></a>";
   pop(PUP);
  }
  if (i=="Ye") { 
   if (PInv.indexOf("Fe")<0) { 
    PUP="Put this on the<br>ground, and it will<br>grow into a<br>tomato plant<br><img src=\"Fe.png\">";
    pop(PUP); PInv=PInv.replace("Za", "Fe");  
   } else {
   	pop("Empty");
   }
  }
  if (i=="Yi") { EraseAll(); a=PMap.charCodeAt(0); b=PMap.charCodeAt(1); if (b>96&&b<123) { PMap=String.fromCharCode(a)+String.fromCharCode(b-58); } if (d>-1&&d<96) { PZ=parseInt(d); PY=Math.floor(PZ/(mapx+1)); PX=PZ-(PY*(mapx+1)); } LMap(PMap); char(PName,PObj,PZ); }
 }
}

function Teleport(a) {
 EraseAll(); PMap=a; LMap(PMap);
 for (b=0;b<ilist.length;b++) {
  if (ilist[b].substring(0,2)=="Ze") {
  	PZ=parseInt(ilist[b].substring(2,4)); PY=Math.floor(PZ/(mapx+1)); PX=PZ-(PY*(mapx+1));
  	qdosSave('player-z', String(PZ)).catch(function(){});
  }
 }
 char(PName,PObj,PZ);
}

function PlantTomato(a) {
 // plant one tomato, reduce tomato item by one
 i=PInv.substring(a*2,(a*2)+2);
 newitem=""; if (i=="Fd") {
  newitem="Fc";
 } else {
  if (i=="Fc") {
  	newitem="Fb";
  } else {
  	if (i=="Fb") {
    newitem="Fa";
   } else {
    if (i=="Fa") {
     newitem="Za";	
    }
   }
  }
 }
 if (newitem) {
  // drop plant, change inventory 
  b=new Date(); c=new Date(b.getTime()+60*1000); tstamp=pad(c.getMinutes())+pad(c.getSeconds());
  if (drop[PMap]) {  
   if (drop[PMap].indexOf("--------")>-1) {  
    drop[PMap]=drop[PMap].replace("--------", "Fa"+PZ+tstamp);
   } else { 
    drop[PMap]=drop[PMap]+"Fa"+PZ+tstamp;
   }
  } else {   
   drop[PMap]="Fa"+PZ+tstamp;
  }
  i=PInv.substring(a*2,(a*2)+2); PInv=PInv.replace(i, newitem); Inven();
 }
}

function clothes(b) {
 a="C"; if (PObj.indexOf("D")>-1) { a="D"; } else { if (PObj.indexOf("G")>-1) { a="G"; } else { if (PObj.indexOf("H")>-1) { a="H"; }}}
 PObj=PObj.substring(0,PObj.indexOf(a))+a+b+PObj.substring(PObj.indexOf(a)+2);
 // update PWear here
 hpop(); char(PName,PObj,PZ);
}

function MenuChar(z) {
 PUP="";
 if (TMode) {
  PUP=PUP+"<a href=\"javascript:TileFill();\">Tile Fill</a><br>";
  PUP=PUP+"<a href=\"javascript:EdgeTiles();\">Edge Tiles</a><br>";
  PUP=PUP+"<a href=\"javascript:SaveMap();\">Export Tiles</a><br>";
  PUP=PUP+"<a href=\"javascript:TileMode();\">Exit Tile Edit</a><br>";
 } else {
  PUP=PUP+"<a href=\"javascript:Inven();\">Inventory</a><br>";
  if (PWear) { if (PWear.indexOf("La")>-1) {
   PUP=PUP+"<a href=\"javascript:Sysop();\">Sysop Menu</a><br>";
  }
  PUP=PUP+"<a href=\"javascript:Quit(0);\">Quit Game</a><br>";
 }}
 pop(PUP);
}

function GetItem(a) {
 i=a.substring(0,2); z=a.substring(2,4); d=a.substring(4,6);
 for (a=0;a<ilist.length;a++) {
  b=ilist[a].substring(0,2); c=ilist[a].substring(2,4);
  if (c==PZ) { if (b==i) { document.getElementById("i"+a).remove(); } }
 }
 PInv=PInv.replace("Za", i); 
}

function Inven(Ci) {
 PUP="Player Inventory:<p>";
 for (a=0; a<NInv; a++) {
  PUP=PUP+"<a href=\"javascript:ClickInv("+a+");\"><img src=\"i/"+PInv.substring(a*2,(a*2)+2)+".png\"></a>";
  if ((a+1)%4===0) { PUP=PUP+"<br>"; }
 }
 pop(PUP);
}

function ClickInv(a) {
 i=PInv.substring(a*2,(a*2)+2);
 PUP=ItemID(i)+"<p><img src=\"i/"+i+".png\"><br>";
 if (i>="Fa"&&i<="Fe") { PUP=PUP+"<a href=\"javascript:PlantTomato("+a+");\">Plant</a> &nbsp; "; }
 if (i>="La"&&i<="Pz") { if (PWear.indexOf(i)>-1) { PUP=PUP+"<a href=\"javascript:Remove("+a+");\">Remove</a> &nbsp; "; } else { PUP=PUP+"<a href=\"javascript:Wear("+a+");\">Wear</a> &nbsp; "; }}
 PUP=PUP+"<a href=\"javascript:Drop("+a+");\">Drop</a>";
 pop(PUP);
}

function Drop(a) {
 i=PInv.substring(a*2,(a*2)+2); PInv=PInv.replace(i, "Za"); Inven();
 b=new Date(); c=new Date(b.getTime()+60*1000); tstamp=pad(c.getMinutes())+pad(c.getSeconds());
 if (drop[PMap]) {  
  if (drop[PMap].indexOf("--------")>-1) {  
   drop[PMap]=drop[PMap].replace("--------", i+PZ+tstamp);
  } else { 
   drop[PMap]=drop[PMap]+i+PZ+tstamp;
  }
 } else {   
  drop[PMap]=i+PZ+tstamp;
 }
 //RefDItems();
}

function Wear(a) {
 i=PInv.substring(a*2,(a*2)+2);
 b=String.fromCharCode(i.charCodeAt(1)-49);
 PObj=FaceL(PObj); 
 if (i.indexOf("L")>-1) {
  if (PObj.indexOf("I")>-1) { PObj=PObj.substring(0,PObj.indexOf("I"))+"I"+b+PObj.substring(PObj.indexOf("I"+2)); } else { PObj=PObj+"I"+b; }
  if (PWear.indexOf("L")>-1) { PWear=PWear.replace(/L./g, i) } else { PWear=PWear+i; }}
 hpop(); char(PName,PObj,PZ);
}

function Remove(a) {
 i=PInv.substring(a*2,(a*2)+2);
 b=String.fromCharCode(i.charCodeAt(1)-49);
 PObj=FaceL(PObj); 
 if (i.indexOf("L")>-1) {
  if (PObj.indexOf("I")>-1) { PObj=PObj.replace(/I./g, ""); }
  if (PWear.indexOf("L")>-1) { PWear=PObj.replace(/L./g, ""); }
 }
 hpop(); char(PName,PObj,PZ);
}

function Sysop(a) {
 PUP="<a href=\"javascript:TileMode();\">Edit Tiles</a><br>";
 PUP=PUP+"<a href=\"javascript:AddItem(\'\');\">Add Item</a><br>";
 PUP=PUP+"<a href=\"javascript:Teleport(\'D1\');\">Sysop Room</a><br>";
 PUP=PUP+"<a href=\"javascript:CopyWorld();\">Copy world.js</a><br>";
 pop(PUP);
}

function AddItem(a) {
 if (a=="") {
  PUP="<a href=\"javascript:AddItem(\'Ze\');\">Teleport</a><br>";
  PUP=PUP+"<a href=\"javascript:AddItem(\'Zf\');\">Sign</a><br>";
  PUP=PUP+"<a href=\"javascript:AddItem(\'Zg\');\">Pier</a><br>";
  PUP=PUP+"<a href=\"javascript:AddItem(\'Zm\');\">City</a><br>";
  PUP=PUP+"<a href=\"javascript:AddItem(\'Za\');\">Other</a><br>";
  pop(PUP);  
 } else {
  out="";
  if (a=="Za") { out="Add Item:<p>Use the tile set viewer to get the two-character item-code and enter it here. <p>"; b="/item "; }
  if (a=="Ze") { out="Add Teleport:<p>Type the teleport map destination (two character code) and press ENTER.<p>"; b="/item Ze "; }
  if (a=="Zf") { out="Add Sign:<p>Type the text on the sign and press ENTER.<p>"; b="/sign "+PMap+" "; } // add sign first here!!
  if (a=="Zg") { out="Add Fishing Pier:<p>Type the fish code for this pier, and press ENTER.<p>Leave blank for no fish.<p>"; b="/item Zg "; }
  if (a=="Zm") { out="Add City Gates:<p>Type the z-location for player to enter and press ENTER.<p>Leave blank to use z-location of the gates. <p>"; b="/item Zm "; }
  if (out) { line=b; mode="txt"; cls(); print(out); }
 }
}

function CopyWorld() {
 js="";
 for (a=65; a<90; a++) {
  for (b=97; b<123; b++) {
   m=String.fromCharCode(a)+String.fromCharCode(b);
   if (maps[m]) { js=js+"maps[\""+m+"\"]=\""+maps[m]+"\";\n"; }
   if (sign[m]) { js=js+"sign[\""+m+"\"]=\""+sign[m]+"\";\n"; }
   m=String.fromCharCode(a)+String.fromCharCode(b-58);
   if (maps[m]) { js=js+"maps[\""+m+"\"]=\""+maps[m]+"\";\n"; }
   if (sign[m]) { js=js+"sign[\""+m+"\"]=\""+sign[m]+"\";\n"; }
  }
 }
 MCode=document.createElement('textarea');
 MCode.value=js;
 document.body.appendChild(MCode);
 MCode.select();
 MCode.setSelectionRange(0, 99999);
 try {
  document.execCommand('copy');
  pop("world.js copied to clipboard");
 } catch (err) {
  pop("Clipboard Error,<br>Browser Issue");
 }
 document.body.removeChild(MCode);
}

function DelItem(a) {
 pop("<a href=\"javascript:YesDelete(\'"+a+"\');\">Delete "+ItemID(a.substring(0,2))+"?</a>");  
}

function YesDelete(a) {
 hpop(); i=a.substring(0,2); z=a.substring(2,4); d=a.substring(4,6);
 items=[]; if (maps[PMap].length>194) { b=maps[PMap].substring(194); } 
 c=b.replace(i+z+d, "");  
 maps[PMap]=maps[PMap].substring(0,194)+c;
 EraseAll(); LMap(PMap); char(PName,PObj,PZ);
} 

function Fish(a) {
 alert("fishing");
}

async function Quit(a) {
 if (a==0) {
  PUP="This will delete<br>you localSession.<p>Are you sure?<p>";
  PUP=PUP+"<a href=\"javascript:Quit(1);\">Yes, Quit Game</a>";
 } else {
  await qdosDelete('player-name');
  await qdosDelete('player-obj');
  await qdosDelete('player-wear');
  await qdosDelete('player-inv');
  await qdosDelete('player-map');
  await qdosDelete('player-z');
  stimer=setTimeout('location.reload();',1000);
 }
 pop(PUP);
}
