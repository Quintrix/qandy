RUN = "www.js";

window.PForce='visible';

// --- Browser Logic ---
async function startBrowser() {
  if (HOST) {
    print("\n[bred] SECURITY ALERT [/reset]\n");
    print("[yellow]Running a browser in SYSOP mode is dangerous.\n");
    print("[white]Please switch to USER mode to browse the web.\n");
    print("Command: [bwhite]user\n\n");
    // We allow it for now, but with a warning.
  }

  cls();
  print("[bwhite][-blue] Qandy WWW Browser v2.0 [/reset]\n");
  print("[dim]ESC: Close Viewport | URL: Load Page\n\n");

  // Initial prompt
  loadUrlPrompt();
}

async function loadUrlPrompt() {
  print("[cyan]URL: [white]");
  let url = await input(); 
  if (url) {
    fetchRemotePage(url);
  }
}

async function fetchRemotePage(url) {
  print(`\n[yellow]Requesting ${url}...`);

  // In a real scenario, this is where you'd use your 
  // hostMessageHandler to proxy the request if it's external.
  // For this demo, we'll simulate the response.
  let mockContent = `
    <html>
    <body style="font-family:sans-serif; padding:20px;">
      <h2 style="color:navy;">Welcome to QandyWeb</h2>
      <p>This page is rendered inside a <b>nested iframe</b> for security.</p>
      <input type="text" placeholder="Type here to test double-input fix...">
      <br><br>
      <button onclick="alert('Scripts in here cannot touch your localStorage!')">Test Sandbox</button>
    </body>
    </html>
  `;

  renderInIframe(mockContent);
}

function renderInIframe(html) {
  // Use PopAlign full for a browser feel
  window.PopAlign = "full";
  
  // We create an iframe with a 'sandbox' attribute for maximum security
  // This prevents the "website" from escaping into the Qandy Guest/Host
  let iframeHtml = `
    <iframe id="www-viewport" 
            sandbox="allow-scripts" 
            style="width:100%; height:100%; border:none; background:white;"
            srcdoc="${html.replace(/"/g, '&quot;')}">
    </iframe>
  `;
  
  pop(iframeHtml);
  print("\n[bgreen]Rendering successful.");
}

// --- The Bridge ---
function keydown(keyCode, event) {
  // 1. Check if the user is typing in a browser input
  // If the target is an input inside our popup, we let the browser handle it.
  if (event.target && (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA')) {
    // If it's the Enter key, we might want to handle it (like submitting a URL)
    if (keyCode === 13 && event.target.id === 'browser-url-input') {
       // handle URL submit...
    }
    return true; // Stop Qandy from capturing this
  }

  // 2. ESC to close the viewport
  if (keyCode === 27) {
    hpop();
    print("\n[yellow]Viewport closed.\n");
    loadUrlPrompt();
    return true;
  }
}

// Start the app
startBrowser();