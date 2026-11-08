import type { Solid, SolidShape } from "./recording";

export type SolidChoice = Exclude<SolidShape, "composite"> | "cube" | "truncated" | Extract<Solid, { shape: "composite" }>["parts"];

const thumbnails: Record<SolidChoice, readonly [silhouette: string, edges: string]> = {
  box: ["M4 11 16 5 28 10v12l-12 6-12-5Z", "m4 11 12 5 12-6m-12 6v12"],
  cube: ["M5 9 16 3l11 6v14l-11 6-11-6Z", "m5 9 11 6 11-6m-11 6v14"],
  cylinder: ["M7 8c0-5 18-5 18 0v16c0 5-18 5-18 0Z", "M7 8c0 5 18 5 18 0"],
  cone: ["M16 3 5 24c0 6 22 6 22 0Z", "M5 24c0-5 22-5 22 0"],
  sphere: ["M16 4a12 12 0 1 1 0 24 12 12 0 0 1 0-24Z", "M4 16c0 7 24 7 24 0M16 4c-7 0-7 24 0 24"],
  hemisphere: ["M4 22a12 12 0 0 1 24 0c0 6-24 6-24 0Z", "M4 22c0-5 24-5 24 0"],
  ellipsoid: ["M16 7a13 9 0 1 1 0 18 13 9 0 0 1 0-18Z", "M3 16c0 5 26 5 26 0M16 7c-7 0-7 18 0 18"],
  frustum: ["M10 8c0-4 12-4 12 0l6 16c0 5-24 5-24 0Z", "M10 8c0 4 12 4 12 0"],
  torus: ["M16 8a13 8 0 1 1 0 16 13 8 0 0 1 0-16Zm0 5a6 3 0 1 0 0 6 6 3 0 0 0 0-6Z", "M3 16c0 7 26 7 26 0"],
  prism: ["M4 12 12 7l11-3 5 8v10l-11 6-13-5Z", "m4 12 13 5 11-5m-16-5 5 10v11"],
  pyramid: ["M16 3 3 21l13 8 13-8Z", "m16 3 0 26m-13-8 13-4 13 4"],
  truncated: ["M10 8 17 4l7 4 5 14-13 7-13-7Z", "m10 8 6 4 8-4m-8 4v17"],
  cylinder_cone: ["M16 2 6 14v11c0 5 20 5 20 0V14Z", "M6 14c0 5 20 5 20 0"],
  cylinder_hemisphere: ["M6 14a10 10 0 0 1 20 0v11c0 5-20 5-20 0Z", "M6 14c0 5 20 5 20 0"],
  box_pyramid: ["M16 2 4 14v9l12 6 12-6v-9Z", "m16 2 0 18m-12-6 12 6 12-6m-12 6v9"],
  two_cylinders: ["M10 7c0-4 12-4 12 0v7c4 1 6 2 6 4v6c0 6-24 6-24 0v-6c0-2 2-3 6-4Z", "M10 7c0 4 12 4 12 0m-12 7c0 4 12 4 12 0M4 18c0 6 24 6 24 0"],
  tetrahedron: ["M15 3 4 24l12 5 12-7Z", "m15 3 1 26"],
  octahedron: ["M16 2 4 16l12 14 12-14Z", "m16 2 2 17-2 11M4 16l14 3 10-3"],
  dodecahedron: ["M9 5 20 3l8 8v12l-10 6-11-4-4-11Z", "m9 5 2 7 9-3 5 7-5 8-9-2-2-8 2-2m9-3 0-6m5 13 3-5m-3 5 3 7m-8 1-2 5m-7-7-4 3m2-11-6 0"],
  icosahedron: ["M16 3 5 9 3 20l11 9 12-5 3-12Z", "m16 3-4 9 17 0M5 9l7 3-9 8m9-8 2 17m-2-17 14 12"],
};

export function SolidThumbnail({ shape }: { shape: SolidChoice }) {
  const [silhouette, edges] = thumbnails[shape];
  return (
    <svg className="teach-solid-thumbnail" viewBox="0 0 32 32" aria-hidden="true" stroke="currentColor" strokeWidth="1.35" strokeLinejoin="round" strokeLinecap="round">
      <path d={silhouette} fill="currentColor" fillOpacity=".12" fillRule="evenodd" />
      <path d={edges} fill="none" opacity=".76" />
    </svg>
  );
}
