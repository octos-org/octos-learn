import { existsSync } from "node:fs";
import { expect, it } from "vitest";

import { PAINTED_CHARACTERS } from "../avatar/painted-characters";
import { DEFAULT_AVATAR, PRESENTER_AVATARS, presenterAvatar, presenterOfReference } from "./presenters";

it("offers exactly the painted characters, each with the portrait its animated stage draws", () => {
  expect(PRESENTER_AVATARS.map((avatar) => avatar.id)).toEqual(PAINTED_CHARACTERS.map((character) => character.id));
  for (const avatar of PRESENTER_AVATARS) {
    const character = PAINTED_CHARACTERS.find((candidate) => candidate.id === avatar.id)!;
    expect(avatar.portrait).toBe(character.assets.extended);
    expect(avatar.name()).toBe(character.name());
    expect(existsSync(`public/${avatar.portrait}`)).toBe(true);
  }
});

it("shows lessons that name an old placeholder slot with the default character", () => {
  expect(DEFAULT_AVATAR).toBe("star-fox");
  expect(presenterOfReference("avatar:moon-cat").id).toBe("moon-cat");
  for (const legacy of ["avatar:octo", "avatar:avatar-3", undefined]) expect(presenterOfReference(legacy).id).toBe(DEFAULT_AVATAR);
  expect(presenterAvatar("red-panda").id).toBe("red-panda");
});
