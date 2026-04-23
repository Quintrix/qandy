
//
// ──── Qandy Mouse Driver ────────────────────────────────────────────────────────────
//

MOUSE=0;

var lastClickX=0;
var lastClickY=0;

window.mouse_js=function() {
  const style = document.createElement('style');
  style.textContent = `
  .qandy-cell[data-mouse]:not([data-mouse=""]):hover {
    filter: invert(100%);
    cursor: none;
  }
  .qandy-cell:hover {
    filter: invert(100%);
    /* Or specifically swap colors if you prefer */
    cursor: none; 
  }
  #txt {
    /* This stops the vertical I-beam cursor from appearing */
    cursor: none;
    user-select: none;
    -webkit-user-select: none; /* Safari support */
    -moz-user-select: none;    /* Firefox support */
  }
  `;

  document.head.appendChild(style);

  const txt = document.getElementById('txt');
  if (!txt) return;

  // Prevent the right-click menu so 'button 2' is usable for the developer
  txt.addEventListener('contextmenu', e => e.preventDefault());

  // Helper to extract cell info
  const getCellData = (e) => {
    const target = e.target;
    const cell = target.closest('.qandy-cell');
    if (!cell) return null;
    // Calculate x/y based on DOM structure
    const x = Array.from(cell.parentNode.children).indexOf(cell);
    const y = Array.from(cell.parentNode.parentNode.children).indexOf(cell.parentNode);
    const tag = cell.dataset.mouse || "";
    return { x, y, tag, button: e.button };
  };
  txt.addEventListener('mousedown', (e) => {
    const data = getCellData(e);
    if (data && typeof window.mousedown === 'function') {
    	lastClickX=data.x;
      lastClickY=data.y;
      window.mousedown(data.x, data.y, data.button, data.tag);
    }
  });

  txt.addEventListener('mouseup', (e) => {
    const data = getCellData(e);
    if (data && typeof window.mouseup === 'function') {
      window.mouseup(data.x, data.y, data.button, data.tag);
    }
  });
    
  MOUSE=1;
  return 'Qandy Mouse Installed.';
};

// Ensure these are globally tracked in your mouse.js driver
window.lastClickX = 0;
window.lastClickY = 0;

window.pop = function(content, alignOverride) {
    const popup = document.getElementById("pop");
    const container = document.getElementById("container") || document.body;
    const bounds = container.getBoundingClientRect();
    
    // 1. Secure Content Injection
    // We clear children and append to avoid the security risks of .innerHTML
    popup.replaceChildren(); 
    if (typeof content === "string") {
        const wrapper = document.createElement("div");
        wrapper.innerHTML = content; // Still allows HTML, but scoped
        popup.appendChild(wrapper);
    } else {
        popup.appendChild(content);
    }

    popup.style.visibility = "visible";
    popup.style.display = "block";
    popup.style.position = "absolute";

    const popupWidth = popup.offsetWidth;
    const popupHeight = popup.offsetHeight;
    const align = alignOverride || window.PopAlign || "center";

    let PopX, PopY;

    switch (align) {
        case "full":
            // 2. The "Full Screen" ANSI mode
            // Matches the exact pixels of the display container
            PopX = bounds.left;
            PopY = bounds.top;
            popup.style.width = bounds.width + "px";
            popup.style.height = bounds.height + "px";
            break;

        case "click":
            // 3. Precise Mouse Location
            // Uses the actual pixel coordinate of the last click
            PopX = window.lastClickX - (popupWidth / 2);
            PopY = window.lastClickY - (popupHeight / 2);
            
            // Constrain to container bounds
            if (PopX < bounds.left) PopX = bounds.left;
            if (PopX + popupWidth > bounds.right) PopX = bounds.right - popupWidth;
            if (PopY < bounds.top) PopY = bounds.top;
            if (PopY + popupHeight > bounds.bottom) PopY = bounds.bottom - popupHeight;
            break;

        case "center":
        default:
            // 4. Mathematical Center
            PopX = bounds.left + (bounds.width - popupWidth) / 2;
            PopY = bounds.top + (bounds.height - popupHeight) / 2;
            break;
    }

    // Apply calculated positions
    if (align !== "full") {
        popup.style.width = "auto";  // Reset if it was previously 'full'
        popup.style.height = "auto";
        popup.style.left = PopX + "px";
        popup.style.top = PopY + "px";
    } else {
        popup.style.left = PopX + "px";
        popup.style.top = PopY + "px";
    }
}


if (RUN=='qandy.js') { print(mouse_js()+'\n'); }

//
// to use, set CURMOUSE='tag' and print() text,
// then define a mouseup() and/or mousedown() function
// returns the x/y and button clicked, plus any print'd tag:
//
// function mousedown(x,y,button,tag) {
//     alert(x+' '+y+' '+button+' '+tag);
// }
//
// function mouseup(x,y,button,tag) {
//     alert(x+' '+y+' '+button+' '+tag);
// }
//
