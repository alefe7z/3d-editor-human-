// SPDX-License-Identifier: GPL-3.0-or-later
export const APPEARANCE = Object.freeze({
  skinPores: 0.35,
  skinRoughness: 0.56,
  skinScattering: 1,
  skinFuzz: 0.22,
  skinWrinkles: 0.25,
  hairShine: 0.55,
  hairMotion: 0.45,
});

export function normalizeAppearance(source) {
  return Object.fromEntries(Object.entries(APPEARANCE).map(([key, fallback]) => {
    const value = source?.[key];
    return [key, Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback];
  }));
}
