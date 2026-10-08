# Working rules (read first, follow strictly)

These rules apply to every task in this repo. `target.md` holds the current targets; follow it strictly.

## 1. One item at a time
- Work only on the item that was asked for. Do not fix, tidy, refactor or "improve" anything else while doing it.
- If you notice another problem along the way, write it down and report it at the end. Do not change it unless asked.
- Finish the current item (built, checked, reported) before starting the next one.

## 2. Never break existing features
- Every existing feature must keep working exactly as before unless the task is to change it.
- Before changing shared code (services, API routes, database functions, shared components), find every place that uses it and make sure each one still works.
- After a change, run the type check and the test suite. Do not report "done" with failing checks.
- Database changes are additive and backward compatible (new columns or functions; no dropping or renaming columns that existing code reads).

## 3. Frontend vs backend: change only what the item needs
- Frontend task: change only frontend code. Touch the backend (API, services, database, RLS, auth, business rules) only when the item cannot work without it, and say why.
- Backend task: change only backend code. Touch the frontend only when the item cannot work without it, and say why.
- Keep every backend change as small as possible and covered by tests.

## 4. Live data and releases
- The dev server and scripts use the LIVE database. Checks are read-only by default; never change live data without the user's go-ahead.
- Code that needs a new migration ships only after that migration is applied; say which migration and in what order.
- Other sessions may be working in this repo at the same time. Commit only the files you changed for the current item; never commit someone else's unfinished work.

## 5. Clear button and link names
- Every button, link and call to action says exactly what happens when it is clicked, in plain words, from the user's point of view: "Email client", "Finish quote", "Record payment" - not "Compose", "Submit", "Go" or internal names.
- Say who or what it acts on when that isn't obvious ("Email lead", "Tell them we're fully booked").
- A disabled button explains why and what to do ("Add an email address to this lead to email them").
- Two buttons next to each other must never sound like they do the same thing.

## 6. Report honestly
- Say exactly what changed, what was checked, and what was not checked.
- If something is skipped, broken or uncertain, say so plainly.
