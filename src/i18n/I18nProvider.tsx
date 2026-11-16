'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { Dict, Locale } from './config';

const Ctx = createContext<{ locale: Locale; t: Dict } | null>(null);

export function I18nProvider({ locale, dict, children }: { locale: Locale; dict: Dict; children: ReactNode }) {
  return <Ctx.Provider value={{ locale, t: dict }}>{children}</Ctx.Provider>;
}

export function useI18n() {
  const value = useContext(Ctx);
  if (!value) throw new Error('useI18n must be used inside I18nProvider');
  return value;
}
