
run="queville.js";
e=document.getElementById("run").innerHTML=run;

keyon=1; print("<p>Welcome to Queville<p>Enter your name:<br>"); 

map=""; t1="Ta"; t2="Tf"; t3="Tj"; t4="Tb"; // swamp
map=""; t1="Ca"; t2="Cp"; t3="Kj"; t4="Kb"; // desert
map=""; t1="Oj"; t2="Oj"; t3="Oj"; t4="Oj"; // mountain
map=""; t1="Ga"; t2="Gg"; t3="Gb"; t4="Gd"; // grass

for (z=0; z<96; z++) {
 a=Math.floor(Math.random()*(8-1)+1); switch (a) {
  case 1: if (Math.floor(Math.random()>.8)) { map=map+t1; } else { map=map+t1; } break;
  case 2: if (Math.floor(Math.random()>.8)) { map=map+t2; } else { map=map+t1; } break; 
  case 3: if (Math.floor(Math.random()>.8)) { map=map+t3; } else { map=map+t1; } break;  
  case 4: if (Math.floor(Math.random()>.8)) { map=map+t4; } else { map=map+t1; } break; 
  case 5: if (Math.floor(Math.random()>.8)) { map=map+t1; } else { map=map+t1; } break; 
  case 6: if (Math.floor(Math.random()>.8)) { map=map+t1; } else { map=map+t1; } break; 
  case 7: if (Math.floor(Math.random()>.8)) { map=map+t1; } else { map=map+t1; } break; 
 }
}

gfx();

char("Joe","A0E0",50);

function input(l) {
 line=""; if (mode=="txt") { mode="gfx"; }
 keyon=0; print("");
}

function click(z) {
 alert(z);
 // move here image
 //
}

