import requests from "./httpServices";

const CategoryServices = {
  getShowingCategory: async () => {
    return requests.get("/category/show");
  },

  getAllSchools: async () => {
    return requests.get("/schools/get-all-schools");
  },

  getChildren: async (userId) => {
    return requests.post("/customer/get-all-children", { userId });
  },

  // Add this new method to get payment details for a user
  getPayments: async (userId) => {
    return requests.post("/customer/get-payments", { userId });
  },
};

export default CategoryServices;
