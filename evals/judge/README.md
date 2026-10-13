# Question-quality judging (eval 3)

`npm run evals:decisions` writes `questions.json`: every distinct wording the system can show a
merchant, from the app's three scenarios and the spike screen's templates.

Rubric (each true/false; a question passes only if all four hold):

- **pattern_level**: asks about a group of orders, never one customer or one payment.
- **short**: readable on a phone in a few seconds (about 30 words, one clear ask).
- **non_accusatory**: neutral, helpful tone; nothing implying wrongdoing.
- **no_personal_data**: no customer's name, phone, email, address, card or device identifier.

Three graders:

1. **Code checks** in `scripts/run-decision-evals.ts`: word count, exactly one question mark,
   a list of accusatory words, and regexes for phone, email, card, GSTIN, PIN code, address and
   name markers.
2. **LLM judge**: `questions-judgment.json`, written by a separate Claude agent that saw only
   `questions.json` and this rubric. It is not an API call, and Claude also wrote the questions,
   so treat it as a second opinion, not an independent audit.
3. **You**: open `questions-human-review.csv`, put `y` or `n` in the pass column for each of the
   20 rows (with a note if it fails), and re-run `npm run evals:decisions`. The scorecard then shows
   your marks next to the judge's.
