import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const metadata = JSON.parse(readFileSync("package.json", "utf8"));
const directory = mkdtempSync(join(tmpdir(), "fis-extension-consumer-"));
const run = (args, cwd) => execFileSync("npm", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
try {
  const [packed] = JSON.parse(run(["pack", "--ignore-scripts", "--json", "--pack-destination", directory], process.cwd()));
  assert(packed.files.some(file => file.path === "dist/skykit.d.ts"));
  assert(!packed.files.some(file => /node_modules|\.env|src\//.test(file.path)));
  writeFileSync(join(directory, "package.json"), JSON.stringify({ private: true, type: "module" }));
  run(["install", "--offline", "--ignore-scripts", "--no-audit", "--no-fund", join(directory, packed.filename)], directory);
  writeFileSync(join(directory, "headless.mjs"), `import * as model from "${metadata.name}";
if (!Object.keys(model).length) throw new Error("Missing model exports");
`);
  execFileSync(process.execPath, ["headless.mjs"], { cwd: directory, stdio: "pipe" });
  run(["install", "--offline", "--ignore-scripts", "--no-audit", "--no-fund",
    "three@0.170.0", "@types/three@0.170.0", "@found-in-space/skykit@0.3.0-alpha.0"], directory);
  const satellite = metadata.name.endsWith("/satellites");
  const factory = satellite ? "createSatellitePlugin" : "createAircraftPlugin";
  const options = satellite
    ? `loadGroup: async group => ({ group, fetchedAtMs: 0, satellites: [] }),`
    : `source: { subscribe(_center, observer) { observer.onTracks([]); return { setCenter() {}, dispose() {} }; } },`;
  const consumer = `
import assert from 'node:assert/strict';
import { createSkykitViewer } from '@found-in-space/skykit';
import { Group } from 'three';
import { ${factory} } from '${metadata.name}/skykit';
import * as renderer from '${metadata.name}/three';
${satellite ? `import { createSatelliteFeedMiddleware } from '${metadata.name}/server';
assert.equal(typeof createSatelliteFeedMiddleware(), 'function');` : ''}
assert(Object.keys(renderer).length > 0);
const parent = new Group();
const plugin = ${factory}({ parent,
  projectPosition: (_location, target) => target.set(1, 0, 0),
  ${options}
  getFrame: () => ({ timeMs: 0, displayRadiusM: 2, center: { latitudeDegrees: 0, longitudeDegrees: 0 } }),
});
const viewer = await createSkykitViewer({ plugins: [plugin] });
viewer.frame(0.016);
await new Promise(resolve => setImmediate(resolve));
assert.equal(parent.children.length, 1);
assert.equal(plugin.getSnapshot().active, true);
await viewer.dispose();
assert.equal(parent.children.length, 0);
`;
  writeFileSync(join(directory, "consumer.mjs"), consumer);
  execFileSync(process.execPath, ["consumer.mjs"], { cwd: directory, stdio: "pipe" });
  // Typecheck the installed package declarations through public exports, too.
  writeFileSync(join(directory, "consumer.ts"), consumer.replace("import assert from 'node:assert/strict';", "const assert = Object.assign((value: unknown) => { if (!value) throw new Error(); }, { equal(a: unknown, b: unknown) {} });")
    .replace("await new Promise(resolve => setImmediate(resolve));", "await Promise.resolve();"));
  execFileSync(resolve("node_modules/.bin/tsc"), ["--noEmit", "--strict", "--skipLibCheck", "--module", "NodeNext",
    "--moduleResolution", "NodeNext", "--target", "ES2022", "consumer.ts"], { cwd: directory, stdio: "pipe" });
  console.log(`${metadata.name}: packed model, renderer, plugin lifecycle and declarations passed`);
} catch (error) {
  if (error.stdout) process.stderr.write(error.stdout);
  if (error.stderr) process.stderr.write(error.stderr);
  throw error;
} finally {
  rmSync(directory, { recursive: true, force: true });
}
