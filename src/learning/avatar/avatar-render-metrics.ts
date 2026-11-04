/** Renderer-neutral observations. Submission time is not end-to-end/GPU latency. */
export interface AvatarRenderMetrics {
  fps: number;
  submissionP95Ms: number;
  renderer: string;
  geometries?: number;
  textures?: number;
}
