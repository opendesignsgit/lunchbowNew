import React, { useEffect, useState } from 'react';
import { View, ScrollView, StyleSheet, TouchableOpacity, Text } from 'react-native';
import { useAuth } from 'context/AuthContext';
import ThemeGradientBackground from 'components/Backgrounds/GradientBackground';
import HeaderBackButton from 'screens/Dashboard/Components/BackButton';
import Typography from 'components/Text/Typography';
import ErrorMessage from 'components/Error/BoostrapStyleError';
import { LoadingModal } from 'components/LoadingModal/LoadingModal';
import RegistrationService from 'services/RegistartionService/registartion';
import { heightPercentageToDP as hp, widthPercentageToDP as wp } from 'react-native-responsive-screen';
import { Colors } from 'assets/styles/colors';
import Fonts from 'assets/styles/fonts';
import { Edit, Plus } from 'lucide-react-native';
import NoDataFound from 'components/Error/NoDataMessage';

export default function ParentChildInfoScreen({ navigation }: any) {
  const { userId } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [parent, setParent] = useState<any | null>(null);
  const [children, setChildren] = useState<any[]>([]);

  const USE_MOCK_DATA = true; 

  useEffect(() => {
    if (!userId) return;

    const fetchData = async () => {
      try {
        setLoading(true);

        if (USE_MOCK_DATA) {
          const mockParent = {
            fatherFirstName: 'Ramesh',
            fatherLastName: 'Kumar',
            motherFirstName: 'Sita',
            motherLastName: 'Ramesh',
            mobile: '+91 9876543210',
            address: '123, Anna Nagar, Chennai',
          };

          const mockChildren = [
            {
              _id: '1',
              childFirstName: 'Aarav',
              childLastName: 'Ramesh',
              dob: '2015-08-15',
              school: 'Greenwood High',
              childClass: '5',
              section: 'A',
              lunchTime: '12:30 PM',
              allergies: 'Peanuts',
            },
            {
              _id: '2',
              childFirstName: 'Ananya',
              childLastName: 'Ramesh',
              dob: '2018-04-10',
              school: 'Greenwood High',
              childClass: '2',
              section: 'B',
              lunchTime: '12:15 PM',
              allergies: 'None',
            },
          ];

          setParent(mockParent);
          setChildren(mockChildren);
        } else {
          const response: any = await RegistrationService.getParentAndChildren(userId);
          if (response?.data) {
            setParent(response.data.parent || null);
            setChildren(response.data.children || []);
          }
        }
      } catch (err) {
        console.error('Error fetching parent/children info:', err);
        setError('Failed to load information');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [userId]);

  return (
    <ThemeGradientBackground>
      <LoadingModal loading={loading} setLoading={setLoading} />
      {error && <ErrorMessage error={error} onClose={() => setError(null)} />}

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <HeaderBackButton title="Parent & Children Info" />

        {/* Parent Info */}
        <Typography style={styles.sectionHeader}>Parent Information</Typography>
        {parent ? (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.parentName}>
                {parent.fatherFirstName} {parent.fatherLastName} & {parent.motherFirstName} {parent.motherLastName}
              </Text>
              <TouchableOpacity onPress={() => navigation.navigate('EditParent', { parent })}>
                <Edit size={20} color={Colors.primaryOrange} />
              </TouchableOpacity>
            </View>
            <Text style={styles.parentDetail}>Mobile: {parent.mobile || '-'}</Text>
            <Text style={styles.parentDetail}>Address: {parent.address || '-'}</Text>
          </View>
        ) : (
          <NoDataFound message="No Parent Information Found" />
        )}

        {/* Children Info */}
        <Typography style={styles.sectionHeader}>Children Information</Typography>
        {children.length > 0 ? (
          children.map((child: any) => (
            <View key={child._id} style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.childName}>
                  {child.childFirstName} {child.childLastName}
                </Text>
                <TouchableOpacity onPress={() => navigation.navigate('EditChild', { child })}>
                  <Edit size={20} color={Colors.primaryOrange} />
                </TouchableOpacity>
              </View>
              <Text style={styles.childDetail}>DOB: {child.dob || '-'}</Text>
              <Text style={styles.childDetail}>School: {child.school || '-'}</Text>
              <Text style={styles.childDetail}>
                Class: {child.childClass || '-'} {child.section || ''}
              </Text>
              <Text style={styles.childDetail}>Lunch Time: {child.lunchTime || '-'}</Text>
              <Text style={styles.childDetail}>Allergies: {child.allergies || 'None'}</Text>
            </View>
          ))
        ) : (
          <NoDataFound message="No Children Found" />
        )}

        {/* Add Child Button */}
        <TouchableOpacity style={styles.addButton} onPress={() => navigation.navigate('AddChild')}>
          <Plus size={20} color={Colors.white} />
          <Typography style={styles.addButtonText}>Add Child</Typography>
        </TouchableOpacity>
      </ScrollView>
    </ThemeGradientBackground>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: hp('10%'),
    paddingHorizontal: wp('5%'),
  },
  sectionHeader: {
    fontSize: 18,
    marginTop: hp('2%'),
    marginBottom: hp('1%'),
    fontFamily: Fonts.Urbanist.bold,
  },
  card: {
    backgroundColor: Colors.white,
    borderRadius: 12,
    padding: wp('4%'),
    marginBottom: hp('2%'),
    shadowColor: Colors.black,
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: hp('1%'),
  },
  parentName: {
    fontSize: hp('2.1%'),
    fontFamily: Fonts.Urbanist.bold,
    color: Colors.black,
  },
  parentDetail: {
    fontSize: hp('1.8%'),
    fontFamily: Fonts.Urbanist.medium,
    color: Colors.bodyText,
    marginBottom: 3,
  },
  childName: {
    fontSize: hp('2%'),
    fontFamily: Fonts.Urbanist.bold,
    color: Colors.black,
  },
  childDetail: {
    fontSize: hp('1.7%'),
    fontFamily: Fonts.Urbanist.medium,
    color: Colors.bodyText,
    marginBottom: 2,
  },
  addButton: {
    flexDirection: 'row',
    backgroundColor: Colors.primaryOrange,
    borderRadius: 25,
    paddingVertical: hp('1.5%'),
    paddingHorizontal: wp('5%'),
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: hp('2%'),
    alignSelf: 'center',
  },
  addButtonText: {
    fontSize: hp('2%'),
    fontFamily: Fonts.Urbanist.bold,
    color: Colors.white,
    marginLeft: 8,
  },
});
