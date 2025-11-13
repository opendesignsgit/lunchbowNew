import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Box,
  Typography,
  Select,
  MenuItem,
  Button,
  Checkbox,
  FormControlLabel,
  IconButton,
  Radio,
  RadioGroup,
  FormControl,
  Link,
  Snackbar,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from "@mui/material";
import { ChevronLeft, ChevronRight, Close, Delete as DeleteIcon } from "@mui/icons-material";
import dayjs from "dayjs";
import MealPlanDialog from "./MealPlanDialog";
import HolidayPayment from "./HolidayPayment";
import mealPlanData from "../../jsonHelper/meal_plan.json";
import dietitianMealPlanData from "../../jsonHelper/Dietitian_meal_plan.json";
import { useSession } from "next-auth/react";

const mealPlanArray = mealPlanData.meal_plan;
const dietitianMealPlanArray = dietitianMealPlanData.meal_plan;

const RightPanel = ({
  isSmall,
  selectedDate,
  getDayName,
  isHoliday,
  dummyChildren,
  menuSelections,
  handleMenuChange,
  formatDate,
  onClose,
  editMode,
  setEditMode,
  sx,
  setMealPlanDialog,
  applyMealPlan,
  activeChild,
  setActiveChild,
  onSave,
  saveSelectedMeals,
  onMealPlanChange,
  useMealPlan,
  setUseMealPlan,
  selectedPlans,
  setSelectedPlans,
  canPay,
  subscriptionStart,
  subscriptionEnd,
  goToPrevDate,
  goToNextDate,
  subscriptionPlans,
  selectedPlanIndex,
  blockedMenus,
  userId,
  submitHandler,
  fetchDeletedMenus,
  currentMonth,
  currentYear,
}) => {
  const { data: session } = useSession();

  const [applyToAll, setApplyToAll] = useState(false);
  const [dialogOpen1, setDialogOpen1] = useState(false);
  const [holidayPaymentOpen, setHolidayPaymentOpen] = useState(false);
  const [holidayPaymentData, setHolidayPaymentData] = useState([]);
  const [paidHolidayMeals, setPaidHolidayMeals] = useState([]);
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [showSaveWarning, setShowSaveWarning] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState("");

  // ✅ FIX: Use useRef to track if already fetched
  const hasFetchedRef = useRef({});

  // Create local formatDate function
  const localFormatDate = (day) =>
    `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${String(
      day
    ).padStart(2, "0")}`;

  const dateFormatter = formatDate || localFormatDate;

  // Use useMemo to safely compute memoized values
  const selectedDateObj = useMemo(() =>
    dayjs(dateFormatter(selectedDate)),
    [selectedDate, dateFormatter]
  );

  const isSelectedHoliday = useMemo(() =>
    !!isHoliday(selectedDate),
    [selectedDate, isHoliday]
  );

  const isWithin48Hours = useMemo(() =>
    selectedDateObj.diff(dayjs(), "hour") < 48,
    [selectedDateObj]
  );

  const isSunday = useMemo(() =>
    selectedDateObj.day() === 0,
    [selectedDateObj]
  );

  const isSaturday = useMemo(() =>
    selectedDateObj.day() === 6,
    [selectedDateObj]
  );

  // ✅ FIXED: Only fetch once per date with useRef
  useEffect(() => {
    if (!session?.user?.id) return;

    const dateKey = dateFormatter(selectedDate);

    // Check if already fetched this date
    if (hasFetchedRef.current[dateKey]) return;

    const fetchPaidMeals = async () => {
      try {
        const res = await submitHandler({
          path: "get-holiday-payments",
          data: { date: dateKey, userId: session.user.id }
        });
        if (res?.success !== false) {
          setPaidHolidayMeals(res || []);
          localStorage.setItem("paidHolidayMeal", JSON.stringify(res || []));
        } else {
          setPaidHolidayMeals([]);
        }

        // Mark as fetched
        hasFetchedRef.current[dateKey] = true;
      } catch (err) {
        console.error("Error fetching paid holiday data:", err);
        setPaidHolidayMeals([]);
      }
    };

    fetchPaidMeals();
    // ✅ Removed submitHandler from dependencies to prevent infinite loop
  }, [selectedDate, dateFormatter, session?.user?.id]);

  const getDayMenu = (selectedDate) => {
    if (!mealPlanArray || mealPlanArray.length === 0) return [];
    const menuIndex = (selectedDate - 1) % mealPlanArray.length;
    return mealPlanArray[menuIndex]?.meals || [];
  };

  const mealPlans = [
    {
      id: 1,
      name: "Meal Plan ",
      meals: dietitianMealPlanArray.map((day) => day.meal),
    },
  ];

  const checkAllWorkingDaysFilled = () => {
    let currentDate = dayjs(subscriptionStart);
    const endDate = dayjs(subscriptionEnd);

    while (currentDate.isSameOrBefore(endDate, "day")) {
      const day = currentDate.date();
      const month = currentDate.month();
      const year = currentDate.year();
      const dateKey = currentDate.format("YYYY-MM-DD");

      if (!isHoliday(day, month, year)) {
        for (const child of dummyChildren) {
          const meal = menuSelections[dateKey]?.[child.id];
          if (!meal) {
            return false;
          }
        }
      }
      currentDate = currentDate.add(1, "day");
    }
    return true;
  };

  const handlePlanChange = (childId, planId) => {
    if (!dateFormatter) return;
    const dateObj = dayjs(dateFormatter(selectedDate));

    if (isWithin48Hours) return;

    if (
      dateObj.isBefore(dayjs(subscriptionStart), "day") ||
      dateObj.isAfter(dayjs(subscriptionEnd), "day")
    ) {
      return;
    }

    setSelectedPlans((prev) => ({ ...prev, [childId]: planId }));

    const childIndex = dummyChildren.findIndex((child) => child.id === childId);
    if (childIndex !== -1) setActiveChild(childIndex);

    if (applyMealPlan) {
      applyMealPlan(planId, childId, subscriptionStart, subscriptionEnd);
    }

    if (typeof onMealPlanChange === "function") {
      onMealPlanChange(planId);
    }
  };

  const handleApplyToAllChange = (e) => {
    if (isWithin48Hours) return;
    const { checked } = e.target;
    setApplyToAll(checked);
    if (checked && dummyChildren.length > 1) {
      const firstChildId = dummyChildren[0].id;
      const firstChildSelection =
        menuSelections[dateFormatter(selectedDate)]?.[firstChildId];
      dummyChildren.slice(1).forEach((child) => {
        handleMenuChange(child.id, firstChildSelection || "");
      });
    }
  };

  const handleFirstChildMenuChange = (childId, value) => {
    if (isWithin48Hours) return;
    handleMenuChange(childId, value);
    if (applyToAll && dummyChildren.length > 1) {
      dummyChildren.slice(1).forEach((child) => {
        handleMenuChange(child.id, value);
      });
    }
  };

  const handleMenuSelectionChange = (childId, value) => {
    if (isWithin48Hours) return;
    handleMenuChange(childId, value);
  };

  const isChildPaid = (childId) => {
    return paidHolidayMeals.some(
      (p) => p.childId === childId && p.mealDate === dateFormatter(selectedDate)
    );
  };

  const isChildDateBlocked = (childId, formattedDate) => {
    return blockedMenus?.some(
      (bm) => bm.childId === childId && bm.date === formattedDate
    );
  };

  const handleDeleteClick = (child, date, dish) => {
    setDeleteTarget({ child, date, dish });
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    const { child, date, dish } = deleteTarget;

    const currentSub = subscriptionPlans?.[selectedPlanIndex];
    if (!currentSub) {
      setSnackbarMessage("❌ Subscription data not available. Please refresh.");
      setSnackbarOpen(true);
      setDeleteDialogOpen(false);
      setDeleteTarget(null);
      return;
    }

    try {
      await submitHandler({
        path: "delete-child-menu",
        data: {
          userId,
          childId: child.id,
          childName: child.name,
          date,
          menu: dish,
          subscriptionId: currentSub._id,
          planId: currentSub.planId
        },
      });

      handleMenuChange(child.id, "");

      if (fetchDeletedMenus) {
        try {
          await fetchDeletedMenus();
        } catch (err) {
          console.error("Error refreshing deleted menus:", err);
        }
      }

      setSnackbarMessage("✅ Meal deleted successfully and added to your wallet!");
      setSnackbarOpen(true);
    } catch (err) {
      console.error("Failed to delete menu:", err);
      setSnackbarMessage("❌ Failed to delete meal. Please try again.");
      setSnackbarOpen(true);
    }
    setDeleteDialogOpen(false);
    setDeleteTarget(null);
  };

  const childrenWithSelectedMeals = dummyChildren.filter((child) => {
    const meal = menuSelections[dateFormatter(selectedDate)]?.[child.id];
    return meal && meal !== "";
  });

  const allPaid =
    childrenWithSelectedMeals.length > 0 &&
    childrenWithSelectedMeals.every((child) => isChildPaid(child.id));

  const handleSaveClick = () => {
    const dateKey = dateFormatter(selectedDate);
    const allMenusEmpty = dummyChildren.every(
      (child) =>
        !menuSelections[dateKey] ||
        !menuSelections[dateKey][child.id] ||
        menuSelections[dateKey][child.id] === ""
    );

    if (allMenusEmpty) {
      alert("Please select at least one menu to save");
      return;
    }

    const allWorkingDaysFilled = checkAllWorkingDaysFilled();

    if (typeof saveSelectedMeals === "function") {
      saveSelectedMeals();
      setSnackbarMessage(
        allWorkingDaysFilled
          ? "✅ You have successfully selected ALL meals! Thanks for joining Lunch Bowl. Now sit back, relax — we've got lunchtime covered!"
          : "✅ Meals saved successfully! Don't forget to select meals for all working days."
      );
      setSnackbarOpen(true);
    }
  };

  const handleSnackbarClose = (event, reason) => {
    if (reason === "clickaway") return;
    setSnackbarOpen(false);
  };

  return (
    <Box
      className="MCRightPanel"
      sx={{
        width: isSmall ? "100%" : "25%",
        bgcolor: "#f97316",
        color: "#fff",
        display: "flex",
        flexDirection: "column",
        ...sx,
      }}
    >
      {isSmall && (
        <Box display="flex" justifyContent="flex-end">
          <IconButton onClick={onClose} sx={{ color: "#fff" }}>
            <Close />
          </IconButton>
        </Box>
      )}

      {!(isSelectedHoliday || isSaturday || isSunday) && (
        <div className="fixcheckboxs">
          <FormControlLabel
            control={
              <Checkbox
                id="meal-plan-checkbox"
                name="mealplan-toggle"
                checked={useMealPlan}
                onChange={(e) => !isWithin48Hours && setUseMealPlan(e.target.checked)}
                sx={{ color: "#fff" }}
                disabled={isWithin48Hours}
              />
            }
            label={
              <Typography fontSize="0.8rem" color="#fff">
                Meal Plan Approved by Dietitian
              </Typography>
            }
            sx={{ mb: 1, alignSelf: "flex-start" }}
          />
        </div>
      )}

      <div className="fixdatesboxwarrow">
        {isSmall && (
          <Box display="flex" justifyContent="space-between" alignItems="center" className="datearrow">
            <IconButton onClick={goToPrevDate} sx={{ color: "#fff" }} className="arrowprew">
              <ChevronLeft />
            </IconButton>
            <IconButton onClick={goToNextDate} sx={{ color: "#fff" }} className="arrownext">
              <ChevronRight />
            </IconButton>
          </Box>
        )}
        <div className="fixdatesboxs">
          {isSmall ? (
            <h2>{dayjs(dateFormatter(selectedDate)).format("DD MMM YYYY")}</h2>
          ) : (
            <h2>{String(selectedDate).padStart(2, "0")}</h2>
          )}
          <h4>{getDayName(selectedDate).toUpperCase()}</h4>
          <h5>SELECT YOUR CHILD'S MENU</h5>
        </div>
      </div>

      {isWithin48Hours ? (
        <Box bgcolor="#fff" color="#000" borderRadius={2} p={2} textAlign="center" mb={2}>
          <Typography fontWeight="bold" fontSize="0.9rem">
            Orders must be placed at least 48 hours in advance.
          </Typography>
          <Typography fontSize="0.8rem" mt={1}>
            Menu selections cannot be changed for this date.
          </Typography>
        </Box>
      ) : isSunday ? (
        <Box bgcolor="#fff" color="#000" borderRadius={2} p={2} textAlign="center" mb={2}>
          <Typography fontWeight="bold" fontSize="0.9rem">
            The Lunch Bowl is closed on Sundays.
          </Typography>
        </Box>
      ) : (
        <>
          <div className="childlistbox">
            <div className="childinputbox">
              {useMealPlan
                ? dummyChildren.map((child, childIndex) => (
                  <Box key={child.id} className="childmlist">
                    <Typography className="menuddtitle">
                      {(child.name || "").toUpperCase()}
                    </Typography>
                    <Box className="radiobtngroup">
                      <FormControl
                        className="radiobtnss"
                        component="fieldset"
                        fullWidth
                      >
                        <RadioGroup
                          id={`mealplan-${child.id}`}
                          name={`mealplan-${child.id}`}
                          value={selectedPlans[child.id] || ""}
                          onChange={(e) => {
                            handlePlanChange(
                              child.id,
                              parseInt(e.target.value)
                            );
                            setActiveChild(childIndex);
                          }}
                          className="RGradiobtnSSS"
                        >
                          {mealPlans.map((plan) => (
                              <Box
                                key={plan.id}
                                display="flex"
                                alignItems="center"
                                mb={0.5}
                                className="RGradiobtn"
                              >
                                <Radio
                                  value={plan.id}
                                  size="small"
                                  className="radiobtnsinput"
                                  id={`radio-${child.id}-${plan.id}`}
                                />
                                <Typography
                                  fontSize="0.8rem"
                                  color="#000"
                                  sx={{ flexGrow: 1 }}
                                  className="radiobtnstext"
                                >
                                  {plan.name}
                                </Typography>
                                <Link
                                  href="#"
                                  fontSize="0.8rem"
                                  sx={{
                                    color: "#fff",
                                    textDecoration: "none",
                                    "&:hover": { textDecoration: "underline" },
                                  }}
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setDialogOpen1(true);
                                  }}
                                >
                                  View Plan
                                </Link>
                              </Box>
                            ))}
                        </RadioGroup>
                      </FormControl>
                    </Box>
                  </Box>
                ))
                : dummyChildren.map((child, childIndex) => {
                  const isPaid = paidHolidayMeals.some(
                      (p) => p.childId === child.id && p.mealDate === dateFormatter(selectedDate)
                    );
                  const blocked = isChildDateBlocked(child.id, dateFormatter(selectedDate));

                  return (
                    <Box key={child.id} className="childmlist">
                      <Typography className="menuddtitle">
                        {(child.name || "").toUpperCase()}
                      </Typography>

                        <Box
                          className="menuddlistbox"
                          bgcolor="#fff"
                          borderRadius={2}
                          px={1}
                          py={0.5}
                        >
                          <Box display="flex" alignItems="center" gap={1}>
                            <Select
                              id={`meal-select-${child.id}`}
                              name={`meal-${child.id}`}
                              value={menuSelections[dateFormatter(selectedDate)]?.[child.id] || ""}
                              onChange={(e) => {
                                childIndex === 0
                                  ? handleFirstChildMenuChange(child.id, e.target.value)
                                  : handleMenuSelectionChange(child.id, e.target.value);
                                setActiveChild(childIndex);
                              }}
                              fullWidth
                              variant="standard"
                              disableUnderline
                              MenuProps={{ PaperProps: { style: { maxHeight: 48 * 4.5 } } }}
                            >
                              <MenuItem value="">Select Dish</MenuItem>

                              {(() => {
                                const savedDish =
                                  menuSelections[dateFormatter(selectedDate)]?.[child.id];
                                if (
                                  savedDish &&
                                  !getDayMenu(selectedDate).includes(savedDish)
                                ) {
                                  return (
                                    <MenuItem key="saved" value={savedDish}>
                                      {savedDish} (Paid)
                                    </MenuItem>
                                  );
                                }
                                return null;
                              })()}

                              {getDayMenu(selectedDate).map((menu, i) => (
                                <MenuItem key={i} value={menu}>
                                  {menu}
                                </MenuItem>
                              ))}
                            </Select>

                            {menuSelections[dateFormatter(selectedDate)]?.[child.id] && !blocked && !isWithin48Hours && (
                              <IconButton
                                onClick={() => handleDeleteClick(
                                  child,
                                  dateFormatter(selectedDate),
                                  menuSelections[dateFormatter(selectedDate)][child.id]
                                )}
                                size="small"
                                sx={{ color: "#d32f2f", minWidth: "40px" }}
                                title="Delete meal and add to wallet"
                                id={`delete-btn-${child.id}`}
                              >
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            )}
                          </Box>
                        </Box>

                        {isSelectedHoliday && !isSunday && (
                          <Box display="flex" gap={2} className="btngroups" mt={1}>
                            {!isPaid && (
                              <Button
                                variant="contained"
                                className="paysavebtn"
                                color="warning"
                                onClick={() => {
                                  if (canPay) {
                                    setShowSaveWarning(true);
                                    return;
                                  }
                                  const dish = menuSelections[dateFormatter(selectedDate)]?.[child.id];
                                  if (!dish) {
                                    alert("Select a dish first");
                                    return;
                                  }
                                  setHolidayPaymentData([
                                    {
                                      childId: child.id,
                                      dish,
                                      mealDate: dateFormatter(selectedDate),
                                      planId: selectedPlans[child.id] || "HOLIDAY",
                                    },
                                  ]);
                                  setHolidayPaymentOpen(true);
                                }}
                                id={`pay-btn-${child.id}`}
                              >
                                <span>Pay ₹200</span>
                              </Button>
                            )}
                          </Box>
                        )}

                        {childIndex === 0 && !isSelectedHoliday && dummyChildren.length > 1 && (
                          <Box sx={{ mt: 1 }}>
                            <FormControlLabel
                              className="cbapplysbtn"
                              control={
                                <Checkbox
                                  id="apply-all-checkbox"
                                  name={`applyall-${dateFormatter(selectedDate)}`}
                                  checked={applyToAll}
                                  onChange={handleApplyToAllChange}
                                  sx={{ color: "#fff" }}
                                />
                              }
                              label={
                                <Typography fontSize="0.8rem" color="#fff">
                                  Apply the same menu for all children
                                </Typography>
                              }
                            />
                          </Box>
                        )}
                    </Box>
                  );
                })}
            </div>

            <div className="childbtnsbox">
              {isSelectedHoliday && (
                <Box mb={2}>
                  <Typography variant="body2" fontStyle="italic" fontSize="0.8rem">
                    Note: This day is a holiday – additional charges apply.
                  </Typography>
                </Box>
              )}
              <Box display="flex" gap={2} className="btngroups">
                {(!isSelectedHoliday || allPaid) && (
                  <Button
                    variant="outlined"
                    className="paysavebtn"
                    onClick={handleSaveClick}
                        id="save-meals-btn"
                  >
                    <span>Save</span>
                  </Button>
                )}
              </Box>
                </div>
          </div>
        </>
      )}

      <Dialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Delete Meal</DialogTitle>
        <DialogContent>
          {deleteTarget && (
            <Typography>
              Are you sure you want to delete the meal for{" "}
              <b>{deleteTarget.child.name}</b> on <b>{deleteTarget.date}</b> (
              <b>{deleteTarget.dish}</b>)? This will be credited to your wallet.
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button
            onClick={handleDeleteConfirm}
            color="error"
            variant="contained"
            id="confirm-delete-btn"
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      <MealPlanDialog
        open={dialogOpen1}
        onClose={() => setDialogOpen1(false)}
        planId={1}
        startDate={dateFormatter(selectedDate)}
      />

      <HolidayPayment
        open={holidayPaymentOpen}
        onClose={() => setHolidayPaymentOpen(false)}
        selectedDate={dateFormatter(selectedDate)}
        childrenData={holidayPaymentData}
        currentPlanId={subscriptionPlans[selectedPlanIndex]?.id}
      />

      <Snackbar
        open={showSaveWarning}
        autoHideDuration={4000}
        onClose={() => setShowSaveWarning(false)}
        className="saveworkmenu"
      >
        <Alert severity="warning" sx={{ width: '100%' }}>
          Please save working days menu before paying holidays.
        </Alert>
      </Snackbar>

      <Snackbar
        open={snackbarOpen}
        autoHideDuration={2000}
        onClose={handleSnackbarClose}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        sx={{ mb: 25 }}
        className="seletallmenu"
      >
        <Alert
          onClose={handleSnackbarClose}
          severity="success"
          sx={{ width: "100%" }}
          variant="filled"
        >
          {snackbarMessage}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default RightPanel;
