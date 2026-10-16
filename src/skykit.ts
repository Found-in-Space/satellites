import type { Object3D } from "three";
import type { SkykitPlugin, SkykitThreeFrame } from "@found-in-space/skykit";
import { SatelliteLayer, type SatelliteLayerOptions } from "./satellite-layer.js";
import { type SatelliteGroupLoader, SATELLITE_REFRESH_INTERVAL_MS } from "./satellite-feed.js";
import { SATELLITE_GROUP_IDS, isSatelliteGroupId, type SatelliteGroupId } from "./satellite-groups.js";

export interface SatellitePluginOptions extends SatelliteLayerOptions {
  id?: string;
  /** Borrowed parent. Its scale maps normalized body positions into render metres. */
  parent: Object3D;
  loadGroup: SatelliteGroupLoader;
  getFrame(frame: SkykitThreeFrame): { timeMs: number; displayRadiusM: number; active?: boolean };
  groups?: readonly SatelliteGroupId[];
  enabled?: boolean;
  refreshIntervalMs?: number;
}

export interface SatelliteSnapshot {
  enabled: boolean;
  active: boolean;
  groups: Record<SatelliteGroupId, { enabled: boolean; count: number; status: string; error?: string }>;
}

export interface SatellitePlugin extends SkykitPlugin {
  setEnabled(enabled: boolean): void;
  setGroupEnabled(group: SatelliteGroupId, enabled: boolean): void;
  refresh(): Promise<void>;
  getSnapshot(): SatelliteSnapshot;
}

/** Ordinary SkyKit plugin: no registry, camera, render loop or service side effects at construction. */
export function createSatellitePlugin(options: SatellitePluginOptions): SatellitePlugin {
  const id = options.id ?? "satellites";
  let enabled = options.enabled ?? true;
  const selected = new Set(options.groups ?? ["stations"]);
  let runtime: { sync(): void; refresh(): Promise<void>; snapshot(): SatelliteSnapshot } | undefined;
  return {
    id,
    setEnabled(value) { enabled = value; runtime?.sync(); },
    setGroupEnabled(group, value) {
      if (!isSatelliteGroupId(group)) throw new Error("Unknown satellite group.");
      if (value) selected.add(group); else selected.delete(group);
      runtime?.sync();
    },
    refresh: () => runtime?.refresh() ?? Promise.resolve(),
    getSnapshot: () => runtime?.snapshot() ?? {
      enabled, active: false,
      groups: Object.fromEntries(SATELLITE_GROUP_IDS.map(group => [group,
        { enabled: selected.has(group), count: 0, status: "stopped" }])) as SatelliteSnapshot["groups"],
    },
    setup(context) {
      if (runtime) throw new Error("Create a separate satellite plugin for each viewer.");
      const layer = new SatelliteLayer(options);
      let active = false;
      let disposed = false;
      const states = new Map(SATELLITE_GROUP_IDS.map(group => [group, {
        count: 0, status: "stopped", error: undefined as string | undefined,
        request: undefined as AbortController | undefined,
        pending: undefined as Promise<void> | undefined,
        timer: undefined as ReturnType<typeof setTimeout> | undefined,
        running: false,
      }]));
      const shouldRun = (group: SatelliteGroupId) => !disposed && active && enabled && selected.has(group);
      function stop(group: SatelliteGroupId): void {
        const state = states.get(group)!;
        state.running = false;
        if (state.timer !== undefined) clearTimeout(state.timer);
        state.timer = undefined;
        state.request?.abort();
        state.request = undefined;
        state.pending = undefined;
        state.status = "stopped";
        layer.setGroupVisible(group, false);
      }
      function load(group: SatelliteGroupId): Promise<void> {
        const state = states.get(group)!;
        if (!shouldRun(group)) return Promise.resolve();
        if (state.pending) return state.pending;
        if (state.timer !== undefined) clearTimeout(state.timer);
        state.timer = undefined;
        const request = new AbortController();
        state.request = request;
        state.status = "loading";
        state.error = undefined;
        const pending = Promise.resolve().then(() => options.loadGroup(group, request.signal)).then(payload => {
          if (state.request !== request || !shouldRun(group)) return;
          if (payload.group !== group) throw new Error("Satellite source returned the wrong group.");
          state.count = layer.setSatellites(group, payload.satellites);
          state.status = "ready";
        }).catch((error: unknown) => {
          if (state.request !== request || request.signal.aborted) return;
          state.status = "error";
          state.error = error instanceof Error ? error.message : String(error);
        }).finally(() => {
          if (state.request !== request) return;
          state.request = undefined;
          state.pending = undefined;
          if (shouldRun(group)) state.timer = setTimeout(() => {
            state.timer = undefined;
            void load(group);
          }, options.refreshIntervalMs ?? SATELLITE_REFRESH_INTERVAL_MS);
        });
        state.pending = pending;
        return pending;
      }
      const installation = {
        sync() {
          layer.group.visible = active && enabled;
          for (const group of SATELLITE_GROUP_IDS) {
            const state = states.get(group)!;
            if (!shouldRun(group)) stop(group);
            else {
              layer.setGroupVisible(group, true);
              if (!state.running) {
                state.running = true;
                void load(group);
              }
            }
          }
        },
        async refresh() { await Promise.all(SATELLITE_GROUP_IDS.map(load)); },
        snapshot(): SatelliteSnapshot {
          return {
            enabled, active: active && enabled && !disposed,
            groups: Object.fromEntries(SATELLITE_GROUP_IDS.map(group => {
              const state = states.get(group)!;
              return [group, { enabled: selected.has(group), count: state.count,
                status: state.status, ...(state.error ? { error: state.error } : {}) }];
            })) as SatelliteSnapshot["groups"],
          };
        },
      };
      runtime = installation;
      const unregister = context.actions.registerAction(`${id}:visibility.set`, ({ payload }) => {
        if (typeof payload !== "boolean") throw new Error("Visibility requires a boolean.");
        enabled = payload;
        installation.sync();
      });
      const unregisterGroup = context.actions.registerAction(`${id}:group.setEnabled`, ({ payload }) => {
        const value = payload as { group?: unknown; enabled?: unknown } | undefined;
        if (!isSatelliteGroupId(value?.group) || typeof value?.enabled !== "boolean") {
          throw new Error("Satellite group action requires group and boolean enabled.");
        }
        if (value.enabled) selected.add(value.group); else selected.delete(value.group);
        installation.sync();
      });
      function dispose(): void {
        if (disposed) return;
        disposed = true;
        for (const group of SATELLITE_GROUP_IDS) stop(group);
        unregister();
        unregisterGroup();
        layer.dispose();
        if (runtime === installation) runtime = undefined;
      }
      const removePart = context.addPart({
        id, object3d: layer.group,
        attach() { options.parent.add(layer.group); },
        update(frame) {
          const presentation = options.getFrame(frame);
          active = presentation.active ?? true;
          installation.sync();
          if (active && enabled) layer.update(presentation.timeMs, presentation.displayRadiusM);
        },
        detach() { layer.group.removeFromParent(); },
        dispose,
        getSnapshot: installation.snapshot,
      });
      return () => { dispose(); removePart(); };
    },
  };
}
