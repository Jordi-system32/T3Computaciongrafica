import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const output = path.join(root, 'assets');
fs.mkdirSync(output, { recursive: true });

const faceData = [
  [[-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5], [0, 0, 1]],
  [[0.5, -0.5, -0.5], [-0.5, -0.5, -0.5], [-0.5, 0.5, -0.5], [0.5, 0.5, -0.5], [0, 0, -1]],
  [[-0.5, 0.5, 0.5], [0.5, 0.5, 0.5], [0.5, 0.5, -0.5], [-0.5, 0.5, -0.5], [0, 1, 0]],
  [[-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, -0.5, 0.5], [-0.5, -0.5, 0.5], [0, -1, 0]],
  [[0.5, -0.5, 0.5], [0.5, -0.5, -0.5], [0.5, 0.5, -0.5], [0.5, 0.5, 0.5], [1, 0, 0]],
  [[-0.5, -0.5, -0.5], [-0.5, -0.5, 0.5], [-0.5, 0.5, 0.5], [-0.5, 0.5, -0.5], [-1, 0, 0]],
];

const positions = [];
const normals = [];
const indices = [];
for (const face of faceData) {
  const [a, b, c, d, n] = face;
  const start = positions.length / 3;
  for (const point of [a, b, c, d]) {
    positions.push(...point);
    normals.push(...n);
  }
  indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
}

const palette = {
  black: { baseColorFactor: [0.055, 0.065, 0.055, 1], metallicFactor: 0.28, roughnessFactor: 0.7 },
  steel: { baseColorFactor: [0.19, 0.22, 0.18, 1], metallicFactor: 0.65, roughnessFactor: 0.42 },
  red: { baseColorFactor: [0.39, 0.075, 0.035, 1], metallicFactor: 0.36, roughnessFactor: 0.62 },
  brass: { baseColorFactor: [0.58, 0.39, 0.12, 1], metallicFactor: 0.7, roughnessFactor: 0.38 },
  wood: { baseColorFactor: [0.2, 0.11, 0.065, 1], metallicFactor: 0.02, roughnessFactor: 0.92 },
  cloth: { baseColorFactor: [0.16, 0.19, 0.13, 1], metallicFactor: 0.02, roughnessFactor: 0.98 },
  skin: { baseColorFactor: [0.27, 0.31, 0.22, 1], metallicFactor: 0, roughnessFactor: 1 },
  bone: { baseColorFactor: [0.48, 0.46, 0.31, 1], metallicFactor: 0, roughnessFactor: 0.9 },
  eye: { baseColorFactor: [0.48, 0.035, 0.018, 1], emissiveFactor: [0.75, 0.025, 0.005], metallicFactor: 0, roughnessFactor: 0.45 },
};

function box(name, material, translation, scale, rotation) {
  const node = { name, mesh: material, translation, scale };
  if (rotation) node.rotation = rotation;
  return node;
}

function rotationZ(degrees) {
  const half = degrees * Math.PI / 360;
  return [0, 0, Math.sin(half), Math.cos(half)];
}

function buildParts(spec) {
  const materialNames = [...new Set(spec.parts.map((part) => part[1]))];
  const materials = materialNames.map((name) => ({ name, pbrMetallicRoughness: palette[name] }));
  const meshForMaterial = new Map(materialNames.map((name, index) => [name, index]));
  const meshes = materialNames.map((name) => ({
    name: `${spec.name}-${name}`,
    primitives: [{
      attributes: { POSITION: 0, NORMAL: 1 },
      indices: 2,
      material: meshForMaterial.get(name),
      mode: 4,
    }],
  }));
  const nodes = spec.parts.map(([name, material, position, size, rotation]) =>
    box(name, meshForMaterial.get(material), position, size, rotation));

  const vertexMin = [-0.5, -0.5, -0.5];
  const vertexMax = [0.5, 0.5, 0.5];
  const arrays = [
    { data: Buffer.from(new Float32Array(positions).buffer), target: 34962 },
    { data: Buffer.from(new Float32Array(normals).buffer), target: 34962 },
    { data: Buffer.from(new Uint16Array(indices).buffer), target: 34963 },
  ];
  const bufferViews = [];
  const chunks = [];
  let byteOffset = 0;
  for (const entry of arrays) {
    bufferViews.push({ buffer: 0, byteOffset, byteLength: entry.data.length, target: entry.target });
    chunks.push(entry.data);
    byteOffset += entry.data.length;
  }

  const binary = Buffer.concat(chunks);
  const gltf = {
    asset: { version: '2.0', generator: 'Operacion Extraccion asset builder' },
    scene: 0,
    scenes: [{ name: spec.name, nodes: nodes.map((_, index) => index) }],
    nodes,
    meshes,
    materials,
    buffers: [{ byteLength: binary.length }],
    bufferViews,
    accessors: [
      { bufferView: 0, componentType: 5126, count: positions.length / 3, type: 'VEC3', min: vertexMin, max: vertexMax },
      { bufferView: 1, componentType: 5126, count: normals.length / 3, type: 'VEC3' },
      { bufferView: 2, componentType: 5123, count: indices.length, type: 'SCALAR', min: [0], max: [23] },
    ],
  };

  let json = Buffer.from(JSON.stringify(gltf), 'utf8');
  const jsonPadding = (4 - json.length % 4) % 4;
  if (jsonPadding) json = Buffer.concat([json, Buffer.alloc(jsonPadding, 0x20)]);

  const binPadding = (4 - binary.length % 4) % 4;
  const paddedBinary = binPadding ? Buffer.concat([binary, Buffer.alloc(binPadding)]) : binary;
  const totalLength = 12 + 8 + json.length + 8 + paddedBinary.length;
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(totalLength, 8);

  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(json.length, 0);
  jsonHeader.writeUInt32LE(0x4e4f534a, 4);
  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(paddedBinary.length, 0);
  binHeader.writeUInt32LE(0x004e4942, 4);

  fs.writeFileSync(path.join(output, spec.file), Buffer.concat([header, jsonHeader, json, binHeader, paddedBinary]));
}

buildParts({
  name: 'Sidearm M9',
  file: 'sidearm-m9.glb',
  parts: [
    ['receiver', 'black', [0, 0, 0], [0.38, 0.15, 0.58]],
    ['slide', 'red', [0, 0.09, -0.04], [0.34, 0.1, 0.55]],
    ['barrel', 'steel', [0, 0.105, -0.42], [0.105, 0.08, 0.24]],
    ['muzzle', 'black', [0, 0.105, -0.55], [0.13, 0.105, 0.07]],
    ['rear-sight', 'black', [0, 0.17, 0.19], [0.16, 0.045, 0.07]],
    ['front-sight', 'brass', [0, 0.17, -0.28], [0.08, 0.04, 0.05]],
    ['grip', 'wood', [0, -0.17, 0.16], [0.24, 0.34, 0.24], rotationZ(-8)],
    ['grip-panel', 'red', [0, -0.19, 0.16], [0.245, 0.19, 0.18], rotationZ(-8)],
    ['magazine-base', 'black', [0, -0.36, 0.15], [0.16, 0.055, 0.16]],
    ['trigger-guard-top', 'steel', [0, -0.08, 0.04], [0.18, 0.035, 0.18]],
    ['trigger-guard-front', 'steel', [0, -0.135, -0.035], [0.18, 0.13, 0.035]],
  ],
});

buildParts({
  name: 'Carbine AK-47',
  file: 'carbine-ak47.glb',
  parts: [
    ['receiver', 'red', [0, 0, 0.02], [0.42, 0.22, 0.48]],
    ['receiver-cover', 'black', [0, 0.13, -0.005], [0.36, 0.07, 0.38]],
    ['handguard', 'wood', [0, 0.005, -0.38], [0.34, 0.18, 0.4]],
    ['handguard-band-a', 'brass', [0, 0.005, -0.24], [0.36, 0.195, 0.035]],
    ['handguard-band-b', 'brass', [0, 0.005, -0.52], [0.36, 0.195, 0.035]],
    ['barrel', 'steel', [0, 0.035, -0.78], [0.095, 0.095, 0.43]],
    ['muzzle', 'black', [0, 0.035, -1.02], [0.15, 0.13, 0.13]],
    ['stock', 'wood', [0, 0.015, 0.43], [0.3, 0.22, 0.43]],
    ['stock-butt', 'black', [0, 0.015, 0.65], [0.31, 0.26, 0.07]],
    ['grip', 'black', [0, -0.2, 0.16], [0.2, 0.36, 0.2], rotationZ(-8)],
    ['magazine', 'red', [0, -0.28, -0.07], [0.22, 0.4, 0.28], rotationZ(-4)],
    ['magazine-base', 'black', [0, -0.49, -0.07], [0.23, 0.045, 0.29]],
    ['front-sight', 'black', [0, 0.13, -0.79], [0.13, 0.14, 0.05]],
    ['rear-sight', 'black', [0, 0.15, -0.1], [0.18, 0.045, 0.06]],
    ['sight-post', 'brass', [0, 0.22, -0.79], [0.04, 0.12, 0.035]],
  ],
});

buildParts({
  name: 'Infected Bunker',
  file: 'infected.glb',
  parts: [
    ['pelvis', 'cloth', [0, 0.83, 0], [0.48, 0.34, 0.3]],
    ['torso', 'skin', [0, 1.25, -0.015], [0.62, 0.72, 0.34]],
    ['chest-plate', 'cloth', [0, 1.32, 0.16], [0.4, 0.45, 0.08]],
    ['neck', 'bone', [0, 1.66, 0], [0.2, 0.18, 0.2]],
    ['head', 'skin', [0, 1.88, 0], [0.34, 0.38, 0.31]],
    ['jaw', 'bone', [0, 1.73, -0.13], [0.25, 0.1, 0.12]],
    ['eye-left', 'eye', [-0.09, 1.93, -0.16], [0.055, 0.04, 0.025]],
    ['eye-right', 'eye', [0.09, 1.93, -0.16], [0.055, 0.04, 0.025]],
    ['arm-left', 'skin', [-0.42, 1.28, 0], [0.2, 0.68, 0.22], rotationZ(-17)],
    ['arm-right', 'skin', [0.42, 1.25, 0], [0.2, 0.72, 0.22], rotationZ(19)],
    ['hand-left', 'bone', [-0.52, 0.92, -0.05], [0.18, 0.2, 0.18]],
    ['hand-right', 'bone', [0.51, 0.9, -0.08], [0.18, 0.2, 0.18]],
    ['leg-left', 'cloth', [-0.15, 0.42, 0], [0.22, 0.65, 0.24], rotationZ(-5)],
    ['leg-right', 'cloth', [0.15, 0.4, 0.015], [0.22, 0.68, 0.24], rotationZ(7)],
    ['boot-left', 'black', [-0.17, 0.09, -0.045], [0.26, 0.18, 0.36]],
    ['boot-right', 'black', [0.17, 0.08, -0.045], [0.26, 0.18, 0.36]],
  ],
});

console.log('GLB assets generated:', fs.readdirSync(output).join(', '));
