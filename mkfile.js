
//
// mkfile.js is meant to be executed by the user of qandy-host.htm
// it's purpose is to provide a way to make text files that get saved
// to the localStorage as files on the Qandy Pocket Computer.
//
// to make this easy, we start with name="", after we test code to write a file,
// we can test code to load a file.

mkfile("");

function mkfile(name) {

  if (RUN != "qandy.js") { return "Error: busy\n"; } // ensure another script is not already running
  
  RUN="mkfile.js"; // directs user input to mkfile()
  
  cls(); // clears screen and sets CURX and CURY to 0,0
  
  // these BBCode tags need to be converted to ANSI escape codes to work with pokeMenu
  pokeMenu("  [yellow]N[white]ew  [yellow]S[white]ave  [yellow]Q[white]uit  ");

}


function keydown(keyCode, event) {
  // ctrl-n == new
  // ctrl-s == save
  // ctrl-q == quit
  // ctrl-z == quit (windows eof, undocumented feature)	
}

//
// need to issue an await input() call, display input on screen allowing for 
// qandy.js to accept the input. 
//
// the tricky part will be intercepting or disabling the cursor up/down keys
// so that instead of performing the default action of going through the
// command history, it will move the cursor to the line above the current
// one being edited, thus allowing to use the full screen to write/edit and 
// save text files.
//
// it may be better to just use inkey() and let the script move the cursor
// manually, the CURX CURY CURFG CURBG and CURATTR varaibles are all global
// so that should be possible, but then we'd also have to write code to
// handle each key like home, end, delete, insert, cut, paste, etc. 
//

//
// unpredictable behavior if a line is over 800 characters, will figure
// out what to do in that situation
//
