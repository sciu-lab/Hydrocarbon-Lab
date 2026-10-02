import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { resolve, relative, sep } from "node:path";
import { pathToFileURL } from "node:url";

export async function validatePagesArtifact(directory = "dist-pages", base = "/Hydrocarbon-Lab/") {
  const root = resolve(directory);
  const checked = new Set();
  async function asset(url, parent = "") {
    if (/^(?:https?:|data:|blob:|#|mailto:)/i.test(url)) return;
    const clean = url.split(/[?#]/)[0];
    assert.ok(!clean.startsWith("/") || clean.startsWith(base), `Outside repository base: ${url}`);
    const file = resolve(root, clean.startsWith(base) ? clean.slice(base.length) : resolve(root, parent, clean));
    const local = relative(root, file);
    assert.ok(local !== ".." && !local.startsWith(`..${sep}`), `Escaping artifact: ${url}`);
    if (checked.has(file)) return;
    const info = await stat(file);
    if (info.isDirectory()) {
      assert.ok((await stat(resolve(file, "index.html"))).isFile(), `Missing route: ${url}`);
      return;
    }
    checked.add(file);
    assert.ok(info.isFile(), `Missing asset: ${url}`);
    if (file.endsWith(".css")) {
      const css = await readFile(file, "utf8");
      for (const match of css.matchAll(/url\(\s*["']?([^\s"')]+)["']?\s*\)/g)) {
        await asset(match[1], relative(root, resolve(file, "..")));
      }
    } else if (file.endsWith(".js")) {
      const js = await readFile(file, "utf8");
      for (const match of js.matchAll(/["'`]([^"'`\s]+\/assets\/[^"'`\s]+)["'`]/g)) {
        await asset(match[1], relative(root, resolve(file, "..")));
      }
    }
  }
  for (const entry of ["index.html", "es/index.html", "en/index.html"]) {
    const html = await readFile(resolve(root, entry), "utf8");
    if (entry !== "index.html") {
      assert.match(html, /data-lab-deployment="static"/, `${entry} must select local persistence`);
      assert.match(html, /<script[^>]+type="module"/, `${entry} has no application entry`);
    }
    for (const match of html.matchAll(/(?:src|href)=["']([^"']+)["']/g)) {
      await asset(match[1], relative(root, resolve(root, entry, "..")));
    }
  }
  return { entries: 3, assets: checked.size, base };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  console.log("PAGES_ARTIFACT=" + JSON.stringify(await validatePagesArtifact()));
}
