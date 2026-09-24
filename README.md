# TetraScope

**O'Hara projection workbench** - live at <https://tetrascope.github.io/app/>

An interactive, reproducible implementation of O'Hara's (1968) projection scheme
for the basalt tetrahedron, replacing manual graphical construction.

Enter an analysis (mineral, melt, rock or experimental product). The program
reduces it to the components each scheme needs, decides which subvolume of the
tetrahedron it falls in, lets you choose the projection point and the target
plane, and returns the projected coordinates, the diagram, and every assumption
applied along the way.

Sources implemented:

* **O'Hara, M. J. (1968)**, *Earth-Sci. Rev.* 4, 69-133: the CMAS reduction
  (caption to Fig.4) and the projections of Fig.4/9 (from olivine), Fig.5/10
  (from orthopyroxene) and Fig.11 (from diopside).
* **Yoder, H. S. & Tilley, C. E. (1962)**, *J. Petrol.* 3, 342-532: the
  generalised normative tetrahedron Di-Ol-Ne-Qz, its two dividing planes, the
  five normative groups (p. 352), and Table 2 (25 analyses with norms), which
  is used as published validation data.

---

## Layout

```
data/
  yoder_tilley_1962_table2.csv              Table 2, pp. 361-362 (analyses + norms)
  yoder_tilley_1962_table2.provenance.csv   every transcribed cell: page, printed
                                            label, printed token, value, note
  yoder_tilley_1962_table2.provenance.json  source, method, date, checks, corrections
  tilley_yoder_1963_1964_analyses.csv       basalts plotted by O'Hara (Year Books 62, 63)
  tilley_yoder_1963_1964_analyses.provenance.*  per-cell record, label mapping,
                                            sources that could not be obtained
  ohara_1968_digitised.csv (+ .provenance.json)  points digitised from Figs 4-11
  example_suite.csv                         reference compositions and end members
ohara/                    Python package (numpy only)
  data/definitions.json     SINGLE SOURCE OF TRUTH: molar masses, O'Hara multipliers,
                            endmembers, dividing planes, projections, norm recipes,
                            input limits, metadata-column names. Shipped inside the
                            package; the browser gets a generated copy.
  defs.py                   loads it with importlib.resources
  components.py             input validation, CMAS reduction, CIPW norm
  geometry.py               projection algebra, scale-free tolerances
  spaces.py, basalt.py      endmembers/planes/projections; norm -> tetrahedron
  api.py, cli.py            Composition, classify, project, report; command line
app/                      the interactive workbench (static files, no build step)
  index.html, ui.js         page and interface
  ohara.js                  the engine, mirroring ohara/*.py
  definitions.js            GENERATED from ohara/data/definitions.json
  datasets.js               GENERATED from data/*.csv
  csv.js                    RFC 4180 CSV parser
  labels.js                 collision-free label placement
  config.js                 deployment options (share URL, optional feedback inbox)
  manual.html               user manual with the scientific background
  vendor/                   bundled qrcodejs 1.0.0 (MIT), hash-pinned in VENDOR.json
  sw.js, manifest.webmanifest, icon.svg   installable offline app
  serve.js                  local server (127.0.0.1 only, path-contained)
tools/
  build_definitions.py      regenerates app/definitions.js and app/datasets.js
                            (--check: fail if they are stale)
  check_wheel.py            builds the wheel, installs it in a fresh venv and runs
                            the installed CLI from outside the source tree
  check_vendor.py           recomputes the SHA-512 of vendored libraries against
                            app/vendor/VENDOR.json
  figure_check.py           scores the digitised O'Hara figure points
  sw.template.js            template for app/sw.js (cache name = version + a hash
                            of every cached file, generated)
tests/                    nine suites, run by run_tests.py (tests/e2e: browser)
.github/workflows/ci.yml  CI: tests on Python 3.9-3.13 and Node 18/20/22 (Linux and
                          Windows), stale-asset and vendor-hash checks, Chromium
                          end-to-end job, wheel build + install test, GitHub
                          release on v* tags
package.json              pins playwright-core for the browser tests
pyproject.toml, requirements.txt
```

## Running it

Requirements: Python 3.9+ with numpy; Node.js 18+ for the local server and the
browser-parity tests.

```bash
pip install .
```

(installs the `ohara` command; the data file travels inside the wheel.)

```bash
node app/serve.js 8765
```

then open <http://localhost:8765>. Opening `app/index.html` directly from disk also
works; only the offline/install feature needs the server.

Command line:

```bash
ohara --oxides "SiO2=48.5,TiO2=2.2,Al2O3=13,Fe2O3=1.4,FeO=9.8,MgO=11.5,CaO=10.5,Na2O=2.1,K2O=0.4,P2O5=0.2"
```

```bash
ohara --csv data/yoder_tilley_1962_table2.csv --ignore-columns "n_*" --projection cmas_ol_CS_MS_A --json
```

Errors are one-line messages on stderr (never tracebacks), with the CSV line
number for row problems. Exit status 0 = success, 1 = some rows or projections
failed (the rest are still reported), 2 = unusable input or options.

Packaging check (build, install into a clean venv, run the installed CLI):

```bash
python tools/check_wheel.py
```

All tests, one command:

```bash
python run_tests.py
```

Browser end-to-end tests (uses your installed Chrome; CI downloads Chromium):

```bash
npm install
```

```bash
npm run e2e
```

After editing `ohara/data/definitions.json` or `data/*.csv`:

```bash
python tools/build_definitions.py
```

(the parity suite fails if you forget).

---

## The workbench

* **3-D tetrahedron** (CMAS or Di-Ol-Ne-Qz), rotatable, with the critical plane of
  silica undersaturation, the plane of silica saturation, the reference phases,
  the sample, the dataset and the projection line.
* **Projected diagram**: any preset, or a custom projection from one point onto a
  plane (ternary) or from two points onto a join (binary). Labels are placed
  without overlaps using measured text widths; labels that cannot fit are
  listed as hover-only in the caption. Export as SVG, PNG or CSV.
* **Classification**: Yoder & Tilley group, CMAS subvolume, and the side of each
  dividing plane.
* **Datasets**: Yoder & Tilley Table 2 built in; paste or upload any CSV
  (quoted fields, semicolon or tab separated); rows that fail validation are
  skipped and listed with their line numbers.
* **My collection**: save compositions in the browser, reload, plot all, export CSV.
* **Validation tab**: re-runs the stoichiometric checks and the comparison with
  Table 2 in the page.
* From RockMin ID: **light/dark theme switch** (remembered), **Share** (a link
  that reproduces the exact composition, options and diagram; copy, device
  share, email, WhatsApp, X, LinkedIn, QR code), **Feedback** (category, rating,
  message, optional email and sample context; kept in the browser and, if
  configured, sent to the same Firestore `feedback` collection and schema as
  RockMin ID), **Docs** (manual, glossary, how to cite, privacy),
  **installable offline app**.

To enable the cloud feedback inbox or public share links, edit `app/config.js`.

## 1. Reduction of the analysis

### Input rules (identical in Python and the browser)

**Column names are strict.** Every oxide name must be recognised (case and
spaces don't matter; FeOT, FeO*, LOI, H2O+/- and similar aliases are
understood). Components the model does not use (SrO, BaO, SO3, F, Cl, ZrO2 ...)
are accepted, excluded and listed. Any other name stops the calculation with a
hint - `Si02` gives "did you mean SiO2?" - because silently dropping it would
give a wrong result. Descriptive CSV columns (label, rock, locality, total,
...) are skipped automatically; others can be skipped with `--ignore-columns`
(globs allowed) or, deliberately, with `--lenient` / the "lenient import"
checkbox, which ignores unknown columns and lists them in the assumptions.

Blank values are ignored. Every other value must be a finite, non-negative
number in plain decimal/scientific notation; negative, `NaN`, `Infinity`, hex
and text values are rejected with a message naming the oxide. The Fe2O3/ΣFe
ratio (used only when total iron is given) must lie in 0-1. Total iron cannot be
combined with FeO/Fe2O3 in one analysis. An analysis with no non-volatile oxide
is rejected; an anhydrous total outside 97-102 wt% is accepted with a warning.

### CMAS (O'Hara 1968, caption to Fig.4)

With molecular proportions:

```
C = (CaO - 10/3 P2O5 + 2 Na2O + 2 K2O)            x 56.08
M = (MgO + FeO + MnO + NiO - TiO2)                x 40.31
A = (Al2O3 + Cr2O3 + Fe2O3 + Na2O + K2O + TiO2)   x 101.96
S = (SiO2 - 2 Na2O - 2 K2O)                       x 60.09
```

so that albite and orthoclase plot as anorthite, jadeite and aegirine as CaTs,
Fe-Ti-Cr oxides as spinel, all olivines as forsterite and all garnets on the
grossular-pyrope join (each checked in `tests/test_validation.py`).

### CIPW norm and the basalt tetrahedron

Classic weight CIPW norm (apatite, chromite, ilmenite, magnetite, hematite,
orthoclase, albite, anorthite, corundum, diopside, wollastonite, hypersthene,
quartz; silica deficiency removed by Hy->Ol, Ab->Ne, Or->Lc, Lc->Ks, Wo->Cs,
Di->Cs+Ol). Phosphorus in excess of CaO and peralkaline Na/K are left
unallocated with a warning, so no normative mineral can go negative.

The norm is recast into Di-Ol-Ne-Qz with Yoder & Tilley's identities
(Ab = Ne + 2Qz, Hy = Ol + Qz). Feldspar is either projected out (default, the
geometrically exact choice) or read as Ab = Ne + 2Qz with An and Or omitted.

## 2. Classification and 3. Projection

A composition's side of a plane through three endmembers is the sign of a 4x4
determinant, computed on unit-normalised vectors so that it does not depend on
units or scale. Every diagram solves

```
X = a1 P1 [+ a2 P2] + b1 B1 + b2 B2 [+ b3 B3]
```

for the projection point(s) `P` and target vertices `B`; the `b` are converted
to weights and normalised to 100 (O'Hara's diagrams are weight-per-cent plots).
Validity is judged on the 1-norm condition number of the column-normalised
system: above 1e10 the projection is refused (point in the plane); above 1e3 it
is flagged as ill-conditioned (analytical error amplified more than 1000x). All
presets have condition numbers below 20.

| id | diagram | source |
| --- | --- | --- |
| `cmas_ol_CS_MS_A` | from olivine into CS-MS-A | O'Hara Fig.4, 9 |
| `cmas_opx_M2S_C2S3_A2S3` | from orthopyroxene into M2S-C2S3-A2S3 | O'Hara Fig.5, 10 |
| `cmas_di_C3A_S_M` | from diopside into C3A-SiO2-MgO | O'Hara Fig.11 |
| `cmas_an_M2S_CMS2_S` | from plagioclase into Ol-Di-SiO2 | sub-projection |
| `cmas_di_M2S_CAS2_S` | from diopside into Ol-An-SiO2 | sub-projection |
| `cmas_ol_CMS2_CAS2_S` | from olivine into Di-An-SiO2 | sub-projection |
| `cmas_s_M2S_CMS2_CAS2` | from silica into Ol-Di-An | sub-projection |
| `cmas_ol_CS_MS_A_join` | from olivine + opx onto CS-A | binary section |
| `cmas_ol_pl_join` | from olivine + plagioclase onto Di-SiO2 | binary section |
| `basalt_di_Ol_Ne_Qz` | from diopside into Ol-Ne-Qz | Yoder & Tilley |
| `basalt_ol_Di_Ne_Qz` | from olivine into Di-Ne-Qz | Yoder & Tilley |
| `basalt_ne_Di_Ol_Qz` | from nepheline into Di-Ol-Qz | Yoder & Tilley |
| `basalt_qz_Di_Ol_Ne` | from silica into Di-Ol-Ne | Yoder & Tilley |
| `basalt_ab_Di_Ol_Qz` | from albite (plagioclase) into Di-Ol-Qz | plagioclase projection |
| `basalt_ab_di_join` | from albite + diopside onto Ol-Qz | binary section |

## 4. Validation

`python run_tests.py` runs nine suites:

| suite | what it checks |
| --- | --- |
| `test_validation` | the CMAS reduction and projected positions against hand calculations from mineral stoichiometry (e.g. anorthite from olivine at CS 27.73 / MS 47.93 / A 24.34; the plane CS-MS-A seen edge-on from enstatite, O'Hara Fig.10) |
| `test_published` | **Yoder & Tilley (1962) Table 2** and **Tilley, Yoder & Schairer (1963, 1964)**: transcriptions reproduce every printed total; the CIPW norm matches the printed norms; normative groups match; per-cell provenance is consistent |
| `test_inputs` | input rejection, phosphate-rich and peralkaline inputs never give negative minerals, silica mass balance through the deficiency cascade, scale invariance, coplanar and near-coplanar projections |
| `test_parity` | Python vs browser engine: 842 cases (250 random compositions from ultramafic to peralkaline, both feldspar modes, Fe ratios 0/0.15/1 with total-iron input, Table 2, examples, 12 malformed inputs) x 15 projections - every numeric field to 1e-8 and every warning/assumption string identical; generated files not stale |
| `test_csv_js` | the browser CSV parser against Python's `csv` module, including quoted commas |
| `test_labels_js` | no label overlaps on crowded diagrams |
| `test_cli` | one-line errors and exit codes, CSV line numbers, strict and lenient column handling |
| `test_figures` | 44 points digitised from O'Hara's Figs 4A, 4C, 5, 9, 10, 11, incl. 11 natural basalts (below), with two negative controls and the documented Fig. 5 discrepancy |
| `test_e2e` | Chromium end-to-end: first load, manual links, CSV upload (quoted comma), strict headers, share-link round trip, SVG/CSV export, collection across reloads, theme, offline reload with QR (runs when `npm install` has been done) |

`test_published` also checks the provenance file: every transcribed cell has a
record whose value matches the dataset, whose printed token is consistent
(`n.d.`/`-` blank, `nil`/`tr.` zero, numbers identical), and whose page is
right; the Mt/Il correction list used by the validation is read from it.

### Agreement with Yoder & Tilley's Table 2

Two of Table 2's analyses exposed bugs in the first version of this program
(the Ab->Ne and Or->Lc steps released the wrong amount of silica, and apatite
was under-weighted); both are fixed and covered by tests. Now:

* alkali basalts 18-20 and the olivine nephelinite 24 match to within 0.5 wt%
  in every mineral, including Y&T's larnite and kalsilite;
* for 21 of the 25 analyses the largest difference in any mineral is below
  0.8 wt%. The largest residuals are in the Di-Hy-Ol split of analyses 15
  (1.39 wt%), 23 (0.92) and 14 (0.85). Rounding molecular proportions to three
  decimals as in 1962 (`cipw_norm(..., mol_round=3)`) does not remove them, so
  they appear to come from the hand calculation; the test uses an explicit
  1.8 wt% tolerance on Di, Hy and Ol and 0.8 wt% on everything else;
* **an erratum in the original**: for analyses 10-13 the printed magnetite and
  ilmenite values are transposed (no. 10 prints Mt 5.78, but its 1.72 wt%
  Fe2O3 can make at most 2.49 wt% magnetite). They are compared crosswise;
* the normative group (which of Qz, Hy, Ol, Ne are present) matches for 23 of 25
  analyses. The other two (16, 22) lie on the critical plane of silica
  undersaturation: the deciding mineral is below 1 wt% in both norms (e.g.
  0.33 wt% Ne computed vs none printed).

### Agreement with O'Hara's own figures (Figs 4A, 4C, 5, 9, 10, 11)

Points were digitised from 300-dpi renders of O'Hara's figures
(`data/ohara_1968_digitised.csv`, method and provenance in the matching
`.provenance.json`). Each figure is calibrated by a least-squares affine map
fitted **only to its own printed tick marks**; the plotted points are then
read in O'Hara's coordinates and compared with the engine
(`python tools/figure_check.py` prints the full table). Two kinds of point:

* **pure phases and exact mixtures** - diopside, pyrope, forsterite,
  enstatite, anorthite and O'Hara & Yoder's diopside-pyrope mixtures
  (labelled by wt% pyrope). These test the projection geometry and the
  weight-per-cent convention.
* **natural basalts** - the rocks O'Hara labels 1921, PB, KA, MK, ML, ML 87,
  E1 and E2, whose analyses were traced to Yoder & Tilley (1962) Table 2 and
  to Tilley, Yoder & Schairer (1963, 1964; Carnegie Institution Year Books
  62 and 63, openly available on archive.org) and transcribed with per-cell
  provenance (`data/tilley_yoder_1963_1964_analyses.*`). These also test
  O'Hara's CMAS reduction of Na, K, Ti, P, Cr and Fe3+.

| figure | projection | points (natural) | tick-fit RMS | mean abs. diff | max abs. diff |
| --- | --- | --- | --- | --- | --- |
| 4A | from olivine into CS-MS-A | 8 (6) | 0.02 wt% | 0.19 wt% | 0.53 wt% |
| 4C | from olivine into CS-MS-A | 3 (2) | 0.02 wt% | 0.25 wt% | 0.25 wt% |
| 5 | from opx into M2S-C2S3-A2S3 | 5 (3) | 0.09 wt% | 0.21 wt% | 0.24 wt% |
| 9 | from olivine into CS-MS-A | 12 | 0.01 wt% | 0.17 wt% | 0.33 wt% |
| 10 | from enstatite into M2S-C2S3-A2S3 | 12 | 0.06 wt% | 0.23 wt% | 0.45 wt% |
| 11 | from diopside into C3A-SiO2-MgO | 4 | 0.05 wt% | 0.16 wt% | 0.17 wt% |

**44 points, all within 0.53 wt%; the 11 natural-rock points all within
0.25 wt%.** The differences have mixed signs and are the size of
hand-plotting on a 1968 drawing (0.5 wt% is about 1.3 mm on the printed
page). Two negative controls show the comparison has teeth: plotting in
molecular instead of weight units misses by 11 wt% on average, and a naive
reduction without O'Hara's alkali/Ti/P/Fe3+ terms puts every natural rock
far outside tolerance (mean 21 wt%).

**One documented discrepancy in the original.** The "1921" point of Fig. 5
lies 3.0 wt% from analysis 14 - the analysis the sources give for the 1921
Kilauea olivine tholeiite, and the one that matches O'Hara's own "1921" in
Fig. 4C to 0.25 wt% - but within 0.11 wt% of Yoder & Tilley's analysis 12 of
the same lava. O'Hara appears to have plotted a different 1921 analysis in
Fig. 5. The point is kept in the data with status `discrepancy`, reported,
and not scored; a test pins the finding.

`tests/test_figures.py` requires every scored point within 0.6 wt%, each
figure's mean within 0.35 wt%, natural rocks within 0.35 wt%, and both
negative controls to fail; the same comparison runs in the workbench's
Validation tab (part C).

**Not covered, and why.** The remaining natural points in Figs 4-11 come
from sources that are not openly accessible: Tilley (1960) for 1955/77 and
1955/82; Wentworth & Winchell (1947) for KO (whose identity is also
ambiguous - O'Hara calls it a Kilauea olivine basalt, Tilley et al. the
Koolau basalt); Green & Ringwood (1966, 1967a) and Green et al. (1967) for
AL', OB', P', II-IV, OT', QT, BA, A; Ito & Kennedy (1967) and Cohen et al.
(1967) for AV, IK, NM5'; O'Hara & Yoder (1967), O'Hara & Mercy (1963),
Nixon et al. (1963) and Holmes (1936) for A3, the eclogite mixtures and the
kimberlite nodules of Figs 9-11. With those analyses, the points can be
added to `data/ohara_1968_digitised.csv` (their pixel positions are easy to
read with the same method) and scored immediately.

## 5. Limitations

* CMAS treats all iron as MgO, so Fe/Mg fractionation is invisible in CMAS
  diagrams by construction.
* With total iron the Fe2O3/ΣFe ratio is a choice (default 0.15 molar) and moves
  the point; the value used is printed with every result.
* The CIPW norm does not compute acmite, sodium metasilicate, sphene/perovskite
  or carbonate/sulphide minerals; such components are left unallocated with a
  warning rather than forced.
* Compositions with normative leucite, kalsilite or larnite lie outside the
  basalt tetrahedron; their position is an approximation and is flagged.
* Offline use is tested in Chromium (install, go offline, reload, compute,
  draw a QR code); other browsers are untested.
* The QR library's integrity pin is enforced only over http(s); browsers cannot
  apply subresource integrity to file:// pages.

## Deployment

The site is served by GitHub Pages from the root of this repository; the root
`index.html` forwards to `app/`. Nothing needs building: the files in `app/`
are the site. After changing `ohara/data/definitions.json` or `data/*.csv`,
run `python tools/build_definitions.py` and commit the regenerated
`app/definitions.js`, `app/datasets.js` and `app/sw.js` (CI fails otherwise).

## Licence

MIT - see `LICENSE`. Bundled third-party code and the sources of the data
are listed in `THIRD_PARTY_NOTICES.md`.
