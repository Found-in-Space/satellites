export const SATELLITE_GROUP_IDS = [
  "visual",
  "stations",
  "science-education",
] as const;

export type SatelliteGroupId = typeof SATELLITE_GROUP_IDS[number];

export interface SatelliteGroupConfiguration {
  readonly id: SatelliteGroupId;
  readonly label: string;
  readonly shortLabel: string;
  readonly color: number;
  readonly celestrakGroups: readonly string[];
}

export const SATELLITE_GROUPS: readonly SatelliteGroupConfiguration[] = [
  {
    id: "visual",
    label: "100 brightest",
    shortLabel: "Brightest",
    color: 0xffe59a,
    celestrakGroups: ["visual"],
  },
  {
    id: "stations",
    label: "Space stations",
    shortLabel: "Stations",
    color: 0xff9f7a,
    celestrakGroups: ["stations"],
  },
  {
    id: "science-education",
    label: "Science / education",
    shortLabel: "Science / education",
    color: 0xc5a2ff,
    celestrakGroups: ["science", "education"],
  },
];

const configurations = new Map(
  SATELLITE_GROUPS.map((configuration) => [configuration.id, configuration]),
);
export function isSatelliteGroupId(value: unknown): value is SatelliteGroupId {
  return SATELLITE_GROUP_IDS.includes(value as SatelliteGroupId);
}

export function satelliteGroupConfiguration(
  id: SatelliteGroupId,
): SatelliteGroupConfiguration {
  return configurations.get(id)!;
}
