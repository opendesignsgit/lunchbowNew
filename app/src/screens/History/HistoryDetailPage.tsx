import React from 'react';
import {View, StyleSheet, Image, ScrollView} from 'react-native';
import {
  widthPercentageToDP as wp,
  heightPercentageToDP as hp,
} from 'react-native-responsive-screen';
import {Colors} from 'assets/styles/colors';
import Fonts from 'assets/styles/fonts';
import Typography from 'components/Text/Typography';
import HeaderBackButton from 'screens/Dashboard/Components/BackButton';
import PrimaryButton from 'components/buttons/PrimaryButton';

type HistoryDetailProps = {
  navigation: any;
  route: any;
};

const HistoryDetailPage: React.FC<HistoryDetailProps> = ({route}) => {
  // Example values (can come from API or route.params)
  const {order} = route.params || {
    order: {
      title: "SANJAY'S LUNCH PLAN",
      status: 'Order was Delivered',
      date: '01/05/2025 (Monday), 12:30 PM',
      food: 'Veg Noodles and Gravy',
      image: require('../../assets/images/Dashboard/Menues/menue1.png'),
    },
  };

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <HeaderBackButton title={order.title} />

      {/* Status Button */}
      <View style={styles.statusWrapper}>
        <PrimaryButton
          onPress={() => console.log('Navigate to Feedback')}
          title={order.status}
          style={[
            styles.statusButton,
            order.status === 'Order was Delivered' && {
              backgroundColor: Colors.green,
            },
            order.status === 'Order Cancelled' && {backgroundColor: Colors.red},
            order.status === 'Order Pending' && {
              backgroundColor: Colors.primaryOrange,
            },
          ]}
          textStyle={[
            styles.statusText,
            order.status === 'Order was Delivered' && {color: Colors.white},
            order.status === 'Order Cancelled' && {color: Colors.white},
            order.status === 'Order Pending' && {color: Colors.black},
          ]}
        />
      </View>

      {/* Meal Image */}
      <View style={styles.imageWrapper}>
        <Image source={order.image} style={styles.image} />
      </View>

      {/* Order Details */}
      <View style={styles.section}>
        <Typography style={styles.sectionTitle}>Order Details</Typography>
        <View style={styles.detailRow}>
          <Typography style={styles.label}>Delivered on:</Typography>
          <Typography style={styles.value}>{order.date}</Typography>
        </View>
        <View style={styles.detailRow}>
          <Typography style={styles.label}>Delivered Food:</Typography>
          <Typography style={styles.value}>{order.food}</Typography>
        </View>
      </View>

      {/* Feedback Section */}
      <View style={styles.section}>
        <Typography style={styles.sectionTitle}>
          Share Your Experience
        </Typography>
        <PrimaryButton
          title="Write your feedback"
          onPress={() => console.log('Navigate to Feedback')}
          style={styles.statusButton}
        />
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
    paddingHorizontal: wp('5%'),
  },
  statusWrapper: {
    marginVertical: hp('2%'),
    alignItems: 'center',
  },
  statusButton: {
    backgroundColor: Colors.green,
    borderRadius: wp('3%'),
    paddingVertical: hp('1%'),
    paddingHorizontal: wp('8%'),
    width: wp('85%'),
  },

  imageWrapper: {},
  image: {
    width: '100%',
    resizeMode: 'cover',
  },

  section: {
    backgroundColor: Colors.white,
    borderRadius: wp('3%'),
    padding: wp('4%'),
    marginBottom: hp('2%'),
    shadowColor: Colors.black,
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  sectionTitle: {
    fontFamily: Fonts.Urbanist.bold,
    fontSize: wp('4.2%'),
    color: Colors.black,
    marginBottom: hp('1.5%'),
  },
  detailRow: {
    marginBottom: hp('1%'),
  },
  label: {
    fontFamily: Fonts.Urbanist.bold,
    fontSize: wp('3.8%'),
    color: Colors.black,
  },
  value: {
    fontFamily: Fonts.Urbanist.regular,
    fontSize: wp('3.8%'),
    color: Colors.bodyText,
  },
  statusText: {
    fontFamily: Fonts.Urbanist.bold,
    fontSize: wp('4%'),
  },
});

export default HistoryDetailPage;
