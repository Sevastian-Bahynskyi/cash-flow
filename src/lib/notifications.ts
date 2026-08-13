import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

const DAILY_EXPENSE_REMINDER_ID = 'daily-expense-reminder';

export function configureNotificationHandling(): void {
  if (Platform.OS === 'web') return;

  Notifications.setNotificationHandler({
    handleNotification: () => Promise.resolve({
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

export async function isDailyExpenseReminderEnabled(): Promise<boolean> {
  if (Platform.OS === 'web') return false;

  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  return scheduled.some(({ identifier }) => identifier === DAILY_EXPENSE_REMINDER_ID);
}

export async function enableDailyExpenseReminder(): Promise<boolean> {
  if (Platform.OS === 'web') return false;

  const currentPermissions = await Notifications.getPermissionsAsync();
  const permissions = currentPermissions.granted
    ? currentPermissions
    : await Notifications.requestPermissionsAsync({
        ios: {
          allowAlert: true,
          allowBadge: false,
          allowSound: true,
        },
      });

  if (!permissions.granted) return false;

  await Notifications.cancelScheduledNotificationAsync(DAILY_EXPENSE_REMINDER_ID);
  await Notifications.scheduleNotificationAsync({
    identifier: DAILY_EXPENSE_REMINDER_ID,
    content: {
      title: 'Log today’s expenses',
      body: 'Take a minute to add anything you spent today.',
      sound: 'default',
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: 18,
      minute: 0,
    },
  });

  return true;
}

export async function disableDailyExpenseReminder(): Promise<void> {
  if (Platform.OS === 'web') return;
  await Notifications.cancelScheduledNotificationAsync(DAILY_EXPENSE_REMINDER_ID);
}
