import * as Notifications from 'expo-notifications';

let configured = false;

export const configureNotifications = (): void => {
  if (configured) return;
  configured = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: false,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
};

export const ensureNotificationPermissions = async (): Promise<boolean> => {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
};

export const scheduleWeeklySummary = async (
  title: string,
  body: string,
): Promise<void> => {
  const granted = await ensureNotificationPermissions();
  if (!granted) return;

  const existing = await Notifications.getAllScheduledNotificationsAsync();
  for (const item of existing) {
    if (item.identifier.startsWith('weekly-summary')) {
      await Notifications.cancelScheduledNotificationAsync(item.identifier);
    }
  }

  await Notifications.scheduleNotificationAsync({
    identifier: `weekly-summary-${Date.now()}`,
    content: {
      title,
      body,
      sound: false,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
      weekday: 1,
      hour: 18,
      minute: 0,
    },
  });
};
