import { Amiri_400Regular, Amiri_700Bold } from '@expo-google-fonts/amiri';
import { BebasNeue_400Regular } from '@expo-google-fonts/bebas-neue';
import { Cairo_400Regular, Cairo_700Bold } from '@expo-google-fonts/cairo';
import { Lobster_400Regular } from '@expo-google-fonts/lobster';
import { Poppins_400Regular, Poppins_700Bold } from '@expo-google-fonts/poppins';
import { Roboto_400Regular, Roboto_700Bold } from '@expo-google-fonts/roboto';
import { Tajawal_400Regular, Tajawal_700Bold } from '@expo-google-fonts/tajawal';

/** Everything passed to expo-font's useFonts(). */
export const FONT_ASSETS = {
  Amiri_400Regular,
  Amiri_700Bold,
  BebasNeue_400Regular,
  Cairo_400Regular,
  Cairo_700Bold,
  Lobster_400Regular,
  Poppins_400Regular,
  Poppins_700Bold,
  Roboto_400Regular,
  Roboto_700Bold,
  Tajawal_400Regular,
  Tajawal_700Bold,
};

export interface FontDef {
  id: string;
  label: string;
  regular?: keyof typeof FONT_ASSETS;
  bold?: keyof typeof FONT_ASSETS;
  arabic: boolean;
}

/**
 * To add a font: `npm i @expo-google-fonts/<name>`, import its weights above,
 * add them to FONT_ASSETS and add one entry here.
 */
export const FONTS: FontDef[] = [
  { id: 'system', label: 'System', arabic: true },
  { id: 'cairo', label: 'Cairo · القاهرة', regular: 'Cairo_400Regular', bold: 'Cairo_700Bold', arabic: true },
  { id: 'tajawal', label: 'Tajawal · تجوّل', regular: 'Tajawal_400Regular', bold: 'Tajawal_700Bold', arabic: true },
  { id: 'amiri', label: 'Amiri · أميري', regular: 'Amiri_400Regular', bold: 'Amiri_700Bold', arabic: true },
  { id: 'roboto', label: 'Roboto', regular: 'Roboto_400Regular', bold: 'Roboto_700Bold', arabic: false },
  { id: 'poppins', label: 'Poppins', regular: 'Poppins_400Regular', bold: 'Poppins_700Bold', arabic: false },
  { id: 'lobster', label: 'Lobster', regular: 'Lobster_400Regular', arabic: false },
  { id: 'bebas', label: 'Bebas Neue', regular: 'BebasNeue_400Regular', arabic: false },
];

export function resolveFont(id: string, bold: boolean): { fontFamily?: string; fontWeight: 'bold' | 'normal' } {
  const def = FONTS.find((f) => f.id === id) ?? FONTS[0];
  if (!def || !def.regular) return { fontWeight: bold ? 'bold' : 'normal' };
  if (bold && def.bold) return { fontFamily: def.bold, fontWeight: 'normal' };
  return { fontFamily: def.regular, fontWeight: bold ? 'bold' : 'normal' };
}
