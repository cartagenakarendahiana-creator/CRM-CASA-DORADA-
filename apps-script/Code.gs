/**
 * CRM Casa Dorada — servidor en Google Apps Script.
 *
 * Se instala dentro de la hoja CasaDorada_CRM (Extensiones › Apps Script) y
 * guarda directamente en sus pestañas. Las columnas "ID CRM",
 * "Modificado CRM" e "Historial CRM" se agregan solas al final de cada pestaña.
 *
 * Seguridad: la aplicación web se publica para "Cualquier usuario" y cada
 * llamada exige el PIN guardado en Propiedades del script (clave PIN).
 */

var CRM_COLS = ['ID CRM', 'Modificado CRM', 'Historial CRM'];

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('CRM Casa Dorada')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** Ejecuta esta función una vez desde el editor para crear el PIN. */
function configurarPin() {
  var pin = '1234'; // ← cámbialo antes de ejecutar
  PropertiesService.getScriptProperties().setProperty('PIN', String(pin));
}

function checkPin_(pin) {
  var p = PropertiesService.getScriptProperties().getProperty('PIN');
  if (!p) throw new Error('SIN_PIN');
  if (String(pin || '') !== p) throw new Error('PIN_INCORRECTO');
}

function getRev_() {
  return PropertiesService.getScriptProperties().getProperty('REV') || '0';
}

function bumpRev_() {
  PropertiesService.getScriptProperties().setProperty('REV', String(Date.now()));
}

function sheet_(name) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sh) throw new Error('No existe la pestaña "' + name + '"');
  return sh;
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function cellOut_(v, tz) {
  if (v instanceof Date) return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
  return v === null || v === undefined ? '' : v;
}

/** Todas las pestañas: valores (fechas como aaaa-mm-dd) y celdas con fórmula. */
function getAll(pin) {
  checkPin_(pin);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tz = ss.getSpreadsheetTimeZone();
  var sheets = ss.getSheets().map(function (sh) {
    var lr = sh.getLastRow(), lc = sh.getLastColumn();
    if (!lr || !lc) return { name: sh.getName(), values: [], fx: {} };
    var rg = sh.getRange(1, 1, lr, lc);
    var values = rg.getValues().map(function (r) {
      return r.map(function (v) { return cellOut_(v, tz); });
    });
    var fx = {};
    rg.getFormulas().forEach(function (r, i) {
      var cols = [];
      r.forEach(function (f, j) { if (f) cols.push(j); });
      if (cols.length) fx[i] = cols;
    });
    return { name: sh.getName(), values: values, fx: fx };
  });
  return { sheets: sheets, rev: getRev_(), url: ss.getUrl() };
}

function getRev(pin) {
  checkPin_(pin);
  return getRev_();
}

/** Columnas del CRM (1-based). Si create, agrega al final las que falten. */
function crmCols_(sh, headerRow, extra, create) {
  var lc = Math.max(sh.getLastColumn(), 1);
  var hdr = sh.getRange(headerRow, 1, 1, lc).getValues()[0].map(function (h) { return String(h).trim(); });
  var wanted = (extra || []).concat(CRM_COLS);
  var next = lc + 1;
  var out = {};
  wanted.forEach(function (name) {
    var i = hdr.indexOf(name);
    if (i >= 0) { out[name] = i + 1; return; }
    if (!create) return;
    sh.getRange(headerRow, next).setValue(name).setFontWeight('bold');
    out[name] = next++;
  });
  return { id: out['ID CRM'], mod: out['Modificado CRM'], hist: out['Historial CRM'] };
}

/** Agrega columnas que falten y asigna ID a las filas indicadas. */
function prepareSheet(pin, name, headerRow, rows, extraHeaders) {
  checkPin_(pin);
  return withLock_(function () {
    var sh = sheet_(name);
    var c = crmCols_(sh, headerRow, extraHeaders, true);
    if (rows && rows.length) {
      var first = Math.min.apply(null, rows), last = Math.max.apply(null, rows);
      var rg = sh.getRange(first, c.id, last - first + 1, 1);
      var ids = rg.getValues();
      rows.forEach(function (r) {
        if (!ids[r - first][0]) ids[r - first][0] = Utilities.getUuid();
      });
      rg.setValues(ids);
    }
    bumpRev_();
    return true;
  });
}

function findRow_(sh, headerRow, idCol, id) {
  var lr = sh.getLastRow();
  if (lr <= headerRow) return null;
  var ids = sh.getRange(headerRow + 1, idCol, lr - headerRow, 1).getValues();
  for (var i = 0; i < ids.length; i++) if (String(ids[i][0]) === String(id)) return headerRow + 1 + i;
  return null;
}

/** Primera fila vacía (sin contar celdas con fórmula) debajo del encabezado. */
function firstEmptyRow_(sh, headerRow, width) {
  var lr = sh.getLastRow();
  if (lr > headerRow) {
    var rg = sh.getRange(headerRow + 1, 1, lr - headerRow, width);
    var vals = rg.getValues(), fs = rg.getFormulas();
    for (var i = 0; i < vals.length; i++) {
      var empty = true;
      for (var j = 0; j < width; j++) {
        if (!fs[i][j] && vals[i][j] !== '' && vals[i][j] !== null) { empty = false; break; }
      }
      if (empty) return headerRow + 1 + i;
    }
  }
  return Math.max(lr, headerRow) + 1;
}

function stamp_(who) {
  return new Date().toISOString() + ' · ' + String(who || '').slice(0, 60);
}

/**
 * Guarda un registro. req = {sheet, headerRow, id, values:{columna1: valor},
 * dates:[columnas], expectedMod, notes, who, force}.
 * Nunca escribe encima de una celda con fórmula.
 */
function saveRecord(pin, req) {
  checkPin_(pin);
  return withLock_(function () {
    var sh = sheet_(req.sheet);
    var c = crmCols_(sh, req.headerRow, [], true);
    var row = req.id ? findRow_(sh, req.headerRow, c.id, req.id) : null;
    var id = req.id;
    if (row && !req.force) {
      var cur = String(sh.getRange(row, c.mod).getValue() || '');
      if (cur !== String(req.expectedMod || '')) return { conflict: true, mod: cur };
    }
    var width = Math.max(sh.getLastColumn(), c.hist);
    if (!row) {
      row = firstEmptyRow_(sh, req.headerRow, width);
      if (!id) id = Utilities.getUuid();
    }
    var rg = sh.getRange(row, 1, 1, width);
    var vals = rg.getValues()[0], fs = rg.getFormulas()[0];
    Object.keys(req.values || {}).forEach(function (k) {
      var col = Number(k);
      if (!col || col > width || fs[col - 1]) return;
      var v = req.values[k];
      if ((req.dates || []).indexOf(col) >= 0 && /^\d{4}-\d{2}-\d{2}$/.test(String(v))) {
        var p = String(v).split('-');
        v = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
      }
      vals[col - 1] = v === null || v === undefined ? '' : v;
    });
    var mod = stamp_(req.who);
    vals[c.id - 1] = id;
    vals[c.mod - 1] = mod;
    if (req.notes !== undefined && req.notes !== null) vals[c.hist - 1] = req.notes;
    // Las celdas con fórmula se reescriben con su misma fórmula.
    for (var i = 0; i < width; i++) if (fs[i]) vals[i] = fs[i];
    rg.setValues([vals]);
    bumpRev_();
    return { ok: true, id: id, row: row, mod: mod };
  });
}

/** Agrega una línea al historial sin tocar el resto del registro. */
function appendNote(pin, req) {
  checkPin_(pin);
  return withLock_(function () {
    var sh = sheet_(req.sheet);
    var c = crmCols_(sh, req.headerRow, [], true);
    var row = findRow_(sh, req.headerRow, c.id, req.id);
    if (!row) return { missing: true };
    var cell = sh.getRange(row, c.hist);
    var old = String(cell.getValue() || '');
    cell.setValue(old ? old + '\n' + req.line : req.line);
    var mod = stamp_(req.who);
    sh.getRange(row, c.mod).setValue(mod);
    bumpRev_();
    return { ok: true, mod: mod };
  });
}

/** Vacía la fila del registro (conserva formato, listas y fórmulas). */
function deleteRecord(pin, req) {
  checkPin_(pin);
  return withLock_(function () {
    var sh = sheet_(req.sheet);
    var c = crmCols_(sh, req.headerRow, [], false);
    if (!c.id) return { missing: true };
    var row = findRow_(sh, req.headerRow, c.id, req.id);
    if (!row) return { missing: true };
    var width = sh.getLastColumn();
    var rg = sh.getRange(row, 1, 1, width);
    var fs = rg.getFormulas()[0];
    var vals = fs.map(function (f) { return f || ''; });
    rg.setValues([vals]);
    bumpRev_();
    return { ok: true };
  });
}
