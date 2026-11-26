/** Rendered from `branding/cashflow-icon.svg` by `pnpm icons`. Bump after re-rendering: iOS caches icons by URL. */
export const APP_ICON_VERSION = 3

export type AppIconSize = 180 | 192 | 512 | 1024 | 'maskable'

export function appIconUrl(size: AppIconSize): string {
  const file = size === 180 ? 'apple-touch-icon.png' : size === 'maskable' ? 'icon-maskable-512.png' : `icon-${size}.png`
  return `/${file}?v=${APP_ICON_VERSION}`
}
