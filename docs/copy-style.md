# Copy style: rules for prose that reads like a person wrote it

These rules come from the review in `docs/copy-review.md` and from what `npm run content:copy` already enforces.
The ones marked **(gate)** are checked automatically. The rest are for whoever writes or edits.

## Words

1. **No marketing vocabulary.** No "seamless", "robust", "leverage", "unlock", "game changer" and the rest of the list in `packages/content-lint/data/copy-rules.json`. **(gate)**
2. **No filler frames.** Delete "it is important to note", "that being said", "in conclusion", "when it comes to". **(gate)**
3. **No chatbot voice.** No "I hope this helps", "feel free to", "great question". **(gate)**
4. **No inflated adjectives.** "Crucial", "pivotal", "vital", "invaluable". If it matters, show what breaks without it. **(gate)**
5. **No travel metaphors.** No "journey", "embark", "navigate the landscape". **(gate)**

## Typography

6. **No em dashes, en dashes, curly quotes, ellipsis characters or emoji.** Use a comma, a full stop, a colon or "to". **(gate)**

## Sentence shapes

7. **No "not just X, it is Y" and no "it is not about X, it is about Y".** Say Y. **(gate)**
8. **No drum rolls.** No "Here's the catch", "The best part?", "Ever wondered...". **(gate)**
9. **No "this is where X comes in".** Use the thing. **(gate)**
10. **No stacked hedges** ("may potentially"). Commit to the claim or cut it. **(gate)**
11. **No labelled summaries** ("Pro tip:", "Key takeaway:"). Say it in the sentence. **(gate)**
12. **Keep sentences under 30 words and paragraphs under 70 words and four sentences.** **(gate)**

## Repetition (the template tells)

13. **Do not close a section with a one-line moral.** A group intro ends when the information ends. No "Type the zero every time", no "the habit sticks". (not automated; read the last line of each intro)
14. **Say "no error" at most once per lesson, and do not use "silently", "quietly", "nothing warns you" or "no warning" as a refrain.** Say what the cell shows instead, such as "the cell reads 0" or "the total is short by one row". **(gate: `silent-failure`)**
15. **Do not describe a wrong answer as "plausible", "believable" or "looks right".** Name the wrong value. **(gate: `plausible-refrain`)**
16. **Vary the error cases.** Do not open them all with "so there is no X to Y". State the cause and the cell. **(gate: `so-there-is-no`)**
17. **Do not write "the sheet has nothing to call" or "nothing by that name".** For a misspelled function, name the spelling and say Excel returns `#NAME?`. **(gate: `nothing-to-call`)**
18. **Say a selling point once per page.** The same sentence on the landing, About and catalogue pages is one sentence too many.

## Facts

19. **Every claim about Excel, Google Sheets or VBA must be something you checked.** If you did not test it, leave it out.
20. **Every date and version in a "checked against" line must be the date and version you really checked.**
21. **Do not claim a person did something unless one did** ("written by hand", "a person reads these").

## Voice

22. **Write like the rest of the page.** One lesson with a punchier or more promotional line than its neighbours stands out. Match the register.
23. **Prefer the concrete number or cell over the abstraction.** "B5 reads 0" beats "the result is incorrect".

## How to check

- `npm run content:copy` lists every gate finding.
- `npm run vale` runs the same rules through Vale.
- A flagged sentence is a reason to read it again, not proof of anything. Fix it if it is a tell; leave it if a person would write it that way.
