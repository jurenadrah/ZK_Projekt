# Poročilo o avtomatiziranem funkcionalnem testiranju DotaOps

| Podatek | Vrednost |
| --- | --- |
| Datum izvedbe | 18. 11. 2026 |
| Orodje | Playwright Test 1.65.1, Chromium (Chrome for Testing 159.0.8154.6), brez grafičnega vmesnika |
| Okolje | Windows 11, Node.js 22.14.0; frontend Next.js 16 v razvojnem načinu na `127.0.0.1:3100` |
| Testni primeri | FT-01, FT-02, FT-03 iz [specifikacije testnih scenarijev](funkcionalni-pregled-in-testni-scenariji.md) |
| Rezultat | 3/3 scenariji PASS (skupaj s 3 testi iz Naloge 5 sotekmovalca: 6/6 PASS, ~7,5 s) |

## 1. Izbira orodja

Projekt ima spletni vmesnik v Next.js/React/TypeScript, zato potrebujemo orodje, ki
upravlja pravi brskalnik in teste piše v istem jeziku. Primerjali smo:

| Orodje | Prednosti | Slabosti za naš projekt |
| --- | --- | --- |
| **Playwright Test** | TypeScript; Chromium/Firefox/WebKit; samodejno čakanje; več ločenih sej (`BrowserContext`) v enem testu; prestrezanje omrežja (`route`); sam zažene aplikacijo (`webServer`); poročila list/HTML/JUnit; sledi (trace) ob padcu. | Prenos brskalnika (~150 MB) v cevovodu. |
| Cypress | Dober interaktivni razvoj testov. | En zavihek/ena seja na test – FT-02 zahteva sočasno sejo kapetana in organizatorja; JUnit poročilo zahteva dodaten reporter. |
| Selenium WebDriver | Standard W3C, veliko jezikov. | Ločen gonilnik, ročno čakanje, več lastne infrastrukture (zagon aplikacije, poročila). |

**Izbrali smo Playwright Test**, ker:

- teste pišemo v TypeScriptu, enako kot frontend (skupni tipi, ESLint, `tsc`);
- FT-02 potrebuje **dve neodvisni seji** (kapetan in organizator) v enem testu – Playwright
  to podpira z ločenimi `BrowserContext`;
- `page.route`/`context.route` omogoča nadzorovane odgovore API-ja, zato so testi
  ponovljivi brez produkcijske baze;
- vse, kar cevovod potrebuje (brskalnik, zagon aplikacije, poročila), je vgrajeno.

## 2. Vključitev v cevovod

| Vprašanje | Odgovor |
| --- | --- |
| Izvajanje brez GUI | Da. `headless: true` v [playwright.config.ts](../frontend/playwright.config.ts); na Linuxu ne potrebuje X strežnika. |
| Brskalnik in gonilniki | `npx playwright install --with-deps chromium` namesti Chromium in sistemske knjižnice. Ločen gonilnik (kot `chromedriver`) ni potreben. |
| Zagnana aplikacija | Playwright prek `webServer` sam zažene tri procese in počaka, da so dosegljivi: testni API (`tests/mock-api-server.mjs`, vrata 18080), nadomestni Supabase Auth (`tests/mock-supabase-server.mjs`, 54321) in `next dev` (3100). |
| Testna baza | Ni potrebna. Javni podatki (Demo Cup, turnir QA-FT02 Open) so v `tests/fixtures/*.json`; zaščiteni API za FT-02 test simulira z deljenim stanjem. Prijava v Supabase je nadomeščena s sejnim piškotkom s testnim JWT. |
| Oblika rezultatov | Izhodna koda procesa (≠ 0 ob padcu), izpis `list` v dnevniku, HTML poročilo (`playwright-report/`), JUnit XML (`test-results/junit.xml`), ob padcu še sled (`trace.zip`) in posnetek stanja strani. |

Potek v [GitHub Actions](../.github/workflows/frontend-ci.yml) (ob `push`/`pull_request` na
`main` in `development`, Ubuntu, Node.js 20):

```
npm ci → npx playwright install --with-deps chromium → npm run lint → npm run typecheck
      → npm run build → npm run test:e2e → upload-artifact "playwright-results" (tudi ob padcu)
```

Lokalna ponovitev:

```sh
cd frontend
npm ci
npx playwright install chromium
npm run test:e2e            # vsi testi
npx playwright show-report  # HTML poročilo
```

## 3. Namestitev

Playwright je nameščen kot razvojna odvisnost frontenda (`@playwright/test` v
`frontend/package.json`), brskalnik z `npx playwright install chromium`. Skripta
`npm run test:e2e` zažene `playwright test`. Izhodne mape `playwright-report/` in
`test-results/` so v `frontend/.gitignore`.

## 4. Avtomatizirani testni primeri

| Scenarij | Datoteka | Kaj test preveri |
| --- | --- | --- |
| FT-01 – Javni katalog in podrobnosti | [catalog.spec.ts](../frontend/tests/catalog.spec.ts) | Anonimni obiskovalec na `/turnirji` najde `DotaOps Demo Cup` s statusom *Live*, ga odpre (URL `/turnirji/dotaops-demo-cup`), preveri opis, skupino *Demo Group A* in lestvico (Radiant Wolves #1, 6 točk), rezultat tekme 2:1 in finalista v bracketu. Po osvežitvi naslov ostane, v brskalniku ni nobene neobdelane napake. |
| FT-02 – Prijava ekipe, odobritev in check-in | [registration.spec.ts](../frontend/tests/registration.spec.ts) | Dve ločeni seji. (1) Kapetan na `QA-FT02 Open` vidi *Team Submission*, potrjeno kapetansko pravico in roster 5/5. (2) Odda prijavo → *Pending*; **negativni kontrolni primer:** gumb *Check In* je onemogočen. (3) Organizator v svoji seji vidi isto prijavo (*Pending*, kapetan qa-captain). (4) Odobri → *Approved*, ohrani se po osvežitvi. (5) Kapetan vidi *Approved* in omogočen check-in. (6) Check-in → *Checked In*, ohrani se po ponovnem odprtju. Na koncu test preveri, da so bili poslani natanko trije pisalni zahtevki (prijava, odobritev, check-in). |
| FT-03 – Javni pregled bracketa | [bracket.spec.ts](../frontend/tests/bracket.spec.ts) | Brez prijave: *Single Elimination*, velikost 4, 2 kroga, 2 zaključeni tekmi; R1-M1 Radiant Wolves – Roshan Hunters 2:0 (*Radiant Wolves advanced*), R1-M2 Ancient Titans – Dire Ravens 2:1, finale R2-M1 *Scheduled* 0:0, *Awaiting result*. Po osvežitvi enako; brskalnik ne pošlje nobenega pisalnega zahtevka na turnirje/tekme. |

Testni podatki so v `frontend/tests/fixtures/` (`catalog.json`, `groups.json`,
`standings.json`, `matches.json`, `bracket.json`, `registration-tournament.json`).

Datoteka [functional.spec.ts](../frontend/tests/functional.spec.ts) vsebuje ločene
scenarije iz [functional-test-scenarios-report.md](functional-test-scenarios-report.md)
(ustvarjanje ekipe, objava turnirja, uvoz tekme) in se izvaja skupaj z zgornjimi.

## 5. Rezultati izvedbe

| Scenarij | Status | Trajanje |
| --- | --- | ---: |
| FT-01 – Javni katalog in podrobnosti | PASS | 2,6 s |
| FT-02 – Prijava, odobritev, check-in | PASS | 4,3 s |
| FT-03 – Javni pregled bracketa | PASS | 2,8 s |
| (Naloga 5) ustvarjanje ekipe, objava turnirja, uvoz tekme | 3 × PASS | 3,9 s |
| **Skupaj** | **6/6 PASS** | **7,6 s** (4 vzporedni procesi) |

`npm run lint` (0 napak) in `npm run typecheck` sta prav tako uspešna.

### Napaka, ki jo je odkrila avtomatizacija

Prva izvedba FT-01 je padla: brskalnik je pri anonimnem ogledu turnirja vrgel
neobdelano napako `Auth session missing!` (ročno zabeležena kot **FT-01-UI-01**).
Vzrok: `getCurrentUserProfile()` v [auth.ts](../frontend/src/lib/auth.ts) je klical
`supabase.auth.getUser()` tudi brez seje. Popravek najprej prebere sejo in za
anonimnega uporabnika vrne `null`. Brez popravka FT-01 ponovljivo pade (preverjeno
18. 11. 2026: 4× `Auth session missing!`), s popravkom uspe.

Pri pripravi FT-02 smo ugotovili tudi verjeten vzrok ročne napake **FT-02-UI-01**
(»Real tournament backend id is required«): panel prijave preverja ID turnirja z
regularnim izrazom, ki dovoli samo UUID različic 1–5, demo seed pa uporablja ID
`41391083-d71f-df20-c4f8-…` (različica `d`). FT-02 zato uporablja ločen testni turnir
z veljavnim UUID v4; napaka ostaja odprta za popravek v [tournament-registration-panel.tsx](../frontend/src/components/tournament-registration-panel.tsx).

## 6. Preizkus namerne napake

Za uspešna scenarija smo v kodo začasno vnesli napako, zagnali test in kodo povrnili.

| Scenarij | Vnesena napaka | Rezultat testa |
| --- | --- | --- |
| FT-02 | V `canCheckIn()` je pogoj `registration.status === "approved"` zamenjan z `registration.status !== "rejected"` – check-in je omogočen že za prijavo v stanju *pending*. | **FAIL** v koraku 2: `expect(getByRole('button', { name: 'Check In' })).toBeDisabled()` – *Expected: disabled, Received: enabled*. Negativni kontrolni primer napako zazna, preden bi kapetan lahko opravil check-in neodobrene prijave. |
| FT-03 | V `tournament-bracket-panel.tsx` je izpis rezultata `{scoreA}:{scoreB}` zamenjan v `{scoreB}:{scoreA}` – polfinale prikaže `0:2` namesto `2:0`. | **FAIL**: element z besedilom `2:0` ni najden (po 5 s čakanja). |

Po povrnitvi kode (`git checkout`) je celoten nabor ponovno 6/6 PASS.

## 7. Omejitve

- Testi preverjajo uporabniški vmesnik z nadzorovanimi odgovori API-ja in Supabase.
  Ne preverjajo pravega Spring Boot backenda, prijave v Supabase in zapisa v
  PostgreSQL – to pokrivajo JUnit testi backenda (112/112) in bi zahtevalo ločeno
  integracijsko izvedbo s testno bazo.
- Poslovno pravilo »check-in samo za odobreno prijavo« je v testnem API-ju
  posnemano; test FT-02 zato preverja predvsem, da ga upošteva vmesnik.
- Testi tečejo samo v Chromiumu; Firefox/WebKit bi dodali z dodatnim `projects` v konfiguraciji.
