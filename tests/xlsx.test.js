/**
 * The workbook writer.
 *
 * A workbook screen ships a real `.xlsx`, and the build has no dependency that could write one, so
 * the container is written here too. These tests read the bytes back the way Excel does: the ZIP
 * directory, the six parts, and the sheet XML inside — plus the promise that an unchanged lesson
 * produces an unchanged file, which is what makes a release diff readable.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { inflateRawSync } from "node:zlib";
import { describe, it } from "node:test";

import { spreadsheet, workbook, workbookName, workbookUrl } from "../legacy/src/xlsx.mjs";

const SHEET = {
  name: "Orders",
  startCell: "A1",
  rows: [
    ["Item", "Units", "Total"],
    ["Widget", 3, "=B2*2.5"],
    [null, 41, null],
    ["  padded  ", 0, "=SUM(C2:C3)"],
  ],
};

/** Every part of a ZIP, decompressed, keyed by the name its local header carries. */
function unzip(buffer) {
  const parts = new Map();
  let at = 0;
  while (at + 30 <= buffer.length && buffer.readUInt32LE(at) === 0x04034b50) {
    const method = buffer.readUInt16LE(at + 8);
    const compressed = buffer.readUInt32LE(at + 18);
    const nameLength = buffer.readUInt16LE(at + 26);
    const extraLength = buffer.readUInt16LE(at + 28);
    const name = buffer.toString("utf8", at + 30, at + 30 + nameLength);
    const start = at + 30 + nameLength + extraLength;
    const body = buffer.subarray(start, start + compressed);
    assert.ok(method === 8 || method === 0, `${name} uses compression method ${method}`);
    parts.set(name, (method === 8 ? inflateRawSync(body) : body).toString("utf8"));
    at = start + compressed;
  }
  return parts;
}

describe("the workbook writer", () => {
  it("writes a ZIP of the six parts an .xlsx needs", () => {
    const file = spreadsheet(SHEET);
    assert.equal(file.subarray(0, 4).toString("latin1"), "PK\x03\x04", "the file does not start with a ZIP header");
    assert.deepEqual(
      [...unzip(file).keys()],
      [
        "[Content_Types].xml",
        "_rels/.rels",
        "xl/workbook.xml",
        "xl/_rels/workbook.xml.rels",
        "xl/styles.xml",
        "xl/worksheets/sheet1.xml",
      ],
      "a part is missing or out of order",
    );
  });

  it("names the sheet in the workbook, escaped for XML", () => {
    const parts = unzip(spreadsheet({ ...SHEET, name: "Q1 & Q2" }));
    assert.match(parts.get("xl/workbook.xml"), /<sheet name="Q1 &amp; Q2" sheetId="1"/);
  });

  it("asks Excel to recalculate on open, because no value is cached", () => {
    // The cells carry formulas without results; without this flag a learner opens a sheet of zeroes.
    const parts = unzip(spreadsheet(SHEET));
    assert.match(parts.get("xl/workbook.xml"), /fullCalcOnLoad="1"/);
  });

  it("writes text, numbers and formulas as the cell types Excel reads", () => {
    const sheet = unzip(spreadsheet(SHEET)).get("xl/worksheets/sheet1.xml");
    assert.match(sheet, /<c r="A1" t="inlineStr"><is><t>Item<\/t><\/is><\/c>/, "text is not an inline string");
    assert.match(sheet, /<c r="B2"><v>3<\/v><\/c>/, "a number is not a numeric cell");
    assert.match(sheet, /<c r="C2"><f>B2\*2\.5<\/f><\/c>/, "a formula lost its = and became text");
    // Excel trims the padding unless the cell says otherwise, and the row it sits on must survive.
    assert.match(sheet, /<c r="A4" t="inlineStr"><is><t xml:space="preserve"> {2}padded {2}<\/t><\/is><\/c>/);
  });

  it("leaves blank cells and empty rows out", () => {
    const sheet = unzip(spreadsheet({ ...SHEET, rows: [[null, null], ["x"], [null, null]] })).get(
      "xl/worksheets/sheet1.xml",
    );
    // Row 1 is entirely blank, so it has no <row>; row 2 holds the only cell.
    assert.doesNotMatch(sheet, /<row r="1">/);
    assert.match(sheet, /<row r="2"><c r="A2" t="inlineStr"><is><t>x<\/t><\/is><\/c><\/row>/);
    assert.doesNotMatch(sheet, /<row r="3">/);
  });

  it("starts the grid wherever the screen says", () => {
    const sheet = unzip(spreadsheet({ ...SHEET, startCell: "C5", rows: [["x"]] })).get("xl/worksheets/sheet1.xml");
    assert.match(sheet, /<c r="C5"/);
  });

  it("builds the same bytes from the same rows", () => {
    // Timestamps and compression level are pinned, so a rebuild of unchanged content is a no-op diff.
    assert.ok(spreadsheet(SHEET).equals(spreadsheet(SHEET)), "two builds of one sheet differ");
  });

  it("refuses a start cell it cannot parse", () => {
    assert.throws(() => spreadsheet({ ...SHEET, startCell: "A" }), /xlsx: "A" is not a cell address/);
  });
});

describe("the workbook file name", () => {
  it("is derived from the lesson and the screen, kebab-cased", () => {
    assert.equal(workbookName("pivot-tables", "Screen 2: Totals"), "pivot-tables-screen-2-totals.xlsx");
    assert.equal(workbookUrl("pivot-tables", "Screen 2: Totals"), "/assets/files/pivot-tables-screen-2-totals.xlsx");
  });

  it("refuses an id with nothing a file name can keep", () => {
    // Silently returning ".xlsx" would ship a file with no name rather than fail the build.
    assert.throws(() => workbookName("pivot-tables", "///"), /has no characters a file name can keep/);
  });
});

/**
 * The second tab every formula screen ships: the same grid, with the reference formula in the answer
 * cell. Two tabs is the smallest case that proves the container is a workbook and not a sheet.
 */
const SOLUTION = { ...SHEET, name: "Solution", rows: [["Item", "Units", "Result"], ["Widget", 3, "=B2*2.5"]] };

describe("a workbook of more than one sheet", () => {
  it("carries one worksheet part per tab, after the parts every workbook needs", () => {
    assert.deepEqual(
      [...unzip(workbook([SHEET, SOLUTION])).keys()],
      [
        "[Content_Types].xml",
        "_rels/.rels",
        "xl/workbook.xml",
        "xl/_rels/workbook.xml.rels",
        "xl/styles.xml",
        "xl/worksheets/sheet1.xml",
        "xl/worksheets/sheet2.xml",
      ],
      "the second tab is missing or out of order",
    );
  });

  it("lists the tabs in the order they were given, each with its own relationship", () => {
    const parts = unzip(workbook([SHEET, SOLUTION]));
    assert.match(
      parts.get("xl/workbook.xml"),
      /<sheets><sheet name="Orders" sheetId="1" r:id="rId1"\/><sheet name="Solution" sheetId="2" r:id="rId2"\/><\/sheets>/,
    );
    const rels = parts.get("xl/_rels/workbook.xml.rels");
    assert.match(rels, /Id="rId1" Type="[^"]*\/worksheet" Target="worksheets\/sheet1\.xml"/);
    assert.match(rels, /Id="rId2" Type="[^"]*\/worksheet" Target="worksheets\/sheet2\.xml"/);
    // Styles keep the last id, so a reader that resolves it by number still finds one.
    assert.match(rels, /Id="rId3" Type="[^"]*\/styles" Target="styles\.xml"/);
  });

  it("declares every worksheet in the content types", () => {
    const types = unzip(workbook([SHEET, SOLUTION])).get("[Content_Types].xml");
    assert.match(types, /PartName="\/xl\/worksheets\/sheet1\.xml"/);
    assert.match(types, /PartName="\/xl\/worksheets\/sheet2\.xml"/);
  });

  it("writes each tab's own rows into its own part", () => {
    const parts = unzip(workbook([SHEET, SOLUTION]));
    assert.match(parts.get("xl/worksheets/sheet2.xml"), /<c r="C2"><f>B2\*2\.5<\/f><\/c>/);
    assert.doesNotMatch(parts.get("xl/worksheets/sheet1.xml"), /<c r="C3"><f>B2\*2\.5<\/f><\/c>/);
  });

  it("is exactly what one sheet writes when there is one sheet", () => {
    // The single-tab files shipped before multi-sheet workbooks existed, so the wrapper cannot change
    // a byte: a rebuild of an unchanged lesson has to stay a no-op diff.
    assert.ok(spreadsheet(SHEET).equals(workbook([SHEET])), "one sheet wrapped in a workbook is different bytes");
  });

  it("builds the same bytes from the same tabs, in a process that has never seen them", () => {
    const here = createHash("sha256").update(workbook([SHEET, SOLUTION])).digest("hex");
    const modulePath = new URL("../legacy/src/xlsx.mjs", import.meta.url).pathname;
    const script = `
      import { createHash } from "node:crypto";
      import { workbook } from ${JSON.stringify(modulePath)};
      const sheet = ${JSON.stringify(SHEET)};
      const solution = ${JSON.stringify(SOLUTION)};
      process.stdout.write(createHash("sha256").update(workbook([sheet, solution])).digest("hex"));
    `;
    const child = spawnSync(process.execPath, ["--input-type=module", "-e", script], { encoding: "utf8" });
    assert.equal(child.status, 0, child.stderr);
    assert.equal(child.stdout, here, "a fresh process built different bytes");
  });

  it("refuses a tab name Excel would refuse", () => {
    const check = (name, why) => assert.throws(() => workbook([SHEET, { ...SOLUTION, name }]), why);
    check("a".repeat(32), /longer than 31 characters/);
    check("Q1/Q2", /character Excel forbids/);
    check("Q1:Q2", /character Excel forbids/);
    check("   ", /every sheet needs a name/);
    check("'''", /only apostrophes/);
    assert.throws(() => workbook([SHEET, { ...SOLUTION, name: "orders" }]), /two sheets are both named/);
    assert.throws(() => workbook([]), /at least one sheet/);
  });
});
