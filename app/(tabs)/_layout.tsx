import { Icon, Label, NativeTabs } from 'expo-router/unstable-native-tabs';
import { C } from '@/ui/kit/theme';
import { useModel } from '@/core/data/model';
import { useUnseen } from '@/core/data/inboxSeen';

// Five places: Budgets first (limits and the bank balance), then the cycle overview, activity, the pot from People, settings.
// The system tab bar: liquid glass on iOS 26, its own selection feel, and it tucks away while a list scrolls down.
export default function TabsLayout() {
  const m = useModel();
  // New Inbox items since the owner last looked, as a count on Activity.
  const fresh = useUnseen(m?.inbox.map((t) => t.id) ?? []);
  return (
    <NativeTabs tintColor={C.ink} minimizeBehavior="onScrollDown" iconColor={{ default: C.ink3, selected: C.ink }} labelStyle={{ default: { color: C.ink3 }, selected: { color: C.ink } }}>
      <NativeTabs.Trigger name="index">
        <Icon sf={{ default: 'gauge.with.dots.needle.33percent', selected: 'gauge.with.dots.needle.33percent' }} />
        <Label>Budgets</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="cycle">
        <Icon sf={{ default: 'circle.circle', selected: 'circle.circle.fill' }} />
        <Label>Cycle</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="activity" options={{ badgeValue: fresh ? String(fresh) : undefined }}>
        <Icon sf="list.bullet" />
        <Label>Activity</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="people">
        <Icon sf={{ default: 'person.2', selected: 'person.2.fill' }} />
        <Label>People</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="settings">
        <Icon sf={{ default: 'person.crop.circle', selected: 'person.crop.circle.fill' }} />
        <Label>Settings</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
