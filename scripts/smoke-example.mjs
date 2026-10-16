import assert from "node:assert/strict";
import { createServer } from "vite";
const server = await createServer({ configFile: "examples/vite.config.ts", optimizeDeps: { noDiscovery: true, include: [] }, server: { preTransformRequests: false, host: "127.0.0.1", port: 0 } });
try {
  await server.listen();
  const address = server.httpServer.address();
  const base = `http://127.0.0.1:${address.port}`;
  const page = await fetch(base);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Synthetic fixture/);
  const entry = await fetch(`${base}/main.ts`);
  assert.equal(entry.status, 200);
  assert.match(await entry.text(), /viewer.addPlugin/);
  const metadata = JSON.parse(await (await import("node:fs/promises")).readFile("package.json", "utf8"));
  if (metadata.name.endsWith("/satellites")) {
    const response = await fetch(`${base}/api/satellites?group=unknown`);
    assert.equal(response.status, 400);
    await response.json();
  }
  console.log(`${metadata.name}: fixture example and compiled entry served successfully; no live service requested`);
} finally { server.httpServer?.closeAllConnections(); await server.close(); }
