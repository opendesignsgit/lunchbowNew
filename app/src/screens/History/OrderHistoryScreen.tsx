import ThemeGradientBackground from 'components/Backgrounds/GradientBackground';
import React, {useEffect, useState} from 'react';
import {ScrollView, StyleSheet, View} from 'react-native';
import {
  heightPercentageToDP as hp,
  widthPercentageToDP as wp,
} from 'react-native-responsive-screen';
import HeaderBackButton from 'screens/Dashboard/Components/BackButton';
import SearchBar from 'screens/Dashboard/Components/Search';
import ToolTipSectionHeader from 'screens/Dashboard/Components/TooltipHeader';
import {questionIcon} from 'styles/svg-icons';
import SortButtons from '../../components/Filters/SortButtons';
import OrderCard from './Components/OrderCard';
import NoDataFound from 'components/Error/NoDataMessage';

const mockOrders = [
  {
    image: require('../../assets/images/Dashboard/Menues/menue1.png'),
    title: "Sanjay's Lunch Plan",
    dateTime: '01/05/2025 (Monday), 12:30 PM',
    food: 'Veg Noodles and Gravy',
    status: 'Order was Delivered',
  },
  {
    image: require('../../assets/images/Dashboard/Menues/menue1.png'),
    title: "Ravi's Lunch Plan",
    dateTime: '02/05/2025 (Tuesday), 1:00 PM',
    food: 'Paneer Butter Masala and Rice',
    status: 'Order is Out for Delivery',
  },
  {
    image: require('../../assets/images/Dashboard/Menues/menue1.png'),
    title: "Anita's Lunch Plan",
    dateTime: '03/05/2025 (Wednesday), 12:45 PM',
    food: 'Chicken Curry with Roti',
    status: 'Order was Delivered',
  },
  {
    image: require('../../assets/images/Dashboard/Menues/menue1.png'),
    title: "Vikram's Lunch Plan",
    dateTime: '04/05/2025 (Thursday), 1:15 PM',
    food: 'Mixed Veg Curry and Rice',
    status: 'Order Cancelled',
  },
];

const SHOW_MOCK_DATA = true;

const OrderHistoryScreen = ({navigation}: any) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [orders, setOrders] = useState<typeof mockOrders>([]);
  useEffect(() => {
    setOrders(SHOW_MOCK_DATA ? mockOrders : []);
  }, []);

  return (
    <ThemeGradientBackground>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.container}>
          <HeaderBackButton title="History" />
          <SearchBar value={searchQuery} onChangeText={setSearchQuery} />
          <ToolTipSectionHeader
            title="Sort your Orders by"
            tooltipText="Sort your Orders by"
            icon={questionIcon}
          />
          <SortButtons
            onSort={(key: string) => {
              console.log('Sort key:', key);
            }}
          />

          {orders.length > 0 ? (
            orders.map((item, index) => (
              <OrderCard
                key={index}
                data={item}
                onPress={() =>
                  navigation.navigate('HistoryDetailPage', {order: item})
                }
              />
            ))
          ) : (
            <NoDataFound />
          )}
        </View>
      </ScrollView>
    </ThemeGradientBackground>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: wp('6%'),
    paddingBottom: hp('10%'),
  },
});

export default OrderHistoryScreen;
