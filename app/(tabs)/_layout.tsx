import { Icon, Label, NativeTabs } from 'expo-router/unstable-native-tabs';
import { C } from '@/ui/kit/theme';

// Four places on the phone: budgets and analytics open from Cycle, the pot from People, settings pages from Settings.
// The system tab bar: liquid glass on iOS 26, its own selection feel, and it tucks away while a list scrolls down.
export default function TabsLayout() {
  return (
    <NativeTabs tintColor={C.ink} minimizeBehavior="onScrollDown" iconColor={{ default: C.ink3, selected: C.ink }} labelStyle={{ default: { color: C.ink3 }, selected: { color: C.ink } }}>
      <NativeTabs.Trigger name="index">
        <Icon sf={{ default: 'circle.circle', selected: 'circle.circle.fill' }} />
        <Label>Cycle</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="activity">
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
