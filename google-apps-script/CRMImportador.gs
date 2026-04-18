const CRM_SHEETS = {
  inicio: 'Inicio',
  importacion: 'Import',
  postulaciones: 'Postulaciones',
  configuracion: 'Configuración',
  dominios: 'Dominios',
  importLog: 'ImportLog',
};

const GENERIC_CONTACT_TOKENS = [
  'admin',
  'careers',
  'contact',
  'contacto',
  'empleo',
  'hr',
  'info',
  'jobs',
  'noreply',
  'no-reply',
  'postulaciones',
  'recepcion',
  'recruiting',
  'rrhh',
  'soporte',
  'support',
  'talent',
  'ventas',
];

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('CRM')
    .addItem('Procesar archivo de Inicio', 'procesarArchivoDeInicio')
    .addItem('Probar archivo por URL o ID', 'pedirArchivoYProcesar')
    .addToUi();
}

function pedirArchivoYProcesar() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.prompt(
    'Importar archivo',
    'Pega el link o ID del archivo de Drive que contiene correos.',
    ui.ButtonSet.OK_CANCEL
  );
  if (response.getSelectedButton() !== ui.Button.OK) {
    return;
  }
  procesarArchivo_(response.getResponseText());
}

function procesarArchivoDeInicio() {
  const sheet = SpreadsheetApp.getActive().getSheetByName(CRM_SHEETS.inicio);
  if (!sheet) {
    throw new Error('No existe la hoja Inicio.');
  }
  const rawValue = String(sheet.getRange('B7').getValue() || '').trim();
  if (!rawValue) {
    throw new Error('Pega primero un link o ID de Drive en Inicio!B7.');
  }
  procesarArchivo_(rawValue);
}

function procesarArchivo_(rawValue) {
  const ss = SpreadsheetApp.getActive();
  const inicio = ss.getSheetByName(CRM_SHEETS.inicio);
  const config = getConfig_();
  const fileId = extractDriveFileId_(rawValue);
  const file = DriveApp.getFileById(fileId);
  const text = extractTextFromFile_(file, config);
  const emails = Array.from(new Set(extractEmails_(text)));

  const existing = loadExistingEmails_(ss);
  const domainMap = loadDomainMap_(ss);
  const defaults = getImportDefaults_(config);

  const rows = [];
  let nuevos = 0;
  let duplicados = 0;
  let errores = 0;

  emails.forEach((email) => {
    const duplicate = existing.has(email);
    const company = inferCompany_(email.split('@')[1] || '', domainMap);
    const contact = inferContact_(email, defaults.contactFallback);
    const row = [
      email,
      company,
      contact,
      defaults.frequency,
      defaults.templateKey,
      '',
      defaults.attach,
      defaults.attachmentId,
      duplicate ? 'DUPLICADO' : 'LISTO',
      duplicate ? 'El email ya existe en Import o Postulaciones.' : '',
      file.getName(),
      new Date(),
    ];
    rows.push(row);
    if (duplicate) {
      duplicados += 1;
    } else {
      nuevos += 1;
      existing.add(email);
    }
  });

  if (!emails.length) {
    errores = 1;
  } else {
    appendImportRows_(ss, rows);
  }

  updateInicioStatus_(inicio, {
    fileName: file.getName(),
    total: emails.length,
    nuevos,
    duplicados,
    errores,
  });
  registerImportLog_(ss, file, emails.length, nuevos, duplicados, errores);
  updateLastImportedFile_(ss, file);
}

function extractTextFromFile_(file, config) {
  const mimeType = file.getMimeType();
  const blob = file.getBlob();

  if (mimeType === MimeType.PLAIN_TEXT || mimeType === MimeType.CSV || mimeType === 'text/csv') {
    return blob.getDataAsString();
  }

  if (mimeType === MimeType.GOOGLE_SHEETS) {
    return spreadsheetToText_(SpreadsheetApp.openById(file.getId()));
  }

  if (mimeType === MimeType.MICROSOFT_EXCEL || mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
    const tempSheetId = convertBlobToGoogleSheet_(blob, file.getName());
    try {
      return spreadsheetToText_(SpreadsheetApp.openById(tempSheetId));
    } finally {
      DriveApp.getFileById(tempSheetId).setTrashed(true);
    }
  }

  if (
    mimeType === MimeType.PDF ||
    mimeType === MimeType.PNG ||
    mimeType === MimeType.JPEG ||
    mimeType === MimeType.GIF ||
    /^image\//.test(mimeType)
  ) {
    const tempDocId = convertBlobToGoogleDocWithOcr_(blob, file.getName(), config.OCRLanguage || 'es');
    try {
      return DocumentApp.openById(tempDocId).getBody().getText();
    } finally {
      DriveApp.getFileById(tempDocId).setTrashed(true);
    }
  }

  return blob.getDataAsString();
}

function convertBlobToGoogleDocWithOcr_(blob, fileName, ocrLanguage) {
  const resource = {
    title: `${fileName} - OCR temporal`,
    mimeType: MimeType.GOOGLE_DOCS,
  };
  return Drive.Files.create(resource, blob, {
    convert: true,
    ocr: true,
    ocrLanguage,
  }).id;
}

function convertBlobToGoogleSheet_(blob, fileName) {
  const resource = {
    title: `${fileName} - hoja temporal`,
    mimeType: MimeType.GOOGLE_SHEETS,
  };
  return Drive.Files.create(resource, blob, { convert: true }).id;
}

function spreadsheetToText_(spreadsheet) {
  return spreadsheet
    .getSheets()
    .map((sheet) => {
      const values = sheet.getDataRange().getDisplayValues();
      return values.map((row) => row.join(' ')).join('\n');
    })
    .join('\n');
}

function extractEmails_(text) {
  const matches = String(text || '')
    .toLowerCase()
    .match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/g);
  return matches || [];
}

function loadExistingEmails_(ss) {
  const emails = new Set();
  [CRM_SHEETS.importacion, CRM_SHEETS.postulaciones].forEach((sheetName) => {
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      return;
    }
    const lastRow = Math.max(sheet.getLastRow(), 2);
    const column = sheetName === CRM_SHEETS.importacion ? 1 : 2;
    const values = sheet.getRange(2, column, lastRow - 1, 1).getDisplayValues().flat();
    values
      .map((value) => String(value || '').trim().toLowerCase())
      .filter(Boolean)
      .forEach((email) => emails.add(email));
  });
  return emails;
}

function loadDomainMap_(ss) {
  const sheet = ss.getSheetByName(CRM_SHEETS.dominios);
  const map = new Map();
  if (!sheet) {
    return map;
  }
  const values = sheet.getDataRange().getDisplayValues();
  values.slice(1).forEach(([domain, company]) => {
    const key = String(domain || '').trim().toLowerCase();
    const value = String(company || '').trim();
    if (key && value) {
      map.set(key, value);
    }
  });
  return map;
}

function inferCompany_(domain, domainMap) {
  const base = getBaseDomain_(domain);
  if (domainMap.has(base)) {
    return domainMap.get(base);
  }
  if (!base) {
    return '';
  }
  if (base.length <= 4) {
    return base.toUpperCase();
  }
  return base.charAt(0).toUpperCase() + base.slice(1);
}

function getBaseDomain_(domain) {
  const clean = String(domain || '').toLowerCase().replace(/^www\./, '');
  const parts = clean.split('.').filter(Boolean);
  if (parts.length >= 3 && ['com', 'org', 'net', 'gov'].includes(parts[parts.length - 2])) {
    return parts[parts.length - 3];
  }
  if (parts.length >= 2) {
    return parts[parts.length - 2];
  }
  return parts[0] || '';
}

function inferContact_(email, fallback) {
  const localPart = String(email || '').split('@')[0] || '';
  const normalized = localPart.replace(/[0-9]+/g, ' ').replace(/[._-]+/g, ' ').trim();
  if (!normalized) {
    return fallback;
  }
  const parts = normalized.split(/\s+/).filter(Boolean);
  const looksGeneric = parts.some((part) => GENERIC_CONTACT_TOKENS.indexOf(part.toLowerCase()) >= 0);
  const looksInitials = parts.every((part) => part.length <= 2);
  if (looksGeneric || looksInitials) {
    return fallback;
  }
  return parts.map(capitalizeWord_).join(' ');
}

function capitalizeWord_(value) {
  if (!value) {
    return '';
  }
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

function appendImportRows_(ss, rows) {
  if (!rows.length) {
    return;
  }
  const sheet = ss.getSheetByName(CRM_SHEETS.importacion);
  const startRow = Math.max(sheet.getLastRow() + 1, 2);
  sheet.getRange(startRow, 1, rows.length, rows[0].length).setValues(rows);
}

function updateInicioStatus_(sheet, stats) {
  sheet.getRange('B8').setValue(`Archivo procesado: ${stats.fileName}`);
  sheet.getRange('B9').setValue(stats.total);
  sheet.getRange('B10').setValue(stats.nuevos);
  sheet.getRange('B11').setValue(stats.duplicados);
  sheet.getRange('B12').setValue(stats.errores);
}

function registerImportLog_(ss, file, total, nuevos, duplicados, errores) {
  const sheet = ss.getSheetByName(CRM_SHEETS.importLog);
  if (!sheet) {
    return;
  }
  sheet.appendRow([
    new Date(),
    file.getName(),
    file.getMimeType(),
    total,
    nuevos,
    duplicados,
    errores,
    total ? 'Importacion procesada correctamente.' : 'No se detectaron correos en el archivo.',
  ]);
}

function updateLastImportedFile_(ss, file) {
  const sheet = ss.getSheetByName(CRM_SHEETS.configuracion);
  if (!sheet) {
    return;
  }
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getDisplayValues();
  const rowIndex = values.findIndex(([key]) => key === 'UltimoArchivoImportado');
  if (rowIndex >= 0) {
    sheet.getRange(rowIndex + 2, 2).setValue(file.getName());
  }
}

function getConfig_() {
  const sheet = SpreadsheetApp.getActive().getSheetByName(CRM_SHEETS.configuracion);
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getDisplayValues();
  const config = {};
  values.forEach(([key, value]) => {
    if (key) {
      config[key] = value;
    }
  });
  return config;
}

function getImportDefaults_(config) {
  return {
    frequency: config.FrecuenciaDefault || 'Mensual',
    templateKey: config.TemplateDefault || 'presentacion_oilgas',
    attach: normalizeBoolean_(config.AdjuntarDefault, true),
    attachmentId: config.AdjuntoDefaultId || '',
    contactFallback: config.ContactoFallback || 'A quien corresponda',
  };
}

function extractDriveFileId_(value) {
  const text = String(value || '').trim();
  const match = text.match(/[-\w]{25,}/);
  if (!match) {
    throw new Error('No pude reconocer un ID de Drive valido.');
  }
  return match[0];
}

function normalizeBoolean_(value, defaultValue) {
  const text = String(value || '').trim().toUpperCase();
  if (text === 'TRUE' || text === 'SI' || text === 'YES') {
    return 'TRUE';
  }
  if (text === 'FALSE' || text === 'NO') {
    return 'FALSE';
  }
  return defaultValue ? 'TRUE' : 'FALSE';
}
