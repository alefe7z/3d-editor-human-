// SPDX-License-Identifier: GPL-3.0-or-later
export const CHEST_APPEARANCE = Object.freeze({
  areolaPigmentation: 0.5,
  areolaCoverage: 0.5,
  nippleRelief: 0,
  nippleWidth: 0.5,
  nippleTip: 0.5,
  breastMotion: 0.5,
});

export const HAIR_LOOK_RANGES = Object.freeze({
  hairRootMix: [0, 1],
  hairSoft: [0, 1],
  hairDensity: [0.3, 1.5],
  hairStrandVar: [0, 0.8],
});

export const APPEARANCE = Object.freeze({
  ...CHEST_APPEARANCE,
  skinPores: 0.35,
  skinRoughness: 0.56,
  skinScattering: 1,
  skinFuzz: 0.22,
  skinWrinkles: 0.25,
  hairShine: 0.55,
  hairRootMix: 0,
  hairSoft: 0.4,
  hairDensity: 1.2,
  hairStrandVar: 0.36,
  hairMotion: 0.45,
  gluteMotion: 0.35,
  frontHipMotion: 0.35,
  externalMotion: 0.25,
});

export function normalizeAppearance(source) {
  return Object.fromEntries(Object.entries(APPEARANCE).map(([key, fallback]) => {
    const value = source?.[key];
    const [min, max] = HAIR_LOOK_RANGES[key] ?? [0, 1];
    return [key, Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback];
  }));
}
