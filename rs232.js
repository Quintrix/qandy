/**
 * rs232.js
 *
 * Virtual RS-232 / RPC layer for Qandy (host <-> guest message mediation).
 *
 * Export: window.rs232
 *
 * Features:
 *  - init(config) to configure behaviour
 *  - connectGuest(window, origin) / disconnectGuest()
 *  - sendRequest(method,args,opts) : host -> guest request (await guest.res)
 *  - sendEvent(name,payload) : host -> guest one-way event
 *  - onRequest(handler) : register handler for guest -> host requests
 *  - forwardKey(keyEvent) : forward normalized keys to guest (respects inputMode & filters)
 *  - requestInputMode(mode, opts) / revokeInputMode()
 *  - setPermissionChecker(fn)
 *  - auditLog(action, details)
 *  - shutdown()
 *
 * Message envelope (postMessage):
 *  { __qandy: true, type: <string>, payload: <any> }
 *
 * Guest -> Host:
 *  - type: 'guest.req'    payload: { id, method, args, meta }
 *  - type: 'guest.event'  payload: { name, data }
 *  - type: 'guest.res'    payload: { id, ok, result|error }  (response to host.req)
 *
 * Host -> Guest:
 *  - type: 'host.req'     payload: { id, method, args }
 *  - type: 'host.event'   payload: { name, data }
 *  - type: 'host.res'     payload: { id, ok, result|error }  (response to guest.req)
 *
 * Notes:
 *  - In production, always set guestOrigin to the exact origin you expect.
 *  - This implementation uses simple confirm() for prompts; replace with app modal as needed.
 */

(function (global) {
  'use strict';

  // Internal state
  var config = {
    guestWindow: null,
    guestOrigin: '*',
    allowWildcardOrigin: false,
    defaultTimeoutMs: 10000,
    maxConcurrentRequests: 32,
    maxCommandsPerSecond: 200,
    auditLogger: null,
    permissionChecker: null
  };

  var rs = {}; // public API container

  var pendingHostRequests = new Map(); // host -> guest pending (id -> {resolve,reject,timeout})
  var pendingGuestHandlers = new Map(); // guest -> host pending responses for requests we send? (not used here)
  var rpcId = 1;

  var guestRequestHandlers = []; // array of async handlers (req -> {ok,result} or undefined)
  var recentCmdTimestamps = []; // sliding window timestamps for rate limiting (ms)
  var inputMode = 'line'; // 'line' | 'raw' | 'raw+pointer'
  var rawEnabledForGuest = false;

  // Default permissionChecker: allow harmless methods, deny others (can be replaced)
  async function defaultPermissionChecker(method, args, meta) {
    // Safe default: allow non-destructive read/list calls, deny destructive or mount ops
    var allow = false;
    var lowRisk = ['ping', 'echo', 'dosList', 'dosLoad', 'dosType'];
    var highRisk = ['dosSave', 'dosDelete', 'dosUpload', 'dosDownload', 'dosMount', 'format'];
    if (lowRisk.indexOf(method) !== -1) allow = true;
    else if (highRisk.indexOf(method) !== -1) allow = false;
    else {
      // by default deny unknown methods; host can override permissionChecker
      allow = false;
    }
    return { allowed: !!allow };
  }

  // Utility: current time ms
  function nowMs() { return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(); }

  // Utility: audit logger
  function doAudit(action, details) {
    try {
      if (typeof config.auditLogger === 'function') {
        try { config.auditLogger(action, details || {}); } catch (e) { console.warn('auditLogger failed', e); }
      } else {
        // default lightweight console log (structured)
        console.log('[rs232.aud]', action, details || {});
      }
    } catch (e) { /* ignore */ }
  }

  // Rate limiting: simple sliding window
  function allowRate() {
    var max = config.maxCommandsPerSecond || 200;
    var windowMs = 1000;
    var t = nowMs();
    // prune old
    while (recentCmdTimestamps.length && (t - recentCmdTimestamps[0] > windowMs)) recentCmdTimestamps.shift();
    if (recentCmdTimestamps.length >= max) return false;
    recentCmdTimestamps.push(t);
    return true;
  }

  // Validate origin of incoming event
  function originAllowed(origin) {
    if (config.allowWildcardOrigin) return true;
    if (!config.guestOrigin || config.guestOrigin === '*' ) return config.allowWildcardOrigin;
    return origin === config.guestOrigin;
  }

  // Post a message to guest if connected
  function postToGuest(message) {
    if (!config.guestWindow) return false;
    try {
      config.guestWindow.postMessage(message, config.guestOrigin || '*');
      return true;
    } catch (e) {
      console.warn('rs232: postToGuest failed', e);
      return false;
    }
  }

  // Handle incoming postMessage from guest
  function _onWindowMessage(ev) {
    var m = ev.data;
    if (!m || typeof m !== 'object' || !m.__qandy) return;
    // Validate origin
    if (!originAllowed(ev.origin)) {
      // ignore and log
      doAudit('rejected-origin', { origin: ev.origin, expected: config.guestOrigin, msg: m.type });
      return;
    }

    switch (m.type) {
      case 'guest.res': {
        var p = m.payload || {};
        var id = p.id;
        if (!id) return;
        var entry = pendingHostRequests.get(id);
        if (entry) {
          pendingHostRequests.delete(id);
          clearTimeout(entry._t);
          if (p.ok) entry.resolve(p.result); else entry.reject(new Error(p.error || 'guest error'));
        }
        break;
      }

      case 'guest.req': {
        // guest requested a host method
        if (!allowRate()) {
          // rate limit exceeded
          var rid = (m.payload && m.payload.id) || null;
          if (rid && config.guestWindow) {
            config.guestWindow.postMessage({ __qandy: true, type: 'host.res', payload: { id: rid, ok: false, error: 'rate-limit' } }, config.guestOrigin || '*');
          }
          doAudit('rate-limited-guest-req', { origin: ev.origin, payload: m.payload });
          return;
        }

        var payload = m.payload || {};
        var id = payload.id;
        var method = payload.method;
        var args = Array.isArray(payload.args) ? payload.args : [];
        var meta = payload.meta || {};

        // run permission checker
        (async function () {
          try {
            var checker = config.permissionChecker || defaultPermissionChecker;
            var decision = await checker(method, args, meta);
            if (!decision || !decision.allowed) {
              // If checker requests user gesture/consent, do prompt here.
              if (decision && decision.requireUserGesture) {
                // simple confirm-based consent (replace with app modal)
                var promptMsg = (decision.prompt && decision.prompt.title) ? (decision.prompt.title + '\n' + (decision.prompt.body || '')) : ('Guest requests permission for ' + method);
                var ok = confirm(promptMsg + '\nAllow?');
                doAudit('permission-request-prompt', { method: method, origin: ev.origin, userChoice: ok });
                if (!ok) {
                  if (id && config.guestWindow) config.guestWindow.postMessage({ __qandy: true, type: 'host.res', payload: { id: id, ok: false, error: 'user-denied' } }, config.guestOrigin || '*');
                  return;
                }
                // else proceed
              } else {
                // denied
                if (id && config.guestWindow) config.guestWindow.postMessage({ __qandy: true, type: 'host.res', payload: { id: id, ok: false, error: decision && decision.reason ? decision.reason : 'permission-denied' } }, config.guestOrigin || '*');
                doAudit('permission-denied', { method: method, origin: ev.origin });
                return;
              }
            }

            // Execute registered handlers in sequence; handler returns undefined to pass through
            var handled = false;
            for (var i = 0; i < guestRequestHandlers.length; i++) {
              try {
                var h = guestRequestHandlers[i];
                var hr = await h({ id: id, method: method, args: args, meta: meta, origin: ev.origin });
                if (typeof hr !== 'undefined') {
                  handled = true;
                  // hr expected as { ok: true, result } or { ok:false, error }
                  if (id && config.guestWindow) {
                    config.guestWindow.postMessage({ __qandy: true, type: 'host.res', payload: { id: id, ok: !!hr.ok, result: hr.result, error: hr.error } }, config.guestOrigin || '*');
                  }
                  doAudit('guest-req-handled', { method: method, argsSummary: summarizeArgs(args), origin: ev.origin, result: hr.ok ? 'ok' : 'err' });
                  break;
                }
              } catch (e) {
                // handler threw
                if (id && config.guestWindow) {
                  config.guestWindow.postMessage({ __qandy: true, type: 'host.res', payload: { id: id, ok: false, error: String(e) } }, config.guestOrigin || '*');
                }
                doAudit('guest-req-handler-exception', { method: method, error: String(e) });
                handled = true;
                break;
              }
            }

            if (!handled) {
              // no handler provided a result -> default unknown-method
              if (id && config.guestWindow) config.guestWindow.postMessage({ __qandy: true, type: 'host.res', payload: { id: id, ok: false, error: 'unknown-method' } }, config.guestOrigin || '*');
              doAudit('guest-req-unknown', { method: method, origin: ev.origin });
            }
          } catch (err) {
            if (payload && payload.id && config.guestWindow) config.guestWindow.postMessage({ __qandy: true, type: 'host.res', payload: { id: payload.id, ok: false, error: String(err) } }, config.guestOrigin || '*');
            doAudit('guest-req-exception', { error: String(err), method: method });
          }
        })();

        break;
      }

      case 'guest.event': {
        // one-way event - just audit and optionally dispatch to handlers via onEvent (not implemented)
        var evp = m.payload || {};
        doAudit('guest-event', { name: evp.name, dataSummary: summarizeArgs([evp.data]) });
        // optionally let host code subscribe to events via rs.onEvent (not implemented in this minimal version)
        break;
      }

      default:
        // ignore unknown types
        break;
    }
  }

  // Helper: summarize args for audit (avoid big blobs)
  function summarizeArgs(args) {
    try {
      return args.map(a => {
        if (a === null || a === undefined) return String(a);
        if (typeof a === 'string') return a.length > 200 ? (a.slice(0,200) + '…') : a;
        if (typeof a === 'object') return Array.isArray(a) ? '[array:' + a.length + ']' : '[object]';
        return String(a);
      }).join(',');
    } catch (e) {
      return '[summarize-error]';
    }
  }

  // Public API implementations ----------------------------------------

  // init(configObj)
  rs.init = function (cfg) {
    cfg = cfg || {};
    config.guestWindow = cfg.guestWindow || config.guestWindow;
    config.guestOrigin = typeof cfg.guestOrigin === 'string' ? cfg.guestOrigin : config.guestOrigin;
    config.allowWildcardOrigin = !!cfg.allowWildcardOrigin;
    config.defaultTimeoutMs = Number.isFinite(cfg.defaultTimeoutMs) ? cfg.defaultTimeoutMs : config.defaultTimeoutMs;
    config.maxConcurrentRequests = Number.isFinite(cfg.maxConcurrentRequests) ? cfg.maxConcurrentRequests : config.maxConcurrentRequests;
    config.maxCommandsPerSecond = Number.isFinite(cfg.maxCommandsPerSecond) ? cfg.maxCommandsPerSecond : config.maxCommandsPerSecond;
    config.auditLogger = typeof cfg.auditLogger === 'function' ? cfg.auditLogger : config.auditLogger;
    config.permissionChecker = typeof cfg.permissionChecker === 'function' ? cfg.permissionChecker : config.permissionChecker;
    // attach window listener once
    try {
      if (!rs._listening) {
        window.addEventListener('message', _onWindowMessage);
        rs._listening = true;
      }
    } catch (e) { console.warn('rs232.init listener failed', e); }
    doAudit('rs232.init', { guestOrigin: config.guestOrigin });
  };

  // connectGuest(guestWindow, guestOrigin)
  rs.connectGuest = function (guestWindow, guestOrigin) {
    config.guestWindow = guestWindow || null;
    config.guestOrigin = (typeof guestOrigin === 'string') ? guestOrigin : config.guestOrigin;
    // reset rate limiter
    recentCmdTimestamps = [];
    doAudit('connectGuest', { origin: config.guestOrigin });
  };

  // disconnectGuest()
  rs.disconnectGuest = function () {
    config.guestWindow = null;
    doAudit('disconnectGuest', {});
  };

  // sendRequest(method,args,opts) host -> guest
  rs.sendRequest = function (method, args, opts) {
    if (!config.guestWindow) return Promise.reject(new Error('no-guest'));
    opts = opts || {};
    var id = rpcId++;
    var payload = { id: id, method: method, args: Array.isArray(args) ? args : [args] };
    var message = { __qandy: true, type: 'host.req', payload: payload };
    // concurrency check
    if (pendingHostRequests.size >= (config.maxConcurrentRequests || 32)) return Promise.reject(new Error('too-many-pending-requests'));
    return new Promise(function (resolve, reject) {
      var timedOut = false;
      var to = setTimeout(function () {
        timedOut = true;
        pendingHostRequests.delete(id);
        reject(new Error('timeout'));
        doAudit('host-request-timeout', { method: method });
      }, Number.isFinite(opts.timeoutMs) ? opts.timeoutMs : config.defaultTimeoutMs);

      pendingHostRequests.set(id, { resolve: function (r) { if (!timedOut) { clearTimeout(to); resolve(r); } }, reject: function (e) { if (!timedOut) { clearTimeout(to); reject(e); } }, _t: to });
      // post
      try {
        config.guestWindow.postMessage(message, config.guestOrigin || '*');
        doAudit('host-request-sent', { method: method, argsSummary: summarizeArgs(payload.args) });
      } catch (e) {
        clearTimeout(to);
        pendingHostRequests.delete(id);
        reject(e);
      }
    });
  };

  // sendEvent(name, payload) host -> guest (fire-and-forget)
  rs.sendEvent = function (name, payload) {
    if (!config.guestWindow) return false;
    try {
      config.guestWindow.postMessage({ __qandy: true, type: 'host.event', payload: { name: name, data: payload } }, config.guestOrigin || '*');
      doAudit('host-event', { name: name });
      return true;
    } catch (e) {
      console.warn('rs232.sendEvent failed', e);
      return false;
    }
  };

  // onRequest(handler) - handler is async function(req)=>{ok,result} or undefined
  rs.onRequest = function (handler) {
    if (typeof handler !== 'function') throw new Error('handler must be function');
    guestRequestHandlers.push(handler);
    var unsub = function () {
      var i = guestRequestHandlers.indexOf(handler);
      if (i !== -1) guestRequestHandlers.splice(i, 1);
    };
    return unsub;
  };

  // forwardKey(keyEvent) -> posts as host.event name 'input.key' (if allowed)
  rs.forwardKey = function (keyEvent) {
    // Validate shape minimally
    if (!keyEvent || !keyEvent.type || !keyEvent.code) return false;
    // Block privileged combos (Ctrl+W, Ctrl+R, F5, Ctrl+Shift+I)
    if ((keyEvent.ctrlKey && (String(keyEvent.key).toLowerCase() === 'w' || String(keyEvent.key).toLowerCase() === 'r')) ||
        (String(keyEvent.key) === 'F5') ||
        (keyEvent.ctrlKey && keyEvent.shiftKey && (String(keyEvent.key).toLowerCase() === 'i'))) {
      // do not forward
      return false;
    }
    // Only forward if guest exists and input mode permits it
    if (!config.guestWindow) return false;
    if (inputMode === 'line' && !rawEnabledForGuest) {
      // In line mode we may still forward keys if desired; default: do not forward
      return false;
    }
    // Post event
    try {
      config.guestWindow.postMessage({ __qandy: true, type: 'host.event', payload: { name: 'input.key', data: keyEvent } }, config.guestOrigin || '*');
      doAudit('forward-key', { code: keyEvent.code, key: keyEvent.key });
      return true;
    } catch (e) {
      return false;
    }
  };

  // requestInputMode(mode, opts) -> ask host to enable raw mode; may require user gesture
  rs.requestInputMode = async function (mode, opts) {
    opts = opts || {};
    if (mode !== 'line' && mode !== 'raw' && mode !== 'raw+pointer') return { ok: false, reason: 'bad-mode' };
    // if requesting raw, show confirmation
    if (mode === 'raw') {
      // permission check via permissionChecker may also be used
      var checker = config.permissionChecker || defaultPermissionChecker;
      try {
        var decision = await checker('requestInputMode', [mode], { });
        if (decision && !decision.allowed) {
          if (decision.requireUserGesture) {
            var promptMsg = decision.prompt && decision.prompt.title ? (decision.prompt.title + '\n' + (decision.prompt.body || '')) : ('Guest requests raw input mode');
            var ok = confirm(promptMsg + '\nAllow low-latency keyboard input?');
            doAudit('raw-mode-prompt', { allowed: ok });
            if (!ok) return { ok: false, reason: 'user-denied' };
            rawEnabledForGuest = true;
            inputMode = mode;
            return { ok: true };
          } else {
            return { ok: false, reason: decision.reason || 'permission-denied' };
          }
        }
      } catch (e) {
        return { ok: false, reason: String(e) };
      }

      // If checker allowed or nothing required, still ask user for consent (UI)
      var consent = true;
      if (!opts.silent) {
        consent = confirm('Grant guest low-latency keyboard input? (Guest will receive raw key events)');
        doAudit('raw-mode-consent', { consent: consent });
      }
      if (!consent) return { ok: false, reason: 'user-denied' };
      rawEnabledForGuest = true;
      inputMode = mode;
      return { ok: true };
    } else {
      // line mode: revoke raw
      rawEnabledForGuest = false;
      inputMode = 'line';
      doAudit('input-mode-set', { mode: inputMode });
      return { ok: true };
    }
  };

  rs.revokeInputMode = function () {
    rawEnabledForGuest = false;
    inputMode = 'line';
    doAudit('input-mode-revoke', {});
  };

  rs.setPermissionChecker = function (fn) {
    if (typeof fn !== 'function') throw new Error('permissionChecker must be function');
    config.permissionChecker = fn;
  };

  rs.auditLog = function (action, details) {
    doAudit(action, details);
  };

  rs.shutdown = async function () {
    // clear pending
    for (var [id, entry] of pendingHostRequests) {
      try { entry.reject(new Error('shutdown')); } catch (e) {}
      clearTimeout(entry._t);
    }
    pendingHostRequests.clear();
    // detach listeners
    try {
      if (rs._listening) {
        window.removeEventListener('message', _onWindowMessage);
        rs._listening = false;
      }
    } catch (e) {}
    config.guestWindow = null;
    doAudit('rs232.shutdown', {});
  };

  // small helper to expose config for debugging (read-only shallow copy)
  Object.defineProperty(rs, 'config', {
    get: function () { return Object.assign({}, config); }
  });

  // Helper to respond to a guest request synchronously from host code
  // (convenience) - host code can call rs.respondToGuest(id, ok, resultOrError)
  rs.respondToGuest = function (id, ok, resultOrError) {
    if (!config.guestWindow) return false;
    try {
      var payload = { id: id, ok: !!ok };
      if (ok) payload.result = resultOrError; else payload.error = String(resultOrError);
      config.guestWindow.postMessage({ __qandy: true, type: 'host.res', payload: payload }, config.guestOrigin || '*');
      return true;
    } catch (e) {
      return false;
    }
  };

  // small helper for tests: simulate inbound guest.req (not used in prod)
  rs._simulateGuestReq = function (payload, origin) {
    _onWindowMessage({ data: Object.assign({ __qandy: true }, payload), origin: origin || config.guestOrigin });
  };

  // Export to global
  try { global.rs232 = rs; } catch (e) { console.warn('rs232 export failed', e); }

  // bootstrap default listener
  // If user calls rs232.init later, it will ensure listener present.
  if (!rs._listening) {
    window.addEventListener('message', _onWindowMessage);
    rs._listening = true;
  }

})(window);