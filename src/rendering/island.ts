import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { Bounds, GameState } from "../simulation/types";
import { boundsBetween } from "../simulation/core";
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
  constructor(
    private host: HTMLElement,
    private onBounds: (b: Bounds, done: boolean) => void,
    private onPick: (i: number) => void,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.setClearColor(0xb7d9d6);
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
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x6d8568, 2.4));
    const sun = new THREE.DirectionalLight(0xffedc6, 2.5);
    sun.position.set(25, 65, 10);
    this.scene.add(sun);
    const sea = new THREE.Mesh(
      new THREE.PlaneGeometry(220, 220),
      new THREE.MeshLambertMaterial({ color: 0x86bcbf }),
    );
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(32, -0.4, 32);
    this.scene.add(sea);
    this.land = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.98, 0.6, 0.98),
      new THREE.MeshLambertMaterial(),
      4096,
    );
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
      this.camera.left = -32 * aspect;
      this.camera.right = 32 * aspect;
      this.camera.top = 32;
      this.camera.bottom = -32;
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
      valid ? 0xf8ffe1 : 0xef6666,
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
    const matrix = new THREE.Matrix4(),
      color = new THREE.Color();
    s.tiles.forEach((tile, i) => {
      matrix.makeTranslation(
        (i % 64) + 0.5,
        tile.land ? 0 : -2,
        Math.floor(i / 64) + 0.5,
      );
      this.land.setMatrixAt(i, matrix);
      const p = tile.parcelId ? s.parcels[tile.parcelId] : undefined;
      color.setHex(
        tile.road
          ? 0xe4d6b6
          : p
            ? colors[p.zone]
            : (i + Math.floor(i / 64)) % 3 === 0
              ? 0x97b97b
              : 0x9fbf82,
      );
      this.land.setColorAt(i, color);
    });
    this.land.instanceMatrix.needsUpdate = true;
    if (this.land.instanceColor) this.land.instanceColor.needsUpdate = true;
    for (const child of [...this.objects.children]) this.disposeObject(child);
    this.objects.clear();
    for (const b of Object.values(s.buildings)) {
      const xs = b.footprint.map((i) => i % 64),
        ys = b.footprint.map((i) => Math.floor(i / 64)),
        x = (Math.min(...xs) + Math.max(...xs) + 1) / 2,
        z = (Math.min(...ys) + Math.max(...ys) + 1) / 2;
      const h = b.active ? (b.definitionId === "hq" ? 2.4 : 1.4) : 0.6;
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(1.65, h, 1.65),
        new THREE.MeshLambertMaterial({
          color: !b.active
            ? 0xc09c6c
            : b.definitionId === "hq"
              ? 0xf4e5be
              : b.definitionId === "agriculture"
                ? 0xefdfaa
                : 0xe8d4c0,
        }),
      );
      body.position.set(x, 0.3 + h / 2, z);
      this.objects.add(body);
      if (b.active) {
        const roof = new THREE.Mesh(
          new THREE.ConeGeometry(1.4, 0.8, 4),
          new THREE.MeshLambertMaterial({
            color:
              b.definitionId === "hq"
                ? 0x526f7b
                : b.definitionId === "agriculture"
                  ? 0xb27357
                  : 0x617d73,
          }),
        );
        roof.rotation.y = Math.PI / 4;
        roof.position.set(x, 0.3 + h + 0.4, z);
        this.objects.add(roof);
      }
      for (let n = 0; n < b.residents; n++) {
        const resident = new THREE.Mesh(
          new THREE.SphereGeometry(0.12, 5, 4),
          new THREE.MeshLambertMaterial({ color: 0xe6ab64 }),
        );
        resident.position.set(x - 0.65 + n * 0.35, 0.55, z + 1.1);
        this.objects.add(resident);
      }
    }
  }
  private disposeObject(object: THREE.Object3D) {
    object.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        const materials = Array.isArray(child.material)
          ? child.material
          : [child.material];
        materials.forEach((m) => m.dispose());
      }
    });
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
    this.disposeObject(this.scene);
    this.renderer.dispose();
    canvas.remove();
  }
}
