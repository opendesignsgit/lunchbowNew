import React, { useState, useEffect } from 'react';
import Image from "next/image";
import {
  HiUsers,
  HiUserGroup,
  HiUserAdd,
  HiUserCircle,
  HiCalendar,
} from "react-icons/hi";
import { useSession } from "next-auth/react";
import AccountServices from "@services/AccountServices";
import Breadcrumbs from "@layout/Breadcrumbs";
import abbanicon1 from "../../../public/about/icons/herosec/pink-rounded-lines.svg";
import abbanicon2 from "../../../public/about/icons/herosec/pink-smileflower.svg";
import { Button } from "@mui/material";
import Mainheader from "@layout/header/Mainheader";
import Mainfooter from "@layout/footer/Mainfooter";
import SubscriptionPlanStep from "@components/profile-Step-Form/subscriptionPlanStep";

const UserDashboard = () => {
  const { data: session } = useSession();
  const userId = session?.user?.id;
  const [dashboardData, setDashboardData] = useState({
    parentName: "",
    subscriptionCount: 0,
    subscriptionActive: false,
    subscriptionDates: { start: null, end: null },
    childrenCount: 0,
    recentChildren: [],
    loading: true,
  });
  const [showRenewalForm, setShowRenewalForm] = useState(false);

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const response = await AccountServices.getAccountDetails(userId);
        const userData = response.data;

        setDashboardData({
          parentName: `${userData.parentDetails.fatherFirstName} ${userData.parentDetails.fatherLastName}`,
          subscriptionCount: userData.subscriptionCount || 0,
          subscriptionActive: userData.paymentStatus || false,
          subscriptionDates: {
            start: userData.subscriptionPlan?.startDate || null,
            end: userData.subscriptionPlan?.endDate || null,
          },
          childrenCount: userData.children?.length || 0,
          recentChildren: userData.children?.slice(0, 4) || [],
          loading: false,
        });
      } catch (error) {
        console.error("Error fetching user data:", error);
        setDashboardData((prev) => ({ ...prev, loading: false }));
      }
    };

    if (userId) fetchUserData();
  }, [userId]);

  const formatDate = (dateString) => {
    if (!dateString) return "Not available";
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  // TEMPORARY FOR TESTING - Always return true to show renew button
  const isSubscriptionExpired = () => {
    if (!dashboardData.subscriptionDates.end) return true;
    const endDate = new Date(dashboardData.subscriptionDates.end);
    return endDate < new Date();
  };

  const handleRenewSuccess = () => {
    setShowRenewalForm(false);
    // Refresh data after renewal
    const fetchUserData = async () => {
      const response = await AccountServices.getAccountDetails(userId);
      const userData = response.data;
      setDashboardData((prev) => ({
        ...prev,
        subscriptionCount: userData.subscriptionCount || 0,
        subscriptionActive: userData.paymentStatus || false,
        subscriptionDates: {
          start: userData.subscriptionPlan?.startDate || null,
          end: userData.subscriptionPlan?.endDate || null,
        },
        loading: false,
      }));
    };
    fetchUserData();
  };

  if (dashboardData.loading) {
    return (
      <div className="steppage">
        <Mainheader title="Dashboard" description="User Dashboard" />
        <div className="pagebody">
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
          </div>
        </div>
        <Mainfooter />
      </div>
    );
  }

  return (
    <div className="steppage">
      <Mainheader title="Dashboard" description="User Dashboard" />

      <div className="Dashboardbody">
        <section className="pagebansec Dashboardbanersec relative">
          <div className="container mx-auto relative h-full">
            <div className="pageinconter relative h-full w-full flex items-center">
              <div className="hworkTitle combtntb comtilte">
                <h1 className="flex flex-col textFF6514">
                  {" "}
                  <span className="block firstspan">HEALTHY BITES </span>{" "}
                  <span className="block">JOYFUL SMILES</span>{" "}
                </h1>
                <p className="">!HEY! CONFUSED ALREADY? — We are here with full pack of protein fiber <br />and also an appetizing meal bowl for your little one; so no more worries <br />of lunch bowl for our little smiles.</p>
                <Breadcrumbs />
              </div>
            </div>
            <div className="abbanIconss">
              <div className="abbanicn iconone absolute">
                <Image
                  src={abbanicon1}
                  priority  
                  alt="Icon"
                  className="iconrotates"
                />
              </div>
              <div className="abbanicn icontwo absolute">
                <Image src={abbanicon2} priority alt="Icon" />
              </div>
            </div>
          </div>
        </section>

        {showRenewalForm ? (
          <section className="renewsec DetlsSepBox secpaddblock">
            <div className="container mx-auto ">
              <div className="flex items-center comtilte relative">
                <div className='rnewbackbtn'>
                  <button onClick={() => setShowRenewalForm(false)} className="text-blue-600 hover:text-blue-800 flex items-center" >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-5 w-5 mr-1"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fillRule="evenodd"
                        d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <span>Back to Dashboard</span>
                  </button>
                </div>
                <h4>Renew Your Subscription</h4>
              </div>

              <div className="bg-white">
                <SubscriptionPlanStep
                  nextStep={handleRenewSuccess}
                  prevStep={() => setShowRenewalForm(false)}
                  _id={userId}
                />
              </div>
            </div>
          </section>
        ) : (
            <div className='DashboardSecss secpaddblock'>
              <div className="container mx-auto ">
                <div className='comtilte mb-[5vh]'>
                  <h3 className='textFF6514'>Welcome, <small>{dashboardData.parentName}</small></h3>
                  <p>Here's your account overview</p>
                </div>
                {/* Stats Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8 DashboardTBoxss">
                  {/* Total Subscriptions Card */}
                  <div className="bg-white rounded-lg shadow p-6 border-l-4 border-blue-500 DashboardTItems">
                    <div className="flex items-center justify-between">
                      <div>
                        <h5> Total Subscriptions </h5>
                        <p className="text-2xl font-semibold text-gray-800">
                          {dashboardData.subscriptionCount}
                        </p>
                      </div>
                      <div className="p-3 rounded-full bg-blue-100 text-blue-600">
                        <HiUsers className="w-6 h-6" />
                      </div>
                    </div>
                    <div className="mt-4 text-sm text-gray-500 curplan flex">
                      <span> <strong>Current plan:</strong> </span>
                      <strong
                        className={`ml-1 ${dashboardData.subscriptionCount > 0 ? "planactive" : "planinactive"}`}
                      >
                        {dashboardData.subscriptionCount > 0 ? "Active" : "Inactive"}
                      </strong>
                    </div>
                  </div>

                {/* Renew Subscription Button/Card - only show if subscription is expired */}
                {isSubscriptionExpired() && (
                  <div className="bg-white rounded-lg shadow p-6 border-l-4 border-orange-500 flex flex-col items-start DashboardTItems">
                    <div className="mb-4">
                      <h5> Your subscription has expired </h5>
                      <p className="text-lg font-semibold text-gray-800">
                        Renew to continue
                      </p>
                    </div>
                    <Button
                      variant="contained"
                      color="primary"
                      className="bg-orange-500 hover:bg-orange-600 text-white"
                      onClick={() => setShowRenewalForm(true)}
                    >
                      Renew Subscription
                    </Button>
                  </div>
                )}

                  {/* Children Card */}
                  <div className="bg-white rounded-lg shadow p-6 border-l-4 border-purple-500 DashboardTItems">
                    <div className="flex items-center justify-between">
                      <div>
                        <h5> Registered Children </h5>
                        <p className="text-2xl font-semibold text-gray-800">
                          {dashboardData.childrenCount}
                        </p>
                      </div>
                      <div className="p-3 rounded-full bg-purple-100 text-purple-600">
                        <HiUserAdd className="w-6 h-6" />
                      </div>
                    </div>
                    <div className="mt-4 text-sm text-gray-500">
                      <span>Most recent additions</span>
                    </div>
                  </div>
                </div>

                {/* Children Table */}
                <div className="bg-white rounded-lg shadow overflow-hidden mb-8">
                  <div className="px-6 py-4 border-b border-gray-200 comtilte">
                    <h5 >  Your Children ({dashboardData.childrenCount}) </h5>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-bold text-[#333333] uppercase tracking-wider">
                            Name
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-bold text-[#333333] uppercase tracking-wider">
                            School
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-bold text-[#333333] uppercase tracking-wider">
                            Class
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-bold text-[#333333] uppercase tracking-wider">
                            Lunch Time
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {dashboardData.recentChildren.map((child, index) => (
                          <tr key={index} className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex items-center">
                                <div className="flex-shrink-0 h-10 w-10">
                                  <HiUserCircle className="h-10 w-10 text-gray-400" />
                                </div>
                                <div className="ml-4">
                                  <div className="text-sm font-bold text-[#FF6514]">
                                    {child.childFirstName} {child.childLastName}
                                  </div>
                                  <div className="text-sm text-gray-500">
                                    {formatDate(child.dob)}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm text-gray-900">
                                {child.school}
                              </div>
                              <div className="text-sm text-gray-500">
                                {child.location}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm text-gray-900">
                                {child.childClass} - {child.section}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm text-gray-900">
                                {child.lunchTime}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <Mainfooter />
    </div>
  );
};

export default UserDashboard;