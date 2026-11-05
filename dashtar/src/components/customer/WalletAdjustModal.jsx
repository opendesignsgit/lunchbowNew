import React, { useEffect, useState } from "react";
import { Modal, ModalHeader, ModalBody, ModalFooter, Button, Input, Label, Textarea } from "@windmill/react-ui";

import AdminOpsServices from "@/services/AdminOpsServices";
import { notifySuccess, notifyError } from "@/utils/toast";
import { errMessage, inr } from "@/utils/adminOps";

/** POST /admin-ops/wallet/:userId/adjust { change, reason, allowNegative } */
const WalletAdjustModal = ({ open, onClose, userId, currentPoints = 0, onSaved }) => {
  const [form, setForm] = useState({ change: "", reason: "", allowNegative: false });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setForm({ change: "", reason: "", allowNegative: false });
  }, [open]);

  const delta = Number(form.change);
  const after = Number.isFinite(delta) ? Number(currentPoints) + delta : null;

  const save = async () => {
    if (!Number.isFinite(delta) || delta === 0) return notifyError("Enter a non-zero amount (negative to deduct)");
    if (!form.reason.trim()) return notifyError("A reason is required");
    setSaving(true);
    try {
      const res = await AdminOpsServices.adjustWallet(userId, { change: delta, reason: form.reason.trim(), allowNegative: form.allowNegative });
      notifySuccess(`Wallet updated: ${inr(res?.data?.points)}`);
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
      <ModalHeader>Adjust wallet</ModalHeader>
      <ModalBody>
        <p className="text-sm mb-3">
          Current balance: <strong>{inr(currentPoints)}</strong>
          {after != null && form.change !== "" && (
            <span className={`ml-2 ${after < 0 ? "text-red-600" : "text-gray-500"}`}>→ {inr(after)}</span>
          )}
        </p>
        <div className="space-y-4">
          <Label>
            <span>Change (positive adds, negative deducts) *</span>
            <Input className="mt-1" type="number" step="1" value={form.change} onChange={(e) => setForm({ ...form, change: e.target.value })} />
          </Label>
          <Label>
            <span>Reason *</span>
            <Textarea className="mt-1" rows="2" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
          </Label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.allowNegative} onChange={(e) => setForm({ ...form, allowNegative: e.target.checked })} />
            <span>Allow the balance to go negative</span>
          </label>
        </div>
      </ModalBody>
      <ModalFooter>
        <Button layout="outline" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button onClick={save} disabled={saving}>
          {saving ? "Saving..." : "Apply"}
        </Button>
      </ModalFooter>
    </Modal>
  );
};

export default WalletAdjustModal;
