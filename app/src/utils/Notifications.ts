import { useEffect } from 'react';
import { Alert, Platform, PermissionsAndroid } from 'react-native';
import messaging from '@react-native-firebase/messaging';
import notifee, { AndroidImportance } from '@notifee/react-native';

const useFirebaseNotifications = () => {
    useEffect(() => {
        const requestUserPermission = async () => {
            const authStatus = await messaging().requestPermission();
            const enabled =
                authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
                authStatus === messaging.AuthorizationStatus.PROVISIONAL;

            if (enabled) {
                const token = await messaging().getToken();
                console.log(' FCM Token:', token);
            } else {
                Alert.alert('Push notifications permission denied');
            }
        };

        const createNotificationChannel = async () => {
            if (Platform.OS === 'android') {
                await notifee.createChannel({
                    id: 'default',
                    name: 'Default Channel',
                    importance: AndroidImportance.HIGH,
                });
            }
        };

        const foregroundListener = messaging().onMessage(async remoteMessage => {
            console.log('📩 Foreground FCM:', remoteMessage);

            await notifee.displayNotification({
                title: remoteMessage.notification?.title || 'New Message',
                body: remoteMessage.notification?.body || '',
                android: {
                    channelId: 'default',
                    importance: AndroidImportance.HIGH,
                    pressAction: {
                        id: 'default',
                    },
                    smallIcon: 'ic_launcher', // Ensure this icon exists in `android/app/src/main/res`
                },
            });
        });

        const checkAndroidPermission = async () => {
            if (Platform.OS === 'android' && Platform.Version >= 33) {
                const granted = await PermissionsAndroid.request(
                    PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
                );
                if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
                    console.warn('Notification permission not granted');
                }
            }
        };

        const initialize = async () => {
            await checkAndroidPermission();
            await requestUserPermission();
            await createNotificationChannel();
        };

        initialize();

        return () => {
            foregroundListener();
        };
    }, []);
};

export default useFirebaseNotifications;
