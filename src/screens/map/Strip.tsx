import { useRef, useState } from 'react'
import { View } from 'react-native'
import { C } from '@/ui/kit/theme'
import { T, tap } from '@/ui/kit/ui'

const H = 52
const PAD = 8 // the band shows above the tallest bar
const BAR = 10
const letter = new Intl.DateTimeFormat(undefined, { month: 'narrow' })
// a year only where it changes, and not for this year
const year = (ym: string): string => (ym.slice(0, 4) === String(new Date().getFullYear()) ? '' : ` ’${ym.slice(2, 4)}`)
const dateOf = (ym: string): Date => new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1, 1)

/** Spending per month over all history. Tap a month or drag across months to pick the window; it is applied on release. */
export function Strip({ months, values, sel, label, onPick }: { months: string[]; values: number[]; sel: [number, number] | null; label: string; onPick: (a: number, b: number) => void }) {
  const [w, setW] = useState(0)
  const [drag, setDrag] = useState<[number, number] | null>(null)
  const live = useRef<{ anchor: number; range: [number, number] } | null>(null)
  const n = months.length
  const at = (x: number): number => Math.max(0, Math.min(n - 1, Math.floor((x / Math.max(1, w)) * n)))
  const move = (x: number): void => {
    const cur = live.current
    if (!cur) return
    const i = at(x)
    const next: [number, number] = [Math.min(cur.anchor, i), Math.max(cur.anchor, i)]
    if (next[0] === cur.range[0] && next[1] === cur.range[1]) return
    cur.range = next
    tap()
    setDrag(next)
  }
  const shown = drag ?? sel
  const max = Math.max(1, ...values)
  const step = (d: number): void => {
    const i = Math.max(0, Math.min(n - 1, (sel?.[1] ?? n - 1) + d))
    onPick(i, i)
  }
  const many = n > 14
  return (
    <View style={{ gap: 4 }}>
      <View
        onLayout={(e) => setW(e.nativeEvent.layout.width)}
        pointerEvents="box-only"
        style={{ height: H, flexDirection: 'row', alignItems: 'flex-end', paddingBottom: 4 }}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderTerminationRequest={() => false}
        onResponderGrant={(e) => { const i = at(e.nativeEvent.locationX); live.current = { anchor: i, range: [i, i] }; tap(); setDrag([i, i]) }}
        onResponderMove={(e) => move(e.nativeEvent.locationX)}
        onResponderRelease={() => { const r = live.current?.range; live.current = null; setDrag(null); if (r) onPick(r[0], r[1]) }}
        onResponderTerminate={() => { live.current = null; setDrag(null) }}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel="Spending by month"
        accessibilityValue={{ text: label }}
        accessibilityHint="Swipe up or down to move a month. Drag across the bars to pick several."
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => step(e.nativeEvent.actionName === 'increment' ? 1 : -1)}
      >
        {/* the window is a tinted, outlined band behind its months; the bars keep their own heights inside it */}
        {shown && w ? <View style={{ position: 'absolute', top: 0, bottom: 0, left: (shown[0] / n) * w, width: ((shown[1] - shown[0] + 1) / n) * w, borderRadius: 8, borderWidth: 1, borderColor: C.ink3, backgroundColor: C.track }} /> : null}
        {values.map((v, i) => {
          const on = shown ? i >= shown[0] && i <= shown[1] : false
          return (
            <View key={months[i]} style={{ flex: 1, alignItems: 'center' }}>
              <View style={{ width: BAR, maxWidth: '70%', height: v ? Math.max(3, ((H - PAD) * v) / max) : 2, borderRadius: 3, backgroundColor: on ? C.ink : C.surface3 }} />
            </View>
          )
        })}
      </View>
      <View style={{ flexDirection: 'row' }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {months.map((ym, i) => {
          const text = many ? (ym.endsWith('-01') || i === 0 ? year(ym).trim() || String(ym.slice(0, 4)) : '') : `${letter.format(dateOf(ym))}${i === 0 || ym.endsWith('-01') ? year(ym) : ''}`
          // the year labels need room: let them run over the empty neighbours
          return <View key={ym} style={{ flex: 1, alignItems: 'center', overflow: 'visible' }}><T k="meta" style={{ fontSize: 11, width: 40, textAlign: 'center' }} numberOfLines={1}>{text}</T></View>
        })}
      </View>
    </View>
  )
}
