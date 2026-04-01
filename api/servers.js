//
// ──── Qandy Server Registry API ────────────────────────────────────────────────
//
// Vercel serverless function that maintains a registry of active qandyland.js
// servers.  Servers POST their info every ~5 minutes (heartbeat).  Clients GET
// the list to discover available servers.
//
// POST /api/servers  – register / refresh a server entry
//   Body: { id, name, host, port, drives, uptime, version }
//   Returns: { success: true, id }
//
// GET  /api/servers  – list active servers (stale entries auto-removed)
//   Returns: { success: true, servers: [...] }
//
// DELETE /api/servers?id=<id>  – remove a server entry (graceful shutdown)
//   Returns: { success: true }
//

'use strict';

// ── In-memory registry ────────────────────────────────────────────────────────
// NOTE: Vercel serverless functions may be cold-started, so this resets
// occasionally.  That is intentional – stale servers naturally disappear.
var servers = {};

var SERVER_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes without heartbeat = stale

// ── Helpers ───────────────────────────────────────────────────────────────────

function cleanup() {
  var now = Date.now();
  var ids = Object.keys(servers);
  for (var i = 0; i < ids.length; i++) {
    if (now - servers[ids[i]].timestamp > SERVER_TIMEOUT_MS) {
      delete servers[ids[i]];
    }
  }
}

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function respond(res, status, body) {
  res.status(status).json(body);
}

// ── Request handler ───────────────────────────────────────────────────────────

module.exports = function handler(req, res) {
  setCors(res);

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  cleanup();

  // ── POST: register / heartbeat ─────────────────────────────────────────────
  if (req.method === 'POST') {
    var body = req.body;
    if (!body || typeof body !== 'object') {
      return respond(res, 400, { success: false, error: 'invalid body' });
    }

    var id = (typeof body.id === 'string' && body.id.trim()) ? body.id.trim() : null;
    // Generate a simple id if not provided
    if (!id) {
      id = Math.random().toString(36).slice(2) + Date.now().toString(36);
    }

    var name = (typeof body.name === 'string') ? body.name.trim().slice(0, 64) : 'Unnamed Server';
    var host = (typeof body.host === 'string') ? body.host.trim().slice(0, 64) : '';
    var port = (typeof body.port === 'number') ? body.port : (parseInt(body.port, 10) || 8080);
    // Accept 'drives' (new field) with fallback to legacy 'games' field
    var drives = Array.isArray(body.drives) ? body.drives.slice(0, 50).map(String)
               : Array.isArray(body.games)  ? body.games.slice(0, 50).map(String)
               : [];
    var uptime  = (typeof body.uptime  === 'number') ? body.uptime  : (parseInt(body.uptime,  10) || 0);
    var version = (typeof body.version === 'string') ? body.version.trim().slice(0, 16) : '';

    if (!host) {
      return respond(res, 400, { success: false, error: 'host is required' });
    }

    servers[id] = {
      id:      id,
      name:    name,
      host:    host,
      port:    port,
      drives:  drives,
      uptime:  uptime,
      version: version,
      timestamp: Date.now()
    };

    return respond(res, 200, { success: true, id: id });
  }

  // ── GET: list active servers ───────────────────────────────────────────────
  if (req.method === 'GET') {
    var list = Object.values(servers);
    return respond(res, 200, { success: true, servers: list });
  }

  // ── DELETE: remove server ─────────────────────────────────────────────────
  if (req.method === 'DELETE') {
    var id = (req.query && req.query.id) ? String(req.query.id).trim() : null;
    if (id && servers[id]) {
      delete servers[id];
      return respond(res, 200, { success: true });
    }
    return respond(res, 404, { success: false, error: 'server not found' });
  }

  return respond(res, 405, { success: false, error: 'method not allowed' });
};
