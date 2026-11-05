import React, { useCallback, useEffect, useState } from "react";
import {
  Card,
  CardBody,
  Table,
  TableContainer,
  TableHeader,
  TableCell,
  TableBody,
  TableRow,
  TableFooter,
  Pagination,
  Button,
  Input,
  Badge,
  Select,
} from "@windmill/react-ui";
import { Link, useHistory, useLocation } from "react-router-dom";
import { FiZoomIn, FiRefreshCw, FiAlertTriangle } from "react-icons/fi";

import PageTitle from "@/components/Typography/PageTitle";
import TableLoading from "@/components/preloader/TableLoading";
import PaymentDetailModal from "@/components/payment/PaymentDetailModal";
import PaymentServices from "@/services/PaymentServices";
import { notifySuccess, notifyError } from "@/utils/toast";
import { fmtDateTime, inr, paymentBadgeType, errMessage } from "@/utils/adminOps";

const PAGE_SIZE = 25;

const TABS = [
  { key: "", label: "All" },
  { key: "attention", label: "Needs attention" },
  { key: "unreconciled", label: "Unreconciled" },
  { key: "success", label: "Success" },
  { key: "failed", label: "Failed" },
];

const TYPES = ["subscription", "renewal", "addChild", "holiday", "tryMeal"];

const TONES = {
  emerald: { card: "border border-emerald-200 dark:border-gray-700", value: "text-emerald-700 dark:text-emerald-300" },
  red: { card: "border border-red-200 dark:border-gray-700", value: "text-red-700 dark:text-red-300" },
};

const Tile = ({ label, value, sub, tone = "emerald" }) => (
  <Card className={TONES[tone].card}>
    <CardBody>
      <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${TONES[tone].value}`}>{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
    </CardBody>
  </Card>
);

const Payments = () => {
  const history = useHistory();
  const location = useLocation();
  const initialQ = new URLSearchParams(location.search).get("q") || "";

  const [summary, setSummary] = useState(null);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [statusApiEnabled, setStatusApiEnabled] = useState(false);

  const [tab, setTab] = useState("");
  const [type, setType] = useState("");
  const [q, setQ] = useState(initialQ);
  const [qInput, setQInput] = useState(initialQ);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const [detailId, setDetailId] = useState(null);
  const [running, setRunning] = useState(false);

  const loadSummary = useCallback(async () => {
    try {
      const res = await PaymentServices.summary();
      setSummary(res?.data || null);
      if (res?.data) setStatusApiEnabled(Boolean(res.data.statusApiEnabled));
    } catch (err) {
      notifyError(errMessage(err));
    }
  }, []);

  const loadRows = useCallback(async () => {
    setLoading(true);
    try {
      const res = await PaymentServices.list({ status: tab, type, q, from, to, page, limit: PAGE_SIZE });
      setRows(res?.data || []);
      setTotal(res?.total || 0);
      if (res?.statusApiEnabled != null) setStatusApiEnabled(Boolean(res.statusApiEnabled));
    } catch (err) {
      notifyError(errMessage(err));
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [tab, type, q, from, to, page]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  // Follow deep links (?q=orderId) while already on the page.
  useEffect(() => {
    const next = new URLSearchParams(location.search).get("q") || "";
    if (next !== q) {
      setQ(next);
      setQInput(next);
      setPage(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  const submitSearch = (e) => {
    e.preventDefault();
    setPage(1);
    setQ(qInput.trim());
    const params = new URLSearchParams(location.search);
    if (qInput.trim()) params.set("q", qInput.trim());
    else params.delete("q");
    history.replace({ pathname: location.pathname, search: params.toString() ? `?${params}` : "" });
  };

  const reset = () => {
    setQInput("");
    setQ("");
    setType("");
    setFrom("");
    setTo("");
    setTab("");
    setPage(1);
    history.replace({ pathname: location.pathname, search: "" });
  };

  const runReconciliation = async () => {
    setRunning(true);
    try {
      const res = await PaymentServices.runReconciliation();
      const s = res?.data || {};
      notifySuccess(
        `Reconciliation finished${s.checked != null ? `: checked ${s.checked}` : ""}${
          s.settled != null ? `, settled ${s.settled}` : ""
        }${s.expired != null ? `, expired ${s.expired}` : ""}`
      );
      loadSummary();
      loadRows();
    } catch (err) {
      notifyError(errMessage(err));
    } finally {
      setRunning(false);
    }
  };

  const refreshAll = () => {
    loadSummary();
    loadRows();
  };

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageTitle>Payments</PageTitle>
        <div className="flex items-center gap-2">
          <Button layout="outline" size="small" onClick={refreshAll}>
            <FiRefreshCw className="mr-2" /> Refresh
          </Button>
          <Button size="small" disabled={running} onClick={runReconciliation}>
            {running ? "Running..." : "Run reconciliation now"}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 grid-cols-1 md:grid-cols-3 mb-6">
        <Tile
          label="Collected (last 30 days)"
          value={summary ? inr(summary.collectedLast30Days) : "…"}
          sub={summary?.last30Days ? `${summary.last30Days.success || 0} successful payments` : ""}
        />
        <Tile
          label="Needs attention"
          value={summary ? summary.needsAttention : "…"}
          sub="amount mismatch, apply errors, stale intents"
          tone={summary?.needsAttention ? "red" : "emerald"}
        />
        <Card className="border border-gray-200 dark:border-gray-700">
          <CardBody>
            <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">CCAvenue status API</p>
            <p className="mt-2">
              <Badge type={statusApiEnabled ? "success" : "warning"}>{statusApiEnabled ? "Enabled" : "Disabled"}</Badge>
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {statusApiEnabled
                ? "“Check with CCAvenue” asks the gateway directly."
                : "Set CCAV_STATUS_API_ENABLED on the server to enable automatic checks; use Confirm payment meanwhile."}
            </p>
          </CardBody>
        </Card>
      </div>

      <Card className="min-w-0 shadow-xs overflow-hidden bg-white dark:bg-gray-800 mb-5">
        <CardBody>
          <div className="flex flex-wrap gap-2 mb-4">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => {
                  setTab(t.key);
                  setPage(1);
                }}
                className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${
                  tab === t.key
                    ? "bg-emerald-600 text-white border-emerald-600"
                    : "bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-200 border-gray-300 dark:border-gray-600 hover:border-emerald-500"
                }`}
              >
                {t.label}
                {t.key === "attention" && summary?.needsAttention ? (
                  <span className="ml-2 inline-flex items-center justify-center px-1.5 text-xs rounded-full bg-red-500 text-white">
                    {summary.needsAttention}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
          <form onSubmit={submitSearch} className="grid gap-3 md:grid-cols-6 items-end">
            <div className="md:col-span-2">
              <Input
                type="search"
                value={qInput}
                onChange={(e) => setQInput(e.target.value)}
                placeholder="Order id, tracking id, name, phone or email"
              />
            </div>
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
            <Input
              type="date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setPage(1);
              }}
              title="From"
            />
            <Input
              type="date"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                setPage(1);
              }}
              title="To"
            />
            <div className="flex gap-2">
              <Button type="submit" className="h-10 w-full bg-emerald-700">
                Search
              </Button>
              <Button layout="outline" type="button" onClick={reset} className="h-10">
                Reset
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>

      {loading ? (
        <TableLoading row={10} col={8} width={140} height={20} />
      ) : (
        <TableContainer className="mb-8">
          <Table>
            <TableHeader>
              <tr>
                <TableCell>Created</TableCell>
                <TableCell>Customer</TableCell>
                <TableCell>Type</TableCell>
                <TableCell>Amount</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Settled via</TableCell>
                <TableCell>Tracking id</TableCell>
                <TableCell>Order id</TableCell>
                <TableCell className="text-right">Actions</TableCell>
              </tr>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9}>
                    <p className="text-center py-6 text-gray-500">No payments match these filters.</p>
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => {
                  const u = r.user && typeof r.user === "object" ? r.user : null;
                  return (
                    <TableRow key={r._id} className={r.applyError ? "bg-red-50 dark:bg-red-900/20" : ""}>
                      <TableCell>
                        <span className="text-sm whitespace-nowrap">{fmtDateTime(r.createdAt)}</span>
                      </TableCell>
                      <TableCell>
                        {u ? (
                          <Link to={`/customers/${u._id}`} className="text-sm text-emerald-600 hover:underline">
                            {u.name || u.email || "Customer"}
                          </Link>
                        ) : (
                          <span className="text-sm">-</span>
                        )}
                        {u?.phone && <div className="text-xs text-gray-500">{u.phone}</div>}
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">{r.type}</span>
                        <div className="text-xs text-gray-400">{r.source}</div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm font-medium">{inr(r.amount)}</span>
                        {r.chargedAmount != null && r.chargedAmount !== r.amount && (
                          <div className="text-xs text-red-500">charged {inr(r.chargedAmount)}</div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge type={paymentBadgeType(r.status)}>{r.status}</Badge>
                        {r.applyError && (
                          <span className="ml-2 inline-flex items-center text-xs text-red-600" title={r.applyError}>
                            <FiAlertTriangle className="mr-1" /> apply error
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">{r.settledVia || "-"}</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs break-all">{r.trackingId || "-"}</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs break-all">{r.orderId}</span>
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end">
                          <button
                            type="button"
                            className="text-xl text-gray-500 hover:text-emerald-600"
                            title="View details"
                            onClick={() => setDetailId(r.orderId)}
                          >
                            <FiZoomIn />
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
          <TableFooter>
            <Pagination
              key={`${tab}|${type}|${q}|${from}|${to}`}
              totalResults={total}
              resultsPerPage={PAGE_SIZE}
              onChange={(p) => setPage(p)}
              label="Payments navigation"
            />
          </TableFooter>
        </TableContainer>
      )}

      <PaymentDetailModal
        open={Boolean(detailId)}
        orderId={detailId}
        statusApiEnabled={statusApiEnabled}
        onClose={() => setDetailId(null)}
        onChanged={refreshAll}
      />
    </>
  );
};

export default Payments;
