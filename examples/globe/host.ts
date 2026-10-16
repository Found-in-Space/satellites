import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { createSkykitViewer } from "@found-in-space/skykit";

export const referenceRadiusM = 6_371_008.8;
export const displayRadiusM = 2;

/** Deliberately simple spherical reference body; a host can substitute WGS84/terrain here. */
export function projectPosition(location: { latitudeDegrees: number; longitudeDegrees: number; altitudeMetres: number }, target: THREE.Vector3): THREE.Vector3 {
  const latitude = location.latitudeDegrees * Math.PI / 180;
  const longitude = location.longitudeDegrees * Math.PI / 180;
  return target.set(Math.cos(latitude) * Math.cos(longitude), Math.sin(latitude),
    -Math.cos(latitude) * Math.sin(longitude)).multiplyScalar(1 + location.altitudeMetres / referenceRadiusM);
}

export async function createExampleHost() {
  const host = document.querySelector<HTMLDivElement>("#viewer")!;
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  const camera = new THREE.PerspectiveCamera(45, 1, 0.001, 100);
  camera.position.set(4, 3, 4);
  host.appendChild(renderer.domElement);
  const viewer = await createSkykitViewer({ renderer, camera });
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  const bodyRoot = new THREE.Group();
  bodyRoot.scale.setScalar(displayRadiusM);
  viewer.contentRoot.add(bodyRoot);
  const geometry = new THREE.SphereGeometry(1, 64, 32);
  const material = new THREE.MeshBasicMaterial({ color: 0x12334c });
  const globe = new THREE.Mesh(geometry, material);
  bodyRoot.add(globe);
  const gridGeometry = new THREE.SphereGeometry(1.0001, 36, 18);
  const gridMaterial = new THREE.MeshBasicMaterial({ color: 0x2f627b, wireframe: true, transparent: true, opacity: 0.4 });
  bodyRoot.add(new THREE.Mesh(gridGeometry, gridMaterial));
  const resize = new ResizeObserver(() => viewer.resize({ width: host.clientWidth, height: host.clientHeight }));
  resize.observe(host);
  let previous = performance.now();
  renderer.setAnimationLoop(now => {
    controls.update();
    viewer.frame((now - previous) / 1000);
    previous = now;
  });
  return {
    viewer, bodyRoot,
    async dispose() {
      renderer.setAnimationLoop(null);
      resize.disconnect();
      controls.dispose();
      await viewer.dispose();
      geometry.dispose(); material.dispose(); gridGeometry.dispose(); gridMaterial.dispose();
      bodyRoot.removeFromParent();
      renderer.domElement.remove();
      renderer.dispose();
    },
  };
}
