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
  "18-count-numbers-only-and-what-it-skips": {
    // 12.5, 8.2 and 15 are the only cells Excel holds as numbers; n/a, the blank in B5 and
    // the text 7 are all skipped, so the count is 3.
    expected: 3,
    reference: "=COUNT(B2:B7)",
    wrong: ["=COUNTA(B2:B7)", "=COUNT(B2:B5)", "=SUM(B2:B7)", "=COUNT(B2:B7)-1"],
  },
  "19-counta-count-the-non-empty-cells": {
    // Three of the five steps hold a date. COUNT would answer 0 because the dates are text.
    expected: 3,
    reference: "=COUNTA(B2:B6)",
    wrong: ["=COUNT(B2:B6)", "=COUNTA(B2:B4)", "=COUNTA(B2:B6)+1"],
  },
  "20-roundup-and-rounddown-one-direction-only": {
    screens: [
      {
        // 476 / 12 = 39.67, and a part crate still ships, so ROUNDUP answers 40.
        expected: 40,
        reference: "=ROUNDUP(B5/12,0)",
        wrong: ["=ROUNDDOWN(B5/12,0)", "=ROUNDUP(B4/12,0)", "=ROUNDUP(B5,0)"],
      },
      {
        // The same 39.67 read the other way: 39 full crates and 8 units left over.
        expected: 39,
        reference: "=ROUNDDOWN(B5/12,0)",
        wrong: ["=ROUNDUP(B5/12,0)", "=ROUNDDOWN(B4/12,0)", "=ROUNDDOWN(B5,0)"],
      },
    ],
  },
  "21-xlookup-with-a-fallback-when-nothing-matches": {
    // TX-104 is not in A2:A4, so the fourth argument is what the cell shows.
    expected: "not stocked",
    reference: '=XLOOKUP(B5,A2:A4,B2:B4,"not stocked")',
    wrong: ["=XLOOKUP(B5,A2:A4,B2:B4)", '=XLOOKUP(B5,A2:A4,B2:B4,"Not stocked")', "=VLOOKUP(B5,A2:B4,2,FALSE)"],
  },
  "22-match-find-a-value-s-position": {
    // Jan 1, Feb 2, Mar 3: B6 asks about Mar, so MATCH reports 3.
    expected: 3,
    reference: "=MATCH(B6,A2:A5,0)",
    wrong: ["=MATCH(B6,A2:A5,0)+1", "=MATCH(B5,A2:A5,0)", "=MATCH(B6,A2:A3,0)"],
  },
  "23-index-a-value-at-a-row-and-column": {
    // Row 3 is Gizmo, column 2 of B2:D4 is Q2, so the cell is 160.
    expected: 160,
    reference: "=INDEX(B2:D4,B5,B6)",
    wrong: ["=INDEX(B2:D4,B5,B5)", "=INDEX(B2:D4,B6,B5)", "=INDEX(B2:D3,B5,B6)"],
  },
  "24-len-left-and-right-count-and-cut": {
    screens: [
      {
        // "Invoice" is seven characters, the space is one, "2026-03" is seven: 15.
        expected: 15,
        reference: "=LEN(A2)",
        wrong: ["=LEN(A2)-1", "=LEFT(A2,15)", "=LEN(A1)"],
      },
      {
        // The first three characters of Invoice 2026-03.
        expected: "Inv",
        reference: "=LEFT(A2,3)",
        wrong: ["=RIGHT(A2,3)", "=LEFT(A2,2)", "=LEFT(A2,4)"],
      },
      {
        // The last four characters: 6, -, 0, 3.
        expected: "6-03",
        reference: "=RIGHT(A2,4)",
        wrong: ["=LEFT(A2,4)", "=RIGHT(A2,3)", "=RIGHT(A2,5)"],
      },
    ],
  },
  "25-concat-and-the-operator": {
    // A2 is Ada, B2 is Lovelace, and the space between them is passed in.
    expected: "Ada Lovelace",
    reference: '=CONCAT(A2," ",B2)',
    wrong: ['=CONCAT(B2," ",A2)', "=CONCAT(A2,B2)", '=A2&" "&B3'],
  },
  "26-iferror-catch-the-error-show-your-text": {
    // TX-109 is not in A2:B3, so the lookup fails and the fallback is what shows.
    expected: "no price",
    reference: '=IFERROR(VLOOKUP(A4,A2:B3,2,FALSE),"no price")',
    wrong: ["=VLOOKUP(A4,A2:B3,2,FALSE)", '=IFERROR(VLOOKUP(A4,A2:B3,2,FALSE),"missing")', '=IFERROR(A4,"no price")'],
  },
  "27-what-a-formula-actually-does": {
    expected: 35, // 12 + 9 + 14
    reference: "=SUM(B2:B4)",
    wrong: ["=SUM(B2:B3)", "=SUM(B2:B4)-1", "=SUM(B2:B4)+1"],
  },
  "28-cell-references-relative-and-absolute": {
    expected: 126.5, // Friday's 110 crates at 1.15 a crate
    reference: "=ROUND(B6*$C$7,2)",
    wrong: ["=B6*$C$7", "=ROUND(B6*$C$7,0)", "=ROUND(B5*$C$7,2)"],
  },
  "29-autosum-and-the-status-bar-total": {
    expected: 476, // 120 + 95 + 60 + 145 + 40 + 12.5 + 3.5
    reference: "=SUM(B2:B8)",
    wrong: ["=SUM(B2:B7)", "=B9", "=SUM(B2:B8)+1"],
  },
  "30-vlookup-and-xlookup-on-the-same-table": {
    screens: [
      {
        expected: 3.8, // CX-330 is row 3 of A2:C5, so column 3 is its price
        reference: "=VLOOKUP(B6,A2:C5,3,FALSE)",
        wrong: ["=VLOOKUP(B6,A2:C5,2,FALSE)", "=VLOOKUP(B6,A2:C5,3,TRUE)", "=VLOOKUP(B5,A2:C5,3,FALSE)"],
      },
      {
        expected: 3.8, // same row, picked by XLOOKUP rather than by column number
        reference: "=XLOOKUP(B6,A2:A5,C2:C5)",
        wrong: ["=XLOOKUP(B6,A2:A5,B2:B5)", "=XLOOKUP(B6,A2:A5,D2:D5)", "=XLOOKUP(B7,A2:A5,C2:C5)"],
      },
    ],
  },
  "31-lookup-functions-summary": {
    expected: "Dowel", // DX-410 is the third SKU, and Dowel sits one column to its left
    reference: "=XLOOKUP(B6,B2:B5,A2:A5)",
    wrong: ["=XLOOKUP(B6,B2:B5,C2:C5)", "=XLOOKUP(B5,B2:B5,A2:A5)", "=XLOOKUP(B6,A2:A5,B2:B5)"],
  },
  "32-index-match-look-left-of-the-key": {
    expected: "Junction box", // 3.25 is row 2 of A2:A5
    reference: "=INDEX(A2:A5,MATCH(B6,B2:B5,0))",
    wrong: ["=INDEX(A2:A5,MATCH(B5,B2:B5,0))", "=INDEX(A2:A5,MATCH(B6,B2:B5,1))", "=INDEX(B2:B5,MATCH(B6,B2:B5,0))"],
  },
  "33-two-way-index-match": {
    expected: 130, // South is row 2 of B2:D4, Q3 is column 3
    reference: "=INDEX(B2:D4,MATCH(B5,A2:A4,0),MATCH(B6,B1:D1,0))",
    wrong: [
      "=INDEX(B2:D4,MATCH(B5,A2:A4,0),MATCH(B6,B1:D1,0)-1)",
      "=INDEX(B2:D4,MATCH(B6,A2:A4,0),MATCH(B5,B1:D1,0))",
      "=INDEX(B2:D4,MATCH(B5,A2:A4,0),2)",
    ],
  },
  "34-index-and-match-summary": {
    expected: 0.04, // 150 sits in the 100-199 band, so the rate is the row beginning 100
    reference: "=INDEX(B2:B4,MATCH(B5,A2:A4,1))",
    wrong: ["=INDEX(B2:B4,3)", "=INDEX(B2:B4,MATCH(B5,A2:A4,1))-0.02", "=INDEX(B2:B4,MATCH(B5,A2:A4,0))"],
  },
  "35-textjoin-join-a-range-and-skip-blanks": {
    expected: "Engineering, Research, Ops", // Grace and Katherine have no department, so the two blanks vanish
    reference: '=TEXTJOIN(", ",TRUE,B2:B6)',
    wrong: ['=TEXTJOIN(", ",FALSE,B2:B6)', '=TEXTJOIN("-",TRUE,B2:B6)', '=TEXTJOIN(", ",TRUE,B2:B4)'],
  },
  "36-upper-lower-and-proper": {
    screens: [
      {
        expected: "AB-2291-XK", // every letter of the reference in capitals
        reference: "=UPPER(A2)",
        wrong: ["=LOWER(A2)", "=PROPER(A2)", "=UPPER(A3)"],
      },
      {
        expected: "Ada Lovelace", // one capital per word instead of a surname shouted in capitals
        reference: "=PROPER(A2)",
        wrong: ["=UPPER(A2)", "=LOWER(A2)", "=PROPER(A3)"],
      },
    ],
  },
  "37-today-and-now-the-volatile-clock": {
    screens: [
      {
        expected: 14, // 15 March 2024 is serial 45366 and 1 March is 45352, so 45366 - 45352 = 14
        reference: "=TODAY()-B2",
        wrong: ["=TODAY()-B3", "=TODAY()-B2+1", "=NOW()-B2"],
      },
      {
        expected: 14, // 45366.604166667 is 14:30, so the hour is 14 and the 30 is the minutes past it
        reference: "=HOUR(B2)",
        wrong: ["=MINUTE(B2)", "=HOUR(B2)+1", "=HOUR(B2)/24"],
      },
    ],
  },
  "38-date-build-a-date-from-parts": {
    screens: [
      {
        expected: 45352, // 1 March 2024: 2024-03-01 is serial 45352
        reference: "=DATE(B2,C2,D2)",
        wrong: ["=DATE(B2,C2,D3)", "=DATE(B3,C3,D3)", "=DATE(B2,C2,D2)-1"],
      },
      {
        expected: 45383, // March has 31 days, so 45352 + 31 is the first of April
        reference: "=DATE(2024,B2+1,1)",
        wrong: ["=DATE(2024,B2,1)", "=DATE(2024,B2+1,0)", "=DATE(2024,B2+1,1)-1"],
      },
    ],
  },
  "39-datedif-days-months-or-years-between": {
    screens: [
      {
        expected: 2, // 2022-01-01 to 2024-03-01: two whole years (two of them, not a rounded 2.17)
        reference: '=DATEDIF(B2,C2,"Y")',
        wrong: ['=DATEDIF(B2,C2,"M")', '=DATEDIF(C2,B2,"Y")', '=DATEDIF(B2,C2,"D")'],
      },
      {
        expected: 38, // 2021-01-01 to 2024-03-01: 36 months plus January and February 2024
        reference: '=DATEDIF(B2,C2,"M")',
        wrong: ['=DATEDIF(B2,C2,"Y")', '=DATEDIF(B2,C2,"YM")', '=DATEDIF(B3,C3,"M")'],
      },
    ],
  },
  "40-days-and-simple-date-maths": {
    screens: [
      {
        expected: 14, // 45366 - 45352; end date first, so the count of days is positive
        reference: "=DAYS(C2,B2)",
        wrong: ["=DAYS(B2,C2)", "=(C2-B2)/7", "=DAYS(C2,B3)"],
      },
      {
        expected: 9, // 45415 - 45352 = 63 days, and 63 / 7 is nine whole weeks
        reference: "=DAYS(C2,B2)/7",
        wrong: ["=DAYS(C2,B2)", "=DAYS(B2,C2)/7", "=DAYS(C2,B3)/7"],
      },
    ],
  },
  "41-date-functions-summary": {
    screens: [
      {
        expected: 26, // 1 Jan 2022 to the pinned 15 Mar 2024: 26 completed months
        reference: '=DATEDIF(B2,TODAY(),"M")',
        wrong: ['=DATEDIF(B2,TODAY(),"Y")', '=DATEDIF(B2,TODAY(),"D")', '=DATEDIF(B3,TODAY(),"M")'],
      },
      {
        expected: 45412, // 1 Mar 2024 plus one month, to its last day, is 30 April 2024
        reference: "=EOMONTH(B2,1)",
        wrong: ["=EOMONTH(B2,0)", "=EOMONTH(B2,2)", "=EOMONTH(B3,1)"],
      },
    ],
  },
  "43-large-and-small-the-nth-highest": {
    screens: [
      {
        expected: 58, // times 58 61 55 57 50: second highest is 58, not the row-2 value
        reference: "=LARGE(B2:B6,2)",
        wrong: ["=MAX(B2:B6)", "=LARGE(B2:B6,1)", "=SMALL(B2:B6,2)"],
      },
      {
        expected: 38, // costs 40 35 52 38 47: cheapest is 35, so the second cheapest is 38
        reference: "=SMALL(B2:B6,2)",
        wrong: ["=MIN(B2:B6)", "=SMALL(B2:B6,1)", "=SMALL(B2:B6,4)"],
      },
    ],
  },
  "44-median-the-middle-value": {
    screens: [
      {
        expected: 15, // 12 18 14 19 15 sorts to 12 14 15 18 19, middle is 15
        reference: "=MEDIAN(B2:B6)",
        wrong: ["=AVERAGE(B2:B6)", "=MEDIAN(B2:B4)", "=MEDIAN(B2:B5)"],
      },
      {
        expected: 16.5, // 12 18 14 19 15 40: middle pair is 15 and 18, so 16.5
        reference: "=MEDIAN(B2:B7)",
        wrong: ["=AVERAGE(B2:B7)", "=MEDIAN(B2:B6)", "=MEDIAN(B2:B5)"],
      },
    ],
  },
  "45-mode-the-most-common-value": {
    screens: [
      {
        expected: 3, // sizes 3 5 3 7 3 5: three occurs three times, five twice
        reference: "=MODE(B2:B7)",
        wrong: ["=MEDIAN(B2:B7)", "=MAX(B2:B7)", "=MODE(B2:B7)*2"],
      },
      {
        expected: 2, // boxes 2 9 2 4 7 2 9: two occurs three times, nine twice
        reference: "=MODE(B2:B8)",
        wrong: ["=MEDIAN(B2:B8)", "=MODE(B2:B8)-1", "=MODE(B2:B8)*3"],
      },
    ],
  },
  "46-rank-a-list-without-sorting-it": {
    screens: [
      {
        expected: 2, // 61 is the only time faster than 58
        reference: "=RANK(B2,B2:B6)",
        wrong: ["=RANK(B2,B2:B6,1)", "=RANK(B3,B2:B6)", "=COUNTIF(B2:B6,\">\"&B2)+1"],
      },
      {
        expected: 4, // ascending 50 55 57 58 61 puts 58 fourth from the bottom
        reference: "=RANK(B2,B2:B6,1)",
        wrong: ["=RANK(B2,B2:B6)", "=RANK(B3,B2:B6,1)", "=RANK(B2,B2:B6,1)*2"],
      },
    ],
  },
  "47-average-functions-summary": {
    screens: [
      {
        expected: 59.5, // best two times are 61 and 58, and their average is 59.5
        reference: "=(LARGE(B2:B6,1)+LARGE(B2:B6,2))/2",
        wrong: ["=AVERAGE(B2:B6)", "=LARGE(B2:B6,2)", "=(LARGE(B2:B6,2)+LARGE(B2:B6,3))/2"],
      },
      {
        expected: 3, // median time is 57, and 61 58 57 rank it third
        reference: "=RANK(MEDIAN(B2:B6),B2:B6)",
        wrong: ["=MEDIAN(B2:B6)", "=RANK(B2,B2:B6)", "=RANK(MEDIAN(B2:B6),B2:B6)*2"],
      },
    ],
  },
  "42-mround-and-floor-round-to-a-multiple": {
    screens: [
      {
        expected: 45, // 47 is two from 45 and three from 50, so the nearest five is 45
        reference: "=MROUND(B2,5)",
        wrong: ["=ROUND(B2,0)", "=MROUND(B2,10)", "=FLOOR(B2,5)"],
      },
      {
        expected: 42, // seven packs of six fit into 47 units, and five are left over
        reference: "=FLOOR(B2,C2)",
        wrong: ["=CEILING(B2,C2)", "=ROUND(B2/C2,0)*C2", "=FLOOR(B2,1)"],
      },
    ],
  },
  "48-sumifs-two-conditions-at-once": {
    screens: [
      {
        expected: 720, // North + Ada: 320 in row 2, 400 in row 6; 180 is North but Cleo's
        reference: '=SUMIFS(C2:C6,A2:A6,"North",B2:B6,"Ada")',
        wrong: ['=SUMIFS(C2:C6,A2:A6,"North")', '=SUMIFS(C2:C6,A2:A6,"South")', "=SUM(C2:C6)"],
      },
      {
        expected: 620, // shipped and over 200: 320 + 300; the 180 order is shipped but under the line
        reference: '=SUMIFS(C2:C6,B2:B6,"Shipped",C2:C6,">200")',
        wrong: ['=SUMIFS(C2:C6,B2:B6,"Pending",C2:C6,">200")', '=SUMIF(B2:B6,"Shipped",C2:C6)', '=SUMIFS(C2:C6,B2:B6,"Shipped",C2:C6,"<200")'],
      },
    ],
  },
  "49-sumif-a-sum-range-on-another-column": {
    screens: [
      {
        expected: 90, // North bonuses: 32 + 18 + 40; the amounts column would give 900
        reference: '=SUMIF(A2:A6,"North",C2:C6)',
        wrong: ['=SUMIF(A2:A6,"North",B2:B6)', '=SUMIF(A2:A6,"South",C2:C6)', '=SUMIF(A2:A6,"North")'],
      },
      {
        expected: 99, // above 40: 52 + 47; 40, 38 and 35 are below the line
        reference: '=SUMIF(B2:B6,">40")',
        wrong: ['=SUMIF(B2:B6,"<40")', '=SUMIF(B2:B6,">=40")', "=SUM(B2:B6)"],
      },
    ],
  },
  "50-add-only-the-positives": {
    screens: [
      {
        expected: 47, // gains: 12 + 15 + 20; the drops are -8 and -3
        reference: '=SUMIF(B2:B6,">0")',
        wrong: ['=SUMIF(B2:B6,"<0")', '=SUMIF(B2:B6,">=15")', "=SUM(B2:B6)"],
      },
      {
        expected: 15, // losses: -4, -9, -2 add to -15, and the leading minus reports the size
        reference: '=-SUMIF(B2:B6,"<0")',
        wrong: ['=SUMIF(B2:B6,"<0")', '=SUMIF(B2:B6,">0")', "=SUM(B2:B6)"],
      },
    ],
  },
  "51-debug-a-total-that-skips-a-row": {
    screens: [
      {
        expected: 1450, // 320 + 250 + 300 + 400 + 180; the "n/a" in B4 is skipped, not added
        reference: "=SUM(B2:B7)",
        wrong: ["=SUM(B2:B6)", "=SUM(B2:B5)", "=B2+B3+B4+B5+B6+B7"],
      },
      {
        expected: 890, // 320 + 250 + 180 + 140 for four months; B6's 750 subtotal must stay out
        reference: "=SUM(B2:B5)",
        wrong: ["=SUM(B2:B6)", "=SUM(B2:B4)", "=B2+B3+B4+B5"],
      },
    ],
  },
  "52-sum-across-several-blocks": {
    screens: [
      {
        expected: 1130, // Q1 320 + 250 and Q2 300 + 260, across the empty column
        reference: "=SUM(B2:B3,D2:D3)",
        wrong: ["=SUM(B2:B3)", "=SUM(B2:B3,D3:D3)", "=B2+B3+D2+D3"],
      },
      {
        expected: 1860, // 320 + 180 + 300, 250 + 260, 400 + 150; the "n/a" and the blank are skipped
        reference: "=SUM(B2:D4)",
        wrong: ["=SUM(B2:B4)", "=SUM(B2:D4)*2", "=B2+C2+D2+B3+C3+D3+B4+C4+D4"],
      },
    ],
  },
  "53-running-total-down-a-column": {
    screens: [
      {
        expected: 12, // row 2 of the running total: Monday's units alone
        reference: "=SUM(B$2:B2)",
        wrong: ["=SUM(B2:B5)", "=SUM(B2:B3)", "=B2"],
      },
      {
        expected: 35, // Monday 12 + Tuesday 8 + Wednesday 15
        reference: "=SUM(B$2:B4)",
        wrong: ["=SUM(B2:B5)", "=SUM(B$2:B3)", "=B2+B3+B4"],
      },
    ],
  },
  "54-sum-functions-summary": {
    screens: [
      {
        expected: 1450, // everything in the column: 320 + 250 + 180 + 300 + 400
        reference: "=SUM(B2:B6)",
        wrong: ["=SUM(B2:B5)", "=SUM(B3:B6)", "=B2+B3+B4+B5+B6"],
      },
      {
        expected: 550, // 1450 in total minus 900 North = 250 + 300 outside the region
        reference: '=SUM(C2:C6)-SUMIF(A2:A6,"North",C2:C6)',
        wrong: ["=SUM(C2:C6)", '=SUMIF(A2:A6,"North",C2:C6)', '=SUM(C2:C6)+SUMIF(A2:A6,"North",C2:C6)'],
      },
    ],
  },
  "55-countifs-several-conditions": {
    screens: [
      {
        expected: 3, // North and open: SO-1001, SO-1005, SO-1007; SO-1003 is North but closed
        reference: '=COUNTIFS(B2:B8,"North",C2:C8,"Open")',
        wrong: ['=COUNTIF(B2:B8,"North")', '=COUNTIFS(B2:B8,"North",C2:C8,"Closed")', '=COUNTA(B2:B8)'],
      },
      {
        expected: 2, // open and over five units: SO-1005's 6 and SO-1007's 8; SO-1001 is exactly 5
        reference: '=COUNTIFS(C2:C8,"Open",D2:D8,">5")',
        wrong: ['=COUNTIF(D2:D8,">5")', '=COUNTIFS(C2:C8,"Open",D2:D8,">=5")', '=COUNTIFS(C2:C8,"Closed",D2:D8,">5")'],
      },
    ],
  },
  "56-countif-with-wildcards": {
    screens: [
      {
        expected: 4, // Widget A, B, C and D; the two Gadgets and the Gizmo do not match
        reference: '=COUNTIF(A2:A8,"Widget*")',
        wrong: ['=COUNT(A2:A8)', '=COUNTIF(A2:A8,"Widget")', '=COUNTIF(A2:A8,"Widget A")'],
      },
      {
        expected: 3, // Widget B, Gizmo B and Gadget B; nothing else ends in B
        reference: '=COUNTIF(A2:A8,"*B")',
        wrong: ['=COUNTIF(A2:A8,"B*")', '=COUNTIF(A2:A8,"B")', '=COUNTIF(A2:A8,"*A")'],
      },
    ],
  },
  "57-count-functions-summary": {
    screens: [
      {
        expected: 6, // numeric units in rows 2, 3, 5, 7, 8, 9; row 4 is blank and row 6 holds "n/a"
        reference: "=COUNT(B2:B9)",
        wrong: ["=COUNTA(B2:B9)", "=COUNT(A2:A9)", "=COUNT(B2:B9)+1"],
      },
      {
        expected: 2, // eight items, six numeric quantities, so two rows have no number
        reference: "=COUNTA(A2:A9)-COUNT(B2:B9)",
        wrong: ["=COUNT(B2:B9)", "=COUNTA(A2:A9)", "=COUNTA(A2:A9)-COUNT(A2:A9)"],
      },
    ],
  },
  "58-true-and-false-what-a-comparison-returns": {
    screens: [
      {
        expected: true, // the six unit counts add to 150, which is over 100
        reference: "=SUM(B2:B7)>100",
        wrong: ['=IF(SUM(B2:B7)>100,"TRUE","FALSE")', "=SUM(B2:B7)<100", '="TRUE"'],
      },
      {
        expected: true, // 150 units over six items averages 25, which is at least 20
        reference: "=AVERAGE(B2:B7)>=20",
        wrong: ["=SUM(B2:B7)>=20", "=AVERAGE(B2:B7)>30", '=IF(AVERAGE(B2:B7)>=20,"TRUE","FALSE")'],
      },
    ],
  },
  "59-and-or-not-combining-tests": {
    screens: [
      {
        expected: true, // 150 is over 100 and the smallest item is 18 units, so both tests hold
        reference: "=AND(B8>100,MIN(B2:B7)>=15)",
        wrong: ["=B8>100", "=AND(B8>100,MIN(B2:B7)>20)", "=OR(B8>100,MIN(B2:B7)>=15)"],
      },
      {
        expected: true, // Bolt holds 18 units, under 20, so the first test alone answers TRUE
        reference: "=OR(MIN(B2:B7)<20,B8>200)",
        wrong: ["=AND(MIN(B2:B7)<20,B8>200)", "=OR(MIN(B2:B7)<15,B8>200)", "=OR(MIN(B2:B7)<20)"],
      },
    ],
  },
  "60-ifs-more-than-two-outcomes": {
    screens: [
      {
        expected: "C", // Ben scored 78: under 80, at least 70, so the third band wins
        reference: '=IFS(B3>=90,"A",B3>=80,"B",B3>=70,"C",TRUE,"D")',
        wrong: ['=IFS(B3>=90,"A",B3>=80,"B",TRUE,"D")', '=IFS(B3>=90,"B",B3>=80,"C",B3>=70,"D",TRUE,"A")', '=IF(B3>=90,"A","D")'],
      },
      {
        expected: "Pass", // Cleo scored 85: under 90, at least 80, so the pass band wins
        reference: '=IFS(B4>=90,"Merit",B4>=80,"Pass",TRUE,"Resit")',
        wrong: ['=IFS(B4>=80,"Resit",B4>=90,"Merit",TRUE,"Pass")', '=IFS(B4>=90,"Merit",B4>=86,"Pass",TRUE,"Resit")', '=IF(B4>=90,"Merit","Resit")'],
      },
    ],
  },
  "61-switch-match-a-list-of-values": {
    screens: [
      {
        expected: "Widget", // A2 holds W-01, the first value/result pair in the list
        reference: '=SWITCH(A2,"W-01","Widget","G-02","Gadget","Unknown")',
        wrong: ['=SWITCH(A2,"W-01","Gadget","G-02","Widget","Unknown")', '=IF(A2="W-01","Gadget","Widget")', '=SWITCH(A3,"W-01","Widget","G-02","Gadget","Unknown")'],
      },
      {
        expected: "Gold", // B3 holds 3, the third value/result pair in the list
        reference: '=SWITCH(B3,1,"Bronze",2,"Silver",3,"Gold","None")',
        wrong: ['=SWITCH(B3,1,"Bronze",2,"Silver",3,"Bronze","None")', '=SWITCH(B3,"1","Bronze","2","Silver","3","Gold","None")', '=IF(B3=3,"Bronze","Gold")'],
      },
    ],
  },
  "62-isblanks-and-isnumbers": {
    screens: [
      {
        expected: false, // A3 holds the word text, so the cell is not empty
        reference: "=ISBLANK(A3)",
        wrong: ['=A3=""', "=ISBLANK(A4)", "=ISTEXT(A3)"],
      },
      {
        expected: false, // A7 holds the text n/a, so ISNUMBER says FALSE
        reference: "=ISNUMBER(A7)",
        wrong: ["=ISNUMBER(A7)=FALSE", "=ISNUMBER(A2)", "=ISTEXT(A7)"],
      },
    ],
  },
  "63-logical-functions-summary": {
    screens: [
      {
        expected: "PASS", // 150 is over 100 and the smallest item is 18, so both tests hold
        reference: '=IF(AND(B8>100,MIN(B2:B7)>=15),"PASS","FAIL")',
        wrong: ["=AND(B8>100,MIN(B2:B7)>=15)", '=IF(B8>100,"FAIL","PASS")', '=IF(AND(B8>100,MIN(B2:B7)>=20),"PASS","FAIL")'],
      },
      {
        expected: 4.3, // six prices totalling 25.9 average 4.3166..., which rounds to 4.3
        reference: '=IF(ISNUMBER(AVERAGE(C2:C7)),ROUND(AVERAGE(C2:C7),1),"none")',
        wrong: ["=ROUND(AVERAGE(C2:C7),2)", '=IF(ROUND(AVERAGE(C2:C7),1)>10,ROUND(AVERAGE(C2:C7),1),"none")', '=IF(ISNUMBER(AVERAGE(C2:C7)),AVERAGE(C2:C7),"none")'],
      },
    ],
  },
  "64-ifna-catch-only-a-missing-match": {
    screens: [
      {
        expected: "not on the list", // Q-9 and its price cell are empty on row 8, so the lookup misses and IFNA answers
        reference: '=IFNA(VLOOKUP(A8,A2:B7,2,FALSE),"not on the list")',
        wrong: ['=IFNA(VLOOKUP("Q-9",A2:B7,2,FALSE),"not on the list")', '=IFNA(B8,"not on the list")', '=IFERROR(VLOOKUP(A8,A2:B7,2,FALSE),"not on the list")'],
      },
      {
        expected: 10, // the first A-1 on row 2 is the exact match, and its price is 10
        reference: '=IFNA(VLOOKUP(A2,A2:B7,2,FALSE),"not on the list")',
        wrong: ['=VLOOKUP(A2,A2:B7,2,FALSE)', '=IFNA(VLOOKUP(A2,A2:B7,1,FALSE),"not on the list")', '=IFNA(VLOOKUP(A2,A2:B7,4,FALSE),"not on the list")'],
      },
    ],
  },
  "65-reading-error-values": {
    screens: [
      {
        expected: "missing", // Q-9 appears nowhere in A2:A7, so MATCH raises #N/A and ISNA turns it into the word
        reference: '=IF(ISNA(MATCH(A8,A2:A7,0)),"missing","found")',
        wrong: ['=IF(ISNA(MATCH("Q-9",A2:A7,0)),"missing","found")', '=IF(ISNA(MATCH(A8,A2:A7,0)),"found","missing")', '=IF(ISNA(MATCH(A8,A2:A7,0)),"missing","found")/0'],
      },
      {
        expected: "out of range", // the table is two columns wide, so a third column raises #REF! and ISERROR says so
        reference: '=IF(ISERROR(INDEX(A2:B7,1,3)),"out of range","fine")',
        wrong: ['=IF(ISERROR(INDEX(B1:C1,1,3)),"out of range","fine")', '=IF(ISERROR(INDEX(A2:B7,1,2)),"out of range","fine")', '=ISERROR(INDEX(A2:B7,1,3))'],
      },
    ],
  },
  "66-error-handling-summary": {
    screens: [
      {
        expected: "no match", // row 8 has no code, so VLOOKUP raises #N/A and IFERROR catches it
        reference: '=IFERROR(VLOOKUP(A8,A2:B7,2,FALSE),"no match")',
        wrong: ['=IFERROR(VLOOKUP("Q-9",A2:B7,2,FALSE),"no match")', '=IFNA(A8,"no match")', '=IFERROR(VLOOKUP(A8,A2:B7,2,FALSE),"no match")/0'],
      },
      {
        expected: "no units", // row 4 has a price but no units, so the division raises #DIV/0! and IFERROR catches it
        reference: '=IFERROR(B4/C4,"no units")',
        wrong: ['=IFNA(B4/C4,"no units")', '=IFERROR(B4/C5,"no units")', '=IFERROR(B3/C3,"no units")'],
      },
    ],
  },
  "67-sumproduct-multiply-then-add": {
    screens: [
      {
        expected: 100, // 10x2 + 5x4 + 20x3, so the stock is worth 100
        reference: "=SUMPRODUCT(B2:B4,C2:C4)",
        wrong: ["=SUM(B2:B4)", "=SUMPRODUCT(B2:B4)", "=SUMPRODUCT(B3:B4,C3:C4)"],
      },
      {
        expected: 11.1, // 100 of value over 9 units is 11.111..., which rounds to 11.1
        reference: "=ROUND(SUMPRODUCT(B2:B4,C2:C4)/SUM(C2:C4),1)",
        wrong: ["=AVERAGE(B2:B4)", "=SUMPRODUCT(B2:B4,C2:C4)/SUM(C2:C4)", "=ROUND(SUMPRODUCT(B2:B4,C2:C4)/SUM(B2:B4),1)"],
      },
    ],
  },
  "68-subtotal-a-sum-over-a-group": {
    screens: [
      {
        expected: 35, // function number nine adds 10, 5 and 20
        reference: "=SUBTOTAL(9,B2:B4)",
        wrong: ["=SUM(B2:B4)", "=SUBTOTAL(9,B2:B3)", "=SUBTOTAL(2,B2:B4)"],
      },
      {
        expected: 20, // function number four is MAX, and the largest price is 20
        reference: "=SUBTOTAL(4,B2:B4)",
        wrong: ["=MAX(B2:B4)", "=SUBTOTAL(5,B2:B4)", "=SUBTOTAL(9,B2:B4)"],
      },
    ],
  },
  "69-aggregate-a-total-that-can-skip": {
    screens: [
      {
        expected: 35, // nine is SUM and six ignores error values, so 10 + 5 + 20
        reference: "=AGGREGATE(9,6,B2:B4)",
        wrong: ["=SUM(B2:B4)", "=AGGREGATE(9,6,B2:B3)", "=AGGREGATE(1,6,B2:B4)"],
      },
      {
        expected: 11.7, // one is AVERAGE: 35 / 3 is 11.666..., which rounds to 11.7
        reference: "=ROUND(AGGREGATE(1,6,B2:B4),1)",
        wrong: ["=AVERAGE(B2:B4)", "=AGGREGATE(1,6,B2:B4)", "=ROUND(AGGREGATE(9,6,B2:B4),1)"],
      },
    ],
  },
  "70-aggregate-functions-summary": {
    screens: [
      {
        expected: 100, // the value column holds 20, 20 and 60
        reference: "=SUBTOTAL(9,D2:D4)",
        wrong: ["=SUM(D2:D4)", "=SUBTOTAL(9,D2:D3)", "=SUBTOTAL(4,D2:D4)"],
      },
      {
        expected: 1, // both routes reach 100, so the ratio is exactly one
        reference: "=ROUND(SUMPRODUCT(B2:B4,C2:C4)/SUBTOTAL(9,D2:D4),1)",
        wrong: ["=AVERAGE(B2:B4)", "=ROUND(SUMPRODUCT(B2:B4,C2:C4)/SUM(C2:C4),1)", "=ROUND(SUMPRODUCT(B2:B4,C2:C4)/SUBTOTAL(9,C2:C4),1)"],
      },
    ],
  },
  "71-mid-characters-from-the-middle": {
    screens: [
      {
        expected: "1042", // the hyphen is the third character, so the digits start at four
        reference: "=MID(B2,4,4)",
        wrong: ["=RIGHT(B2,4)", "=MID(B2,4,3)", "=MID($B$2,3,4)"],
      },
      {
        expected: "AN", // the two letters the code opens with
        reference: "=MID(B2,1,2)",
        wrong: ["=LEFT(B2,2)", "=MID(B2,1,3)", "=MID(B2,1,1)"],
      },
    ],
  },
  "72-find-and-search-case": {
    screens: [
      {
        expected: 3, // A, N, then the hyphen in third place
        reference: "=FIND(\"-\",A2)",
        wrong: ["=SEARCH(\"-\",A2)", "=FIND(\"-\",A2)-1", "=LEN(A2)"],
      },
      {
        expected: 3, // b, a, n: the first N sits in third place whatever its case
        reference: "=SEARCH(\"N\",A2)",
        wrong: ["=FIND(\"N\",A2)", "=SEARCH(\"a\",A2)", "=SEARCH(\"N\",$A$2,4)"],
      },
    ],
  },
  "73-wildcards-in-text-criteria": {
    screens: [
      {
        expected: 3, // three of the four regions start with Nor
        reference: "=COUNTIF(B2:B5,\"Nor*\")",
        wrong: ["=COUNTA(B2:B5)", "=COUNTIF(B2:B5,\"N\")", "=COUNTIF(B2:B4,\"Nor*\")"],
      },
      {
        expected: 460, // every code fits ??-*, so all four amounts add up
        reference: "=SUMIF(A2:A5,\"??-*\",C2:C5)",
        wrong: ["=SUM(C2:C5)", "=SUMIF(A2:A5,\"*-1*\",C2:C5)", "=SUMIF(A2:A5,\"??-*\",B2:B5)"],
      },
    ],
  },
  "74-textbefore-and-textafter": {
    screens: [
      {
        expected: "ORD", // everything before the hyphen
        reference: "=TEXTBEFORE(A2,\"-\")",
        wrong: ["=LEFT(A2,3)", "=LOWER(TEXTBEFORE(A2,\"-\"))", "=TEXTBEFORE(A2,\"4\")"],
      },
      {
        expected: "4471", // everything after the hyphen
        reference: "=TEXTAFTER(A2,\"-\")",
        wrong: ["=RIGHT(A2,4)", "=TEXTAFTER(A2,\"ORD\")", "=TEXTAFTER(A2,\"4\")"],
      },
    ],
  },
  "75-text-search-summary": {
    screens: [
      {
        expected: "1042", // FIND locates the hyphen at three, so MID reads from four
        reference: "=MID(A2,FIND(\"-\",A2)+1,4)",
        wrong: ["=MID(A2,4,4)", "=MID(A2,FIND(\"-\",A2)+2,4)", "=MID(A2,FIND(\"-\",A2)+1,3)"],
      },
      {
        expected: 126.7, // 380 across three North rows is 126.666..., which rounds to 126.7
        reference: "=ROUND(AVERAGEIFS(C2:C5,B2:B5,\"N*\"),1)",
        wrong: ["=ROUND(AVERAGE(C2:C5),1)", "=AVERAGEIFS(C2:C5,B2:B5,\"N*\")", "=ROUND(AVERAGEIFS(C2:C5,B2:B5,\"S*\"),1)"],
      },
    ],
  },
  "76-substitute-replace-one-piece-of-text": {
    screens: [
      {
        expected: "WH/12/03", // both hyphens become slashes
        reference: '=SUBSTITUTE(A2,"-","/")',
        wrong: ['=SUBSTITUTE(A2,"-","/",2)', '=SUBSTITUTE(A2,"-","")', '=REPLACE(A2,3,1,"/")'],
      },
      {
        expected: "WH-12/03", // instance two leaves the first hyphen alone
        reference: '=SUBSTITUTE(A2,"-","/",2)',
        wrong: ['=SUBSTITUTE(A2,"-","/")', '=SUBSTITUTE(A2,"-","/",1)', '=SUBSTITUTE(A2,"_","/",2)'],
      },
    ],
  },
  "77-a-commission-sheet-that-updates-itself": {
    screens: [
      {
        expected: 210, // 4200 reaches the 4000 tier, so 4200 * 0.05
        reference: "=ROUND(B2*VLOOKUP(B2,$A$7:$B$9,2,TRUE),2)",
        wrong: ["=B2*0.03", "=B2*0.02", "=B2*VLOOKUP(B2,$A$7:$B$9,2,FALSE)"],
      },
      {
        expected: 0.05, // the 4000 tier is the last floor below 4200
        reference: "=VLOOKUP(B2,$A$7:$B$9,2,TRUE)",
        wrong: ["=VLOOKUP(B2,$A$7:$B$9,2,FALSE)", "=VLOOKUP(B2,$A$7:$B$9,1,TRUE)", "=VLOOKUP(B2,$A$7:$B$9,3,TRUE)"],
      },
    ],
  },
  "78-a-headcount-and-payroll-summary": {
    screens: [
      {
        expected: 345000, // 3*45000 + 2*38000 + 2*41000 + 1*52000
        reference: "=SUMPRODUCT(B2:B5,C2:C5)",
        wrong: ["=SUM(B2:B5)*SUM(C2:C5)", "=SUM(C2:C5)", "=SUM(B2:B5)"],
      },
      {
        expected: 43125, // 345000 across 8 heads
        reference: "=ROUND(SUMPRODUCT(B2:B5,C2:C5)/SUM(B2:B5),0)",
        wrong: ["=ROUND(AVERAGE(C2:C5),0)", "=ROUND(SUMPRODUCT(B2:B5,C2:C5)/COUNT(B2:B5),0)", "=ROUND(SUM(C2:C5)/SUM(B2:B5),0)"],
      },
    ],
  },
  "79-an-inventory-reorder-report": {
    screens: [
      {
        expected: 6, // 10 to order, 4 on hand
        reference: "=MAX(0,C2-B2)",
        wrong: ["=C2-B2", "=MAX(0,B2-C2)", "=MAX(0,C2-B2)+2"],
      },
      {
        expected: 12, // 39 reorder points against 27 in stock
        reference: "=MAX(0,SUM(C2:C5)-SUM(B2:B5))",
        wrong: ["=SUM(C2:C5)-SUM(B2:B5)", "=SUM(B2:B5)-SUM(C2:C5)", "=MAX(0,SUM(C2:C5)-SUM(B2:B4))"],
      },
    ],
  },
  "80-a-monthly-close-checklist-in-formulas": {
    screens: [
      {
        expected: "ready", // the bank variance is zero
        reference: '=IF(B2=0,"ready","check")',
        wrong: ['=IF(B2=0,"check","ready")', '=IF(B2<>0,"ready","check")', '="ready"'],
      },
      {
        expected: 2, // accruals and prepaids are the two rows that are out
        reference: '=COUNTIF(B2:B5,"<>0")',
        wrong: ['=COUNTA(B2:B5)', '=COUNTIF(B2:B5,">0")', '=COUNTIF(B2:B5,"<0")'],
      },
    ],
  },
  "81-a-sales-summary-end-to-end": {
    screens: [
      {
        expected: 2650, // 1200 + 1450 are the two North amounts
        reference: '=SUMIFS(C2:C5,A2:A5,"North")',
        wrong: ['=SUM(C2:C5)', '=SUMIFS(C2:C5,A2:A5,"South")', '=SUMIFS(C2:C5,B2:B5,"North")'],
      },
      {
        expected: "North", // North 2650 beats South 850
        reference: '=IF(SUMIFS(C2:C5,A2:A5,"North")>SUMIFS(C2:C5,A2:A5,"South"),"North","South")',
        wrong: [
          '=IF(SUMIFS(C2:C5,A2:A5,"North")>SUMIFS(C2:C5,A2:A5,"South"),"South","North")',
          '=IF(SUM(C2:C5)>SUMIFS(C2:C5,A2:A5,"South"),"South","North")',
          '=IF(SUMIFS(C2:C5,A2:A5,"East")>SUMIFS(C2:C5,A2:A5,"South"),"North","South")',
        ],
      },
    ],
  },
  "82-a-lookup-dashboard-from-three-tables": {
    screens: [
      {
        expected: 600, // Di is the fourth rep, so the fourth amount
        reference: "=INDEX(C2:C5,MATCH(F2,A2:A5,0))",
        wrong: ["=INDEX(B2:B5,MATCH(F2,A2:A5,0))", "=INDEX(C2:C5,MATCH(F2,B2:B5,0))", "=INDEX(C2:C4,MATCH(F2,A2:A4,0))"],
      },
      {
        expected: 2000, // Di is East, and East targets 2000
        reference: '=INDEX(G2:G4,MATCH(INDEX(B2:B5,MATCH(F7,A2:A5,0)),F2:F4,0))',
        wrong: [
          '=INDEX(F2:F4,MATCH(INDEX(B2:B5,MATCH(F7,A2:A5,0)),F2:F4,0))',
          '=INDEX(G2:G4,MATCH("North",F2:F4,0))',
          "=INDEX(G2:G4,MATCH(F7,F2:F4,0))",
        ],
      },
    ],
  },
  "83-clean-up-an-imported-list": {
    screens: [
      {
        expected: "Ana Lopez", // the padding goes and each word keeps one capital
        reference: "=PROPER(TRIM(A2))",
        wrong: ["=PROPER(A2)", "=TRIM(A2)", "=UPPER(TRIM(A2))"],
      },
      {
        expected: "ana.lopez", // lower case, the space becomes a dot
        reference: '=LOWER(SUBSTITUTE(TRIM(A2)," ","."))',
        wrong: ['=SUBSTITUTE(TRIM(A2)," ",".")', '=LOWER(SUBSTITUTE(TRIM(A2)," ","_"))', '=LOWER(SUBSTITUTE(TRIM(A2),"-","."))'],
      },
    ],
  },
  "84-budget-versus-actual-with-a-variance-flag": {
    screens: [
      {
        expected: 0.05, // 100 over on a 2000 budget
        reference: "=ROUND((C2-B2)/B2,3)",
        wrong: ["=ROUND((C2-B2)/C2,3)", "=ROUND((B2-C2)/B2,3)", "=ROUND(C2-B2,3)"],
      },
      {
        expected: "ok", // five percent is inside the ten percent line
        reference: '=IF(ABS(C2-B2)/B2>0.1,"review","ok")',
        wrong: ['=IF(ABS(C2-B2)/B2>0.1,"ok","review")', '=IF(ABS(C2-B2)>0.1,"review","ok")', '=IF(ABS(C2-B2)/B2>=0.05,"review","ok")'],
      },
    ],
  },
  "85-formula-audit-fix-five-broken-sheets": {
    screens: [
      {
        expected: "n/a", // Bo has no visits, so the guard has to answer
        reference: '=IF(B3=0,"n/a",C3/B3)',
        wrong: ['=IF(B3=0,C3/B3,"n/a")', '=IF(B3<>0,"n/a",C3/B3)', '=IF(B3=0,"NA",C3/B3)'],
      },
      {
        expected: "not found", // Zed is not on the rep list
        reference: '=IF(COUNTIF(A2:A5,E2)=0,"not found",VLOOKUP(E2,A2:C5,3,FALSE))',
        wrong: [
          "=VLOOKUP(E2,A2:C5,3,FALSE)",
          '=IF(COUNTIF(A2:A5,E2)>0,"not found","found")',
          '=IF(COUNTIF(A2:A5,E2)=0,"missing","found")',
        ],
      },
      {
        expected: 0, // nut carries text in the quantity column
        reference: "=IF(ISNUMBER(B3),B3*C3,0)",
        wrong: ['=IF(ISNUMBER(B3),B3*C3,"n/a")', "=B3*C3", "=IF(ISNUMBER(B2),B2*C2,0)"],
      },
      {
        expected: 250, // the two North rows hold 100 and 150
        reference: '=SUMIF(A2:A5,"North",B2:B5)',
        wrong: ['=SUMIF(A2:A5,"South",B2:B5)', "=SUM(B2:B5)", '=SUMIF(B2:B5,"North",A2:A5)'],
      },
      {
        expected: 84.75, // 339 spread over four scores
        reference: "=AVERAGE(B2:B5)",
        wrong: ["=SUM(B2:B5)", "=AVERAGE(B2:B4)", "=MEDIAN(B2:B5)"],
      },
    ],
  },
  "86-unique-one-row-per-distinct-value": {
    expected: 3, // Swift three times, Nordic twice, Crane once — three distinct couriers
    reference: "=COUNTA(UNIQUE(A2:A7))",
    wrong: ["=COUNTA(UNIQUE(A2:A4))", "=COUNTA(A2:A7)", "=COUNTA(UNIQUE(A2:A7,TRUE))"],
  },
  "87-filter-the-rows-that-meet-a-condition": {
    expected: 170, // the open rows hold 40 + 70 + 60; all six orders total 297
    reference: '=SUM(FILTER(C2:C7,B2:B7="Open"))',
    wrong: ['=SUM(FILTER(C2:C7,B2:B7="Shipped"))', "=SUM(C2:C7)", '=COUNT(FILTER(C2:C7,B2:B7="Open"))'],
  },
  "88-sort-and-spilled-ranges": {
    expected: "Mia", // 95 is the highest of 88, 95, 72, 91, 61 and 80
    reference: "=INDEX(SORT(A2:B7,2,-1),1,1)",
    wrong: ["=INDEX(SORT(A2:B7,2,1),1,1)", "=INDEX(SORT(A2:B7,1,-1),1,1)", "=MAX(B2:B7)"],
  },
};
