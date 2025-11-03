// pages/user/add-child.js
import React from "react";
import { useSession } from "next-auth/react";
import Mainheader from "@layout/header/Mainheader";
import Mainfooter from "@layout/footer/Mainfooter";
import AddChild from "@components/addChild/AddChild";

const AddChildPage = () => {
  const { data: session } = useSession();
  const userId = session?.user?.id || null;

  return (
    <div className="steppage">
      <Mainheader
        title="Add Child"
        description="Add or update child details"
      />

      <div className="pagebody">
        <section className="pagebansec setpbanersec relative">
          <div className="container mx-auto relative h-full">
            <div className="pageinconter relative h-full w-full flex items-center justify-center text-center">
              <div className="hworkTitle combtntb comtilte">
                <h1 className="flex flex-row textFF6514">
                  <span className="block">Add </span>
                  <span className="block firstspan ml-2">Child</span>
                </h1>
                <p>Add a new child to your profile</p>
              </div>
            </div>
          </div>
        </section>
        <div className="container mx-auto flex items-center justify-center py-12">
          {/* Pass userId to AddChild */}
          <AddChild _id={userId} />
        </div>
      </div>

      <Mainfooter />
    </div>
  );
};

export default AddChildPage;
