import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardBody, Button, Badge } from "@windmill/react-ui";
import { Link, useParams } from "react-router-dom";
import { FiArrowLeft, FiEdit, FiRefreshCw } from "react-icons/fi";

import PageTitle from "@/components/Typography/PageTitle";
import SubscriptionEditModal from "@/components/customer/SubscriptionEditModal";
import CreateSubscriptionModal from "@/components/customer/CreateSubscriptionModal";
import MealOverrideModal from "@/components/customer/MealOverrideModal";
import WalletAdjustModal from "@/components/customer/WalletAdjustModal";
import AdminOpsServices from "@/services/AdminOpsServices";
import PaymentServices from "@/services/PaymentServices";
import { notifyError } from "@/utils/toast";
import {
  fmtDate,
  fmtDateTime,
  inr,
  subscriptionBadgeType,
  paymentBadgeType,
  severityBadgeType,
  stepLabel,
  childName,
  fullName,
  errMessage,
  addDays,
  notificationLink,
} from "@/utils/adminOps";

const Section = ({ title, actions, children, className = "" }) => (
  <Card className={`mb-6 ${className}`}>
    <CardBody>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <h3 className="text-base font-semibold text-gray-700 dark:text-gray-200">{title}</h3>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      {children}
    </CardBody>
  </Card>
);

const KV = ({ label, value }) => (
  <div>
    <div className="text-xs uppercase tracking-wide text-gray-500">{label}</div>
    <div className="text-sm text-gray-800 dark:text-gray-200 break-words">{value ?? "-"}</div>
  </div>
);

const Th = ({ children, className = "" }) => (
  <th className={`py-2 pr-3 text-left text-xs font-semibold uppercase text-gray-500 ${className}`}>{children}</th>
);
const Td = ({ children, className = "" }) => (
  <td className={`py-2 pr-3 text-sm text-gray-700 dark:text-gray-300 align-top ${className}`}>{children}</td>
);

const Empty = ({ text }) => <p className="text-sm text-gray-400">{text}</p>;

const CustomerDetail = () => {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [customerPayments, setCustomerPayments] = useState(null);
  const [audit, setAudit] = useState([]);
  const [auditLoading, setAuditLoading] = useState(false);

  const [editSub, setEditSub] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [mealOverride, setMealOverride] = useState(null); // {open, initial}
  const [walletOpen, setWalletOpen] = useState(false);
  const [showAllWallet, setShowAllWallet] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await AdminOpsServices.getCustomerOverview(id);
      setData(res?.data || null);
    } catch (err) {
      setError(errMessage(err));
      setData(null);
    } finally {
      setLoading(false);
    }
    PaymentServices.forCustomer(id)
      .then((r) => setCustomerPayments(r?.data || null))
      .catch(() => setCustomerPayments(null));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // Audit trail: everything targeting this customer's form, subscriptions and recent payment intents.
  useEffect(() => {
    if (!data) return;
    const targets = [];
    if (data.form?._id) targets.push({ targetId: data.form._id });
    targets.push({ targetId: id });
    (data.subscriptions || []).forEach((s) => targets.push({ targetId: s._id }));
    (data.paymentIntents || []).slice(0, 5).forEach((p) => targets.push({ targetId: p.orderId }));
    let cancelled = false;
    setAuditLoading(true);
    Promise.all(targets.map((t) => AdminOpsServices.getAudit({ ...t, limit: 50 }).catch(() => ({ data: [] }))))
      .then((results) => {
        if (cancelled) return;
        const seen = new Set();
        const rows = [];
        results.forEach((r) =>
          (r?.data || []).forEach((row) => {
            if (seen.has(row._id)) return;
            seen.add(row._id);
            rows.push(row);
          })
        );
        rows.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        setAudit(rows);
      })
      .finally(() => !cancelled && setAuditLoading(false));
    return () => {
      cancelled = true;
    };
  }, [data, id]);

  const childById = useMemo(() => {
    const m = new Map();
    (data?.children || []).forEach((c) => m.set(String(c._id), c));
    return m;
  }, [data]);

  // Next 7 days grid: date → childId → meal
  const week = useMemo(() => {
    if (!data) return { days: [], byChild: new Map() };
    const today = data.today;
    const days = Array.from({ length: 7 }, (_, i) => addDays(today, i));
    const byChild = new Map();
    (data.subscriptions || []).forEach((s) => {
      (s.meals?.next7Days || []).forEach((m) => {
        const cid = String(m.childId);
        if (!byChild.has(cid)) byChild.set(cid, new Map());
        byChild.get(cid).set(m.date, { ...m, subscriptionId: String(s._id) });
      });
    });
    return { days, byChild };
  }, [data]);

  if (loading) return <div className="py-10 text-center">Loading customer...</div>;
  if (error || !data)
    return (
      <div className="py-10 text-center text-red-500">
        {error || "Customer not found"}
        <div className="mt-4">
          <Link to="/customers" className="text-emerald-600 hover:underline">
            Back to customers
          </Link>
        </div>
      </div>
    );

  const { user, form, children = [], subscriptions = [], payments = [], paymentIntents = [], holidayPayments = [], notifications = [] } = data;
  const parent = form?.parentDetails;
  const wallet = form?.wallet || { points: 0, history: [], historyCount: 0 };
  const walletHistory = showAllWallet ? wallet.history : (wallet.history || []).slice(0, 10);
  const activeSub = subscriptions.find((s) => s.status === "active");

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link to="/customers" className="text-gray-500 hover:text-emerald-600" title="Back">
            <FiArrowLeft className="w-5 h-5" />
          </Link>
          <PageTitle>{user?.name || "Customer"}</PageTitle>
          {user?.freeTrial && <Badge type="primary">free trial</Badge>}
        </div>
        <div className="flex items-center gap-2">
          <Button layout="outline" size="small" onClick={load}>
            <FiRefreshCw className="mr-2" /> Refresh
          </Button>
          <Button size="small" onClick={() => setCreateOpen(true)}>
            Create subscription manually
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3 mb-6">
        <Card className="lg:col-span-2">
          <CardBody>
            <h3 className="text-base font-semibold text-gray-700 dark:text-gray-200 mb-4">Parent & contact</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <KV label="Account name" value={user?.name} />
              <KV label="Account phone" value={user?.phone} />
              <KV label="Account email" value={user?.email} />
              <KV label="Father" value={parent ? fullName(parent.fatherFirstName, parent.fatherLastName) : "-"} />
              <KV label="Mother" value={parent ? fullName(parent.motherFirstName, parent.motherLastName) : "-"} />
              <KV label="Form mobile / email" value={parent ? `${parent.mobile || "-"} · ${parent.email || "-"}` : "-"} />
              <div className="col-span-2 md:col-span-3">
                <KV
                  label="Address"
                  value={parent ? [parent.address, parent.city, parent.state, parent.pincode, parent.country].filter(Boolean).join(", ") : "-"}
                />
              </div>
              <KV label="Joined" value={fmtDateTime(user?.createdAt)} />
              <KV label="Customer id" value={<span className="text-xs">{user?._id}</span>} />
              <KV label="SMS sent" value={data.smsLogCount} />
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <h3 className="text-base font-semibold text-gray-700 dark:text-gray-200 mb-4">Status</h3>
            <div className="space-y-3">
              <KV label="Registration step" value={form ? stepLabel(form.step) : "No form yet"} />
              <KV
                label="Payment status"
                value={form?.paymentStatus ? <Badge type={form.paymentStatus === "Success" ? "success" : "warning"}>{form.paymentStatus}</Badge> : "-"}
              />
              <KV label="Subscriptions" value={`${form?.subscriptionCount ?? 0} counted · ${subscriptions.length} records`} />
              <KV
                label="Active plan"
                value={activeSub ? `${fmtDate(activeSub.startDateKey)} → ${fmtDate(activeSub.endDateKey)}` : "none"}
              />
              <KV label="Wallet" value={<span className="font-semibold">{inr(wallet.points)}</span>} />
            </div>
          </CardBody>
        </Card>
      </div>

      <Section title={`Children (${children.length})`}>
        {children.length === 0 ? (
          <Empty text="No children saved." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <Th>Name</Th>
                  <Th>DOB</Th>
                  <Th>School</Th>
                  <Th>Location</Th>
                  <Th>Class</Th>
                  <Th>Lunch time</Th>
                  <Th>Allergies</Th>
                </tr>
              </thead>
              <tbody>
                {children.map((c) => (
                  <tr key={c._id} className="border-t border-gray-100 dark:border-gray-700">
                    <Td>{childName(c)}</Td>
                    <Td>{fmtDate(c.dob)}</Td>
                    <Td>{c.school}</Td>
                    <Td>{c.location}</Td>
                    <Td>
                      {c.childClass} - {c.section}
                    </Td>
                    <Td>{c.lunchTime}</Td>
                    <Td>{c.allergies ? <span className="text-red-600">{c.allergies}</span> : "-"}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title={`Subscriptions (${subscriptions.length})`}>
        {subscriptions.length === 0 ? (
          <Empty text="No subscriptions. Use “Create subscription manually” if the customer has paid." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <Th>Status</Th>
                  <Th>Plan</Th>
                  <Th>Dates</Th>
                  <Th>Days</Th>
                  <Th>Price</Th>
                  <Th>Children</Th>
                  <Th>Meals</Th>
                  <Th>Order</Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {subscriptions.map((s) => (
                  <tr key={s._id} className="border-t border-gray-100 dark:border-gray-700">
                    <Td>
                      <Badge type={subscriptionBadgeType(s.status)}>{s.status}</Badge>
                    </Td>
                    <Td>
                      {s.planId}
                      <div className="text-xs text-gray-400">{s._id}</div>
                    </Td>
                    <Td>
                      {fmtDate(s.startDateKey)} → {fmtDate(s.endDateKey)}
                    </Td>
                    <Td>{s.workingDays}</Td>
                    <Td>
                      {inr(s.price)}
                      {s.walletUsed ? <div className="text-xs text-gray-400">wallet {inr(s.walletUsed)}</div> : null}
                    </Td>
                    <Td>{(s.children || []).map((c) => (typeof c === "object" ? childName(c) : childName(childById.get(String(c))) || String(c))).join(", ") || "-"}</Td>
                    <Td>
                      {s.meals ? (
                        <span>
                          {s.meals.booked} booked
                          {s.meals.deleted ? <span className="text-red-500"> · {s.meals.deleted} cancelled</span> : null}
                        </span>
                      ) : (
                        "-"
                      )}
                    </Td>
                    <Td>
                      <span className="text-xs break-all">{s.orderId || "-"}</span>
                      {s.paymentDate && <div className="text-xs text-gray-400">{fmtDate(s.paymentDate)}</div>}
                    </Td>
                    <Td className="text-right">
                      <button type="button" className="inline-flex items-center text-sm text-emerald-600 hover:underline" onClick={() => setEditSub(s)}>
                        <FiEdit className="mr-1" /> Edit
                      </button>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section
        title="Meals — next 7 days"
        actions={
          <Button size="small" disabled={!subscriptions.length || !children.length} onClick={() => setMealOverride({ open: true, initial: null })}>
            Override meal
          </Button>
        }
      >
        {children.length === 0 ? (
          <Empty text="No children." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <Th>Child</Th>
                  {week.days.map((d) => (
                    <Th key={d}>{fmtDate(d).slice(0, 6)}</Th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {children.map((c) => {
                  const row = week.byChild.get(String(c._id)) || new Map();
                  return (
                    <tr key={c._id} className="border-t border-gray-100 dark:border-gray-700">
                      <Td>{childName(c)}</Td>
                      {week.days.map((d) => {
                        const m = row.get(d);
                        return (
                          <Td key={d}>
                            {m ? (
                              <button
                                type="button"
                                title="Override this meal"
                                className={`text-left text-xs rounded px-1 ${m.deleted ? "line-through text-red-500" : "text-gray-700 dark:text-gray-200"} hover:bg-gray-100 dark:hover:bg-gray-700`}
                                onClick={() =>
                                  setMealOverride({
                                    open: true,
                                    initial: { subscriptionId: m.subscriptionId, childId: String(c._id), date: d, action: m.deleted ? "restore" : "set", mealName: m.mealName },
                                  })
                                }
                              >
                                {m.mealName}
                              </button>
                            ) : (
                              <button
                                type="button"
                                title="Set a meal"
                                className="text-xs text-gray-300 hover:text-emerald-600"
                                onClick={() =>
                                  setMealOverride({
                                    open: true,
                                    initial: { subscriptionId: activeSub ? String(activeSub._id) : undefined, childId: String(c._id), date: d, action: "set" },
                                  })
                                }
                              >
                                —
                              </button>
                            )}
                          </Td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section
          title={`Wallet · ${inr(wallet.points)}`}
          actions={
            <Button size="small" disabled={!form} onClick={() => setWalletOpen(true)}>
              Adjust
            </Button>
          }
        >
          {!wallet.history?.length ? (
            <Empty text="No wallet history." />
          ) : (
            <>
              <table className="w-full">
                <thead>
                  <tr>
                    <Th>Date</Th>
                    <Th>Change</Th>
                    <Th>Reason</Th>
                  </tr>
                </thead>
                <tbody>
                  {walletHistory.map((h, i) => (
                    <tr key={h._id || i} className="border-t border-gray-100 dark:border-gray-700">
                      <Td className="whitespace-nowrap">{fmtDateTime(h.date)}</Td>
                      <Td className={h.change < 0 ? "text-red-600" : "text-emerald-600"}>
                        {h.change > 0 ? "+" : ""}
                        {h.change}
                      </Td>
                      <Td>
                        {h.reason}
                        {(h.childName || h.mealName) && (
                          <div className="text-xs text-gray-400">{[h.childName, h.mealName].filter(Boolean).join(" · ")}</div>
                        )}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {wallet.history.length > 10 && (
                <button type="button" className="mt-2 text-xs text-emerald-600 hover:underline" onClick={() => setShowAllWallet((v) => !v)}>
                  {showAllWallet ? "Show fewer" : `Show all ${wallet.history.length}${wallet.historyCount > wallet.history.length ? ` of ${wallet.historyCount}` : ""}`}
                </button>
              )}
            </>
          )}
        </Section>

        <Section
          title={`Payments · ${data.paymentTotals?.count || 0} · ${inr(data.paymentTotals?.amount || 0)}`}
          actions={
            <Link to={`/payments?q=${encodeURIComponent(user?.phone || user?.email || user?.name || "")}`} className="text-sm text-emerald-600 hover:underline">
              Open in Payments
            </Link>
          }
        >
          {paymentIntents.length === 0 && payments.length === 0 ? (
            <Empty text="No payments." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <Th>Date</Th>
                    <Th>Type</Th>
                    <Th>Amount</Th>
                    <Th>Status</Th>
                    <Th>Order</Th>
                  </tr>
                </thead>
                <tbody>
                  {(customerPayments?.intents || paymentIntents).map((p) => (
                    <tr key={p._id} className="border-t border-gray-100 dark:border-gray-700">
                      <Td className="whitespace-nowrap">{fmtDateTime(p.settledAt || p.createdAt)}</Td>
                      <Td>
                        {p.type}
                        <div className="text-xs text-gray-400">{p.source}{p.settledVia ? ` · ${p.settledVia}` : ""}</div>
                      </Td>
                      <Td>{inr(p.chargedAmount ?? p.amount)}</Td>
                      <Td>
                        <Badge type={paymentBadgeType(p.status)}>{p.status}</Badge>
                        {p.applyError && <div className="text-xs text-red-500">apply error</div>}
                      </Td>
                      <Td>
                        <Link to={`/payments?q=${encodeURIComponent(p.orderId)}`} className="text-xs text-emerald-600 hover:underline break-all">
                          {p.orderId}
                        </Link>
                      </Td>
                    </tr>
                  ))}
                  {paymentIntents.length === 0 &&
                    payments.map((p, i) => (
                      <tr key={p._id || i} className="border-t border-gray-100 dark:border-gray-700">
                        <Td className="whitespace-nowrap">{fmtDateTime(p.payment_date)}</Td>
                        <Td>{p.payment_mode || "gateway"}</Td>
                        <Td>{inr(p.amount)}</Td>
                        <Td>
                          <Badge type={p.order_status === "Success" ? "success" : "danger"}>{p.order_status}</Badge>
                        </Td>
                        <Td>
                          <span className="text-xs break-all">{p.order_id}</span>
                        </Td>
                      </tr>
                    ))}
                </tbody>
              </table>
              {holidayPayments.length > 0 && (
                <details className="mt-3">
                  <summary className="text-xs cursor-pointer text-gray-500">Holiday meal payments ({holidayPayments.length})</summary>
                  <ul className="text-xs mt-1 space-y-1">
                    {holidayPayments.map((h) => (
                      <li key={h._id}>
                        {h.mealDate} · {h.mealName} · {inr(h.amount)} · {h.paymentStatus} · {childName(childById.get(String(h.childId))) || ""}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}
        </Section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title={`Notifications (${notifications.length})`}>
          {notifications.length === 0 ? (
            <Empty text="No notifications for this customer." />
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-700">
              {notifications.map((n) => (
                <li key={n._id} className="py-2">
                  <Link to={notificationLink(n)} className="block hover:bg-gray-50 dark:hover:bg-gray-700 rounded px-1">
                    <div className="flex items-center gap-2">
                      <Badge type={severityBadgeType(n.severity)}>{n.severity}</Badge>
                      <span className="text-sm font-medium">{n.title}</span>
                      <span className="ml-auto text-xs text-gray-400 whitespace-nowrap">{fmtDateTime(n.createdAt)}</span>
                    </div>
                    {n.message && <p className="text-xs text-gray-500 mt-1">{n.message}</p>}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title={`Audit trail${auditLoading ? " (loading…)" : ` (${audit.length})`}`}>
          {audit.length === 0 ? (
            <Empty text={auditLoading ? "Loading…" : "No admin changes recorded."} />
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-700">
              {audit.map((a) => (
                <li key={a._id} className="py-2">
                  <div className="flex items-center gap-2 text-sm">
                    <Badge type="neutral">{a.action}</Badge>
                    <span className="text-gray-600 dark:text-gray-300">{a.adminId?.name || a.adminId?.email || "admin"}</span>
                    <span className="ml-auto text-xs text-gray-400 whitespace-nowrap">{fmtDateTime(a.createdAt)}</span>
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {a.targetType} {a.targetId}
                    {a.reason ? ` — ${a.reason}` : ""}
                  </div>
                  {(a.before || a.after) && (
                    <details className="mt-1">
                      <summary className="text-xs cursor-pointer text-gray-400">before / after</summary>
                      <pre className="text-xs bg-gray-100 dark:bg-gray-900 rounded p-2 mt-1 overflow-x-auto max-h-48">
                        {JSON.stringify({ before: a.before, after: a.after }, null, 2)}
                      </pre>
                    </details>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <SubscriptionEditModal open={Boolean(editSub)} subscription={editSub} childList={children} onClose={() => setEditSub(null)} onSaved={load} />
      <CreateSubscriptionModal open={createOpen} userId={id} childList={children} onClose={() => setCreateOpen(false)} onSaved={load} />
      <MealOverrideModal
        open={Boolean(mealOverride?.open)}
        initial={mealOverride?.initial}
        userId={id}
        subscriptions={subscriptions}
        childList={children}
        onClose={() => setMealOverride(null)}
        onSaved={load}
      />
      <WalletAdjustModal open={walletOpen} userId={id} currentPoints={wallet.points} onClose={() => setWalletOpen(false)} onSaved={load} />
    </>
  );
};

export default CustomerDetail;
