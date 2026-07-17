import requests from "./httpService";

const AppSettingsServices = {
  // Admin: full settings (pricing + mail)
  getSettings: async () => {
    return requests.get("/settings");
  },

  // Admin: partial update — send { pricing } and/or { mail }
  updateSettings: async (body) => {
    return requests.put("/settings", body);
  },

  // Public pricing only (not used by dashtar, kept for parity/debug)
  getPublicSettings: async () => {
    return requests.get("/settings/public");
  },
};

export default AppSettingsServices;
