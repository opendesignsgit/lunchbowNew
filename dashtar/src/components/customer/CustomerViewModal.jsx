import React, { useEffect, useState } from "react";
import CustomerServices from "@/services/CustomerServices";

const CustomerViewModal = ({ open, onClose, id }) => {
  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchCustomer = async () => {
      if (open && id) {
        setLoading(true);
        try {
          const res = await CustomerServices.getCustomerById(id);
          setCustomer(res);
        } catch (error) {
          console.error("Error fetching customer data:", error);
        } finally {
          setLoading(false);
        }
      }
    };

    if (open) fetchCustomer();
  }, [open, id]);

  if (!open) return null;

  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    const date = new Date(dateString);
    return date.toLocaleDateString();
  };

  const formatTime = (timeString) => {
    if (!timeString) return "N/A";
    return timeString;
  };

  const renderField = (label, value) => {
    if (value === undefined || value === null || value === "") return null;
    return (
      <p className="mb-2">
        <span className="font-semibold">{label}:</span> {value}
      </p>
    );
  };

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

        {loading ? (
          <div className="text-center py-8">Loading...</div>
        ) : customer ? (
          <div className="space-y-8">
            {/* User Information - Always present */}
            <div className="border-b border-gray-700 pb-6">
              <h2 className="text-2xl font-bold text-white mb-6">
                User Information
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 break-words">
                <div>
                  {renderField("Name", customer.user?.name)}
                  {renderField("Email", customer.user?.email)}
                </div>
                <div>
                  {renderField("Phone", customer.user?.phone)}
                  {/* {renderField("User ID", customer.user?._id)} */}
                </div>
                {/* <div>
                  {renderField(
                    "Created At",
                    customer.user?.createdAt &&
                      new Date(customer.user.createdAt).toLocaleString()
                  )}
                  {renderField(
                    "Updated At",
                    customer.user?.updatedAt &&
                      new Date(customer.user.updatedAt).toLocaleString()
                  )}
                </div> */}
              </div>
            </div>

            {/* Parent Details - Only if form exists */}
            {customer.form && (
              <div className="border-b border-gray-700 pb-6">
                <h2 className="text-2xl font-bold text-white mb-6">
                  Parent Details
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 break-words">
                  <div>
                    {customer.form.parentDetails && (
                      <>
                        {renderField(
                          "Father",
                          `${
                            customer.form.parentDetails.fatherFirstName || ""
                          } ${
                            customer.form.parentDetails.fatherLastName || ""
                          }`.trim() || null
                        )}
                        {renderField(
                          "Mother",
                          `${
                            customer.form.parentDetails.motherFirstName || ""
                          } ${
                            customer.form.parentDetails.motherLastName || ""
                          }`.trim() || null
                        )}
                      </>
                    )}
                  </div>
                  <div>
                    {customer.form.parentDetails && (
                      <>
                        {renderField(
                          "Mobile",
                          customer.form.parentDetails.mobile
                        )}
                        {renderField(
                          "Email",
                          customer.form.parentDetails.email
                        )}
                      </>
                    )}
                  </div>
                  <div>
                    {customer.form.parentDetails?.address &&
                      renderField(
                        "Address",
                        customer.form.parentDetails.address
                      )}
                  </div>
                </div>
              </div>
            )}

            {/* Subscription Plan - Only if form and subscriptionPlan exist */}
            {customer.form?.subscriptionPlan && (
              <div className="border-b border-gray-700 pb-6">
                <h2 className="text-2xl font-bold text-white mb-6">
                  Subscription Plan
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 break-words">
                  <div>
                    {renderField(
                      "Plan ID",
                      customer.form.subscriptionPlan.planId
                    )}
                    {renderField(
                      "Start Date",
                      formatDate(customer.form.subscriptionPlan.startDate)
                    )}
                  </div>
                  <div>
                    {renderField(
                      "End Date",
                      formatDate(customer.form.subscriptionPlan.endDate)
                    )}
                    {renderField(
                      "Working Days",
                      customer.form.subscriptionPlan.workingDays
                    )}
                  </div>
                  <div>
                    {renderField(
                      "Price",
                      customer.form.subscriptionPlan.price &&
                        `₹${customer.form.subscriptionPlan.price.toLocaleString()}`
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Children - Only if form and children exist */}
            {customer.form?.children && customer.form.children.length > 0 && (
              <div>
                <h2 className="text-2xl font-bold text-white mb-6">
                  Children ({customer.form.children.length})
                </h2>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {customer.form.children.map((child, index) => (
                    <div
                      key={child._id}
                      className="bg-gray-700 p-6 rounded-lg break-words"
                    >
                      <h3 className="font-bold text-xl text-white mb-4">
                        {index + 1}. {child.childFirstName}{" "}
                        {child.childLastName}
                      </h3>
                      <div className="space-y-2">
                        {renderField("Date of Birth", formatDate(child.dob))}
                        {renderField("Lunch Time", formatTime(child.lunchTime))}
                        {renderField("Allergies", child.allergies || "None")}
                        {renderField("School", child.school)}
                        {renderField("Location", child.location)}
                        {renderField(
                          "Class",
                          child.childClass &&
                            `${child.childClass}${
                              child.section ? ` - Section ${child.section}` : ""
                            }`
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-8">No customer data found.</div>
        )}
      </div>
    </div>
  );
};

export default CustomerViewModal;
