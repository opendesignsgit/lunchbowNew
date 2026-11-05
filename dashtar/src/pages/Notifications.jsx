import React, { useCallback, useEffect, useState } from "react";
import { Card, CardBody, Button, Badge, Select, Pagination, TableContainer, TableFooter } from "@windmill/react-ui";
import { useHistory, useLocation } from "react-router-dom";

import PageTitle from "@/components/Typography/PageTitle";
import AdminOpsServices from "@/services/AdminOpsServices";
import { notifyError, notifySuccess } from "@/utils/toast";
import { fmtDateTime, notificationLink, severityBadgeType, severityRowClass, errMessage } from "@/utils/adminOps";

const PAGE_SIZE = 20;

const TYPES = [
  "user.signup",
  "registration.step",
  "plan.selected",
  "payment.success",
  "payment.failed",
  "payment.mismatch",
  "payment.unreconciled",
  "renewal.paid",
  "child.added",
  "meal.updated",
  "meal.deleted",
  "holiday.booked",
  "school.requested",
  "trial.enquiry",
  "enquiry.contact",
  "account.deleted",
  "admin.override",
  "reminder.renewal.sent",
  "reminder.meal.sent",
  "job.error",
];

const Notifications = () => {
  const history = useHistory();
  const location = useLocation();
  const params = new URLSearchParams(location.search);

  const [type, setType] = useState(params.get("type") || "");
  const [severity, setSeverity] = useState(params.get("severity") || "");
  const [unreadOnly, setUnreadOnly] = useState(params.get("unread") === "1");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await AdminOpsServices.getNotifications({ page, limit: PAGE_SIZE, type, severity, unread: unreadOnly ? 1 : "" });
      setRows(res?.data || []);
      setTotal(res?.total || 0);
    } catch (err) {
      notifyError(errMessage(err));
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, type, severity, unreadOnly]);

  useEffect(() => {
    load();
  }, [load]);

  const open = async (n) => {
    if (!n.read) {
      setRows((list) => list.map((x) => (x._id === n._id ? { ...x, read: true } : x)));
      try {
        await AdminOpsServices.markNotificationRead(n._id);
      } catch (err) {
        // ignore
      }
    }
    history.push(notificationLink(n));
  };

  const markRead = async (n, e) => {
    e.stopPropagation();
    try {
      await AdminOpsServices.markNotificationRead(n._id);
      setRows((list) => list.map((x) => (x._id === n._id ? { ...x, read: true } : x)));
    } catch (err) {
      notifyError(errMessage(err));
    }
  };

  const markAll = async () => {
    try {
      const res = await AdminOpsServices.markAllNotificationsRead(type ? { type } : {});
      notifySuccess(`${res?.updated ?? 0} marked read`);
      load();
    } catch (err) {
      notifyError(errMessage(err));
    }
  };

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageTitle>Notifications</PageTitle>
        <Button size="small" layout="outline" onClick={markAll}>
          Mark all read{type ? ` (${type})` : ""}
        </Button>
      </div>

      <Card className="min-w-0 shadow-xs overflow-hidden bg-white dark:bg-gray-800 mb-5">
        <CardBody>
          <div className="grid gap-4 md:grid-cols-4 items-center">
            <Select
              value={type}
              onChange={(e) => {
                setType(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All types</option>
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
            <Select
              value={severity}
              onChange={(e) => {
                setSeverity(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All severities</option>
              <option value="critical">critical</option>
              <option value="warning">warning</option>
              <option value="info">info</option>
            </Select>
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={unreadOnly}
                onChange={(e) => {
                  setUnreadOnly(e.target.checked);
                  setPage(1);
                }}
              />
              Unread only
            </label>
            <Button
              layout="outline"
              onClick={() => {
                setType("");
                setSeverity("");
                setUnreadOnly(false);
                setPage(1);
              }}
            >
              Reset
            </Button>
          </div>
        </CardBody>
      </Card>

      <TableContainer className="mb-8">
        {loading ? (
          <p className="py-10 text-center">Loading...</p>
        ) : rows.length === 0 ? (
          <p className="py-10 text-center text-gray-500">No notifications.</p>
        ) : (
          <ul>
            {rows.map((n) => (
              <li
                key={n._id}
                onClick={() => open(n)}
                className={`px-4 py-3 border-b border-gray-100 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 ${severityRowClass(n.severity)} ${
                  n.read ? "" : "bg-emerald-50/40 dark:bg-gray-900"
                }`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge type={severityBadgeType(n.severity)}>{n.severity}</Badge>
                  <span className={`text-sm ${n.read ? "text-gray-700 dark:text-gray-300" : "font-semibold text-gray-900 dark:text-gray-100"}`}>{n.title}</span>
                  <span className="text-xs text-gray-400">{n.type}</span>
                  <span className="ml-auto text-xs text-gray-400 whitespace-nowrap">{fmtDateTime(n.createdAt)}</span>
                  {!n.read && (
                    <button type="button" className="text-xs text-emerald-600 hover:underline" onClick={(e) => markRead(n, e)}>
                      mark read
                    </button>
                  )}
                </div>
                {n.message && <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{n.message}</p>}
                {(n.channels?.length || n.emailed || n.pushed) && (
                  <p className="text-xs text-gray-400 mt-1">
                    {(n.channels || []).join(", ")}
                    {n.emailed ? " · emailed" : ""}
                    {n.pushed ? " · pushed" : ""}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
        <TableFooter>
          <Pagination key={`${type}|${severity}|${unreadOnly}`} totalResults={total} resultsPerPage={PAGE_SIZE} onChange={(p) => setPage(p)} label="Notifications navigation" />
        </TableFooter>
      </TableContainer>
    </>
  );
};

export default Notifications;
