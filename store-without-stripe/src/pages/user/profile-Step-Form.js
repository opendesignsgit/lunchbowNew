import React, { useState, useEffect } from "react";
import { useRouter } from 'next/router';
import { Box, Typography, Divider } from "@mui/material";
import Image from "next/image";
import Mainheader from "@layout/header/Mainheader";
import Mainfooter from "@layout/footer/Mainfooter";
import Accordion from "@components/faq/Accordion";
import ParentDetailsStep from "@components/profile-Step-Form/ParentDetailsStep";
import ChildDetailsStep from "@components/profile-Step-Form/childDetailsStep";
import SubscriptionPlanStep from "@components/profile-Step-Form/subscriptionPlanStep";
import PaymentStep from "@components/profile-Step-Form/PaymentStep";
import { useSession } from "next-auth/react";
import AccountServices from "@services/AccountServices"; // ✅ integrate API
import abbanicon1 from "../../../public/enterrequireddetails/redroundedandlines.svg";
import abbanicon2 from "../../../public/enterrequireddetails/yellowroundedflower.svg";
import abbanicon3 from "../../../public/enterrequireddetails/redlittleheart.svg";
import abbanicon4 from "../../../public/enterrequireddetails/lighergreenarrow.svg";
import abbanicon5 from "../../../public/enterrequireddetails/violetyellow-star.svg";
import abbanicon6 from "../../../public/enterrequireddetails/redtriangle.svg";
import abbanicon7 from "../../../public/enterrequireddetails/redlittleflower.svg";
import abbanicon8 from "../../../public/enterrequireddetails/layerflower.svg";

const StepHeader = ({ step }) => {
  const labels = ["PARENT’S DETAILS", "CHILDREN’S DETAILS", "SUBSCRIPTION PLAN", "PAYMENT"];
  const totalSteps = labels.length;
  const progressPercentage = (step / totalSteps) * 100;

  return (
    <Box className="SetpTabNav" sx={{ textAlign: "center", mb: 6 }}>
      <Box
        className="SetpTabul"
        sx={{
          display: "flex",
          columnGap: 2,
          rowGap: 0,
          flexWrap: "wrap",
          justifyContent: "space-between",
          paddingBottom: 2,
          border: 0,
          borderBottomStyle: "dashed",
          borderBottomColor: "#C0C0C0",
          borderBottomWidth: "1px",
        }}
      >
        {labels.map((label, index) => (
          <Box
            className="SetpTabli"
            key={index}
            sx={{
              bgcolor: step === index + 1 ? "#FF6A00" : "transparent",
            }}
          >
            <Typography
              sx={{
                color: step === index + 1 ? "#fff" : "#C0C0C0",
              }}
            >
              {label}
            </Typography>
          </Box>
        ))}
      </Box>
      <Box
        sx={{
          height: "2px",
          borderRadius: "4px",
          overflow: "hidden",
          mt: "-2px",
        }}
      >
        <Box
          sx={{
            height: "100%",
            width: `${progressPercentage}%`,
            backgroundColor: "#FF6A00",
            transition: "width 0.4s ease",
          }}
        />
      </Box>
    </Box>
  );
};

const MultiStepForm = () => {
  const { data: session } = useSession();
  const _id = session?.user?.id;
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [childCount, setChildCount] = useState(1);
  const [formData, setFormData] = useState({
    fatherFirstName: "",
    fatherLastName: "",
    motherFirstName: "",
    motherLastName: "",
    mobile: "",
    email: "",
    address: "",
    children: [],
    subscriptionPlan: {},
  });
  const [loading, setLoading] = useState(true);

  // ✅ Fetch account-details
  useEffect(() => {
    const fetchAccountData = async () => {
      if (!_id) return;
      try {
        const response = await AccountServices.getAccountDetails(_id);
        if (response.success && response.data) {
          const data = response.data;

          console.log("Fetched account data:", data);

          setFormData({
            ...formData,
            ...data.parentDetails,
            children: data.children || [],
            subscriptionPlan: data.subscriptionPlan || {},
          });

          setChildCount(data.children?.length || 1);

          // resume on saved step
          if (data.step) setStep(data.step);

          // Redirect if step is 4 and paymentStatus is Success
          if (data.step === 4 && data.paymentStatus === "Success") {
            router.push('/user/menuCalendarPage');
          }
        }
      } catch (error) {
        console.error("Error fetching account details:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchAccountData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [_id]);

  const handleSubscriptionPlanChange = (newPlanData) => {
  setFormData(prev => ({
    ...prev,
    subscriptionPlan: {
      ...prev.subscriptionPlan,
      ...newPlanData,
    }
  }));
};

  const nextStep = () => {
    setStep((prev) => prev + 1);
    window.scrollTo({ top: 250, behavior: "smooth" });
  }
  const prevStep = () => {
    setStep((prev) => prev - 1);
    window.scrollTo({ top: 250, behavior: "smooth" });
  };

  if (loading) {
    return (
      <div className="steppage">
        <Mainheader title="Home" description="This is Home page" />
        <div className="pagebody flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-orange-500"></div>
        </div>
        <Mainfooter />
      </div>
    );
  }

  const faqItems = [
    {
      title: "In what way are the lunch dishes sealed to keep them fresh and stop leaks?",
      content:
        "Our Lunch dishes are tightly sealed with Plastic free, eco-friendly leak proof and Sugarcane Bagasse Canisters. To preserve freshness and maintain the right temperature until noon, we also use insulated bags for delivery purposes.",
    },
    {
      title: "Over time, what type of variation can I anticipate in the lunch bowl options?",
      content:
        "We provide a varied and ever-changing menu to keep your child engaged. Our culinary team regularly introduces new recipes and seasonal ingredients to ensure a range of wholesome and appealing options.",
    },
    {
      title: "What safeguards are in place to guarantee a clean atmosphere for food preparation?",
      content:
        "Our cooking facilities follow the highest hygiene standards. All surfaces and equipment are routinely sterilized, staff wear protective gear, and adhere to strict handwashing guidelines. Regular inspections are conducted in line with food safety regulations.",
    },
    {
      title: "How can I share feedback or resolve any issues with the lunch bowl?",
      content: (
        <>
          We value your feedback. Please contact our customer service team by phone at <strong><a href="tel:+919176917602">+91 91769 17602</a></strong> or email us at <strong><a href="mailto:contactus@lunchbowl.co.in">contactus@lunchbowl.co.in</a></strong>. We take all complaints seriously and are committed to resolving them quickly to ensure your child’s satisfaction.
        </>
      ),
    },
    {
      title: "How do you ensure the food is nutritious and safe for my child?",
      content:
        "Our meals are nutritionist-designed, prepared with fresh, high-quality ingredients, and made under strict hygiene standards. We also customize meals for dietary needs and take extra care to avoid allergens.",
    },
    {
      title: "How does the delivery process work, and can I trust it will arrive on time?",
      content:
        "We deliver meals directly to schools in temperature-controlled vehicles, scheduled to arrive just before lunchtime. In the rare event of a delay, we’ll notify you immediately.",
    },
    {
      title: "What if my child has specific dietary restrictions or allergies?",
      content:
        "We take special care to accommodate dietary restrictions and allergies. Our team follows strict preparation practices to ensure meals are safe and free from cross-contamination.",
    },
    {
      title: "What if I need food on Sunday?",
      content: (
        <>
          Our regular service is available Monday to Friday. If you need meals on a Sunday, please call us at <strong><a href="tel:+919176917602">+91 91769 17602</a></strong> in advance. Our team will confirm availability and make special arrangements based on your request and location.
        </>
      ),
    },
    {
      title: "Can I get a free trial on Sunday?",
      content:
        "We don’t offer free trials on Sundays. Please choose any weekday or Saturday slot for your trial.",
    },
    {
      title: "What if I don’t need a meal on a day during my subscription? Will I get a refund?",
      content:
        "Any unused meal days will be credited to your wallet and can be redeemed during your next subscription.",
    },
    {
      title: "What if I want to terminate the service?",
      content:
        "You can request service termination at any time. The unconsumed meal days will be calculated, and a refund will be processed. Please contact customer service for termination assistance.",
    },
  ];

  return (
    <div className="steppage">
      <Mainheader title="Home" description="This is Home page" />
      <div className="pagebody">
        <section className="pagebansec setpbanersec relative">
          <div className="container mx-auto relative h-full">
            <div className="pageinconter relative h-full w-full flex items-center justify-center text-center">
              <div className="hworkTitle combtntb comtilte relative">
                <h1 className="flex flex-row textFF6514">
                  <span className="block firstspan">Enter Required </span>
                  <span className="block ml-2">Details</span>
                </h1>
                <p>
                  We have got you covered. Let us cover you by filling in the
                  details below.
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

        <Box
          className="SetpContainer"
          sx={{
            bgcolor: "white",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            px: 2,
            paddingTop: 12,
            paddingBottom: 15,
          }}
        >
          <Box className="DetlsSepBox" sx={{ width: "100%", maxWidth: "1200px" }}>
            <StepHeader step={step} />

            {step === 1 && (
              <ParentDetailsStep
                formData={formData}
                setFormData={setFormData}
                nextStep={nextStep}
                _id={_id}
                sessionData={session}
              />
            )}

            {step === 2 && (
              <ChildDetailsStep
                formData={formData}
                setFormData={setFormData}
                nextStep={nextStep}
                prevStep={prevStep}
                _id={_id}
                setChildCount={setChildCount}
              />
            )}

            {step === 3 && (
              <SubscriptionPlanStep
                nextStep={nextStep}
                prevStep={prevStep}
                _id={_id}
                numberOfChildren={childCount}
                initialSubscriptionPlan={formData.subscriptionPlan}
                onSubscriptionPlanChange={handleSubscriptionPlanChange}
              />
            )}

            {step === 4 && <PaymentStep prevStep={prevStep} _id={_id} />}
          </Box>
        </Box>

        <section className="HfaqSec senddesfaq relative bg-4AB138 flex">
          <div className="Hfaqinrow w-full relative py-[12vh]">
            <div className="container mx-auto">
              <div className="faqcontain py-[6vw] px-[8vw] bg-white relative">
                <div className="hfaqTitle combtntb comtilte mb-[4vh]">
                  <h4 className="text-[#000000]">Frequently Asked</h4>
                  <h3 className="flex flex-col text4AB138">
                    <span className="block">Questions</span>
                  </h3>
                </div>
                <div className="hfaqAccordion ">
                  <Accordion items={faqItems} />
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
      <Mainfooter />
    </div>
  );
};

export default MultiStepForm;