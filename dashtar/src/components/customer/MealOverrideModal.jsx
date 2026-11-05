import React, { useEffect, useState } from "react";
import { Modal, ModalHeader, ModalBody, ModalFooter, Button, Input, Label, Select, Textarea } from "@windmill/react-ui";

import AdminOpsServices from "@/services/AdminOpsServices";
import { notifySuccess, notifyError } from "@/utils/toast";
import { childName, errMessage, todayKey } from "@/utils/adminOps";

const ACTIONS = [
  { value: "set", label: "Set / replace meal" },
  { value: "delete", label: "Cancel meal" },
  { value: "restore", label: "Restore cancelled meal" },
];

/**
 * POST /admin-ops/meals/override.
 * Props: open, onClose, userId, subscriptions, children, initial { subscriptionId, childId, date, action, mealName }, onSaved()
 */
const MealOverrideModal = ({ open, onClose, userId, subscriptions = [], children = [], initial, onSaved }) => {
  const [form, setForm] = useState({ subscriptionId: "", childId: "", date: todayKey(), action: "set", mealName: "", creditWallet: false, reason: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const firstSub = subscriptions.find((s) => s.status === "active") || subscriptions[0];
    setForm({
      subscriptionId: initial?.subscriptionId || (firstSub ? String(firstSub._id) : ""),
      childId: initial?.childId || (children[0] ? String(children[0]._id) : ""),
      date: initial?.date || todayKey(),
      action: initial?.action || "set",
      mealName: initial?.mealName || "",
      creditWallet: false,
      reason: "",
    });
  }, [open, initial, subscriptions, children]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  const save = async () => {
    if (!form.reason.trim()) return notifyError("A reason is required");
    if (form.action === "set" && !form.mealName.trim()) return notifyError("Meal name is required for set");
    setSaving(true);
    try {
      const res = await AdminOpsServices.overrideMeal({
        userId,
        subscriptionId: form.subscriptionId,
        childId: form.childId,
        date: form.date,
        action: form.action,
        mealName: form.action === "set" ? form.mealName.trim() : undefined,
        creditWallet: form.action === "set" ? false : Boolean(form.creditWallet),
        reason: form.reason.trim(),
      });
      const w = res?.data?.wallet;
      notifySuccess(`Meal ${form.action === "set" ? "saved" : form.action + "d"}${w ? ` · wallet ${w.change > 0 ? "+" : ""}${w.change} → ${w.points}` : ""}`);
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
      <ModalHeader>Override meal</ModalHeader>
      <ModalBody>
        <div className="grid grid-cols-2 gap-4">
          <Label className="col-span-2">
            <span>Subscription</span>
            <Select className="mt-1" value={form.subscriptionId} onChange={set("subscriptionId")}>
              {subscriptions.map((s) => (
                <option key={s._id} value={String(s._id)}>
                  {s.status} · {s.startDateKey} → {s.endDateKey} ({s.planId})
                </option>
              ))}
            </Select>
          </Label>
          <Label>
            <span>Child</span>
            <Select className="mt-1" value={form.childId} onChange={set("childId")}>
              {children.map((c) => (
                <option key={c._id} value={String(c._id)}>
                  {childName(c)}
                </option>
              ))}
            </Select>
          </Label>
          <Label>
            <span>Date</span>
            <Input className="mt-1" type="date" value={form.date} onChange={set("date")} />
          </Label>
          <Label>
            <span>Action</span>
            <Select className="mt-1" value={form.action} onChange={set("action")}>
              {ACTIONS.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </Select>
          </Label>
          {form.action === "set" ? (
            <Label>
              <span>Meal name *</span>
              <Input className="mt-1" value={form.mealName} onChange={set("mealName")} />
            </Label>
          ) : (
            <label className="flex items-center gap-2 mt-6 text-sm">
              <input type="checkbox" checked={form.creditWallet} onChange={set("creditWallet")} />
              <span>{form.action === "delete" ? "Credit wallet (one day's price)" : "Debit wallet (one day's price)"}</span>
            </label>
          )}
          <Label className="col-span-2">
            <span>Reason *</span>
            <Textarea className="mt-1" rows="2" value={form.reason} onChange={set("reason")} />
          </Label>
        </div>
      </ModalBody>
      <ModalFooter>
        <Button layout="outline" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button onClick={save} disabled={saving || !form.subscriptionId || !form.childId}>
          {saving ? "Saving..." : "Apply"}
        </Button>
      </ModalFooter>
    </Modal>
  );
};

export default MealOverrideModal;
