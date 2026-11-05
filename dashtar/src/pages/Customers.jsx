import React, { useCallback, useEffect, useState } from "react";
import {
  Card,
  CardBody,
  Button,
  Input,
  Badge,
  Pagination,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableFooter,
  TableHeader,
  TableRow,
} from "@windmill/react-ui";
import { Link, useHistory } from "react-router-dom";
import { FiZoomIn } from "react-icons/fi";

import PageTitle from "@/components/Typography/PageTitle";
import TableLoading from "@/components/preloader/TableLoading";
import AdminOpsServices from "@/services/AdminOpsServices";
import { notifyError } from "@/utils/toast";
import { fmtDate, inr, subscriptionBadgeType, stepLabel, errMessage } from "@/utils/adminOps";

const PAGE_SIZE = 20;

const PlanCell = ({ plan, label }) => {
  if (!plan) return null;
  return (
    <div className="text-xs">
      <Badge type={subscriptionBadgeType(plan.status)}>{label || plan.status}</Badge>
      <span className="ml-1 text-gray-600 dark:text-gray-300">
        {fmtDate(plan.startDateKey)} → {fmtDate(plan.endDateKey)}
      </span>
    </div>
  );
};

const Customers = () => {
  const history = useHistory();
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [qInput, setQInput] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await AdminOpsServices.searchCustomers({ q, page, limit: PAGE_SIZE });
      setRows(res?.data || []);
      setTotal(res?.total || 0);
    } catch (err) {
      notifyError(errMessage(err));
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [q, page]);

  useEffect(() => {
    load();
  }, [load]);

  const submit = (e) => {
    e.preventDefault();
    setPage(1);
    setQ(qInput.trim());
  };

  const reset = () => {
    setQInput("");
    setQ("");
    setPage(1);
  };

  return (
    <>
      <PageTitle>Customers</PageTitle>

      <Card className="min-w-0 shadow-xs overflow-hidden bg-white dark:bg-gray-800 mb-5">
        <CardBody>
          <form onSubmit={submit} className="py-3 grid gap-4 md:flex">
            <div className="flex-grow">
              <Input
                type="search"
                value={qInput}
                onChange={(e) => setQInput(e.target.value)}
                placeholder="Search by parent name, phone or email"
              />
            </div>
            <div className="flex items-center gap-2">
              <Button type="submit" className="h-12 bg-emerald-700 px-6">
                Search
              </Button>
              <Button layout="outline" type="button" onClick={reset} className="h-12 px-4 dark:bg-gray-700">
                <span className="text-black dark:text-gray-200">Reset</span>
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>

      {loading ? (
        <TableLoading row={12} col={7} width={150} height={20} />
      ) : (
        <TableContainer className="mb-8">
          <Table>
            <TableHeader>
              <tr>
                <TableCell>Joined</TableCell>
                <TableCell>Parent</TableCell>
                <TableCell>Contact</TableCell>
                <TableCell>Step</TableCell>
                <TableCell>Payment</TableCell>
                <TableCell>Plan</TableCell>
                <TableCell>Children</TableCell>
                <TableCell>Wallet</TableCell>
                <TableCell className="text-right">Actions</TableCell>
              </tr>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9}>
                    <p className="text-center py-6 text-gray-500">No customers found.</p>
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((u) => (
                  <TableRow
                    key={u._id}
                    className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700"
                    onClick={() => history.push(`/customers/${u._id}`)}
                  >
                    <TableCell>
                      <span className="text-sm whitespace-nowrap">{fmtDate(u.createdAt)}</span>
                    </TableCell>
                    <TableCell>
                      <Link
                        to={`/customers/${u._id}`}
                        className="text-sm font-medium text-emerald-600 hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {u.name || "(no name)"}
                      </Link>
                      {u.freeTrial && (
                        <Badge type="primary" className="ml-2">
                          trial
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">{u.phone || "-"}</div>
                      <div className="text-xs text-gray-500">{u.email || ""}</div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">{stepLabel(u.step)}</span>
                    </TableCell>
                    <TableCell>
                      {u.paymentStatus ? (
                        <Badge type={u.paymentStatus === "Success" ? "success" : "warning"}>{u.paymentStatus}</Badge>
                      ) : (
                        <span className="text-xs text-gray-400">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <PlanCell plan={u.activePlan} label="active" />
                        <PlanCell plan={u.upcomingPlan} label="upcoming" />
                        <PlanCell plan={u.pendingPlan} label="pending" />
                        {!u.activePlan && !u.upcomingPlan && !u.pendingPlan && (
                          <span className="text-xs text-gray-400">no plan</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">{u.childrenCount}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">{inr(u.walletPoints)}</span>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end text-xl text-gray-500 hover:text-emerald-600">
                        <FiZoomIn />
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          <TableFooter>
            <Pagination
              key={q}
              totalResults={total}
              resultsPerPage={PAGE_SIZE}
              onChange={(p) => setPage(p)}
              label="Customers navigation"
            />
          </TableFooter>
        </TableContainer>
      )}
    </>
  );
};

export default Customers;
