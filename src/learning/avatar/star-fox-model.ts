import * as T from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { FACE_CHANNELS, type FaceChannel } from "./face-frame";
import { AVATAR_RIG_SCHEMA, type AvatarRigManifest } from "./rig-contract";

/** Editable, original first sculpt. No external textures, likeness or purchased meshes. */
export const STAR_FOX_VERSION = "0.1.0";
type V = [number, number, number];
type Expression = Partial<Record<FaceChannel, number>>;
const at = (c: Expression, key: FaceChannel) => c[key] ?? 0;
const palette = {
  fur: "#df7c2a", lightFur: "#ffa63e", tip: "#704634", cream: "#fff1d5", muzzle: "#fff6e5", innerEar: "#d18e7d",
  navy: "#24375f", lapel: "#394f7d", silver: "#d1dfed", gold: "#eac57a", dark: "#382c31", mouth: "#361d28", tongue: "#d58a8d", white: "#fffdf4", iris: "#b7762b", pupil: "#231b26",
};

export function makeStarFoxSculpt() {
  const root = new T.Group(); root.name = "StarFox";
  const head = new T.Group(); head.name = "Head"; head.position.y = .32; root.add(head);
  const materials = Object.fromEntries(Object.entries(palette).map(([name, color]) => [name,
    new T.MeshStandardMaterial({ name, color, roughness: name === "pupil" ? .17 : name === "gold" ? .34 : .7, metalness: name === "gold" || name === "silver" ? .25 : 0 })])) as Record<keyof typeof palette, T.MeshStandardMaterial>;
  const channels: AvatarRigManifest["channels"] = {};
  let counter = 0;
  const add = (parent: T.Group, geometry: T.BufferGeometry, color: keyof typeof palette, name = `Part${++counter}`) => {
    const mesh = new T.Mesh(geometry, materials[color]); mesh.name = name; parent.add(mesh); return mesh;
  };
  const ellipsoid = (parent: T.Group, color: keyof typeof palette, p: V, s: V, name?: string) => {
    const g = new T.SphereGeometry(1, 32, 20); g.scale(...s); g.translate(...p); return add(parent, g, color, name);
  };
  const morph = (mesh: T.Mesh, keys: FaceChannel[], deform: (point: T.Vector3, c: Expression) => void) => {
    const geometry = mesh.geometry, base = geometry.getAttribute("position");
    geometry.morphAttributes.position = keys.map((key) => {
      const positions = new Float32Array(base.count * 3);
      for (let i = 0; i < base.count; i++) {
        const v = new T.Vector3().fromBufferAttribute(base, i); deform(v, { [key]: 1 });
        positions.set([v.x - base.getX(i), v.y - base.getY(i), v.z - base.getZ(i)], i * 3);
      }
      const attr = new T.Float32BufferAttribute(positions, 3); attr.name = key; return attr;
    });
    geometry.morphTargetsRelative = true; mesh.updateMorphTargets();
    keys.forEach((key) => (channels[key] ??= []).push({ node: mesh.name, morph: key, gain: 1 }));
  };
  // Smooth curved locks, ear volumes and coat panels are authored as cross-section lofts.
  const lock = (parent: T.Group, color: keyof typeof palette, points: V[], widths: number[], depths: number[], name?: string) => {
    const path = new T.CatmullRomCurve3(points.map((p) => new T.Vector3(...p)));
    const n = 18, sides = 12, pos: number[] = [], indices: number[] = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, center = path.getPoint(t), tangent = path.getTangent(t).normalize();
      const side = new T.Vector3().crossVectors(new T.Vector3(0, 0, 1), tangent).normalize();
      const depth = new T.Vector3().crossVectors(tangent, side).normalize();
      const f = t * (widths.length - 1), a = Math.min(widths.length - 2, Math.floor(f)), r = f - a;
      const w = T.MathUtils.lerp(widths[a]!, widths[a + 1]!, r), d = T.MathUtils.lerp(depths[a]!, depths[a + 1]!, r);
      for (let j = 0; j <= sides; j++) {
        const angle = j / sides * Math.PI * 2;
        const v = center.clone().addScaledVector(side, Math.cos(angle) * w).addScaledVector(depth, Math.sin(angle) * d); pos.push(...v.toArray());
        if (i < n && j < sides) { const k = i * (sides + 1) + j; indices.push(k, k + 1, k + sides + 1, k + 1, k + sides + 2, k + sides + 1); }
      }
    }
    const g = new T.BufferGeometry(); g.setAttribute("position", new T.Float32BufferAttribute(pos, 3)); g.setIndex(indices); g.computeVertexNormals(); return add(parent, g, color, name);
  };
  const curve = (parent: T.Group, color: keyof typeof palette, points: V[], radius: number, name?: string) =>
    add(parent, new T.TubeGeometry(new T.CatmullRomCurve3(points.map((p) => new T.Vector3(...p))), 24, radius, 6, false), color, name);

  // Bust, high collar, overlapping academy lapels and restrained silver/gold detailing.
  ellipsoid(root, "navy", [0, -.88, -.04], [.76, .64, .35]);
  ellipsoid(root, "cream", [0, -.76, .27], [.3, .48, .12]);
  ellipsoid(root, "cream", [0, -.07, .2], [.22, .36, .25]);
  for (const sign of [-1, 1]) {
    lock(root, "navy", [[sign * .49, -.45, -.04], [sign * .7, -.65, .01], [sign * .77, -1.16, .02]], [.18, .27, .15], [.23, .3, .17]);
    lock(root, "lapel", [[sign * .2, -.24, .2], [sign * .37, -.49, .32], [sign * .27, -1.27, .34]], [.1, .115, .09], [.06, .045, .025]);
    curve(root, "silver", [[sign * .14, -.25, .26], [sign * .25, -.5, .4], [sign * .18, -.91, .41], [sign * .16, -1.29, .35]], .012);
    curve(root, "gold", [[sign * .34, -.39, .3], [sign * .46, -.61, .33], [sign * .38, -1.15, .31]], .006);
  }
  for (const y of [-.52, -.77, -1.02]) {
    curve(root, "silver", [[-.08, y, .398], [0, y - .018, .416], [.08, y, .398]], .015);
    ellipsoid(root, "gold", [0, y - .008, .425], [.025, .025, .012]);
  }
  const star = (parent: T.Group, p: V, radius: number) => {
    const shape = new T.Shape();
    for (let i = 0; i < 10; i++) { const a = Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? radius * .43 : radius; const x = Math.cos(a) * r, y = Math.sin(a) * r; if (i) shape.lineTo(x, y); else shape.moveTo(x, y); }
    shape.closePath(); const g = new T.ExtrudeGeometry(shape, { depth: .012, bevelEnabled: true, bevelSize: .004, bevelThickness: .003, bevelSegments: 2, steps: 1 }); g.translate(...p); add(parent, g, "gold");
  };
  ellipsoid(root, "silver", [.45, -.62, .312], [.12, .12, .04]);
  ellipsoid(root, "navy", [.45, -.62, .35], [.099, .099, .014]); star(root, [.45, -.62, .371], .081);
  star(root, [-.51, -.56, .293], .035); star(root, [-.59, -.78, .315], .022);

  // Fox head: tapered lower face, broad soft cheeks, pointed ears, swept forelock.
  const skull = new T.SphereGeometry(1, 48, 32);
  const skullPos = skull.getAttribute("position");
  for (let i = 0; i < skullPos.count; i++) {
    const y = skullPos.getY(i), lower = Math.max(0, -y);
    skullPos.setXYZ(i, skullPos.getX(i) * .68 * (1 - lower * .23), .39 + y * .7, skullPos.getZ(i) * .49 - .03);
  }
  skull.computeVertexNormals(); add(head, skull, "fur");
  for (const sign of [-1, 1]) {
    lock(head, "fur", [[sign * .42, .84, -.08], [sign * .66, 1.23, -.09], [sign * .78, 1.67, -.12]], [.27, .19, .002], [.18, .1, .002]);
    lock(head, "innerEar", [[sign * .48, .95, .074], [sign * .65, 1.25, .016], [sign * .754, 1.56, -.07]], [.15, .108, .001], [.027, .025, .001]);
    lock(head, "cream", [[sign * .48, .96, .105], [sign * .57, 1.11, .082], [sign * .69, 1.36, .015]], [.1, .09, .001], [.02, .024, .001]);
    lock(head, "tip", [[sign * .737, 1.5, -.11], [sign * .765, 1.61, -.117], [sign * .78, 1.67, -.12]], [.058, .026, .001], [.04, .02, .001]);
    ellipsoid(head, "cream", [sign * .34, .19, .335], [.34, .3, .2]);
    // Small cheek locks carry the silhouette instead of a smooth round toy head.
    for (let j = 0; j < 3; j++) {
      lock(head, j === 0 ? "fur" : "cream", [[sign * .4, .34 - j * .16, .15], [sign * .62, .24 - j * .16, .2], [sign * (.75 - j * .055), .26 - j * .19, .17]], [.15, .13, .001], [.11, .1, .001]);
    }
  }
  const hair: { p: V[]; w: number[]; d: number[]; c: "fur" | "lightFur" }[] = [
    { p: [[.14, 1.05, -.02], [-.07, 1.12, .37], [-.36, .84, .55], [-.64, .76, .34]], w: [.24, .27, .2, .001], d: [.16, .17, .12, .001], c: "lightFur" },
    { p: [[.24, 1.04, .06], [.32, 1.04, .38], [.18, .73, .6], [-.08, .59, .57]], w: [.2, .22, .16, .001], d: [.13, .14, .09, .001], c: "fur" },
    { p: [[.42, .92, -.02], [.57, .81, .21], [.63, .52, .35], [.71, .39, .2]], w: [.17, .18, .12, .001], d: [.15, .12, .08, .001], c: "lightFur" },
    { p: [[-.26, 1.01, .04], [-.46, .91, .24], [-.57, .67, .33], [-.68, .59, .22]], w: [.16, .2, .13, .001], d: [.14, .13, .09, .001], c: "fur" },
    { p: [[.05, 1.02, -.19], [-.06, 1.22, -.12], [.06, 1.31, .01], [.17, 1.22, .16]], w: [.14, .1, .065, .001], d: [.12, .08, .045, .001], c: "fur" },
  ];
  hair.forEach((h) => lock(head, h.c, h.p, h.w, h.d));
  // Cream eye masks, amber eyes, pupils and highlights. Lids are actual covering
  // surfaces; a blink does not squash the eyeballs or scale the whole eye group.
  for (const sign of [-1, 1]) {
    const left = sign < 0, blink: FaceChannel = left ? "eyeBlinkLeft" : "eyeBlinkRight";
    const cx = sign * .285, cy = .49, cz = .459, rx = .185, ry = .215;
    ellipsoid(head, "cream", [cx, cy - .015, .38], [.25, .285, .12]);
    ellipsoid(head, "white", [cx, cy, cz], [rx, ry, .105]);
    const gazeMeshes = [
      ellipsoid(head, "iris", [cx + sign * .008, cy - .014, .553], [.105, .151, .035]),
      ellipsoid(head, "gold", [cx + sign * .008, cy - .052, .578], [.084, .092, .016]),
      ellipsoid(head, "pupil", [cx + sign * .008, cy + .002, .586], [.055, .105, .015]),
      ellipsoid(head, "white", [cx - .035, cy + .066, .605], [.031, .038, .009]),
      ellipsoid(head, "white", [cx + .036, cy - .067, .603], [.012, .015, .007]),
    ];
    const lookIn: FaceChannel = left ? "eyeLookInLeft" : "eyeLookInRight", lookOut: FaceChannel = left ? "eyeLookOutLeft" : "eyeLookOutRight";
    const lookUp: FaceChannel = left ? "eyeLookUpLeft" : "eyeLookUpRight", lookDown: FaceChannel = left ? "eyeLookDownLeft" : "eyeLookDownRight";
    for (const mesh of gazeMeshes) morph(mesh, [lookIn, lookOut, lookUp, lookDown], (v, c) => {
      v.x += (at(c, lookOut) - at(c, lookIn)) * sign * .037;
      v.y += (at(c, lookUp) - at(c, lookDown)) * .028;
    });
    for (const upper of [true, false]) {
      const buildLid = (amount: number) => {
        const g = new T.BufferGeometry(), p: number[] = [], ix: number[] = [], n = 32, rings = 5;
        for (let j = 0; j <= rings; j++) for (let i = 0; i <= n; i++) {
          const x = -1 + 2 * i / n, arc = Math.sqrt(Math.max(0, 1 - x * x));
          const edge = upper ? arc * (1 - amount * 1.85) : -arc * (1 - amount * .15);
          const t = j / rings, y = T.MathUtils.lerp(upper ? arc * 1.12 : -arc * 1.12, edge, t);
          // Bulges over the iris as it closes; z always clears the eyeball.
          const z = cz + Math.sqrt(Math.max(0, 1 - x * x)) * .155 + .015;
          p.push(cx + x * rx * 1.03, cy + y * ry, z);
          if (i < n && j < rings) { const k = j * (n + 1) + i; if (upper) ix.push(k, k + n + 1, k + 1, k + 1, k + n + 1, k + n + 2); else ix.push(k, k + 1, k + n + 1, k + 1, k + n + 2, k + n + 1); }
        }
        g.setAttribute("position", new T.Float32BufferAttribute(p, 3)); g.setIndex(ix); g.computeVertexNormals(); return g;
      };
      const rest = buildLid(upper ? .08 : .02), closed = buildLid(1), lid = add(head, rest, "cream", `${left ? "Left" : "Right"}${upper ? "Upper" : "Lower"}Lid`);
      const delta = closed.getAttribute("position").array.slice() as Float32Array, base = rest.getAttribute("position");
      for (let i = 0; i < delta.length; i++) delta[i] = delta[i]! - base.array[i]!;
      const a = new T.Float32BufferAttribute(delta, 3); a.name = blink; rest.morphAttributes.position = [a]; rest.morphTargetsRelative = true; lid.updateMorphTargets(); closed.dispose();
      (channels[blink] ??= []).push({ node: lid.name, morph: blink, gain: 1 });
      // A thin lash follows the inner edge of each upper eyelid.
      if (upper) {
        const lashPoints: V[] = Array.from({ length: 17 }, (_, i) => { const a = Math.PI * i / 16; return [cx - Math.cos(a) * rx, cy + Math.sin(a) * ry * .85, .507 + Math.sin(a) * .063]; });
        const lash = curve(head, "dark", lashPoints, .008, `${left ? "Left" : "Right"}Lash`);
        morph(lash, [blink], (v, c) => { v.y -= at(c, blink) * (v.y - cy) * 2; v.z += at(c, blink) * .05; });
      }
    }
    const brow = curve(head, "tip", [[cx - .15, .783 - sign * .015, .43], [cx, .815, .47], [cx + .15, .762 + sign * .015, .42]], .021, `${left ? "Left" : "Right"}Brow`);
    morph(brow, ["browInnerUp", left ? "browDownLeft" : "browDownRight", left ? "browOuterUpLeft" : "browOuterUpRight"], (v, c) => {
      const inner = Math.max(0, 1 - Math.abs(v.x) / .5); v.y += at(c, "browInnerUp") * .11 * inner;
      v.y += at(c, left ? "browOuterUpLeft" : "browOuterUpRight") * .095 * (1 - inner);
      v.y -= at(c, left ? "browDownLeft" : "browDownRight") * .08;
    });
  }

  // A forward muzzle keeps the mouth in front of the skull at every opening.
  for (const sign of [-1, 1]) ellipsoid(head, "muzzle", [sign * .18, .105, .51], [.265, .18, .22]);
  const chin = ellipsoid(head, "muzzle", [0, -.075, .48], [.27, .12, .19], "Chin");
  morph(chin, ["jawOpen", "mouthClose"], (v, c) => { v.y -= at(c, "jawOpen") * .18; v.y += at(c, "mouthClose") * .012; });
  const nose = new T.SphereGeometry(1, 32, 20); nose.scale(.088, .061, .065);
  const np = nose.getAttribute("position"); for (let i = 0; i < np.count; i++) np.setX(i, np.getX(i) * (1 + np.getY(i) * 3)); nose.translate(0, .205, .738); nose.computeVertexNormals(); add(head, nose, "dark");
  ellipsoid(head, "white", [-.025, .227, .793], [.022, .009, .004]);
  curve(head, "tip", [[0, .155, .753], [0, .108, .755], [0, .076, .757]], .008);
  const mouthKeys: FaceChannel[] = ["jawOpen", "mouthClose", "mouthPucker", "mouthFunnel", "mouthSmileLeft", "mouthSmileRight"];
  const mouthPoint = (theta: number, radial: number, c: Expression): V => {
    const x = Math.cos(theta), y = Math.sin(theta), open = at(c, "jawOpen"), close = at(c, "mouthClose"), pucker = at(c, "mouthPucker"), funnel = at(c, "mouthFunnel");
    const smile = x < 0 ? at(c, "mouthSmileLeft") : at(c, "mouthSmileRight");
    const w = .158 * (1 - pucker * .45 - funnel * .24 + smile * .26);
    const h = .008 + open * .097 - close * .006 + pucker * .027 + funnel * .045;
    return [x * w * radial, .005 + .009 * x * x * radial + y * h * radial - open * .066 + smile * x * x * .065,
      .762 + pucker * .08 + funnel * .045 - (1 - radial) * .045];
  };
  const mouthGeometry = (c: Expression, rim: boolean) => {
    const p: number[] = [], ix: number[] = [], n = 48, rings = rim ? 4 : 6;
    for (let j = 0; j <= rings; j++) for (let i = 0; i <= n; i++) {
      const t = i / n * Math.PI * 2, r = rim ? 1 + .15 * j / rings : j / rings, v = mouthPoint(t, r, c);
      if (rim) { v[1] += Math.sin(t) * .009 * Math.sin(j / rings * Math.PI); v[2] += .005 * Math.sin(j / rings * Math.PI); }
      p.push(...v); if (j < rings && i < n) { const k = j * (n + 1) + i; ix.push(k, k + n + 1, k + 1, k + 1, k + n + 1, k + n + 2); }
    }
    const g = new T.BufferGeometry(); g.setAttribute("position", new T.Float32BufferAttribute(p, 3)); g.setIndex(ix); g.computeVertexNormals(); return g;
  };
  for (const rim of [false, true]) {
    const geometry = mouthGeometry({}, rim), mesh = add(head, geometry, rim ? "tip" : "mouth", rim ? "LipContour" : "OralCavity");
    geometry.morphAttributes.position = mouthKeys.map((key) => {
      const target = mouthGeometry({ [key]: 1 }, rim), delta = target.getAttribute("position").array.slice() as Float32Array, base = geometry.getAttribute("position").array;
      for (let i = 0; i < delta.length; i++) delta[i] -= base[i]!;
      target.dispose(); const a = new T.Float32BufferAttribute(delta, 3); a.name = key; return a;
    });
    geometry.morphTargetsRelative = true; mesh.updateMorphTargets(); mouthKeys.forEach((key) => (channels[key] ??= []).push({ node: mesh.name, morph: key, gain: 1 }));
  }
  // Tongue and upper tooth grow into view behind the lip edge only when open.
  const tongue = ellipsoid(head, "tongue", [0, -.003, .735], [.083, .001, .009], "Tongue");
  morph(tongue, ["jawOpen"], (v, c) => { v.y -= at(c, "jawOpen") * (.1 + (v.y + .003) * 15); v.z += at(c, "jawOpen") * .002; });
  const teeth = ellipsoid(head, "white", [0, .01, .748], [.08, .001, .008], "UpperTeeth");
  morph(teeth, ["jawOpen"], (v, c) => { v.y -= at(c, "jawOpen") * .011; v.y += at(c, "jawOpen") * (v.y - .01) * 12; });
  // Merge static geometry by material within head/body. Moving/morph meshes stay
  // separate and named; no per-frame geometry allocation or traversal is needed.
  for (const parent of [root, head]) {
    for (const material of Object.values(materials)) {
      const meshes = parent.children.filter((n): n is T.Mesh => n instanceof T.Mesh && n.material === material && !n.geometry.morphAttributes.position);
      if (!meshes.length) continue;
      const geometries = meshes.map((m) => {
        const g = m.geometry.clone(); g.deleteAttribute("uv");
        if (!g.index) g.setIndex(Array.from({ length: g.getAttribute("position").count }, (_, i) => i));
        return g;
      });
      const merged = mergeGeometries(geometries);
      geometries.forEach((g) => g.dispose());
      meshes.forEach((m) => { parent.remove(m); m.geometry.dispose(); });
      if (merged) {
        const mesh = add(parent, merged, material.name as keyof typeof palette, `${parent === head ? "Head" : "Bust"}_${material.name}`);
        if (parent === root) mesh.position.y = .16;
      }
    }
  }
  root.traverse((node) => { if (node instanceof T.Mesh) node.geometry.deleteAttribute("uv"); });
  const manifest: AvatarRigManifest = { schema: AVATAR_RIG_SCHEMA, id: "star-fox-sculpt", version: STAR_FOX_VERSION, modelSha256: "0".repeat(64),
    headRotation: { node: "Head", signs: [-1, -1, -1] }, channels, unsupportedChannels: FACE_CHANNELS.filter((key) => !channels[key]) };
  return { root, manifest };
}
