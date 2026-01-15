

Qandy Pocket Computer v.1a
Quintrix and Crew Software


The Qandy emulates a pocket sized computer
with a built-in ROM set of RPG graphics that you
can use to program your own games in JavaScript.
The Qandy script and all included graphics are
Open Source and can be embedded into a single
.htm file for you to easily share your game with
others. It does this by embedding the images into
the script itself as base64 strings. 

The Qandy has a JavaScript operating system, if
you enter alert("hello world"); it will execute
the code and display "hello world". 

Enter the name of an external JavaScript file, 
it will execute the file, type "demo.js" (no
quotes) to load and run the Queville v.ZERO
demo on the Qandy.

The name of the script running is displayed on the
keyboard LED, if run=0 then the Qandy script executes
input, but if run=1 then it passes input to the
input(line) and keydown(key) functions which are
expected to be within the script being run. 

To access the JavaScript console while a script 
is running, use the web browser's built in console,
ctrl-shift-k on Firefox. Here you can execute
debug code like alert(variable); to check the 
value of variables while your script is running.

To see all avaialble images in the tileset, open
the qandy-tileset.htm page in a web browser.
It will display all available ground tiles, items,
and characters. This list will be populated with
all the tiles and items from the beloved massively
multiplayer version of Queville that has been
offline for years now and we are working to remap
all of Queville on the Qandy. 

Note that the scripts do not use the images in the
.zip files, they are there for reference purposes.
To change an image, you must convert the image
into a base64 string, then change the string
in the qandy-gfx.js script.

To get a single .htm page, the external
qandy-gfx.js script can be embedded into the
qandy.js script. This is a long script that uses
a lot of memory, so DevTeam uses it as an
external script until release.      

Known issues: if the eval([input]) results in an
error, and the txt screen becomes corrupt. 



Qandy Pocket Computer built-in Functions:

     print(txt); prints text to the text screen

          cls(); clears the text scrren.

     gfx(tiles); draws tiles on the map, tiles being 
                 a string of two-character tile codes,
                 one for each z-location on the sceen.
   
   ItemID(item); Returns the name of an item code.
                
 char(id,obj,z); Draws a character with a unique ID at
                 the z-location on the gfx map, obj
                 is a series of two-character item codes.
                 A face and a body should always be included,
                 a weapon, a shield, and a hat are optional.
                 If you call the char() function and
                 the id has already been displayed, it
                 updates the obj images and it's z-location.
                 
                 *note the demo only displays one male
                 character and only his face and body. The
                 images must be edited before they can be
                 included, working on it. There will 
                 also be routines to delete an obj that
                 was displayed and routines to add "items"
                 and "buildings" to the display.
                 
                 This is only the beginning! :)
