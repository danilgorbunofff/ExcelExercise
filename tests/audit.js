/**
 * The hand-computed expectations for the shipped lessons, kept in one place so both
 * the content suite and the fixture suite can hold the JSON to the same literal.
 * The arithmetic for every row is recorded in docs/phases/02-exercise-content.md;
 * these literals are typed from that audit trail, never copied from the evaluator.
 *
 * A lesson with one screen lists its row inline. A lesson with several screens lists one row per
 * screen under `screens` — each screen is a separate answer a learner can get right, so each one
 * gets its own hand computation.
 */
export const auditRows = (audit) => audit.screens ?? [audit];

export const AUDIT = {
  "01-sum-basics": {
    expected: 3580, // 1200 + 1450 + 930
    reference: "=SUM(B2:B4)",
    wrong: ["=1200+1450+930", "=SUM(B2:B3)", "=SUM(B2:B4)-1"],
  },
  "02-average-scores": {
    expected: 88.5, // (85 + 90 + 88 + 92 + 87.5) / 5
    reference: "=AVERAGE(B2:B6)",
    wrong: ["=SUM(B2:B6)/6", "=AVERAGE(B2:B6)*2", "=AVERAGE(B2:B5)"],
  },
  "03-countif-open-tickets": {
    screens: [
      {
        expected: 4, // T-1001, T-1003, T-1005, T-1007
        reference: '=COUNTIF(B2:B9,"Open")',
        wrong: ['=COUNTIF(B2:B9,"Open")+1', '=COUNTIF(B2:B9,"Closed")', '="4"'],
      },
      {
        // A shortcut screen is graded by its keys, not by a formula: `reference` is the press the
        // learner has to make, and `expected` is how the page spells that press back to them.
        expected: "Ctrl + Shift + L",
        reference: "Ctrl+Shift+L",
        wrong: ["Ctrl+L", "Ctrl+Shift+F", "Ctrl+Alt+L"],
      },
      {
        // Alt, H, O, I walks the ribbon: Home tab, Format menu, AutoFit Column Width. The three
        // wrong runs are the near misses — dropping a step, swapping the last two, picking the
        // number-format menu instead of Format.
        expected: "Alt then H then O then I",
        reference: "Alt, H, O, I",
        wrong: ["Alt, H, O", "Alt, H, I, O", "Alt, H, N, O"],
      },
    ],
  },
  "04-if-pass-fail": {
    expected: "Pass", // 70 >= 70, and exactly 70 so that ">70" is wrong
    reference: '=IF(B2>=70,"Pass","Fail")',
    wrong: [
      '=IF(B2>=70,"Fail","Pass")',
      '=IF(B2>=80,"Pass","Fail")',
      '=IF(B2>70,"Pass","Fail")',
      '=IF(B2>=70,"pass","fail")',
      '="Pass"',
    ],
  },
  "05-sumif-region": {
    expected: 900, // 320 + 180 + 400
    reference: '=SUMIF(A2:A6,"North",B2:B6)',
    wrong: ["=SUM(B2:B6)", '=SUMIF(A2:A6,"North")', '=SUMIF(B2:B6,"North",A2:A6)'],
  },
  "06-round-markup": {
    expected: 4450.4, // 4120.74 x 1.08 = 4450.3992
    reference: "=ROUND(SUM(B2:B4)*1.08,2)",
    wrong: ["=SUM(B2:B4)*1.08", "=ROUND(SUM(B2:B4),2)", "=ROUND(SUM(B2:B4)*1.8,2)"],
  },
  "07-vlookup-exact": {
    expected: 54000, // row E-104, salary column C
    reference: "=VLOOKUP(D2,A2:C6,3,FALSE)",
    wrong: ["=VLOOKUP(D2,A2:C6,3)", "=VLOOKUP(D2,A2:C6,2,FALSE)", "=54000"],
  },
  "08-index-match": {
    expected: 88000, // MATCH E-103 -> row 3, INDEX C2:C6 row 3
    reference: "=INDEX(C2:C6,MATCH(D3,A2:A6,0))",
    wrong: [
      '=VLOOKUP("E-103",A2:C6,3,FALSE)',
      "=INDEX(C2:C6,MATCH(D3,A2:A6,0))+1",
      "=INDEX(C2:C6,MATCH(D3,A2:A6,1))",
    ],
  },
  "09-left-find-prefix": {
    expected: "ORD", // FIND("-") = 4, LEFT takes 3 characters
    reference: '=LEFT(B2,FIND("-",B2)-1)',
    wrong: ['=LEFT(B2,FIND("-",B2))', "=LEFT(B2,2)", '=LEFT(B2,FIND("-",B2)+1)'],
  },
  "10-capstone-margin": {
    screens: [
      {
        expected: 44.8, // (2500 - 1380) / 2500 * 100
        reference:
          '=IFERROR(ROUND((SUMIF(A2:A5,"North",B2:B5)-SUMIF(A2:A5,"North",C2:C5))/SUMIF(A2:A5,"North",B2:B5)*100,1),"")',
        wrong: [
          '=IFERROR(ROUND((SUMIF(A2:A5,"South",B2:B5)-SUMIF(A2:A5,"South",C2:C5))/SUMIF(A2:A5,"South",B2:B5)*100,1),"")',
          '=IFERROR(ROUND((SUMIF(A2:A5,"North",B2:B5)-SUMIF(A2:A5,"North",C2:C5))/SUMIF(A2:A5,"North",B2:B5)*100,2),"")',
          '=IFERROR(SUMIF(A2:A5,"North",B2:B5)*100,"")',
        ],
      },
      {
        // The workbook screen asks for the cell the drill above finished in, so its answer is the same
        // 44.8 — read out of the file rather than worked out on the page. A workbook screen is graded
        // by its answer list, exactly as a picture screen is, so `reference` is that answer.
        expected: "44.8",
        reference: "44.8",
        wrong: ["44.4", "448", "0.448"],
      },
    ],
  },
  "11-vlookup-approximate-match-needs-a-sorted-column": {
    screens: [
      {
        expected: 0.05, // 4200 sits in the band that starts at 1000, so the rate is the second column
        reference: "=VLOOKUP(A6,A2:B5,2,TRUE)",
        wrong: ["=VLOOKUP(A6,A2:B5,2,FALSE)", "=VLOOKUP(A6,A2:B5,1,TRUE)", "=VLOOKUP(4200,A2:B5,2,TRUE)"],
      },
      {
        // The picture screen reorders the same bands, so the row that holds the 1000 band's rate is no
        // longer row 3: 1000 sits in A4 and 5% in B4. It is graded by its answer list, so `reference`
        // is that one spelling and every near miss is a cell that holds a different band's rate.
        expected: "B4",
        reference: "B4",
        wrong: ["B3", "B5", "B6", "4200"],
      },
    ],
  },
  "12-hlookup-look-across-a-row": {
    expected: 5, // Feb is the second column of B1:D3, and row 3 of that block is the price row
    reference: "=HLOOKUP(B4,B1:D3,3,FALSE)",
    wrong: ["=HLOOKUP(B4,B1:D3,2,FALSE)", '=HLOOKUP("Feb",B1:D3,3,FALSE)', "=HLOOKUP(B4,B1:D3,3,TRUE)"],
  },
  "13-vlookup-with-a-wildcard": {
    expected: 7, // three suppliers start with Northwind; Air is first in table order, so column 3 is 7
    reference: '=VLOOKUP(A7&"*",A1:C6,3,FALSE)',
    wrong: ["=VLOOKUP(A7,A1:C6,3,FALSE)", '=VLOOKUP("Northwind*",A1:C6,3,FALSE)', '=VLOOKUP(A7&"*",A1:C6,2,FALSE)'],
  },
  "14-two-way-lookup-with-vlookup-and-match": {
    expected: 110, // Widget is row 3 and MATCH puts Q2 in column 3, so the row's third value is 110
    reference: "=VLOOKUP(A6,A1:C5,MATCH(B6,A1:C1,0),FALSE)",
    wrong: [
      "=VLOOKUP(A6,A1:C5,2,FALSE)",
      '=VLOOKUP(A6,A1:C5,MATCH("Q1",A1:C1,0),FALSE)',
      "=VLOOKUP(A6,A1:C5,MATCH(B6,B1:C1,0),FALSE)",
    ],
  },
  "15-xlookup-exact-match-no-column-counting": {
    expected: 9.5, // TX-103 is the third SKU, so the third price is the answer
    reference: "=XLOOKUP(A6,A2:A5,D2:D5)",
    wrong: ["=XLOOKUP(A6,A2:A5,C2:C5)", "=XLOOKUP(A6,A2:A5,D1:D4)", "=XLOOKUP(A6,B2:B5,D2:D5)"],
  },
  "16-xlookup-search-from-the-bottom": {
    screens: [
      {
        // Two TX-101 rows: row 2 at 19.99 and row 4 at 21.5. Searching from the bottom starts
        // at row 6 and walks up, so the first match it meets is row 4.
        expected: 21.5,
        reference: "=XLOOKUP(A7,A2:A6,B2:B6,,0,-1)",
        wrong: [
          "=XLOOKUP(A7,A2:A6,B2:B6)", // default search mode returns row 2, the 19.99 price
          '=XLOOKUP("TX-101",A2:A6,B2:B6,,0,-1)', // the SKU typed into the formula, not read from A7
          "=VLOOKUP(A7,A2:B6,2,FALSE)", // VLOOKUP can only return the first match
        ],
      },
      {
        // Same table, second SKU: TX-102 at 14 in row 3 and 16.25 in row 6.
        expected: 16.25,
        reference: "=XLOOKUP(A8,A2:A6,B2:B6,,0,-1)",
        wrong: [
          "=XLOOKUP(A8,A2:A6,B2:B6)",
          '=XLOOKUP("TX-102",A2:A6,B2:B6,,0,-1)',
          "=VLOOKUP(A8,A2:B6,2,FALSE)",
        ],
      },
      {
        // The picture screen shows the formula bar reading C2:C6 while asking what the third
        // argument should point at. The price lives in B, so B2:B6 is the range the bar needs.
        expected: "B2:B6",
        reference: "B2:B6",
        wrong: ["B2:B5", "C2:C6", "A2:A6"],
      },
    ],
  },
  "17-min-and-max-fastest-and-slowest": {
    screens: [
      {
        // Four laps: 61.2, 58.4, 63.9, 59.1 in B2:B5. MIN keeps 58.4, which is Ben in row 3.
        expected: 58.4,
        reference: "=MIN(B2:B5)",
        wrong: [
          "=MAX(B2:B5)", // the slowest lap, the other end of the same range
          "=AVERAGE(B2:B5)", // 60.65 is a time no runner ran
          "=MIN(B2:B2)", // the range stops at Ada, so 61.2
        ],
      },
      {
        // Same four laps, now read with MAX: 63.9 is Cai in row 4.
        expected: 63.9,
        reference: "=MAX(B2:B5)",
        wrong: [
          "=MIN(B2:B5)",
          "=AVERAGE(B2:B5)",
          "=MAX(B2:B3)", // the range stops at Ben, so 61.2
        ],
      },
    ],
  },
};
