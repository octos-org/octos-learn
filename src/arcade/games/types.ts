// The game interface (plan §7.8). Games render round events; they never
// decide correctness, timing or scoring.

import type { RoundEvent, RoundMode } from "../core/round-engine";
import type { QualityTier } from "../render/notebook-kit";

export interface GameContext {
  quality: QualityTier;
  reducedMotion: boolean;
  mode: RoundMode;
}

export interface ArcadeGame {
  readonly id: string;
  mount(host: HTMLElement, context: GameContext): Promise<void>;
  /** Never returns a decision. */
  onEvent(event: RoundEvent): void;
  setQuality(tier: QualityTier): void;
  resize(width: number, height: number): void;
  pause(): void;
  resume(): void;
  /** Releases every GPU resource. */
  dispose(): void;
}

export interface GameInfo {
  id: string;
  /** Chinese source text for `tr()`. */
  name: string;
  /** Chinese source text for `tr()`. */
  blurb: string;
  playable: boolean;
  load?: () => Promise<ArcadeGame>;
}

export const GAMES: readonly GameInfo[] = [
  { id: "margin-run", name: "页边快跑", blurb: "答对一题，小墨就跳过一个障碍。", playable: true, load: () => import("./margin-run/margin-run").then(module => new module.MarginRun()) },
  { id: "paper-glider", name: "纸飞机", blurb: "坐着纸飞机穿过画出来的圆环。", playable: true, load: () => import("./paper-glider/paper-glider").then(module => new module.PaperGlider()) },
  { id: "star-sketch", name: "星星连线", blurb: "一题连一笔，连出会动的星座。", playable: false },
  { id: "up-the-page", name: "一页登顶", blurb: "一题加一块，把塔搭到页顶。", playable: false },
];

export function gameById(id: string): GameInfo | undefined {
  return GAMES.find(game => game.id === id);
}
