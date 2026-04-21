// Add this to qandy-host.htm - insert after the video.js initialization (around line 2646)

function initCellTooltip() {
  var tooltip = null;
  var lastX = -1;
  var lastY = -1;
  
  // Create tooltip element
  function createTooltip() {
    if (!tooltip) {
      tooltip = document.createElement('div');
      tooltip.id = 'cell-tooltip';
      tooltip.style.cssText = `
        position: fixed;
        background-color: #FDFD96;
        color: #000;
        border: 1px solid #000;
        padding: 4px 8px;
        font-family: monospace;
        font-size: 11px;
        z-index: 1000;
        pointer-events: none;
        opacity: 0.9;
        display: none;
        white-space: nowrap;
      `;
      document.body.appendChild(tooltip);
    }
    return tooltip;
  }
  
  // Get cell coordinates from qandy-cell element
  function getCellCoordinates(cellElement) {
    var row = cellElement.parentElement; // get parent qandy-row
    var container = document.getElementById('txt');
    
    if (!row || !container || !row.classList.contains('qandy-row')) {
      return null;
    }
    
    // Find which row this is
    var rows = Array.from(container.querySelectorAll('.qandy-row'));
    var rowIndex = rows.indexOf(row);
    
    // Find which cell in the row
    var cells = Array.from(row.querySelectorAll('.qandy-cell'));
    var cellIndex = cells.indexOf(cellElement);
    
    if (rowIndex >= 0 && cellIndex >= 0) {
      return { x: cellIndex, y: rowIndex };
    }
    
    return null;
  }
  
  // Handle mousemove over txt container
  var txtDiv = document.getElementById('txt');
  if (!txtDiv) return false;
  
  txtDiv.addEventListener('mousemove', function(e) {
    var cell = e.target.closest('.qandy-cell');
    if (!cell) {
      if (tooltip) tooltip.style.display = 'none';
      return;
    }
    
    var coords = getCellCoordinates(cell);
    if (!coords) return;
    
    // Only update tooltip if coordinates changed
    if (coords.x !== lastX || coords.y !== lastY) {
      lastX = coords.x;
      lastY = coords.y;
      
      tooltip = createTooltip();
      tooltip.textContent = ' ' + coords.x + ',' + coords.y;
      tooltip.style.display = 'block';
    }
    
    txtDiv.style.cursor = 'pointer';
    
    // Position tooltip near cursor
    tooltip.style.left = (e.clientX + 5)+'px';
    tooltip.style.top = (e.clientY + 5)+'px';
  });
  
  // Hide tooltip on mouse leave
  txtDiv.addEventListener('mouseleave', function() {
    if (tooltip) tooltip.style.display = 'none';
    lastX = -1;
    lastY = -1;
  });
  
  return true;
}

// Call this after video.js initializes
// Insert this at the end of the startup() function or in a setTimeout
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initCellTooltip);
} else {
  initCellTooltip();
}

print("\nMouse tooltips installed.\n\n");
