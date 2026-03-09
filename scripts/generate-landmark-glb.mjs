import fs from 'fs/promises';
import path from 'path';
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

const OUT_DIR = path.resolve('P.A.T.H/mainHub/assets/landmarks');

const MAT_STONE = new THREE.MeshStandardMaterial({ color: 0x8f96a3, roughness: 0.88, metalness: 0.05 });
const MAT_ROOF = new THREE.MeshStandardMaterial({ color: 0x6a4a38, roughness: 0.9, metalness: 0.02 });
const MAT_GLASS = new THREE.MeshStandardMaterial({ color: 0x77acd8, roughness: 0.25, metalness: 0.18, transparent: true, opacity: 0.9 });
const MAT_ACCENT = new THREE.MeshStandardMaterial({ color: 0x355ea8, roughness: 0.5, metalness: 0.16 });
const MAT_BRONZE = new THREE.MeshStandardMaterial({ color: 0xb08962, roughness: 0.6, metalness: 0.25 });

function add(group, geo, mat, x, y, z) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  group.add(m);
  return m;
}

function addWindowGrid(group, cx, cy, cz, cols, rows, dx, dy, color = 0x9eb9e4) {
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const winMat = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.2,
        metalness: 0.25,
        emissive: 0x142441,
        emissiveIntensity: 0.35,
      });
      add(
        group,
        new THREE.BoxGeometry(0.45, 0.6, 0.12),
        winMat,
        cx + (c - (cols - 1) / 2) * dx,
        cy + (r - (rows - 1) / 2) * dy,
        cz,
      );
    }
  }
}

function buildSnu() {
  const g = new THREE.Group();

  const graniteMat = new THREE.MeshStandardMaterial({ color: 0x848e9c, roughness: 0.9, metalness: 0.04 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0xc2c8d1, roughness: 0.72, metalness: 0.08 });
  const darkStoneMat = new THREE.MeshStandardMaterial({ color: 0x596170, roughness: 0.88, metalness: 0.05 });
  const logoMat = new THREE.MeshStandardMaterial({ color: 0x2f63b3, roughness: 0.4, metalness: 0.2 });

  // Terraced podium and front stair - adds a strong campus gateway silhouette.
  add(g, new THREE.BoxGeometry(13.5, 1.2, 8.8), graniteMat, 0, 0.6, 0.4);
  add(g, new THREE.BoxGeometry(11.8, 0.9, 7.3), graniteMat, 0, 1.55, 0.9);
  add(g, new THREE.BoxGeometry(9.6, 0.7, 5.8), graniteMat, 0, 2.35, 1.25);
  add(g, new THREE.BoxGeometry(8.2, 0.55, 4.8), trimMat, 0, 2.95, 1.45);

  for (let i = 0; i < 6; i += 1) {
    add(g, new THREE.BoxGeometry(8.4 - i * 0.7, 0.22, 0.62), trimMat, 0, 0.14 + i * 0.22, 4.85 + i * 0.18);
  }

  // SNU gate style front beam with pylons.
  add(g, new THREE.BoxGeometry(10.2, 1.05, 1.25), darkStoneMat, 0, 3.7, 4.6);
  add(g, new THREE.BoxGeometry(1.25, 3.1, 1.25), darkStoneMat, -4.7, 2.45, 4.6);
  add(g, new THREE.BoxGeometry(1.25, 3.1, 1.25), darkStoneMat, 4.7, 2.45, 4.6);
  add(g, new THREE.BoxGeometry(0.5, 3.9, 0.5), trimMat, -5.35, 2.85, 4.7);
  add(g, new THREE.BoxGeometry(0.5, 3.9, 0.5), trimMat, 5.35, 2.85, 4.7);

  // Main academic massing with vertical articulation.
  add(g, new THREE.BoxGeometry(7.6, 4.8, 4.4), MAT_STONE, 0, 5.2, 0.45);
  add(g, new THREE.BoxGeometry(5.9, 3.4, 3.4), MAT_STONE, 0, 8.6, 0.1);
  add(g, new THREE.BoxGeometry(4.4, 2.5, 2.5), MAT_STONE, 0, 11.3, -0.1);

  // Side buttresses for a less blocky and more civic-monument profile.
  add(g, new THREE.BoxGeometry(1.15, 5.2, 3.8), darkStoneMat, -3.75, 5.3, 0.75);
  add(g, new THREE.BoxGeometry(1.15, 5.2, 3.8), darkStoneMat, 3.75, 5.3, 0.75);
  add(g, new THREE.BoxGeometry(0.9, 3.2, 2.2), trimMat, -3.65, 8.25, 0.2);
  add(g, new THREE.BoxGeometry(0.9, 3.2, 2.2), trimMat, 3.65, 8.25, 0.2);

  // Roof cap and antenna-like crown.
  add(g, new THREE.ConeGeometry(2.35, 2.0, 14), MAT_ROOF, 0, 13.5, -0.1);
  add(g, new THREE.CylinderGeometry(0.18, 0.2, 1.45, 8), trimMat, 0, 14.95, -0.1);

  // Colonnade front rhythm.
  for (let i = -3; i <= 3; i += 1) {
    add(g, new THREE.CylinderGeometry(0.2, 0.2, 2.35, 8), trimMat, i * 0.95, 3.95, 2.62);
  }

  // Stylized SNU "sha" sculpture motif: dual rings + spine.
  const ringA = add(g, new THREE.TorusGeometry(1.9, 0.22, 12, 40), logoMat, -0.82, 7.35, 3.05);
  ringA.rotation.x = Math.PI / 2;
  ringA.rotation.y = Math.PI * 0.2;
  const ringB = add(g, new THREE.TorusGeometry(1.55, 0.22, 12, 40), logoMat, 0.92, 7.35, 3.05);
  ringB.rotation.x = Math.PI / 2;
  ringB.rotation.y = -Math.PI * 0.22;
  add(g, new THREE.BoxGeometry(0.45, 3.6, 0.4), logoMat, 0, 7.25, 3.15);
  add(g, new THREE.BoxGeometry(2.35, 0.45, 0.35), logoMat, 0, 6.05, 3.25);

  // Fenestration to avoid toy-like surfaces.
  addWindowGrid(g, 0, 5.2, 2.7, 6, 3, 1.0, 1.0, 0x9cb9e4);
  addWindowGrid(g, 0, 8.75, 1.9, 5, 2, 0.95, 0.95, 0xa8c2e9);
  addWindowGrid(g, 0, 11.15, 1.25, 3, 1, 0.9, 0.8, 0xb6caec);

  return g;
}

function buildYonsei() {
  const g = new THREE.Group();
  const gothicStone = new THREE.MeshStandardMaterial({ color: 0x7f8793, roughness: 0.9, metalness: 0.04 });
  const limestone = new THREE.MeshStandardMaterial({ color: 0xc4c9d1, roughness: 0.74, metalness: 0.06 });
  const slateRoof = new THREE.MeshStandardMaterial({ color: 0x4a4f59, roughness: 0.88, metalness: 0.03 });
  const bronzeCross = new THREE.MeshStandardMaterial({ color: 0xa7865f, roughness: 0.5, metalness: 0.32 });

  // Base terrace and front apron.
  add(g, new THREE.BoxGeometry(13.2, 1.1, 7.4), gothicStone, 0, 0.55, 0.5);
  add(g, new THREE.BoxGeometry(11.6, 0.7, 6.0), limestone, 0, 1.45, 0.95);

  // Main hall body.
  add(g, new THREE.BoxGeometry(8.6, 5.4, 4.4), MAT_STONE, 0, 4.2, -0.2);
  add(g, new THREE.BoxGeometry(7.0, 2.2, 3.8), MAT_STONE, 0, 7.8, -0.35);

  // Twin front towers.
  add(g, new THREE.BoxGeometry(2.25, 9.0, 2.25), gothicStone, -3.5, 5.3, 1.1);
  add(g, new THREE.BoxGeometry(2.25, 9.0, 2.25), gothicStone, 3.5, 5.3, 1.1);
  add(g, new THREE.ConeGeometry(1.45, 2.8, 8), slateRoof, -3.5, 11.2, 1.1);
  add(g, new THREE.ConeGeometry(1.45, 2.8, 8), slateRoof, 3.5, 11.2, 1.1);

  // Central gable roof and ridge spine.
  add(g, new THREE.ConeGeometry(2.55, 2.0, 4), slateRoof, 0, 9.3, 1.35).rotation.y = Math.PI * 0.25;
  add(g, new THREE.BoxGeometry(4.2, 0.2, 0.25), limestone, 0, 9.75, 1.35);

  // Gothic arch portal (layered arches).
  const archOuter = add(g, new THREE.TorusGeometry(1.85, 0.22, 10, 28, Math.PI), limestone, 0, 4.2, 2.18);
  archOuter.rotation.x = Math.PI / 2;
  const archInner = add(g, new THREE.TorusGeometry(1.35, 0.16, 10, 24, Math.PI), gothicStone, 0, 4.2, 2.3);
  archInner.rotation.x = Math.PI / 2;
  add(g, new THREE.BoxGeometry(3.8, 2.6, 0.35), gothicStone, 0, 2.9, 2.22);
  add(g, new THREE.BoxGeometry(0.38, 2.9, 0.35), limestone, -1.72, 3.12, 2.24);
  add(g, new THREE.BoxGeometry(0.38, 2.9, 0.35), limestone, 1.72, 3.12, 2.24);

  // Vertical buttresses on facade.
  for (let i = -3; i <= 3; i += 1) {
    if (i === 0) continue;
    add(g, new THREE.BoxGeometry(0.32, 3.6, 0.42), limestone, i * 0.95, 5.0, 2.05);
  }

  // Narrow gothic windows.
  addWindowGrid(g, -3.5, 6.1, 2.28, 1, 4, 0.6, 1.15, 0xb5c3dc);
  addWindowGrid(g, 3.5, 6.1, 2.28, 1, 4, 0.6, 1.15, 0xb5c3dc);
  addWindowGrid(g, 0, 5.8, 2.2, 5, 3, 1.0, 1.05, 0xa9bcd9);

  // Crest/cross motifs for identity.
  add(g, new THREE.BoxGeometry(0.22, 1.0, 0.18), bronzeCross, -3.5, 12.55, 1.1);
  add(g, new THREE.BoxGeometry(0.6, 0.2, 0.18), bronzeCross, -3.5, 12.25, 1.1);
  add(g, new THREE.BoxGeometry(0.22, 1.0, 0.18), bronzeCross, 3.5, 12.55, 1.1);
  add(g, new THREE.BoxGeometry(0.6, 0.2, 0.18), bronzeCross, 3.5, 12.25, 1.1);

  // Front steps.
  for (let s = 0; s < 5; s += 1) {
    add(g, new THREE.BoxGeometry(4.8 - s * 0.42, 0.18, 0.45), limestone, 0, 0.22 + s * 0.18, 3.15 + s * 0.12);
  }

  return g;
}

function buildKorea() {
  const g = new THREE.Group();
  const granite = new THREE.MeshStandardMaterial({ color: 0x807a77, roughness: 0.9, metalness: 0.04 });
  const limestone = new THREE.MeshStandardMaterial({ color: 0xc4b7b0, roughness: 0.75, metalness: 0.06 });
  const crimsonRoof = new THREE.MeshStandardMaterial({ color: 0x772a33, roughness: 0.86, metalness: 0.04 });
  const darkRoof = new THREE.MeshStandardMaterial({ color: 0x5f1f28, roughness: 0.88, metalness: 0.03 });
  const crestMat = new THREE.MeshStandardMaterial({ color: 0x8a1f2d, roughness: 0.45, metalness: 0.22 });

  // Podium and stairs.
  add(g, new THREE.BoxGeometry(14.0, 1.2, 8.0), granite, 0, 0.6, 0.5);
  add(g, new THREE.BoxGeometry(12.0, 0.75, 6.5), limestone, 0, 1.55, 0.95);
  for (let s = 0; s < 6; s += 1) {
    add(g, new THREE.BoxGeometry(6.0 - s * 0.48, 0.2, 0.5), limestone, 0, 0.2 + s * 0.2, 3.45 + s * 0.12);
  }

  // Symmetric wing blocks.
  add(g, new THREE.BoxGeometry(4.9, 3.8, 3.5), MAT_STONE, -3.7, 3.5, 0.1);
  add(g, new THREE.BoxGeometry(4.9, 3.8, 3.5), MAT_STONE, 3.7, 3.5, 0.1);
  add(g, new THREE.BoxGeometry(9.8, 2.6, 3.4), MAT_STONE, 0, 2.8, 0.1);

  // Central main tower mass.
  add(g, new THREE.BoxGeometry(3.8, 8.7, 3.2), granite, 0, 6.3, -0.35);
  add(g, new THREE.BoxGeometry(3.1, 2.2, 2.6), granite, 0, 11.7, -0.55);

  // Characteristic red roof hierarchy.
  add(g, new THREE.ConeGeometry(2.8, 2.6, 4), crimsonRoof, 0, 12.9, -0.45).rotation.y = Math.PI * 0.25;
  add(g, new THREE.ConeGeometry(1.85, 1.8, 4), darkRoof, 0, 14.8, -0.45).rotation.y = Math.PI * 0.25;
  add(g, new THREE.ConeGeometry(1.55, 1.5, 4), crimsonRoof, -3.7, 6.0, 0.25).rotation.y = Math.PI * 0.25;
  add(g, new THREE.ConeGeometry(1.55, 1.5, 4), crimsonRoof, 3.7, 6.0, 0.25).rotation.y = Math.PI * 0.25;

  // Portico + arch entry.
  const archOuter = add(g, new THREE.TorusGeometry(1.7, 0.2, 10, 28, Math.PI), limestone, 0, 4.2, 2.05);
  archOuter.rotation.x = Math.PI / 2;
  add(g, new THREE.BoxGeometry(3.6, 2.6, 0.32), granite, 0, 2.9, 2.03);
  add(g, new THREE.BoxGeometry(0.32, 2.7, 0.3), limestone, -1.65, 3.0, 2.06);
  add(g, new THREE.BoxGeometry(0.32, 2.7, 0.3), limestone, 1.65, 3.0, 2.06);

  // Vertical stone fins and window rhythms.
  for (let i = -4; i <= 4; i += 1) {
    if (i === 0) continue;
    add(g, new THREE.BoxGeometry(0.23, 2.3, 0.28), limestone, i * 0.95, 4.2, 1.9);
  }
  addWindowGrid(g, 0, 6.7, 1.7, 5, 4, 0.95, 1.0, 0xcfbdb7);
  addWindowGrid(g, -3.7, 3.9, 1.75, 3, 2, 0.95, 1.05, 0xd3c2bc);
  addWindowGrid(g, 3.7, 3.9, 1.75, 3, 2, 0.95, 1.05, 0xd3c2bc);

  // Crest and pinnacle to emphasize iconic tower silhouette.
  add(g, new THREE.CylinderGeometry(0.2, 0.24, 1.1, 8), crestMat, 0, 15.85, -0.45);
  add(g, new THREE.BoxGeometry(0.75, 0.18, 0.2), crestMat, 0, 15.55, -0.45);

  return g;
}

function buildKaist() {
  const g = new THREE.Group();
  const steelMat = new THREE.MeshStandardMaterial({ color: 0x667485, roughness: 0.38, metalness: 0.72 });
  const darkSteel = new THREE.MeshStandardMaterial({ color: 0x4f5966, roughness: 0.45, metalness: 0.68 });
  const atriumGlass = new THREE.MeshStandardMaterial({ color: 0x71b8e8, roughness: 0.16, metalness: 0.2, transparent: true, opacity: 0.86 });
  const accentCyan = new THREE.MeshStandardMaterial({ color: 0x00a9d6, roughness: 0.35, metalness: 0.28 });

  // Platform and stepped plinth.
  add(g, new THREE.BoxGeometry(13.0, 0.95, 7.6), darkSteel, 0, 0.48, 0.35);
  add(g, new THREE.BoxGeometry(10.8, 0.55, 6.0), steelMat, 0, 1.3, 0.72);
  add(g, new THREE.BoxGeometry(8.6, 0.4, 4.8), steelMat, 0, 1.8, 1.0);

  // Twin glass towers with offset cores.
  add(g, new THREE.BoxGeometry(2.6, 9.4, 2.6), MAT_GLASS, -3.1, 6.05, 0.2);
  add(g, new THREE.BoxGeometry(2.6, 9.4, 2.6), MAT_GLASS, 3.1, 6.05, 0.2);
  add(g, new THREE.BoxGeometry(1.1, 9.8, 1.1), steelMat, -2.3, 6.25, -0.65);
  add(g, new THREE.BoxGeometry(1.1, 9.8, 1.1), steelMat, 2.3, 6.25, -0.65);

  // Central atrium and lobby.
  add(g, new THREE.BoxGeometry(4.6, 4.1, 3.2), atriumGlass, 0, 3.35, 0.85);
  add(g, new THREE.BoxGeometry(6.2, 1.0, 3.2), steelMat, 0, 1.95, 0.85);

  // Skybridge linking towers.
  add(g, new THREE.BoxGeometry(6.9, 1.05, 1.45), steelMat, 0, 8.35, 0.25);
  add(g, new THREE.BoxGeometry(6.4, 0.32, 1.05), accentCyan, 0, 8.88, 0.25);

  // Roof technical deck.
  add(g, new THREE.BoxGeometry(7.4, 0.5, 3.6), darkSteel, 0, 10.1, 0.25);
  add(g, new THREE.BoxGeometry(1.2, 0.9, 1.2), steelMat, -1.6, 10.75, 0.1);
  add(g, new THREE.BoxGeometry(1.2, 0.9, 1.2), steelMat, 1.6, 10.75, 0.1);

  // Antenna array + dish motif.
  add(g, new THREE.CylinderGeometry(0.16, 0.2, 2.2, 8), accentCyan, 0, 11.95, 0.25);
  add(g, new THREE.CylinderGeometry(0.1, 0.12, 1.2, 8), accentCyan, -0.65, 11.45, 0.25);
  add(g, new THREE.CylinderGeometry(0.1, 0.12, 1.2, 8), accentCyan, 0.65, 11.45, 0.25);
  const dish = add(g, new THREE.TorusGeometry(2.25, 0.28, 10, 38, Math.PI), accentCyan, 0, 11.2, -0.15);
  dish.rotation.y = Math.PI / 4;
  dish.rotation.z = Math.PI / 6;

  // Facade window rhythm.
  addWindowGrid(g, -3.1, 6.05, 1.55, 2, 6, 0.85, 1.35, 0x79c7f4);
  addWindowGrid(g, 3.1, 6.05, 1.55, 2, 6, 0.85, 1.35, 0x79c7f4);
  addWindowGrid(g, 0, 3.35, 2.05, 4, 2, 1.0, 1.0, 0x8dd4ff);

  // Front cantilever canopy.
  add(g, new THREE.BoxGeometry(4.2, 0.25, 1.6), accentCyan, 0, 2.45, 2.45);
  add(g, new THREE.BoxGeometry(0.18, 1.1, 0.18), steelMat, -1.5, 1.9, 2.5);
  add(g, new THREE.BoxGeometry(0.18, 1.1, 0.18), steelMat, 1.5, 1.9, 2.5);

  return g;
}

function buildPostech() {
  const g = new THREE.Group();
  const labStone = new THREE.MeshStandardMaterial({ color: 0x6e7b7f, roughness: 0.88, metalness: 0.08 });
  const techSteel = new THREE.MeshStandardMaterial({ color: 0x5e696f, roughness: 0.42, metalness: 0.7 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x75c2d1, roughness: 0.2, metalness: 0.18, transparent: true, opacity: 0.88 });
  const orangeAccent = new THREE.MeshStandardMaterial({ color: 0xd85b2a, roughness: 0.4, metalness: 0.24 });

  // Base and stepped plinth.
  add(g, new THREE.BoxGeometry(13.2, 1.0, 8.0), techSteel, 0, 0.5, 0.4);
  add(g, new THREE.BoxGeometry(10.8, 0.65, 6.2), labStone, 0, 1.35, 0.8);

  // Accelerator-like ring (primary identity).
  const ringOuter = add(g, new THREE.TorusGeometry(4.4, 0.55, 12, 64), orangeAccent, 0, 5.9, 0);
  ringOuter.rotation.x = Math.PI / 2;
  const ringInner = add(g, new THREE.TorusGeometry(3.55, 0.22, 10, 52), techSteel, 0, 5.9, 0);
  ringInner.rotation.x = Math.PI / 2;

  // Central core tower + cap.
  add(g, new THREE.CylinderGeometry(1.35, 1.55, 9.4, 16), labStone, 0, 5.5, 0);
  add(g, new THREE.CylinderGeometry(0.95, 1.2, 2.2, 12), techSteel, 0, 10.9, 0);
  add(g, new THREE.CylinderGeometry(0.2, 0.24, 1.6, 8), orangeAccent, 0, 12.7, 0);

  // Four modular research wings.
  const wingPos = [
    [-4.2, 3.1, 0],
    [4.2, 3.1, 0],
    [0, 3.1, -3.1],
    [0, 3.1, 3.1]
  ];
  wingPos.forEach(([x, y, z], idx) => {
    const horizontal = Math.abs(x) > 0;
    add(
      g,
      new THREE.BoxGeometry(horizontal ? 3.8 : 2.6, 3.2, horizontal ? 2.4 : 3.8),
      labStone,
      x,
      y,
      z
    );
    add(
      g,
      new THREE.BoxGeometry(horizontal ? 3.4 : 2.2, 1.0, horizontal ? 2.0 : 3.4),
      glass,
      x,
      y + 1.3,
      z + (idx === 2 ? -0.25 : idx === 3 ? 0.25 : 0)
    );
  });

  // Technical bridges connecting ring to wings.
  add(g, new THREE.BoxGeometry(3.1, 0.45, 0.8), techSteel, -2.3, 5.6, 0);
  add(g, new THREE.BoxGeometry(3.1, 0.45, 0.8), techSteel, 2.3, 5.6, 0);
  add(g, new THREE.BoxGeometry(0.8, 0.45, 2.7), techSteel, 0, 5.6, -2.0);
  add(g, new THREE.BoxGeometry(0.8, 0.45, 2.7), techSteel, 0, 5.6, 2.0);

  // Orange structural braces for engineering vibe.
  for (let i = 0; i < 4; i += 1) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const x = Math.cos(a) * 3.7;
    const z = Math.sin(a) * 3.7;
    const brace = add(g, new THREE.CylinderGeometry(0.15, 0.15, 3.4, 8), orangeAccent, x, 4.2, z);
    brace.rotation.z = Math.PI / 4;
    brace.rotation.y = a;
  }

  // Window pattern on side labs.
  addWindowGrid(g, -4.2, 3.1, 1.3, 3, 2, 0.9, 0.95, 0x8fd8e6);
  addWindowGrid(g, 4.2, 3.1, 1.3, 3, 2, 0.9, 0.95, 0x8fd8e6);
  addWindowGrid(g, 0, 3.1, -1.95, 2, 2, 0.9, 0.95, 0x8fd8e6);
  addWindowGrid(g, 0, 3.1, 4.05, 2, 2, 0.9, 0.95, 0x8fd8e6);

  // Secondary halo ring for depth.
  const halo = add(g, new THREE.TorusGeometry(2.9, 0.2, 8, 40), techSteel, 0, 9.8, 0);
  halo.rotation.x = Math.PI / 2;

  return g;
}

function buildSkku() {
  const g = new THREE.Group();
  const stonePodium = new THREE.MeshStandardMaterial({ color: 0x8e8a80, roughness: 0.9, metalness: 0.02 });
  const woodDark = new THREE.MeshStandardMaterial({ color: 0x5a3e2a, roughness: 0.86, metalness: 0.02 });
  const woodMid = new THREE.MeshStandardMaterial({ color: 0x7a5637, roughness: 0.82, metalness: 0.03 });
  const roofTile = new THREE.MeshStandardMaterial({ color: 0x3f444a, roughness: 0.9, metalness: 0.04 });
  const trimGreen = new THREE.MeshStandardMaterial({ color: 0x2f6a4d, roughness: 0.7, metalness: 0.06 });
  const boardGold = new THREE.MeshStandardMaterial({ color: 0xb58d4b, roughness: 0.45, metalness: 0.28 });

  // Stone podium + stair.
  add(g, new THREE.BoxGeometry(13.0, 1.0, 7.8), stonePodium, 0, 0.5, 0.4);
  add(g, new THREE.BoxGeometry(10.8, 0.6, 6.4), stonePodium, 0, 1.3, 0.8);
  for (let s = 0; s < 5; s += 1) {
    add(g, new THREE.BoxGeometry(4.6 - s * 0.38, 0.16, 0.48), stonePodium, 0, 0.17 + s * 0.16, 3.35 + s * 0.11);
  }

  // Main timber hall body.
  add(g, new THREE.BoxGeometry(8.4, 3.2, 4.6), woodMid, 0, 3.1, 0.2);
  add(g, new THREE.BoxGeometry(8.8, 0.4, 4.9), woodDark, 0, 4.9, 0.2); // beam band

  // Front colonnade.
  for (let i = -3; i <= 3; i += 1) {
    add(g, new THREE.CylinderGeometry(0.24, 0.26, 2.6, 10), woodDark, i * 1.15, 3.05, 2.35);
  }
  add(g, new THREE.BoxGeometry(8.6, 0.35, 0.4), woodDark, 0, 4.25, 2.4);
  add(g, new THREE.BoxGeometry(8.6, 0.3, 0.35), woodDark, 0, 2.0, 2.4);

  // Side and rear structural posts.
  const sidePostZ = [-1.7, 0, 1.7];
  sidePostZ.forEach((z) => {
    add(g, new THREE.CylinderGeometry(0.2, 0.22, 2.5, 10), woodDark, -3.9, 3.0, z);
    add(g, new THREE.CylinderGeometry(0.2, 0.22, 2.5, 10), woodDark, 3.9, 3.0, z);
  });

  // Layered traditional roof (hip-and-gable inspired silhouette).
  const roofBase = add(g, new THREE.ConeGeometry(5.2, 1.45, 4), roofTile, 0, 6.0, 0.2);
  roofBase.rotation.y = Math.PI * 0.25;
  const roofMidLayer = add(g, new THREE.ConeGeometry(4.2, 1.1, 4), roofTile, 0, 7.0, 0.2);
  roofMidLayer.rotation.y = Math.PI * 0.25;
  const roofTop = add(g, new THREE.ConeGeometry(2.8, 0.85, 4), roofTile, 0, 7.8, 0.2);
  roofTop.rotation.y = Math.PI * 0.25;

  // Eaves trim to avoid low-detail cone look.
  const eave1 = add(g, new THREE.TorusGeometry(3.95, 0.16, 8, 28), trimGreen, 0, 6.45, 0.2);
  eave1.rotation.x = Math.PI / 2;
  const eave2 = add(g, new THREE.TorusGeometry(2.55, 0.13, 8, 24), trimGreen, 0, 7.45, 0.2);
  eave2.rotation.x = Math.PI / 2;

  // Ridge ornaments and finial.
  add(g, new THREE.BoxGeometry(0.32, 1.0, 0.32), boardGold, 0, 8.55, 0.2);
  add(g, new THREE.SphereGeometry(0.26, 10, 8), boardGold, 0, 9.1, 0.2);

  // Front signboard axis (명륜당 상징 현판 느낌).
  add(g, new THREE.BoxGeometry(3.2, 0.85, 0.14), woodDark, 0, 4.0, 2.58);
  add(g, new THREE.BoxGeometry(2.7, 0.55, 0.08), boardGold, 0, 4.0, 2.66);

  // Lattice-like window rhythm.
  addWindowGrid(g, 0, 3.2, 2.02, 6, 2, 1.0, 0.9, 0xbc9f7c);
  addWindowGrid(g, -3.15, 3.0, 0.0, 1, 3, 0.7, 0.95, 0xae9473);
  addWindowGrid(g, 3.15, 3.0, 0.0, 1, 3, 0.7, 0.95, 0xae9473);

  // Stone railing at front terrace.
  add(g, new THREE.BoxGeometry(7.4, 0.35, 0.3), stonePodium, 0, 1.85, 3.02);
  for (let i = -3; i <= 3; i += 1) {
    add(g, new THREE.BoxGeometry(0.22, 0.7, 0.22), stonePodium, i * 1.05, 1.55, 3.0);
  }

  return g;
}

function buildHanyang() {
  const g = new THREE.Group();
  const concrete = new THREE.MeshStandardMaterial({ color: 0x787f89, roughness: 0.9, metalness: 0.06 });
  const darkConcrete = new THREE.MeshStandardMaterial({ color: 0x5f6670, roughness: 0.86, metalness: 0.08 });
  const steelBlue = new THREE.MeshStandardMaterial({ color: 0x1f5cae, roughness: 0.42, metalness: 0.26 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x7bb6df, roughness: 0.2, metalness: 0.2, transparent: true, opacity: 0.88 });
  const bronze = new THREE.MeshStandardMaterial({ color: 0xa68460, roughness: 0.55, metalness: 0.3 });

  // Base plinth with stepped approach.
  add(g, new THREE.BoxGeometry(13.2, 1.0, 7.6), darkConcrete, 0, 0.5, 0.35);
  add(g, new THREE.BoxGeometry(10.8, 0.6, 6.0), concrete, 0, 1.3, 0.75);
  for (let s = 0; s < 4; s += 1) {
    add(g, new THREE.BoxGeometry(5.4 - s * 0.45, 0.18, 0.48), concrete, 0, 0.2 + s * 0.18, 3.2 + s * 0.1);
  }

  // Core masses.
  add(g, new THREE.BoxGeometry(3.0, 8.8, 2.8), concrete, -3.25, 5.7, 0);
  add(g, new THREE.BoxGeometry(3.0, 8.8, 2.8), concrete, 3.25, 5.7, 0);
  add(g, new THREE.BoxGeometry(7.8, 3.2, 2.6), concrete, 0, 3.1, 0.15);

  // H motif bridge and frame.
  add(g, new THREE.BoxGeometry(7.9, 1.25, 1.95), steelBlue, 0, 6.4, 0.15);
  add(g, new THREE.BoxGeometry(1.05, 3.0, 1.2), steelBlue, -1.75, 4.95, 0.8);
  add(g, new THREE.BoxGeometry(1.05, 3.0, 1.2), steelBlue, 1.75, 4.95, 0.8);

  // Secondary skybridge/cantilever for modern identity.
  add(g, new THREE.BoxGeometry(5.8, 0.42, 1.25), steelBlue, 0, 8.9, -0.4);
  add(g, new THREE.BoxGeometry(0.24, 1.2, 0.24), darkConcrete, -2.6, 8.2, -0.35);
  add(g, new THREE.BoxGeometry(0.24, 1.2, 0.24), darkConcrete, 2.6, 8.2, -0.35);

  // Minimal curtain-wall strips.
  add(g, new THREE.BoxGeometry(2.1, 7.0, 0.55), glass, -3.25, 5.7, 1.45);
  add(g, new THREE.BoxGeometry(2.1, 7.0, 0.55), glass, 3.25, 5.7, 1.45);
  add(g, new THREE.BoxGeometry(6.2, 1.6, 0.45), glass, 0, 3.2, 1.55);

  // Facade lines/windows rhythm.
  addWindowGrid(g, -3.25, 5.7, 1.72, 2, 5, 0.8, 1.2, 0x9dc3e9);
  addWindowGrid(g, 3.25, 5.7, 1.72, 2, 5, 0.8, 1.2, 0x9dc3e9);
  addWindowGrid(g, 0, 3.2, 1.75, 5, 2, 0.95, 0.9, 0x9bbde2);

  // Symbolic orb/plaza sculpture.
  add(g, new THREE.SphereGeometry(1.05, 18, 14), bronze, 0, 9.55, 1.45);
  add(g, new THREE.CylinderGeometry(0.22, 0.28, 1.5, 10), steelBlue, 0, 8.75, 1.45);

  // Front gate slab to reinforce campus entrance feel.
  add(g, new THREE.BoxGeometry(8.2, 0.85, 1.3), darkConcrete, 0, 3.55, 3.0);
  add(g, new THREE.BoxGeometry(0.75, 2.2, 1.3), darkConcrete, -3.5, 2.55, 3.0);
  add(g, new THREE.BoxGeometry(0.75, 2.2, 1.3), darkConcrete, 3.5, 2.55, 3.0);

  return g;
}

function buildChungang() {
  const g = new THREE.Group();
  const stone = new THREE.MeshStandardMaterial({ color: 0x7d848f, roughness: 0.9, metalness: 0.06 });
  const darkStone = new THREE.MeshStandardMaterial({ color: 0x636b77, roughness: 0.88, metalness: 0.08 });
  const blueAccent = new THREE.MeshStandardMaterial({ color: 0x1f4f9b, roughness: 0.42, metalness: 0.24 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x83b5de, roughness: 0.2, metalness: 0.2, transparent: true, opacity: 0.88 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x8e96a3, roughness: 0.35, metalness: 0.72 });

  // Circular podium and approach.
  add(g, new THREE.CylinderGeometry(6.0, 6.3, 1.0, 24), darkStone, 0, 0.5, 0.25);
  add(g, new THREE.CylinderGeometry(4.9, 5.2, 0.65, 24), stone, 0, 1.35, 0.55);
  for (let s = 0; s < 5; s += 1) {
    add(g, new THREE.BoxGeometry(4.5 - s * 0.35, 0.16, 0.45), stone, 0, 0.18 + s * 0.16, 3.25 + s * 0.1);
  }

  // Main circular core and ring gallery.
  add(g, new THREE.CylinderGeometry(3.3, 3.6, 6.6, 18), MAT_STONE, 0, 4.35, 0.2);
  add(g, new THREE.CylinderGeometry(4.4, 4.4, 1.2, 24), stone, 0, 5.3, 0.2);
  add(g, new THREE.CylinderGeometry(2.7, 2.9, 3.0, 16), darkStone, 0, 7.9, 0.0);

  // Crown ring and spire.
  const crown = add(g, new THREE.TorusGeometry(3.4, 0.28, 10, 38), blueAccent, 0, 8.25, 0.0);
  crown.rotation.x = Math.PI / 2;
  const innerCrown = add(g, new THREE.TorusGeometry(2.45, 0.16, 8, 30), metal, 0, 8.55, 0.0);
  innerCrown.rotation.x = Math.PI / 2;
  add(g, new THREE.ConeGeometry(1.95, 2.8, 12), MAT_ROOF, 0, 10.65, 0.0);
  add(g, new THREE.CylinderGeometry(0.2, 0.24, 1.8, 8), blueAccent, 0, 12.55, 0.0);

  // Clocktower motif near the top.
  add(g, new THREE.CylinderGeometry(1.15, 1.2, 1.0, 12), stone, 0, 9.4, 1.35);
  const clockFace = add(g, new THREE.CylinderGeometry(0.52, 0.52, 0.1, 18), metal, 0, 9.4, 1.88);
  clockFace.rotation.x = Math.PI / 2;
  add(g, new THREE.BoxGeometry(0.06, 0.34, 0.04), blueAccent, 0, 9.5, 1.92);
  add(g, new THREE.BoxGeometry(0.24, 0.06, 0.04), blueAccent, 0.08, 9.4, 1.92);

  // Facade articulation.
  for (let i = 0; i < 12; i += 1) {
    const a = (i / 12) * Math.PI * 2;
    const x = Math.cos(a) * 3.25;
    const z = Math.sin(a) * 3.25 + 0.2;
    const fin = add(g, new THREE.BoxGeometry(0.22, 2.8, 0.3), stone, x, 4.5, z);
    fin.rotation.y = -a;
  }
  addWindowGrid(g, 0, 4.45, 1.95, 5, 3, 0.85, 1.0, 0x9fc1e4);
  add(g, new THREE.CylinderGeometry(2.15, 2.15, 1.4, 16), glass, 0, 5.8, 0.2);

  // Front entry portico.
  add(g, new THREE.BoxGeometry(3.9, 2.2, 0.45), darkStone, 0, 2.8, 2.55);
  add(g, new THREE.BoxGeometry(0.28, 2.2, 0.35), stone, -1.75, 2.8, 2.65);
  add(g, new THREE.BoxGeometry(0.28, 2.2, 0.35), stone, 1.75, 2.8, 2.65);

  return g;
}

function buildKyunghee() {
  const g = new THREE.Group();
  const limestone = new THREE.MeshStandardMaterial({ color: 0xc4b89f, roughness: 0.78, metalness: 0.05 });
  const darkStone = new THREE.MeshStandardMaterial({ color: 0x8d816e, roughness: 0.86, metalness: 0.04 });
  const domeBronze = new THREE.MeshStandardMaterial({ color: 0xa88856, roughness: 0.6, metalness: 0.3 });
  const trimBlue = new THREE.MeshStandardMaterial({ color: 0x35558e, roughness: 0.5, metalness: 0.2 });
  const glass = new THREE.MeshStandardMaterial({ color: 0xbfd7ea, roughness: 0.2, metalness: 0.15, transparent: true, opacity: 0.85 });

  // Ceremonial podium and stairs.
  add(g, new THREE.BoxGeometry(14.8, 1.0, 8.8), darkStone, 0, 0.5, 0.6);
  add(g, new THREE.BoxGeometry(12.4, 0.7, 7.0), limestone, 0, 1.35, 1.0);
  for (let s = 0; s < 7; s += 1) {
    add(g, new THREE.BoxGeometry(6.4 - s * 0.45, 0.16, 0.52), limestone, 0, 0.18 + s * 0.16, 3.75 + s * 0.11);
  }

  // Main hall + side wings.
  add(g, new THREE.BoxGeometry(8.8, 3.2, 4.8), MAT_STONE, 0, 3.2, 0.2);
  add(g, new THREE.BoxGeometry(3.6, 2.6, 3.4), MAT_STONE, -4.6, 2.9, 0.35);
  add(g, new THREE.BoxGeometry(3.6, 2.6, 3.4), MAT_STONE, 4.6, 2.9, 0.35);

  // Grand drum + dome silhouette.
  add(g, new THREE.CylinderGeometry(2.9, 3.2, 1.6, 20), limestone, 0, 5.25, 0.2);
  const dome = add(g, new THREE.SphereGeometry(3.55, 28, 20), domeBronze, 0, 7.4, 0.2);
  dome.scale.y = 0.75;
  add(g, new THREE.CylinderGeometry(0.24, 0.28, 1.3, 8), domeBronze, 0, 10.15, 0.2);
  add(g, new THREE.SphereGeometry(0.3, 12, 10), domeBronze, 0, 10.85, 0.2);

  // Front colonnade.
  for (let i = -4; i <= 4; i += 1) {
    add(g, new THREE.CylinderGeometry(0.22, 0.24, 2.9, 10), limestone, i * 0.95, 3.2, 2.55);
  }
  add(g, new THREE.BoxGeometry(9.0, 0.42, 0.45), darkStone, 0, 4.45, 2.55);
  add(g, new THREE.BoxGeometry(9.0, 0.35, 0.4), darkStone, 0, 1.95, 2.55);

  // Pediment and neoclassical trim.
  const pediment = add(g, new THREE.ConeGeometry(2.7, 1.25, 4), darkStone, 0, 5.1, 2.55);
  pediment.rotation.y = Math.PI * 0.25;
  add(g, new THREE.BoxGeometry(5.4, 0.24, 0.2), trimBlue, 0, 4.95, 2.75);

  // Wings roof caps.
  const leftRoof = add(g, new THREE.ConeGeometry(1.55, 0.9, 4), darkStone, -4.6, 4.65, 0.35);
  leftRoof.rotation.y = Math.PI * 0.25;
  const rightRoof = add(g, new THREE.ConeGeometry(1.55, 0.9, 4), darkStone, 4.6, 4.65, 0.35);
  rightRoof.rotation.y = Math.PI * 0.25;

  // Facade windows / rhythm.
  addWindowGrid(g, 0, 3.2, 2.05, 6, 2, 1.05, 0.95, 0xdac9a9);
  addWindowGrid(g, -4.6, 2.9, 1.7, 2, 2, 0.85, 0.9, 0xd1c2a4);
  addWindowGrid(g, 4.6, 2.9, 1.7, 2, 2, 0.85, 0.9, 0xd1c2a4);
  add(g, new THREE.BoxGeometry(3.2, 1.0, 0.35), glass, 0, 6.0, 2.05);

  // Side towerlets to enrich skyline.
  add(g, new THREE.CylinderGeometry(0.7, 0.8, 3.0, 12), limestone, -2.9, 4.2, 0.4);
  add(g, new THREE.CylinderGeometry(0.7, 0.8, 3.0, 12), limestone, 2.9, 4.2, 0.4);
  add(g, new THREE.ConeGeometry(0.62, 0.9, 8), darkStone, -2.9, 6.15, 0.4);
  add(g, new THREE.ConeGeometry(0.62, 0.9, 8), darkStone, 2.9, 6.15, 0.4);

  return g;
}

function buildSogang() {
  const g = new THREE.Group();
  const stone = new THREE.MeshStandardMaterial({ color: 0x85766e, roughness: 0.9, metalness: 0.04 });
  const darkStone = new THREE.MeshStandardMaterial({ color: 0x6a5c56, roughness: 0.88, metalness: 0.05 });
  const crimson = new THREE.MeshStandardMaterial({ color: 0x8d2e2f, roughness: 0.52, metalness: 0.16 });
  const brass = new THREE.MeshStandardMaterial({ color: 0xaa865b, roughness: 0.45, metalness: 0.3 });
  const glass = new THREE.MeshStandardMaterial({ color: 0xbfaeaa, roughness: 0.22, metalness: 0.1, transparent: true, opacity: 0.86 });

  // Base podium and front steps.
  add(g, new THREE.BoxGeometry(12.2, 0.95, 7.2), darkStone, 0, 0.48, 0.45);
  add(g, new THREE.BoxGeometry(10.0, 0.6, 5.8), stone, 0, 1.25, 0.85);
  for (let s = 0; s < 5; s += 1) {
    add(g, new THREE.BoxGeometry(4.9 - s * 0.38, 0.16, 0.45), stone, 0, 0.18 + s * 0.16, 3.25 + s * 0.1);
  }

  // Main hall + side annexes.
  add(g, new THREE.BoxGeometry(7.4, 3.3, 3.9), MAT_STONE, 0, 3.0, 0.15);
  add(g, new THREE.BoxGeometry(2.6, 2.5, 3.0), MAT_STONE, -3.4, 2.6, 0.35);
  add(g, new THREE.BoxGeometry(2.6, 2.5, 3.0), MAT_STONE, 3.4, 2.6, 0.35);

  // Bell tower axis.
  add(g, new THREE.BoxGeometry(2.2, 9.8, 2.2), stone, 0, 6.0, -1.05);
  add(g, new THREE.BoxGeometry(1.65, 2.1, 1.65), darkStone, 0, 11.0, -1.05);
  add(g, new THREE.ConeGeometry(1.4, 2.2, 10), darkStone, 0, 13.15, -1.05);

  // Cross motif on tower top.
  add(g, new THREE.BoxGeometry(0.18, 1.25, 0.16), brass, 0, 14.35, -1.05);
  add(g, new THREE.BoxGeometry(0.65, 0.14, 0.16), brass, 0, 14.0, -1.05);

  // Bell opening frames.
  add(g, new THREE.BoxGeometry(1.05, 1.35, 0.2), darkStone, 0, 10.6, 0.05);
  add(g, new THREE.BoxGeometry(0.18, 1.35, 0.18), stone, -0.45, 10.6, 0.12);
  add(g, new THREE.BoxGeometry(0.18, 1.35, 0.18), stone, 0.45, 10.6, 0.12);
  add(g, new THREE.SphereGeometry(0.24, 10, 8), brass, 0, 10.35, 0.08);

  // Cloister-like front arches.
  for (let i = -2; i <= 2; i += 1) {
    const x = i * 1.15;
    const arch = add(g, new THREE.TorusGeometry(0.5, 0.08, 8, 20, Math.PI), darkStone, x, 3.35, 2.1);
    arch.rotation.x = Math.PI / 2;
    add(g, new THREE.BoxGeometry(0.16, 1.25, 0.16), stone, x - 0.5, 2.75, 2.12);
    add(g, new THREE.BoxGeometry(0.16, 1.25, 0.16), stone, x + 0.5, 2.75, 2.12);
  }
  add(g, new THREE.BoxGeometry(6.0, 0.22, 0.2), darkStone, 0, 4.0, 2.12);

  // Red accent lintel and center axis strip.
  add(g, new THREE.BoxGeometry(3.2, 0.55, 0.55), crimson, 0, 8.95, -1.05);
  add(g, new THREE.BoxGeometry(0.65, 2.2, 0.55), crimson, 0, 8.95, -1.05);

  // Facade windows.
  addWindowGrid(g, 0, 3.0, 1.65, 5, 2, 1.0, 0.95, 0xcfb6b0);
  addWindowGrid(g, -3.4, 2.6, 1.45, 2, 2, 0.8, 0.9, 0xc7afa9);
  addWindowGrid(g, 3.4, 2.6, 1.45, 2, 2, 0.8, 0.9, 0xc7afa9);
  add(g, new THREE.BoxGeometry(2.1, 0.8, 0.32), glass, 0, 10.55, 0.12);

  // Front portal frame.
  add(g, new THREE.BoxGeometry(2.6, 2.1, 0.3), darkStone, 0, 2.45, 2.25);
  add(g, new THREE.BoxGeometry(0.22, 2.1, 0.24), stone, -1.15, 2.45, 2.3);
  add(g, new THREE.BoxGeometry(0.22, 2.1, 0.24), stone, 1.15, 2.45, 2.3);

  return g;
}

function buildEwha() {
  const g = new THREE.Group();
  const concrete = new THREE.MeshStandardMaterial({ color: 0x8e9096, roughness: 0.86, metalness: 0.05 });
  const darkConcrete = new THREE.MeshStandardMaterial({ color: 0x6e727c, roughness: 0.88, metalness: 0.06 });
  const glassBlue = new THREE.MeshStandardMaterial({ color: 0x83c7d7, roughness: 0.18, metalness: 0.16, transparent: true, opacity: 0.84 });
  const glassGreen = new THREE.MeshStandardMaterial({ color: 0x59b7a7, roughness: 0.2, metalness: 0.18, transparent: true, opacity: 0.84 });
  const accentMint = new THREE.MeshStandardMaterial({ color: 0x2b9f87, roughness: 0.42, metalness: 0.2 });

  // Split podium (valley cut).
  add(g, new THREE.BoxGeometry(13.8, 0.95, 7.6), darkConcrete, 0, 0.48, 0.45);
  add(g, new THREE.BoxGeometry(5.6, 1.1, 5.8), concrete, -4.0, 1.45, 0.75);
  add(g, new THREE.BoxGeometry(5.6, 1.1, 5.8), concrete, 4.0, 1.45, 0.75);
  add(g, new THREE.BoxGeometry(1.8, 1.05, 5.4), darkConcrete, 0, 1.25, 0.85); // central valley strip

  // Main dual ECC arches.
  const outerArc = add(g, new THREE.TorusGeometry(4.8, 0.58, 12, 64, Math.PI), glassBlue, 0, 4.55, 0.1);
  outerArc.rotation.x = Math.PI / 2;
  const innerArc = add(g, new THREE.TorusGeometry(3.55, 0.42, 12, 56, Math.PI), glassGreen, 0, 6.45, 0.15);
  innerArc.rotation.x = Math.PI / 2;

  // Curved side retaining walls.
  const leftWall = add(g, new THREE.TorusGeometry(5.6, 0.26, 8, 44, Math.PI), concrete, -0.35, 2.55, 0.95);
  leftWall.rotation.x = Math.PI / 2;
  leftWall.rotation.z = Math.PI * 0.08;
  const rightWall = add(g, new THREE.TorusGeometry(5.6, 0.26, 8, 44, Math.PI), concrete, 0.35, 2.55, 0.95);
  rightWall.rotation.x = Math.PI / 2;
  rightWall.rotation.z = -Math.PI * 0.08;

  // Glazed corridor and suspended bridge.
  add(g, new THREE.BoxGeometry(6.2, 1.2, 2.1), glassBlue, 0, 3.35, 0.95);
  add(g, new THREE.BoxGeometry(4.4, 0.4, 1.2), accentMint, 0, 5.35, 0.55);
  add(g, new THREE.BoxGeometry(0.22, 1.35, 0.22), darkConcrete, -1.8, 4.75, 0.55);
  add(g, new THREE.BoxGeometry(0.22, 1.35, 0.22), darkConcrete, 1.8, 4.75, 0.55);

  // Structural ribs across arches.
  for (let i = -4; i <= 4; i += 1) {
    const x = i * 0.95;
    add(g, new THREE.BoxGeometry(0.16, 2.9, 0.18), accentMint, x, 4.65, 0.22);
  }

  // Terraced valley stairs.
  for (let s = 0; s < 6; s += 1) {
    add(g, new THREE.BoxGeometry(2.2 - s * 0.18, 0.14, 0.42), concrete, 0, 0.2 + s * 0.14, 3.1 + s * 0.11);
  }

  // Side glazed masses to avoid simple arc-only silhouette.
  add(g, new THREE.BoxGeometry(2.1, 2.4, 2.4), glassGreen, -3.2, 3.0, 0.9);
  add(g, new THREE.BoxGeometry(2.1, 2.4, 2.4), glassGreen, 3.2, 3.0, 0.9);

  // Facade window rhythm.
  addWindowGrid(g, -3.2, 3.0, 2.15, 2, 2, 0.8, 0.85, 0x9ed7cf);
  addWindowGrid(g, 3.2, 3.0, 2.15, 2, 2, 0.8, 0.85, 0x9ed7cf);
  addWindowGrid(g, 0, 3.35, 2.05, 4, 2, 0.9, 0.85, 0x9fd4db);

  // Central marker fin.
  add(g, new THREE.BoxGeometry(0.28, 1.8, 0.22), accentMint, 0, 7.45, 0.12);

  return g;
}

function buildPusan() {
  const g = new THREE.Group();
  add(g, new THREE.BoxGeometry(6.8, 2.3, 3.6), MAT_STONE, 0, 1.15, 0);
  add(g, new THREE.CylinderGeometry(1.2, 1.5, 8.5, 12), MAT_STONE, -1.8, 5.0, 0);
  add(g, new THREE.ConeGeometry(1.6, 2.4, 12), MAT_ROOF, -1.8, 9.9, 0);
  const wave = add(g, new THREE.TorusGeometry(3.0, 0.3, 8, 32, Math.PI), MAT_ACCENT, 1.6, 4.8, -0.2);
  wave.rotation.x = Math.PI / 2;
  addWindowGrid(g, -1.8, 5.2, 1.2, 2, 4, 0.7, 1.0, 0xa8c6e7);
  return g;
}

const BUILDERS = {
  'snu.glb': buildSnu,
  'yonsei.glb': buildYonsei,
  'korea.glb': buildKorea,
  'kaist.glb': buildKaist,
  'postech.glb': buildPostech,
  'skku.glb': buildSkku,
  'hanyang.glb': buildHanyang,
  'chungang.glb': buildChungang,
  'kyunghee.glb': buildKyunghee,
  'sogang.glb': buildSogang,
  'ewha.glb': buildEwha,
  'pusan.glb': buildPusan,
};

async function exportBinary(root) {
  const exporter = new GLTFExporter();
  root.updateMatrixWorld(true);
  return new Promise((resolve, reject) => {
    exporter.parse(
      root,
      (result) => {
        if (result instanceof ArrayBuffer) {
          resolve(Buffer.from(result));
          return;
        }
        reject(new Error('Expected binary glb output'));
      },
      (err) => reject(err),
      { binary: true, includeCustomExtensions: true },
    );
  });
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });

  const target = (process.argv[2] || '').trim().toLowerCase();
  const entries = Object.entries(BUILDERS).filter(([fileName]) => {
    if (!target) return true;
    if (target === 'all') return true;
    const base = fileName.replace(/\.glb$/i, '').toLowerCase();
    return target === base || target === fileName.toLowerCase();
  });

  if (entries.length === 0) {
    throw new Error(`No matching model target: ${target}`);
  }

  for (const [fileName, builder] of entries) {
    const root = new THREE.Group();
    const model = builder();
    root.add(model);
    const bin = await exportBinary(root);
    const outPath = path.join(OUT_DIR, fileName);
    await fs.writeFile(outPath, bin);
    console.log(`generated: ${outPath} (${bin.length} bytes)`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
