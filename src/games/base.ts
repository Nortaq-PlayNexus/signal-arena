import type { FX } from "@/core/fx";
import type { GameId, GameInstance, HudCell, Option } from "@/core/engine";

/** Shared plumbing every arena plugs into: juice hooks + logging. */
export abstract class BaseGame implements GameInstance {
  abstract id: GameId;
  playerCount: number;
  elapsed = 0;
  timeLimit = 90;
  protected fx: FX;
  protected logger: (msg: string) => void;
  protected colors: string[];

  constructor(playerCount: number, colors: string[], fx: FX, logger: (msg: string) => void) {
    this.playerCount = playerCount;
    this.colors = colors;
    this.fx = fx;
    this.logger = logger;
  }

  sound(name: import("@/core/audio").SfxName, v = 1) {
    this.fx.sound(name, v);
  }
  shake(mag: number) {
    this.fx.shake(mag);
  }
  burst(x: number, y: number, color: string, n = 12, speed = 190) {
    this.fx.burst(x, y, color, n, speed);
  }
  flash(color: string, a: number) {
    this.fx.flash(color, a);
  }
  log(msg: string) {
    this.logger(msg);
  }

  abstract update(dt: number, actions: number[]): void;
  abstract draw(ctx: CanvasRenderingContext2D, w: number, h: number): void;
  abstract options(i: number): Option[];
  abstract describe(i: number): string;
  abstract scores(): number[];
  abstract alive(): boolean[];
  abstract hud(i: number): HudCell[];
  abstract human(i: number, b: import("@/core/engine").HumanButtons): void;
  abstract reset(seed: number): void;

  isOver(): boolean {
    const a = this.alive();
    let n = 0;
    for (const v of a) if (v) n++;
    return n <= 1 || this.elapsed >= this.timeLimit;
  }
}

export const pad = (n: number) => (n < 10 ? " " + n : "" + n);
