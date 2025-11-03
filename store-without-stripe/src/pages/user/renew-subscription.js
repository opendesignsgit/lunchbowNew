// pages/user/renew-subscription.js
import React, { useState, useEffect, useCallback  } from "react";
import Mainheader from "@layout/header/Mainheader";
import Mainfooter from "@layout/footer/Mainfooter";
import RenewSubscriptionPlanStep from "@components/renew-subflow/RenewSubscriptionPlanStep";
// import RenewSubscriptionPlanStep from "@components/renew-subflow/RenewSubscriptionPlanStep";
import RenewChildDetailsStep from "@components/renew-subflow/RenewChildDetailsStep";
import PaymentStep from "@components/profile-Step-Form/PaymentStep";
import RenewPaymentStep from "@components/renew-subflow/RenewPaymentStep";

import { useSession } from "next-auth/react";
import useRegistration from "@hooks/useRegistration";

const RenewSubscriptionPage = () => {
  const { data: session } = useSession();
  const _id = session?.user?.id;
  const { submitHandler } = useRegistration();
  const [childCount, setChildCount] = useState(0);
  const [showChildStep, setShowChildStep] = useState(true); // Show child details first
  const [showPlanStep, setShowPlanStep] = useState(false);  // Subscription plan second
  const [showPaymentStep, setShowPaymentStep] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [childFormData, setChildFormData] = useState({ children: [] });
  // const [selectedPlan, setSelectedPlan] = useState(null);


  const handlePlanChange = useCallback((plan) => {
    setSelectedPlan(plan);
  }, []);

  const featchData = async () => {
    try {
      const response = await submitHandler({
        path: "get-customer-form",
        _id,
      });
      setChildCount(response?.data?.children?.length || 0);
      setChildFormData({ children: response?.data?.children || [] });
    } catch (error) {
      console.error("Error fetching customer form data:", error);
    }
  };

  useEffect(() => {
    if (_id) {
      featchData();
    }
  }, [_id]);

  const handleChildNext = () => {
    setShowChildStep(false);
    setShowPlanStep(true);
  };

  const handlePlanNext = (plan) => {
    setSelectedPlan(plan);
    setShowPlanStep(false);
    setShowPaymentStep(true);
  };

  const handlePrev = () => {
    if (showPaymentStep) {
      setShowPaymentStep(false);
      setShowPlanStep(true);
    } else if (showPlanStep) {
      setShowPlanStep(false);
      setShowChildStep(true);
    } else {
      window.location.href = "/user/userDashBoard";
    }
  };

  return (
    <div className="steppage">
      <Mainheader
        title="Renew Subscription"
        description="Renew your subscription plan"
      />

      <div className="pagebody">
        <section className="pagebansec setpbanersec relative">
          <div className="container mx-auto relative h-full">
            <div className="pageinconter relative h-full w-full flex items-center justify-center text-center">
              <div className="hworkTitle combtntb comtilte">
                <h1 className="flex flex-row textFF6514">
                  <span className="block">Renew Your </span>
                  <span className="block firstspan ml-2">Subscription</span>
                </h1>
                <p className="">
                  {showPaymentStep
                    ? "Complete your payment to renew your subscription"
                    : showPlanStep
                      ? "Choose your subscription plan"
                      : "Update or confirm child details"}
                </p>
              </div>
            </div>
          </div>
        </section>

        <div className="container mx-auto px-4 py-12">
          {showChildStep && (
            <RenewChildDetailsStep
              formData={childFormData}
              setFormData={setChildFormData}
              nextStep={handleChildNext}
              prevStep={handlePrev}
              _id={_id}
              setChildCount={setChildCount}
            />
          )}

          {showPlanStep && (
            <RenewSubscriptionPlanStep
          nextStep={handlePlanNext}
          prevStep={handlePrev}
          _id={_id}
          initialSubscriptionPlan={selectedPlan}
          onSubscriptionPlanChange={handlePlanChange}
          childrenData={childFormData.children}
        />
          )}

          {showPaymentStep && (
            <RenewPaymentStep
              prevStep={handlePrev}
              _id={_id}
              selectedPlan={selectedPlan}
            />
          )}
        </div>
      </div>

      <Mainfooter />
    </div>
  );
};

export default RenewSubscriptionPage;
