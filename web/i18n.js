// SPDX-License-Identifier: MIT
// UI language: Portuguese (pt), Danish (da) or English (en). ?lang=pt|da|en wins; otherwise the first of the
// system / browser languages that we have (navigator.languages), otherwise Portuguese. The desktop app reports the
// operating system language, so a Brazilian Windows gets Portuguese.
// Catalog labels: clothing.json / hair.json (written by the Blender build) carry da / en labels; the Portuguese
// ones live here, keyed by id, so the generated data need not change.

export const LANGS = ['pt', 'da', 'en'];
export const DEFAULT_LANG = 'pt';

/** @param {URLSearchParams} params  @param {readonly string[]} [preferred] e.g. navigator.languages */
export function pickLang(params, preferred = (typeof navigator !== 'undefined' && (navigator.languages?.length ? navigator.languages : [navigator.language])) || []) {
  const asked = params?.get?.('lang');
  if (asked && LANGS.includes(asked)) return asked;
  for (const l of preferred) {
    const base = String(l || '').toLowerCase().split(/[-_]/)[0];
    if (LANGS.includes(base)) return base;
  }
  return DEFAULT_LANG;
}

const PT = {
  'slot:underwear': 'Roupa íntima', 'slot:bra': 'Sutiã', 'slot:top': 'Parte de cima', 'slot:bottom': 'Parte de baixo',
  'slot:shoes': 'Calçados', 'slot:outerwear': 'Agasalho',
  'item:briefs': 'Cueca', 'item:panties': 'Calcinha', 'item:bra': 'Sutiã', 'item:dress': 'Vestido',
  'item:shirt': 'Camisa de manga longa', 'item:tshirt': 'Camiseta', 'item:hoodie': 'Moletom com capuz',
  'item:jeans': 'Calça jeans', 'item:shorts': 'Bermuda', 'item:skirt': 'Saia', 'item:boots': 'Botas',
  'item:shoes': 'Sapatos', 'item:jacket': 'Jaqueta', 'item:trenchcoat': 'Sobretudo',
  'hair:short02': 'Curto', 'hair:bob02': 'Chanel', 'hair:long01': 'Longo', 'hair:ponytail01': 'Rabo de cavalo',
  'hair:braid01': 'Trança', 'hair:short04': 'Curto, liso', 'hair:bob01': 'Chanel, longo', 'hair:afro01': 'Afro',
};

/**
 * Label of a catalog entry: label = { da, en, pt? } from the JSON, key = 'slot:<id>' | 'item:<id>' | 'hair:<id>'.
 * Portuguese falls back to English, then Danish, then the id.
 */
export function catalogLabel(label, lang, key, id = key) {
  if (label?.[lang]) return label[lang];
  if (lang === 'pt' && PT[key]) return PT[key];
  return label?.en ?? label?.da ?? id;
}

export const PT_CATALOG = PT;

// Display names of the vendored hair shader's colour presets (HAIR_COLOR_STYLES keys stay the ids).
const PRESETS_PT = {
  'Blonde': 'Loiro', 'Dark Blonde': 'Loiro escuro', 'Platina Blonde': 'Loiro platinado', 'Strawberry Blonde': 'Loiro morango',
  'Dirty Blonde': 'Loiro acinzentado', 'Brown': 'Castanho', 'Beaver Brown': 'Castanho médio', 'Dark Brown': 'Castanho escuro',
  'Deep Brown': 'Castanho profundo', 'Black': 'Preto', 'Fiery red': 'Ruivo intenso', 'Pastel pink striped blonde': 'Loiro com mechas rosa',
  'Blue Black Striped': 'Preto com mechas azuis',
};
export const presetLabel = (name, lang) => (lang === 'pt' && PRESETS_PT[name]) || name;
export const PT_PRESETS = PRESETS_PT;
