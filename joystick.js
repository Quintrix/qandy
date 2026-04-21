// joystick.js
(function () {
  const BUTTONS = [
    { id: 'joy-up', label: '↑', key: 'ArrowUp' },
    { id: 'joy-down', label: '↓', key: 'ArrowDown' },
    { id: 'joy-left', label: '←', key: 'ArrowLeft' },
    { id: 'joy-right', label: '→', key: 'ArrowRight' },
    { id: 'joy-ctrl', label: 'CTRL', key: 'Control' },
    { id: 'joy-alt', label: 'ALT', key: 'Alt' }
  ];

  function findKeyboardAnchor() {
    const selectors = [
      '#keyboard',
      '.keyboard',
      '.virtual-keyboard',
      '[data-keyboard]',
      '.key-row',
      '.keys'
    ];
    for (const s of selectors) {
      const el = document.querySelector(s);
      if (el) return el;
    }
    // fallback: try to find an element that contains many buttons/keys
    const manyButtons = Array.from(document.querySelectorAll('div, section, main'))
      .find(el => el.querySelectorAll('button, .key, [data-key]').length >= 6);
    return manyButtons || document.body;
  }

  function callPress(key) {
    try {
      if (typeof window.press === 'function') {
        window.press(key);
      } else if (typeof window.press === 'object' && typeof window.press.press === 'function') {
        // some projects wrap press
        window.press.press(key);
      } else {
        console.warn('joystick.js: press() not found. Key:', key);
      }
    } catch (e) {
      console.error('joystick.js: error calling press()', e);
    }
  }

  function createOverlay(anchor) {
    const overlay = document.createElement('div');
    overlay.id = 'joystick-overlay';
    overlay.style.position = 'absolute';
    overlay.style.display = 'grid';
    overlay.style.gridTemplateColumns = 'repeat(3, 1fr)';
    overlay.style.gridGap = '8px';
    overlay.style.padding = '6px';
    overlay.style.pointerEvents = 'auto';
    overlay.style.opacity = '0.9';
    overlay.style.zIndex = '999'; // will be adjusted relative to anchor
    overlay.style.width = 'min(520px, 90vw)';
    overlay.style.maxWidth = '520px';
    overlay.style.boxSizing = 'border-box';
    overlay.style.justifyItems = 'center';
    overlay.style.alignItems = 'center';
    overlay.style.background = 'rgba(0,0,0,0.0)'; // transparent background so keys remain visible

    BUTTONS.forEach(b => {
      const btn = document.createElement('button');
      btn.id = b.id;
      btn.textContent = b.label;
      btn.dataset.key = b.key;
      btn.style.width = '100%';
      btn.style.height = '64px';
      btn.style.fontSize = '28px';
      btn.style.borderRadius = '10px';
      btn.style.border = '2px solid rgba(255,255,255,0.12)';
      btn.style.background = 'rgba(0,0,0,0.45)';
      btn.style.color = '#fff';
      btn.style.touchAction = 'none';
      btn.style.userSelect = 'none';
      btn.style.cursor = 'pointer';
      btn.style.boxShadow = '0 4px 10px rgba(0,0,0,0.4)';
      btn.style.backdropFilter = 'blur(4px)';
      btn.style.webkitTapHighlightColor = 'transparent';

      // Press on touchstart/mousedown, release on touchend/mouseup
      const pressHandler = (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        callPress(b.key);
      };
      btn.addEventListener('touchstart', pressHandler, { passive: false });
      btn.addEventListener('mousedown', pressHandler);

      overlay.appendChild(btn);
    });

    document.body.appendChild(overlay);
    return overlay;
  }

  function positionOverlayRelativeToAnchor(overlay, anchor) {
    const firstRow = anchor.querySelector('.key-row, .row, .keys, .keyboard-row') || anchor;
    const rect = firstRow.getBoundingClientRect();
    // place overlay just under the first row, centered horizontally relative to anchor
    const overlayWidth = Math.min(520, window.innerWidth * 0.9);
    const left = Math.max(8, rect.left + (rect.width - overlayWidth) / 2);
    const top = rect.bottom + 6; // small gap so ESC/BACK remain accessible
    overlay.style.left = `${left}px`;
    overlay.style.top = `${top}px`;
    overlay.style.width = `${overlayWidth}px`;

    // Ensure overlay is visually under the first row (so ESC/BACK on top)
    // We do this by lowering zIndex relative to the anchor's zIndex if possible
    const anchorZ = window.getComputedStyle(anchor).zIndex;
    if (!isNaN(parseInt(anchorZ))) {
      overlay.style.zIndex = Math.max(1, parseInt(anchorZ) - 1).toString();
    } else {
      overlay.style.zIndex = '999';
    }
  }

  function interceptKeyboardEvents() {
    // Intercept physical keyboard arrow and ctrl/alt presses and route to press()
    function handler(ev) {
      const key = ev.key;
      // Only intercept keys we care about
      const keysToIntercept = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Control', 'Alt'];
      if (keysToIntercept.includes(key)) {
        ev.preventDefault();
        ev.stopPropagation();
        callPress(key);
      }
    }
    window.addEventListener('keydown', handler, true);
    window.addEventListener('keypress', handler, true);
    // Note: we do not swallow other keys; the app can still receive them if needed.
  }

  function init() {
    const anchor = findKeyboardAnchor();
    const overlay = createOverlay(anchor);
    positionOverlayRelativeToAnchor(overlay, anchor);
    interceptKeyboardEvents();

    // Reposition on resize or orientation change
    window.addEventListener('resize', () => positionOverlayRelativeToAnchor(overlay, anchor));
    window.addEventListener('orientationchange', () => setTimeout(() => positionOverlayRelativeToAnchor(overlay, anchor), 300));

    // Provide a simple toggle via ESC key to remove overlay if user wants to exit quickly
    window.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') {
        const el = document.getElementById('joystick-overlay');
        if (el) el.remove();
      }
    });

    console.log('joystick.js: overlay initialized');
  }

  // Wait until DOM is ready and a short delay so the app can finish startup
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(init, 300);
  } else {
    window.addEventListener('DOMContentLoaded', () => setTimeout(init, 300));
  }
})();
