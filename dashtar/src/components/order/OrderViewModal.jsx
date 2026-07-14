import React, { useEffect, useState } from "react";
import CustomerServices from "@/services/CustomerServices";

// Displays the full details of a single order row (child meal for a date).
// `data` is the order object already loaded in the table (no fetch needed):
//   { childFirstName, childLastName, childClass, section, school, location,
//     lunchTime, food, date, planId, childId, userId }
// Parent details are fetched on open via the order's userId.
const OrderViewModal = ({ open, onClose, data }) => {
  const [parent, setParent] = useState(null);
  const [loadingParent, setLoadingParent] = useState(false);

  useEffect(() => {
    const fetchParent = async () => {
      if (!open || !data?.userId) return;
      setLoadingParent(true);
      try {
        const res = await CustomerServices.getCustomerById(data.userId);
        setParent(res);
      } catch (e) {
        console.error("OrderViewModal: parent fetch failed", e);
        setParent(null);
      } finally {
        setLoadingParent(false);
      }
    };
    if (open) fetchParent();
    if (!open) setParent(null);
  }, [open, data?.userId]);

  if (!open) return null;

  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    const d = new Date(dateString);
    return isNaN(d) ? "N/A" : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  };

  const renderField = (label, value) => {
    if (value === undefined || value === null || value === "") return null;
    return (
      <p className="mb-2">
        <span className="font-semibold">{label}:</span> {value}
      </p>
    );
  };

  const childName = data
    ? `${data.childFirstName || ""} ${data.childLastName || ""}`.trim()
    : "";

  const pd = parent?.form?.parentDetails || {};
  const fatherName = `${pd.fatherFirstName || ""} ${pd.fatherLastName || ""}`.trim();
  const motherName = `${pd.motherFirstName || ""} ${pd.motherLastName || ""}`.trim();

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50 bg-black bg-opacity-40"
      onClick={onClose}
    >
      <div
        className="relative bg-gray-800 text-gray-400 p-8 pt-16 pr-16 rounded-lg shadow-lg w-full max-w-3xl mx-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        style={{ overflowX: "hidden" }}
      >
        <button
          className="absolute top-2 right-2 text-gray-400 hover:text-white text-3xl"
          onClick={onClose}
        >
          ×
        </button>

        {!data ? (
          <div className="text-center py-8">No order data found.</div>
        ) : (
          <div className="space-y-8">
            <div className="border-b border-gray-700 pb-6">
              <h2 className="text-2xl font-bold text-white mb-6">Order Details</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 break-words">
                {renderField("Meal / Food", data.food)}
                {renderField("Date", formatDate(data.date))}
              </div>
            </div>

            <div className="border-b border-gray-700 pb-6">
              <h2 className="text-2xl font-bold text-white mb-6">Child Details</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 break-words">
                <div>
                  {renderField("Name", childName)}
                  {renderField("Class", data.childClass ? `${data.childClass}${data.section ? " - " + data.section : ""}` : null)}
                  {renderField("Lunch Time", data.lunchTime)}
                </div>
                <div>
                  {renderField("School", data.school)}
                  {renderField("Location", data.location)}
                </div>
              </div>
            </div>

            <div>
              <h2 className="text-2xl font-bold text-white mb-6">Parent Details</h2>
              {loadingParent ? (
                <p>Loading parent details...</p>
              ) : parent ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 break-words">
                  <div>
                    {renderField("Father", fatherName || null)}
                    {renderField("Mother", motherName || null)}
                    {renderField("Mobile", pd.mobile || parent.user?.phone)}
                    {renderField("Email", pd.email || parent.user?.email)}
                  </div>
                  <div>
                    {renderField("Address", pd.address)}
                    {renderField("City", pd.city)}
                    {renderField("State", pd.state)}
                    {renderField("Pincode", pd.pincode)}
                  </div>
                </div>
              ) : (
                <p>No parent details found.</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default OrderViewModal;
