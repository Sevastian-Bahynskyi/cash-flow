import { iconMarkup } from '@/lib/icons'

/** One icon from the Soft fill system. Decorative: the control next to it carries the name. */
export function Icon({ name, size, className }: { name: string; size?: number; className?: string }): React.JSX.Element {
  return <svg className={`i ${className ?? ''}`} viewBox="0 0 24 24" aria-hidden="true" style={size ? { width: size, height: size } : undefined} dangerouslySetInnerHTML={{ __html: iconMarkup(name) }} />
}
