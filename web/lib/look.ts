// The app's look: Soft (default) or Bright, picked in Settings while the owner tries both. One device, one choice.
export type Look = 'soft' | 'bright'
const KEY = 'cashflow-look'

export function readLook(): Look {
  try { return localStorage.getItem(KEY) === 'bright' ? 'bright' : 'soft' } catch { return 'soft' }
}

export function saveLook(look: Look): void {
  try { localStorage.setItem(KEY, look) } catch { /* private mode: the look still applies for this visit */ }
  document.documentElement.dataset.look = look
}

/** Runs before first paint (inline in <head>), so a Bright device never flashes Soft. `?look=bright|soft` sets it too (headless screenshots). */
export const LOOK_BOOT = `try{var q=/[?&]look=(bright|soft)/.exec(location.search);if(q)localStorage.setItem('${KEY}',q[1]);if(localStorage.getItem('${KEY}')==='bright')document.documentElement.dataset.look='bright'}catch(e){}`
