import { afterEach, describe, expect, it, vi } from "vitest";
import { createSkykitViewer, type SkykitViewer } from "@found-in-space/skykit";
import { Group, InstancedMesh, Matrix4, Vector3 } from "three";
import { createSatellitePlugin } from "../src/skykit.js";
import { createSatelliteFeed, parseSatelliteGroupPayload, createSatelliteOrbit, sampleSatelliteOrbit } from "../src/index.js";
import { createSatelliteGroupLoader, createSatelliteFeedMiddleware } from "../src/server.js";
import { fixtureOrbit, epochMs } from "../examples/globe/fixture.js";
import { projectPosition } from "../examples/globe/host.js";

const viewers: SkykitViewer[] = [];
const flush = () => new Promise<void>(resolve => setImmediate(resolve));
async function viewer() { const result = await createSkykitViewer(); viewers.push(result); return result; }
const payload = () => ({ group: "stations" as const, fetchedAtMs: epochMs, satellites: [fixtureOrbit] });
afterEach(async () => { for (const item of viewers.splice(0)) await item.dispose(); vi.useRealTimers(); });

describe("satellite extension through the real public SkyKit lifecycle", () => {
  it("stays inert until a frame, propagates at the host epoch and projects physical metres", async () => {
    const loadGroup = vi.fn(async () => payload());
    const project = vi.fn(projectPosition);
    const parent = new Group(); parent.scale.setScalar(2);
    const plugin = createSatellitePlugin({ parent, projectPosition: project, loadGroup,
      getFrame: () => ({ timeMs: epochMs + 300000, displayRadiusM: 2 }) });
    expect(loadGroup).not.toHaveBeenCalled();
    const host = await viewer();
    const remove = await host.addPlugin(plugin);
    await flush();
    expect(parent.children).toHaveLength(1);
    expect(loadGroup).not.toHaveBeenCalled();
    host.update(0.016);
    await plugin.refresh();
    host.update(0.016);
    expect(plugin.getSnapshot().groups.stations).toMatchObject({ count: 1, status: "ready" });
    expect(project.mock.calls[0]![0].altitudeMetres).toBeGreaterThan(100000);
    const mesh = parent.getObjectByName("satellites-stations") as InstancedMesh;
    expect(mesh.count).toBe(1);
    const matrix = new Matrix4(); mesh.getMatrixAt(0, matrix);
    expect(new Vector3().setFromMatrixPosition(matrix).length()).toBeGreaterThan(1);
    const disposeGeometry = vi.spyOn(mesh.geometry, "dispose");
    remove();
    await flush();
    expect(parent.children).toHaveLength(0);
    expect(disposeGeometry).toHaveBeenCalledOnce();
    expect(host.actions.listActions().some(action => action.id.startsWith("satellites:"))).toBe(false);
  });

  it("aborts requests on disable and ignores late results even from a source that ignores abort", async () => {
    let finish!: (value: ReturnType<typeof payload>) => void;
    let signal!: AbortSignal;
    const parent = new Group();
    const plugin = createSatellitePlugin({ parent, projectPosition,
      loadGroup: (_group, abort) => { signal = abort!; return new Promise(resolve => { finish = resolve; }); },
      getFrame: () => ({ timeMs: epochMs, displayRadiusM: 2 }),
    });
    const host = await viewer(); await host.addPlugin(plugin); await flush(); host.update(); await flush();
    await host.actions.invoke("satellites:visibility.set", false);
    expect(signal.aborted).toBe(true);
    finish(payload()); await flush();
    expect(plugin.getSnapshot().groups.stations).toMatchObject({ count: 0, status: "stopped" });
    expect(parent.children[0]!.visible).toBe(false);
  });

  it("refreshes on its own schedule and releases timers on removal", async () => {
    vi.useFakeTimers();
    const loadGroup = vi.fn(async () => payload());
    const plugin = createSatellitePlugin({ parent: new Group(), projectPosition, loadGroup, refreshIntervalMs: 1000,
      getFrame: () => ({ timeMs: epochMs, displayRadiusM: 2 }) });
    const host = await viewer(); const remove = await host.addPlugin(plugin);
    host.update(); await plugin.refresh();
    expect(loadGroup).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1000);
    expect(loadGroup).toHaveBeenCalledTimes(2);
    remove();
    await vi.advanceTimersByTimeAsync(5000);
    expect(loadGroup).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("isolates two viewers and keeps service failures local", async () => {
    const first = await viewer(); const second = await viewer();
    const a = createSatellitePlugin({ parent: new Group(), projectPosition, loadGroup: async () => payload(),
      getFrame: () => ({ timeMs: epochMs, displayRadiusM: 2 }) });
    const b = createSatellitePlugin({ parent: new Group(), projectPosition,
      loadGroup: async () => { throw new Error("offline"); },
      getFrame: () => ({ timeMs: epochMs, displayRadiusM: 2 }) });
    await first.addPlugin(a); await second.addPlugin(b);
    first.update(); second.update(); await Promise.all([a.refresh(), b.refresh()]);
    await first.actions.invoke("satellites:visibility.set", false);
    expect(a.getSnapshot().enabled).toBe(false);
    expect(b.getSnapshot().enabled).toBe(true);
    expect(b.getSnapshot().groups.stations).toMatchObject({ status: "error", error: "offline" });
    expect(() => second.frame()).not.toThrow();
  });
});

describe("replaceable feeds and independently hosted service", () => {
  it("propagates orbital models without a renderer or viewer", () => {
    const orbit = createSatelliteOrbit(fixtureOrbit)!;
    const initial = sampleSatelliteOrbit(orbit, epochMs)!;
    const later = sampleSatelliteOrbit(orbit, epochMs + 300000)!;
    expect(initial.altitudeMetres).toBeGreaterThan(100000);
    expect(Math.abs(initial.latitudeDegrees)).toBeLessThanOrEqual(90);
    expect(later.longitudeDegrees).not.toBeCloseTo(initial.longitudeDegrees);
  });

  it("uses the configured endpoint, passes abort and rejects mismatched groups", async () => {
    const request = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(payload())));
    const feed = createSatelliteFeed({ endpoint: "https://feed.example/orbits?key=public", fetch: request });
    const controller = new AbortController();
    await feed("stations", controller.signal);
    expect(String(request.mock.calls[0]![0])).toBe("https://feed.example/orbits?key=public&group=stations");
    expect(request.mock.calls[0]![1]?.signal).toBe(controller.signal);
    await expect(feed("visual")).rejects.toThrow("wrong group");
    expect(parseSatelliteGroupPayload({ ...payload(), satellites: [fixtureOrbit, {}] }).satellites).toHaveLength(1);
  });

  it("coalesces concurrent CelesTrak loads, deduplicates groups and refreshes cached evidence", async () => {
    let now = 1000;
    const request = vi.fn<typeof fetch>(async input => {
      const science = new URL(String(input)).searchParams.get("GROUP") === "SCIENCE";
      return new Response(JSON.stringify([fixtureOrbit,
        { ...fixtureOrbit, NORAD_CAT_ID: science ? 1 : 2 }]));
    });
    const load = createSatelliteGroupLoader(request, () => now);
    const [a, b] = await Promise.all([load("science-education"), load("science-education")]);
    expect(a).toEqual(b); expect(a.satellites).toHaveLength(3); expect(request).toHaveBeenCalledTimes(2);
    now += 7200001;
    await load("science-education"); expect(request).toHaveBeenCalledTimes(4);
  });

  it("routes and enforces method/origin/group without any Geant service imports", async () => {
    const loadGroup = vi.fn(async () => payload());
    const middleware = createSatelliteFeedMiddleware({ loadGroup });
    const run = async (url: string, method = "GET", origin?: string) => {
      const response = { statusCode: 200, setHeader: vi.fn(), end: vi.fn() };
      const next = vi.fn();
      await middleware({ url, method, headers: { host: "localhost:5173", origin } } as never, response as never, next);
      return { response, next };
    };
    expect((await run("/other")).next).toHaveBeenCalledOnce();
    expect((await run("/api/satellites?group=stations", "POST")).response.statusCode).toBe(405);
    expect((await run("/api/satellites?group=stations", "GET", "https://elsewhere.example")).response.statusCode).toBe(403);
    expect((await run("/api/satellites?group=unknown")).response.statusCode).toBe(400);
    const result = await run("/api/satellites?group=stations", "GET", "http://localhost:5173");
    expect(result.response.statusCode).toBe(200); expect(loadGroup).toHaveBeenCalledOnce();
    expect(JSON.parse(result.response.end.mock.calls[0]![0] as string).satellites).toHaveLength(1);
  });
});
