I would like to add mouse support for my Qandy Pocket Computer, we have talked about it and experimented with a couple of approaches and I using them we have figured out a much better system. The question was not how can we get our mouse.js to work like Windows 3.1, but rather what would a mouse drive look like if the Commodore 64 became the modern computer instead of Windows?



There are only 800 cells on the Qandy display, each one already has it's own DOM element which qandy-video.js initializes ... instead of refactoring the Qandy, let us write a new mouse3.js driver that will add a hidden 'mouse' field and a onclick for each cell, this way mouse.js can be installed after system boot just like mouse.sys was loaded on DOS. 



First problem: what happens when the Qandy scrolls it's text screen? The new cells won't have the 'mouse' attribute or the onclick? Will we need to inject a patch into the screen scroll in qandy-video.js? We may also need to patch into the pokeCursor() and pokeModem() functions to inject the 'mouse' attribute as text is printed to the text dispaly.



So mouse3.js needs a init() function to modify the DOM and then an onclick handler. It can now look to see if any running scripts have declared mouse functions and if so direct the input to them.  I don't know what these functions should be, but based on our talks about UI and mouse functions, this is my rough idea which is trying to mimic browser mouse down events:



mouseClick() - click on a screen cell with any button

mouseLClick() left click

mouseRClick() right click

mouseMClick() middle click

mouseDown() triggered when mouse button is pressed down

mouseUp() triggered when mouse button is pressed down

mouseHover() not sure if this is a function or a state variable, it should return z and mouse of cell mouse is hovering over



How should we start this project? Pseudo code? Flow chart? Rough outline? Write the acutal code?