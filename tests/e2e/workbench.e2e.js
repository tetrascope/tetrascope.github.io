/* Browser end-to-end tests for the workbench (Chromium via playwright-core).
 *
 *   npm install            (once; pins playwright-core)
 *   npm run e2e            (uses the locally installed Google Chrome)
 *
 * In CI:  npx playwright-core install chromium  and  E2E_BROWSER=bundled.
 * E2E_BROWSER can also be "msedge" or "chrome" (default); E2E_ONLY=<text>
 * runs only the workflows whose name contains <text>.
 *
 * Workflows covered: first load without errors, CSV upload (incl. a quoted
 * label containing a comma), strict CSV headers, share-link round trip, SVG
 * and CSV export, the local collection surviving a reload, theme persistence,
 * and an offline reload after the service worker has installed.
 */
"use strict";
const { chromium } = require("playwright-core");
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const results = [];
let server, browser, base;

function startServer() {
  return new Promise((resolve, reject) => {
    server = spawn(process.execPath, [path.join(ROOT, "app", "serve.js"), "0"]);
    server.stdout.on("data", (d) => {
      const m = /http:\/\/localhost:(\d+)/.exec(String(d));
      if (m) resolve("http://localhost:" + m[1]);
    });
    server.on("error", reject);
    setTimeout(() => reject(new Error("server did not start")), 10000);
  });
}

async function test(name, fn) {
  if (process.env.E2E_ONLY && !name.includes(process.env.E2E_ONLY)) return;
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  const t0 = Date.now();
  try {
    await fn(page, context, errors);
    if (errors.length) throw new Error("console/page errors: " + errors.join(" | "));
    results.push([true, name, Date.now() - t0]);
    console.log("PASS " + name);
  } catch (e) {
    results.push([false, name, Date.now() - t0]);
    console.log("FAIL " + name + "\n     " + (e && e.stack ? e.stack.split("\n").slice(0, 3).join("\n     ") : e));
  } finally {
    await context.close();
  }
}

function assert(cond, msg) { if (!cond) throw new Error(msg); }

async function ready(page, url) {
  await page.goto(url || base + "/index.html");
  await page.waitForFunction(() => document.querySelector("#projout table"));
}

async function projected(page) {
  return page.$$eval("#projout td", (tds) => tds.map((t) => t.textContent));
}

(async function main() {
  base = await startServer();
  const which = process.env.E2E_BROWSER || "chrome";
  browser = await chromium.launch(which === "bundled" ? {} : { channel: which });
  console.log("browser: " + which + " " + browser.version() + ", app: " + base);

  await test("first load renders every panel without errors", async (page) => {
    await ready(page);
    assert(await page.locator("#classout b").count() === 1, "classification missing");
    assert((await projected(page)).length >= 9, "projection table missing");
    for (const tab of ["t2d", "ttab", "tval"]) {
      await page.click('[data-tab="' + tab + '"]');
      assert(await page.locator("#" + tab).isVisible(), tab + " not shown");
    }
    const val = await page.textContent("#valout");
    assert(/all checks pass/.test(val), "in-page validation did not pass");
  });

  await test("manual opens from the workbench; every contents link resolves", async (page) => {
    await ready(page);
    await page.click("#btnHelp");
    const [manual] = await Promise.all([page.context().waitForEvent("page"),
                                        page.click('#dlgDocs a[href="manual.html"]')]);
    await manual.waitForLoadState();
    const broken = await manual.$$eval("nav.toc a", (as) => as.map((a) => a.getAttribute("href"))
      .filter((h) => !document.querySelector(h)));
    assert(!broken.length, "broken contents links: " + broken);
    assert((await manual.$$eval("h2", (h) => h.length)) >= 15, "manual sections missing");
  });

  await test("CSV upload, including a quoted label with a comma", async (page) => {
    await ready(page);
    await page.setInputFiles("#csvFile", path.join(ROOT, "data", "example_suite.csv"));
    await page.waitForFunction(() => /plotted/.test(document.getElementById("csvReport").textContent));
    const rep = await page.textContent("#csvReport");
    assert(/10 plotted/.test(rep), "expected 10 plotted, got: " + rep);
    await page.click('[data-tab="ttab"]');
    const rowText = await page.textContent("#tabout");
    assert(rowText.includes("Olivine nephelinite, strongly undersaturated (synthetic)"), "quoted label lost");
    // the nephelinite must be classified as alkaline: its SiO2 was not shifted
    const group = await page.$$eval("#tabout tr", (rows) => {
      const r = rows.find((x) => x.textContent.includes("Olivine nephelinite"));
      return r ? r.lastElementChild.textContent : "";
    });
    assert(/alkali basalt/.test(group), "nephelinite misclassified: " + group);
  });

  await test("CSV with a misspelt oxide header is refused, lenient import accepts it", async (page) => {
    await ready(page);
    const f = path.join(os.tmpdir(), "ohara_e2e_typo.csv");
    fs.writeFileSync(f, "label,Si02,MgO,CaO\nx,50,20,10\n");
    await page.setInputFiles("#csvFile", f);
    await page.waitForFunction(() => document.getElementById("csvReport").textContent.length > 0);
    assert(/did you mean SiO2/.test(await page.textContent("#csvReport")), "no typo hint");
    await page.check("#csvLenient");
    await page.setInputFiles("#csvFile", f);
    await page.waitForFunction(() => /plotted/.test(document.getElementById("csvReport").textContent));
  });

  await test("share link reproduces composition, options and diagram", async (page, context) => {
    await ready(page);
    await page.selectOption("#space", "basalt");
    await page.selectOption("#proj", "basalt_ab_Di_Ol_Qz");
    await page.fill("#label", 'shared, "quoted" sample');
    await page.fill("#ox_MgO", "12.5");
    await page.click("#calc");
    const before = await projected(page);
    await page.click("#btnShare");
    const link = await page.inputValue("#shareLink");
    assert(/#s=/.test(link), "no state in link");
    // links point at the public site (config.js appUrl); open the same
    // state on the local test server
    const local = base + "/index.html" + link.slice(link.indexOf("#"));
    const other = await context.newPage();
    await ready(other, local);
    assert(await other.inputValue("#label") === 'shared, "quoted" sample', "label not restored");
    assert(await other.inputValue("#proj") === "basalt_ab_Di_Ol_Qz", "projection not restored");
    const after = await projected(other);
    assert(JSON.stringify(before) === JSON.stringify(after), "coordinates differ:\n" + before + "\n" + after);
  });

  await test("SVG and CSV export contain the plotted result", async (page) => {
    await ready(page);
    await page.click("#loadYT");
    await page.click('[data-tab="t2d"]');
    const [svgDl] = await Promise.all([page.waitForEvent("download"), page.click("#dlsvg")]);
    const svg = fs.readFileSync(await svgDl.path(), "utf8");
    assert(svg.startsWith("<svg") && svg.includes("from olivine (M2S) into CS-MS-A"), "SVG export wrong");
    assert((svg.match(/<circle/g) || []).length >= 26, "SVG missing points");
    const [csvDl] = await Promise.all([page.waitForEvent("download"), page.click("#dlcsv")]);
    const lines = fs.readFileSync(await csvDl.path(), "utf8").trim().split(/\r?\n/);
    assert(lines[0].startsWith("label,CS,MS,A,x,y"), "CSV header: " + lines[0]);
    assert(lines.length === 1 + 1 + 25, "CSV rows: " + lines.length);
    const shown = (await projected(page))[1];              // CS wt% of the sample, on screen
    assert(Math.abs(parseFloat(lines[1].split(",")[1]) - parseFloat(shown)) < 0.001, "CSV value differs from page");
  });

  await test("collection survives a reload; load and delete work", async (page) => {
    await ready(page);
    await page.fill("#label", "kept sample");
    await page.click("#saveSample");
    await page.reload();
    await page.waitForFunction(() => document.querySelector("#projout table"));
    assert(/kept sample/.test(await page.textContent("#collection")), "not persisted");
    await page.fill("#label", "something else");
    await page.click('#collection [data-load="0"]');
    assert(await page.inputValue("#label") === "kept sample", "load failed");
    await page.click('#collection [data-del="0"]');
    assert(!/kept sample/.test(await page.textContent("#collection")), "delete failed");
  });

  await test("theme choice persists", async (page) => {
    await ready(page);
    const first = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    await page.click("#themeSwitch");
    await page.reload();
    await page.waitForFunction(() => document.querySelector("#projout table"));
    const second = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    assert(first !== second, "theme did not persist");
  });

  await test("CSV template downloads and imports cleanly", async (page) => {
    await ready(page);
    const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#dlTemplate")]);
    const got = fs.readFileSync(await dl.path(), "utf8");
    assert(got === fs.readFileSync(path.join(ROOT, "app", "tetrascope_template.csv"), "utf8"), "template differs");
    await page.click("#csvGuideToggle");
    assert(await page.locator("#csvGuide").isVisible(), "column guide not shown");
    await page.setInputFiles("#csvFile", await dl.path());
    await page.waitForFunction(() => /plotted/.test(document.getElementById("csvReport").textContent));
    const rep = await page.textContent("#csvReport");
    assert(/^.*: 3 plotted$/.test(rep.trim()), "template import: " + rep);
  });

  await test("sign-in stays hidden and loads nothing when not configured", async (page) => {
    const requested = [];
    page.on("request", (r) => requested.push(r.url()));
    await ready(page);
    assert(await page.locator("#btnAccount").isHidden(), "sign-in button shown without config");
    assert(!requested.some((u) => /firebase|googleapis|gstatic/.test(u)), "Google/Firebase requested: " + requested.filter((u) => /firebase|google/.test(u)));
  });

  await test("sign-in button appears when configured and loads the pinned SDK on click", async (page, context, errors) => {
    await context.route("**/config.js", (route) => route.fulfill({
      contentType: "text/javascript",
      body: 'window.OHARA_CONFIG = {appUrl: null, firebase: {apiKey: "AIzaTestTestTestTestTestTestTestTestTe", ' +
            'authDomain: "tetrascope-test.firebaseapp.com", projectId: "tetrascope-test", appId: "1:1:web:1"}};'}));
    context.on("page", (p) => p.close().catch(() => {}));      // the Google pop-up (cannot sign in here)
    const requested = [];
    page.on("request", (r) => requested.push(r.url()));
    await ready(page);
    assert(await page.locator("#btnAccount").isVisible(), "sign-in button not shown");
    assert(!requested.some((u) => /vendor\/firebase/.test(u)), "SDK loaded before the visitor asked to sign in");
    await page.click("#btnAccount");
    await page.waitForFunction(() => window.firebase && window.firebase.apps.length === 1, null, { timeout: 10000 });
    assert(requested.some((u) => /vendor\/firebase-auth-compat-12\.19\.0\.js/.test(u)), "pinned auth SDK not requested");
    const sri = await page.$$eval("script[src*='vendor/firebase']", (els) => els.map((e) => !!e.integrity));
    assert(sri.length === 2 && sri.every(Boolean), "SDK scripts not integrity-pinned");
    errors.length = 0;          // the dummy project cannot complete a real Google sign-in
  });

  await test("works offline after the service worker installs (incl. QR code)", async (page, context) => {
    await ready(page);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();                                        // now controlled by the worker
    await page.waitForFunction(() => navigator.serviceWorker.controller);
    const cache = await page.evaluate(async () => (await caches.keys()).join(","));
    const expected = /const CACHE = '([^']+)'/.exec(fs.readFileSync(path.join(ROOT, "app", "sw.js"), "utf8"))[1];
    assert(cache.includes(expected), "cache " + cache + " != " + expected);
    await context.setOffline(true);
    await page.reload();
    await page.waitForFunction(() => document.querySelector("#projout table"));
    await page.fill("#ox_MgO", "9");
    await page.click("#calc");
    await page.click("#btnShare");
    await page.click("#shQR");
    // qrcodejs draws a canvas, then swaps it for an <img>; wait for whichever
    // is visible (a "#qr canvas, #qr img" selector waits on the hidden canvas)
    await page.waitForFunction(() => [...document.querySelectorAll("#qr canvas, #qr img")]
      .some((n) => n.offsetWidth > 100 && n.offsetHeight > 100), null, { timeout: 10000 });
    await context.setOffline(false);
  });

  await browser.close();
  server.kill();
  const failed = results.filter((r) => !r[0]).length;
  console.log("\ne2e: " + (results.length - failed) + "/" + results.length + " workflows passed");
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  if (server) server.kill();
  process.exit(1);
});
