# DrinkRate

Familiens drinkguide fra ferien. Live: https://jesperwer.github.io/DrinkRate/

## Second Brain
Prosjektet ligger i Second Brain med slug `drinkrate`.
- **Ved start:** kjør `open_project("drinkrate")` for regler, status og neste steg.
- **Etter arbeid som er pushet:** kjør `save_session` (sammendrag, beslutninger, verifikasjon, neste steg) så status holdes synkronisert.

## Regler
- Push til `main` publiserer automatisk (GitHub Action → `gh-pages`).
- Endre aldri `id` på en drink i `site/drinks.js`; karakterene i databasen er knyttet til den.
- Databaseendringer er additive SQL-filer i `supabase/` som Jesper limer inn i Supabase SQL Editor.
- Øk `?v=N` i `site/index.html` når filer i `site/` endres.
- Kjør `npm test` før push (lokal Postgres, se README). Workflowen publiserer bare når testene er grønne.
- Kjøres `supabase/setup.sql` på nytt, må `photos.sql`, `stickers.sql` og `security_holiday.sql` kjøres etterpå.
- Svar Jesper på norsk, kort og mobilvennlig.
