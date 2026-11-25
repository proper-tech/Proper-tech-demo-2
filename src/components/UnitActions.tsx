'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { SALES_PHONE } from '@/data/contact';
import { fmt } from '@/i18n/config';
import { useI18n } from '@/i18n/I18nProvider';
import { BRANDS, type Net } from './brandIcons';

/**
 * The next step from a floor or an apartment: book a viewing, or share the page. On a desktop it sits in the
 * side panel; on a phone it is a bar pinned to the bottom of the screen, so the action is always under the
 * thumb (globals.css, "unit actions").
 *
 * Booking calls the sales office when its number is set (data/contact.ts); until then it goes to the
 * contact section of the home page.
 *
 * Share opens a menu of networks. Each gets the page's address; the preview it shows (title, description,
 * picture) comes from the page's metadata (lib/meta.ts), so it needs the site on its public address. The
 * address keeps the current view (?view=tour) and the finder's choice (?beds=2&sun=am).
 * Instagram has no way to share a link from a web page: on a phone it goes through the phone's share sheet,
 * where Instagram is one of the apps; elsewhere the link is copied to paste into a story or a message.
 */

// in menu order; Instagram has no share address (see above)
const NETS: { id: Net; href?: (url: string, text: string) => string }[] = [
  { id: 'facebook', href: (u) => `https://www.facebook.com/sharer/sharer.php?u=${u}` },
  { id: 'instagram' },
  { id: 'x', href: (u, t) => `https://x.com/intent/tweet?url=${u}&text=${t}` },
  { id: 'telegram', href: (u, t) => `https://t.me/share/url?url=${u}&text=${t}` },
  { id: 'whatsapp', href: (u, t) => `https://wa.me/?text=${t}%20${u}` },
];

/** A network's logo in its own colour (brandIcons.ts); the name beside it is the accessible label. */
const Logo = ({ net }: { net: Net }) => (
  <svg className="share-logo" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill={BRANDS[net].color}>
    <path d={BRANDS[net].path} />
  </svg>
);

/** Plain line icons for the two entries that aren't networks. */
const LinkIcon = () => (
  <svg className="share-logo" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 14a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1 1M14 10a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1-1" />
  </svg>
);
const MoreIcon = () => (
  <svg className="share-logo" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="currentColor">
    <circle cx="5" cy="12" r="2" />
    <circle cx="12" cy="12" r="2" />
    <circle cx="19" cy="12" r="2" />
  </svg>
);

export function UnitActions({ subject }: { subject: string }) {
  const { locale, t } = useI18n();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [canNative, setCanNative] = useState(false);
  // after a copy: what happened, or the link itself to copy by hand where the clipboard is blocked
  const [note, setNote] = useState('');
  const timer = useRef(0);
  const box = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const title = `${subject} · ${t.site.name}`;

  useEffect(() => setCanNative(typeof navigator.share === 'function'), []);
  useEffect(() => () => clearTimeout(timer.current), []);
  // the menu closes on Escape (focus back on Share) and on a click or tap anywhere else
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      box.current?.querySelector<HTMLButtonElement>('.share-toggle')?.focus();
    };
    const away = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('keydown', key);
    document.addEventListener('pointerdown', away);
    box.current?.querySelector<HTMLElement>('.share-menu a, .share-menu button')?.focus();
    return () => {
      document.removeEventListener('keydown', key);
      document.removeEventListener('pointerdown', away);
    };
  }, [open]);

  const say = (text: string) => {
    setNote(text);
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setNote(''), 3500);
  };
  const copy = async (done: string) => {
    try {
      await navigator.clipboard.writeText(location.href);
      say(done);
    } catch {
      setNote(location.href);
    }
    setOpen(false);
  };
  const native = async () => {
    setOpen(false);
    try {
      await navigator.share({ title, url: location.href });
    } catch {
      // closed the share sheet: nothing to do
    }
  };

  const book = SALES_PHONE ? `tel:${SALES_PHONE.replace(/\s/g, '')}` : `/${locale}#contact`;
  const u = encodeURIComponent(url);
  const text = encodeURIComponent(title);

  return (
    <div className="unit-actions" ref={box}>
      <a className="pill pill-primary" href={book}>
        {SALES_PHONE ? t.cta.call : t.cta.book}
      </a>
      <div className="share">
        <button
          type="button"
          className="pill pill-quiet share-toggle"
          aria-expanded={open}
          aria-controls={menuId}
          aria-label={fmt(t.cta.shareLabel, { what: subject })}
          onClick={() => {
            setUrl(location.href); // the address as it is now, with the current view
            setOpen((o) => !o);
          }}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3v12M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
          </svg>
          {t.cta.share}
        </button>
        <div className="share-menu" id={menuId} hidden={!open}>
          {NETS.map((n) =>
            n.href ? (
              <a key={n.id} href={n.href(u, text)} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)}>
                <Logo net={n.id} />
                {BRANDS[n.id].name}
              </a>
            ) : (
              <button key={n.id} type="button" onClick={() => (canNative ? native() : copy(t.cta.instagramHint))}>
                <Logo net={n.id} />
                {BRANDS[n.id].name}
              </button>
            ),
          )}
          <hr />
          <button type="button" onClick={() => copy(t.cta.copied)}>
            <LinkIcon />
            {t.cta.copyLink}
          </button>
          {canNative && (
            <button type="button" onClick={native}>
              <MoreIcon />
              {t.cta.more}
            </button>
          )}
        </div>
      </div>
      <span className="unit-actions-note" role="status" aria-live="polite">
        {note}
      </span>
    </div>
  );
}
