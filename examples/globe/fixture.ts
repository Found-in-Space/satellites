import type { SatelliteGroupLoader } from "@found-in-space/satellites";
export const epochMs = Date.parse("2026-08-07T00:00:00Z");
export const fixtureOrbit = {
  OBJECT_NAME: "SYNTHETIC DEMONSTRATION", OBJECT_ID: "1998-067A",
  EPOCH: "2026-08-07T00:00:00.000000", MEAN_MOTION: 15.5,
  ECCENTRICITY: 0.0001, INCLINATION: 51.6, RA_OF_ASC_NODE: 120,
  ARG_OF_PERICENTER: 80, MEAN_ANOMALY: 20, EPHEMERIS_TYPE: 0,
  CLASSIFICATION_TYPE: "U", NORAD_CAT_ID: 25544, ELEMENT_SET_NO: 999,
  REV_AT_EPOCH: 1, BSTAR: 0.0001, MEAN_MOTION_DOT: 0, MEAN_MOTION_DDOT: 0,
} as const;
export const fixtureLoader: SatelliteGroupLoader = async group => ({
  group, fetchedAtMs: epochMs,
  satellites: Array.from({ length: 12 }, (_, index) => ({
    ...fixtureOrbit, OBJECT_NAME: `SYNTHETIC ${index + 1}`,
    NORAD_CAT_ID: 90000 + index, MEAN_ANOMALY: index * 30,
  })),
});
