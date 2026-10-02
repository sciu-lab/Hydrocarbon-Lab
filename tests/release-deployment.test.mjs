import assert from "node:assert/strict";
import test from "node:test";
import { readFile, mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { validatePagesArtifact } from "../scripts/validate-pages.mjs";

test("static builds use the local library on preview and custom hosts; server builds retain APIs", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const implementation = source.match(/function usesLocalLibrary\(\) \{[\s\S]*?\n\}/)[0];
  for (const [deployment, hostname, protocol, expected] of [
    ["static", "127.0.0.1", "http:", true], ["static", "chemistry.example", "https:", true],
    [undefined, "127.0.0.1", "http:", false], [undefined, "sciu-lab.github.io", "https:", true],
    [undefined, "", "file:", true],
  ]) {
    assert.equal(runInNewContext(implementation + "\nusesLocalLibrary()", {
      document: { documentElement: { dataset: { labDeployment: deployment } } },
      window: { location: { hostname, protocol } },
    }), expected);
  }
  for (const language of ["es", "en"]) {
    assert.match(await readFile(new URL(`../pages-src/${language}/index.html`, import.meta.url), "utf8"),
      /data-lab-deployment="static"/);
  }
});

test("artifact gate catches a wrong repository base, missing assets and missing static persistence marker", async () => {
  const root = await mkdtemp(join(tmpdir(), "hydrocarbon-rc1-"));
  try {
    for (const folder of ["es", "en", "assets"]) await mkdir(join(root, folder));
    const html = '<html data-lab-deployment="static"><script type="module" src="/Hydrocarbon-Lab/assets/app.js"></script></html>';
    await writeFile(join(root, "index.html"), '<a href="es/">ES</a><a href="en/">EN</a>');
    for (const language of ["es", "en"]) await writeFile(join(root, language, "index.html"), html);
    await assert.rejects(validatePagesArtifact(root), /ENOENT/);
    await writeFile(join(root, "assets", "app.js"), "console.log('fixture')");
    assert.equal((await validatePagesArtifact(root)).assets, 1);
    await writeFile(join(root, "es", "index.html"), html.replace("/Hydrocarbon-Lab/assets/", "/assets/"));
    await assert.rejects(validatePagesArtifact(root), /Outside repository base/);
    await writeFile(join(root, "es", "index.html"), html.replace(' data-lab-deployment="static"', ""));
    await assert.rejects(validatePagesArtifact(root), /local persistence/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
