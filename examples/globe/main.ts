import { createSatellitePlugin } from "@found-in-space/satellites/skykit";
import { createSatelliteFeed, type SatelliteGroupId, type SatelliteGroupLoader } from "@found-in-space/satellites";
import { createExampleHost, displayRadiusM, projectPosition } from "./host.js";
import { epochMs, fixtureLoader } from "./fixture.js";
const host = await createExampleHost();
const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
let plugin: ReturnType<typeof createSatellitePlugin>;
let remove: (() => void) | undefined;
let live = false;
let enabled = true;
const started = performance.now();
async function install(loadGroup: SatelliteGroupLoader) {
  remove?.();
  plugin = createSatellitePlugin({ enabled: enabled && !document.hidden, parent: host.bodyRoot, projectPosition, loadGroup,
    groups: [element<HTMLSelectElement>("group").value as SatelliteGroupId],
    getFrame: () => ({ displayRadiusM, active: !document.hidden,
      timeMs: live ? Date.now() : epochMs + (performance.now() - started) * 30 }),
  });
  remove = await host.viewer.addPlugin(plugin);
  element("toggle").textContent = enabled ? "Hide objects" : "Show objects";
}
await install(fixtureLoader);
element("toggle").onclick = () => {
  enabled = !enabled;
  void host.viewer.actions.invoke("satellites:visibility.set", enabled && !document.hidden);
  element("toggle").textContent = enabled ? "Hide objects" : "Show objects";
};
element("remove").onclick = () => { remove?.(); remove = undefined; };
element("fixture").onclick = () => {
  live = false;
  element("source").textContent = "Synthetic fixture. Spherical reference Earth; illustrative symbol sizes.";
  void install(fixtureLoader);
};
element("live").onclick = () => {
  live = true;
  element("source").textContent = "Live CelesTrak orbital elements propagated at wall time. Predictions depend on element epoch.";
  void install(createSatelliteFeed({ endpoint: new URL(element<HTMLInputElement>("endpoint").value, location.href).href }));
};
element("group").onchange = () => {
  for (const group of ["stations", "visual", "science-education"] as const)
    plugin.setGroupEnabled(group, group === element<HTMLSelectElement>("group").value);
};
document.addEventListener("visibilitychange", () => plugin.setEnabled(enabled && !document.hidden));
const statusTimer = setInterval(() => { element("status").textContent = JSON.stringify(plugin.getSnapshot(), null, 2); }, 500);
window.addEventListener("pagehide", () => { clearInterval(statusTimer); remove?.(); void host.dispose(); }, { once: true });
