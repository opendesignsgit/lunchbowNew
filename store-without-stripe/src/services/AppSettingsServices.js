import requests from "./httpServices";

/**
 * Public pricing settings (admin-controlled via Dashtar → Settings).
 * Mail config is never exposed here.
 */
const AppSettingsServices = {
  getPublicSettings: async () => {
    return requests.get("/settings/public");
  },
};

export default AppSettingsServices;
