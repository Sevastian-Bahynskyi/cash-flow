import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { Easing, FadeIn, FadeInDown, FadeOut, Keyframe, LinearTransition } from 'react-native-reanimated';
import { C } from '@/ui/kit/theme';
import { Disc, Icon, Panel, Press, Sheet, T, tap } from '@/ui/kit/ui';

const STEPS = [
  { title: 'A purchase arrives', body: 'The bank sends it and Cashflow guesses its category. The amber dot means the guess isn’t confirmed yet. It already counts in your budgets.' },
  { title: 'Right guess? Tap Yes', body: 'The dot goes away and the purchase leaves the Inbox. “All look right” confirms every guess at once.' },
  { title: 'Wrong guess? Tap the purchase', body: 'Pick the right category. Budgets move the money to it straight away.' },
] as const;
const STEP_MS = 3200;
const EASE = Easing.bezier(0.23, 1, 0.32, 1);
const SWAP_IN = FadeInDown.duration(320).easing(EASE);
const SWAP_OUT = FadeOut.duration(160);
const MOVE = LinearTransition.duration(260).easing(EASE);
// the pretend finger: Yes sinks as if pressed, then springs back
const PRESS = new Keyframe({
  0: { transform: [{ scale: 1 }] },
  40: { transform: [{ scale: 0.86 }], easing: EASE },
  100: { transform: [{ scale: 1 }], easing: EASE },
}).duration(520).delay(700);

/** One pretend Inbox row that acts out the step. Fake data only. */
function Demo({ step }: { step: number }) {
  const confirmed = step === 1;
  const fixing = step === 2;
  return (
    <Panel style={{ padding: 14, gap: 12, minHeight: 168, justifyContent: 'center' }}>
      <Animated.View key={step} entering={SWAP_IN} exiting={SWAP_OUT} layout={MOVE} style={{ gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 8, borderRadius: 14, backgroundColor: fixing ? C.surface2 : 'transparent' }}>
          <Disc icon={fixing ? 'other' : 'cart'} />
          <View style={{ flex: 1, gap: 2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <T k="strong">Corner Café</T>
              {confirmed ? (
                <Animated.View entering={FadeIn.delay(1000).duration(240)}><Icon name="check" size={15} color={C.in} /></Animated.View>
              ) : <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: C.ahead }} />}
            </View>
            <T k="meta">{fixing ? 'Restaurants' : 'Groceries'}</T>
          </View>
          <T k="num">86 kr.</T>
          {fixing ? null : (
            <Animated.View entering={confirmed ? PRESS : undefined} style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: confirmed ? C.ink : C.surface2 }}>
              <T k="strong" style={{ color: confirmed ? C.bg : C.ink, fontSize: 14 }}>Yes</T>
            </Animated.View>
          )}
        </View>
        {fixing ? (
          <Animated.View entering={FadeInDown.delay(500).duration(320).easing(EASE)} style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 8 }}>
            {['Groceries', 'Restaurants', 'Coffee'].map((name) => (
              <View key={name} style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: name === 'Restaurants' ? C.ink : C.surface2 }}>
                <T k="meta" style={{ color: name === 'Restaurants' ? C.bg : C.ink2 }}>{name}</T>
              </View>
            ))}
          </Animated.View>
        ) : null}
      </Animated.View>
    </Panel>
  );
}

/** "?" next to the Inbox title: a short animated walk-through of what to do there. */
export function InboxHelp() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => setStep((s) => (s + 1) % STEPS.length), STEP_MS);
    return () => clearInterval(id);
  }, [open, step]);

  return (
    <>
      <Press accessibilityRole="button" accessibilityLabel="How the Inbox works" hitSlop={12} onPress={() => { tap(); setStep(0); setOpen(true); }}>
        <Icon name="help" size={19} color={C.ink3} />
      </Press>
      <Sheet open={open} onClose={() => setOpen(false)} title="How the Inbox works">
        <Demo step={step} />
        <View style={{ gap: 4 }}>
          {STEPS.map((s, i) => (
            <Pressable key={s.title} accessibilityRole="button" accessibilityState={{ selected: i === step }} onPress={() => { tap(); setStep(i); }}
              style={{ flexDirection: 'row', gap: 12, padding: 12, borderRadius: 16, backgroundColor: i === step ? C.surface : 'transparent' }}>
              <View style={{ width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: i === step ? C.ink : C.surface2 }}>
                <T k="strong" style={{ fontSize: 13, color: i === step ? C.bg : C.ink2 }}>{i + 1}</T>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <T k="strong" style={{ color: i === step ? C.ink : C.ink2 }}>{s.title}</T>
                <T k="note">{s.body}</T>
              </View>
            </Pressable>
          ))}
        </View>
        <T k="note" style={{ paddingHorizontal: 4 }}>Nothing waits on you: if you never check, each purchase keeps its guess. The Inbox shows the last 30 days.</T>
      </Sheet>
    </>
  );
}
