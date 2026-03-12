// import {Colors} from 'assets/styles/colors';
// import Fonts from 'assets/styles/fonts';
// import {useMenu} from 'context/MenuContext';
// import React, {useState} from 'react';
// import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
// import {
//   heightPercentageToDP as hp,
//   widthPercentageToDP as wp,
// } from 'react-native-responsive-screen';
// import {SvgXml} from 'react-native-svg';
// import {BackIcon} from 'styles/svg-icons';
// interface Holiday {
//   id: string;
//   name: string;
//   date: string;
// }
// interface CalendarProps {
//   onDateChange?: (date: string) => void;
//   holidays?: Holiday[];
//   currentMonth: number;
//   currentYear: number;
//   onMonthChange: (month: number, year: number) => void;

//   startDate?: string;
//   endDate?: string;
// }
// const daysOfWeek = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// export default function MenueCalendar({
//   onDateChange,
//   holidays = [],
//   currentMonth,
//   currentYear,
//   onMonthChange,
// }: CalendarProps) {
//   const {startDate, endDate} = useMenu();

//   const [tooltipVisible, setTooltipVisible] = useState(false);
//   const [tooltipText, setTooltipText] = useState('');

//   let holdTimeout: NodeJS.Timeout;

//   if (!startDate || !endDate) {
//     return <Text>Loading calendar...</Text>;
//   }
//   const [selectedDate, setSelectedDate] = useState<string>('');
//   const getDaysInMonth = (month: number, year: number) => {
//     return new Date(year, month + 1, 0).getDate();
//   };
//   const getFirstDayOfMonth = (month: number, year: number) => {
//     let day = new Date(year, month, 1).getDay();
//     return day === 0 ? 6 : day - 1;
//   };
//   const daysInMonth = getDaysInMonth(currentMonth, currentYear);
//   const firstDayIndex = getFirstDayOfMonth(currentMonth, currentYear);

//   const prevMonth = () => {
//     if (currentMonth === 0) {
//       onMonthChange(11, currentYear - 1);
//     } else {
//       onMonthChange(currentMonth - 1, currentYear);
//     }
//   };
//   const nextMonth = () => {
//     if (currentMonth === 11) {
//       onMonthChange(0, currentYear + 1);
//     } else {
//       onMonthChange(currentMonth + 1, currentYear);
//     }
//   };

//   const monthNames = [
//     'January',
//     'February',
//     'March',
//     'April',
//     'May',
//     'June',
//     'July',
//     'August',
//     'September',
//     'October',
//     'November',
//     'December',
//   ];

//   let calendarDays: (string | number)[] = [];
//   for (let i = 0; i < firstDayIndex; i++) {
//     calendarDays.push('');
//   }
//   for (let day = 1; day <= daysInMonth; day++) {
//     calendarDays.push(day);
//   }
//   const isHoliday = (day: number) => {
//     const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(
//       2,
//       '0',
//     )}-${String(day).padStart(2, '0')}`;
//     return holidays.some(h => h.date === dateStr);
//   };
//   const handleDateSelect = (day: number) => {
//     const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(
//       2,
//       '0',
//     )}-${String(day).padStart(2, '0')}`;

//     const holiday = holidays.find(h => h.date === dateStr);
//     if (holiday) {
//       setTooltipText(`Holiday: ${holiday.name}`);
//     } else {
//       setTooltipText(`Selected Date: ${dateStr}`);
//     }

//     setSelectedDate(dateStr);
//     onDateChange?.(dateStr);
//   };

//   //################### RANGE COLOR KU KUDUKURA####################
//   const isStartDate = (day: number) => {
//     if (!startDate) return false;
//     const dayStr = `${currentYear}-${String(currentMonth + 1).padStart(
//       2,
//       '0',
//     )}-${String(day).padStart(2, '0')}`;
//     return dayStr === startDate;
//   };

//   const isEndDate = (day: number) => {
//     if (!endDate) return false;
//     const dayStr = `${currentYear}-${String(currentMonth + 1).padStart(
//       2,
//       '0',
//     )}-${String(day).padStart(2, '0')}`;
//     return dayStr === endDate;
//   };

//   const isInBetweenRange = (day: number) => {
//     if (!startDate || !endDate) return false;

//     const dayStr = `${currentYear}-${String(currentMonth + 1).padStart(
//       2,
//       '0',
//     )}-${String(day).padStart(2, '0')}`;

//     // skip if holiday
//     if (isHoliday(day)) return false;

//     const dayDate = new Date(dayStr);
//     const start = new Date(startDate);
//     const end = new Date(endDate);
//     dayDate.setHours(0, 0, 0, 0);
//     start.setHours(0, 0, 0, 0);
//     end.setHours(0, 0, 0, 0);

//     return dayDate > start && dayDate < end;
//   };

//   return (
//     <View style={styles.container}>
//       {/* Header */}
//       <View style={styles.header}>
//         <TouchableOpacity onPress={prevMonth}>
//           <SvgXml xml={BackIcon} />
//         </TouchableOpacity>
//         <Text style={styles.headerText}>
//           {monthNames[currentMonth].toUpperCase()}, {currentYear}
//         </Text>
//         <TouchableOpacity onPress={nextMonth}>
//           <SvgXml xml={BackIcon} style={{transform: [{rotate: '180deg'}]}} />
//         </TouchableOpacity>
//       </View>

//       {/* Week Days */}
//       <View style={styles.weekRow}>
//         {daysOfWeek.map((day, index) => (
//           <Text
//             key={index}
//             style={[
//               styles.weekDay,
//               day === 'Sat' || day === 'Sun' ? styles.weekendText : null,
//             ]}>
//             {day}
//           </Text>
//         ))}
//       </View>

//       {/* Dates */}
//       <View style={styles.daysContainer}>
//         {calendarDays.map((day, index) => {
//           if (day === '') {
//             return <View key={index} style={styles.dayCell} />;
//           }
//           const dayNumber = day as number;
//           const holiday = isHoliday(day as number);
//           const isSelected =
//             selectedDate ===
//             `${currentYear}-${String(currentMonth + 1).padStart(
//               2,
//               '0',
//             )}-${String(day).padStart(2, '0')}`;

//           const isWeekend = (index: number) =>
//             index % 7 === 5 || index % 7 === 6;

//           return (
//             <TouchableOpacity
//               key={index}
//               // ##############################################################################
//               // ########################## // BACKGROND CHNAGES CELSS ########################
//               // ##############################################################################

//               style={[
//                 styles.dayCell,
//                 holiday && styles.holidayBg,
//                 isSelected && styles.selectedBg,
//                 isWeekend(index) && !holiday && styles.weekendBg,
//                 isStartDate(day as number) && styles.startDateBg,
//                 isEndDate(day as number) && styles.endDateBg,
//                 isInBetweenRange(day as number) &&
//                   !isWeekend(index) &&
//                   styles.rangeBg,
//               ]}
//               onPress={() => handleDateSelect(day as number)}
//               onPressIn={() => {
//                 holdTimeout = setTimeout(() => {
//                   const dateStr = `${currentYear}-${String(
//                     currentMonth + 1,
//                   ).padStart(2, '0')}-${String(dayNumber).padStart(2, '0')}`;

//                   let tooltip = '';
//                   if (isStartDate(dayNumber)) {
//                     tooltip = `Plan Started: ${dateStr}`;
//                   } else if (isEndDate(dayNumber)) {
//                     tooltip = `Plan Ends: ${dateStr}`;
//                   } else if (isInBetweenRange(dayNumber) && !isWeekend(index)) {
//                     // skip weekends
//                     tooltip = `Plan Ongoing: ${dateStr}`;
//                   } else if (holiday) {
//                     tooltip = `Holiday: ${
//                       holidays.find(h => h.date === dateStr)?.name
//                     } (${dateStr})`;
//                   } else {
//                     tooltip = `Selected Date: ${dateStr}`;
//                   }

//                   setTooltipText(tooltip);
//                   setTooltipVisible(true);
//                 }, 1000);
//               }}
//               onPressOut={() => {
//                 clearTimeout(holdTimeout);
//                 setTooltipVisible(false);
//               }}>

//               <Text
//                 style={[
//                   styles.dayText,
//                   (index % 7 === 5 || index % 7 === 6) && !holiday
//                     ? styles.weekendText
//                     : null,
//                   holiday ? styles.holidayText : null,
//                   isSelected ? styles.selectedText : null,
//                 ]}>
//                 {day}
//               </Text>
//             </TouchableOpacity>
//           );
//         })}
//       </View>

//       {tooltipVisible && (
//         <View
//           style={{
//             position: 'absolute',
//             top: hp('2%'), // fixed distance from top of the calendar container
//             left: wp('10%'), // center horizontally, adjust as needed
//             right: wp('10%'), // ensures fixed width
//             backgroundColor: Colors.primaryOrange, // customize your color
//             padding: 12,
//             borderRadius: 10,
//             alignItems: 'center',
//             zIndex: 9999,
//             elevation: 10,
//           }}>
//           <Text
//             style={{
//               color: Colors.white,
//               fontFamily: Fonts.Urbanist.bold,
//               fontSize: wp('4%'),
//             }}>
//             {tooltipText}
//           </Text>
//         </View>
//       )}
//     </View>
//   );
// }

// const styles = StyleSheet.create({
//   container: {
//     padding: 16,
//     backgroundColor: Colors.white,
//     borderRadius: 20,
//     //  Shadow (iOS)
//     shadowColor: Colors.black,
//     shadowOffset: {width: 0, height: hp('0.2%')},
//     shadowOpacity: 0.1,
//     shadowRadius: wp('2%'),
//     //  Shadow (Android)
//     elevation: 0.9,
//   },
//   header: {
//     flexDirection: 'row',
//     justifyContent: 'space-between',
//     alignItems: 'center',
//     marginBottom: 16,
//     padding: 10,
//   },
//   headerText: {
//     fontSize: 18,
//     color: Colors.primaryOrange,
//     fontFamily: Fonts.Urbanist.bold,
//   },
//   weekRow: {
//     flexDirection: 'row',
//   },
//   weekDay: {
//     flex: 1,
//     textAlign: 'center',
//     color: Colors.black,
//     paddingVertical: 10,
//     fontFamily: Fonts.Urbanist.bold,
//     textTransform: 'uppercase',
//   },
//   weekendText: {
//     color: Colors.red,
//   },
//   daysContainer: {
//     flexDirection: 'row',
//     flexWrap: 'wrap',
//   },
//   dayCell: {
//     width: `${100 / 7}%`,
//     alignItems: 'center',
//     paddingVertical: 12,
//     borderRadius: 8,
//   },
//   dayText: {
//     fontSize: 16,
//     color: Colors.black,
//   },

//   startDateBg: {
//     backgroundColor: Colors.green,
//     borderRadius: wp('10%'),
//     padding: wp('1%'),
//   },
//   endDateBg: {
//     backgroundColor: Colors.endDate,
//     borderRadius: wp('10%'),
//     padding: wp('1%'),
//   },
//   rangeBg: {
//     backgroundColor: '#8ac9db2d',
//     borderRadius: wp('10%'),
//     padding: wp('1%'),
//   },

//   holidayBg: {
//     backgroundColor: Colors.lightRed,
//     borderRadius: wp('10%'),
//     padding: wp('1%'),
//   },
//   weekendBg: {
//     backgroundColor: Colors.lightRed,
//     borderRadius: wp('10%'),
//     padding: wp('1%'),
//   },

//   holidayText: {
//     color: Colors.red,
//     fontWeight: 'bold',
//     fontSize: wp('3.5%'),
//   },
//   selectedBg: {
//     backgroundColor: Colors.primaryOrange,
//     borderRadius: wp('10%'),
//     padding: wp('1.5%'),
//   },
//   selectedText: {
//     color: Colors.green,
//     fontWeight: 'bold',
//     fontSize: wp('3.5%'),
//   },
// });

// VERSION @  2

// import React, {useState} from 'react';
// import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
// import {SvgXml} from 'react-native-svg';
// import LinearGradient from 'react-native-linear-gradient';
// import {Colors} from 'assets/styles/colors';
// import Fonts from 'assets/styles/fonts';
// import {useMenu} from 'context/MenuContext';
// import {BackIcon} from 'styles/svg-icons';
// import {
//   heightPercentageToDP as hp,
//   widthPercentageToDP as wp,
// } from 'react-native-responsive-screen';

// interface Holiday {
//   id: string;
//   name: string;
//   date: string;
// }

// interface CalendarProps {
//   onDateChange?: (date: string) => void;
//   holidays?: Holiday[];
//   currentMonth: number;
//   currentYear: number;
//   onMonthChange: (month: number, year: number) => void;
// }

// const daysOfWeek = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// export default function MenueCalendar({
//   onDateChange,
//   holidays = [],
//   currentMonth,
//   currentYear,
//   onMonthChange,
// }: CalendarProps) {
//   const {startDate, endDate} = useMenu();

//   const [tooltipVisible, setTooltipVisible] = useState(false);
//   const [tooltipText, setTooltipText] = useState('');
//   const [selectedDate, setSelectedDate] = useState<string>('');

//   let holdTimeout: NodeJS.Timeout;

//   if (!startDate || !endDate) return <Text>Loading calendar...</Text>;

//   const getDaysInMonth = (month: number, year: number) =>
//     new Date(year, month + 1, 0).getDate();

//   const getFirstDayOfMonth = (month: number, year: number) => {
//     let day = new Date(year, month, 1).getDay();
//     return day === 0 ? 6 : day - 1; // Monday = 0
//   };

//   const daysInMonth = getDaysInMonth(currentMonth, currentYear);
//   const firstDayIndex = getFirstDayOfMonth(currentMonth, currentYear);

//   const prevMonth = () => {
//     if (currentMonth === 0) onMonthChange(11, currentYear - 1);
//     else onMonthChange(currentMonth - 1, currentYear);
//   };

//   const nextMonth = () => {
//     if (currentMonth === 11) onMonthChange(0, currentYear + 1);
//     else onMonthChange(currentMonth + 1, currentYear);
//   };

//   const monthNames = [
//     'January',
//     'February',
//     'March',
//     'April',
//     'May',
//     'June',
//     'July',
//     'August',
//     'September',
//     'October',
//     'November',
//     'December',
//   ];

//   const isHoliday = (day: number) => {
//     const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(
//       2,
//       '0',
//     )}-${String(day).padStart(2, '0')}`;
//     return holidays.some(h => h.date === dateStr);
//   };

//   const isStartDate = (day: number) => {
//     if (!startDate) return false;
//     const dayStr = `${currentYear}-${String(currentMonth + 1).padStart(
//       2,
//       '0',
//     )}-${String(day).padStart(2, '0')}`;
//     return dayStr === startDate;
//   };

//   const isEndDate = (day: number) => {
//     if (!endDate) return false;
//     const dayStr = `${currentYear}-${String(currentMonth + 1).padStart(
//       2,
//       '0',
//     )}-${String(day).padStart(2, '0')}`;
//     return dayStr === endDate;
//   };

//   const isInBetweenRange = (day: number) => {
//     if (!startDate || !endDate) return false;

//     const dayStr = `${currentYear}-${String(currentMonth + 1).padStart(
//       2,
//       '0',
//     )}-${String(day).padStart(2, '0')}`;
//     if (isHoliday(day)) return false;

//     const dayDate = new Date(dayStr);
//     const start = new Date(startDate);
//     const end = new Date(endDate);

//     dayDate.setHours(0, 0, 0, 0);
//     start.setHours(0, 0, 0, 0);
//     end.setHours(0, 0, 0, 0);

//     return dayDate > start && dayDate < end;
//   };

//   const handleDateSelect = (day: number) => {
//     const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(
//       2,
//       '0',
//     )}-${String(day).padStart(2, '0')}`;
//     const holiday = holidays.find(h => h.date === dateStr);
//     setTooltipText(
//       holiday ? `Holiday: ${holiday.name}` : `Selected Date: ${dateStr}`,
//     );
//     setSelectedDate(dateStr);
//     onDateChange?.(dateStr);
//   };

//   const isWithinRange = (day: number) => {
//     if (!startDate || !endDate) return false;

//     const dayStr = `${currentYear}-${String(currentMonth + 1).padStart(
//       2,
//       '0',
//     )}-${String(day).padStart(2, '0')}`;

//     const dayDate = new Date(dayStr);
//     const start = new Date(startDate);
//     const end = new Date(endDate);

//     dayDate.setHours(0, 0, 0, 0);
//     start.setHours(0, 0, 0, 0);
//     end.setHours(0, 0, 0, 0);

//     return dayDate >= start && dayDate <= end;
//   };

//   const isPastDate = (day: number) => {
//     const dayStr = `${currentYear}-${String(currentMonth + 1).padStart(
//       2,
//       '0',
//     )}-${String(day).padStart(2, '0')}`;
//     const dayDate = new Date(dayStr);
//     const todayDate = new Date();
//     dayDate.setHours(0, 0, 0, 0);
//     todayDate.setHours(0, 0, 0, 0);
//     return dayDate < todayDate;
//   };

//   const calendarDays: (string | number)[] = [];
//   for (let i = 0; i < firstDayIndex; i++) calendarDays.push('');
//   for (let day = 1; day <= daysInMonth; day++) calendarDays.push(day);

//   const isWeekend = (index: number) => index % 7 === 5 || index % 7 === 6;

//   return (
//     <View style={styles.container}>
//       {/* Header */}
//       <View style={styles.header}>
//         <TouchableOpacity onPress={prevMonth}>
//           <SvgXml xml={BackIcon} />
//         </TouchableOpacity>
//         <Text style={styles.headerText}>
//           {monthNames[currentMonth].toUpperCase()}, {currentYear}
//         </Text>
//         <TouchableOpacity onPress={nextMonth}>
//           <SvgXml xml={BackIcon} style={{transform: [{rotate: '180deg'}]}} />
//         </TouchableOpacity>
//       </View>

//       {/* Week Days */}
//       <View style={styles.weekRow}>
//         {daysOfWeek.map((day, index) => (
//           <Text
//             key={index}
//             style={[
//               styles.weekDay,
//               (day === 'Sat' || day === 'Sun') && styles.weekendText,
//             ]}>
//             {day}
//           </Text>
//         ))}
//       </View>

//       {/* Dates */}
//       <View style={styles.daysContainer}>
//         {calendarDays.map((day, index) => {
//           if (day === '') return <View key={index} style={styles.dayCell} />;
//           const dayNumber = day as number;
//           const isWeekendDay = (index: number) =>
//             index % 7 === 5 || index % 7 === 6;
//           const holiday = isHoliday(dayNumber) || isWeekendDay(index);
//           const selected =
//             selectedDate ===
//             `${currentYear}-${String(currentMonth + 1).padStart(
//               2,
//               '0',
//             )}-${String(dayNumber).padStart(2, '0')}`;

//           //££££££££££££££££££££££  COLORS £££££££££££££££££££££££££££££

//           let gradientColors = ['transparent', 'transparent'];
//           if (isStartDate(dayNumber))
//             gradientColors = [Colors.green, Colors.green];
//           else if (isEndDate(dayNumber))
//             gradientColors = [Colors.red, Colors.red];
//           else if (isInBetweenRange(dayNumber) && !isWeekend(index))
//             gradientColors = [Colors.lightRed, Colors.lightRed];
//           else if (holiday) gradientColors = [Colors.hoiday, Colors.hoiday];

//           return (
//             <TouchableOpacity
//               key={index}
//               style={styles.dayCell}
//               onPress={() => {
//                 if (!isPastDate(dayNumber) && isWithinRange(dayNumber)) {
//                   handleDateSelect(dayNumber);
//                 }
//               }}
//               onPressIn={() => {
//                 holdTimeout = setTimeout(() => {
//                   const dateStr = `${currentYear}-${String(
//                     currentMonth + 1,
//                   ).padStart(2, '0')}-${String(dayNumber).padStart(2, '0')}`;

//                   let tooltip = '';

//                   if (isStartDate(dayNumber)) {
//                     tooltip = `Plan Started: ${dateStr}`;
//                   } else if (isEndDate(dayNumber)) {
//                     tooltip = `Plan Ends: ${dateStr}`;
//                   } else if (isInBetweenRange(dayNumber) && !isWeekend(index)) {
//                     tooltip = `Plan Ongoing: ${dateStr}`;
//                   } else if (isWeekend(index)) {
//                     tooltip = `Weekend Holiday: ${dateStr}`;
//                   } else if (isHoliday(dayNumber)) {
//                     const holidayName =
//                       holidays.find(h => h.date === dateStr)?.name || 'Holiday';
//                     tooltip = `Holiday: ${holidayName} (${dateStr})`;
//                   } else {
//                     tooltip = `Selected Date: ${dateStr}`;
//                   }

//                   setTooltipText(tooltip);
//                   setTooltipVisible(true);
//                 }, 1000);
//               }}
//               onPressOut={() => {
//                 clearTimeout(holdTimeout);
//                 setTooltipVisible(false);
//               }}>
//               <LinearGradient
//                 colors={gradientColors}
//                 style={styles.dayCircle}
//                 start={{x: 0, y: 0}}
//                 end={{x: 1, y: 1}}>
//                 <Text
//                   style={[
//                     styles.dayText,
//                     selected && styles.selectedText,
//                     holiday && styles.holidayText,
//                     isWeekend(index) && !holiday && styles.weekendText,
//                   ]}>
//                   {dayNumber}
//                 </Text>
//               </LinearGradient>
//             </TouchableOpacity>
//           );
//         })}
//       </View>

//       {/* Tooltip */}
//       {tooltipVisible && (
//         <View style={styles.tooltip}>
//           <Text style={styles.tooltipText}>{tooltipText}</Text>
//         </View>
//       )}
//     </View>
//   );
// }

// const styles = StyleSheet.create({
//   container: {
//     padding: 16,
//     backgroundColor: Colors.white,
//     borderRadius: 20,
//     shadowColor: Colors.black,
//     shadowOffset: {width: 0, height: hp('0.2%')},
//     shadowOpacity: 0.1,
//     shadowRadius: wp('2%'),
//     elevation: 0.9,
//   },
//   header: {
//     flexDirection: 'row',
//     justifyContent: 'space-between',
//     alignItems: 'center',
//     marginBottom: 16,
//     padding: 10,
//   },
//   headerText: {
//     fontSize: 18,
//     color: Colors.primaryOrange,
//     fontFamily: Fonts.Urbanist.bold,
//   },
//   weekRow: {flexDirection: 'row'},
//   weekDay: {
//     flex: 1,
//     textAlign: 'center',
//     color: Colors.black,
//     paddingVertical: 10,
//     fontFamily: Fonts.Urbanist.bold,
//     textTransform: 'uppercase',
//   },
//   weekendText: {color: Colors.red},
//   daysContainer: {flexDirection: 'row', flexWrap: 'wrap'},
//   dayCell: {
//     width: `${100 / 7}%`,
//     alignItems: 'center',
//     justifyContent: 'center',
//     paddingVertical: 6,
//   },
//   dayCircle: {
//     width: '80%',
//     aspectRatio: 1,
//     borderRadius: 50,
//     justifyContent: 'center',
//     alignItems: 'center',
//   },
//   dayText: {fontSize: 16, color: Colors.black},
//   selectedText: {fontWeight: 'bold', color: Colors.green},
//   holidayText: {color: Colors.red, fontWeight: 'bold'},
//   tooltip: {
//     position: 'absolute',
//     top: hp('2%'),
//     left: wp('10%'),
//     right: wp('10%'),
//     backgroundColor: Colors.primaryOrange,
//     padding: 12,
//     borderRadius: 10,
//     alignItems: 'center',
//     zIndex: 9999,
//     elevation: 10,
//   },
//   tooltipText: {
//     color: Colors.white,
//     fontFamily: Fonts.Urbanist.bold,
//     fontSize: wp('4%'),
//   },
// });

// version 3 ######

// import React, { useState } from 'react';
// import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
// import { SvgXml } from 'react-native-svg';
// import LinearGradient from 'react-native-linear-gradient';
// import { Colors } from 'assets/styles/colors';
// import Fonts from 'assets/styles/fonts';
// import { useMenu } from 'context/MenuContext';
// import { BackIcon } from 'styles/svg-icons';
// import {
//   heightPercentageToDP as hp,
//   widthPercentageToDP as wp,
// } from 'react-native-responsive-screen';

// // --------------------
// // Types
// // --------------------
// interface Holiday {
//   id: string;
//   name: string;
//   date: string;
// }

// interface CalendarProps {
//   onDateChange?: (date: string) => void;
//   holidays?: Holiday[];
//   currentMonth: number;
//   currentYear: number;
//   onMonthChange: (month: number, year: number) => void;
// }

// // --------------------
// // Constants & Helpers
// // --------------------
// const daysOfWeek = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
// const monthNames = [
//   'January', 'February', 'March', 'April', 'May', 'June',
//   'July', 'August', 'September', 'October', 'November', 'December',
// ];

// const formatDate = (year: number, month: number, day: number) =>
//   `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

// const getDaysInMonth = (month: number, year: number) =>
//   new Date(year, month + 1, 0).getDate();

// const getFirstDayOfMonth = (month: number, year: number) => {
//   const day = new Date(year, month, 1).getDay();
//   return day === 0 ? 6 : day - 1; // Monday = 0
// };

// // --------------------
// // Component
// // --------------------
// export default function MenueCalendar({
//   onDateChange,
//   holidays = [],
//   currentMonth,
//   currentYear,
//   onMonthChange,
// }: CalendarProps) {
//   const { startDate, endDate } = useMenu();
//   const [tooltipVisible, setTooltipVisible] = useState(false);
//   const [tooltipText, setTooltipText] = useState('');
//   const [selectedDate, setSelectedDate] = useState<string>('');
//   let holdTimeout: NodeJS.Timeout;

//   if (!startDate || !endDate) return <Text>Loading calendar...</Text>;

//   // --------------------
//   // Date Checks
//   // --------------------
//   const isHoliday = (day: number) => holidays.some(h => h.date === formatDate(currentYear, currentMonth, day));
//   const isStartDate = (day: number) => formatDate(currentYear, currentMonth, day) === startDate;
//   const isEndDate = (day: number) => formatDate(currentYear, currentMonth, day) === endDate;
//   const isWeekend = (index: number) => index % 7 === 5 || index % 7 === 6;

//   const isInBetweenRange = (day: number) => {
//     if (!startDate || !endDate) return false;
//     const dayDate = new Date(formatDate(currentYear, currentMonth, day));
//     return dayDate > new Date(startDate) && dayDate < new Date(endDate) && !isHoliday(day);
//   };

//   const isWithinRange = (day: number) => {
//     const d = new Date(formatDate(currentYear, currentMonth, day));
//     return d >= new Date(startDate) && d <= new Date(endDate);
//   };

//   const isPastDate = (day: number) => {
//     const d = new Date(formatDate(currentYear, currentMonth, day));
//     const today = new Date();
//     d.setHours(0, 0, 0, 0);
//     today.setHours(0, 0, 0, 0);
//     return d < today;
//   };

//   // --------------------
//   // UI Helpers
//   // --------------------
//   const getGradientColors = (day: number, index: number) => {
//     if (isStartDate(day)) return [Colors.green, Colors.green];
//     if (isEndDate(day)) return [Colors.red, Colors.red];
//     if (isInBetweenRange(day) && !isWeekend(index)) return [Colors.lightRed, Colors.lightRed];
//     if (isHoliday(day) || isWeekend(index)) return [Colors.hoiday, Colors.hoiday];
//     return ['transparent', 'transparent'];
//   };

//   const getTooltipText = (day: number, index: number) => {
//     const dateStr = formatDate(currentYear, currentMonth, day);
//     if (isStartDate(day)) return `Plan Started: ${dateStr}`;
//     if (isEndDate(day)) return `Plan Ends: ${dateStr}`;
//     if (isInBetweenRange(day) && !isWeekend(index)) return `Plan Ongoing: ${dateStr}`;
//     if (isWeekend(index)) return `Weekend Holiday: ${dateStr}`;
//     if (isHoliday(day)) {
//       const holidayName = holidays.find(h => h.date === dateStr)?.name || 'Holiday';
//       return `Holiday: ${holidayName} (${dateStr})`;
//     }
//     return `Selected Date: ${dateStr}`;
//   };

//   const handleDateSelect = (day: number) => {
//     const dateStr = formatDate(currentYear, currentMonth, day);
//     const holiday = holidays.find(h => h.date === dateStr);
//     setTooltipText(holiday ? `Holiday: ${holiday.name}` : `Selected Date: ${dateStr}`);
//     setSelectedDate(dateStr);
//     onDateChange?.(dateStr);
//   };

//   // --------------------
//   // Calendar Logic
//   // --------------------
//   const daysInMonth = getDaysInMonth(currentMonth, currentYear);
//   const firstDayIndex = getFirstDayOfMonth(currentMonth, currentYear);

//   const calendarDays: (string | number)[] = [];
//   for (let i = 0; i < firstDayIndex; i++) calendarDays.push('');
//   for (let day = 1; day <= daysInMonth; day++) calendarDays.push(day);

//   // --------------------
//   // Render
//   // --------------------
//   return (
//     <View style={styles.container}>
//       {/* Header */}
//       <View style={styles.header}>
//         <TouchableOpacity onPress={() => onMonthChange(currentMonth === 0 ? 11 : currentMonth - 1, currentMonth === 0 ? currentYear - 1 : currentYear)}>
//           <SvgXml xml={BackIcon} />
//         </TouchableOpacity>
//         <Text style={styles.headerText}>
//           {monthNames[currentMonth].toUpperCase()}, {currentYear}
//         </Text>
//         <TouchableOpacity onPress={() => onMonthChange(currentMonth === 11 ? 0 : currentMonth + 1, currentMonth === 11 ? currentYear + 1 : currentYear)}>
//           <SvgXml xml={BackIcon} style={{ transform: [{ rotate: '180deg' }] }} />
//         </TouchableOpacity>
//       </View>

//       {/* Week Days */}
//       <View style={styles.weekRow}>
//         {daysOfWeek.map((day, index) => (
//           <Text
//             key={index}
//             style={[styles.weekDay, (day === 'Sat' || day === 'Sun') && styles.weekendText]}>
//             {day}
//           </Text>
//         ))}
//       </View>

//       {/* Dates */}
//       <View style={styles.daysContainer}>
//         {calendarDays.map((day, index) => {
//           if (day === '') return <View key={index} style={styles.dayCell} />;

//           const dayNumber = day as number;
//           const dateStr = formatDate(currentYear, currentMonth, dayNumber);
//           const selected = selectedDate === dateStr;

//           return (
//             <TouchableOpacity
//               key={index}
//               style={styles.dayCell}
//               onPress={() => {
//                 if (!isPastDate(dayNumber) && isWithinRange(dayNumber)) {
//                   handleDateSelect(dayNumber);
//                 }
//               }}
//               onPressIn={() => {
//                 holdTimeout = setTimeout(() => {
//                   setTooltipText(getTooltipText(dayNumber, index));
//                   setTooltipVisible(true);
//                 }, 1000);
//               }}
//               onPressOut={() => {
//                 clearTimeout(holdTimeout);
//                 setTooltipVisible(false);
//               }}>
//               <LinearGradient
//                 colors={getGradientColors(dayNumber, index)}
//                 style={styles.dayCircle}>
//                 <Text
//                   style={[
//                     styles.dayText,
//                     selected && styles.selectedText,
//                     (isHoliday(dayNumber) || isWeekend(index)) && styles.holidayText,
//                   ]}>
//                   {dayNumber}
//                 </Text>
//               </LinearGradient>
//             </TouchableOpacity>
//           );
//         })}
//       </View>

//       {/* Tooltip */}
//       {tooltipVisible && (
//         <View style={styles.tooltip}>
//           <Text style={styles.tooltipText}>{tooltipText}</Text>
//         </View>
//       )}
//     </View>
//   );
// }

// // --------------------
// // Styles
// // --------------------
// const styles = StyleSheet.create({
//   container: {
//     padding: 16,
//     backgroundColor: Colors.white,
//     borderRadius: 20,
//     shadowColor: Colors.black,
//     shadowOffset: { width: 0, height: hp('0.2%') },
//     shadowOpacity: 0.1,
//     shadowRadius: wp('2%'),
//     elevation: 0.9,
//   },
//   header: {
//     flexDirection: 'row',
//     justifyContent: 'space-between',
//     alignItems: 'center',
//     marginBottom: 16,
//     padding: 10,
//   },
//   headerText: {
//     fontSize: 18,
//     color: Colors.primaryOrange,
//     fontFamily: Fonts.Urbanist.bold,
//   },
//   weekRow: { flexDirection: 'row' },
//   weekDay: {
//     flex: 1,
//     textAlign: 'center',
//     color: Colors.black,
//     paddingVertical: 10,
//     fontFamily: Fonts.Urbanist.bold,
//     textTransform: 'uppercase',
//   },
//   weekendText: { color: Colors.red },
//   daysContainer: { flexDirection: 'row', flexWrap: 'wrap' },
//   dayCell: {
//     width: `${100 / 7}%`,
//     alignItems: 'center',
//     justifyContent: 'center',
//     paddingVertical: 6,
//   },
//   dayCircle: {
//     width: '80%',
//     aspectRatio: 1,
//     borderRadius: 50,
//     justifyContent: 'center',
//     alignItems: 'center',
//   },
//   dayText: { fontSize: 16, color: Colors.black },
//   selectedText: { fontWeight: 'bold', color: Colors.green },
//   holidayText: { color: Colors.red, fontWeight: 'bold' },
//   tooltip: {
//     position: 'absolute',
//     top: hp('2%'),
//     left: wp('10%'),
//     right: wp('10%'),
//     backgroundColor: Colors.primaryOrange,
//     padding: 12,
//     borderRadius: 10,
//     alignItems: 'center',
//     zIndex: 9999,
//     elevation: 10,
//   },
//   tooltipText: {
//     color: Colors.white,
//     fontFamily: Fonts.Urbanist.bold,
//     fontSize: wp('4%'),
//   },
// });

// CLICAKABLE LOGIC V! 
// onPress={() => {
//   if (
//     !isPastDate(dayNumber, currentYear, currentMonth) &&
//     isWithinRange(
//       dayNumber,
//       startDate,
//       endDate,
//       currentYear,
//       currentMonth,
//     ) &&
//     !isBookedDate(dayNumber, currentYear, currentMonth, foodList)
//   ) {
//     handleDateSelect(dayNumber);
//   }
// }}



// VERSION @ 2

 // onPress={() => {
              //   const booked = isBookedDate(
              //     dayNumber,
              //     currentYear,
              //     currentMonth,
              //     foodList,
              //   );

              //   if (isPastDate(dayNumber, currentYear, currentMonth)) {
              //     showToast({
              //       type: 'warning',
              //       title: 'Invalid Selection',
              //       message: 'You cannot select a past date.',
              //     });
              //     return;
              //   }

              //   if (
              //     !isWithinRange(
              //       dayNumber,
              //       startDate,
              //       endDate,
              //       currentYear,
              //       currentMonth,
              //     )
              //   ) {
              //     showToast({
              //       type: 'info',
              //       title: 'Out of Plan',
              //       message: 'This date is not included in your plan.',
              //     });
              //     return;
              //   }

              //   if (booked && !booked.editable) {
              //     showToast({
              //       type: 'error',
              //       title: 'Locked',
              //       message: `Meal already booked and locked on ${booked.date}`,
              //     });
              //     return;
              //   }

              //   if (booked && booked.editable) {
              //     showToast({
              //       type: 'info',
              //       title: 'Edit Meal',
              //       message: `You can update booking for ${booked.date}`,
              //     });
              //     handleDateSelect(dayNumber);
              //     return;
              //   }

              //   // ✅ fresh selection
              //   handleDateSelect(dayNumber);
              //   showToast({
              //     type: 'success',
              //     title: 'Date Selected',
              //     message: `You have selected ${dayNumber}/${
              //       currentMonth + 1
              //     }/${currentYear}`,
              //   });
              // }}



              
// OLD VERSION INLINE ############# COLORS 
  // const getGradientColors = (day: number, index: number) => {
  //   if (isStartDate(day, startDate, currentYear, currentMonth))
  //     return [Colors.green, Colors.green];
  //   // if (isBookedDate(day, currentYear, currentMonth, foodList))
  //   //   return [Colors.greeFadd, Colors.greeFadd];

  //   const booked = isBookedDate(day, currentYear, currentMonth, foodList);
  //   if (booked) {
  //     return booked.editable
  //       ? [Colors.green, Colors.primaryOrange] //  booked but editable
  //       : [Colors.red, Colors.greeFadd]; //  booked & locked
  //   }

  //   if (isEndDate(day, endDate, currentYear, currentMonth))
  //     return [Colors.red, Colors.red];
  //   if (
  //     isInBetweenRange(
  //       day,
  //       startDate,
  //       endDate,
  //       currentYear,
  //       currentMonth,
  //       holidays,
  //     ) &&
  //     !isWeekend(index)
  //   )
  //     return [Colors.lightRed, Colors.lightRed];

  //   if (isHoliday(day, holidays, currentYear, currentMonth) || isWeekend(index))
  //     return [Colors.hoiday, Colors.hoiday];
  //   return ['transparent', 'transparent'];
  // };




//   OLD VERION  ###### tool tip 


  // const getTooltipText = (day: number, index: number) => {
  //   const dateStr = formatDate(currentYear, currentMonth, day);
  //   const booked = isBookedDate(day, currentYear, currentMonth, foodList);
  //   if (booked) {
  //     return booked.editable
  //       ? `Meal Booked (Editable): ${booked.childName}'s ${booked.meal} (${booked.date})`
  //       : `Meal Booked (Locked): ${booked.childName}'s ${booked.meal} (${booked.date})\nOrders must be placed at least 48 hours in advance.`;
  //   }
  //   if (isStartDate(day, startDate, currentYear, currentMonth))
  //     return `Plan Started: ${dateStr}`;
  //   if (isEndDate(day, endDate, currentYear, currentMonth))
  //     return `Plan Ends: ${dateStr}`;
  //   if (
  //     isInBetweenRange(
  //       day,
  //       startDate,
  //       endDate,
  //       currentYear,
  //       currentMonth,
  //       holidays,
  //     ) &&
  //     !isWeekend(index)
  //   )
  //     return `Plan Ongoing: ${dateStr}`;

  //   if (isWeekend(index)) return `Weekend Holiday: ${dateStr}`;
  //   if (isHoliday(day, holidays, currentYear, currentMonth)) {
  //     const holidayName =
  //       holidays.find(h => h.date === dateStr)?.name || 'Holiday';
  //     return `Holiday: ${holidayName} (${dateStr})`;
  //   }
  //   if (
  //     isInBetweenRange(
  //       day,
  //       startDate,
  //       endDate,
  //       currentYear,
  //       currentMonth,
  //       holidays,
  //     ) &&
  //     !isWeekend(index)
  //   ) {
  //     return `Available for Booking: ${dateStr}`;
  //   }
  //   return `This date is not part of your plan: ${dateStr}`;
  // };