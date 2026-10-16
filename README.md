# Satellite object extension

`@found-in-space/satellites` is an independent project extracted from Pas de Géant.
It owns its data/service integration and optional rendering adapters. It uses
SkyKit's existing public plugin contract and can be mounted on a host-owned body.
The main Geant application does not install this extension.

## Run the example

```sh
npm ci
npm run example:dev
```

Open the local URL printed by Vite. The example uses synthetic fixtures without
contacting an external service. It demonstrates installation, visibility actions,
removal and reinstallation. Drag to orbit and scroll to zoom. The host owns the
camera, render loop, body root, clock and page visibility handling.

`npm run example:build` produces a static fixture-capable app in `example-dist/`.
See [architecture and lifecycle](docs/architecture.md).

## Register with a viewer

Both object extensions follow this same process. Import a factory, supply the
host bindings and source, then install the returned object with `viewer.addPlugin`.
No name-based factory registry or core feature flag is needed.

```ts
import { createSatellitePlugin } from '@found-in-space/satellites/skykit';
import { createSatelliteFeed } from '@found-in-space/satellites';
const loadGroup = createSatelliteFeed({ endpoint: 'https://your-host.example/api/satellites' });

const plugin = createSatellitePlugin({
  parent: earthBodyRoot,
  projectPosition, // (geodetic degrees/metres, target Vector3) => body-local Vector3
  loadGroup,
  getFrame: frame => ({
    timeMs: clock.utcMilliseconds(),
    displayRadiusM: presentation.earthRadiusMetres(),
    active: presentation.objectsActive(),
  }),
});
const uninstall = await viewer.addPlugin(plugin);
// Or pass the plugin in createSkykitViewer({ plugins: [plugin] }).
await viewer.actions.invoke('satellites:visibility.set', false);
uninstall();
```

`earthBodyRoot`, `projectPosition`, `clock` and `presentation` are explicit host
bindings in this sketch. The runnable [example](examples/globe/main.ts) supplies
each one. It uses a spherical reference Earth with mean radius 6,371,008.8 m;
a scientific host can supply its own ellipsoid projection. Positions retain
physical heights; symbols are intentionally enlarged for readability.

The root export provides OMM parsing, headless SGP4 models, groups and an injected
HTTP feed loader. `createSatelliteOrbit` and `sampleSatelliteOrbit` produce
geodetic degrees and physical metres without a renderer.
`/three` provides the instanced satellite layer. `/server` provides the optional
Node middleware and CelesTrak loader with per-source request coalescing and a
two-hour cache. It has no imports from Geant's server, voice or origin policy.
The middleware defaults to same-host browser origins; deployments may supply
`allowOrigin`, `path`, `loadGroup`, and `onError` explicitly.

The example Vite server mounts `/api/satellites`. Requests start only after
selecting **Use live feed**. A static production build needs its own compatible
API endpoint. The `stations`, `visual`, and `science-education` groups are
independently selectable; catalog IDs are deduplicated across visible groups.
The controller exposes `setEnabled`, `setGroupEnabled`, `refresh` and
`getSnapshot`. Its actions are `satellites:visibility.set` (boolean) and
`satellites:group.setEnabled` (`{ group, enabled }`). A custom `id` supplies
the action namespace for another installation in the same viewer.

SGP4 is evaluated at the host's chosen UTC `timeMs`; feed refresh uses wall-time
timers. An orbital epoch and a propagation result are predictions with validity
limits, not a claim that an object was observed at the selected time. Elements
are not automatically replaced by historical data when simulation time changes.

## Verify

```sh
npm run typecheck
npm test
npm run test:package
npm run example:build
npm run example:smoke
```

The package check packs the library, installs it in an isolated temporary
consumer, checks headless model imports, runs the actual SkyKit lifecycle, and
typechecks the installed declarations. Its npm installs run offline against the
cache populated by `npm ci`; use the same npm cache for both commands.
No tests call the external service.

Source extraction and license history are recorded in [NOTICE.md](NOTICE.md);
provider attribution is recorded in [sources](docs/sources.md).
