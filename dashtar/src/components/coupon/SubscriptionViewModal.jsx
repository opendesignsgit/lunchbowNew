import React from "react";

// Displays the full details of a single subscription row.
// `data` is the subscription object already loaded in the table (no fetch needed):
//   { parentDetails, subscriptionDetails, children[], paymentStatus, step }
const SubscriptionViewModal = ({ open, onClose, data }) => {
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

  const parent = data?.parentDetails || {};
  const sub = data?.subscriptionDetails || {};
  const children = data?.children || [];

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50 bg-black bg-opacity-40"
      onClick={onClose}
    >
      <div
        className="relative bg-gray-800 text-gray-400 p-8 pt-16 pr-16 rounded-lg shadow-lg w-full max-w-4xl mx-4 max-h-[90vh] overflow-y-auto"
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
          <div className="text-center py-8">No subscription data found.</div>
        ) : (
          <div className="space-y-8">
            {/* Parent / Contact */}
            <div className="border-b border-gray-700 pb-6">
              <h2 className="text-2xl font-bold text-white mb-6">Parent Details</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 break-words">
                <div>
                  {renderField("Name", parent.name)}
                  {renderField("Mobile", parent.mobile)}
                  {renderField("Email", parent.email)}
                </div>
                <div>
                  {renderField("Address", parent.address)}
                  {renderField("City", parent.city)}
                  {renderField("Pincode", parent.pincode)}
                </div>
                <div>
                  {renderField("State", parent.state)}
                  {renderField("Country", parent.country)}
                  {renderField("Payment Status", data.paymentStatus)}
                </div>
              </div>
            </div>

            {/* Subscription */}
            <div className="border-b border-gray-700 pb-6">
              <h2 className="text-2xl font-bold text-white mb-6">Subscription</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 break-words">
                {renderField("Plan ID", sub.planId)}
                {renderField("Status", sub.status)}
                {renderField("Price", sub.price != null ? `₹${sub.price}` : null)}
                {renderField("Start Date", formatDate(sub.startDate))}
                {renderField("End Date", formatDate(sub.endDate))}
                {renderField("Working Days", sub.workingDays)}
                {renderField("Payment Amount", sub.paymentAmount != null ? `₹${sub.paymentAmount}` : null)}
                {renderField("Payment Date", sub.paymentDate ? formatDate(sub.paymentDate) : null)}
                {renderField("Payment Method", sub.paymentMethod)}
                {renderField("Transaction ID", sub.transactionId)}
              </div>
            </div>

            {/* Children */}
            <div>
              <h2 className="text-2xl font-bold text-white mb-6">
                Children ({children.length})
              </h2>
              {children.length === 0 ? (
                <p>No children linked to this subscription.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {children.map((child, i) => (
                    <div key={child.childId || i} className="p-4 bg-gray-700 rounded">
                      <p className="font-bold text-white mb-2">
                        {i + 1}. {child.name}
                      </p>
                      {renderField("Class", child.class ? `${child.class}${child.section ? " - " + child.section : ""}` : null)}
                      {renderField("School", child.school)}
                      {renderField("Location", child.location)}
                      {renderField("Lunch Time", child.lunchTime)}
                      {renderField("DOB", child.dob ? formatDate(child.dob) : null)}
                      {renderField("Allergies", child.allergies)}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SubscriptionViewModal;
