# OpenTable backfill list — 60 venues with NULL reservation_platform — 2026-05-30

Sheet backfill list for Option Y of the OpenTable URL pre-fill change. These 60 venues have an OpenTable `reservation_url` but `reservation_platform IS NULL` in the DB. The code fix (Option X) now rescues them at runtime via URL detection, but the canonical fix is to set `reservation_platform = "opentable"` in the Google Sheet, then run `npm run import-venues -- apply`.

Also worth checking: 9 venues currently mislabeled with `reservation_platform = "resy"` despite having OpenTable URLs (not included in this list — query separately).

## Backfill action

In the venue sheet, set the `reservation_platform` column to `opentable` for each of these 60 rows:

| Name | reservation_url |
|---|---|
| Attaboy | https://www.opentable.com/r/attaboy-new-york |
| Bar Kabawa | https://www.opentable.com/r/bar-kabawa-new-york |
| Bartolo | https://www.opentable.com/r/bartolo-new-york |
| Bin 71 | https://www.opentable.com/r/bin-71-new-york |
| Blue Ribbon Brasserie | https://www.opentable.com/blue-ribbon-brasserie |
| Cafe Cluny | https://www.opentable.com/cafe-cluny |
| Claro | https://www.opentable.com/r/claro-brooklyn |
| Codino | https://www.opentable.com/r/codino-new-york-2 |
| Complete Cafe | https://www.opentable.com/r/complete-cafe-new-york |
| District Saigon | https://www.opentable.com/r/district-saigon-astoria |
| Don Angie | https://www.opentable.com/r/don-angie-new-york |
| Dudleys | https://www.opentable.com/r/dudleys-new-york |
| Early Terrible New York City | https://www.opentable.com/r/early-terrible-new-york-city-new-york |
| ELIS WINE BAR & RESTAURANT | https://www.opentable.com/r/elis-wine-bar-and-restaurant-new-york |
| Festivál Cafe | https://www.opentable.com/r/festival-cafe-reservations-new-york |
| Funny Bar | https://www.opentable.com/r/funny-bar-new-york |
| Gao's BBQ & Crab | https://www.opentable.com/r/gaos-bbq-and-crab-new-york-queens |
| Haven Rooftop | https://www.opentable.com/r/haven-rooftop-new-york |
| Jadis | https://www.opentable.com/r/jadis-new-york |
| Joloff | https://www.opentable.com/r/joloff-restaurant-brooklyn |
| Juliana's | https://www.opentable.com/r/julianas-brooklyn |
| Kabawa | https://www.opentable.com/r/kabawa-new-york |
| L&B Spumoni Gardens | https://www.opentable.com/r/l-and-b-spumoni-gardens-brooklyn |
| Le Veau d'Or | https://www.opentable.com/r/le-veau-dor-new-york |
| Little Ned | https://www.opentable.com/r/little-ned-nomad-new-york |
| Mermaid Oyster Bar | https://www.opentable.com/the-mermaid-oyster-bar |
| miss KOREA BBQ | https://www.opentable.com/miss-korea-bbq-reservations-new-york |
| Obvio Cocktail Bar Nomad | https://www.opentable.com/r/obvio-new-york |
| OLIO E PIÙ | https://www.opentable.com/olio-e-piu |
| One If By Land, Two If By Sea | https://www.opentable.com/one-if-by-land-two-if-by-sea |
| Palma | https://www.opentable.com/palma |
| Parcelle Chinatown | https://www.opentable.com/r/parcelle-wine-reservations-new-york |
| Petite Boucherie | https://www.opentable.com/r/petite-boucherie-new-york |
| PICO DE GALLO | https://www.opentable.com/r/pico-de-gallo-bar-and-kitchen-new-york |
| R40 | https://www.opentable.com/r/r40-long-island-city |
| Risotteria Melotti NYC | https://www.opentable.com/r/risotteria-melotti-new-york |
| Ruta Oaxaca Mexican Cuisine | https://www.opentable.com/r/ruta-oaxaca-astoria-queens |
| Sabor Argentino | https://www.opentable.com/r/sabor-argentino-new-york |
| San Marzano | https://www.opentable.com/r/san-marzano-pasta-fresca-new-york |
| San Sabino | https://www.opentable.com/r/san-sabino-new-york |
| SAPPEISAN | https://www.opentable.com/r/sappeisan-new-york |
| Scarr's Pizza | https://www.opentable.com/r/scarrs-pizza-new-york |
| Seed Library NYC | https://www.opentable.com/r/seed-library-new-york |
| Skin Contact | https://www.opentable.com/r/skin-contact-reservations-new-york |
| Sobre Masa | https://www.opentable.com/r/sobre-masa-tortilleria-reservations-brooklyn |
| Sogno Toscano Market & Wine Bar | https://www.opentable.com/r/sogno-toscano-new-york |
| Sojourn Social | https://www.opentable.com/r/sojourn-social-new-york |
| Soothr | https://www.opentable.com/r/soothr-new-york |
| Spes | https://www.opentable.com/r/spes-vino-naturale-e-cucina-new-york |
| Sushi Lab Rooftop | https://www.opentable.com/r/sushi-lab-rooftop-reservations-new-york |
| Tartina | https://www.opentable.com/r/tartina-new-york-2 |
| The Butcher's Daughter | https://www.opentable.com/r/the-butchers-daughter-nolita-new-york |
| The Odeon | https://www.opentable.com/restref/client/ |
| The River Cafe | https://www.opentable.com/r/the-river-cafe-brooklyn |
| Tokyo Record Bar | https://www.opentable.com/r/tokyo-record-bar-new-york |
| Turks & Frogs | https://www.opentable.com/r/turks-and-frogs-new-york |
| Valerie | https://www.opentable.com/r/valerie-new-york |
| VITE vinosteria | https://www.opentable.com/r/vite-vinosteria-astoria |
| Wild Cherry | https://www.opentable.com/r/wild-cherry-new-york |
| ZOI | https://www.opentable.com/r/zoi-mediterranean-nomad-new-york |

Count: 60.

## Worth a manual check

- **The Odeon** — `https://www.opentable.com/restref/client/` is a degenerate URL (missing the venue slug). `detectBookingPlatform` still flags it as OpenTable (the host matches), and `buildOpenTableBookingUrl` will append the date+covers params, but the resulting page likely won't resolve to a usable booking widget. Worth fixing in the sheet to a real `opentable.com/r/<slug>` URL.

## Also do separately

Run a query for the 9 venues mislabeled as `reservation_platform = "resy"` despite having OpenTable URLs:

```sql
select name, reservation_url
from composer_venues_v2
where reservation_url ilike '%opentable%'
  and reservation_platform = 'resy';
```

Update those rows to `reservation_platform = "opentable"` in the sheet too.

## Importer command

```bash
npm run import-venues -- apply
```

(Or use the admin UI's Apply flow if you'd rather click through.)
