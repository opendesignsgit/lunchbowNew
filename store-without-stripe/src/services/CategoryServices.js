import requests from "./httpServices";

const CategoryServices = {
  getShowingCategory: async () => {
    return requests.get("/category/show");
  },

  getAllSchools: async () => {
    return requests.get("/schools/get-all-schools");
  },
};

export default CategoryServices;
