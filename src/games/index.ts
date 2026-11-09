import type { FX } from "@/core/fx";
import type { GameId, GameInstance } from "@/core/engine";
import { PelletGame, pelletPrior } from "./pellet";
import { StackGame, stackPrior } from "./stack";
import { CircuitGame, circuitPrior } from "./circuit";
import { BrawlGame, brawlPrior } from "./brawl";

export interface GameMeta {
  id: GameId;
  index: number;
  code: string;
  name: string;
  tag: string;
  blurb: string;
  prior: number[];
  decisionHz: number;
  make: (n: number, colors: string[], fx: FX, log: (m: string) => void, seed: number) => GameInstance;
}

export const GAMES: GameMeta[] = [
  {
    id: "pellet",
    index: 0,
    code: "01",
    name: "PELLET PANIC",
    tag: "MAZE / CONSUME",
    blurb: "Shared maze. Dots are points, power pellets are a licence to hunt. Getting eaten costs you.",
    prior: pelletPrior,
    decisionHz: 11,
    make: (n, c, fx, log, seed) => new PelletGame(n, c, fx, log, seed),
  },
  {
    id: "stack",
    index: 1,
    code: "02",
    name: "STACK RANK",
    tag: "TETRIS / GARBAGE",
    blurb: "Four boards, one identical piece sequence. Every clear dumps garbage on the others.",
    prior: stackPrior,
    decisionHz: 8,
    make: (n, c, fx, log, seed) => new StackGame(n, c, fx, log, seed),
  },
  {
    id: "circuit",
    index: 2,
    code: "03",
    name: "CIRCUIT",
    tag: "KART / 3 LAPS",
    blurb: "Closed ribbon of tarmac, boost pads, contact physics. Off-road is a trap.",
    prior: circuitPrior,
    decisionHz: 12,
    make: (n, c, fx, log, seed) => new CircuitGame(n, c, fx, log, seed),
  },
  {
    id: "brawl",
    index: 3,
    code: "04",
    name: "RING BRAWL",
    tag: "FIGHT / RING-OUT",
    blurb: "One platform, rising knockback, guard that actually works. Ring-outs are permanent.",
    prior: brawlPrior,
    decisionHz: 11,
    make: (n, c, fx, log, seed) => new BrawlGame(n, c, fx, log, seed),
  },
];

export const gameById = (id: GameId) => GAMES.find((g) => g.id === id)!;
