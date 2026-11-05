/**
 * A workbook screen ships a real spreadsheet, and this writes it: `content/` holds the rows as JSON,
 * the build turns them into the smallest `.xlsx` Excel, Sheets and LibreOffice all open.
 *
 * The site has no dependencies and no bundler, so the container is written here too — an `.xlsx` is
 * a ZIP of six XML parts, and `zlib` is in Node. Every field that could vary between two builds is
 * pinned (timestamps, compression level, part order), so rebuilding an unchanged lesson produces a
 * byte-identical file: a release diff says whether the content changed rather than that the clock did.
 */

import { deflateRawSync } from "node:zlib";

import { addressOf, parseRef } from "./site/packages.mjs";
import { esc } from "./site/html.mjs";

const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

/**
 * The name a workbook screen's file ships under, relative to `/assets/files/`. Derived rather than
 * authored, so the link on the page, the file in `dist/` and the assertion in `verify` cannot drift;
 * `build` refuses two screens of one lesson that would land on the same name.
 */
export function workbookName(slug, screenId) {
  const safe = String(screenId)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (safe === "") throw new Error(`xlsx: screen id "${screenId}" has no characters a file name can keep`);
  return `${slug}-${safe}.xlsx`;
}

/** The public path a page links to. */
export function workbookUrl(slug, screenId) {
  return `/assets/files/${workbookName(slug, screenId)}`;
}

/**
 * A project ships one dataset for every task on it, served by `/datasets/<file>` rather than a file
 * per screen. The name is authored, so it is checked here: a project cannot ask for a path.
 */
export function datasetUrl(file) {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*\.xlsx$/.test(String(file))) {
    throw new Error(`xlsx: dataset file ${JSON.stringify(file)} must be lowercase-kebab and end in .xlsx`);
  }
  return `/datasets/${file}`;
}

function cellXml(address, value) {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "number") return `<c r="${address}"><v>${value}</v></c>`;
  const text = String(value);
  if (text.startsWith("=")) return `<c r="${address}"><f>${esc(text.slice(1))}</f></c>`;
  // Excel trims a leading or trailing space unless the text says to keep it.
  const space = text === text.trim() ? "" : ' xml:space="preserve"';
  return `<c r="${address}" t="inlineStr"><is><t${space}>${esc(text)}</t></is></c>`;
}

function sheetXml(sheet) {
  const start = parseRef(sheet.startCell);
  if (!start) throw new Error(`xlsx: "${sheet.startCell}" is not a cell address`);

  const rows = sheet.rows
    .map((row, rowOffset) => {
      const rowNumber = start.row + rowOffset;
      const cells = row
        .map((value, colOffset) => cellXml(addressOf(start.colIndex + colOffset, rowNumber), value))
        .join("");
      return cells === "" ? "" : `<row r="${rowNumber}">${cells}</row>`;
    })
    .filter((row) => row !== "")
    .join("");

  return `${XML_HEAD}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows}</sheetData></worksheet>`;
}

/**
 * What Excel accepts in a tab name: 31 characters, none of `[ ] : * ? / \`, and not built only of
 * apostrophes. Refused rather than truncated — a silently shortened name would make two tabs collide.
 */
const SHEET_NAME_LIMIT = 31;

function checkSheetNames(sheets) {
  if (!Array.isArray(sheets) || sheets.length === 0) throw new Error("xlsx: a workbook needs at least one sheet");
  const seen = new Set();
  for (const sheet of sheets) {
    const name = sheet?.name;
    if (typeof name !== "string" || name.trim() === "") {
      throw new Error("xlsx: every sheet needs a name");
    }
    if (name.length > SHEET_NAME_LIMIT) {
      throw new Error(`xlsx: sheet name ${JSON.stringify(name)} is longer than ${SHEET_NAME_LIMIT} characters`);
    }
    if (/[[\]:*?/\\]/.test(name)) {
      throw new Error(`xlsx: sheet name ${JSON.stringify(name)} contains a character Excel forbids: [ ] : * ? / \\`);
    }
    if (name.replace(/'/g, "") === "") throw new Error(`xlsx: sheet name ${JSON.stringify(name)} is only apostrophes`);
    const key = name.toLowerCase();
    if (seen.has(key)) throw new Error(`xlsx: two sheets are both named ${JSON.stringify(name)}`);
    seen.add(key);
  }
}

/**
 * The parts of the container: `4 + sheets + 1` entries. `fullCalcOnLoad` makes Excel recompute every
 * formula on open, because the cells are written without cached results — the alternative is a learner
 * opening a file whose answers read 0.
 */
function parts(sheets) {
  const count = sheets.length;
  const overrides = sheets
    .map(
      (_, index) =>
        `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
    )
    .join("");
  const sheetList = sheets
    .map((sheet, index) => `<sheet name="${esc(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`)
    .join("");
  const rels = sheets
    .map(
      (_, index) =>
        `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`,
    )
    .join("");
  return [
    {
      name: "[Content_Types].xml",
      body:
        `${XML_HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        overrides +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        "</Types>",
    },
    {
      name: "_rels/.rels",
      body:
        `${XML_HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        "</Relationships>",
    },
    {
      name: "xl/workbook.xml",
      body:
        `${XML_HEAD}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ` +
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        `<sheets>${sheetList}</sheets>` +
        '<calcPr calcId="0" fullCalcOnLoad="1"/></workbook>',
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      body:
        `${XML_HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        rels +
        `<Relationship Id="rId${count + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
        "</Relationships>",
    },
    {
      name: "xl/styles.xml",
      body:
        `${XML_HEAD}<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
        '<fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>' +
        '<fills count="1"><fill><patternFill patternType="none"/></fill></fills>' +
        '<borders count="1"><border/></borders>' +
        '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
        '<cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>' +
        "</styleSheet>",
    },
    ...sheets.map((sheet, index) => ({ name: `xl/worksheets/sheet${index + 1}.xml`, body: sheetXml(sheet) })),
  ];
}

/** CRC-32 as the ZIP format defines it — reflected, polynomial 0xEDB88320. */
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[index] = value;
  }
  return table;
})();

function crc32(buffer) {
  let crc = -1;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
}

/**
 * A ZIP with no compression choices to make: deflate everything, store no extra fields, and stamp
 * every entry 1980-01-01 00:00, the earliest date the format can hold.
 */
function zip(entries) {
  const locals = [];
  const central = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const body = Buffer.from(entry.body, "utf8");
    const deflated = deflateRawSync(body, { level: 9 });
    const checksum = crc32(body);

    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0, 6);
    header.writeUInt16LE(8, 8);
    header.writeUInt16LE(0, 10);
    header.writeUInt16LE(0x21, 12);
    header.writeUInt32LE(checksum, 14);
    header.writeUInt32LE(deflated.length, 18);
    header.writeUInt32LE(body.length, 22);
    header.writeUInt16LE(name.length, 26);
    header.writeUInt16LE(0, 28);
    locals.push(header, name, deflated);

    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50, 0);
    directory.writeUInt16LE(20, 4);
    directory.writeUInt16LE(20, 6);
    directory.writeUInt16LE(0, 8);
    directory.writeUInt16LE(8, 10);
    directory.writeUInt16LE(0, 12);
    directory.writeUInt16LE(0x21, 14);
    directory.writeUInt32LE(checksum, 16);
    directory.writeUInt32LE(deflated.length, 20);
    directory.writeUInt32LE(body.length, 24);
    directory.writeUInt16LE(name.length, 28);
    directory.writeUInt32LE(offset, 42);
    central.push(directory, name);

    offset += header.length + name.length + deflated.length;
  }

  const directorySize = central.reduce((total, chunk) => total + chunk.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directorySize, 12);
  end.writeUInt32LE(offset, 16);

  return Buffer.concat([...locals, ...central, end]);
}

/**
 * A workbook, as the bytes of an `.xlsx` file. Each sheet is a screen's `sheet` object: a name, the
 * address of the top-left cell, and rows of cells that are text, numbers or `null` for a blank. A tab
 * per sheet, in the order given — `Exercise` then `Solution` is how the site uses it.
 */
export function workbook(sheets) {
  checkSheetNames(sheets);
  return zip(parts(sheets));
}

/**
 * One sheet, as the bytes of an `.xlsx` file. `spreadsheet(sheet)` is `workbook([sheet])` byte for
 * byte, so the single-tab files that shipped before multi-sheet workbooks existed do not change.
 */
export function spreadsheet(sheet) {
  return workbook([sheet]);
}
