# DrinkRate 🍹

Familiens nettside for å gi stjerner til de all-inclusive drinkene på ferien.

- **Nettside:** `site/`, ren HTML/CSS/JS uten byggesteg, publisert med GitHub Pages fra
  `gh-pages`-grenen. `.github/workflows/pages.yml` kjører testene og en lesende databasesjekk, og
  kopierer `site/` dit ved push til `main` bare når begge er grønne.
- **Database:** Supabase. Kjør i Supabase → SQL Editor, i denne rekkefølgen: `supabase/setup.sql`,
  `supabase/photos.sql`, `supabase/stickers.sql`, `supabase/security_holiday.sql` (stenger nye brukere).
  Kjøres `setup.sql` på nytt, åpnes registreringen igjen og den overskriver bildeversjonen av
  `dr_get_ratings` – kjør da de tre andre filene etterpå.
  Legg prosjektets URL og publishable/anon-nøkkel i `site/config.js`.
- **Drinkene:** `site/drinks.js`. Endre aldri `id` på en drink som allerede har vurderinger.

## Slik fungerer den

- Familien står i `site/config.js` (`family`). Etter `security_holiday.sql` kan ingen registrere seg selv;
  nye brukere legges inn av Jesper (se toppen av filen). Etter 8 feil PIN-forsøk sperres brukeren i 5 minutter.
- Ferieutgaven (slås av/på med `features` i `site/config.js`, krever ny push): Annes bursdagsbanner og
  klistremerke (bare 13.10.2026 etter kypriotisk dato), «Mest omdiskutert» og Familiespill under Familien,
  smakstvillinger og feriepostkort under Meg, «Vurder først» i vurderingsdialogen, hint på låste klistremerker.
  Beregningene ligger i `site/insights.js` og `site/quiz.js` (rene funksjoner, enhetstestet).
- Lagring: dobbelttrykk sender bare én lagring, en feilet lagring beholder kommentaren (også etter omlasting),
  og feiler bare bildet vises «Karakter lagret – bilde gjenstår» med «Prøv bildet igjen».
- Karakter 1–10 per drink. Drinkene er felles for alle barene. Hvor man smakte den er valgfritt.
- Alle drinker fra menyene er med. `ai` sier hvor drinken er all inclusive, `price` hva den koster ellers.
- Bilder: hver vurdering kan ha ett bilde, krympet på telefonen (maks 1280 px) før opplasting, lagret i `dr_photos`.
- Påskeegg: «67» (eller 6 så 7 på karakterknappene), karakter 10 og 1, søk «skål» / «disco» / «Miranda»,
  og trykk 5 ganger raskt på «DrinkRate»-tittelen.

Nullstille en glemt PIN (Supabase → SQL Editor, bytt ut navn og PIN):

```sql
update dr_users set pin_hash = extensions.crypt('1234', extensions.gen_salt('bf')),
  failed = 0, locked_until = null where name_key = lower('Navn');
```

## Test lokalt

Krever Node, Postgres (lokalt – skriptet nekter alt annet) og `psql`:

```sh
npm ci && npx playwright install chromium
PGHOST=localhost PGUSER=postgres npm test
```

`tests/run.sh` lager en ny database `drinkrate_test`, kjører SQL-filene, syntetiske testdata
(`tests/seed.sql`) og databasesjekker (`tests/sql-checks.sql`), enhetstestene i `tests/unit/` og
mobiltesten `tests/e2e.js` (Chromium med iPhone-oppsett – ikke en ekte Safari-test). Skjermbilder havner i `tests/.out/`.
