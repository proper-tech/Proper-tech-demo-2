import en, { type Dict } from './en';
import zh from './zh';
import mn from './mn';
import type { Room } from '@/data/types';

export const locales = ['en', 'zh', 'mn'] as const;
export type Locale = (typeof locales)[number];

export const localeNames: Record<Locale, string> = { en: 'English', zh: '中文', mn: 'Монгол' };
export const htmlLang: Record<Locale, string> = { en: 'en', zh: 'zh-Hans', mn: 'mn' };

const dictionaries: Record<Locale, Dict> = { en, zh, mn };

export const isLocale = (value: string): value is Locale => (locales as readonly string[]).includes(value);
export const getDict = (locale: string): Dict => dictionaries[isLocale(locale) ? locale : 'en'];

/** fmt('Floor {n}', { n: 12 }) -> 'Floor 12' */
export function fmt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => String(vars[key] ?? ''));
}

export function roomName(dict: Dict, room: Room): string {
  return dict.rooms[room.type] + (room.n ? ` ${room.n}` : '');
}

export type { Dict };
