# Architecture and lifecycle

This project is a service/data consumer with optional scene adapters. The root
model/feed API imports neither Three.js nor SkyKit nor a Node server. Explicit
`/three` and `/skykit` exports add rendering and viewer integration.
The `/server` export is Node-only and is never imported by the browser entry.

## Common object extension registration

1. Construct `createSatellitePlugin(options)`. Construction creates no service connection,
   renderer, DOM nodes, timers or camera.
2. Pass the ordinary plugin to `createSkykitViewer({ plugins })`, or install it
   with `await viewer.addPlugin(plugin)` and retain the returned uninstall function.
3. `setup(context)` registers namespaced semantic actions and a lifecycle part
   through `context.addPart`. Part attachment mounts under the supplied parent.
4. Each `update(frame)` asks the host's `getFrame` for time, display radius and
   activity. Active installations acquire their source and update their renderer.
5. Disable/inactivity stops owned acquisition. The host must also signal
   inactivity directly with `setEnabled(false)` when its render loop is paused;
   the example does this on page visibility changes.
6. Uninstall or viewer disposal removes actions and the part, aborts/closes
   acquisition and timers, disposes GPU/canvas resources and ignores late source
   results. Parent roots, renderer, navigation, clock and supplied sources remain
   host-owned. Use one plugin object per viewer. Sources can be shared if they
   implement independent cancellation/subscription ownership.

This is the public SkyKit contract itself. There is no duplicate plugin runtime,
central extension enum, dynamic factory lookup or core import of this project.
Bulk object data flows directly through source/layer interfaces; action/event
registries carry user commands and status rather than per-object frame traffic.

## Body frame and scale contract

`projectPosition(location, target)` receives geodetic latitude/longitude in
**degrees**, and height in **physical metres**. It writes normalized body-local
positions into the supplied Vector3. The borrowed parent uses a uniform scale
of `displayRadiusM` render metres per body-local unit. This value must match the
host presentation each frame. The renderer divides readable symbol sizes by
that display radius; physical positions are transformed exactly once by the
parent. The projection and parent must use the same datum/reference radius.

The local axes are +X at latitude 0/longitude 0, +Y north, -Z at longitude 90 east.
The host can rotate/translate the parent into any scene frame without changing
feed interpretation. Aircraft heading/attitude uses the same geodetic tangent
basis. The example's spherical projection is an explicit simplification and is
not an assertion of WGS84 or terrain accuracy.

`getFrame(frame).timeMs` is a UTC epoch in milliseconds, distinct from SkyKit's
elapsed animation seconds. Satellites may use a simulation clock. A live aircraft
source normally uses wall time; historical playback requires matching recorded
data. Dataset/feed validity, source attribution and representation assumptions
remain visible in host-facing documentation and example status.

## Ownership and verification

Tests exercise these adapters against the actual installed SkyKit viewer,
including two independent viewers, semantic actions, service failures and late
callbacks after removal. Fixtures/fake transports replace external requests.
`test:package` exercises exports and declarations from the packed archive in a
separate consumer, so source aliases or a sibling checkout cannot conceal a
missing runtime dependency. No Geant application modules are imported.
