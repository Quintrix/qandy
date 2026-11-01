/*
 * Cylon DOS - storage layer (v3: partitions + mount table)
 *
 * Layers (mirrors a real OS):
 *
 *   device      idb0 (the IndexedDB database), rom:<json>, ram:, ls:<prefix>
 *   partitions  idb0p1, idb0p2 ... (thin-provisioned: a quota, not preallocated)
 *   backend     small async interface: get / list / subtree / all / usage / commit
 *   mount table name -> backend, with per-mount read-only flag and current dir
 *
 * Paths are DOS-style:  main:/docs/readme.txt   live:bin/tool   /abs   rel
 *   - "name:/path"  absolute path on drive "name"
 *   - "name:path"   relative to that drive's current directory
 *   - "/path"       absolute on the current drive
 *   - "path"        relative to the current drive's current directory
 *
 * Public API
 *   Mount table:  mount(source, name, opts)  umount(name)  mounts()
 *                 opts.type = 'idb' | 'ls' | 'ram' | 'rom' (or a "type:" prefix on source)
 *                 setDrive(name)  pwd()  mountedDrive  cwd
 *   Partitions:   disks()  partitions()  getPartition(ref)
 *                 createPartition(name, bytes)  resizePartition(ref, bytes)
 *                 deletePartition(ref)  formatPartition(ref)  setBootPartition(ref)
 *   Files:        save load delete rename copy exists mkdir chdir rmdir list dir
 *                 exportDrive importDrive manifest
 *   Helpers:      parseSize(text)  formatSize(bytes)
 *
 * Storage schema is unchanged from v1 (stores "drives" and "entries"); the
 * "drives" store now holds the partition table. Old records are migrated in
 * place the first time ready() runs, so existing data survives.
 *
 * The archive format is unchanged: qandy-ramdrive v2.
 */
(function (global) {
  'use strict';

  var DB_NAME = 'CylonDOS';
  var DB_VERSION = 1;
  var DRIVE_STORE = 'drives';    // partition table (name kept for v1 compatibility)
  var ENTRY_STORE = 'entries';   // keyPath ['drive','path']; "drive" = partition name
  var SCHEMA = 2;
  var DISK = 'cylon';
  var MANIFEST_KEY = '_dir.sys!';
  var ARCHIVE_FORMAT = 'qandy-ramdrive';
  var ARCHIVE_VERSION = 2;
  var MAX_NAME_BYTES = 255;
  var MAX_FILE_BYTES = 512 * 1024;
  var MAX_ENTRIES = 20000;
  var MAX_PARTITIONS = 32;
  var DEFAULT_QUOTA = 32 * 1024 * 1024;
  var MIN_QUOTA = 16 * 1024;
  var MAX_QUOTA = 2 * 1024 * 1024 * 1024 * 1024 ;
  var RAM_DEFAULT_QUOTA = 32 * 1024 * 1024;
  var MAX_ROM_BYTES = 64 * 1024 * 1024;
  var NAME_RE = /^(?!\.)(?!.*[\\/])[A-Za-z0-9 \-_.()+=!%,:;\[\]\^_{}@]+$/;
  var DRIVE_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;
  var DEVICE_RE = /^idb(\d+)p(\d+)$/i;
  
  var REF_RE = /^([A-Za-z0-9][A-Za-z0-9_.-]{0,63}):([\s\S]*)$/;
  var RESERVED_NAMES = ['none'];

  var dbPromise = null;
  var migrated = null;
  var mounts = Object.create(null);   // name -> mount
  var mountOrder = [];                // insertion order, for listing
  var currentName = null;

  function fail(message) { throw new Error(message); }

  /* ------------------------------------------------------------------ */
  /* Small helpers                                                       */
  /* ------------------------------------------------------------------ */

  // Extracts the directory path and converts a DOS wildcard to a RegExp
  function extractWildcard(inputPath) {
    inputPath = String(inputPath == null ? '' : inputPath).trim();
    if (!/[*?]/.test(inputPath)) return { path: inputPath, regex: null };

    var slash = inputPath.lastIndexOf('/');
    var colon = inputPath.lastIndexOf(':');
    var splitAt = Math.max(slash, colon);

    var dirPath = splitAt >= 0 ? inputPath.substring(0, splitAt + 1) : '';
    var pattern = splitAt >= 0 ? inputPath.substring(splitAt + 1) : inputPath;

    // Escape regex chars but turn * into .* and ? into .
    var esc = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
    return { path: dirPath, regex: new RegExp('^' + esc + '$', 'i') };
  }
  
  function utf8Length(value) {
    value = String(value == null ? '' : value);
    if (global.TextEncoder) return new TextEncoder().encode(value).length;
    return unescape(encodeURIComponent(value)).length;
  }

  function timestamp() {
    var d = new Date();
    function p(n) { return String(n).padStart(2, '0'); }
    return String(d.getFullYear()) + p(d.getMonth() + 1) + p(d.getDate()) +
      p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
  }

  function formatSize(n) {
    n = Number(n) || 0;
    if (n < 1024) return n + ' B';
    var units = ['KB', 'MB', 'GB', 'TB'];
    var i = -1;
    do { n /= 1024; i++; } while (n >= 1024 && i < units.length - 1);
    return (n >= 100 ? Math.round(n) : Math.round(n * 10) / 10) + ' ' + units[i];
  }

  function parseSize(text) {
    var m = /^\s*(\d+(?:\.\d+)?)\s*([kmg]?)(?:i?b)?\s*$/i.exec(String(text == null ? '' : text));
    if (!m) fail('invalid size: ' + text + ' (examples: 512K, 10M, 1G)');
    var mult = { '': 1, k: 1024, m: 1024 * 1024, g: 1024 * 1024 * 1024 }[m[2].toLowerCase()];
    var bytes = Math.floor(parseFloat(m[1]) * mult);
    if (!(bytes > 0)) fail('invalid size: ' + text);
    return bytes;
  }

  function normalizePath(path, base) {
    path = String(path == null ? '' : path).trim().replace(/\\/g, '/');
    base = String(base == null ? '' : base).replace(/^\/+|\/+$/g, ''); //'
    var parts = (path.charAt(0) === '/' ? path : (base ? base + '/' : '') + path).split('/');
    var result = [];
    parts.forEach(function (part) {
      if (!part || part === '.') return;
      if (part === '..') { if (result.length) result.pop(); return; }
      result.push(part);
    });
    return result.join('/');
  }

  function parentPath(path) {
    var slash = path.lastIndexOf('/');
    return slash < 0 ? '' : path.substring(0, slash);
  }

  function baseName(path) {
    var slash = path.lastIndexOf('/');
    return slash < 0 ? path : path.substring(slash + 1);
  }

  // Validates an already-normalized path.
  function pathCheck(path, allowRoot) {
    if (!path) {
      if (allowRoot) return path;
      fail('invalid path');
    }
    path.split('/').forEach(function (part) {
      if (!part || !NAME_RE.test(part) || utf8Length(part) > MAX_NAME_BYTES) {
        fail('invalid path component: ' + part);
      }
    });
    return path;
  }

  function request(req) {
    return new Promise(function (resolve, reject) {
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error || new Error('IndexedDB request failed')); };
    });
  }

  function txDone(tx) {
    return new Promise(function (resolve, reject) {
      tx.oncomplete = function () { resolve(); };
      tx.onerror = function () { reject(tx.error || new Error('IndexedDB transaction failed')); };
      tx.onabort = function () { reject(tx.error || new Error('IndexedDB transaction aborted')); };
    });
  }

  /* ------------------------------------------------------------------ */
  /* IndexedDB open + partition-table migration                          */
  /* ------------------------------------------------------------------ */

  function open() {
    if (dbPromise) return dbPromise;
    if (!global.indexedDB) return Promise.reject(new Error('IndexedDB is not available'));
    dbPromise = new Promise(function (resolve, reject) {
      var req = global.indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(DRIVE_STORE)) {
          db.createObjectStore(DRIVE_STORE, { keyPath: 'name' });
        }
        if (!db.objectStoreNames.contains(ENTRY_STORE)) {
          var entries = db.createObjectStore(ENTRY_STORE, { keyPath: ['drive', 'path'] });
          entries.createIndex('drive', 'drive', { unique: false });
          entries.createIndex('driveType', ['drive', 'type'], { unique: false });
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { dbPromise = null; reject(req.error); };
      req.onblocked = function () { reject(new Error('CylonDOS database upgrade is blocked')); };
    });
    return dbPromise;
  }

  async function rawPartitions() {
    var db = await open();
    return request(db.transaction(DRIVE_STORE, 'readonly').objectStore(DRIVE_STORE).getAll());
  }

  function lowestFreeIndex(records) {
    var taken = Object.create(null);
    records.forEach(function (r) { if (r.index) taken[r.index] = true; });
    var i = 1;
    while (taken[i]) i++;
    return i;
  }

  // Upgrades v1 drive records ({name, created, version}) to partition records.
  function migrate() {
    if (migrated) return migrated;
    migrated = (async function () {
      var db = await open();
      var recs = await rawPartitions();
      var legacy = recs.filter(function (r) { return r.schema !== SCHEMA; });
      if (!legacy.length) return;
      legacy.sort(function (a, b) { return String(a.created).localeCompare(String(b.created)); });
      var current = recs.filter(function (r) { return r.schema === SCHEMA; });
      for (var i = 0; i < legacy.length; i++) {
        var rec = legacy[i];
        var etx = db.transaction(ENTRY_STORE, 'readonly');
        var entries = await request(etx.objectStore(ENTRY_STORE).index('drive').getAll(rec.name));
        var used = entries.reduce(function (n, e) { return n + (e.type === 'file' ? (e.size || 0) : 0); }, 0);
        var upgraded = Object.assign({}, rec, {
          schema: SCHEMA, disk: DISK, index: lowestFreeIndex(current), fs: 'cylonfs',
          quota: Math.max(DEFAULT_QUOTA, used), used: used, count: entries.length,
          boot: false, formatted: rec.created || new Date().toISOString()
        });
        var tx = db.transaction(DRIVE_STORE, 'readwrite');
        tx.objectStore(DRIVE_STORE).put(upgraded);
        await txDone(tx);
        current.push(upgraded);
      }
    })();
    migrated.catch(function () { migrated = null; });
    return migrated;
  }

  /* ------------------------------------------------------------------ */
  /* Commit planning (shared by every backend)                           */
  /* ------------------------------------------------------------------ */

  function commitPaths(ops) {
    var seen = Object.create(null), paths = [];
    (ops.put || []).forEach(function (e) { if (!seen[e.path]) { seen[e.path] = 1; paths.push(e.path); } });
    (ops.remove || []).forEach(function (p) { if (!seen[p]) { seen[p] = 1; paths.push(p); } });
    return paths;
  }

  // usage: {used, count, quota}; old: map path -> existing entry (or undefined).
  // Returns the final state of every touched path plus the new counters.
  function planCommit(usage, old, ops) {
    var cur = Object.create(null);
    var paths = commitPaths(ops);
    paths.forEach(function (p) { cur[p] = old[p]; });
    (ops.remove || []).forEach(function (p) { cur[p] = undefined; });
    (ops.put || []).forEach(function (e) { cur[e.path] = e; });
    var dBytes = 0, dCount = 0;
    paths.forEach(function (p) {
      var before = old[p], after = cur[p];
      dBytes += (after && after.type === 'file' ? after.size : 0) - (before && before.type === 'file' ? before.size : 0);
      dCount += (after ? 1 : 0) - (before ? 1 : 0);
    });
    var used = Math.max(0, usage.used + dBytes);
    var count = Math.max(0, usage.count + dCount);
    if (dBytes > 0 && usage.quota && used > usage.quota) {
      fail('drive full: ' + formatSize(usage.quota) + ' limit exceeded');
    }
    if (dCount > 0 && count > MAX_ENTRIES) fail('drive full: too many entries');
    return { cur: cur, old: old, paths: paths, used: used, count: count };
  }

  /* ------------------------------------------------------------------ */
  /* Backends                                                            */
  /* ------------------------------------------------------------------ */

  // IndexedDB partition. Counters live on the partition record and are
  // updated in the same transaction as the data, so quota checks are O(changes).
  function idbBackend(part) {
    function range(prefix) {
      return prefix
        ? global.IDBKeyRange.bound([part, prefix + '/'], [part, prefix + '/\uffff'])
        : global.IDBKeyRange.bound([part, ''], [part, '\uffff']);
    }
    var backend = {
      type: 'idb',
      readOnly: false,
      get: async function (path) {
        var db = await open();
        return request(db.transaction(ENTRY_STORE, 'readonly').objectStore(ENTRY_STORE).get([part, path]));
      },
      subtree: async function (prefix) {
        var db = await open();
        return request(db.transaction(ENTRY_STORE, 'readonly').objectStore(ENTRY_STORE).getAll(range(prefix || '')));
      },
      list: async function (dir) {
        var all = await backend.subtree(dir);
        return all.filter(function (e) { return parentPath(e.path) === dir; });
      },
      all: function () { return backend.subtree(''); },
      usage: async function () {
        var db = await open();
        var rec = await request(db.transaction(DRIVE_STORE, 'readonly').objectStore(DRIVE_STORE).get(part));
        if (!rec) fail('partition not found: ' + part);
        return { used: rec.used || 0, count: rec.count || 0, quota: rec.quota };
      },
      commit: async function (ops) {
        var db = await open();
        var paths = commitPaths(ops);
        return new Promise(function (resolve, reject) {
          var tx = db.transaction([ENTRY_STORE, DRIVE_STORE], 'readwrite');
          var entries = tx.objectStore(ENTRY_STORE);
          var drives = tx.objectStore(DRIVE_STORE);
          var failure = null, rec = null, old = Object.create(null), pending = paths.length + 1;
          tx.oncomplete = function () { resolve(true); };
          tx.onabort = function () { reject(failure || tx.error || new Error('transaction aborted')); };
          function abort(error) { failure = error; try { tx.abort(); } catch (e) { /* already finished */ } }
          function step() {
            if (--pending) return;
            if (!rec) return abort(new Error('partition not found: ' + part));
            var plan;
            try {
              plan = planCommit({ used: rec.used || 0, count: rec.count || 0, quota: rec.quota }, old, ops);
            } catch (e) { return abort(e); }
            rec.used = plan.used;
            rec.count = plan.count;
            drives.put(rec);
            plan.paths.forEach(function (p) {
              if (plan.cur[p] === undefined) entries.delete([part, p]);
              else entries.put(Object.assign({}, plan.cur[p], { drive: part }));
            });
          }
          var recReq = drives.get(part);
          recReq.onsuccess = function () { rec = recReq.result; step(); };
          paths.forEach(function (p) {
            var r = entries.get([part, p]);
            r.onsuccess = function () { old[p] = r.result; step(); };
          });
        });
      }
    };
    return backend;
  }

  // Generic key/value backend used by rom:, ram: and ls:.
  // store: { keys(), get(path), set(path, entry), del(path) }
  function kvBackend(type, store, opts) {
    opts = opts || {};
    function copy(e) { return e ? Object.assign({}, e) : undefined; }
    var backend = {
      type: type,
      readOnly: !!opts.readOnly,
      get: async function (path) { return copy(store.get(path)); },
      subtree: async function (prefix) {
        return store.keys().filter(function (k) { return !prefix || k.indexOf(prefix + '/') === 0; })
          .map(function (k) { return copy(store.get(k)); });
      },
      list: async function (dir) {
        var all = await backend.subtree(dir);
        return all.filter(function (e) { return parentPath(e.path) === dir; });
      },
      all: function () { return backend.subtree(''); },
      usage: async function () {
        var used = 0, keys = store.keys();
        keys.forEach(function (k) { var e = store.get(k); if (e && e.type === 'file') used += e.size; });
        return { used: used, count: keys.length, quota: opts.quota || null };
      },
      commit: async function (ops) {
        if (backend.readOnly) fail('read-only file system');
        var usage = await backend.usage();
        var old = Object.create(null);
        commitPaths(ops).forEach(function (p) { old[p] = copy(store.get(p)); });
        var plan = planCommit(usage, old, ops);
        var done = [];
        try {
          plan.paths.forEach(function (p) {
            if (plan.cur[p] === undefined) store.del(p); else store.set(p, copy(plan.cur[p]));
            done.push(p);
          });
        } catch (error) {
          done.forEach(function (p) { if (old[p] === undefined) store.del(p); else store.set(p, old[p]); });
          fail(type === 'ls' ? 'localStorage is full or unavailable' : (error && error.message || 'write failed'));
        }
        return true;
      }
    };
    return backend;
  }

  function memStore() {
    var map = Object.create(null);
    return {
      keys: function () { return Object.keys(map); },
      get: function (p) { return map[p]; },
      set: function (p, e) { map[p] = e; },
      del: function (p) { delete map[p]; }
    };
  }

  function lsStore(prefix) {
    var base = 'cylon:' + prefix + ':';
    var ls = global.localStorage;
    return {
      keys: function () {
        var out = [];
        for (var i = 0; i < ls.length; i++) {
          var k = ls.key(i);
          if (k && k.indexOf(base) === 0) out.push(k.substring(base.length));
        }
        return out;
      },
      get: function (p) {
        var raw = ls.getItem(base + p);
        if (raw == null) return undefined;
        try { return JSON.parse(raw); } catch (e) { return undefined; }
      },
      set: function (p, e) { ls.setItem(base + p, JSON.stringify(e)); },
      del: function (p) { ls.removeItem(base + p); }
    };
  }

  /* ------------------------------------------------------------------ */
  /* Archives (shared by rom: mounts and importDrive)                    */
  /* ------------------------------------------------------------------ */

  function decodeArchive(input) {
    var archive = typeof input === 'string' ? JSON.parse(input) : input;
    if (!archive || typeof archive !== 'object') fail('invalid archive');
    if (archive.format && archive.format !== ARCHIVE_FORMAT) fail('unsupported archive format: ' + archive.format);
    if (Array.isArray(archive.entries)) return archive;
    if (archive.files && typeof archive.files === 'object') {
      return Object.assign({}, archive, {
        entries: Object.keys(archive.files).map(function (name) {
          return { name: name, type: 'file', content: archive.files[name] };
        })
      });
    }
    fail('invalid archive: entries or files required');
  }

  // Validates raw archive entries, adds missing parent directories, and
  // returns entries sorted parents-first.
  function normalizeEntries(raws) {
    var map = Object.create(null);
    raws.forEach(function (raw) {
      var rawName = String(raw.name == null ? '' : raw.name);
      var isDir = raw.type === 'directory' || rawName.charAt(0) === '<';
      var path = pathCheck(normalizePath(rawName.replace(/^<|>$/g, ''), ''), false);
      var base = { path: path, timestamp: raw.timestamp || timestamp(), owner: raw.owner || '', session: raw.session || '' };
      if (isDir) {
        map[path] = Object.assign(base, { type: 'directory', content: '', size: 0, readOnly: false });
      } else {
        var content = String(raw.content == null ? '' : raw.content);
        var size = utf8Length(content);
        if (size > MAX_FILE_BYTES) fail('archive contains an oversized file: ' + path);
        map[path] = Object.assign(base, { type: 'file', content: content, size: size, readOnly: !!raw.readOnly });
      }
    });
    Object.keys(map).forEach(function (path) {
      var parent = parentPath(path);
      while (parent) {
        if (!map[parent]) {
          map[parent] = { path: parent, type: 'directory', content: '', size: 0, timestamp: timestamp(), owner: '', session: '', readOnly: false };
        } else if (map[parent].type !== 'directory') {
          fail('archive conflict: ' + parent + ' is both a file and a directory');
        }
        parent = parentPath(parent);
      }
    });
    return Object.keys(map).map(function (k) { return map[k]; }).sort(function (a, b) {
      var da = a.path.split('/').length, db = b.path.split('/').length;
      return da !== db ? da - db : (a.path < b.path ? -1 : 1);
    });
  }

  async function loadArchiveText(spec, options) {
    if (options && options.data != null) return options.data;
    spec = String(spec || '').trim();
    if (spec.charAt(0) === '{') return spec;
    if (!spec) fail('rom source required (URL or .json file)');
    if (typeof global.fetch !== 'function') fail('fetch is not available');
    var res;
    try { res = await global.fetch(spec); } catch (e) { fail('cannot load ' + spec + ': ' + (e && e.message || e)); }
    if (!res.ok) fail('cannot load ' + spec + ': HTTP ' + res.status);
    return res.text();
  }

  /* ------------------------------------------------------------------ */
  /* Partition table                                                     */
  /* ------------------------------------------------------------------ */

  function mountedAs(partName) {
    return mountOrder.filter(function (n) {
      return mounts[n].type === 'idb' && mounts[n].partition === partName;
    });
  }

  function partitionView(rec) {
    return {
      name: rec.name, device: DISK + 'p' + rec.index, disk: rec.disk || DISK, index: rec.index,
      fs: rec.fs, quota: rec.quota, used: rec.used || 0, count: rec.count || 0, boot: !!rec.boot,
      created: rec.created, formatted: rec.formatted, mountedAs: mountedAs(rec.name)
    };
  }

  async function storageEstimate() {
    try {
      var nav = global.navigator;
      if (nav && nav.storage && nav.storage.estimate) {
        var e = await nav.storage.estimate();
        return { quota: e.quota, usage: e.usage };
      }
    } catch (err) { /* estimate is best effort */ }
    return null;
  }

  async function overcommitWarnings(records) {
    var total = records.reduce(function (n, r) { return n + r.quota; }, 0);
    var est = await storageEstimate();
    if (est && est.quota && total > est.quota) {
      return ['Total partition size (' + formatSize(total) + ') exceeds the browser storage quota (' +
        formatSize(est.quota) + '); writes may fail before a partition fills.'];
    }
    return [];
  }

  async function findPartitionRecord(spec) {
    await migrate();
    spec = String(spec == null ? '' : spec).trim();
    var recs = await rawPartitions();
    var m = DEVICE_RE.exec(spec);
    if (m) {
      if (Number(m[1]) !== 0) return null;
      return recs.filter(function (r) { return r.index === Number(m[2]); })[0] || null;
    }
    return recs.filter(function (r) { return r.name === spec; })[0] || null;
  }

  async function requirePartition(spec) {
    var rec = await findPartitionRecord(spec);
    if (!rec) fail('no such partition: ' + spec + ' (see: fdisk -l)');
    return rec;
  }

  function checkQuota(bytes) {
    if (bytes < MIN_QUOTA) fail('partition too small (minimum ' + formatSize(MIN_QUOTA) + ')');
    if (bytes > MAX_QUOTA) fail('partition too large (maximum ' + formatSize(MAX_QUOTA) + ')');
  }

  async function partitions() {
    await migrate();
    var recs = await rawPartitions();
    return recs.sort(function (a, b) { return a.index - b.index; }).map(partitionView);
  }

  async function getPartition(spec) { return partitionView(await requirePartition(spec)); }

  async function disks() {
    var parts = await partitions();
    var est = await storageEstimate();
    return [{
      name: DISK, type: 'idb', database: DB_NAME, partitions: parts,
      allocated: parts.reduce(function (n, p) { return n + p.quota; }, 0),
      used: parts.reduce(function (n, p) { return n + p.used; }, 0),
      browserQuota: est ? est.quota : null, browserUsage: est ? est.usage : null
    }];
  }

  async function createPartition(name, bytes) {
    await migrate();
    name = String(name == null ? '' : name).trim();
    if (!DRIVE_RE.test(name) || DEVICE_RE.test(name) || RESERVED_NAMES.indexOf(name.toLowerCase()) >= 0) {
      fail('invalid partition name: ' + name);
    }
    bytes = bytes == null ? DEFAULT_QUOTA : Number(bytes);
    checkQuota(bytes);
    var recs = await rawPartitions();
    if (recs.some(function (r) { return r.name === name; })) fail('partition already exists: ' + name);
    if (recs.length >= MAX_PARTITIONS) fail('partition table is full (' + MAX_PARTITIONS + ' partitions)');
    var now = new Date().toISOString();
    var rec = {
      name: name, disk: DISK, index: lowestFreeIndex(recs), fs: 'cylonfs', quota: bytes,
      used: 0, count: 0, boot: false, created: now, formatted: now, schema: SCHEMA, version: 1
    };
    var db = await open();
    var tx = db.transaction(DRIVE_STORE, 'readwrite');
    tx.objectStore(DRIVE_STORE).add(rec);
    await txDone(tx);
    return { partition: partitionView(rec), warnings: await overcommitWarnings(recs.concat([rec])) };
  }

  async function resizePartition(spec, bytes) {
    var rec = await requirePartition(spec);
    bytes = Number(bytes);
    checkQuota(bytes);
    if (bytes < (rec.used || 0)) fail('cannot shrink below used space (' + formatSize(rec.used) + ' in use)');
    rec.quota = bytes;
    var db = await open();
    var tx = db.transaction(DRIVE_STORE, 'readwrite');
    tx.objectStore(DRIVE_STORE).put(rec);
    await txDone(tx);
    var recs = await rawPartitions();
    return { partition: partitionView(rec), warnings: await overcommitWarnings(recs) };
  }

  async function wipePartition(rec, remove) {
    var as = mountedAs(rec.name);
    if (as.length) fail('partition is mounted as ' + as.join(', ') + '; unmount it first');
    var db = await open();
    var tx = db.transaction([ENTRY_STORE, DRIVE_STORE], 'readwrite');
    tx.objectStore(ENTRY_STORE).delete(global.IDBKeyRange.bound([rec.name, ''], [rec.name, '\uffff']));
    if (remove) {
      tx.objectStore(DRIVE_STORE).delete(rec.name);
    } else {
      rec.used = 0; rec.count = 0; rec.formatted = new Date().toISOString();
      tx.objectStore(DRIVE_STORE).put(rec);
    }
    await txDone(tx);
  }

  async function deletePartition(spec) {
    var rec = await requirePartition(spec);
    await wipePartition(rec, true);
    return true;
  }

  async function formatPartition(spec) {
    var rec = await requirePartition(spec);
    var erased = rec.count || 0;
    await wipePartition(rec, false);
    return { partition: partitionView(rec), erased: erased };
  }

  // spec null/'none' clears the boot flag everywhere.
  async function setBootPartition(spec) {
    await migrate();
    var target = (spec == null || String(spec).toLowerCase() === 'none') ? null : await requirePartition(spec);
    var recs = await rawPartitions();
    var db = await open();
    var tx = db.transaction(DRIVE_STORE, 'readwrite');
    recs.forEach(function (r) {
      var want = !!target && r.name === target.name;
      if (!!r.boot !== want) { r.boot = want; tx.objectStore(DRIVE_STORE).put(r); }
    });
    await txDone(tx);
    return target ? target.name : null;
  }

  /* ------------------------------------------------------------------ */
  /* Mount table                                                         */
  /* ------------------------------------------------------------------ */

  function register(m) {
    if (!DRIVE_RE.test(m.name)) fail('invalid drive name: ' + m.name);
    if (mounts[m.name]) fail('drive name already in use: ' + m.name);
    m.mounted = new Date().toISOString();
    m.cwd = '';
    mounts[m.name] = m;
    mountOrder.push(m.name);
    if (!currentName) currentName = m.name;
    return m.name;
  }

  var MOUNT_TYPES = {
    idb: 'idb', indexdb: 'idb', indexeddb: 'idb',
    ls: 'ls', localstorage: 'ls',
    ram: 'ram', rom: 'rom', host: 'host'
  };

  function mountType(text) {
    return MOUNT_TYPES[String(text == null ? '' : text).trim().toLowerCase()] || null;
  }

  // Default drive name for a file/URL source: its file name, exactly as given.
  function sourceName(spec) {
    spec = String(spec || '').trim();
    if (!spec || spec.charAt(0) === '{') return '';
    var name = baseName(spec.split(/[?#]/)[0]);
    return name.replace(/\.(json|gfx)$/i, ''); // Strip extensions for clean drive names
  }
  
  async function mount(source, name, options) {
    if (name && typeof name === 'object') { options = name; name = null; }
    options = options || {};
    name = name ? String(name).trim() : '';
    source = String(source == null ? '' : source).trim();
    if (!source) fail('mount source required');
    await migrate();

    // The caller states the device type: either options.type ('idb', 'ls',
    // 'ram', 'rom') or an explicit "type:" prefix on the source. The source's
    // spelling (.json, http://) is never used to guess what it is.
    var kind = null, rest = source;
    var scheme = /^(idb|rom|ram|ls|host):([\s\S]*)$/i.exec(source);
    if (scheme) { kind = scheme[1].toLowerCase(); rest = scheme[2].trim(); }
    if (options.type != null && String(options.type).trim() !== '') {
      var wanted = mountType(options.type);
      if (!wanted) fail('unknown mount type: ' + options.type + ' (use idb, ls, ram or rom)');
      if (kind && kind !== wanted) fail('source says "' + kind + ':" but the mount type is "' + wanted + '"');
      kind = wanted;
    }
    if (!kind) fail('mount type required: idb, ls, ram or rom (' + source + ')');

    // --- BACKEND SECURITY ENFORCEMENT ---
    var restLower = rest.toLowerCase();
    var intendedName = (name || restLower).toLowerCase();
    
    if (kind === 'idb' && (restLower.endsWith('.gfx') || intendedName === 'desktop')) {
        fail('Security Violation: .gfx files (and the desktop data drive) cannot be mounted to IndexedDB.[.]');
    }
    if (kind === 'ls' && (restLower.endsWith('.json') || intendedName === 'cylon')) {
        fail('Security Violation: .json files (and the cylon OS drive) cannot be mounted to localStorage.[.]');
    }
    if (kind === 'ls' && intendedName === 'desktop') {
        var partsCheck = await partitions();
        var isInstalled = partsCheck.some(function(p) { return p.name === 'cylon' || p.name === 'cylon.json'; });
        if (!isInstalled) {
            fail('Security Violation: Cannot mount desktop to localStorage unless Cylon OS is installed.[.]');
        }
    }
    // ----------------------------------------

    var m;
    if (kind === 'idb') {
      var rec = await findPartitionRecord(rest);
      if (!rec) fail('no such partition: ' + rest + ' (see: fdisk -l)');
      var already = mountedAs(rec.name);
      if (already.length) fail('partition ' + rec.name + ' is already mounted as ' + already[0]);
      m = { name: name || rec.name, type: 'idb', source: 'idb:' + rec.name, partition: rec.name,
            readOnly: !!options.readOnly, backend: idbBackend(rec.name) };
    } else if (kind === 'rom') {
      var archive = decodeArchive(await loadArchiveText(rest, options));
      var entries = normalizeEntries(archive.entries);
      var total = entries.reduce(function (n, e) { return n + e.size; }, 0);
      if (total > MAX_ROM_BYTES) fail('rom image too large (' + formatSize(total) + ')');
      var store = memStore();
      entries.forEach(function (e) { store.set(e.path, e); });
      var derived = sourceName(rest) ||
        (archive.drive && DRIVE_RE.test(String(archive.drive)) ? String(archive.drive) : '');
      if (!name && !DRIVE_RE.test(derived)) fail('cannot derive a drive name; specify one');
      m = { name: name || derived, type: 'rom', source: rest.charAt(0) === '{' ? '(inline)' : rest,
            readOnly: true, backend: kvBackend('rom', store, { readOnly: true }) };
    } else if (kind === 'ram') {
      var store = memStore();
      var quota = options.quota || RAM_DEFAULT_QUOTA;
      
      // If a file was specified (e.g., ram:cylon.json), load and populate it
      if (rest) {
        var archive = decodeArchive(await loadArchiveText(rest, options));
        var entries = normalizeEntries(archive.entries);
        
        var total = entries.reduce(function (n, e) { return n + e.size; }, 0);
        if (total > quota) fail('ram image too large (' + formatSize(total) + ') for quota (' + formatSize(quota) + ')');
        
        entries.forEach(function (e) { store.set(e.path, e); });
      }
      m = { name: name || sourceName(rest) || 'ram', type: 'ram', source: rest ? 'ram:' + rest : 'ram:', readOnly: !!options.readOnly,
            backend: kvBackend('ram', store, { quota: quota }) };
      
    } else if (kind === 'ls') {
      if (!global.localStorage) fail('localStorage is not available');
      
      // Smart detection: is this a drive name to connect to, or a file to fetch?
      var isFile = rest.indexOf('/') !== -1 || rest.toLowerCase().endsWith('.gfx') || rest.toLowerCase().endsWith('.json') || rest.toLowerCase().startsWith('http');
      var actualDriveName = name || (isFile ? sourceName(rest) : rest);
      
      if (!DRIVE_RE.test(actualDriveName)) fail('invalid localStorage drive name: ' + actualDriveName);
      
      var store = lsStore(actualDriveName);
      
      // If a file was specified, fetch and populate localStorage automatically
      if (isFile) {
        var archive = decodeArchive(await loadArchiveText(rest, options));
        var entries = normalizeEntries(archive.entries);
        var quota = options.quota || RAM_DEFAULT_QUOTA;
        
        var total = entries.reduce(function (n, e) { return n + e.size; }, 0);
        if (total > quota) fail('ls image too large (' + formatSize(total) + ') for quota (' + formatSize(quota) + ')');
        
        entries.forEach(function (e) { store.set(e.path, e); });
      }
      
      m = { name: actualDriveName, type: 'ls', source: 'ls:' + rest, readOnly: !!options.readOnly,
            backend: kvBackend('ls', store, { quota: options.quota || RAM_DEFAULT_QUOTA }) };
    } else {
      fail('host folder devices are not implemented yet');
    }
    return register(m);
  }

  async function umount(name) {
    name = String(name == null ? '' : name).trim().replace(/:$/, '');
    if (!mounts[name]) fail('drive not mounted: ' + name);
    delete mounts[name];
    mountOrder.splice(mountOrder.indexOf(name), 1);
    if (currentName === name) currentName = mountOrder.length ? mountOrder[0] : null;
    return true;
  }

  async function mountTable() {
    var rows = [];
    for (var i = 0; i < mountOrder.length; i++) {
      var m = mounts[mountOrder[i]];
      var u = await m.backend.usage();
      rows.push({
        name: m.name, type: m.type, source: m.source, readOnly: m.readOnly,
        current: m.name === currentName, mounted: m.mounted, cwd: '/' + m.cwd,
        used: u.used, count: u.count, quota: u.quota
      });
    }
    return rows;
  }

  function setDrive(name) {
    name = String(name == null ? '' : name).trim().replace(/:$/, '');
    if (!mounts[name]) fail('drive not mounted: ' + name);
    currentName = name;
    return name;
  }

  function current() { return currentName ? mounts[currentName] : null; }

  function pwd() {
    var m = current();
    return m ? m.name + ':/' + m.cwd : '(no drive)';
  }

  // Resolves "drive:path", "/path" or "path" to a mount and normalized path.
  function ref(input, fallback) {
    input = String(input == null ? '' : input).trim();
    var match = REF_RE.exec(input);
    var m, rest = input;
    if (match) {
      m = mounts[match[1]];
      if (!m) fail('drive not mounted: ' + match[1]);
      rest = match[2];
    } else {
      m = fallback || current();
    }
    if (!m) fail('no drive mounted');
    return { mount: m, path: normalizePath(rest, m.cwd), qualified: !!match };
  }

  function writable(m) { if (m.readOnly) fail('drive is read-only: ' + m.name); }

  async function requireParent(m, path) {
    var parent = parentPath(path);
    if (!parent) return;
    var e = await m.backend.get(parent);
    if (!e || e.type !== 'directory') fail('parent directory not found');
  }

  /* ------------------------------------------------------------------ */
  /* File operations                                                     */
  /* ------------------------------------------------------------------ */

  async function save(path, content, metadata) {
    var r = ref(path), m = r.mount;
    path = pathCheck(r.path, false);
    writable(m);
    var value = String(content == null ? '' : content);
    var size = utf8Length(value);
    if (size > MAX_FILE_BYTES) fail('file too large (limit ' + formatSize(MAX_FILE_BYTES) + ')');
    var old = await m.backend.get(path);
    if (old && old.type === 'directory') fail('path is a directory');
    if (old && old.readOnly) fail('file is write-protected');
    await requireParent(m, path);
    await m.backend.commit({ put: [{
      path: path, type: 'file', content: value, size: size, timestamp: timestamp(),
      owner: metadata && metadata.owner || '', session: metadata && metadata.session || '',
      readOnly: !!(metadata && metadata.readOnly)
    }] });
    return true;
  }

  async function load(path) {
    var r = ref(path);
    var p = pathCheck(r.path, false);
    var entry = await r.mount.backend.get(p);
    return entry && entry.type === 'file' ? entry.content : null;
  }

  async function remove(path) {
    var wc = extractWildcard(path);

    if (!wc.regex) {
      // Standard single-file deletion
      var r = ref(path), m = r.mount;
      var p = pathCheck(r.path, false);
      writable(m);
      var entry = await m.backend.get(p);
      if (!entry) fail('file not found');
      if (entry.type === 'directory') fail('path is a directory (use rmdir)');
      if (entry.readOnly) fail('file is write-protected');
      await m.backend.commit({ remove: [p] });
      return 1;
    }

    // Wildcard bulk-deletion
    var r = ref(wc.path), m = r.mount;
    writable(m);
    var dirP = pathCheck(r.path, true);
    if (dirP) {
      var dirE = await m.backend.get(dirP);
      if (!dirE || dirE.type !== 'directory') fail('directory not found');
    }

    var entries = await m.backend.list(dirP);
    var toRemove = [];
    entries.forEach(function (e) {
      if (e.type === 'file' && !e.readOnly && wc.regex.test(baseName(e.path))) {
        toRemove.push(e.path);
      }
    });

    if (toRemove.length === 0) fail('no matching writable files found');
    await m.backend.commit({ remove: toRemove });
    return toRemove.length; // Return the count of deleted files
  }
  
  async function rename(source, destination) {
    var s = ref(source), m = s.mount;
    var d = ref(destination, m);
    if (d.mount !== m) fail('cannot rename across drives (use copy)');
    var from = pathCheck(s.path, false), to = pathCheck(d.path, false);
    writable(m);
    var entry = await m.backend.get(from);
    if (!entry) fail('file not found');
    if (await m.backend.get(to)) fail('destination already exists');
    await requireParent(m, to);
    var moved = [entry];
    if (entry.type === 'directory') {
      if (to.indexOf(from + '/') === 0) fail('cannot move a directory into itself');
      moved = moved.concat(await m.backend.subtree(from));
    }
    moved.forEach(function (e) { if (e.readOnly) fail('file is write-protected: ' + e.path); });
    var puts = moved.map(function (e) {
      return Object.assign({}, e, {
        path: to + e.path.substring(from.length),
        timestamp: e.path === from ? timestamp() : e.timestamp
      });
    });
    await m.backend.commit({ remove: moved.map(function (e) { return e.path; }), put: puts });
    if (m.cwd === from || m.cwd.indexOf(from + '/') === 0) m.cwd = to + m.cwd.substring(from.length);
    return true;
  }

  // Copies a file or a whole directory tree, within or across drives.
  // If the destination is an existing directory, the source is copied into it.
  async function copy(source, destination, options) {
    options = options || {};
    var s = ref(source), d = ref(destination);
    var from = pathCheck(s.path, false);
    var entry = await s.mount.backend.get(from);
    if (!entry) fail('file not found');
    writable(d.mount);
    var to = d.path;
    if (!to) {
      to = baseName(from);
    } else {
      var existing = await d.mount.backend.get(to);
      if (existing && existing.type === 'directory') to = to + '/' + baseName(from);
      else if (existing) fail('destination already exists');
    }
    pathCheck(to, false);
    if (s.mount === d.mount && (to === from || to.indexOf(from + '/') === 0)) fail('cannot copy a directory into itself');
    await requireParent(d.mount, to);
    var items = [entry];
    if (entry.type === 'directory') items = items.concat(await s.mount.backend.subtree(from));
    var puts = items.map(function (e) {
      return {
        path: to + e.path.substring(from.length), type: e.type, content: e.type === 'file' ? e.content : '',
        size: e.type === 'file' ? e.size : 0, timestamp: timestamp(), owner: e.owner || '', session: e.session || '',
        readOnly: options.keepFlags ? !!e.readOnly : false
      };
    });
    for (var i = 0; i < puts.length; i++) {
      if (await d.mount.backend.get(puts[i].path)) fail('destination already exists: ' + puts[i].path);
    }
    await d.mount.backend.commit({ put: puts });
    return d.mount.name + ':/' + to;
  }

  async function exists(path) {
    var r = ref(path);
    var p = pathCheck(r.path, true);
    if (!p) return true;
    return !!(await r.mount.backend.get(p));
  }

  async function mkdir(path) {
    var r = ref(path), m = r.mount;
    path = pathCheck(r.path, false);
    writable(m);
    if (await m.backend.get(path)) fail('path already exists');
    await requireParent(m, path);
    await m.backend.commit({ put: [{
      path: path, type: 'directory', content: '', size: 0, timestamp: timestamp(), owner: '', session: '', readOnly: false
    }] });
    return true;
  }

  // "cd live:/bin" switches to drive "live" and moves into /bin.
  async function chdir(path) {
    var r = ref(path || ''), m = r.mount;
    if (r.path) {
      var e = await m.backend.get(pathCheck(r.path, false));
      if (!e || e.type !== 'directory') fail('directory not found');
    }
    m.cwd = r.path;
    currentName = m.name;
    return m.name + ':/' + (m.cwd ? m.cwd + '/' : '');
  }

  async function rmdir(path) {
    var r = ref(path), m = r.mount;
    path = pathCheck(r.path, false);
    writable(m);
    var entry = await m.backend.get(path);
    if (!entry || entry.type !== 'directory') fail('directory not found');
    if ((await m.backend.subtree(path)).length) fail('directory not empty');
    await m.backend.commit({ remove: [path] });
    if (m.cwd === path || m.cwd.indexOf(path + '/') === 0) m.cwd = '';
    return true;
  }

  async function dirEntries(path) {
    var r = ref(typeof path === 'undefined' ? '' : path), m = r.mount;
    var p = pathCheck(r.path, true);
    if (p) {
      var e = await m.backend.get(p);
      if (!e) fail('directory not found');
      if (e.type !== 'directory') fail('not a directory');
    }
    return m.backend.list(p);
  }

  async function list(path) {
    var wc = extractWildcard(path);
    var entries = await dirEntries(wc.path);
    
    if (wc.regex) {
      entries = entries.filter(function (e) { return wc.regex.test(baseName(e.path)); });
    }
    
    return entries.filter(function (e) {
      return e.path !== MANIFEST_KEY && !baseName(e.path).startsWith('_');
    }).map(function (e) { return e.type === 'directory' ? baseName(e.path) + '/' : baseName(e.path); })
      .sort().join('\n');
  }

  async function dir(path) {
    var wc = extractWildcard(path);
    var entries = await dirEntries(wc.path);
    
    if (wc.regex) {
      entries = entries.filter(function (e) { return wc.regex.test(baseName(e.path)); });
    }
    
    return entries.map(function (e) {
      return {
        name: e.type === 'directory' ? '<' + e.path + '>' : e.path, type: e.type, size: e.size,
        timestamp: e.timestamp, owner: e.owner, session: e.session, readOnly: !!e.readOnly
      };
    }).sort(function (a, b) { return a.name.localeCompare(b.name); });
  }  

  function manifestText(entries) {
    var lines = entries.filter(function (e) { return e.path !== MANIFEST_KEY; }).map(function (e) {
      return (e.type === 'directory' ? '<' + e.path + '>' : e.path) + '|' +
        e.size + '|' + e.timestamp + '|' + (e.owner || '') + '|' + (e.session || '');
    });
    var body = lines.length ? lines.join('\n') + '\n' : '';
    var self = MANIFEST_KEY + '|0|' + timestamp();
    self = MANIFEST_KEY + '|' + utf8Length(body + self) + '|' + timestamp();
    return body + self;
  }

  async function manifest(name) {
    var m = name ? mounts[String(name).replace(/:$/, '')] : current();
    if (!m) fail(name ? 'drive not mounted: ' + name : 'no drive mounted');
    return manifestText(await m.backend.all());
  }

  async function exportDrive(name) {
    var m = name ? mounts[String(name).replace(/:$/, '')] : current();
    if (!m) fail(name ? 'drive not mounted: ' + name : 'no drive mounted');
    var entries = await m.backend.all();
    entries.sort(function (a, b) { return a.path < b.path ? -1 : 1; });
    return JSON.stringify({
      format: ARCHIVE_FORMAT, version: ARCHIVE_VERSION, drive: m.name, created: new Date().toISOString(),
      entries: entries.map(function (e) {
        return { name: e.path, type: e.type, content: e.type === 'file' ? e.content : undefined,
                 size: e.size, timestamp: e.timestamp, owner: e.owner, session: e.session, readOnly: !!e.readOnly };
      })
    }, null, 2); // Added null, 2 for pretty-printing
  }
  
  async function importDrive(input, options) {
    options = options || {};
    var m = options.drive ? mounts[String(options.drive).replace(/:$/, '')] : current();
    if (!m) fail(options.drive ? 'drive not mounted: ' + options.drive : 'no drive mounted');
    writable(m);
    var incoming = normalizeEntries(decodeArchive(input).entries);
    var replace = options.mode !== 'merge';
    var existing = await m.backend.all();
    var byPath = Object.create(null);
    existing.forEach(function (e) { byPath[e.path] = e; });
    var puts = incoming, removes = [];
    if (replace) {
      var keep = Object.create(null);
      incoming.forEach(function (e) { keep[e.path] = true; });
      removes = existing.filter(function (e) { return !keep[e.path]; }).map(function (e) { return e.path; });
    } else {
      puts = incoming.filter(function (e) {
        var old = byPath[e.path];
        if (!old) return true;
        if (old.type !== e.type) fail('import conflict: ' + e.path + ' changes between file and directory');
        if (e.type === 'directory') return false;
        if (old.readOnly) fail('file is write-protected: ' + e.path);
        return true;
      });
    }
    await m.backend.commit({ put: puts, remove: removes });
    return true;
  }

  async function createDrive(name) {
    return (await createPartition(name, DEFAULT_QUOTA)).partition.name;
  }

  /* ------------------------------------------------------------------ */
  /* Public API                                                          */
  /* ------------------------------------------------------------------ */

  global.CylonDOS = {
    open: open,
    ready: function () { return open().then(migrate); },

    mount: mount,
    umount: umount,
    mounts: mountTable,
    setDrive: setDrive,
    pwd: pwd,

    disks: disks,
    partitions: partitions,
    getPartition: getPartition,
    createPartition: createPartition,
    resizePartition: resizePartition,
    deletePartition: deletePartition,
    formatPartition: formatPartition,
    setBootPartition: setBootPartition,
    createDrive: createDrive,           // v2 compatibility: creates a default-size partition

    save: save,
    load: load,
    delete: remove,
    rename: rename,
    copy: copy,
    exists: exists,
    mkdir: mkdir,
    chdir: chdir,
    rmdir: rmdir,
    list: list,
    dir: dir,
    manifest: manifest,
    exportDrive: exportDrive,
    importDrive: importDrive,

    parseSize: parseSize,
    formatSize: formatSize,

    get mountedDrive() { return currentName; },
    get cwd() { var m = current(); return m && m.cwd ? '/' + m.cwd + '/' : '/'; },
    constants: {
      MANIFEST_KEY: MANIFEST_KEY, ARCHIVE_FORMAT: ARCHIVE_FORMAT, ARCHIVE_VERSION: ARCHIVE_VERSION,
      DEFAULT_QUOTA: DEFAULT_QUOTA, MIN_QUOTA: MIN_QUOTA, MAX_QUOTA: MAX_QUOTA, MAX_FILE_BYTES: MAX_FILE_BYTES,
      DISK: DISK
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
