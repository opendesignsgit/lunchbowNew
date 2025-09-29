import React, { useEffect, useState } from "react";
import dayjs from "dayjs";
import {
  Box,
  useMediaQuery,
  useTheme,
  Dialog,
  CircularProgress,
} from "@mui/material";
import LeftPanel from "./LeftPanel";
import CenterPanel from "./CenterPanel";
import RightPanel from "./RightPanel";
import MealPlanDialog from "./MealPlanDialog";
import useRegistration from "@hooks/useRegistration";
import AttributeServices from "../../services/AttributeServices";
import useAsync from "../../hooks/useAsync";
import isSameOrAfter from "dayjs/plugin/isSameOrAfter";
import isSameOrBefore from "dayjs/plugin/isSameOrBefore";
import { useSession } from "next-auth/react";
import dietitianMealPlanData from "../../jsonHelper/Dietitian_meal_plan.json";
import { set } from "local-storage";


dayjs.extend(isSameOrAfter);
dayjs.extend(isSameOrBefore);

const MenuCalendar = () => {
  const { data: session } = useSession();

  const today = dayjs();
  const theme = useTheme();
  const isSmall = useMediaQuery(theme.breakpoints.down("sm"));
  const {
    data,

    reload,
  } = useAsync(AttributeServices.getAllHolidays);
  const [currentMonth, setCurrentMonth] = useState(today.month());
  const [currentYear, setCurrentYear] = useState(today.year());
  const [selectedDate, setSelectedDate] = useState(today.date());
  const [menuSelections, setMenuSelections] = useState({});
  const [activeChild, setActiveChild] = useState(0);
  const [openDialog, setOpenDialog] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [mealPlanDialog, setMealPlanDialog] = useState({
    open: false,
    startDate: null,
  });
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  const [children, setChildren] = useState([]);
  const [menus, setMenus] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [subscriptionStart, setSubscriptionStart] = useState(dayjs());
  const [subscriptionEnd, setSubscriptionEnd] = useState(dayjs());
  const [menuData, setMenuData] = useState([]);
  const [useMealPlan, setUseMealPlan] = useState(false);
  const [selectedPlans, setSelectedPlans] = useState({});
  const [selectedMealPlanMeals, setSelectedMealPlanMeals] = useState([]);
  const [canPay, setCanPay] = useState(false);
  const [paidHolidays, setPaidHolidays] = useState([]);



  const _id = session?.user?.id;

  const { submitHandler, loading } = useRegistration();

  useEffect(() => {
    if (_id) {
      fetchPaidHolidays();
    }
  }, [_id]);


  const fetchPaidHolidays = async () => {
    try {
      const res = await submitHandler({
        _id: _id,
        path: "get-paid-holidays",
      });
      console.log("Paid holidays response:", res);

      if (res.success) {
        setPaidHolidays(res.data); // Set paid holidays state

      } else {
        console.error("Failed to fetch paid holidays:", res.message);
      }
    } catch (error) {
      console.error("Error fetching paid holidays:", error);
    }
  };
  console.log("Paid holidays:", paidHolidays);

  useEffect(() => {
    if (data && Array.isArray(data) && subscriptionStart && subscriptionEnd) {
      const apiHolidays = data
        .map((h) => ({
          date: dayjs(h.date).format("YYYY-MM-DD"),
          name: h.name,
        }))
        .filter(
          (h) =>
            dayjs(h.date).isSameOrAfter(subscriptionStart, "day") &&
            dayjs(h.date).isSameOrBefore(subscriptionEnd, "day")
        );
      setHolidays(apiHolidays);
    }
  }, [data, subscriptionStart, subscriptionEnd]);

  const fetchSavedMealPlans = async () => {
    try {
      const res = await submitHandler({
        _id: _id,
        path: "get-saved-meals",
      });

      if (res.success && res.data) {
        const { menuSelections, holidays } = res.data;

        // Update menu selections state
        setMenuSelections((prev) => ({
          ...prev,
          ...menuSelections,
        }));

        // Update holidays if needed
        setHolidays((prev) => [...prev, ...(holidays || [])]);

        if (!menuSelections || Object.keys(menuSelections).length === 0) {
          setCanPay(true);
        } else {
          setCanPay(false);
        }

        console.log("Saved meals loaded successfully");
      }
    } catch (error) {
      console.error("Error loading saved meals:", error);
      setCanPay(true);

    } finally {
      setInitialLoadComplete(true);
    }
  };

  const fetchInitialData = async () => {
    try {
      const res = await submitHandler({
        _id: _id,
        path: "get-Menu-Calendar",
      });

      if (res.success) {
        const childrenWithNames =
          res.data.children?.map((child, index) => ({
            id: `child-${index}`, // Create an ID if not provided
            name: `${child.firstName} ${child.lastName}`.trim(), // Combine first and last name
            ...child,
          })) || [];

        setChildren(childrenWithNames);
        setMenus([
          "Veg Biriyani",
          "Phulka + Chole",
          "Pav Bhaji",
          "5 Spice Fried Rice",
          "Veg Noodles",
          "Alfredo Pasta",
          "Mac and Cheese",
          "Aloo Paratha",
          "Hummus and Pita",
          "Creamy Curry Rice",
          "Ghee Rice and Dal",
        ]);

        setSubscriptionStart(dayjs(res.data.startDate));
        setSubscriptionEnd(dayjs(res.data.endDate));
        setCurrentMonth(dayjs(res.data.startDate).month());
        setCurrentYear(dayjs(res.data.startDate).year());
        setSelectedDate(dayjs(res.data.startDate).date());
      }
    } catch (error) {
      console.error("Error fetching data:", error);
    }
  };

  useEffect(() => {
    const fetchAllData = async () => {
      try {
        await fetchInitialData();

        await fetchSavedMealPlans();
      } catch (error) {
        console.error("Error in initial data loading:", error);
      }
    };

    fetchAllData();
  }, []);

  const handleMenuDataChange = (data) => {
    setMenuData(data);
  };

  // In MenuCalendar.js
  const getAllMenuData = () => {
    const allMenuData = [];

    let currentDate = dayjs(subscriptionStart);
    const endDate = dayjs(subscriptionEnd);

    while (currentDate.isBefore(endDate) || currentDate.isSame(endDate, "day")) {
      const dateKey = currentDate.format("YYYY-MM-DD");
      const day = currentDate.date();
      const month = currentDate.month();
      const year = currentDate.year();

      children.forEach((child) => {
        let childData = allMenuData.find((c) => c.childId === child.id);
        if (!childData) {
          childData = {
            childId: child.id,
            childName: child.name,
            meals: [],
          };
          allMenuData.push(childData);
        }

        const dish = menuSelections[dateKey]?.[child.id];

        if (!dish) return;

        const isHolidayDate = isHoliday(day, month, year);

        if (!isHolidayDate) {
          // ✅ Normal working day → allow saving
          childData.meals.push({
            mealDate: currentDate.toDate(),
            mealName: dish,
          });
        } else {
          // ✅ Holiday/weekend → only save if it’s in paidHolidays
          const isPaid = paidHolidays.some(
            (ph) =>
              ph.childId === child.id &&
              dayjs(ph.mealDate).isSame(currentDate, "day")
          );
          if (isPaid) {
            childData.meals.push({
              mealDate: currentDate.toDate(),
              mealName: dish,
            });
          }
        }
      });

      currentDate = currentDate.add(1, "day");
    }

    return allMenuData;
  };



  const handleMealPlanChange = (planId) => {
    // Assuming you want Meal Plan 1 meals or empty for now, add other plans if needed
    if (planId === 1) {
      setSelectedMealPlanMeals(dietitianMealPlanData.meal_plan.map(day => day.meal));
    } else {
      setSelectedMealPlanMeals([]);
    }
  };


  const saveSelectedMeals = async () => {
    const allMenuData = getAllMenuData();
    console.log("All menu data to save:----->", allMenuData);

    const payload = {
      userId: _id,
      children: allMenuData.map((child) => ({
        childId: child.childId,
        meals: child.meals,
      })),
    };
    console.log("Payload to save:----->", payload);

    try {
      const res = await submitHandler({
        _id: _id,
        path: "save-meals",
        data: payload,
      });

      if (res.success) {
        setCanPay(false);

        setMenuSelections((prev) => {
          const updatedSelections = { ...prev };

          let currentDate = dayjs(subscriptionStart);
          const endDate = dayjs(subscriptionEnd);

          while (currentDate.isBefore(endDate) || currentDate.isSame(endDate, "day")) {
            const day = currentDate.date();
            const month = currentDate.month();
            const year = currentDate.year();
            const dateKey = currentDate.format("YYYY-MM-DD");

            // Only clear if it's a holiday and NOT paid for this child
            if (isHoliday(day, month, year)) {
              // For each child, check payment
              for (const child of children) {
                const isPaid = paidHolidays.some(
                  (ph) =>
                    ph.childId === child.id &&
                    dayjs(ph.mealDate).isSame(currentDate, "day")
                );

                if (!isPaid) {
                  // If unpaid, clear the dish for this child on this holiday
                  if (updatedSelections[dateKey]?.[child.id]) {
                    updatedSelections[dateKey][child.id] = "";
                  }
                }
              }
            }

            currentDate = currentDate.add(1, "day");
          }
          return updatedSelections;
        });
        // Show success notification
      } else {
        console.error("Failed to save meals:", res.message);
        // Show error notification
      }
    } catch (error) {
      console.error("Error saving meals:", error);
      // Show error notification
    }
  };

  // 2. For normal save button, just call saveSelectedMeals
  const handleSave = async () => {
    await saveSelectedMeals();
  };

  const formatDate = (day) =>
    `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${String(
      day
    ).padStart(2, "0")}`;

  const isHoliday = (day, month = currentMonth, year = currentYear) => {
    // If month and year are the default values, we might have received only day
    if (month === currentMonth && year === currentYear) {
      const date = dayjs(formatDate(day));
      return (
        date.day() === 0 ||
        date.day() === 6 ||
        holidays.some((h) => h.date === date.format("YYYY-MM-DD"))
      );
    }

    // Normal case with all parameters
    const date = dayjs(`${year}-${month + 1}-${day}`);
    const isWeekend = date.day() === 0 || date.day() === 6;
    const dateString = date.format("YYYY-MM-DD");
    const isCustomHoliday = holidays.some((h) => h.date === dateString);
    return isWeekend || isCustomHoliday;
  };

  const handleMenuChange = (childId, dish) => {
    const dateKey = formatDate(selectedDate);
    setMenuSelections((prev) => ({
      ...prev,
      [dateKey]: {
        ...(prev[dateKey] || {}),
        [childId]: dish,
      },
    }));
    if (editMode) {
      setEditMode(false);
      if (isSmall) setOpenDialog(false);
    }
  };

  const getDayName = (day) => {
    const date = new Date(currentYear, currentMonth, day);
    return date.toLocaleDateString("en-US", { weekday: "long" });
  };

  const getCalendarGridDates = () => {
    const daysInMonth = dayjs(
      `${currentYear}-${currentMonth + 1}`
    ).daysInMonth();
    const startDay =
      (dayjs(`${currentYear}-${currentMonth + 1}-01`).day() + 6) % 7;

    const daysArray = [];
    for (let i = 0; i < startDay; i++) daysArray.push(null);
    for (let i = 1; i <= daysInMonth; i++) daysArray.push(i);
    return daysArray;
  };

  const applyMealPlan = (planId, childId) => {
    let selectedPlanMeals;

    if (planId === 1) {
      // Use dietitian meals to apply
      selectedPlanMeals = dietitianMealPlanData.meal_plan.map(day => day.meal);
    } else {
      // Fallback or another plan — example reverse of menus array
      selectedPlanMeals = [...menus].reverse();
    }

    const updates = {};
    const firstDayOfMonth = dayjs(`${currentYear}-${currentMonth + 1}-01`);
    const daysInMonth = firstDayOfMonth.daysInMonth();

    for (let day = 1; day <= daysInMonth; day++) {
      const currentDate = dayjs(`${currentYear}-${currentMonth + 1}-${String(day).padStart(2, "0")}`);
      if (!isHoliday(day, currentMonth, currentYear)) {
        const mealDate = currentDate.format("YYYY-MM-DD");
        const meal = selectedPlanMeals[(day - 1) % selectedPlanMeals.length];
        updates[mealDate] = {
          ...(menuSelections[mealDate] || {}),
          [childId]: meal,
        };
      }
    }

    setMenuSelections((prev) => ({
      ...prev,
      ...updates,
    }));
  };


  const calendarDates = getCalendarGridDates();

  const handleMonthChange = (direction) => {
    let newMonth = currentMonth + direction;
    let newYear = currentYear;

    if (newMonth < 0) {
      newMonth = 11;
      newYear--;
    } else if (newMonth > 11) {
      newMonth = 0;
      newYear++;
    }

    const newMonthStart = dayjs(`${newYear}-${newMonth + 1}-01`);
    const newMonthEnd = newMonthStart.endOf("month");

    if (
      newMonthEnd.isBefore(subscriptionStart) ||
      newMonthStart.isAfter(subscriptionEnd)
    ) {
      return;
    }

    setCurrentMonth(newMonth);
    setCurrentYear(newYear);

    setUseMealPlan(false);
    setSelectedPlans({});
  };

  const handleDateClick = (date) => {
    setSelectedDate(date);
    setEditMode(false);
    setUseMealPlan(false);
    if (isSmall) {
      setOpenDialog(true);
    }
  };

  const handleEditClick = (dateString) => {
    const [year, month, day] = dateString.split("-");
    setCurrentMonth(parseInt(month) - 1);
    setCurrentYear(parseInt(year));
    setSelectedDate(parseInt(day));
    setEditMode(true);
    setUseMealPlan(false);
    if (isSmall) {
      setOpenDialog(true);
    }
  };

  const handleDialogClose = () => {
    setOpenDialog(false);
    setEditMode(false);
  };

  const getSavedMenuDatesForChild = (childId) => {
    // menuSelections: { "YYYY-MM-DD": { childId: dish, ... }, ... }
    return Object.entries(menuSelections)
      .filter(([date, selections]) => selections[childId])
      .map(([date]) => date);
  };

  const savedMenuDates = getSavedMenuDatesForChild(children[activeChild]?.id);

  if (loading || !children.length) {
    return <CircularProgress />;
  }

  return (
    <Box
      className="MCMainPanel"
      display="flex"
      flexDirection={isSmall ? "column" : "row"}
      bgcolor="#fff"
      mx="auto"
      borderRadius={2}
      boxShadow={2}
      overflow="hidden"
    >
      {isSmall && (
        <CenterPanel
          isSmall={isSmall}
          currentMonth={currentMonth}
          currentYear={currentYear}
          handleMonthChange={handleMonthChange}
          calendarDates={calendarDates}
          selectedDate={selectedDate}
          setSelectedDate={handleDateClick}
          isHoliday={(day) => isHoliday(day, currentMonth, currentYear)}
          dummyHolidays={holidays}
          subscriptionStart={subscriptionStart}
          subscriptionEnd={subscriptionEnd}
          savedMenuDates={savedMenuDates}
        />
      )}

      {isSmall && (
        <LeftPanel
          isSmall={isSmall}
          currentYear={currentYear}
          currentMonth={currentMonth}
          activeChild={activeChild}
          setActiveChild={setActiveChild}
          dummyChildren={children}
          menuSelections={menuSelections}
          subscriptionStart={subscriptionStart}
          subscriptionEnd={subscriptionEnd}
          onEditClick={handleEditClick}
          onMenuDataChange={handleMenuDataChange}
          setUseMealPlan={setUseMealPlan}
          setSelectedPlans={setSelectedPlans}
        />
      )}

      {!isSmall && (
        <>
          <LeftPanel
            isSmall={isSmall}
            currentYear={currentYear}
            currentMonth={currentMonth}
            activeChild={activeChild}
            setActiveChild={setActiveChild}
            dummyChildren={children}
            menuSelections={menuSelections}
            subscriptionStart={subscriptionStart}
            subscriptionEnd={subscriptionEnd}
            onEditClick={handleEditClick}
            onMenuDataChange={handleMenuDataChange}
            sx={{ width: "29%" }}
            setUseMealPlan={setUseMealPlan}
            setSelectedPlans={setSelectedPlans}
          />

          <CenterPanel
            isSmall={isSmall}
            currentMonth={currentMonth}
            currentYear={currentYear}
            handleMonthChange={handleMonthChange}
            calendarDates={calendarDates}
            selectedDate={selectedDate}
            setSelectedDate={handleDateClick}
            isHoliday={(day) => isHoliday(day, currentMonth, currentYear)}
            dummyHolidays={holidays}
            subscriptionStart={subscriptionStart}
            subscriptionEnd={subscriptionEnd}
            sx={{ width: "44%" }}
            savedMenuDates={savedMenuDates}
          />

          <RightPanel
            isSmall={isSmall}
            selectedDate={selectedDate}
            getDayName={getDayName}
            isHoliday={isHoliday}
            dummyChildren={children}
            menuSelections={menuSelections}
            handleMenuChange={handleMenuChange}
            dummyMenus={menus}
            formatDate={formatDate}
            editMode={editMode}
            setEditMode={setEditMode}
            sx={{ width: "29%" }}
            applyMealPlan={applyMealPlan} // Pass the function
            setMealPlanDialog={setMealPlanDialog}
            activeChild={activeChild} // Add this
            setActiveChild={setActiveChild}
            onSave={handleSave}
            saveSelectedMeals={saveSelectedMeals}
            onMealPlanChange={handleMealPlanChange}
            useMealPlan={useMealPlan}
            setUseMealPlan={setUseMealPlan}
            selectedPlans={selectedPlans}
            setSelectedPlans={setSelectedPlans}
            canPay = {canPay}
            subscriptionStart={subscriptionStart}
            subscriptionEnd={subscriptionEnd}
          />
        </>
      )}

      <Dialog
        open={openDialog}
        onClose={handleDialogClose}
        fullWidth
        maxWidth="sm"
        className="popmenuselt"
      >
        <RightPanel
          isSmall={isSmall}
          selectedDate={selectedDate}
          getDayName={getDayName}
          isHoliday={isHoliday}
          dummyChildren={children}
          menuSelections={menuSelections}
          handleMenuChange={handleMenuChange}
          dummyMenus={menus}
          formatDate={formatDate}
          onClose={handleDialogClose}
          editMode={editMode}
          setEditMode={setEditMode}
          applyMealPlan={applyMealPlan} // Pass the function
          setMealPlanDialog={setMealPlanDialog}
          activeChild={activeChild} // Add this
          setActiveChild={setActiveChild}
          onSave={handleSave}
          saveSelectedMeals={saveSelectedMeals}
          onMealPlanChange={handleMealPlanChange}
          useMealPlan={useMealPlan}
          setUseMealPlan={setUseMealPlan}
          selectedPlans={selectedPlans}
          setSelectedPlans={setSelectedPlans}
          canPay={canPay}
          subscriptionStart={subscriptionStart}
          subscriptionEnd={subscriptionEnd}

          goToPrevDate={() => {
            let prev = dayjs(`${currentYear}-${currentMonth + 1}-${selectedDate}`).subtract(1, "day");

            // ⛔ skip Sundays
            while (prev.day() === 0) {
              prev = prev.subtract(1, "day");
            }

            if (prev.isBefore(subscriptionStart, "day")) return;
            setCurrentMonth(prev.month());
            setCurrentYear(prev.year());
            setSelectedDate(prev.date());
          }}

          goToNextDate={() => {
            let next = dayjs(`${currentYear}-${currentMonth + 1}-${selectedDate}`).add(1, "day");

            // ⛔ skip Sundays
            while (next.day() === 0) {
              next = next.add(1, "day");
            }

            if (next.isAfter(subscriptionEnd, "day")) return;
            setCurrentMonth(next.month());
            setCurrentYear(next.year());
            setSelectedDate(next.date());
          }}
        />
      </Dialog>

      <MealPlanDialog
        open={mealPlanDialog.open}
        onClose={() => setMealPlanDialog({ ...mealPlanDialog, open: false })}
        startDate={mealPlanDialog.startDate}
        planId={mealPlanDialog.plan} // Pass the selected plan ID
      />
    </Box>
  );
};

export default MenuCalendar;
