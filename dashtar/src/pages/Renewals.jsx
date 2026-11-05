import React, { useCallback, useEffect, useState } from "react";
import { Card, CardBody, Button, Badge, Table, TableBody, TableCell, TableContainer, TableHeader, TableRow } from "@windmill/react-ui";
import { Link } from "react-router-dom";

import PageTitle from "@/components/Typography/PageTitle";
import TableLoading from "@/components/preloader/TableLoading";
import AdminOpsServices from "@/services/AdminOpsServices";
import { notifyError } from "@/utils/toast";
import { fmtDate, fmtDateTime, inr, childName, errMessage } from "@/utils/adminOps";

const DAY_OPTIONS = [3, 7, 10, 30];

const Renewals = () => {
  const [days, setDays] = useState(10);
  const [rows, setRows] = useState([]);
  const [today, setToday] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await AdminOpsServices.getRenewals(days);
      setRows(res?.data || []);
      setToday(res?.today || "");
    } catch (err) {
      notifyError(errMessage(err));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    load();
  }, [load]);

  const daysBadge = (d) => (d <= 3 ? "danger" : d <= 7 ? "warning" : "neutral");

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageTitle>Renewals</PageTitle>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">Plans ending within</span>
          {DAY_OPTIONS.map((d) => (
            <Button key={d} size="small" layout={days === d ? "primary" : "outline"} onClick={() => setDays(d)}>
              {d} days
            </Button>
          ))}
        </div>
      </div>

      <Card className="mb-5">
        <CardBody>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Active plans ending by <strong>{today ? fmtDate(today) : "today"}</strong> + {days} days whose customer has no upcoming or pending plan.{" "}
            <strong>{rows.length}</strong> customer{rows.length === 1 ? "" : "s"} to follow up.
          </p>
        </CardBody>
      </Card>

      {loading ? (
        <TableLoading row={8} col={7} width={150} height={20} />
      ) : (
        <TableContainer className="mb-8">
          <Table>
            <TableHeader>
              <tr>
                <TableCell>Parent</TableCell>
                <TableCell>Phone</TableCell>
                <TableCell>Email</TableCell>
                <TableCell>Plan ends</TableCell>
                <TableCell>Days left</TableCell>
                <TableCell>Children</TableCell>
                <TableCell>Wallet</TableCell>
                <TableCell>Reminders sent</TableCell>
                <TableCell className="text-right">Actions</TableCell>
              </tr>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9}>
                    <p className="text-center py-6 text-gray-500">No plans expiring in the next {days} days without a renewal.</p>
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => (
                  <TableRow key={r._id}>
                    <TableCell>
                      <Link to={`/customers/${r.user}`} className="text-sm font-medium text-emerald-600 hover:underline">
                        {r.parent?.name || "(no name)"}
                      </Link>
                      <div className="text-xs text-gray-400">{r.planId}</div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">{r.parent?.phone || "-"}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">{r.parent?.email || "-"}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm whitespace-nowrap">{fmtDate(r.endDateKey)}</span>
                      <div className="text-xs text-gray-400">from {fmtDate(r.startDateKey)}</div>
                    </TableCell>
                    <TableCell>
                      <Badge type={daysBadge(r.daysLeft)}>{r.daysLeft} d</Badge>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">{(r.children || []).map((c) => (typeof c === "object" ? childName(c) : c)).join(", ") || "-"}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">{inr(r.walletPoints)}</span>
                    </TableCell>
                    <TableCell>
                      {r.remindersSent?.length ? (
                        <ul className="text-xs text-gray-500">
                          {r.remindersSent.map((x, i) => (
                            <li key={i}>
                              {x.daysBefore}d · {x.channel} · {fmtDateTime(x.sentAt)}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <span className="text-xs text-gray-400">none</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end">
                        <Link to={`/customers/${r.user}`}>
                          <Button size="small" layout="outline">
                            Open customer
                          </Button>
                        </Link>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </>
  );
};

export default Renewals;
