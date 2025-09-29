import requests from "./httpServices";

const AccountServices = {
  getAccountDetails: async (userId, updateData = null) => {
    const body = { userId };
    if (updateData) {
      body.updateField = updateData.field;
      body.updateValue = updateData.value;
    }
    return requests.post("/customer/account-details", body);
  },

  // You can add other account-related API calls here
  // For example:
  updateProfile: async (userId, profileData) => {
    return requests.put(`/customer/profile/${userId}`, profileData);
  },

  // Add more account-related methods as needed
};

export default AccountServices;