import { render } from "@testing-library/react";
import { expect, it } from "vitest";

import { ReactionBurst } from "./reaction-burst";

it("bursts confetti to celebrate, hearts and sparkles to encourage, upright marks to say careful", () => {
  const count = (expression: "celebrating" | "encouraging" | "careful") => {
    const { container, unmount } = render(<ReactionBurst moment={{ expression, at: 1 }} />);
    const particles = [...container.querySelectorAll<HTMLElement>(".reaction-particle")];
    const result = { particles: particles.length, badge: container.querySelector(".reaction-burst-badge")!.textContent, upright: particles.every((particle) => particle.style.getPropertyValue("--spin") === "0deg"),
      behind: Boolean(container.querySelector(".reaction-burst-back .reaction-burst-glow")) };
    unmount();
    return result;
  };
  expect(count("celebrating")).toMatchObject({ particles: 26, badge: "🎉", upright: false, behind: true });
  expect(count("encouraging")).toMatchObject({ particles: 12, badge: "💛", upright: true });
  expect(count("careful")).toMatchObject({ particles: 5, badge: "❗", upright: true });
});
