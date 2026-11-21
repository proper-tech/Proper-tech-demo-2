'use client';

import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useI18n } from '@/i18n/I18nProvider';

/** True inside a floor shown over the home page (app/[locale]/@modal). */
const InOverlay = createContext(false);
export const useInOverlay = () => useContext(InOverlay);

/** Back to the building under the overlay: the home page stays mounted, so nothing reloads. */
export function useBackToBuilding() {
  const router = useRouter();
  const { locale } = useI18n();
  return () => router.push(`/${locale}`, { scroll: false });
}

export function FloorOverlay({ children }: { children: ReactNode }) {
  const back = useBackToBuilding();
  // a parallel route keeps its content on client navigation away from it: show only on a floor's address
  const open = /\/floors\//.test(usePathname());
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => {
      // in the browser's full screen, Esc leaves full screen; otherwise it closes the floor
      if (e.key === 'Escape' && !document.fullscreenElement) back();
    };
    window.addEventListener('keydown', esc);
    document.documentElement.classList.add('has-floor-overlay');
    return () => {
      window.removeEventListener('keydown', esc);
      document.documentElement.classList.remove('has-floor-overlay');
    };
  }, [back, open]);
  if (!open) return null;
  return (
    <InOverlay.Provider value={true}>
      <div className="floor-overlay" role="dialog" aria-modal="true">
        {children}
      </div>
    </InOverlay.Provider>
  );
}
