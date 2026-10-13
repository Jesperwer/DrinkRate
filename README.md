# DrinkRate 🍹

Familiens nettside for å gi stjerner til de all-inclusive drinkene på ferien.

- **Nettside:** `site/`, ren HTML/CSS/JS uten byggesteg, publisert med GitHub Pages fra
  `gh-pages`-grenen. `.github/workflows/pages.yml` kjører testene og en lesende databasesjekk, og
  kopierer `site/` dit ved push til `main` bare når begge er grønne.
- **Database:** Supabase. Kjør i Supabase → SQL Editor, i denne rekkefølgen: `supabase/setup.sql`,
  `supabase/photos.sql`, `supabase/stickers.sql`, `supabase/security_holiday.sql` (stenger nye brukere).
  Egne drinkvarianter krever i tillegg `supabase/custom_drinks.sql` (bare additiv; uten den skjules knappen).
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
- «Ikke testet» er et eget filter i drinklisten: drinker uten den innloggede personens karakter.
  Det kan kombineres med søk, kategori, bar og all inclusive. Filteret nullstilles ved utlogging.
- Under Familien → Familiespill ligger også Menyduellen og Selg meg drinken (`features.tableGames`).
  Én mobil brukes av hele bordet. Menyduellen trekker 8, 4 eller 2 drinker og lar flertallet velge vinneren.
  Selg meg drinken har valg av deltakere, én salgstale per person, 20 sekunders timer med pause og lokal
  poengtelling. Timeren pauses når appen skjules. Spill kan avsluttes eller startes på nytt uten å endre
  karakterer. Ønsker lagres på den innloggede personens telefon, som den eksisterende ønskelisten.
  Spill og filtrering ligger i `site/games.js`. Ingen ny SQL er nødvendig.
- **Lagkamp** (Familien → Familiespill → Lagkamp, `features.teamGame`): 2–4 lag spiller på én mobil, også verten.
  Appen trekker 5, 10 eller 15 spørsmål i runder på 1–3 per drink: gjett drinken fra bildet, hvem skrev kommentaren,
  hvem ga karakteren, hvem lastet opp bildet og hvilken drink har høyest familiesnitt (menyhint som reserve bare hvis
  man slår det på). Spørsmål, svaralternativer, fasit og bilder fryses når kampen starter. Hvert lag får telefonen
  etter tur («Gi telefonen til …» → «Vi er klare»), låser svaret eller passer, og fasiten vises først når alle har svart.
  Riktig svar gir ett poeng; «Rett poeng» erstatter poengene for et spørsmål (med grunn, kan angres). Rundevinner og
  sluttvinner beregnes av poengloggen, med delt seier ved likt. Kampen lagres etter hvert trekk i IndexedDB på
  telefonen, for den innloggede personen (ett pågående spill og siste resultat), og kan fortsettes etter omlasting.
  Den lagres ikke på serveren og synkroniseres ikke mellom telefoner; tømmes nettleserdataene, er den borte. Feiler
  lagringen, sier appen det. Motoren er `site/lagkamp.js` (ren, enhetstestet), lagringen `site/lagkamp-store.js`.
  Spillet leser bare (`dr_get_ratings`, `dr_recent_photos`, inntil 30 nyeste bilder) og skriver aldri karakterer eller bilder.
  Ingen ny SQL er nødvendig. Fasiten ligger i telefonens minne; spillet hindrer at den vises ved vanlig bruk, ikke mot
  noen som åpner utviklerverktøy.
- **Egen variant** (`features.customDrinks`): i en drink trykker man «✏️ Lag egen variant», endrer navn og ingredienser
  og lagrer. Varianten blir en ny drink med egen id (`c-…`) som hele familien ser og kan gi karakter, bilde og kommentar
  som vanlig. Kategori, barer og pris arves fra drinken den bygger på. Den som laget varianten kan slette den så lenge
  ingen andre har gitt den karakter. Maks 50 per person, unike navn. Lagret i `dr_custom_drinks` (`supabase/custom_drinks.sql`).
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
mobiltestene `tests/e2e.js`, `tests/lagkamp.e2e.js` og `tests/custom-drinks.e2e.js` (Chromium med iPhone-oppsett – ikke en ekte Safari-test). Skjermbilder havner i `tests/.out/`.
