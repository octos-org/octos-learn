import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { advanceFlight, FlightPath, gateCentre, hoverPoint, type Flight } from "./paper-glider";

const STEP = 1 / 60;

function fly(flight: Flight, hold: number, frames: number, each?: (previous: number) => void): void {
  for (let i = 0; i < frames; i++) {
    const previous = flight.speed;
    advanceFlight(flight, hold, STEP);
    each?.(previous);
  }
}

describe("Paper Glider flight line", () => {
  it("goes through the exact middle of each hoop, square on, so the camera riding it does too", () => {
    const path = new FlightPath(hoverPoint(-1));
    for (let index = 0; index < 6; index++) {
      path.extendTo(hoverPoint(index).add(new THREE.Vector3(0, 0, 6)));
      path.extendTo(hoverPoint(index));
      // Choice mode: the hoop on the left or right of the gate.
      const hoop = gateCentre(index).add(new THREE.Vector3(index % 2 ? 3.3 : -3.3, 0, 0));
      const at = path.extendTo(hoop);
      expect(path.at(at, new THREE.Vector3()).distanceTo(hoop)).toBeLessThan(1e-6);
      const before = path.at(at - 0.4, new THREE.Vector3());
      const after = path.at(at + 0.4, new THREE.Vector3());
      const direction = after.sub(before).normalize();
      expect(direction.z).toBeLessThan(-0.995);
    }
  });

  it("runs straight on before its start and past its end", () => {
    const path = new FlightPath(new THREE.Vector3(1, 2, 0));
    path.extendTo(new THREE.Vector3(1, 2, -10));
    expect(path.at(-5, new THREE.Vector3()).toArray()).toEqual([1, 2, 5]);
    expect(path.at(path.length + 3, new THREE.Vector3()).toArray()).toEqual([1, 2, -13]);
  });
});

describe("Paper Glider flight speed", () => {
  it("takes off softly, never jolts, and glides in to stop exactly at the hover point", () => {
    const flight: Flight = { s: 0, speed: 0, climb: 0, launch: 0, target: 0 };
    let first = -1;
    let steepest = 0;
    let fastest = 0;
    fly(flight, 30, 60 * 5, previous => {
      if (first < 0) first = flight.speed;
      steepest = Math.max(steepest, Math.abs(flight.speed - previous) / STEP);
      fastest = Math.max(fastest, flight.speed);
      expect(flight.s).toBeLessThanOrEqual(30);
    });
    expect(first).toBeLessThan(1);
    expect(steepest).toBeLessThan(25);
    expect(fastest).toBeLessThanOrEqual(16);
    expect(flight.s).toBe(30);
    expect(flight.speed).toBe(0);
  });

  it("carries straight on without stopping when the next answer comes mid-flight", () => {
    const flight: Flight = { s: 0, speed: 0, climb: 0, launch: 0, target: 0 };
    fly(flight, 30, 60);
    expect(flight.s).toBeLessThan(30);
    let slowest = Infinity;
    let steepest = 0;
    while (flight.s < 45) {
      const previous = flight.speed;
      advanceFlight(flight, 60, STEP);
      slowest = Math.min(slowest, flight.speed);
      steepest = Math.max(steepest, Math.abs(flight.speed - previous) / STEP);
    }
    expect(slowest).toBeGreaterThan(8);
    expect(steepest).toBeLessThan(25);
  });
});
