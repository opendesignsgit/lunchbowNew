// import PrimaryButton from 'components/buttons/PrimaryButton';
// import ErrorMessage from 'components/Error/BoostrapStyleError';
// import {LoadingModal} from 'components/LoadingModal/LoadingModal';
// import React, {useEffect, useRef, useState} from 'react';
// import {
//   Keyboard,
//   KeyboardAvoidingView,
//   Platform,
//   ScrollView,
//   StyleSheet,
//   Text,
//   TouchableOpacity,
//   TouchableWithoutFeedback,
//   View,
// } from 'react-native';
// import PhoneInput from 'react-native-phone-number-input';
// import {
//   heightPercentageToDP as hp,
//   widthPercentageToDP as wp,
// } from 'react-native-responsive-screen';
// import {SvgXml} from 'react-native-svg';
// import {facebookIcon, googleIcon, logo} from 'styles/svg-icons';
// import {useAuth} from '../../../context/AuthContext';
// import ThemeInputPrimary from 'components/inputs/ThemeInputPrimary';
// import CheckBox from '@react-native-community/checkbox';
// import Fonts from 'assets/styles/fonts';
// import {Colors} from 'assets/styles/colors';
// import ThemeGradientBackground from 'components/Backgrounds/GradientBackground';
// import {validateSignUpForm} from 'screens/validations';

// const SignUpScreen = ({navigation, route}: {navigation: any; route: any}) => {
//   const [error, setError] = useState<string | null>(null);
//   const {SendOtp, isProfileSetupDone, userId} = useAuth();
//   const [loading, setLoading] = useState(false);
//   const {message, success} = route.params || {message: null, success: null};
//   const [loginSuccess, setLoginSuccess] = useState(false);
//   const phoneInputRef = useRef<PhoneInput>(null);
//   const [phoneNumber, setPhoneNumber] = useState('');
//   const [phoneKey, setPhoneKey] = useState(Date.now());
//   const [formattedValue, setFormattedValue] = useState('');
//   const [isPrivacyChecked, setIsPrivacyChecked] = useState(false);
//   const [firstName, setFirstName] = useState('');
//   const [lastName, setLastName] = useState('');
//   const [email, setemail] = useState('');

//   useEffect(() => {
//     if (error) {
//       const timer = setTimeout(() => {
//         handleCloseError();
//       }, 5000);

//       return () => clearTimeout(timer);
//     }
//   }, [error]);

//   const halndleSignUp = async () => {
//     const err = validateSignUpForm({
//       firstName,
//       lastName,
//       email,
//       formattedValue,
//       isPrivacyChecked,
//     });
//     if (err) return setError(err);

//     // if (!lastName){
//     //   setError('Please Enter last Name');
//     // }

//     // if (!email) {
//     //   setError('Please enter a valid email');
//     //   return;
//     // }
//     // if (!firstName || firstName.trim().length < 2) {
//     //   setError('Please enter your full name.');
//     //   return;
//     // }

//     // if (!isPrivacyChecked) {
//     //   setError('Please agree to the privacy policy to continue.');
//     //   return;
//     // }

//     // if (!formattedValue) {
//     //   setError('Please enter a valid phone number.');
//     //   return;
//     // }

//     // let mobile = formattedValue.replace('+', '');

//     // if (mobile.startsWith('91') && mobile.length === 12) {
//     //   mobile = mobile.slice(2);
//     // }

//     // const path = 'signUp';

//     try {
//       setLoading(true);
//       const LoginData = {firstName, lastName, email, mobile, path};
//       const response = await SendOtp(LoginData);
//       if (response?.success && response?.smsLogId?.variables?.[0]) {
//         navigation.navigate('OtpVerificationScreen', {
//           ...LoginData,
//         });
//       } else {
//         setError(
//           response?.message || 'Something went wrong while sending OTP.',
//         );
//       }
//     } catch (error) {
//       console.log('Error:', error);
//       setError(
//         error instanceof Error ? error.message : 'Something went wrong.',
//       );
//     } finally {
//       setLoading(false);
//     }
//   };

//   const handleGoogleLogin = () => {
//     navigation.navigate('GoogleAuth');
//   };

//   const handleCloseError = () => {
//     setError(null);
//   };

//   return (
//     <ThemeGradientBackground>
//       <KeyboardAvoidingView
//         style={{flex: 1}}
//         behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
//         <TouchableWithoutFeedback onPress={() => Keyboard.dismiss()}>
//           <ScrollView
//             contentContainerStyle={{flexGrow: 1}}
//             keyboardShouldPersistTaps="handled">
//             <View style={styles.container}>
//               <View style={styles.logoContainer}>
//                 <SvgXml xml={logo} style={styles.logo} />
//               </View>

//               <View style={styles.titleContainer}>
//                 <Text style={styles.titleText}>Sign up</Text>
//                 <Text style={styles.subtitleText}>
//                   Enter your details to continue.{' '}
//                 </Text>
//               </View>
//               {error && (
//                 <ErrorMessage error={error} onClose={handleCloseError} />
//               )}

//               {/*######## FIRST NAME ######### */}
//               <View style={styles.inputContainer}>
//                 <Text style={styles.label}>First Name</Text>
//                 <ThemeInputPrimary
//                   value={firstName}
//                   onChangeText={setFirstName}
//                   label="Full Name* (with Initial or Surname)"
//                   placeholder="Enter Full name"
//                 />
//               </View>

//               {/*######## LAST NAME ######### */}

//               <View style={styles.inputContainer}>
//                 <Text style={styles.label}>Last Name</Text>
//                 <ThemeInputPrimary
//                   value={lastName}
//                   onChangeText={setLastName}
//                   label="Last Name* (with Initial or Surname)"
//                   placeholder="Enter Last name"
//                 />
//               </View>

//               {/*######## EROR THROW  ######### */}

//               {error && (
//                 <ErrorMessage error={error} onClose={handleCloseError} />
//               )}

//               {/*########## EMAIL  ########### */}

//               <View style={styles.inputContainer}>
//                 <Text style={styles.label}>Email</Text>
//                 <ThemeInputPrimary
//                   value={email}
//                   onChangeText={setemail}
//                   label="Email"
//                   placeholder="Enter Email"
//                 />
//               </View>

//               {error && (
//                 <ErrorMessage error={error} onClose={handleCloseError} />
//               )}

//               {/*####### PHONE NUMBER  ######### */}

//               <View style={styles.inputContainer}>
//                 <Text style={styles.label}>Phone Number</Text>
//                 <PhoneInput
//                   key={phoneKey}
//                   ref={phoneInputRef}
//                   defaultValue={phoneNumber}
//                   defaultCode="IN"
//                   layout="first"
//                   onChangeText={text => setPhoneNumber(text)}
//                   onChangeFormattedText={text => setFormattedValue(text)}
//                   withShadow
//                   autoFocus={false}
//                   placeholder="Enter Mobile Number"
//                   containerStyle={{
//                     width: '100%',
//                     borderWidth: 1,
//                     borderColor: Colors.lightRed,
//                     borderRadius: 5,
//                     paddingVertical: 0,
//                     marginTop: 0,
//                     elevation: 0,
//                     marginBottom: 10,
//                   }}
//                   textContainerStyle={{
//                     backgroundColor: Colors.white,
//                     borderRadius: 5,
//                     height: 50,
//                     paddingVertical: 10,
//                   }}
//                   textInputStyle={{
//                     fontSize: 16,
//                     paddingVertical: 8,
//                     height: 40,
//                   }}
//                 />
//               </View>

//               {/*######### CHECKBOX ############# */}

//               <View style={[styles.checkboxContainer]}>
//                 <CheckBox
//                   value={isPrivacyChecked}
//                   onValueChange={setIsPrivacyChecked}
//                   tintColors={{
//                     true: Colors.primaryOrange,
//                     false: Colors.primaryOrange,
//                   }}
//                 />
//                 <Text style={styles.checkboxLabel}>
//                   By clicking, I accept the{' '}
//                   <Text
//                     style={styles.linkText}
//                     onPress={() => navigation.navigate('T&C & PrivacyPolicy')}>
//                     Privacy Policy
//                   </Text>
//                 </Text>
//               </View>

//               {/*######### BUTTON FIELD ######### */}

//               <PrimaryButton
//                 title="Send One Time Password"
//                 onPress={halndleSignUp}
//                 style={styles.signInButton}
//                 borderRadius={wp('2%')}
//                 paddingVertical={hp('1.5%')}
//                 fontSize={wp('4%')}
//                 textTransform="uppercase"
//                 fontFamily="Poppins-SemiBold"
//               />

//               {/*######### DIVIDER  ############# */}

//               <View style={styles.dividerContainer}>
//                 <View style={styles.line} />
//                 <Text style={styles.orText}>or Login with</Text>
//                 <View style={styles.line} />
//               </View>

//               {/*###### CONTINUE SOCIAL  ######## */}

//               <View style={styles.socialButtonRow}>
//                 <TouchableOpacity
//                   style={styles.socialButton}
//                   onPress={handleGoogleLogin}>
//                   <SvgXml xml={googleIcon} style={styles.socialIcon} />
//                   <Text style={styles.socialButtonText}>Google</Text>
//                 </TouchableOpacity>

//                 <TouchableOpacity style={styles.socialButton}>
//                   <SvgXml xml={facebookIcon} style={styles.socialIcon} />
//                   <Text style={styles.socialButtonText}>Facebook</Text>
//                 </TouchableOpacity>
//               </View>

//               {/*######### FOOTER  ############### */}

//               <View style={styles.footer}>
//                 <View style={styles.footerRow}>
//                   <Text style={styles.footerText}>Don’t have an Account?</Text>
//                   <TouchableOpacity
//                     onPress={() => navigation.navigate('Signup')}>
//                     <Text style={styles.createAccountLink}>Signup</Text>
//                   </TouchableOpacity>
//                 </View>
//               </View>

//               {/*######### LOADING  ############## */}

//               <LoadingModal loading={loading} setLoading={setLoading} />
//             </View>
//           </ScrollView>
//         </TouchableWithoutFeedback>
//       </KeyboardAvoidingView>
//     </ThemeGradientBackground>
//   );
// };

// const styles = StyleSheet.create({
//   gradientContainer: {
//     flex: 1,
//   },
//   container: {
//     flex: 1,
//     justifyContent: 'center',
//     alignItems: 'center',
//     padding: wp('8%'),
//   },
//   logoContainer: {
//     width: '100%',
//     alignItems: 'center',
//     marginBottom: hp('3%'),
//   },
//   logo: {
//     width: wp('30%'),
//     height: wp('30%'),
//   },
//   title: {
//     width: '100%',
//     alignItems: 'flex-end',
//     fontFamily: Fonts.Urbanist.regular,
//     flexDirection: 'row',
//   },
//   titleContainer: {
//     width: '100%',
//     marginBottom: hp('3%'),
//   },

//   titleText: {
//     fontSize: wp('8%'),
//     color: Colors.primaryOrange,
//     fontFamily: Fonts.Urbanist.bold,
//     marginBottom: hp('0.5%'),
//     textTransform: 'uppercase',
//   },

//   subtitleText: {
//     fontSize: wp('4%'),
//     color: Colors.default,
//     fontFamily: Fonts.OpenSans.regular,
//   },
//   label: {
//     fontSize: wp('4%'),
//     color: Colors.black,
//     fontFamily: Fonts.Urbanist.semiBold,
//   },

//   inputContainer: {
//     width: '100%',
//     marginVertical: hp('0.5%'),
//     gap: hp('1%'),
//     fontSize: wp('14%'),
//     fontFamily: Fonts.OpenSans.semiBold,
//   },
//   descriptionContainer: {
//     fontSize: wp('4%'),
//     color: Colors.black,
//     marginBottom: hp('1%'),
//   },
//   checkboxContainer: {
//     width: '100%',
//     marginVertical: hp('1.5%'),
//     alignItems: 'flex-start',
//   },

//   checkbox: {
//     flexDirection: 'row',
//     alignItems: 'center',
//   },

//   checkboxBox: {
//     width: wp('4.5%'),
//     height: wp('4.5%'),
//     borderWidth: 1,
//     borderColor: Colors.default,
//     marginRight: wp('2.5%'),
//     borderRadius: 4,
//     backgroundColor: Colors.white,
//   },

//   checkboxChecked: {
//     backgroundColor: Colors.primaryOrange,
//     borderColor: Colors.primaryOrange,
//   },

//   checkboxLabel: {
//     fontSize: wp('3.8%'),
//     color: Colors.bodyText,
//     fontFamily: Fonts.OpenSans.regular,
//     flexShrink: 1,
//   },

//   linkText: {
//     color: Colors.primaryOrange,

//     textDecorationLine: 'underline',
//   },

//   dividerContainer: {
//     flexDirection: 'row',
//     alignItems: 'center',
//     justifyContent: 'center',
//     marginVertical: hp('2%'),
//     width: '100%',
//     gap: wp('2%'),
//     paddingHorizontal: wp('5%'),
//     paddingVertical: hp('1%'),
//   },
//   line: {
//     flex: 1,
//     height: 1,
//     backgroundColor: Colors.lightRed,
//     marginHorizontal: wp('2%'),
//   },
//   orText: {
//     fontSize: hp('2%'),
//     color: Colors.bodyText,
//   },
//   socialButton: {
//     flexDirection: 'row',
//     alignItems: 'center',
//     justifyContent: 'flex-start',
//     borderWidth: 1,
//     borderColor: Colors.lightRed,
//     borderRadius: 25,
//     width: '48%',
//     paddingVertical: hp('2%'),
//     paddingHorizontal: wp('10%'),
//     marginVertical: hp('0.3%'),
//   },
//   socialButtonRow: {
//     flexDirection: 'row',
//     justifyContent: 'space-between',
//     alignItems: 'center',
//     width: '100%',
//     gap: wp('3%'),
//     marginBottom: hp('2%'),
//   },

//   socialIcon: {
//     width: wp('5%'),
//     height: wp('5%'),
//     marginRight: wp('3%'),
//   },
//   socialButtonText: {
//     fontSize: wp('4%'),
//     color: Colors.black,
//     fontFamily: 'Inter',
//   },
//   signInButton: {
//     height: hp('6%'),
//     justifyContent: 'center',
//     width: '100%',
//   },
//   footer: {
//     marginTop: hp('5%'),
//   },
//   footerRow: {
//     flexDirection: 'row',
//     justifyContent: 'center',
//     alignItems: 'center',
//   },
//   footerText: {
//     fontSize: wp('4%'),
//     color: Colors.black,
//   },
//   createAccountLink: {
//     fontSize: wp('4%'),
//     color: Colors.primaryOrange,
//     marginLeft: 5,
//   },
// });

// export default SignUpScreen;










// import CheckBox from '@react-native-community/checkbox';
// import ThemeGradientBackground from 'components/Backgrounds/GradientBackground';
// import PrimaryButton from 'components/buttons/PrimaryButton';
// import ErrorMessage from 'components/Error/BoostrapStyleError';
// import {LoadingModal} from 'components/LoadingModal/LoadingModal';
// import React, {useEffect, useRef, useState} from 'react';
// import {
//   Keyboard,
//   KeyboardAvoidingView,
//   Platform,
//   ScrollView,
//   StyleSheet,
//   Text,
//   TouchableOpacity,
//   TouchableWithoutFeedback,
//   View,
// } from 'react-native';
// import PhoneInput from 'react-native-phone-number-input';
// import {
//   heightPercentageToDP as hp,
//   widthPercentageToDP as wp,
// } from 'react-native-responsive-screen';
// import {SvgXml} from 'react-native-svg';
// import {facebookIcon, googleIcon, logo} from 'styles/svg-icons';
// import {useAuth} from '../../../context/AuthContext';
// import {Colors} from 'assets/styles/colors';
// import Fonts from 'assets/styles/fonts';
// import ThemeInputPrimary from 'components/inputs/ThemeInputPrimary';
// import { validateLoginForm } from 'screens/validations';

// const LoginScreen = ({navigation, route}: {navigation: any; route: any}) => {
//   const [error, setError] = useState<string | null>(null);
//   const {SendOtp, isProfileSetupDone, userId} = useAuth();
//   const [loading, setLoading] = useState(false);
//   const {message, success} = route.params || {message: null, success: null};
//   const [loginSuccess, setLoginSuccess] = useState(false);
//   const phoneInputRef = useRef<PhoneInput>(null);
//   const [mobile, setPhoneNumber] = useState('');
//   const [phoneKey, setPhoneKey] = useState(Date.now());
//   const [formattedValue, setFormattedValue] = useState('');
//   const [isPrivacyChecked, setIsPrivacyChecked] = useState(false);

//   useEffect(() => {
//     if (error) {
//       const timer = setTimeout(() => {
//         handleCloseError();
//       }, 5000);

//       return () => clearTimeout(timer);
//     }
//   }, [error]);

//   // const halndleSendOtp = async () => {
//   //   if (!isPrivacyChecked) {
//   //     setError('Please agree to the privacy policy to continue.');
//   //     return;
//   //   }
//   //   if (!formattedValue) {
//   //     setError('Please enter a valid phone number.');
//   //     return;
//   //   }

//   //   let mobile = formattedValue.replace('+', '');

//   //   if (mobile.startsWith('91') && mobile.length === 12) {
//   //     mobile = mobile.slice(2);
//   //   }

//   //   const path = 'logIn';
//   //   console.log('mobile', mobile);

//   //   try {
//   //     setLoading(true);
//   //     const LoginData = {mobile, path};
//   //     console.log('Login Data:', LoginData);
//   //     const response = await SendOtp(LoginData);
//   //     if (response?.success) {
//   //       navigation.navigate('OtpVerificationScreen', {
//   //         mobile,
//   //         path: 'logIn-otp',
//   //       });
//   //     } else {
//   //       setError(response?.message || 'Failed to send OTP. Please try again.');
//   //     }
//   //   } catch (error) {
//   //     console.log('Error:', error);
//   //     setError(
//   //       error instanceof Error ? error.message : 'Something went wrong.',
//   //     );
//   //   } finally {
//   //     setLoading(false);
//   //   }
//   // };


//   const halndleSendOtp = async () => {
//   const err = validateLoginForm({
//     formattedValue: mobile,
//     isPrivacyChecked,
//   });
//   if (err) return setError(err);

//   const cleanNumber = mobile.replace(/\D/g, '');
//   const path = 'logIn';

//   try {
//     setLoading(true);
//     const LoginData = {mobile: cleanNumber, path};
//     const response = await SendOtp(LoginData);

//     if (response?.success) {
//       navigation.navigate('OtpVerificationScreen', {
//         mobile: cleanNumber,
//         path: 'logIn-otp',
//       });
//     } else {
//       setError(response?.message || 'Failed to send OTP. Please try again.');
//     }
//   } catch (error) {
//     console.log('Error:', error);
//     setError(
//       error instanceof Error ? error.message : 'Something went wrong.',
//     );
//   } finally {
//     setLoading(false);
//   }
// };

//   const handleGoogleLogin = () => {
//     navigation.navigate('GoogleAuth');
//   };

//   const handleCloseError = () => {
//     setError(null);
//   };

//   return (
//     <ThemeGradientBackground>
//       <KeyboardAvoidingView
//         style={{flex: 1}}
//         behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
//         <TouchableWithoutFeedback onPress={() => Keyboard.dismiss()}>
//           <ScrollView
//             contentContainerStyle={{flexGrow: 1}}
//             keyboardShouldPersistTaps="handled">
//             <View style={styles.container}>
//               <View style={styles.logoContainer}>
//                 <SvgXml xml={logo} style={styles.logo} />
//               </View>
//               <View style={styles.titleContainer}>
//                 <Text style={styles.titleText}>Log in</Text>
//                 <Text style={styles.subtitleText}>
//                   Enter your mobile number to continue.
//                 </Text>
//               </View>

//               {error && (
//                 <ErrorMessage error={error} onClose={handleCloseError} />
//               )}

//               <View style={styles.inputContainer}>
//                 {/*####### PHONE NUMBER  ######### */}

//                 <Text style={styles.label}>Phone Number</Text>
//                 <ThemeInputPrimary
//                   value={mobile}
//                   onChangeText={setPhoneNumber}
//                   keyboardType="numeric"
//                   maxLength={10}
//                   placeholder="Enter Mobile Number"
//                 />

//                 <View style={[styles.checkboxContainer]}>
//                   <CheckBox
//                     value={isPrivacyChecked}
//                     onValueChange={setIsPrivacyChecked}
//                     tintColors={{
//                       true: Colors.primaryOrange,
//                       false: Colors.default,
//                     }}
//                   />
//                   <Text style={styles.checkboxLabel}>
//                     By clicking, I accept the{' '}
//                     <Text
//                       style={styles.linkText}
//                       onPress={() =>
//                         navigation.navigate('T&C & PrivacyPolicy')
//                       }>
//                       Privacy Policy
//                     </Text>
//                   </Text>
//                 </View>

//                 <PrimaryButton
//                   title="Send One Time Password"
//                   onPress={halndleSendOtp}
//                   style={styles.signInButton}
//                 />
//               </View>

//               <View style={styles.dividerContainer}>
//                 <View style={styles.line} />
//                 <Text style={styles.orText}>or Login with</Text>
//                 <View style={styles.line} />
//               </View>

//               <View style={styles.socialButtonRow}>
//                 <TouchableOpacity
//                   style={styles.socialButton}
//                   onPress={handleGoogleLogin}>
//                   <SvgXml xml={googleIcon} style={styles.socialIcon} />
//                   <Text style={styles.socialButtonText}>Google</Text>
//                 </TouchableOpacity>

//                 <TouchableOpacity style={styles.socialButton}>
//                   <SvgXml xml={facebookIcon} style={styles.socialIcon} />
//                   <Text style={styles.socialButtonText}>Facebook</Text>
//                 </TouchableOpacity>
//               </View>

//               <View style={styles.footer}>
//                 <View style={styles.footerRow}>
//                   <Text style={styles.footerText}>Don’t have an Account?</Text>
//                   <TouchableOpacity
//                     onPress={() => navigation.navigate('Signup')}>
//                     <Text style={styles.createAccountLink}>Signup</Text>
//                   </TouchableOpacity>
//                 </View>
//               </View>
//               <LoadingModal loading={loading} setLoading={setLoading} />
//             </View>
//           </ScrollView>
//         </TouchableWithoutFeedback>
//       </KeyboardAvoidingView>
//     </ThemeGradientBackground>
//   );
// };

// const styles = StyleSheet.create({
//   gradientContainer: {
//     flex: 1,
//   },
//   container: {
//     padding: wp('8%'),
//   },
//   logoContainer: {
//     width: '100%',
//     alignItems: 'center',
//     marginBottom: hp('3%'),
//   },
//   logo: {
//     width: wp('30%'),
//     height: wp('30%'),
//   },
//   title: {
//     alignItems: 'flex-end',
//     fontFamily: Fonts.Urbanist.regular,
//     flexDirection: 'row',
//   },
//   titleContainer: {
//     marginBottom: hp('3%'),
//   },

//   titleText: {
//     fontSize: wp('8%'),
//     color: Colors.primaryOrange,
//     fontFamily: Fonts.Urbanist.bold,
//     marginBottom: hp('0.5%'),
//     textTransform: 'uppercase',
//   },

//   subtitleText: {
//     fontSize: wp('4%'),
//     color: Colors.default,
//     fontFamily: Fonts.OpenSans.regular,
//   },
//   label: {
//     fontSize: wp('5%'),
//     color: Colors.black,
//     fontFamily: Fonts.Urbanist.semiBold,
//     marginBottom: hp('1%'),
//   },

//   inputContainer: {
//     gap: hp('1%'),
//     fontSize: wp('14%'),
//     fontFamily: Fonts.Urbanist.semiBold,
//   },
//   descriptionContainer: {
//     fontSize: wp('4%'),
//     color: Colors.black,
//     fontWeight: 'bold',
//     marginBottom: hp('1%'),
//   },
//   checkboxContainer: {
//     marginTop: '6%',
//     width: '100%',
//     flexDirection: 'row',
//     alignItems: 'center',
//   },

//   checkboxLabel: {
//     fontSize: wp('3.8%'),
//     color: Colors.default,
//     fontFamily: Fonts.OpenSans.regular,
//     flexShrink: 1,
//   },
//   signInButton: {
//     height: hp('6%'),
//     justifyContent: 'center',
//     width: '100%',
//   },
//   linkText: {
//     color: Colors.primaryOrange,
//     fontWeight: '600',
//     textDecorationLine: 'underline',
//   },

//   dividerContainer: {
//     flexDirection: 'row',
//     alignItems: 'center',
//     justifyContent: 'center',
//     marginVertical: hp('2%'),
//     marginBottom: hp('2%'),
//     width: '100%',
//     gap: wp('2%'),
//     paddingHorizontal: wp('5%'),
//   },
//   line: {
//     flex: 1,
//     height: 1,
//     marginHorizontal: wp('2%'),
//     backgroundColor: Colors.default,
//   },
//   orText: {
//     fontSize: hp('1.7%'),
//     color: Colors.bodyText,
//     fontFamily: Fonts.Urbanist.bold,
//   },
//   socialButton: {
//     flexDirection: 'row',
//     alignItems: 'center',
//     justifyContent: 'flex-start',
//     borderWidth: 1,
//     borderColor: Colors.lightRed,
//     borderRadius: 10,
//     backgroundColor: Colors.white,
//     width: '48%',
//     paddingVertical: hp('2%'),
//     paddingHorizontal: wp('10%'),
//     marginVertical: hp('0.3%'),
//   },
//   socialButtonRow: {
//     flexDirection: 'row',
//     justifyContent: 'space-between',
//     alignItems: 'center',
//     width: '100%',
//     gap: wp('3%'),
//     marginBottom: hp('2%'),
//   },

//   socialIcon: {
//     width: wp('5%'),
//     height: wp('5%'),
//     marginRight: wp('3%'),
//   },
//   socialButtonText: {
//     fontSize: wp('4%'),
//     color: Colors.bodyText,
//     fontFamily: Fonts.OpenSans.regular,
//   },

//   footer: {
//     marginTop: hp('15%'),
//   },
//   footerRow: {
//     flexDirection: 'row',
//     justifyContent: 'center',
//     alignItems: 'center',
//   },
//   footerText: {
//     fontSize: wp('4%'),
//     color: Colors.black,
//   },
//   createAccountLink: {
//     fontSize: wp('4%'),
//     color: Colors.primaryOrange,
//     fontWeight: '500',
//     marginLeft: 5,
//   },
// });

// export default LoginScreen;
