'use client';

import { Component, useEffect, useState, type ComponentProps, type ReactNode } from 'react';
import { Canvas } from '@react-three/fiber';
import { useI18n } from '@/i18n/I18nProvider';

type CanvasProps = ComponentProps<typeof Canvas>;

/**
 * Can this page get a WebGL context at all? Chrome blocks WebGL for a site after the graphics
 * card crashed or ran out of memory on it ("Web page caused context loss and was blocked") until
 * the browser is restarted, and some machines have no WebGL. A throw-away canvas finds out quietly,
 * without three.js logging an error for every 3D view on the page.
 */
let webglChecked: boolean | null = null;
function webglAvailable() {
  if (webglChecked) return true;
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
  if (gl) gl.getExtension('WEBGL_lose_context')?.loseContext(); // give it straight back
  webglChecked = !!gl;
  return webglChecked;
}

/** Shown in place of a 3D view that could not start or that stopped. */
function NoWebGL({ lost }: { lost?: boolean }) {
  const { t } = useI18n();
  const w = t.webgl;
  return (
    <div className="webgl-fallback" role="alert">
      <div>
        <b>{lost ? w.lostTitle : w.title}</b>
        <p>{lost ? w.lost : w.blocked}</p>
        <button type="button" className="button" onClick={() => location.reload()}>
          {w.reload}
        </button>
      </div>
    </div>
  );
}

/** Catches a 3D view that fails to start (the renderer throws when no WebGL context is given). */
class Guard extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? <NoWebGL /> : this.props.children;
  }
}

/**
 * The 3D canvas used by every scene: when WebGL is unavailable or blocked, or the graphics card
 * drops the context while the page is open, it shows a short message with a reload button
 * instead of a blank stage and a stream of console errors.
 */
export function SafeCanvas({ onCreated, ...props }: CanvasProps) {
  const [ok, setOk] = useState<boolean | null>(null);
  const [lost, setLost] = useState(false);
  useEffect(() => setOk(webglAvailable()), []);

  if (ok === null) return null;
  if (!ok) return <NoWebGL />;
  return (
    <Guard>
      <Canvas
        {...props}
        onCreated={(state) => {
          const el = state.gl.domElement;
          // preventDefault lets the browser hand the context back when it can
          el.addEventListener('webglcontextlost', (e) => {
            e.preventDefault();
            setLost(true);
          });
          el.addEventListener('webglcontextrestored', () => setLost(false));
          onCreated?.(state);
        }}
      />
      {lost && <NoWebGL lost />}
    </Guard>
  );
}
