/**
 * One-shot WebGL capability probe for the AI core orb.
 *
 * "Has a context" is not enough: Chrome/WebKitGTK happily hand back a
 * software rasterizer (llvmpipe, SwiftShader), which renders 900 additive
 * particles by burning a CPU core. Those machines get the CSS orb instead.
 *
 * The result is cached — the probe allocates a canvas and a context, so it
 * must never run per render.
 */

const SOFTWARE_RENDERER = /llvmpipe|softpipe|swiftshader|software/i;

let cached: boolean | null = null;

function probe(): boolean {
  try {
    if (typeof document === 'undefined' || typeof window === 'undefined') return false;

    // Escape hatches for debugging the fallback path on capable hardware.
    if (window.localStorage.getItem('handymate-force-css-orb')) return false;
    if (window.location.search.includes('cssorb')) return false;

    const canvas = document.createElement('canvas');
    const gl = (canvas.getContext('webgl2') ||
      canvas.getContext('webgl')) as WebGLRenderingContext | null;
    if (!gl) return false;

    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = debugInfo ? String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)) : '';

    // Give the probe context back rather than holding one of the browser's
    // handful of live contexts hostage for the session.
    gl.getExtension('WEBGL_lose_context')?.loseContext();

    return !SOFTWARE_RENDERER.test(renderer);
  } catch {
    return false;
  }
}

export function webglOk(): boolean {
  if (cached === null) cached = probe();
  return cached;
}
