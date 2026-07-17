import React from "react";
import useGetCData from "@/hooks/useGetCData";
import NotFoundPage from "@/components/common/NotFoundPage";

const Main = ({ children }) => {
  const { path, accessList } = useGetCData();

  // "app-settings" is allowed for any signed-in admin without needing it added to
  // every admin's access_list. The real security boundary is the API itself,
  // which is protected by isAuth + isAdmin.
  if (path !== "app-settings" && !accessList?.includes(path)) {
    return <NotFoundPage />;
  }
  return (
    <main className="h-full overflow-y-auto">
      <div className="sm:container grid grid-cols-1 min-w-0 lg:px-6 sm:px-4 px-2 mx-auto">
        {children}
      </div>
    </main>
  );
};

export default Main;
