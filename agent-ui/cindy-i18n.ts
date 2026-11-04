// i18next for the Cindy parts, set up as Cindy sets it up (renderer/i18n/index.ts at 43001ea: namespace common,
// escapeValue false, English fallback), with only the strings the parts use (cindy-strings.json) and MontClip's own
// words laid over them (montclip-strings.json). The language follows MontClip's (setPartsLanguage).
// Keys a part asks for that are in neither file are collected (missingKeys), so the smoke can tell.
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import cindy from './cindy-strings.json';
import montclip from './montclip-strings.json';

const merge = (a: any, b: any): any => {
  const o = { ...a };
  for (const [k, v] of Object.entries(b || {})) o[k] = v && typeof v === 'object' && !Array.isArray(v) ? merge(a?.[k] || {}, v) : v;
  return o;
};
const missing = new Set<string>();
const instance = i18n.createInstance();
void instance.use(initReactI18next).init({
  resources: { 'zh-CN': { common: merge(cindy['zh-CN'], montclip['zh-CN']) }, en: { common: merge(cindy.en, montclip.en) } },
  lng: 'zh-CN', fallbackLng: ['en'], defaultNS: 'common', ns: ['common'],
  interpolation: { escapeValue: false, defaultVariables: { appName: 'MontClip' } },
  initAsync: false, saveMissing: true, missingKeyHandler: (_lngs, _ns, key) => { missing.add(key); },
});
export function setPartsLanguage(language: string) { const l = language === 'en' ? 'en' : 'zh-CN'; if (instance.language !== l) void instance.changeLanguage(l); }
export function missingKeys() { return [...missing]; }
export default instance;
