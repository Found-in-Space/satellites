import type { OMMJsonObject } from "satellite.js";
import * as THREE from "three";
import { createSatelliteOrbit, sampleSatelliteOrbit, type SatelliteOrbit } from "./orbit.js";
import {
  SATELLITE_GROUPS,
  satelliteGroupConfiguration,
  type SatelliteGroupId,
} from "./satellite-groups.js";

const SATELLITE_SYMBOL_SIZE_M = 0.075;
interface SatelliteGroupMesh {
  readonly mesh: THREE.InstancedMesh;
  satellites: SatelliteOrbit[];
  visible: boolean;
}

const identityRotation = new THREE.Quaternion();
const markerScale = new THREE.Vector3();
const markerPosition = new THREE.Vector3();
const instanceMatrix = new THREE.Matrix4();

export interface GeodeticPosition {
  latitudeDegrees: number;
  longitudeDegrees: number;
  altitudeMetres: number;
}

export interface SatelliteLayerOptions {
  /** Maps geodetic degrees/metres into the supplied parent's normalized body frame. */
  projectPosition(location: GeodeticPosition, target: THREE.Vector3): THREE.Vector3;
  symbolSizeM?: number;
}

function createGroupMesh(color: number, capacity: number): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(
    new THREE.OctahedronGeometry(0.5, 0),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.96,
      depthWrite: false,
    }),
    Math.max(1, capacity),
  );
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.renderOrder = 13;
  mesh.count = 0;
  return mesh;
}

export class SatelliteLayer {
  readonly group = new THREE.Group();
  private readonly groups = new Map<SatelliteGroupId, SatelliteGroupMesh>();

  constructor(private readonly options: SatelliteLayerOptions) {
    this.group.name = "satellites";
    for (const configuration of SATELLITE_GROUPS) {
      const mesh = createGroupMesh(configuration.color, 1);
      mesh.name = `satellites-${configuration.id}`;
      mesh.visible = false;
      this.group.add(mesh);
      this.groups.set(configuration.id, {
        mesh,
        satellites: [],
        visible: false,
      });
    }
  }

  setSatellites(
    group: SatelliteGroupId,
    elements: readonly OMMJsonObject[],
  ): number {
    const current = this.groups.get(group)!;
    const satellites = elements.flatMap((value) => {
      const satellite = createSatelliteOrbit(value);
      return satellite ? [satellite] : [];
    });
    const replacement = createGroupMesh(
      satelliteGroupConfiguration(group).color,
      satellites.length,
    );
    replacement.name = current.mesh.name;
    replacement.visible = current.visible;
    this.group.remove(current.mesh);
    current.mesh.dispose();
    current.mesh.geometry.dispose();
    (current.mesh.material as THREE.Material).dispose();
    this.group.add(replacement);
    this.groups.set(group, {
      mesh: replacement,
      satellites,
      visible: current.visible,
    });
    return satellites.length;
  }

  setGroupVisible(group: SatelliteGroupId, visible: boolean): void {
    const current = this.groups.get(group)!;
    current.visible = visible;
    current.mesh.visible = visible;
    if (!visible) current.mesh.count = 0;
  }

  groupVisible(group: SatelliteGroupId): boolean {
    return this.groups.get(group)!.visible;
  }

  update(
    atMs: number,
    displayRadiusM: number,
  ): void {
    let anyVisible = false;
    for (const current of this.groups.values()) {
      if (current.visible) {
        anyVisible = true;
        break;
      }
    }
    if (!anyVisible) return;
    const symbolScale = (this.options.symbolSizeM ?? SATELLITE_SYMBOL_SIZE_M) / displayRadiusM;
    markerScale.setScalar(symbolScale);
    const claimedCatalogIds = new Set<string>();
    const priority: readonly SatelliteGroupId[] = [
      "stations",
      "science-education",
      "visual",
    ];
    for (const id of priority) {
      const current = this.groups.get(id)!;
      if (!current.visible) continue;
      let count = 0;
      for (const satellite of current.satellites) {
        if (claimedCatalogIds.has(satellite.catalogId)) continue;
        const location = sampleSatelliteOrbit(satellite, atMs);
        if (!location) continue;
        this.options.projectPosition(location, markerPosition);
        instanceMatrix.compose(markerPosition, identityRotation, markerScale);
        current.mesh.setMatrixAt(count, instanceMatrix);
        claimedCatalogIds.add(satellite.catalogId);
        count += 1;
      }
      current.mesh.count = count;
      current.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  dispose(): void {
    this.group.removeFromParent();
    for (const current of this.groups.values()) {
      current.mesh.dispose();
      current.mesh.geometry.dispose();
      (current.mesh.material as THREE.Material).dispose();
    }
    this.groups.clear();
    this.group.clear();
  }

}
