# DrinkRate 🍹

Familiens nettside for å gi stjerner til de all-inclusive drinkene på ferien.

- **Nettside:** `site/`, ren HTML/CSS/JS uten byggesteg, publisert med GitHub Pages fra
  `gh-pages`-grenen. `.github/workflows/pages.yml` kopierer `site/` dit ved hver push til `main`
  og sjekker at databasen svarer.
- **Database:** Supabase. Kjør `supabase/setup.sql` én gang i Supabase → SQL Editor.
  Legg prosjektets URL og publishable/anon-nøkkel i `site/config.js`.
- **Drinkene:** `site/drinks.js`. Endre aldri `id` på en drink som allerede har vurderinger.

## Slik fungerer den

- Familien står i `site/config.js` (`family`). Første gang man trykker på navnet sitt,
  velger man selv en 4-sifret PIN-kode. Etter 8 feil forsøk sperres brukeren i 5 minutter.
- Karakter 1–10 per drink. Drinkene er felles for alle barene. Hvor man smakte den er valgfritt.
- Skriver man «67» i søk eller kommentar (eller trykker 6 og så 7), kommer 6-7-animasjonen.

Nullstille en glemt PIN (Supabase → SQL Editor, bytt ut navn og PIN):

```sql
update dr_users set pin_hash = extensions.crypt('1234', extensions.gen_salt('bf')),
  failed = 0, locked_until = null where name_key = lower('Navn');
```

## Test lokalt

Krever Postgres med `supabase/setup.sql` kjørt (og rollene `anon`/`authenticated`) samt Playwright:

```sh
node tests/mock-server.js &      # serverer site/ og etterligner Supabase-RPC på :8787
node tests/e2e.js /tmp           # mobil-ende-til-ende-test med skjermbilder
```
