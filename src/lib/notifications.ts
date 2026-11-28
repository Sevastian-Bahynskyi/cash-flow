import * as Notifications from 'expo-notifications';

export function configureNotificationHandling(): void {

  Notifications.setNotificationHandler({
    handleNotification: () => Promise.resolve({
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}
