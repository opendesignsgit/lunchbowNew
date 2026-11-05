import React, { useEffect, useState } from "react";
import { Modal, ModalHeader, ModalBody, ModalFooter, Button, Input, Label, Select, Textarea } from "@windmill/react-ui";

import AdminOpsServices from "@/services/AdminOpsServices";
import { notifySuccess, notifyError } from "@/utils/toast";
import { childName, errMessage } from "@/utils/adminOps";

const STATUSES = ["active", "upcoming", "deactivated"];

/**
 * Edit startDate / endDate / status / workingDays / children of one subscription.
 * Props: open, onClose, subscription, children (all of the customer), onSaved()
 */
const SubscriptionEditModal = ({ open, onClose, subscription, children = [], onSaved }) => {
  const [form, setForm] = useState({ startDate: "", endDate: "", status: "active", workingDays: "", children: [], reason: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && subscription) {
      setForm({
        startDate: subscription.startDateKey || "",
        endDate: subscription.endDateKey || "",
        status: STATUSES.includes(subscription.status) ? subscription.status : "active",
        workingDays: subscription.workingDays ?? "",
        children: (subscription.children || []).map((c) => String(c?._id || c)),
        reason: "",
      });
    }
  }, [open, subscription]);

  const toggleChild = (id) =>
    setForm((f) => ({
      ...f,
      children: f.children.includes(id) ? f.children.filter((c) => c !== id) : [...f.children, id],
    }));

  const save = async () => {
    if (!form.reason.trim()) return notifyError("A reason is required");
    if (!form.children.length) return notifyError("Select at least one child");
    setSaving(true);
    try {
      const body = {
        startDate: form.startDate,
        endDate: form.endDate,
        status: form.status,
        workingDays: Number(form.workingDays),
        children: form.children,
        reason: form.reason.trim(),
      };
      await AdminOpsServices.updateSubscription(subscription._id, body);
      notifySuccess("Subscription updated");
      onSaved && onSaved();
      onClose();
    } catch (err) {
      notifyError(errMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={open} onClose={onClose}>
      <ModalHeader>Edit subscription</ModalHeader>
      <ModalBody>
        {subscription && (
          <div className="space-y-4">
            <p className="text-xs text-gray-500">
              Plan {subscription.planId} · {subscription._id}
            </p>
            <div className="grid grid-cols-2 gap-4">
              <Label>
                <span>Start date</span>
                <Input className="mt-1" type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
              </Label>
              <Label>
                <span>End date</span>
                <Input className="mt-1" type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
              </Label>
              <Label>
                <span>Status</span>
                <Select className="mt-1" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </Select>
              </Label>
              <Label>
                <span>Working days</span>
                <Input className="mt-1" type="number" min="1" value={form.workingDays} onChange={(e) => setForm({ ...form, workingDays: e.target.value })} />
              </Label>
            </div>
            <div>
              <span className="text-sm text-gray-700 dark:text-gray-300">Children on this plan</span>
              <div className="mt-1 space-y-1">
                {children.length === 0 && <p className="text-xs text-gray-400">This customer has no children saved.</p>}
                {children.map((c) => {
                  const id = String(c._id);
                  return (
                    <label key={id} className="flex items-center text-sm gap-2">
                      <input type="checkbox" checked={form.children.includes(id)} onChange={() => toggleChild(id)} />
                      <span>
                        {childName(c)} <span className="text-xs text-gray-400">({c.school} · {c.childClass}-{c.section})</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
            <Label>
              <span>Reason *</span>
              <Textarea className="mt-1" rows="2" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
            </Label>
          </div>
        )}
      </ModalBody>
      <ModalFooter>
        <Button layout="outline" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button onClick={save} disabled={saving}>
          {saving ? "Saving..." : "Save changes"}
        </Button>
      </ModalFooter>
    </Modal>
  );
};

export default SubscriptionEditModal;
