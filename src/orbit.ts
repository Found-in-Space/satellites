import { eciToGeodetic, gstime, json2satrec, propagate, type OMMJsonObject, type SatRec } from "satellite.js";

export interface SatellitePosition {
  latitudeDegrees: number;
  longitudeDegrees: number;
  altitudeMetres: number;
}

export interface SatelliteOrbit {
  readonly catalogId: string;
  readonly name: string;
  readonly record: SatRec;
}

export function createSatelliteOrbit(elements: OMMJsonObject): SatelliteOrbit | undefined {
  try {
    const record = json2satrec(elements);
    if (record.error !== 0) return undefined;
    return { catalogId: String(elements.NORAD_CAT_ID), name: elements.OBJECT_NAME.trim(), record };
  } catch { return undefined; }
}

/** Headless SGP4 prediction. Outputs geodetic degrees and physical metres. */
export function sampleSatelliteOrbit(orbit: SatelliteOrbit, timeMs: number): SatellitePosition | undefined {
  const date = new Date(timeMs);
  const state = propagate(orbit.record, date);
  if (!state || !state.position || !Number.isFinite(state.position.x + state.position.y + state.position.z)) return undefined;
  const position = eciToGeodetic(state.position, gstime(date));
  return {
    latitudeDegrees: position.latitude * 180 / Math.PI,
    longitudeDegrees: position.longitude * 180 / Math.PI,
    altitudeMetres: position.height * 1000,
  };
}
