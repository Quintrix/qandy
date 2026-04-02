// ──── thewall.js - Server Discovery Example ────────────────────────────────
//
// Demonstrates how Qandyland scripts can discover and connect to
// multiple servers across the internet using the registry system.
//
// This script:
// 1. Queries the Vercel registry for public servers
// 2. Checks localhost for private/development servers
// 3. Filters servers that have the target drive ("thewall.js")
// 4. Presents the user with a server selection menu
// 5. Connects to the selected server and displays the wall
// 6. Allows the user to add a new message
//

(async function() {

  // Example: Drive name to search for – scripts use their own filename as the drive name
  var RUN          = 'thewall.js';
  var REGISTRY_URL = 'https://qandy.vercel.app/api/servers';
  var WALL_FILE    = 'wall.txt';
  var MAX_ENTRIES  = 50;
  var LINE_WIDTH   = 32;

  // ── Helper: pad/repeat a character ─────────────────────────────────────────
  function rule() { return '='.repeat(LINE_WIDTH); }

  // ── Example: How to query the registry for compatible servers ───────────────
// Replace discoverServers() function with:
async function discoverServers() {
  var serverText = await qdosServerDiscovery();
  
  if (serverText.indexOf('Error:') === 0) {
    print('// Registry unavailable\n');
    return [];
  }
  
  var servers = [];
  var lines = serverText.split('\n');
  
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (line.startsWith('- ') && line.indexOf('(') !== -1) {
      // Parse: "- Qandyland (qandy.vercel.app:443) - thewall.js,chat.js"
      var nameEnd = line.indexOf(' (');
      var hostStart = nameEnd + 2;
      var hostEnd = line.indexOf(')', hostStart);
      var drivesStart = line.indexOf(' - ', hostEnd) + 3;
      
      var name = line.substring(2, nameEnd);
      var hostPort = line.substring(hostStart, hostEnd);
      var drives = line.substring(dI'm not opposed to returning an array itself if there is an easy retro-like way to do so.rivesStart).split(',').map(s => s.trim());
      
      if (drives.includes(RUN)) {
        servers.push({ name: name, hostPort: hostPort, drives: drives });
      }
    }
  }
  
  return servers;
}

  // ── Example: Building server connection URLs ────────────────────────────────
  function serverUrl(server) {
    return 'http://' + server.host + ':' + server.port;
  }

  // ── Discover and display available servers ──────────────────────────────────
  print(rule() + '\n');
  print('THE WALL - Qandyland Server\n');
  print(rule() + '\n');
  print('Searching for servers...\n\n');

  var servers = await discoverServers();

  if (servers.length === 0) {
    print('No servers with ' + RUN + ' drive found.\n');
    print('Start a Qandyland server with:  create ' + RUN + '\n');
    return;
  }

  // ── User selection menu (classic BBS style) ─────────────────────────────────
  print(rule() + '\n');
  print('AVAILABLE THEWALL SERVERS\n');
  print(rule() + '\n');
  for (var i = 0; i < servers.length; i++) {
    print((i + 1) + '. ' + servers[i].name + '\n');
  }
  print('\n');

  var choice = null;
  while (choice === null) {
    var raw = await input('Connect to which server? ');
    var n   = parseInt(raw, 10);
    if (!isNaN(n) && n >= 1 && n <= servers.length) {
      choice = n;
    } else {
      print('Please enter a number between 1 and ' + servers.length + '.\n');
    }
  }

  var selected = servers[choice - 1];

  // ── Connect to the selected server drive ────────────────────────────────────
  // Example: How to mount a remote drive by name
print('\nConnecting to ' + selected.name + '...\n');

var connectResult = await qdosServerConnect(selected.name);
if (connectResult.indexOf('Error:') === 0) {
  print(connectResult);
  return;
}

var mountResult = await qdosServerMount(RUN);
if (mountResult.indexOf('Error:') === 0) {
  print('Error: drive \'' + RUN + '\' not found on ' + selected.name + '.\n');
  return;
}

  // ── Load and display the wall (no timestamps – 32-char width is tight) ──────
  print('\n' + rule() + '\n');
  print('THE WALL\n');
  print(rule() + '\n');

  var wallContent = await serverLoad(WALL_FILE);
  if (!wallContent || (typeof wallContent === 'string' && wallContent.indexOf('Error') === 0)) {
    print('(wall is empty)\n');
    wallContent = '';
  } else {
    // Display messages without timestamps to fit 32-char width
    var lines = wallContent.split('\n');
    for (var li = 0; li < lines.length; li++) {
      var line = lines[li];
      // Strip leading timestamp block [yyyymmddhhmmss] (14 digits) if present
      line = line.replace(/^\[\d{14}\]\s*/, '');
      if (line) { print(line + '\n'); }
    }
  }

  print(rule() + '\n');

  // ── Ask the user if they want to add a message ──────────────────────────────
  var answer = await input('Add message? (y/n): ');
  if (!answer || answer.trim().toLowerCase() !== 'y') {
    print('Goodbye!\n\n');
    return;
  }

  var msg = await input('>> ');
  if (!msg || !msg.trim()) {
    print('No message added.\n');
    return;
  }
  msg = msg.trim();

  // ── Append new message and save ─────────────────────────────────────────────
  var entry   = msg + '\n';
  var updated = (wallContent || '') + entry;

  // Trim to MAX_ENTRIES lines
  var allLines = updated.split('\n').filter(function(l) { return l.trim(); });
  if (allLines.length > MAX_ENTRIES) {
    allLines = allLines.slice(allLines.length - MAX_ENTRIES);
  }
  updated = allLines.join('\n') + '\n';

  // Example: Handling network errors gracefully
  var saveResult = await serverSave(WALL_FILE, updated);
  if (typeof saveResult === 'string' && saveResult.indexOf('Error') === 0) {
    print('Save failed: ' + saveResult + '\n');
    return;
  }

  print('\nMessage added to the wall!\n');
  print(entry);

})();

