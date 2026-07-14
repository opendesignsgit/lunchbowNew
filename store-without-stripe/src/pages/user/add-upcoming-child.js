// pages/user/add-upcoming-child.js
//
// Targeted flow: lets a parent pay (via CCAvenue) to add an existing child to an
// UPCOMING subscription that they already hold for another child — covering the
// same future term. Reuses the existing Add-Child CCAvenue backend handlers; the
// child is attached to the chosen subscription on payment success.
//
// Reachable at /user/add-upcoming-child (log in as the parent first).

import React, { useState, useEffect, useMemo } from "react";
import dayjs from "dayjs";
import {
  Box,
  Typography,
  Paper,
  Checkbox,
  FormControlLabel,
  FormHelperText,
  LinearProgress,
  Divider,
} from "@mui/material";
import { useSession } from "next-auth/react";
import { useRouter } from "next/router";
import Image from "next/image";
import Mainheader from "@layout/header/Mainheader";
import Mainfooter from "@layout/footer/Mainfooter";
import AccountServices from "@services/AccountServices";
import CategoryServices from "@services/CategoryServices";
import AddUpcomingChildPayment from "@components/addChild/AddUpcomingChildPayment";
import abbanicon1 from "../../../public/enterrequireddetails/redroundedandlines.svg";
import abbanicon2 from "../../../public/enterrequireddetails/yellowroundedflower.svg";
import abbanicon3 from "../../../public/enterrequireddetails/redlittleheart.svg";
import abbanicon4 from "../../../public/enterrequireddetails/lighergreenarrow.svg";
import abbanicon5 from "../../../public/enterrequireddetails/violetyellow-star.svg";
import abbanicon6 from "../../../public/enterrequireddetails/redtriangle.svg";
import abbanicon7 from "../../../public/enterrequireddetails/redlittleflower.svg";
import abbanicon8 from "../../../public/enterrequireddetails/layerflower.svg";

const idOf = (c) =>
  c && typeof c === "object" ? String(c._id) : c != null ? String(c) : null;

const AddUpcomingChildPage = () => {
  const { data: session } = useSession();
  const userId = session?.user?.id;
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [allChildren, setAllChildren] = useState([]);
  const [upcomingSubs, setUpcomingSubs] = useState([]);
  const [selectedSubId, setSelectedSubId] = useState("");
  const [selectedChildIds, setSelectedChildIds] = useState([]);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const fetchData = async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const [acc, kids] = await Promise.all([
        AccountServices.getAccountDetails(userId),
        CategoryServices.getChildren(userId),
      ]);

      const accData = acc?.data ?? acc;
      const subs = accData?.subscriptions || [];
      const children = kids?.children || [];

      const upcoming = subs.filter((s) => s.status === "upcoming");

      setAllChildren(children);
      setUpcomingSubs(upcoming);
      if (upcoming.length > 0) setSelectedSubId(String(upcoming[0]._id));
    } catch (e) {
      console.error("add-upcoming-child fetch failed:", e);
      setError("Could not load your subscriptions. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const selectedSub = useMemo(
    () => upcomingSubs.find((s) => String(s._id) === String(selectedSubId)),
    [upcomingSubs, selectedSubId]
  );

  // Children already covered by the selected upcoming subscription
  const coveredIds = useMemo(() => {
    const list = selectedSub?.children || [];
    return new Set(list.map(idOf).filter(Boolean));
  }, [selectedSub]);

  // Children NOT yet on this upcoming subscription = candidates to add
  const uncoveredChildren = useMemo(
    () => allChildren.filter((c) => !coveredIds.has(idOf(c))),
    [allChildren, coveredIds]
  );

  // Full-term price per child for this subscription
  const perChildPrice = useMemo(() => {
    if (!selectedSub) return 0;
    const n = (selectedSub.children || []).length || 1;
    return Math.round((selectedSub.price || 0) / n);
  }, [selectedSub]);

  const totalAmount = perChildPrice * selectedChildIds.length;

  // Reset child selection when the chosen subscription changes
  useEffect(() => {
    setSelectedChildIds([]);
  }, [selectedSubId]);

  const toggleChild = (id) => {
    setSelectedChildIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const selectedChildObjects = uncoveredChildren.filter((c) =>
    selectedChildIds.includes(idOf(c))
  );

  return (
    <div className="steppage">
      <Mainheader
        title="Add Child to Upcoming Plan"
        description="Pay to include another child in your upcoming subscription"
      />

      <div className="pagebody">
        {/* Hero banner (matches renew / profile-step pages) */}
        <section className="pagebansec setpbanersec relative">
          <div className="container mx-auto relative h-full">
            <div className="pageinconter relative h-full w-full flex items-center justify-center text-center">
              <div className="hworkTitle combtntb comtilte relative">
                <h1 className="flex flex-row textFF6514">
                  <span className="block">Add a Child to Your </span>
                  <span className="block firstspan ml-2">Upcoming Plan</span>
                </h1>
                <p className="">
                  Include another of your children in an already-booked upcoming
                  <br />
                  subscription for the same dates, and pay only for that child.
                </p>

                <div className="psfbanIconss">
                  <div className="psfbanicn iconone absolute">
                    <Image src={abbanicon1} priority alt="Icon" className="iconrotates" />
                  </div>
                  <div className="psfbanicn icontwo absolute">
                    <Image src={abbanicon2} priority alt="Icon" className="iconrotates" />
                  </div>
                  <div className="psfbanicn iconthree absolute">
                    <Image src={abbanicon3} priority alt="Icon" className="iconrubberband" />
                  </div>
                  <div className="psfbanicn iconfour absolute">
                    <Image src={abbanicon4} priority alt="Icon" />
                  </div>
                  <div className="psfbanicn iconfive absolute">
                    <Image src={abbanicon5} priority alt="Icon" />
                  </div>
                  <div className="psfbanicn iconsix absolute">
                    <Image src={abbanicon6} priority alt="Icon" className="iconrotates" />
                  </div>
                  <div className="psfbanicn iconseven absolute">
                    <Image src={abbanicon7} priority alt="Icon" className="iconrotates" />
                  </div>
                  <div className="psfbanicn iconeight absolute">
                    <Image src={abbanicon8} priority alt="Icon" className="iconrotates" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <Box className="container mx-auto px-4 py-12" sx={{ maxWidth: 820 }}>
          {loading && <LinearProgress />}

          {!loading && error && (
            <FormHelperText error sx={{ fontSize: 14 }}>
              {error}
            </FormHelperText>
          )}

          {!loading && !error && upcomingSubs.length === 0 && (
            <Paper sx={{ p: 3, borderRadius: 2 }}>
              <Typography>
                No upcoming subscription found for this account. This option is
                only available when you already have a future-dated plan.
              </Typography>
            </Paper>
          )}

          {!loading && !error && done && (
            <Paper sx={{ p: 3, borderRadius: 2, border: "1px solid #2e7d32" }}>
              <Typography sx={{ color: "#2e7d32", fontWeight: 600 }}>
                Done! The child has been added to the upcoming subscription.
              </Typography>
            </Paper>
          )}

          {!loading && !error && !done && upcomingSubs.length > 0 && (
            <>
              {/* Upcoming subscription selector (only shown if more than one) */}
              {upcomingSubs.length > 1 && (
                <Box sx={{ mb: 3 }}>
                  <Typography sx={{ fontWeight: 600, mb: 1 }}>
                    Choose the upcoming subscription
                  </Typography>
                  {upcomingSubs.map((s) => (
                    <FormControlLabel
                      key={s._id}
                      control={
                        <Checkbox
                          checked={String(selectedSubId) === String(s._id)}
                          onChange={() => setSelectedSubId(String(s._id))}
                        />
                      }
                      label={`${dayjs(s.startDate).format("DD MMM YYYY")} → ${dayjs(
                        s.endDate
                      ).format("DD MMM YYYY")}  (₹${s.price})`}
                    />
                  ))}
                </Box>
              )}

              {selectedSub && (
                <Paper sx={{ p: 3, borderRadius: 2, mb: 3 }}>
                  <Typography sx={{ fontWeight: 700, mb: 1 }}>
                    Upcoming Plan
                  </Typography>
                  <Typography>
                    <strong>Term:</strong>{" "}
                    {dayjs(selectedSub.startDate).format("DD MMM YYYY")} →{" "}
                    {dayjs(selectedSub.endDate).format("DD MMM YYYY")}
                  </Typography>
                  <Typography>
                    <strong>Working Days:</strong> {selectedSub.workingDays}
                  </Typography>
                  <Typography>
                    <strong>Price per child (full term):</strong> ₹{perChildPrice}
                  </Typography>
                  <Typography sx={{ color: "#777", mt: 1, fontSize: 13 }}>
                    Already covered:{" "}
                    {(selectedSub.children || [])
                      .map((c) =>
                        typeof c === "object"
                          ? `${c.childFirstName} ${c.childLastName}`
                          : "child"
                      )
                      .join(", ") || "—"}
                  </Typography>
                </Paper>
              )}

              <Typography sx={{ fontWeight: 600, mb: 1 }}>
                Select the child to add
              </Typography>

              {uncoveredChildren.length === 0 ? (
                <Typography sx={{ color: "#777", mb: 2 }}>
                  All your children are already covered by this upcoming plan.
                </Typography>
              ) : (
                <Box sx={{ mb: 3 }}>
                  {uncoveredChildren.map((c) => (
                    <Paper
                      key={c._id}
                      variant="outlined"
                      sx={{ p: 2, mb: 1.5, borderRadius: 2 }}
                    >
                      <FormControlLabel
                        control={
                          <Checkbox
                            checked={selectedChildIds.includes(idOf(c))}
                            onChange={() => toggleChild(idOf(c))}
                          />
                        }
                        label={
                          <Box>
                            <Typography sx={{ fontWeight: 600 }}>
                              {c.childFirstName} {c.childLastName}
                            </Typography>
                            <Typography sx={{ fontSize: 13, color: "#777" }}>
                              {c.school} · {c.childClass}
                              {c.section ? ` - ${c.section}` : ""} ·{" "}
                              {c.lunchTime}
                            </Typography>
                          </Box>
                        }
                      />
                    </Paper>
                  ))}
                </Box>
              )}

              <Divider sx={{ my: 2 }} />

              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  mb: 2,
                }}
              >
                <Typography sx={{ fontWeight: 700, fontSize: 18 }}>
                  Total to Pay
                </Typography>
                <Typography
                  sx={{ fontWeight: 700, fontSize: 18, color: "#FF6A00" }}
                >
                  ₹{totalAmount}
                </Typography>
              </Box>

              {selectedChildIds.length === 0 ? (
                <FormHelperText sx={{ fontSize: 13 }}>
                  Select at least one child to continue.
                </FormHelperText>
              ) : (
                <AddUpcomingChildPayment
                  _id={userId}
                  subscription={selectedSub}
                  childrenData={selectedChildObjects}
                  totalAmount={totalAmount}
                  onError={(msg) => setError(msg)}
                  onSuccess={() => {
                    setDone(true);
                    setTimeout(
                      () => router.push("/user/userDashBoard"),
                      1500
                    );
                  }}
                />
              )}
            </>
          )}
        </Box>
      </div>

      <Mainfooter />
    </div>
  );
};

export default AddUpcomingChildPage;
