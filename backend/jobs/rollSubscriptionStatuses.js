/**
 * Daily (00:15 IST): expire active plans that ended and promote the next upcoming
 * plan, collection-wide. Delegates to customerController.activateNextSubscriptionPlans
 * so the rule lives in one place. job.error is raised by scheduler.runJob on failure.
 */
const runRollSubscriptionStatuses = async () => {
  // Required lazily: customerController pulls in the whole customer stack.
  const { activateNextSubscriptionPlans } = require("../controller/customerController");
  const result = await activateNextSubscriptionPlans();
  console.log("[rollSubscriptionStatuses]", JSON.stringify(result));
  return result;
};

module.exports = { runRollSubscriptionStatuses };
