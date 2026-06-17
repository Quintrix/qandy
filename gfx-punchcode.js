// punchcode-engine.js

let punchcodeBg = "Ca"; 
let punchcodeTextColor = "#FFFFFF";

function createImgBlock(src) {
    const wrap = document.createElement('div');
    wrap.className = 'punchcode-img';
    wrap.style.backgroundImage = `url('t/${punchcodeBg}.png')`;
    const img = document.createElement('img');
    img.src = src;
    wrap.appendChild(img);
    return wrap;
}

function createTextBlock(text) {
    const div = document.createElement('div');
    div.className = 'punchcode-text';
    div.textContent = text;
    div.style.backgroundImage = `url('t/${punchcodeBg}.png')`;
    div.style.color = punchcodeTextColor;
    return div;
}

// Core Engine: Returns a DOM element containing the visual representation
function decompileToDOM(code) {
    const container = document.createElement('div');
    let column = 0;

    while (column < code.length) {
        let token = code.substring(column, column + 2);
        if (token.trim() === "") { column++; continue; }
        
        // Handle visual elements
        if (token === "Xc") {
            const br = document.createElement('div');
            br.style.flexBasis = '100%';
            container.appendChild(br);
        } else {
            container.appendChild(createImgBlock('i/' + token + '.png'));
        }
        column += 2;
    }
    return container;
}
