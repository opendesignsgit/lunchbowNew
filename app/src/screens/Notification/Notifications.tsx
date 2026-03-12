import { Colors } from 'assets/styles/colors';
import Fonts from 'assets/styles/fonts';
import AnimatedBell from 'components/Animations/AnimatedBell';
import ThemeGradientBackground from 'components/Backgrounds/GradientBackground';
import React, { useEffect, useState } from 'react';
import {
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native';
import {
  heightPercentageToDP as hp,
  widthPercentageToDP as wp,
} from 'react-native-responsive-screen';
import { SvgXml } from 'react-native-svg';
import HeaderBackButton from 'screens/Dashboard/Components/BackButton';
import {
  NONotificationBell,
  NotificationBell
} from 'styles/svg-icons';

interface Notification {
  id: string;
  title: string;
  description: string;
  time: string;
}

const MOCK_NOTIFICATIONS: Notification[] = [
  {
    id: '1',
    title: 'Notification Lorem ipsum dolor',
    description: 'Lorem ipsum dolor sit amet consectetur.',
    time: '10 Hours ago',
  },
  {
    id: '2',
    title: 'Notification Lorem ipsum dolor',
    description: 'Lorem ipsum dolor sit amet consectetur.',
    time: '14 Hours ago',
  },
];

export default function NotificationScreen() {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const SHOW_NOTIFICATIONS = true;

  useEffect(() => {
    setNotifications(SHOW_NOTIFICATIONS ? MOCK_NOTIFICATIONS : []);
  }, []);

  const renderNotification = ({item}: {item: Notification}) => (
    <View style={styles.notificationCard}>
      <View style={styles.iconCircle}>
        <AnimatedBell xml={NotificationBell} width={40} height={40} />
      </View>
      <View style={styles.notificationContent}>
        <Text style={styles.notificationTitle}>{item.title}</Text>
        <Text style={styles.notificationDescription}>{item.description}</Text>
        <Text style={styles.notificationTime}>{item.time}</Text>
      </View>
    </View>
  );

  const EmptyState = () => (
    <View style={styles.emptyContainer}>
      <View style={styles.illustration}>
        <SvgXml xml={NONotificationBell} />
      </View>
      <View style={styles.ContentContainer}>
        <Text style={styles.emptyTitle}>No Notification</Text>
        <Text style={styles.emptyDescription}>
          You don’t have any notifications yet. All your alerts will appear
          here.
        </Text>
      </View>
    </View>
  );

  return (
    <ThemeGradientBackground>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        <HeaderBackButton title="Notification" />
        {notifications.length > 0 ? (
          <FlatList
            data={notifications}
            renderItem={renderNotification}
            keyExtractor={item => item.id}
            contentContainerStyle={{paddingBottom: hp('10%')}}
          />
        ) : (
          <EmptyState />
        )}
      </ScrollView>
    </ThemeGradientBackground>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: wp('5%'),
    paddingBottom: hp('5%'),
  },
  notificationCard: {
    flexDirection: 'row',
    backgroundColor: Colors.white,
    padding: wp('4%'),
    borderRadius: 12,
    marginBottom: hp('2%'),
    shadowColor: Colors.black,
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFE0B2',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: wp('3%'),
  },
  iconText: {
    fontSize: hp('2.2%'),
  },
  notificationContent: {
    flex: 1,
  },
  ContentContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: hp('2%'),
  },

  notificationTitle: {
    fontSize: hp('2%'),
    fontFamily: Fonts.Urbanist.bold,
    color: Colors.black,
    marginBottom: hp('0.5%'),
  },
  notificationDescription: {
    fontSize: hp('1.7%'),
    fontFamily: Fonts.Urbanist.medium,
    color: Colors.bodyText,
    marginBottom: hp('0.5%'),
  },
  notificationTime: {
    fontSize: hp('1.5%'),
    fontFamily: Fonts.Urbanist.medium,
    color: Colors.bodyText,
  },
  emptyContainer: {
    alignItems: 'center',
    marginTop: hp('10%'),
  },
  illustration: {
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: hp('2.2%'),
    fontFamily: Fonts.Urbanist.bold,
    color: Colors.black,
  },
  emptyDescription: {
    fontSize: hp('1.7%'),
    fontFamily: Fonts.Urbanist.medium,
    color: Colors.bodyText,
    textAlign: 'center',
    marginTop: hp('1%'),
    maxWidth: wp('80%'),
  },
});
