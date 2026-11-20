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
