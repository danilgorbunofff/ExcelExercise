/**
 * The hand-computed expectations for the shipped lessons, kept in one place so both
 * the content suite and the fixture suite can hold the JSON to the same literal.
 * The arithmetic for every row is recorded in docs/phases/02-exercise-content.md;
 * these literals are typed from that audit trail, never copied from the evaluator.
 */
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
    expected: 4, // T-1001, T-1003, T-1005, T-1007
    reference: '=COUNTIF(B2:B9,"Open")',
    wrong: ['=COUNTIF(B2:B9,"Open")+1', '=COUNTIF(B2:B9,"Closed")', '="4"'],
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
    expected: 44.8, // (2500 - 1380) / 2500 * 100
    reference:
      '=IFERROR(ROUND((SUMIF(A2:A5,"North",B2:B5)-SUMIF(A2:A5,"North",C2:C5))/SUMIF(A2:A5,"North",B2:B5)*100,1),"")',
    wrong: [
      '=IFERROR(ROUND((SUMIF(A2:A5,"South",B2:B5)-SUMIF(A2:A5,"South",C2:C5))/SUMIF(A2:A5,"South",B2:B5)*100,1),"")',
      '=IFERROR(ROUND((SUMIF(A2:A5,"North",B2:B5)-SUMIF(A2:A5,"North",C2:C5))/SUMIF(A2:A5,"North",B2:B5)*100,2),"")',
      '=IFERROR(SUMIF(A2:A5,"North",B2:B5)*100,"")',
    ],
  },
  "11-vlookup-approximate-match-needs-a-sorted-column": {
    expected: 0.05, // 4200 sits in the band that starts at 1000, so the rate is the second column
    reference: "=VLOOKUP(A6,A2:B5,2,TRUE)",
    wrong: ["=VLOOKUP(A6,A2:B5,2,FALSE)", "=VLOOKUP(A6,A2:B5,1,TRUE)", "=VLOOKUP(4200,A2:B5,2,TRUE)"],
  },
};
