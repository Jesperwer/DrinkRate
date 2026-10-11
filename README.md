# DrinkRate 🍹

Familiens nettside for å gi stjerner til de all-inclusive drinkene på ferien.

- **Nettside:** `site/`, ren HTML/CSS/JS uten byggesteg, publisert med GitHub Pages
  (`.github/workflows/pages.yml`) ved hver push til `main`.
- **Database:** Supabase. Kjør `supabase/setup.sql` én gang i Supabase → SQL Editor.
  Legg prosjektets URL og publishable/anon-nøkkel i `site/config.js`.
- **Drinkene:** `site/drinks.js`. Endre aldri `id` på en drink som allerede har vurderinger.

## Brukere

Alle lager sin egen bruker med navn og 4-sifret PIN-kode. Etter 8 feil forsøk
sperres brukeren i 5 minutter.

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
