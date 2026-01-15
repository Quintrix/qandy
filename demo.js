
run="demo.js"; e=document.getElementById("run").innerHTML=run;
keyon=0; scr=""; cls(); print("<p>Welcome to Queville<p>&nbsp;(N)orth (E)ast<br>&nbsp;(S)outh (W)est<br>&nbsp;(I)nven (H)ealth<br>&nbsp;(M)ap<p>Press ESC key:<p>");
cdir=1; // character direction, 0=left, 1=right
pz=66; py=Math.floor(pz/mapx); px=pz-(py*mapx); po="";

// variables copied from Queville v.Zero
// variable "a" (armor) conflicted with qandy.js, changed to "t", which is no longer used as a timer 
var k=""; var i=0; var b=""; var c=0; var d=""; var g=""; var r=""; 
var x=7; var y=4; var h=10; var a=0; var s=0; var t=0; var m=0; var f=0;

atkr=document.createElement("img");
atkr.id="atkr";
atkr.src=item['Za']; 
atkr.className="item";
document.body.appendChild(atkr);

char("Joe","B0F0",pz);

mainloop(); function mainloop() {
 t1="Ga"; t2="Gg"; t3="Gb"; t4="Gd"; // grass
 if (scr=="") {
  if (x<6) { 
   if (y<5) {
    map=""; t1="Ta"; t2="Tf"; t3="Tj"; t4="Tb"; // swamp
   } else { 
    f=0; t1="Oj"; t2="Oj"; t3="Oj"; t4="Oj"; // mountain
   }
  } else { 
   if (y<5) { 
    f=0; t1="Ga"; t2="Gg"; t3="Gb"; t4="Gd"; // grass
   } else {
    t1="Ca"; t2="Cp"; t3="Kj"; t4="Kb"; // desert
   }
  }
  for (z=0; z<96; z++) { a=Math.floor(Math.random()*(8-1)+1); switch (a) {
   case 1: if (Math.floor(Math.random()>.8)) { scr=scr+t1; } else { scr=scr+t1; } break;
   case 2: if (Math.floor(Math.random()>.8)) { scr=scr+t2; } else { scr=scr+t1; } break; 
   case 3: if (Math.floor(Math.random()>.8)) { scr=scr+t3; } else { scr=scr+t1; } break;  
   case 4: if (Math.floor(Math.random()>.8)) { scr=scr+t4; } else { scr=scr+t1; } break; 
   case 5: if (Math.floor(Math.random()>.8)) { scr=scr+t1; } else { scr=scr+t1; } break; 
   case 6: if (Math.floor(Math.random()>.8)) { scr=scr+t1; } else { scr=scr+t1; } break; 
   case 7: if (Math.floor(Math.random()>.8)) { scr=scr+t1; } else { scr=scr+t1; } break; 
  }}
  gfx(scr); 
 }
 if (d=="") {
  c=Math.random(); 
  if (c>.9) { 
   d="Va";
  } else {
   if (c>.85) {
    d="Vb";
   } else {
 	 if (c>.8) {
     d="Vc";
  	 } else {
  	  if (c>.75) { d="Vd"; }
    }
   }
  }
 }
 
 if (d != "") {
  pop("<p><img src="+item[d]+"><p>Attack "+ItemID(d)+"?<p>Press Yes or No");
 } else {
  if (x==9 && y==3) { if (t==0) { t=1; pop("<p>Found<p><img src=\""+item['Pj']+"\"><p>"+ItemID("Pj")); }}
  if (x==3 && y==7) { if (s==0) { s=1; pop("<p>Found<p><img src=\""+item['Ob']+"\"><p>"+ItemID("Ob")); }}
  if (x==9 && y==7) { if (m==0) { m=1; pop("<p>Found<p><img src=\""+item['Re']+"\"><p>"+ItemID("Re")); }}
  if (x==3 && y==3) {
   if (f==0) { 
    if (h<10) {
     f=1; h=h+1; if(h>10) { h=10; }
     pop("FOUND FOOD!<p><img src=\""+item['Jc']+"\"><p>HEALTH "+h+"0%");
    }
   }
  }     
 }
}

function north() {
 pop("North"); scr=""; y=y-1; if (y<0) { y=9; }
 if (py==9) { pz=pz-32; py=py-4; }
 if (cdir==0) { char("Joe","A0E0",pz); } else { char("Joe","B0F0",pz); } 
 PUV=setTimeout("document.getElementById('pop').style.visibility='hidden';",1000);
 PUV=setTimeout("mainloop();",1000);
}
function south() {
 pop("South<br>"); scr=""; y=y+1; if (y>9) { y=0; }
 if (py==5) { pz=pz+32; py=py+4; }
 if (cdir==0) { char("Joe","A0E0",pz); } else { char("Joe","B0F0",pz); }
 PUV=setTimeout("document.getElementById('pop').style.visibility='hidden';",1000);
 PUV=setTimeout("mainloop();",1000);
}
function east() {
 pop("East<br>"); scr=""; x=x+1; if (x>11) { x=0; }
 if (px==3) { px=6; pz=pz+3; } 
 char("Joe","B0F0",pz); cdir=1;
 PUV=setTimeout("document.getElementById('pop').style.visibility='hidden';",1000);
 PUV=setTimeout("mainloop();",1000);
}
function west() {
 pop("West<br>"); scr=""; x=x-1; if (x<0) { x=11; }
 if (px==6) { px=3; pz=pz-3; }
 char("Joe","A0E0",pz); cdir=0;
 PUV=setTimeout("document.getElementById('pop').style.visibility='hidden';",1000);
 PUV=setTimeout("mainloop();",1000);
}

function popmap() {
  pop("x="+x+", y="+y);
}

function health() {
 pop("Health is "+h+"0%");
}

function inven() {
 if (s) { d=d+"<img src=\""+item['Pj']+"\">"; }
 if (t) { d=d+"<img src=\""+item['Ob']+"\">"; }
 if (m) { d=d+"<img src=\""+item['Re']+"\">"; }
 if (d!="") {
  pop(d); d=""; 
 } else {
  pop("NO INVEN");
 }
}
 
function hit() {
 if (d!="") {
  objy=Math.floor(54/mapx); objx=54-(objy*mapx); print("");
  e=document.getElementById("atkr").style.top=64+22+(objy*32)+"px";
  e=document.getElementById("atkr").style.left=64+22+(objx*32)+"px";
  e=document.getElementById("atkr").src=item[d];
  if (Math.random()>.7) {
   if (m) { h=h-1; } else { h=h-2; }
   if (h<1) {
    e=document.getElementById("atkr").src=item['Za'];
    pop(ItemID(d)+" kills you!<p>GAME OVER<p>Press ENTER:<p>");
   } else {
    pop(ItemID(d)+" hits you!");
    PUV=setTimeout("document.getElementById('pop').style.visibility='hidden';",1000);
    PUV=setTimeout("hit();",1250);
   }
  } else {
   if (Math.random()>.7) {
    pop("You miss "+ItemID(d)); 
    PUV=setTimeout("document.getElementById('pop').style.visibility='hidden';",1000);
    PUV=setTimeout("hit();",1250); 
   } else {
    if (Math.random()>.7) {
     pop(ItemID(d)+" died");
     c=0; d="";
     e=document.getElementById("atkr").src=item['Za'];
     PUV=setTimeout("document.getElementById('pop').style.visibility='hidden';",1000);
     PUV=setTimeout("mainloop();",1250); 
    } else {
     if (s) {
      if (Math.random()>.8) {
       pop(ItemID(d)+" died!");
       c=0; d="";
       e=document.getElementById("atkr").src=item['Za'];
       PUV=setTimeout("document.getElementById('pop').style.visibility='hidden';",1000);
       PUV=setTimeout("mainloop();",1250); 
      } else {
       pop("You hit "+ItemID(d)+"!");
       PUV=setTimeout("document.getElementById('pop').style.visibility='hidden';",1000);
       PUV=setTimeout("hit();",1250);
      } 
     } else {
      pop("You hit "+ItemID(d)+"!");
      PUV=setTimeout("document.getElementById('pop').style.visibility='hidden';",1000);
      PUV=setTimeout("hit();",1250);
     } 
    } 
   }  
  } 
  //if (d!="" && h>0) {
  // PUV=setTimeout("hit();",1000);
  //} else {
  // if (h>0) {
  //  PUV=setTimeout("mainloop();",1000);
  // }
  //}
 }
}

function retreat() {
 if (Math.random()>.7) {
  if (m) { h=h-1; } else { h=h-2; }
  if (h<1) {
   pop(ItemID(d)+" kills you!<p>GAME OVER<p>Press ENTER:<p>");
  } else {
   pop(ItemID(d)+" hits you!");
   PUV=setTimeout("document.getElementById('pop').style.visibility='hidden';",1000);
   PUV=setTimeout("hit();",1250);
  }
 } else { 
  c=0; d=""; e=document.getElementById('pop').style.visibility='hidden'; mainloop();
 }
}

function input(l) {
 line=""; if (mode=="txt") { mode="gfx"; }
 keyon=0; print("");
}

function keydown(key) {
 if (d!="") { 
  if (key=="y") { hit(); } else { retreat(); }
 } else { 
  if (key=="n") { north(); }
  if (key=="s") { south(); }
  if (key=="e") { east(); }
  if (key=="w") { west(); }
  if (key=="m") { popmap(); }
  if (key=="h") { health(); }
  if (key=="i") { inven(); }
  if (key==" ") { e=document.getElementById('pop').style.visibility='hidden'; }
 }
  
 if (key=="enter") {
  if (h<1) {
   k=""; i=0; b=""; c=0; d=""; g=""; r=""; x=7; y=4; h=10; a=0; s=0; t=0; m=0; f=0; scr=""; 
   e=document.getElementById('pop').style.visibility='hidden';
   mainloop();
  }
 }
} 
