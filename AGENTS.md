# Agent instructions

- This is an independent object-extension project. Read README.md and docs/architecture.md before substantial changes.
- Use strict TypeScript and compiled ESM with declarations and explicit package exports.
- Keep feed/model APIs separate from Three.js, SkyKit and Node server adapters.
- Use the public SkyKit setup/addPart/action/teardown lifecycle; never import private viewer or Geant application modules.
- Hosts supply the parent body root, coordinate projection, physical scale and clock. Do not own a camera, render loop or navigation policy.
- Construction must not contact services. Inject endpoints and transports; examples use fixtures by default.
- Dispose every owned request, timer, socket, action registration and GPU resource. Ignore obsolete asynchronous results.
- Run npm run typecheck, npm test, npm run test:package and npm run example:build. Tests must use local fixtures and fake transports.
- Keep service credentials, local paths, build output and node_modules out of Git.
