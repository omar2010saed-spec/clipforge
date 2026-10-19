import { I18nManager } from 'react-native';
import { getLocales } from 'expo-localization';
import { settings } from '@/storage/mmkv';
import { strings, type Lang, type StringKey } from './strings';

const LANG_KEY = 'language';

export function getLanguage(): Lang {
  const saved = settings.getString(LANG_KEY);
  if (saved === 'ar' || saved === 'en') return saved;
  return getLocales()[0]?.languageCode === 'ar' ? 'ar' : 'en';
}

export function isRTL(lang: Lang = getLanguage()): boolean {
  return lang === 'ar';
}

export function localeTag(lang: Lang = getLanguage()): string {
  return lang === 'ar' ? 'ar-EG' : 'en-US';
}

/**
 * Makes the native layout direction match the language.
 * Returns true when the direction changed and the app must be restarted
 * for the change to take effect (React Native limitation).
 */
export function applyDirection(): boolean {
  const rtl = isRTL();
  I18nManager.allowRTL(true);
  if (I18nManager.isRTL !== rtl) {
    I18nManager.forceRTL(rtl);
    return true;
  }
  return false;
}

export function setLanguage(lang: Lang): boolean {
  settings.set(LANG_KEY, lang);
  return applyDirection();
}

export function t(key: StringKey, params?: Record<string, string | number>): string {
  let text: string = strings[getLanguage()][key];
  if (params) {
    for (const [k, v] of Object.entries(params)) text = text.split(`{${k}}`).join(String(v));
  }
  return text;
}
