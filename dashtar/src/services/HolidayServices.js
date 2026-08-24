import requests from "./httpService";

const HolidayServices = {
  getAllHolidays: async () => {
    const response = await requests.get("/holidays/get-all-holidays");
    // Ensure we always return an array
    return response.data || [];
  },

  previewImpact: async (body) => {
    // body: { date: "YYYY-MM-DD", action: "add" | "delete" }
    return requests.post("/holidays/preview-impact", body);
  },

  addHoliday: async (body) => {
    return requests.post("/holidays/add-holiday", body);
  },

  updateHoliday: async (id, body) => {
    return requests.put(`/holidays/update-holiday/${id}`, body);
  },

  deleteHoliday: async (id) => {
    return requests.delete(`/holidays/delete-holiday/${id}`);
  },
};

export default HolidayServices;