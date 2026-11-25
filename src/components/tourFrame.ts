/** Calls `done` once the tour has its first panorama up: the tour file marks #pano with data-quality
 *  (preview, then full) when it shows one. A file without #pano counts as shown. */
export function onTourShown(frame: HTMLIFrameElement, done: () => void) {
  const pano = frame.contentDocument?.getElementById('pano');
  if (!pano || pano.dataset.quality) return done();
  const watch = new MutationObserver(() => {
    if (!pano.dataset.quality) return;
    watch.disconnect();
    done();
  });
  watch.observe(pano, { attributes: true, attributeFilter: ['data-quality'] });
}

/** Hides the tour page's own back button and heading when it is shown inside the site (same origin). */
export function fitTourFrame(frame: HTMLIFrameElement) {
  const doc = frame.contentDocument;
  if (!doc || doc.getElementById('apt-embed-style')) return;
  const style = doc.createElement('style');
  style.id = 'apt-embed-style';
  style.textContent = `
    #panoBack, .tour-heading { display: none !important; }
    .tour-header { justify-content: flex-end; }
    .tour-intro { top: 224px !important; }
    #tourDesignPanel { top: 310px !important; max-height: calc(100dvh - 480px) !important; }
  `;
  doc.head.appendChild(style);
}
