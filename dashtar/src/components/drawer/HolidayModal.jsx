import { useState, useEffect } from "react";
import {
  Button,
  Input,
  Label,
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from "@windmill/react-ui";
import { useTranslation } from "react-i18next";
import HolidayServices from "@/services/HolidayServices";

const HolidayModal = ({ isOpen, onClose, holiday }) => {
  const { t } = useTranslation();
  const [formData, setFormData] = useState({ date: "", name: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Two-phase flow: fill form -> preview impact -> confirm apply
  const [impact, setImpact] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (holiday) {
      const formattedDate = new Date(holiday.date).toISOString().split("T")[0];
      setFormData({ date: formattedDate, name: holiday.name });
    } else {
      setFormData({ date: "", name: "" });
    }
    setImpact(null);
    setError("");
  }, [holiday, isOpen]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  // Step 1 — fetch impact preview (writes nothing)
  const handlePreview = async (e) => {
    e.preventDefault();
    setError("");
    setLoadingPreview(true);
    try {
      const res = await HolidayServices.previewImpact({
        date: formData.date,
        action: "add",
      });
      setImpact(res?.data || res);
    } catch (err) {
      setError(err?.response?.data?.message || err.message);
    } finally {
      setLoadingPreview(false);
    }
  };

  // Step 2 — confirm and save + apply
  const handleConfirm = async () => {
    setIsSubmitting(true);
    setError("");
    try {
      const body = {
        date: formData.date,
        name: formData.name,
        applySubscriptions: true,
      };
      const response = holiday
        ? await HolidayServices.updateHoliday(holiday._id, body)
        : await HolidayServices.addHoliday(body);

      if (response.success) {
        onClose(true);
      } else {
        setError(response.message || "Failed to save holiday");
      }
    } catch (err) {
      setError(err?.response?.data?.message || err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const changes = impact?.changes || [];

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <ModalHeader>
        {holiday ? t("Update Holiday") : t("Add Holiday")}
      </ModalHeader>

      {/* STEP 1: form */}
      {!impact && (
        <form onSubmit={handlePreview}>
          <ModalBody>
            <div className="grid gap-4">
              <Label>
                <span>{t("Date")} *</span>
                <Input
                  className="mt-1"
                  type="date"
                  name="date"
                  value={formData.date}
                  onChange={handleChange}
                  required
                />
              </Label>

              <Label>
                <span>{t("Holiday Name")} *</span>
                <Input
                  className="mt-1"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  placeholder="e.g. New Year's Day"
                  required
                />
              </Label>

              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>
          </ModalBody>
          <ModalFooter>
            <Button
              layout="outline"
              type="button"
              onClick={onClose}
              disabled={loadingPreview}
            >
              {t("Cancel")}
            </Button>
            <Button type="submit" disabled={loadingPreview || !formData.date}>
              {loadingPreview ? "Checking impact..." : "Preview impact"}
            </Button>
          </ModalFooter>
        </form>
      )}

      {/* STEP 2: impact preview + confirm */}
      {impact && (
        <>
          <ModalBody>
            <div className="mb-3">
              <p className="font-semibold">
                {holiday ? "Updating" : "Adding"} holiday on {formData.date}
                {formData.name ? ` (${formData.name})` : ""}
              </p>
            </div>

            {impact.weekend ? (
              <p className="text-sm text-gray-600">
                This date is a weekend — no delivery day is lost, so no
                subscription is affected.
              </p>
            ) : impact.past ? (
              <p className="text-sm text-gray-600">
                This date is in the past — existing subscriptions are not
                changed.
              </p>
            ) : changes.length === 0 ? (
              <p className="text-sm text-gray-600">
                No active subscriptions are affected by this holiday.
              </p>
            ) : (
              <div>
                <p className="text-sm mb-2">
                  <strong>{changes.length}</strong> subscription
                  {changes.length > 1 ? "s" : ""} will be extended by one
                  working day (each child's meal pulled to the new end day):
                </p>
                <div className="max-h-64 overflow-auto border rounded">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left bg-gray-100 dark:bg-gray-700">
                        <th className="p-2">Customer</th>
                        <th className="p-2">Phone</th>
                        <th className="p-2">End date</th>
                        <th className="p-2">Meals moved</th>
                      </tr>
                    </thead>
                    <tbody>
                      {changes.map((c) => (
                        <tr key={c.subscriptionId} className="border-t">
                          <td className="p-2">{c.customerName || "-"}</td>
                          <td className="p-2">{c.phone || "-"}</td>
                          <td className="p-2">
                            {new Date(c.endDateBefore)
                              .toISOString()
                              .slice(0, 10)}{" "}
                            →{" "}
                            <strong>
                              {new Date(c.endDateAfter)
                                .toISOString()
                                .slice(0, 10)}
                            </strong>
                          </td>
                          <td className="p-2">
                            {c.mealsMoved && c.mealsMoved.length
                              ? `${c.mealsMoved.length} meal${
                                  c.mealsMoved.length > 1 ? "s" : ""
                                } → ${c.mealsMoved[0].to}`
                              : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
          </ModalBody>
          <ModalFooter>
            <Button
              layout="outline"
              type="button"
              onClick={() => setImpact(null)}
              disabled={isSubmitting}
            >
              {t("Back")}
            </Button>
            <Button type="button" onClick={handleConfirm} disabled={isSubmitting}>
              {isSubmitting
                ? "Applying..."
                : changes.length > 0
                ? `Confirm & extend ${changes.length}`
                : "Confirm"}
            </Button>
          </ModalFooter>
        </>
      )}
    </Modal>
  );
};

export default HolidayModal;
