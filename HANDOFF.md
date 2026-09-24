# TetraScope — handoff

Written 2026-09-24. Everything needed to pick this up cold.

**The site is live: <https://tetrascope.github.io/app/>** — GitHub Pages,
deployed from `main` on every push; CI runs the full test suite on every push.

**Google sign-in works** as of 2026-09-24 (reported by the owner after the
API-key referrer fix in section 8.1).

---

## 1. What this is

An interactive, validated implementation of **O'Hara's (1968) CMAS projection
scheme** for the basalt tetrahedron, together with the **Yoder & Tilley (1962)
normative tetrahedron** Di–Ol–Ne–Qz. A user enters an analysis (mineral, melt,
rock or experimental product); the program reduces it to O'Hara's C, M, A, S
components and to a CIPW norm, locates it relative to the dividing planes,
and projects it from any phase onto any plane or join, returning the
coordinates, the diagram and every assumption applied.

It replaces manual graphical construction. Its results have been checked
against the stoichiometry of the phases, against Yoder & Tilley's published
norms, and against points digitised from O'Hara's own figures (section 6).

- **Repo:** `tetrascope/tetrascope.github.io` (public, MIT)
- **Live:** <https://tetrascope.github.io/app/> (the site root forwards there)
- **Working directory:** `E:/PHD/Meteorites/CMAS programme/ohara-projection`
- **Remote:** configured as `https://tetrascope@github.com/tetrascope/tetrascope.github.io.git`
  (the `tetrascope@` pins the GitHub account — see section 3.2)
- **Sister project:** RockMin ID (`E:/PHD/Meteorites/RockMin ID`), whose
  Firestore schema TetraScope reuses (section 5.4).

---

## 2. Current state

| | |
| --- | --- |
| Version | **0.3.0** (`pyproject.toml`, `package.json`, `CITATION.cff`, `TOOL_VERSION` in `app/ui.js`; the build refuses a mismatch) — tagged `v0.3.0` |
| DOI | Zenodo [10.5281/zenodo.22930792](https://doi.org/10.5281/zenodo.22930792) (v0.3.0); all versions [10.5281/zenodo.22930791](https://doi.org/10.5281/zenodo.22930791) |
| Tests | **10 suites, all passing** (`python run_tests.py`), incl. 13 Chromium workflows |
| CI | GitHub Actions: Python 3.9–3.13 × Node 18/20/22, Linux + Windows, e2e, wheel install — green on `408ed38` |
| Deployment | GitHub Pages, "deploy from branch" `main` / root — green on `408ed38` |
| Engines | Python package `ohara/` and browser engine `app/ohara.js`, identical on 848 cases × 15 projections |
| Validation | 44 points from O'Hara's Figs 4A, 4C, 5, 9, 10, 11 within 0.53 wt% (11 natural basalts within 0.25) |
| Offline | PWA with a content-hashed service-worker cache; tested offline in Chromium |
| Sign-in | Google via Firebase project `tetrascope-6868e`; working (owner, 2026-09-24) |
| Firestore | Database created, `firestore.rules` published; anonymous access correctly denied (checked) |
| Search Console | Verification file `google1cbffc9e9dc2cd06.html` at the site root (uploaded by the owner) |
| Third-party code | qrcodejs 1.0.0, Firebase JS SDK 12.19.0 (app + auth compat) — bundled, SHA-512-pinned |

### Commits so far

```
408ed38  Enable Google sign-in: Firebase project tetrascope-6868e
5457f3b  Add CSV template and optional Google sign-in with collection sync
71efa40  Add files via upload                 (owner: Search Console file)
36ae993  Add TetraScope: O'Hara (1968) projection workbench
a2e4ae0  Initial commit                       (owner: LICENSE, README)
```

### Toolchain on this machine

- Python 3.9.6 with numpy 1.24; no pytest needed (`run_tests.py` runs without it).
- Node 24.21.0 (portable, see RockMin ID's handoff for its location).
- Google Chrome — the e2e suite drives it through `playwright-core`
  (`npm install` once in the project directory).
- `gh` is **not** installed; use plain `git` and the public GitHub API.
- The local setuptools (56) is too old to build the wheel without isolation;
  `tools/check_wheel.py` lets pip fetch the declared build backend.

---

## 3. Deployment

Nothing is built for the site: **the files in `app/` are the site.** Pages
serves the repository root; `index.html` there forwards to `app/`.

```bash
cd "E:/PHD/Meteorites/CMAS programme/ohara-projection"
python tools/build_definitions.py     # after editing definitions, data/*.csv or anything in app/
python run_tests.py                   # all ten suites
git add -A && git commit -m "..." && git pull --rebase && git push
```

`tools/build_definitions.py` regenerates `app/definitions.js`,
`app/datasets.js` and `app/sw.js`. **CI fails if any of them is stale**
(`--check`), so an edit to any app file without regenerating `sw.js` breaks
the build — deliberately, because a stale cache name would serve old files to
installed users.

Watch runs at <https://github.com/tetrascope/tetrascope.github.io/actions>.
A Pages deployment takes about a minute after the push.

### 3.1 Line endings are part of correctness

`sw.js`'s cache name is a hash of the bytes of every cached file. On first
push, 23 files had CRLF endings; the hash computed on Windows would have
differed from the one CI computes on Linux. `.gitattributes`
(`* text=auto eol=lf`) now forces LF everywhere. Keep it.

### 3.2 Two GitHub accounts on this machine

Git Credential Manager holds a saved login for **`rockminid`** (RockMin ID's
account), which has no access to this repo; the first push was refused with
a 403. The remote URL carries `tetrascope@`, so GCM uses the **`tetrascope`**
login here and the `rockminid` login elsewhere. Do not remove that prefix.
If a sign-in prompt is needed, `git -c credential.gitHubAuthModes=device push`
shows a device code instead of opening a browser.

### 3.3 The owner also commits through the web

`71efa40` came from GitHub's web uploader. Always `git pull --rebase` before
pushing. The uploader is fine for single root files; for anything else use
git (RockMin ID's handoff §3.1 documents how the uploader broke that site).

---

## 4. Architecture

```
ohara/data/definitions.json   single source of truth: molar masses, O'Hara
                              multipliers, endmembers, planes, projections,
                              norm recipes, input rules, metadata columns
ohara/                        Python engine + CLI (`ohara`), numpy only
app/ohara.js                  browser engine, mirrors ohara/*.py
app/definitions.js            GENERATED from ohara/data/definitions.json
app/datasets.js               GENERATED from data/*.csv
app/sw.js                     GENERATED from tools/sw.template.js
app/ui.js, index.html         the workbench
app/cloud.js                  optional Google sign-in + collection sync
app/csv.js, labels.js         RFC 4180 parser; collision-free label placement
app/manual.html               user manual with scientific background
app/config.js                 appUrl + Firebase web config
app/vendor/                   pinned third-party code (VENDOR.json)
data/                         transcribed published data + provenance
tools/                        generators and checks
tests/                        ten suites (tests/e2e = browser)
firestore.rules               rules for the Firebase project (= RockMin ID's)
```

Key decisions, and why:

- **Two engines, one data file.** Python for scripting and tests, JS so the
  site needs no server. Constants and definitions live once in JSON; the
  algorithms are duplicated and held together by `test_parity.py`.
- **One projection routine.** Every diagram solves
  `X = Σ a_i P_i + Σ b_j B_j` in the 4-component space; the b's are converted
  to weight % (O'Hara's convention). Validity = the 1-norm condition number:
  refuse above 1e10, warn above 1e3 (presets are all below 20).
- **Strict input.** Unknown oxide names are errors (a typo like `Si02` would
  silently drop an oxide); unused components (SrO, SO3 …) are accepted and
  listed; descriptive CSV columns are skipped. Same rules in both engines.
- **No third-party code by default.** Libraries are bundled and hash-pinned;
  Firebase loads only when a visitor clicks Sign in, and is excluded from the
  service-worker precache so ordinary visitors never download it.

---

## 5. Features, briefly

### 5.1 Science
CMAS reduction exactly as O'Hara's Fig. 4 caption; classic CIPW norm (order
Hy→Ol, Ab→Ne, Or→Lc, Lc→Ks, Wo→Cs, Di→Cs+Ol); recast to Di–Ol–Ne–Qz by
projection from plagioclase (default) or Ab = Ne + 2Qz; Yoder & Tilley groups;
side of five CMAS and two normative dividing planes; 15 preset projections
(O'Hara Figs 4/9, 5/10, 11, sub-projections, binary sections) plus custom ones.

### 5.2 Workbench
3-D tetrahedron, 2-D diagrams (overlap-free labels), results table, in-page
validation (parts A–C), CSV upload/paste with **downloadable template and
column guide**, Yoder & Tilley and Tilley et al. data built in, local
collection, share links with full state, SVG/PNG/CSV export, light/dark
theme, feedback, docs, installable offline app.

### 5.3 Command line
`ohara --oxides "SiO2=…"` / `ohara --csv file.csv [--ignore-columns "n_*"] [--lenient]`;
one-line errors, CSV line numbers, exit codes 0/1/2.

### 5.4 Sign-in and sync
`app/cloud.js`. Firebase Auth (Google) + Firestore REST with the user's ID
token. Same layout and schema as RockMin ID: `users/{uid}/savedSamples/{id}`
(`sampleType: "custom"`, tag `tetrascope`, oxides as numbers, `FeO*`↔`FeOT`,
TetraScope options in a `tetrascope` field) and create-only `feedback/{id}`.
The project is **`tetrascope-6868e`, separate from RockMin ID's**, so accounts
and samples are not shared between the apps today; pointing both at one
project would share them with no code change.

---

## 6. Verification

| Layer | What | Result |
| --- | --- | --- |
| Algebra | projected positions of pure phases, O'Hara's reduction identities | exact |
| Yoder & Tilley 1962, Table 2 | 25 analyses + norms transcribed with per-cell provenance | all totals reproduced; norms agree (max 1.39 wt%, Di–Hy–Ol split of no. 15); groups agree for 23/25 (16, 22 lie on the critical plane) |
| Tilley, Yoder & Schairer 1963, 1964 | 8 analyses + norms (Carnegie Year Books 62, 63, archive.org) | all totals reproduced; norms agree within 0.96 wt% |
| O'Hara 1968 figures | 44 points digitised, calibrated only from each figure's ticks | all ≤ 0.53 wt%; 11 natural rocks ≤ 0.25 wt% |
| Negative controls | molecular units; naive CMAS reduction | both fail by > 2 wt% (mean 11 and 21 wt%) |
| Engines | Python vs JS, 848 cases incl. malformed input | identical |
| Browser | 13 Chromium workflows incl. offline reload | pass |

### Errata found in the originals (documented in the data, not "corrected")

- **Y&T Table 2, analyses 10–13:** printed magnetite and ilmenite are
  transposed (no. 10: Fe2O3 1.72 wt% allows at most 2.49 wt% Mt, 5.78 printed).
- **O'Hara Fig. 5, "1921":** plotted 3.0 wt% from analysis 14 (the analysis
  the sources name, and the one that matches his own Fig. 4C point to 0.25),
  but within 0.11 wt% of Y&T analysis 12 of the same lava. Kept with status
  `discrepancy`, reported, not scored; a test pins it.

---

## 7. Defects fixed during development (keep the tests that guard them)

- CIPW cascade released the wrong silica for Ab→Ne (2 instead of 4) and Or→Lc;
  apatite weight divided by 3; excess CaO not charged as wollastonite;
  Lc→Ks missing. Found by comparison with Y&T Table 2.
- Albite endmember in Di–Ol–Ne–Qz units was Ne + 2Qz instead of Ne + 4Qz
  (Ne unit = Na2O·Al2O3·2SiO2) — shifted the critical plane.
- Negative normative minerals with phosphate-rich input; unknown oxide
  headers silently ignored; browser CSV split on commas inside quotes;
  overlapping diagram labels; editable-only packaging of the data file;
  CLI tracebacks. All fixed, all with regression tests.

---

## 8. What is still open

### 8.1 RESOLVED — Google sign-in: API key referrer restriction

Resolved 2026-09-24: the owner added the Firebase auth domain to the key and
reports that sign-in works. Kept below for reference, in case a future key
change breaks it again.

Clicking Sign in reaches Firebase's handler at
`tetrascope-6868e.firebaseapp.com/__/auth/handler`, which shows
**"The requested action is invalid."** The browser API key is restricted to
`tetrascope.github.io` and blocks requests from the Firebase auth domain.
Checked on 2026-09-24 with:

```bash
curl -s -H "Referer: https://tetrascope-6868e.firebaseapp.com/__/auth/handler" \
  "https://www.googleapis.com/identitytoolkit/v3/relyingparty/getProjectConfig?key=AIzaSyDQtULvzmot-PuIjmW-4iw9jGhLhkbp6Qs"
```

(returns "Requests from referer … are blocked"; it should return the project).

**Fix (owner, Google Cloud console):** APIs & Services → Credentials → the
browser key `AIzaSyDQtULv…` → Website restrictions → add
`https://tetrascope-6868e.firebaseapp.com/*` (and `http://localhost/*` for
local testing); keep `https://tetrascope.github.io/*`. Save; allow ~5 min.

**Then verify:** rerun the curl above (expect `"projectId"`), sign in on the
live site with a Google account (a human must type the credentials), save a
composition, reload, and confirm it is still in "My collection" and appears
in Firestore under `users/<uid>/savedSamples` with the `tetrascope` tag.
Also send one feedback entry and confirm it lands in `feedback/`.

Already verified for this project: Firestore exists; rules deny anonymous
reads of `users/*/savedSamples` and writes outside allowed paths; the Google
provider is enabled; `tetrascope.github.io` is an authorised domain; the
app falls back from pop-up to redirect when pop-ups are blocked.

### 8.2 Science
- **Natural points not yet scored** (analyses not openly accessible):
  1955/77, 1955/82 (Tilley 1960); KO (Wentworth & Winchell 1947 — identity
  also ambiguous: O'Hara "Kilauea olivine basalt", Tilley et al. "Koolau");
  Green & Ringwood points AL′, OB′, P′, II–IV, OT′, QT, BA, A; Ito & Kennedy
  AV, IK, NM5′; O'Hara & Yoder A3, 50, 75; kimberlite nodules and pyrolite
  models of Figs 9–11. With the analyses, add rows to
  `data/ohara_1968_digitised.csv` and they are scored immediately.
- Residual Di–Hy–Ol differences (≤ 1.4 wt%) against Y&T's hand-computed norms
  are attributed to their arithmetic; not further explained.

### 8.3 Project
- **Released:** `v0.3.0` is archived on Zenodo as
  [10.5281/zenodo.22930792](https://doi.org/10.5281/zenodo.22930792). The
  concept DOI 10.5281/zenodo.22930791 always resolves to the latest version.
  `CITATION.cff`, the README and the in-app "How to cite" all carry the DOI.
  **For the next release:** bump the version in the four places listed in §2,
  tag `v*`, wait for Zenodo to mint the new DOI, then update `doi:` in
  `CITATION.cff`, `TOOL_DOI` in `app/ui.js` and the README citation.
- **Author:** Kishan Tiwari (ORCID 0000-0003-0014-914X, <https://kishangeo.github.io/>)
  in `CITATION.cff`, `pyproject.toml`, `package.json`, `LICENSE`, the in-app
  citation and BibTeX, and the "Created by" credit in the app footer, the
  manual and the README. Future Zenodo versions take their authors from
  `CITATION.cff`. The v0.3.0 record still lists `tetrascope` (the GitHub
  account) until it is edited on Zenodo by hand.
- `KP` and `1840b2` analyses are transcribed but not located in the digitised
  figures.

---

## 9. Post-change checklist

1. `python tools/build_definitions.py` (regenerates definitions, datasets, sw.js).
2. `python tools/check_vendor.py` if anything in `app/vendor/` changed.
3. `python run_tests.py` — ten suites; the e2e suite needs `npm install`.
4. `git pull --rebase && git push`.
5. Watch Actions; then `curl -s -o /dev/null -w "%{http_code}" https://tetrascope.github.io/app/`.

---

## 10. Conventions to keep

- **Validate against sources, not against the code.** Expected values come
  from stoichiometry, printed tables or digitised figures — never from what
  the program currently returns.
- **Record provenance.** Every transcribed value has a page, printed token and
  note; errata in the originals are documented and kept as printed.
- **Report, don't hide.** Assumptions, warnings and discrepancies are shown to
  the user and asserted in tests.
- **Same rules in both engines;** any new rule goes into both and into
  `test_parity.py`.
- **Pin third-party code** with SHA-512 in `app/vendor/VENDOR.json`, record
  where it came from, keep its licence (`THIRD_PARTY_NOTICES.md`, `licenses/`).

---

## 11. Commands

```bash
python run_tests.py                         # all ten suites
python tests/test_figures.py                # just the O'Hara figure validation
python tools/figure_check.py                # full table of digitised points
python tools/build_definitions.py [--check] # regenerate / verify generated files
python tools/check_vendor.py                # vendored-library hashes
python tools/check_wheel.py [--isolated]    # build + install + run the wheel
npm install && npm run e2e                  # browser workflows (Chrome)
node app/serve.js 8765                      # local server: http://localhost:8765
pip install . && ohara --help               # command line
```
