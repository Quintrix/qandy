
//
// ──── Qandy Mouse Driver ────────────────────────────────────────────────────────────
//

(function() {
    // const style = document.createElement('style');
    // style.textContent = `
    //     .qandy-cell[data-mouse]:not([data-mouse=""]) {
    //         text-decoration: underline !important;
    //         text-decoration-color: #5555ff !important; /* mouse underline color */
    //         text-decoration-thickness: 1px;
    //         text-underline-offset: 2px;
    //     }
    //     .qandy-cell[data-mouse]:not([data-mouse=""]):hover {
    //         filter: brightness(1.5);
    //         cursor: pointer;
    //     }
    // `;
    // document.head.appendChild(style);

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
            window.mousedown(data.x, data.y, data.button, data.tag);
        }
    });

    txt.addEventListener('mouseup', (e) => {
        const data = getCellData(e);
        if (data && typeof window.mouseup === 'function') {
            window.mouseup(data.x, data.y, data.button, data.tag);
        }
    });
})();

//
// to use, set CURMOUSE='tag' and print() text,
// then define a mouseup() and/or mousedown() function
// returns the x/y and button clicked, plus any print'd tag:
//
// function mousedown(x,y,button,tag) {
//     print(x+' '+y+' '+button+' '+tag);
// }
//
// function mouseup(x,y,button,tag) {
//     print(x+' '+y+' '+button+' '+tag);
// }
//
