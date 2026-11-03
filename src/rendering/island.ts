import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { Bounds, GameState } from "../simulation/types";
import { boundsBetween } from "../simulation/core";
import { Landscape, roofGeometry, meadowMaterial } from "./landscape";
export type Tool =
  "hq" | "agriculture" | "residential" | "commercial" | "select" | "pan";
const colors = {
  agriculture: 0xc4c970,
  residential: 0x8abaaa,
  commercial: 0xdab58b,
};
export class Island {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private landscape?: Landscape;
  private scenerySignature = "";
  private gridLines?: THREE.LineSegments;
  private gridVisible = false;
  private camera = new THREE.OrthographicCamera(-40, 40, 30, -30, 0.1, 250);
  private controls: OrbitControls;
  private land: THREE.InstancedMesh;
  private objects = new THREE.Group();
  private selection: THREE.Mesh;
  private frame = 0;
  private needsRender = true;
  private resize: ResizeObserver;
  private start?: number;
  private pointers = new Set<number>();
  private tool: Tool = "hq";
  private ray = new THREE.Raycaster();
  private signature = "";
  private tileSignature = "";
  private buildingViews = new Map<
    string,
    { signature: string; group: THREE.Group }
  >();
  private geometries = new Map<string, THREE.BufferGeometry>();
  private materials = new Map<number, THREE.MeshLambertMaterial>();
  constructor(
    private host: HTMLElement,
    private onBounds: (b: Bounds, done: boolean) => void,
    private onPick: (i: number) => void,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.setClearColor(0x80c7df);
    host.append(this.renderer.domElement);
    this.camera.position.set(83, 85, 100);
    this.camera.lookAt(32, 0, 32);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(32, 0, 32);
    this.controls.enableRotate = false;
    this.controls.screenSpacePanning = false;
    this.controls.minZoom = 0.7;
    this.controls.maxZoom = 5;
    this.controls.mouseButtons.LEFT = THREE.MOUSE.PAN;
    this.controls.update();
    this.controls.addEventListener("change", () => {
      this.needsRender = true;
    });
    this.scene.add(new THREE.HemisphereLight(0xf5f8ff, 0xb4ac87, 1.8));
    const sun = new THREE.DirectionalLight(0xffefd8, 2.0);
    sun.position.set(25, 65, 10);
    this.scene.add(sun);
    const sea = new THREE.Mesh(
      new THREE.PlaneGeometry(220, 220),
      new THREE.MeshBasicMaterial({ color: 0x80c7df }),
    );
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(32, -0.4, 32);
    this.scene.add(sea);
    this.land = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      meadowMaterial(),
      4096,
    );
    this.land.frustumCulled = false;
    this.scene.add(this.land, this.objects);
    this.selection = new THREE.Mesh(
      new THREE.BoxGeometry(1, 0.1, 1),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.5,
        depthTest: false,
      }),
    );
    this.selection.add(
      new THREE.LineSegments(
        new THREE.EdgesGeometry(this.selection.geometry),
        new THREE.LineBasicMaterial({ color: 0x749f42, depthTest: false }),
      ),
    );
    this.selection.visible = false;
    this.selection.renderOrder = 10;
    this.scene.add(this.selection);
    const canvas = this.renderer.domElement;
    canvas.setAttribute("aria-label", "島嶼規劃地圖");
    canvas.addEventListener("pointerdown", this.down);
    canvas.addEventListener("pointermove", this.move);
    canvas.addEventListener("pointerup", this.up);
    canvas.addEventListener("pointercancel", this.cancel);
    canvas.addEventListener("wheel", this.wheel, { passive: false });
    this.resize = new ResizeObserver(() => {
      const { width, height } = host.getBoundingClientRect();
      this.renderer.setSize(width, height);
      const aspect = width / height;
      const halfHeight =
        height < 600 && aspect > 1.4 ? 15 : width < 700 ? 25 : 26;
      this.camera.left = -halfHeight * aspect;
      this.camera.right = halfHeight * aspect;
      this.camera.top = halfHeight;
      this.camera.bottom = -halfHeight;
      this.camera.updateProjectionMatrix();
      this.needsRender = true;
    });
    this.resize.observe(host);
    const animate = () => {
      this.frame = requestAnimationFrame(animate);
      this.controls.update();
      if (this.needsRender) {
        this.renderer.render(this.scene, this.camera);
        this.needsRender = false;
      }
    };
    animate();
    this.setTool("hq");
  }
  setTool(tool: Tool) {
    this.tool = tool;
    this.start = undefined;
    this.controls.enabled = tool === "pan";
    this.host.style.cursor = tool === "pan" ? "grab" : "crosshair";
  }
  resetView() {
    this.controls.target.set(32, 0, 32);
    this.camera.position.set(83, 85, 100);
    this.camera.zoom = 1;
    this.controls.update();
    this.camera.updateProjectionMatrix();
    this.needsRender = true;
  }
  setGridVisible(visible: boolean) {
    this.gridVisible = visible;
    if (this.gridLines) this.gridLines.visible = visible;
    this.needsRender = true;
  }
  zoom(factor: number) {
    this.camera.zoom = THREE.MathUtils.clamp(this.camera.zoom * factor, 0.7, 5);
    this.camera.updateProjectionMatrix();
    this.needsRender = true;
  }
  private wheel = (e: WheelEvent) => {
    if (this.tool === "pan") return;
    e.preventDefault();
    this.zoom(e.deltaY < 0 ? 1.1 : 1 / 1.1);
  };
  private pick(e: PointerEvent): number | undefined {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.ray.setFromCamera(
      new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        (-(e.clientY - rect.top) / rect.height) * 2 + 1,
      ),
      this.camera,
    );
    const hit = this.ray.ray.intersectPlane(
      new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.3),
      new THREE.Vector3(),
    );
    if (!hit) return;
    const x = Math.floor(hit.x),
      y = Math.floor(hit.z);
    if (x < 0 || y < 0 || x >= 64 || y >= 64) return;
    return y * 64 + x;
  }
  private down = (e: PointerEvent) => {
    this.pointers.add(e.pointerId);
    if (this.pointers.size > 1) {
      this.start = undefined;
      return;
    }
    if (this.tool === "pan" || e.button !== 0) return;
    const i = this.pick(e);
    if (i === undefined) return;
    this.renderer.domElement.setPointerCapture(e.pointerId);
    if (this.tool === "select") {
      this.onPick(i);
      return;
    }
    this.start = i;
    this.onBounds(this.bounds(i), false);
  };
  private bounds(i: number) {
    if (this.tool === "hq")
      return {
        minX: i % 64,
        minY: Math.floor(i / 64),
        maxXExclusive: (i % 64) + 2,
        maxYExclusive: Math.floor(i / 64) + 2,
      };
    return boundsBetween(this.start ?? i, i);
  }
  private move = (e: PointerEvent) => {
    if (this.start === undefined || this.pointers.size > 1) return;
    const i = this.pick(e);
    if (i !== undefined) this.onBounds(this.bounds(i), false);
  };
  private up = (e: PointerEvent) => {
    if (this.start !== undefined && this.pointers.size === 1) {
      const i = this.pick(e);
      if (i !== undefined) this.onBounds(this.bounds(i), true);
    }
    this.start = undefined;
    this.pointers.delete(e.pointerId);
  };
  private cancel = (e: PointerEvent) => {
    this.start = undefined;
    this.pointers.delete(e.pointerId);
  };
  showBounds(bounds: Bounds | null, valid = true) {
    this.needsRender = true;
    this.selection.visible = !!bounds;
    if (!bounds) return;
    const w = bounds.maxXExclusive - bounds.minX,
      h = bounds.maxYExclusive - bounds.minY;
    this.selection.position.set(bounds.minX + w / 2, 0.8, bounds.minY + h / 2);
    this.selection.scale.set(w, 1, h);
    (this.selection.material as THREE.MeshBasicMaterial).color.setHex(
      valid ? 0xa8d76c : 0xef9990,
    );
  }
  project(s: GameState) {
    const signature = JSON.stringify([
      s.gameId,
      s.roadRevision,
      s.parcels,
      s.buildings,
    ]);
    if (signature === this.signature) return;
    this.signature = signature;
    this.needsRender = true;
    if (!this.landscape) {
      this.landscape = new Landscape(s.tiles);
      this.scene.add(this.landscape.group);
      const vertices: number[] = [];
      s.tiles.forEach((tile, i) => {
        if (!tile.land) return;
        const x = i % 64,
          z = Math.floor(i / 64);
        vertices.push(
          x,
          0.315,
          z,
          x + 1,
          0.315,
          z,
          x,
          0.315,
          z,
          x,
          0.315,
          z + 1,
        );
      });
      this.gridLines = new THREE.LineSegments(
        new THREE.BufferGeometry().setAttribute(
          "position",
          new THREE.Float32BufferAttribute(vertices, 3),
        ),
        new THREE.LineBasicMaterial({
          color: 0x665d40,
          transparent: true,
          opacity: 0.18,
          depthWrite: false,
        }),
      );
      this.gridLines.visible = this.gridVisible;
      this.scene.add(this.gridLines);
    }
    const scenerySignature = JSON.stringify([
      s.gameId,
      s.roadRevision,
      Object.values(s.parcels).map((p) => p.bounds),
      Object.values(s.buildings).map((b) => b.footprint),
    ]);
    if (scenerySignature !== this.scenerySignature) {
      this.scenerySignature = scenerySignature;
      this.landscape.update(s.tiles);
    }
    const tileSignature = JSON.stringify([
      s.gameId,
      s.roadRevision,
      Object.values(s.parcels).map((p) => [p.id, p.zone, p.bounds]),
    ]);
    if (this.tileSignature !== tileSignature) {
      this.tileSignature = tileSignature;
      const matrix = new THREE.Matrix4(),
        color = new THREE.Color();
      s.tiles.forEach((tile, i) => {
        matrix.makeTranslation(
          (i % 64) + 0.5,
          tile.land ? 0.3 : -2,
          Math.floor(i / 64) + 0.5,
        );
        this.land.setMatrixAt(i, matrix);
        const p = tile.parcelId ? s.parcels[tile.parcelId] : undefined;
        color.setHex(
          tile.road
            ? 0xe4d6b6
            : p
              ? colors[p.zone]
              : tile.coastDistance <= 1
                ? 0xdac08d
                : tile.coastDistance <= 2
                  ? 0xa7b677
                  : 0x86a85e,
        );
        this.land.setColorAt(i, color);
      });
      this.land.instanceMatrix.needsUpdate = true;
      if (this.land.instanceColor) this.land.instanceColor.needsUpdate = true;
    }
    for (const [id, view] of this.buildingViews)
      if (!s.buildings[id]) {
        this.objects.remove(view.group);
        this.buildingViews.delete(id);
      }
    for (const b of Object.values(s.buildings)) {
      const signature = JSON.stringify(b),
        previous = this.buildingViews.get(b.id);
      if (previous?.signature === signature) continue;
      if (previous) this.objects.remove(previous.group);
      const group = new THREE.Group();
      this.buildingViews.set(b.id, { signature, group });
      this.objects.add(group);
      const xs = b.footprint.map((i) => i % 64),
        ys = b.footprint.map((i) => Math.floor(i / 64)),
        x = (Math.min(...xs) + Math.max(...xs) + 1) / 2,
        z = (Math.min(...ys) + Math.max(...ys) + 1) / 2;
      const h = b.active ? (b.definitionId === "hq" ? 2.4 : 1.4) : 0.6;
      const body = new THREE.Mesh(
        this.geometry(`body-${h}`, () => new THREE.BoxGeometry(1.65, h, 1.65)),
        this.material(
          !b.active
            ? 0xc09c6c
            : b.definitionId === "hq"
              ? 0xf4e5be
              : b.definitionId === "agriculture"
                ? 0xefdfaa
                : 0xe8d4c0,
        ),
      );
      body.position.set(x, 0.3 + h / 2, z);
      group.add(body);
      if (b.active) {
        const roof = new THREE.Mesh(
          this.geometry("roof", roofGeometry),
          this.material(
            b.definitionId === "hq"
              ? 0x526f7b
              : b.definitionId === "agriculture"
                ? 0xb27357
                : 0x617d73,
          ),
        );
        roof.rotation.y = 0;
        roof.position.set(x, 0.3 + h, z);
        group.add(roof);
      }
      if (b.active) {
        const door = new THREE.Mesh(
          this.geometry("door", () => new THREE.BoxGeometry(0.38, 0.65, 0.06)),
          this.material(0x9c7951),
        );
        door.position.set(x, 0.64, z + 0.85);
        group.add(door);
        for (const dx of [-0.53, 0.53]) {
          const frame = new THREE.Mesh(
            this.geometry(
              "window-frame",
              () => new THREE.BoxGeometry(0.36, 0.38, 0.06),
            ),
            this.material(0xfff1d2),
          );
          frame.position.set(x + dx, 0.3 + h * 0.64, z + 0.85);
          group.add(frame);
          const glass = new THREE.Mesh(
            this.geometry(
              "window-glass",
              () => new THREE.BoxGeometry(0.26, 0.25, 0.03),
            ),
            this.material(0x91b6c1),
          );
          glass.position.set(x + dx, 0.3 + h * 0.64, z + 0.9);
          group.add(glass);
        }
        if (b.definitionId === "hq") {
          const pole = new THREE.Mesh(
            this.geometry(
              "flagpole",
              () => new THREE.CylinderGeometry(0.03, 0.03, 0.9, 5),
            ),
            this.material(0x8d7859),
          );
          pole.position.set(x, 0.3 + h + 0.98, z);
          group.add(pole);
          const flag = new THREE.Mesh(
            this.geometry("flag", () => new THREE.BoxGeometry(0.4, 0.23, 0.04)),
            this.material(0xd88c76),
          );
          flag.position.set(x + 0.2, 0.3 + h + 1.28, z);
          group.add(flag);
        }
      }
      for (let n = 0; n < b.residents; n++) {
        const resident = new THREE.Mesh(
          this.geometry("resident", () => new THREE.SphereGeometry(0.12, 5, 4)),
          this.material(0xe6ab64),
        );
        resident.position.set(x - 0.65 + n * 0.35, 0.55, z + 1.1);
        group.add(resident);
      }
    }
  }
  private geometry(key: string, create: () => THREE.BufferGeometry) {
    let value = this.geometries.get(key);
    if (!value) {
      value = create();
      this.geometries.set(key, value);
    }
    return value;
  }
  private material(color: number) {
    let value = this.materials.get(color);
    if (!value) {
      value = new THREE.MeshLambertMaterial({ color });
      this.materials.set(color, value);
    }
    return value;
  }
  private disposeObject(object: THREE.Object3D) {
    const geometries = new Set(this.geometries.values());
    const materials = new Set<THREE.Material>(this.materials.values());
    object.traverse((child) => {
      if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments) {
        geometries.add(child.geometry);
        for (const material of Array.isArray(child.material)
          ? child.material
          : [child.material])
          materials.add(material);
      }
    });
    geometries.forEach((value) => value.dispose());
    materials.forEach((value) => value.dispose());
    this.geometries.clear();
    this.materials.clear();
    this.buildingViews.clear();
  }
  dispose() {
    cancelAnimationFrame(this.frame);
    this.resize.disconnect();
    this.controls.dispose();
    const canvas = this.renderer.domElement;
    canvas.removeEventListener("pointerdown", this.down);
    canvas.removeEventListener("pointermove", this.move);
    canvas.removeEventListener("pointerup", this.up);
    canvas.removeEventListener("pointercancel", this.cancel);
    canvas.removeEventListener("wheel", this.wheel);
    this.landscape?.dispose();
    if (this.landscape) this.scene.remove(this.landscape.group);
    if (this.gridLines) {
      this.gridLines.geometry.dispose();
      (this.gridLines.material as THREE.Material).dispose();
      this.scene.remove(this.gridLines);
    }
    this.disposeObject(this.scene);
    this.renderer.dispose();
    canvas.remove();
  }
}
