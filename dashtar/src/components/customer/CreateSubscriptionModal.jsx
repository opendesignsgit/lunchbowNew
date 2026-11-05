import React, { useEffect, useState } from "react";
import { Modal, ModalHeader, ModalBody, ModalFooter, Button, Input, Label, Select, Textarea } from "@windmill/react-ui";

import AdminOpsServices from "@/services/AdminOpsServices";
import { notifySuccess, notifyError } from "@/utils/toast";
import { childName, errMessage, todayKey, addDays } from "@/utils/adminOps";

const STATUSES = ["active", "upcoming", "deactivated"];
const PLAN_PRESETS = [
  { id: "oneMonth", label: "1 month" },
  { id: "threeMonths", label: "3 months" },
  { id: "sixMonths", label: "6 months" },
];

const empty = () => ({
  planId: "oneMonth",
  startDate: todayKey(),
  endDate: addDays(todayKey(), 30),
  workingDays: "",
  price: "",
  status: "active",
  children: [],
  orderId: "",
  paymentAmount: "",
  paymentMethod: "Manual",
  note: "",
});

/**
 * Manual subscription for repairs (customer paid but no plan exists).
 * Props: open, onClose, userId, childList, onSaved()
 */
const CreateSubscriptionModal = ({ open, onClose, userId, childList = [], onSaved }) => {
  const [form, setForm] = useState(empty());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setForm(empty());
  }, [open]);

  const toggleChild = (id) =>
    setForm((f) => ({
      ...f,
      children: f.children.includes(id) ? f.children.filter((c) => c !== id) : [...f.children, id],
    }));

  const save = async () => {
    if (!form.childList.length) return notifyError("Select at least one child");
    if (!form.workingDays || !form.price) return notifyError("Working days and price are required");
    setSaving(true);
    try {
      const body = {
        userId,
        planId: form.planId,
        startDate: form.startDate,
        endDate: form.endDate,
        workingDays: Number(form.workingDays),
        price: Number(form.price),
        status: form.status,
        children: form.children,
        note: form.note.trim(),
      };
      if (form.orderId.trim()) body.orderId = form.orderId.trim();
      if (form.paymentAmount !== "") body.paymentAmount = Number(form.paymentAmount);
      if (form.paymentMethod.trim()) body.paymentMethod = form.paymentMethod.trim();
      await AdminOpsServices.createSubscription(body);
      notifySuccess("Subscription created");
      onSaved && onSaved();
      onClose();
    } catch (err) {
      notifyError(errMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <Modal isOpen={open} onClose={onClose}>
      <ModalHeader>Create subscription manually</ModalHeader>
      <ModalBody>
        <p className="text-xs text-gray-500 mb-3">
          For repairs only: use when a customer paid but no plan was created. The form is marked paid and the plan
          is linked exactly like a gateway settlement.
        </p>
        <div className="grid grid-cols-2 gap-4">
          <Label>
            <span>Plan</span>
            <Select className="mt-1" value={form.planId} onChange={set("planId")}>
              {PLAN_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label} ({p.id})
                </option>
              ))}
            </Select>
          </Label>
          <Label>
            <span>Status</span>
            <Select className="mt-1" value={form.status} onChange={set("status")}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </Label>
          <Label>
            <span>Start date</span>
            <Input className="mt-1" type="date" value={form.startDate} onChange={set("startDate")} />
          </Label>
          <Label>
            <span>End date</span>
            <Input className="mt-1" type="date" value={form.endDate} onChange={set("endDate")} />
          </Label>
          <Label>
            <span>Working days *</span>
            <Input className="mt-1" type="number" min="1" value={form.workingDays} onChange={set("workingDays")} />
          </Label>
          <Label>
            <span>Price (₹) *</span>
            <Input className="mt-1" type="number" min="0" value={form.price} onChange={set("price")} />
          </Label>
          <Label>
            <span>Order id (optional)</span>
            <Input className="mt-1" value={form.orderId} onChange={set("orderId")} placeholder="auto ADMIN-…" />
          </Label>
          <Label>
            <span>Payment amount (optional)</span>
            <Input className="mt-1" type="number" min="0" value={form.paymentAmount} onChange={set("paymentAmount")} />
          </Label>
          <Label className="col-span-2">
            <span>Payment method</span>
            <Input className="mt-1" value={form.paymentMethod} onChange={set("paymentMethod")} />
          </Label>
        </div>
        <div className="mt-4">
          <span className="text-sm text-gray-700 dark:text-gray-300">Children *</span>
          <div className="mt-1 space-y-1">
            {childList.length === 0 && <p className="text-xs text-gray-400">This customer has no children saved.</p>}
            {childList.map((c) => {
              const id = String(c._id);
              return (
                <label key={id} className="flex items-center text-sm gap-2">
                  <input type="checkbox" checked={form.children.includes(id)} onChange={() => toggleChild(id)} />
                  <span>
                    {childName(c)} <span className="text-xs text-gray-400">({c.school})</span>
                  </span>
                </label>
              );
            })}
          </div>
        </div>
        <Label className="mt-4 block">
          <span>Note</span>
          <Textarea className="mt-1" rows="2" value={form.note} onChange={set("note")} />
        </Label>
      </ModalBody>
      <ModalFooter>
        <Button layout="outline" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button onClick={save} disabled={saving}>
          {saving ? "Creating..." : "Create subscription"}
        </Button>
      </ModalFooter>
    </Modal>
  );
};

export default CreateSubscriptionModal;
