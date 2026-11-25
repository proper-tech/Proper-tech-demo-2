import type { ReactNode } from 'react';

// Unlike the layout, a template mounts afresh on every page change, so its fade-in (globals.css,
// .page-enter) plays each time a page opens: home, floors, apartments. The header, in the layout,
// stays put. A floor opened from the floor picker's lift-out skips it (it takes over from the
// building view's last frame instead).
export default function Template({ children }: { children: ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
