import { memo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg'
import { C, F } from '@/ui/kit/theme'

// The aura's heat ramp (src/ui/aura/shader.ts RAMP): white-hot core, yellow, orange, magenta, a blue fringe that fades out.
const HEAT: [string, number, number][] = [
  ['#FFF8EC', 0, 1], ['#FFDE40', 0.12, 0.95], ['#FF5C29', 0.3, 0.72], ['#ED248C', 0.52, 0.34], ['#1F78FF', 0.78, 0.1], ['#1F78FF', 1, 0],
]
const LABEL = 40

/** Where the glow's centre sits from the top of the marker view, and how tall the view is: the label hangs below the core. */
export const glowBox = (size: number): { w: number; h: number; dy: number } => {
  const h = Math.max(size, size / 2 + 10 + LABEL)
  return { w: Math.max(size, 120), h, dy: h / 2 - size / 2 }
}

/** A spending glow: the size is the money, the label says how much and where. */
export const Glow = memo(function Glow({ id, size, amount, name, flag }: { id: string; size: number; amount: string; name: string; flag: string }) {
  const { w, h } = glowBox(size)
  const gid = `g${id.replace(/[^a-zA-Z0-9]/g, '')}`
  return (
    <View style={{ width: w, height: h }} accessible accessibilityRole="button" accessibilityLabel={`${name}, ${amount}`}>
      <Svg width={size} height={size} style={{ position: 'absolute', top: 0, left: (w - size) / 2 }}>
        <Defs>
          <RadialGradient id={gid} cx="50%" cy="50%" r="50%">
            {HEAT.map(([c, o, a]) => <Stop key={o} offset={o} stopColor={c} stopOpacity={a} />)}
          </RadialGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={size / 2} fill={`url(#${gid})`} />
      </Svg>
      <View style={[s.label, { top: size / 2 + 10 }]}>
        <Text style={s.amount} numberOfLines={1}>{flag ? `${flag} ` : ''}{amount}</Text>
        <Text style={s.name} numberOfLines={1}>{name}</Text>
      </View>
    </View>
  )
})

const shadow = { textShadowColor: 'rgba(0,0,0,0.85)', textShadowRadius: 5, textShadowOffset: { width: 0, height: 1 } } as const
const s = StyleSheet.create({
  label: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  amount: { fontFamily: F.num, fontSize: 18, color: C.ink, ...shadow },
  name: { fontFamily: F.strong, fontSize: 12, color: C.ink2, marginTop: -2, ...shadow },
})
