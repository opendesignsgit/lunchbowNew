import React, { useEffect } from "react";
import { Box, Typography, IconButton } from "@mui/material";
import { ChevronLeft, ChevronRight } from "@mui/icons-material";
import dayjs from "dayjs";

const LeftPanel = ({
  isSmall,
  currentYear,
  currentMonth,
  activeChild,
  setActiveChild,
  dummyChildren,
  menuSelections,
  subscriptionStart,
  subscriptionEnd,
  onEditClick,
  sx,
  onMenuDataChange,
  selectedMealPlanMeals = [], // New prop for showing meal plan meals
  setUseMealPlan,
  setSelectedPlans,
}) => {
  const formatDate = (day) =>
    `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${String(
      day
    ).padStart(2, "0")}`;

  const currentChild = dummyChildren?.[activeChild];

  // Log child name and menu list whenever active child or menu selections change
  useEffect(() => {
    if (!currentChild || !menuSelections) return;

    const menuData = {};

    const firstDayOfMonth = dayjs(`${currentYear}-${currentMonth + 1}-01`);

    const effectiveStartDate =
      subscriptionStart && subscriptionStart.isAfter(firstDayOfMonth)
        ? subscriptionStart
        : firstDayOfMonth;

    const daysInMonth = firstDayOfMonth.daysInMonth();

    for (let day = 1; day <= daysInMonth; day++) {
      const currentDate = dayjs(formatDate(day));
      if (
        currentDate.isAfter(effectiveStartDate) ||
        currentDate.isSame(effectiveStartDate)
      ) {
        const dateKey = formatDate(day);
        const dish = menuSelections[dateKey]?.[currentChild.id];
        if (dish) {
          if (!menuData[currentChild.id]) {
            menuData[currentChild.id] = {
              childId: currentChild.id,
              childName: currentChild.name,
              meals: [],
            };
          }
          menuData[currentChild.id].meals.push({
            mealDate: currentDate.toDate(),
            mealName: dish,
          });
        }
      }
    }

    if (onMenuDataChange) {
      onMenuDataChange(Object.values(menuData));
    }
  }, [
    activeChild,
    menuSelections,
    currentChild,
    currentYear,
    currentMonth,
    subscriptionStart,
  ]);

  if (!dummyChildren || dummyChildren.length === 0 || !currentChild) {
    return <Box p={2}>No child data available.</Box>;
  }

  const firstDayOfMonth = dayjs(`${currentYear}-${currentMonth + 1}-01`).startOf("day");

  const effectiveStartDate =
    subscriptionStart && subscriptionStart.startOf("day").isAfter(firstDayOfMonth)
      ? subscriptionStart.startOf("day")
      : firstDayOfMonth;

  const daysInMonth = firstDayOfMonth.daysInMonth();
  const daysArray = [];

  for (let day = 1; day <= daysInMonth; day++) {
    const currentDate = dayjs(formatDate(day)).startOf("day");
    if (currentDate.isSameOrAfter(effectiveStartDate)) {
      daysArray.push(day);
    }
  }

  return (
    <Box
      className="MCLeftPanel"
      sx={{
        width: isSmall ? "100%" : "30%",
        borderRight: isSmall ? "none" : "1px solid #ddd",
        borderBottom: isSmall ? "1px solid #ddd" : "none",
        maxHeight: isSmall ? "none" : "600px",
        overflow: "auto",
        ...sx,
      }}
    >
      <Typography className="titles">
        {dayjs(`${currentYear}-${currentMonth + 1}`)
          .format("MMMM")
          .toUpperCase()}{" "}
        MENU LIST
      </Typography>

      <Box
        display="flex"
        justifyContent="space-between"
        alignItems="center"
        className="childslidebox"
      >
        <IconButton
          onClick={() =>
            setActiveChild(
              (activeChild - 1 + dummyChildren.length) % dummyChildren.length
            )
          }
        >
          <ChevronLeft />
        </IconButton>

        {currentChild.name?.toUpperCase() || "UNKNOWN"}

        <IconButton onClick={() => setActiveChild((activeChild + 1) % dummyChildren.length)}>
          <ChevronRight />
        </IconButton>
      </Box>

      {/* New: Render selected meal plan meals */}
      {selectedMealPlanMeals.length > 0 && (
        <Box sx={{ mb: 2, p: 1 }}>
          <Typography variant="subtitle1" gutterBottom>
            Selected Meal Plan Meals
          </Typography>
          {selectedMealPlanMeals.map((meal, idx) => (
            <Typography key={idx} variant="body2" noWrap>
              {meal}
            </Typography>
          ))}
        </Box>
      )}

      <div className="FLtable">
        <Box display="flex" justifyContent="space-between" className="dataListbox">
          <Typography fontSize="14px" fontWeight="bold">
            DATE
          </Typography>
          <Typography fontSize="14px" fontWeight="bold">
            FOOD LIST
          </Typography>
        </Box>

        <div className="FLbody">
          {daysArray.map((day) => {
            const dateKey = formatDate(day);
            const dish = menuSelections[dateKey]?.[currentChild.id];
            const isOutOfRange =
              dayjs(dateKey).isBefore(subscriptionStart.subtract(1, "day")) ||
              dayjs(dateKey).isAfter(subscriptionEnd);
            const isWithin48Hours = dayjs(dateKey).diff(dayjs(), "hour") < 24;

            if (!dish) return null;

            return (
              <Box
                className="flitems"
                key={day}
                display="flex"
                justifyContent="space-between"
                alignItems="center"
                py={0.5}
                borderBottom="1px solid #eee"
                color={isOutOfRange ? "#bbb" : "inherit"}
              >
                <Typography variant="body2">{dateKey}</Typography>
                <Box display="flex" alignItems="center" maxWidth="140px">
                  <Typography variant="body2" noWrap>
                    {dish}
                  </Typography>
                  {!isOutOfRange && !isWithin48Hours && (
                    <IconButton
                      className="editbtn"
                      size="small"
                      onClick={() => {
                        // Reset the checkbox and radio button
                        if (typeof setUseMealPlan === "function") setUseMealPlan(false);
                        if (typeof setSelectedPlans === "function") setSelectedPlans({});
                        onEditClick(dateKey); // Existing logic
                      }}
                      sx={{ color: "#f97316", ml: 0.5, p: 0 }}
                      disabled={isWithin48Hours}
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 16 16"
                        fill="none"
                      >
                        <g clipPath="url(#clip0_1237_7420)">
                          <path
                            d="M7.33398 2.66699H2.66732C2.3137 2.66699 1.97456 2.80747 1.72451 3.05752C1.47446 3.30756 1.33398 3.6467 1.33398 4.00033V13.3337C1.33398 13.6873 1.47446 14.0264 1.72451 14.2765C1.97456 14.5265 2.3137 14.667 2.66732 14.667H12.0007C12.3543 14.667 12.6934 14.5265 12.9435 14.2765C13.1935 14.0264 13.334 13.6873 13.334 13.3337V8.66699"
                            stroke="#FF6514"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          <path
                            d="M12.334 1.66714C12.5992 1.40193 12.9589 1.25293 13.334 1.25293C13.7091 1.25293 14.0688 1.40193 14.334 1.66714C14.5992 1.93236 14.7482 2.29207 14.7482 2.66714C14.7482 3.04222 14.5992 3.40193 14.334 3.66714L8.00065 10.0005L5.33398 10.6671L6.00065 8.00048L12.334 1.66714Z"
                            stroke="#FF6514"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </g>
                        <defs>
                          <clipPath id="clip0_1237_7420">
                            <rect width="16" height="16" fill="white" />
                          </clipPath>
                        </defs>
                      </svg>
                    </IconButton>
                  )}
                  {isWithin48Hours && !isOutOfRange && (
                    <Typography
                      variant="caption"
                      color="textSecondary"
                      sx={{ ml: 1 }}
                    >
                      Locked
                    </Typography>
                  )}
                </Box>
              </Box>
            );
          })}
        </div>
      </div>
    </Box>
  );
};

export default LeftPanel;
