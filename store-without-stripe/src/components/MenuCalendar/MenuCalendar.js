import React, { useEffect, useState, useCallback } from "react";
import dayjs from "dayjs";
import {
  Box,
  useMediaQuery,
  useTheme,
  Dialog,
  CircularProgress,
  Tabs,
  Tab
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

dayjs.extend(isSameOrAfter);
dayjs.extend(isSameOrBefore);

const MenuCalendar = () => {
  const { data: session } = useSession();

  const today = dayjs();
  const theme = useTheme();
  const isSmall = useMediaQuery(theme.breakpoints.down("sm"));
  const { data, reload } = useAsync(AttributeServices.getAllHolidays);

  // Multi-plan support
  const [subscriptionPlans, setSubscriptionPlans] = useState([]);
  const [selectedPlanIndex, setSelectedPlanIndex] = useState(0);

  // Plan-dependent state
  const [children, setChildren] = useState([]);
  const [subscriptionStart, setSubscriptionStart] = useState(dayjs());
  const [subscriptionEnd, setSubscriptionEnd] = useState(dayjs());

  // Calendar state
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
  const [menus, setMenus] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [menuData, setMenuData] = useState([]);
  const [useMealPlan, setUseMealPlan] = useState(false);
  const [selectedPlans, setSelectedPlans] = useState({});
  const [selectedMealPlanMeals, setSelectedMealPlanMeals] = useState([]);
  const [canPay, setCanPay] = useState(false);
  const [paidHolidays, setPaidHolidays] = useState([]);
  const [blockedMenus, setBlockedMenus] = useState([]);

  const _id = session?.user?.id;
  const { submitHandler, loading } = useRegistration();

  useEffect(() => {
    if (_id) fetchPaidHolidays();
  }, [_id]);

  const fetchPaidHolidays = async () => {
    try {
      const res = await submitHandler({
        _id: _id,
        path: "get-paid-holidays",
      });
      if (res.success) setPaidHolidays(res.data);
      else console.error("Failed to fetch paid holidays:", res.message);
    } catch (error) {
      console.error("Error fetching paid holidays:", error);
    }
  };

  const fetchDeletedMenus = async () => {
    try {
      const res = await submitHandler({
        _id: _id,
        path: "get-deleted-meals",
      });
      if (res.success && Array.isArray(res.data)) {
        setBlockedMenus(res.data);
      }
    } catch (err) {
      console.error("Failed to fetch deleted menus", err);
    }
  };

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
    const currentPlanId = subscriptionPlans[selectedPlanIndex]?.id;

    try {
      const res = await submitHandler({
        _id,
        path: "get-saved-meals",
        planId: currentPlanId,
      });

      if (res.success && res.data) {
        const savedMealsForCurrentPlan = res.data[currentPlanId] || {};
        setMenuSelections(savedMealsForCurrentPlan);
        setCanPay(
          !savedMealsForCurrentPlan ||
          Object.keys(savedMealsForCurrentPlan).length === 0
        );
      }
    } catch (error) {
      console.error("Error loading saved meals:", error);
      setCanPay(true);
    } finally {
      setInitialLoadComplete(true);
    }
  };

  useEffect(() => {
    if (!_id) return;
    fetchSavedMealPlans();
  }, [selectedPlanIndex, subscriptionPlans, _id]);

  const fetchInitialData = async () => {
    try {
      const res = await submitHandler({
        _id: _id,
        path: "get-Menu-Calendar",
      });
      if (res.success && Array.isArray(res.data.plans)) {
        setSubscriptionPlans(res.data.plans);
        console.log("Fetched subscription plans:", res.data.plans);
        const activeIndex = res.data.plans.findIndex((p) => p.status === "active");
        setSelectedPlanIndex(activeIndex !== -1 ? activeIndex : 0);
      }
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
    } catch (error) {
      console.error("Error fetching data:", error);
    }
  };

  useEffect(() => {
    if (!_id) return;
    const fetchAllData = async () => {
      try {
        await fetchInitialData();
      } catch (error) {
        console.error("Error in initial data loading:", error);
      }
    };
    fetchAllData();
  }, [_id]);

  useEffect(() => {
    if (!subscriptionPlans.length) return;
    const plan = subscriptionPlans[selectedPlanIndex];
    if (!plan) return;
    setChildren((plan.children || []).map((child, idx) => ({
      ...child,
      id: child.id || `child-${idx}`,
      name: `${child.firstName || ""} ${child.lastName || ""}`.trim(),
    })));
    setSubscriptionStart(dayjs(plan.startDate));
    setSubscriptionEnd(dayjs(plan.endDate));
    setCurrentMonth(dayjs(plan.startDate).month());
    setCurrentYear(dayjs(plan.startDate).year());
    setSelectedDate(dayjs(plan.startDate).date());

    // Fetch deleted meals and saved meals when plan changes
    fetchDeletedMenus();
    fetchSavedMealPlans();
  }, [selectedPlanIndex, subscriptionPlans]);

  const handleMenuDataChange = (data) => {
    setMenuData(data);
  };

  // ✅ MEMOIZED: formatDate
  const formatDate = useCallback((day) =>
    `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${String(
      day
    ).padStart(2, "0")}`,
    [currentYear, currentMonth]
  );

  // ✅ MEMOIZED: getDayName
  const getDayName = useCallback((day) => {
    const date = new Date(currentYear, currentMonth, day);
    return date.toLocaleDateString("en-US", { weekday: "long" });
  }, [currentYear, currentMonth]);

  // ✅ MEMOIZED: isHoliday
  const isHoliday = useCallback((day, month = currentMonth, year = currentYear) => {
    if (month === currentMonth && year === currentYear) {
      const date = dayjs(formatDate(day));
      return (
        date.day() === 0 ||
        date.day() === 6 ||
        holidays.some((h) => h.date === date.format("YYYY-MM-DD"))
      );
    }

    const date = dayjs(`${year}-${month + 1}-${day}`);
    const isWeekend = date.day() === 0 || date.day() === 6;
    const dateString = date.format("YYYY-MM-DD");
    const isCustomHoliday = holidays.some((h) => h.date === dateString);
    return isWeekend || isCustomHoliday;
  }, [formatDate, currentMonth, currentYear, holidays]);

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
          childData.meals.push({
            mealDate: currentDate.toDate(),
            mealName: dish,
          });
        } else {
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
    if (planId === 1) {
      setSelectedMealPlanMeals(dietitianMealPlanData.meal_plan.map(day => day.meal));
    } else {
      setSelectedMealPlanMeals([]);
    }
  };

  const saveSelectedMeals = async () => {
    const allMenuData = getAllMenuData();
    const currentPlanId = subscriptionPlans[selectedPlanIndex]?.id;

    const payload = {
      userId: _id,
      planId: currentPlanId,
      children: allMenuData.map((child) => ({
        childId: child.childId,
        meals: child.meals,
      })),
    };

    try {
      const res = await submitHandler({
        _id,
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

            if (isHoliday(day, month, year)) {
              for (const child of children) {
                const isPaid = paidHolidays.some(
                  (ph) =>
                    ph.childId === child.id &&
                    dayjs(ph.mealDate).isSame(currentDate, "day")
                );

                if (!isPaid) {
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
      } else {
        console.error("Failed to save meals:", res.message);
      }
    } catch (error) {
      console.error("Error saving meals:", error);
    }
  };

  const handleSave = async () => {
    await saveSelectedMeals();
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
      selectedPlanMeals = dietitianMealPlanData.meal_plan.map((day) => day.meal);
    } else {
      selectedPlanMeals = [...menus].reverse();
    }

    const updates = {};
    const firstDayOfMonth = dayjs(`${currentYear}-${currentMonth + 1}-01`);
    const daysInMonth = firstDayOfMonth.daysInMonth();
    const now = dayjs();

    for (let day = 1; day <= daysInMonth; day++) {
      const currentDate = dayjs(
        `${currentYear}-${currentMonth + 1}-${String(day).padStart(2, "0")}`
      );

      if (
        currentDate.isBefore(subscriptionStart, "day") ||
        currentDate.isAfter(subscriptionEnd, "day")
      ) {
        continue;
      }

      if (isHoliday(day, currentMonth, currentYear)) {
        continue;
      }

      const hoursDiff = currentDate.diff(now, "hour");
      if (hoursDiff < 48) {
        console.log(`Skipping locked date ${currentDate.format("YYYY-MM-DD")} (within 48 hrs)`);
        continue;
      }

      const mealDate = currentDate.format("YYYY-MM-DD");
      const meal = selectedPlanMeals[(day - 1) % selectedPlanMeals.length];

      updates[mealDate] = {
        ...(menuSelections[mealDate] || {}),
        [childId]: meal,
      };
    }

    setMenuSelections((prev) => ({
      ...prev,
      ...updates,
    }));

    const unlockedDays = Object.keys(updates).length;
    if (unlockedDays === 0) {
      alert("All days are locked within 48 hours. No meals were applied.");
    }
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
    return Object.entries(menuSelections)
      .filter(([date, selections]) => selections[childId])
      .map(([date]) => date);
  };

  const savedMenuDates = getSavedMenuDatesForChild(children[activeChild]?.id);

  if (loading || !children.length) {
    return <CircularProgress />;
  }

  return (
    <>
      <Tabs
        value={selectedPlanIndex}
        onChange={(e, val) => setSelectedPlanIndex(val)}
        variant="scrollable"
        scrollButtons="auto"
        className="menucalnmaintab"
      >
        {subscriptionPlans.map((plan, i) => (
          <Tab
            key={i}
            label={`${dayjs(plan.startDate).format("DD MMM")} - ${dayjs(plan.endDate).format("DD MMM")} (${plan.status})`}
          />
        ))}
      </Tabs>
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
            isHoliday={isHoliday}
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
              isHoliday={isHoliday}
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
              currentMonth={currentMonth}
              currentYear={currentYear}
              editMode={editMode}
              setEditMode={setEditMode}
              sx={{ width: "29%" }}
              applyMealPlan={applyMealPlan}
              setMealPlanDialog={setMealPlanDialog}
              activeChild={activeChild}
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
              subscriptionPlans={subscriptionPlans}
              selectedPlanIndex={selectedPlanIndex}
              blockedMenus={blockedMenus}
              userId={_id}
              submitHandler={submitHandler}
              fetchDeletedMenus={fetchDeletedMenus}
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
            currentMonth={currentMonth}
            currentYear={currentYear}
            onClose={handleDialogClose}
            editMode={editMode}
            setEditMode={setEditMode}
            applyMealPlan={applyMealPlan}
            setMealPlanDialog={setMealPlanDialog}
            activeChild={activeChild}
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
            subscriptionPlans={subscriptionPlans}
            selectedPlanIndex={selectedPlanIndex}
            blockedMenus={blockedMenus}
            userId={_id}
            submitHandler={submitHandler}
            fetchDeletedMenus={fetchDeletedMenus}
            goToPrevDate={() => {
              let prev = dayjs(`${currentYear}-${currentMonth + 1}-${selectedDate}`).subtract(1, "day");

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
          planId={mealPlanDialog.plan}
        />
      </Box>
    </>
  );
};

export default MenuCalendar;
