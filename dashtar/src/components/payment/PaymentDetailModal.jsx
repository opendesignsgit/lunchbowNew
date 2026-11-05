import React, { useEffect, useState } from "react";
import {
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Badge,
  Input,
  Label,
  Textarea,
} from "@windmill/react-ui";
import { Link } from "react-router-dom";

import PaymentServices from "@/services/PaymentServices";
import ConfirmModal from "@/components/modal/ConfirmModal";
import { notifySuccess, notifyError } from "@/utils/toast";
import { fmtDateTime, inr, paymentBadgeType, errMessage } from "@/utils/adminOps";

const Field = ({ label, children }) => (
  <div className="mb-2">
    <span className="block text-xs uppercase tracking-wide text-gray-500">{label}</span>
    <span className="text-sm text-gray-800 dark:text-gray-200 break-all">{children ?? "-"}</span>
  </div>
);

const CONFIRMABLE = ["created", "processing", "expired", "failed"];

/**
 * Full view of one payment intent with the admin actions.
 * Props: orderId, open, onClose, statusApiEnabled, onChanged() → parent refreshes the list.
 */
const PaymentDetailModal = ({ orderId, open, onClose, statusApiEnabled, onChanged }) => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState("");
  const [confirmForm, setConfirmForm] = useState({ trackingId: "", amount: "", note: "" });
  const [showConfirmForm, setShowConfirmForm] = useState(false);
  const [askConfirm, setAskConfirm] = useState(false);
  const [askRetry, setAskRetry] = useState(false);

  const load = async () => {
    if (!orderId) return;
    setLoading(true);
    try {
      const res = await PaymentServices.get(orderId);
      setData(res?.data || null);
      setConfirmForm({ trackingId: "", amount: res?.data?.intent?.amount ?? "", note: "" });
    } catch (err) {
      notifyError(errMessage(err));
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      setShowConfirmForm(false);
      load();
    } else {
      setData(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, orderId]);

  const intent = data?.intent;
  const changed = () => {
    load();
    if (onChanged) onChanged();
  };

  const handleReconcile = async () => {
    setBusy("reconcile");
    try {
      const res = await PaymentServices.reconcile(orderId);
      notifySuccess(res?.message || `Status: ${res?.status}`);
      changed();
    } catch (err) {
      notifyError(errMessage(err));
    } finally {
      setBusy("");
    }
  };

  const handleConfirm = async () => {
    setBusy("confirm");
    try {
      const res = await PaymentServices.confirm(orderId, {
        trackingId: confirmForm.trackingId.trim(),
        amount: confirmForm.amount === "" ? undefined : Number(confirmForm.amount),
        note: confirmForm.note.trim(),
      });
      if (res?.success) {
        notifySuccess(`Payment confirmed (${res.status})${res.applyError ? ` — apply error: ${res.applyError}` : ""}`);
      } else {
        notifyError(res?.message || `Settled as ${res?.status}${res?.applyError ? `: ${res.applyError}` : ""}`);
      }
      setAskConfirm(false);
      setShowConfirmForm(false);
      changed();
    } catch (err) {
      notifyError(errMessage(err));
      setAskConfirm(false);
    } finally {
      setBusy("");
    }
  };

  const handleRetry = async () => {
    setBusy("retry");
    try {
      const res = await PaymentServices.retryApply(orderId);
      notifySuccess(res?.message || "Applied");
      setAskRetry(false);
      changed();
    } catch (err) {
      notifyError(errMessage(err));
      setAskRetry(false);
    } finally {
      setBusy("");
    }
  };

  const confirmFormValid =
    confirmForm.trackingId.trim().length > 0 &&
    confirmForm.note.trim().length > 0 &&
    (confirmForm.amount === "" || Number(confirmForm.amount) > 0);

  const user = intent?.user && typeof intent.user === "object" ? intent.user : null;

  return (
    <>
      <Modal isOpen={open} onClose={onClose} className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <ModalHeader>
          Payment {orderId}
          {intent && (
            <Badge type={paymentBadgeType(intent.status)} className="ml-3 align-middle">
              {intent.status}
            </Badge>
          )}
        </ModalHeader>
        <ModalBody>
          {loading || !intent ? (
            <p className="py-6 text-center">{loading ? "Loading..." : "No data"}</p>
          ) : (
            <div className="space-y-6">
              {intent.applyError && (
                <div className="p-3 rounded bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-sm">
                  <strong>Money captured but applying it failed:</strong> {intent.applyError}
                </div>
              )}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6">
                <Field label="Customer">
                  {user ? (
                    <Link className="text-emerald-600 hover:underline" to={`/customers/${user._id}`}>
                      {user.name || user.email || user._id}
                    </Link>
                  ) : (
                    String(intent.user || "-")
                  )}
                  {user?.phone && <div className="text-xs text-gray-500">{user.phone}</div>}
                  {user?.email && <div className="text-xs text-gray-500">{user.email}</div>}
                </Field>
                <Field label="Type">{intent.type}</Field>
                <Field label="Source">{intent.source}</Field>
                <Field label="Amount">{inr(intent.amount)}</Field>
                <Field label="Charged">{intent.chargedAmount != null ? inr(intent.chargedAmount) : "-"}</Field>
                <Field label="Tracking id">{intent.trackingId || "-"}</Field>
                <Field label="Created">{fmtDateTime(intent.createdAt)}</Field>
                <Field label="Settled">{intent.settledAt ? fmtDateTime(intent.settledAt) : "-"}</Field>
                <Field label="Settled via">{intent.settledVia || "-"}</Field>
                <Field label="Payment mode">{intent.paymentMode || "-"}</Field>
                <Field label="Gateway status">{intent.gatewayStatus || "-"}</Field>
                <Field label="Attempts / last check">
                  {intent.attempts ?? 0}
                  {intent.lastCheckedAt ? ` · ${fmtDateTime(intent.lastCheckedAt)}` : ""}
                </Field>
                <div className="col-span-2 md:col-span-3">
                  <Field label="Status message">{intent.statusMessage || "-"}</Field>
                </div>
                {intent.note && (
                  <div className="col-span-2 md:col-span-3">
                    <Field label="Admin note">{intent.note}</Field>
                  </div>
                )}
              </div>

              {intent.meta && Object.keys(intent.meta).length > 0 && (
                <details>
                  <summary className="cursor-pointer text-sm font-medium text-gray-600 dark:text-gray-300">
                    Intent meta (plan snapshot, children, holiday meals)
                  </summary>
                  <pre className="mt-2 p-3 text-xs bg-gray-100 dark:bg-gray-900 rounded overflow-x-auto max-h-64">
                    {JSON.stringify(intent.meta, null, 2)}
                  </pre>
                </details>
              )}

              <div>
                <h4 className="font-semibold text-gray-700 dark:text-gray-300 mb-2">
                  Gateway records ({data.gatewayRecords?.length || 0})
                </h4>
                {data.gatewayRecords?.length ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-left text-gray-500">
                          <th className="py-1 pr-3">Date</th>
                          <th className="py-1 pr-3">Status</th>
                          <th className="py-1 pr-3">Amount</th>
                          <th className="py-1 pr-3">Tracking</th>
                          <th className="py-1 pr-3">Mode</th>
                          <th className="py-1 pr-3">Message</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.gatewayRecords.map((g, i) => (
                          <tr key={i} className="border-t border-gray-100 dark:border-gray-700">
                            <td className="py-1 pr-3 whitespace-nowrap">{fmtDateTime(g.payment_date || g.createdAt)}</td>
                            <td className="py-1 pr-3">{g.order_status}</td>
                            <td className="py-1 pr-3">{inr(g.amount)}</td>
                            <td className="py-1 pr-3">{g.tracking_id || "-"}</td>
                            <td className="py-1 pr-3">{g.payment_mode || "-"}</td>
                            <td className="py-1 pr-3">{g.status_message || "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-xs text-gray-500">No gateway record stored for this order.</p>
                )}
              </div>

              {intent.type === "holiday" && (
                <div>
                  <h4 className="font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    Holiday meals ({data.holidayMeals?.length || 0})
                  </h4>
                  {data.holidayMeals?.length ? (
                    <ul className="text-xs space-y-1">
                      {data.holidayMeals.map((h) => (
                        <li key={h._id}>
                          {h.mealDate} · {h.mealName || "-"} · {h.paymentStatus} · {inr(h.amount)}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-gray-500">No holiday meal records.</p>
                  )}
                </div>
              )}

              {showConfirmForm && (
                <div className="p-4 rounded border border-emerald-300 bg-emerald-50 dark:bg-gray-900 dark:border-gray-700">
                  <h4 className="font-semibold mb-3 text-gray-800 dark:text-gray-200">Confirm payment manually</h4>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
                    Only after you verified this order as <strong>Success</strong> in the CCAvenue dashboard. This settles the
                    intent and applies the plan / wallet effect exactly as a gateway callback would.
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Label>
                      <span>Tracking id (from CCAvenue) *</span>
                      <Input
                        className="mt-1"
                        value={confirmForm.trackingId}
                        onChange={(e) => setConfirmForm((f) => ({ ...f, trackingId: e.target.value }))}
                      />
                    </Label>
                    <Label>
                      <span>Amount charged</span>
                      <Input
                        className="mt-1"
                        type="number"
                        min="0"
                        step="0.01"
                        value={confirmForm.amount}
                        onChange={(e) => setConfirmForm((f) => ({ ...f, amount: e.target.value }))}
                      />
                    </Label>
                    <Label className="md:col-span-2">
                      <span>Note (why / where verified) *</span>
                      <Textarea
                        className="mt-1"
                        rows="2"
                        value={confirmForm.note}
                        onChange={(e) => setConfirmForm((f) => ({ ...f, note: e.target.value }))}
                      />
                    </Label>
                  </div>
                  <div className="flex justify-end gap-2 mt-3">
                    <Button layout="outline" size="small" onClick={() => setShowConfirmForm(false)}>
                      Cancel
                    </Button>
                    <Button size="small" disabled={!confirmFormValid} onClick={() => setAskConfirm(true)}>
                      Confirm payment
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </ModalBody>
        <ModalFooter>
          <Button layout="outline" onClick={onClose}>
            Close
          </Button>
          {intent && (
            <>
              <span title={statusApiEnabled ? "Ask CCAvenue for the current status of this order" : "CCAvenue status API is not enabled on the server (CCAV_STATUS_API_ENABLED). Verify in the CCAvenue dashboard and use Confirm payment."}>
                <Button
                  layout="outline"
                  disabled={!statusApiEnabled || busy !== ""}
                  onClick={handleReconcile}
                >
                  {busy === "reconcile" ? "Checking..." : "Check with CCAvenue"}
                </Button>
              </span>
              {CONFIRMABLE.includes(intent.status) && (
                <Button disabled={busy !== ""} onClick={() => setShowConfirmForm((v) => !v)}>
                  Confirm payment
                </Button>
              )}
              {intent.applyError && (
                <Button className="bg-amber-600 hover:bg-amber-700" disabled={busy !== ""} onClick={() => setAskRetry(true)}>
                  Retry apply
                </Button>
              )}
            </>
          )}
        </ModalFooter>
      </Modal>

      <ConfirmModal
        open={askConfirm}
        title="Confirm this payment?"
        body={
          <span>
            Order <strong>{orderId}</strong> will be marked paid with tracking id <strong>{confirmForm.trackingId}</strong>
            {confirmForm.amount !== "" ? ` for ${inr(confirmForm.amount)}` : ""} and its plan / wallet effect applied. This
            cannot be undone from the dashboard.
          </span>
        }
        confirmText="Yes, confirm payment"
        loading={busy === "confirm"}
        onConfirm={handleConfirm}
        onClose={() => setAskConfirm(false)}
      />
      <ConfirmModal
        open={askRetry}
        title="Retry applying this payment?"
        body={`Re-run the business effect (subscription / wallet / holiday meals) for ${orderId}.`}
        confirmText="Retry apply"
        loading={busy === "retry"}
        onConfirm={handleRetry}
        onClose={() => setAskRetry(false)}
      />
    </>
  );
};

export default PaymentDetailModal;
