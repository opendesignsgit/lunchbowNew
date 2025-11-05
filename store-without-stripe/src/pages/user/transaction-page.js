// pages/user/transactionPage.js
import React from "react";
import { useSession } from "next-auth/react";
import Mainheader from "@layout/header/Mainheader";
import Mainfooter from "@layout/footer/Mainfooter";
import PaymentsTable from "@components/paymentsTable";  // adjust path if needed

const TransactionPage = () => {
  const { data: session } = useSession();
  const userId = session?.user?.id || null;

  return (
    <div className="steppage">
      <Mainheader
        title="Transaction Details"
        description="View your payment transactions"
      />

      <div className="pagebody">
        <section className="pagebansec setpbanersec relative">
          <div className="container mx-auto relative h-full">
            <div className="pageinconter relative h-full w-full flex items-center justify-center text-center">
              <div className="hworkTitle combtntb comtilte">
                <h1 className="flex flex-row textFF6514">
                  <span className="block">Transaction</span>
                  <span className="block firstspan ml-2">Details</span>
                </h1>
                <p>View your payment transaction history</p>
              </div>
            </div>
          </div>
        </section>
        <section className="transactionTableSec secpaddblock bg-white">
          <div className="container mx-auto">

            <div className='hworkTitle combtntb comtilte textcenter  mb-[5vh]'>
              <h3 className='flex flex-col text4AB138'> <span className='block'>Transaction Details</span> </h3>
              <p className=''>See how our site works as soon as you register <br />and create an account with us.</p>
            </div>
            {/* Pass userId to PaymentsTable */}
            <PaymentsTable _id={userId} />
          </div>
        </section>
      </div>

      <Mainfooter />
    </div>
  );
};

export default TransactionPage;
