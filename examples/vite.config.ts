import { defineConfig } from "vite";
import { createSatelliteFeedMiddleware } from "@found-in-space/satellites/server";
export default defineConfig({
  root: new URL("./globe", import.meta.url).pathname,
  resolve: { dedupe: ["three"] },
  plugins: [{ name: "satellite-example-feed", configureServer(server) {
    server.middlewares.use(createSatelliteFeedMiddleware());
  }}],
  build: { outDir: "../../example-dist", emptyOutDir: true },
});
