import * as THREE from "three";
import type { Tile } from "../simulation/types";

// Scenery is a render projection, not occupied land or a second simulation.
export class Landscape {
  readonly group = new THREE.Group();
  private meshes: THREE.InstancedMesh[] = [];
  private treeTiles: number[] = [];
  private flowerTiles: number[] = [];
  private matrix = new THREE.Matrix4();
  private position = new THREE.Vector3();
  private scale = new THREE.Vector3();
  private rotation = new THREE.Quaternion();
  constructor(tiles: readonly Tile[]) {
    const hash = (i: number) => {
      let value = Math.imul(i ^ 0x6d2b79f5, 0x45d9f3b);
      value ^= value >>> 16;
      return Math.imul(value, 0x45d9f3b) >>> 0;
    };
    tiles.forEach((tile, i) => {
      const grove =
        Math.sin((i % 64) * 0.3) + Math.cos(Math.floor(i / 64) * 0.33);
      if (
        tile.land &&
        tile.coastDistance > 3 &&
        hash(i) % 100 < (grove > 0.3 ? 14 : grove < -0.5 ? 2 : 7)
      )
        this.treeTiles.push(i);
      else if (tile.land && tile.coastDistance > 2 && hash(i + 4096) % 41 === 0)
        this.flowerTiles.push(i);
    });
    const add = (
      geometry: THREE.BufferGeometry,
      color: number,
      count: number,
    ) => {
      const mesh = new THREE.InstancedMesh(
        geometry,
        new THREE.MeshLambertMaterial({ color }),
        count,
      );
      mesh.frustumCulled = false;
      this.group.add(mesh);
      this.meshes.push(mesh);
      return mesh;
    };
    add(
      new THREE.CylinderGeometry(0.09, 0.13, 0.9, 6),
      0xa3865f,
      this.treeTiles.length,
    );
    add(new THREE.IcosahedronGeometry(1, 1), 0x76a25c, this.treeTiles.length);
    add(new THREE.IcosahedronGeometry(1, 1), 0x8eaf64, this.treeTiles.length);
    const shadow = new THREE.InstancedMesh(
      new THREE.CircleGeometry(1, 12),
      new THREE.MeshBasicMaterial({
        color: 0x4e5c39,
        transparent: true,
        opacity: 0.14,
        depthWrite: false,
      }),
      this.treeTiles.length,
    );
    shadow.frustumCulled = false;
    this.meshes.push(shadow);
    this.group.add(shadow);
    add(
      new THREE.IcosahedronGeometry(0.12, 0),
      0xecc0bb,
      this.flowerTiles.length * 5,
    );
    const shore: number[] = [];
    tiles.forEach((tile, i) => {
      if (!tile.land) return;
      const x = i % 64,
        z = Math.floor(i / 64);
      for (const [neighbor, ax, az, bx, bz] of [
        [x > 0 ? i - 1 : -1, x, z + 1, x, z],
        [x < 63 ? i + 1 : -1, x + 1, z, x + 1, z + 1],
        [i - 64, x, z, x + 1, z],
        [i + 64, x + 1, z + 1, x, z + 1],
      ]) {
        if (tiles[neighbor]?.land) continue;
        shore.push(
          ax,
          0.3,
          az,
          bx,
          -0.42,
          bz,
          bx,
          0.3,
          bz,
          ax,
          0.3,
          az,
          ax,
          -0.42,
          az,
          bx,
          -0.42,
          bz,
        );
      }
    });
    const shoreline = new THREE.BufferGeometry().setAttribute(
      "position",
      new THREE.Float32BufferAttribute(shore, 3),
    );
    shoreline.computeVertexNormals();
    this.group.add(
      new THREE.Mesh(
        shoreline,
        new THREE.MeshLambertMaterial({
          color: 0xcbb182,
          side: THREE.DoubleSide,
        }),
      ),
    );
    this.update(tiles);
    const waves: number[] = [];
    tiles.forEach((tile, i) => {
      if (
        tile.land ||
        i % 64 < 2 ||
        i % 64 > 61 ||
        i < 128 ||
        i > 3967 ||
        (i * 71) % 67 !== 0
      )
        return;
      if ([i - 2, i + 2, i - 128, i + 128].some((n) => tiles[n]?.land)) return;
      const x = i % 64,
        z = Math.floor(i / 64);
      for (let n = 0; n < 5; n++) {
        const a = n / 5,
          b = (n + 1) / 5;
        waves.push(
          x + a * 1.1,
          -0.36,
          z + Math.sin(a * Math.PI) * 0.13,
          x + b * 1.1,
          -0.36,
          z + Math.sin(b * Math.PI) * 0.13,
        );
      }
    });
    const lines = new THREE.LineSegments(
      new THREE.BufferGeometry().setAttribute(
        "position",
        new THREE.Float32BufferAttribute(waves, 3),
      ),
      new THREE.LineBasicMaterial({
        color: 0xe3f4f3,
        transparent: true,
        opacity: 0.36,
      }),
    );
    this.group.add(lines);
  }
  private place(
    mesh: THREE.InstancedMesh,
    n: number,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
  ) {
    this.position.set(x, y, z);
    this.scale.set(sx, sy, sz);
    this.matrix.compose(this.position, this.rotation, this.scale);
    mesh.setMatrixAt(n, this.matrix);
  }
  update(tiles: readonly Tile[]) {
    const clear = (i: number) => {
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const tile = tiles[i + dy * 64 + dx];
          if (tile && (tile.parcelId || tile.buildingId || tile.road))
            return false;
        }
      return true;
    };
    this.rotation.identity();
    this.treeTiles.forEach((i, n) => {
      const x = (i % 64) + 0.5,
        z = Math.floor(i / 64) + 0.5,
        visible = clear(i) ? 1 : 0,
        height = 0.9 + ((i * 13) % 7) / 20;
      this.place(
        this.meshes[0],
        n,
        x,
        0.75,
        z,
        visible,
        height * visible,
        visible,
      );
      this.place(
        this.meshes[1],
        n,
        x,
        1.45,
        z,
        0.8 * visible,
        height * 0.8 * visible,
        0.75 * visible,
      );
      this.place(
        this.meshes[2],
        n,
        x + 0.05,
        2.03,
        z,
        0.58 * visible,
        height * 0.65 * visible,
        0.57 * visible,
      );
    });
    this.rotation.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
    this.treeTiles.forEach((i, n) => {
      const v = clear(i) ? 1 : 0;
      this.place(
        this.meshes[3],
        n,
        (i % 64) + 0.72,
        0.306,
        Math.floor(i / 64) + 0.85,
        v * 0.9,
        v * 0.65,
        v,
      );
    });
    this.rotation.identity();
    this.flowerTiles.forEach((i, n) => {
      const v = clear(i) ? 1 : 0;
      for (let k = 0; k < 5; k++)
        this.place(
          this.meshes[4],
          n * 5 + k,
          (i % 64) + 0.5 + Math.cos(k * 2.4) * 0.22,
          0.4,
          Math.floor(i / 64) + 0.5 + Math.sin(k * 2.4) * 0.2,
          v,
          v * 0.6,
          v,
        );
    });
    this.meshes.forEach((m) => (m.instanceMatrix.needsUpdate = true));
  }
  dispose() {
    this.group.traverse((object) => {
      if (
        object instanceof THREE.Mesh ||
        object instanceof THREE.LineSegments
      ) {
        object.geometry.dispose();
        const materials = Array.isArray(object.material)
          ? object.material
          : [object.material];
        materials.forEach((m) => m.dispose());
        if (object instanceof THREE.InstancedMesh) object.dispose();
      }
    });
  }
}
export function roofGeometry() {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      [-1, 0, -1, 1, 0, -1, 0, 0.8, -1, -1, 0, 1, 1, 0, 1, 0, 0.8, 1],
      3,
    ),
  );
  geometry.setIndex([
    0, 2, 1, 3, 4, 5, 0, 3, 5, 0, 5, 2, 1, 2, 5, 1, 5, 4, 0, 1, 4, 0, 4, 3,
  ]);
  const flat = geometry.toNonIndexed();
  geometry.dispose();
  flat.computeVertexNormals();
  return flat;
}

export function meadowMaterial() {
  const material = new THREE.MeshLambertMaterial();
  material.name = "mongo-meadow";
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec3 meadowPosition;",
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
vec4 meadowPoint=vec4(transformed,1.0);
#ifdef USE_INSTANCING
meadowPoint=instanceMatrix*meadowPoint;
#endif
meadowPosition=(modelMatrix*meadowPoint).xyz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec3 meadowPosition;",
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
float grain=fract(sin(dot(floor(meadowPosition.xz*7.0),vec2(127.1,311.7)))*43758.5453);
float meadowPatch=sin(meadowPosition.x*.8)*sin(meadowPosition.z*.7);
diffuseColor.rgb*=.98+grain*.025+meadowPatch*.025;`,
      );
  };
  material.customProgramCacheKey = () => "mongo-meadow-v1";
  return material;
}
