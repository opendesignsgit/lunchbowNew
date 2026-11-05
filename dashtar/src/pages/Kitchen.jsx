import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardBody, Button, Input, Select, Badge } from "@windmill/react-ui";
import { FiPrinter, FiDownload, FiRefreshCw } from "react-icons/fi";

import PageTitle from "@/components/Typography/PageTitle";
import OrderServices from "@/services/OrderServices";
import { notifyError, notifySuccess } from "@/utils/toast";
import { fmtDate, todayKey, errMessage, fullName } from "@/utils/adminOps";

const PRINT_CSS = `
@media print {
  header, aside, nav, .no-print, .Toastify { display: none !important; }
  main, .sm\\:container { padding: 0 !important; margin: 0 !important; max-width: none !important; }
  body, html { background: #fff !important; }
  .kitchen-print { color: #000 !important; }
  .kitchen-group { break-inside: avoid; page-break-inside: avoid; border: 1px solid #999 !important; box-shadow: none !important; margin-bottom: 12px !important; }
  .kitchen-table th, .kitchen-table td { border: 1px solid #bbb; padding: 3px 6px; font-size: 11px; }
  .kitchen-cancelled { text-decoration: line-through; }
}
`;

const StatusBadge = ({ row }) => {
  if (row.deleted) return <Badge type="danger">CANCELLED – DO NOT DISPATCH</Badge>;
  if (row.holidayPaid) return <Badge type="primary">Paid extra day</Badge>;
  return <Badge type="success">Active</Badge>;
};

const Kitchen = () => {
  const [date, setDate] = useState(todayKey());
  const [school, setSchool] = useState("");
  const [lunchTime, setLunchTime] = useState("");
  const [sheet, setSheet] = useState(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await OrderServices.getKitchenSheet({ date });
      setSheet(res?.data || res || null);
    } catch (err) {
      notifyError(errMessage(err));
      setSheet(null);
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    load();
  }, [load]);

  const schoolOptions = useMemo(() => (sheet?.schools || []).map((s) => s.school), [sheet]);
  const slotOptions = useMemo(() => {
    const set = new Set();
    (sheet?.schools || []).forEach((s) => s.slots.forEach((slot) => set.add(slot.lunchTime)));
    return [...set].sort();
  }, [sheet]);

  // Filters apply client-side (the sheet for a day is small); the CSV passes them to the server.
  const groups = useMemo(() => {
    if (!sheet) return [];
    return (sheet.schools || [])
      .filter((s) => !school || s.school === school)
      .map((s) => {
        const slots = s.slots.filter((slot) => !lunchTime || slot.lunchTime === lunchTime);
        const rows = slots.flatMap((slot) => slot.rows);
        return {
          ...s,
          slots,
          total: rows.filter((r) => !r.deleted).length,
          cancelled: rows.filter((r) => r.deleted).length,
        };
      })
      .filter((s) => s.slots.length > 0);
  }, [sheet, school, lunchTime]);

  const totals = useMemo(() => {
    const rows = groups.flatMap((g) => g.slots.flatMap((s) => s.rows));
    const dishes = {};
    rows.forEach((r) => {
      if (r.deleted) return;
      dishes[r.food] = (dishes[r.food] || 0) + 1;
    });
    return {
      total: rows.filter((r) => !r.deleted).length,
      cancelled: rows.filter((r) => r.deleted).length,
      holiday: rows.filter((r) => r.holidayPaid && !r.deleted).length,
      dishSummary: Object.entries(dishes)
        .map(([dish, count]) => ({ dish, count }))
        .sort((a, b) => b.count - a.count),
    };
  }, [groups]);

  const downloadCsv = async () => {
    setDownloading(true);
    try {
      await OrderServices.downloadKitchenSheetCsv({ date, school, lunchTime });
      notifySuccess("CSV downloaded");
    } catch (err) {
      notifyError(errMessage(err));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="kitchen-print">
      <style>{PRINT_CSS}</style>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageTitle>
          Kitchen sheet — {fmtDate(date)}
          {school ? ` · ${school}` : ""}
          {lunchTime ? ` · ${lunchTime}` : ""}
        </PageTitle>
        <div className="flex items-center gap-2 no-print">
          <Button layout="outline" size="small" onClick={load}>
            <FiRefreshCw className="mr-2" /> Refresh
          </Button>
          <Button layout="outline" size="small" onClick={() => window.print()}>
            <FiPrinter className="mr-2" /> Print
          </Button>
          <Button size="small" disabled={downloading} onClick={downloadCsv}>
            <FiDownload className="mr-2" /> {downloading ? "Preparing..." : "Download CSV"}
          </Button>
        </div>
      </div>

      <Card className="min-w-0 shadow-xs overflow-hidden bg-white dark:bg-gray-800 mb-5 no-print">
        <CardBody>
          <div className="grid gap-4 md:grid-cols-4">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value || todayKey())} />
            <Select value={school} onChange={(e) => setSchool(e.target.value)}>
              <option value="">All schools</option>
              {schoolOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
            <Select value={lunchTime} onChange={(e) => setLunchTime(e.target.value)}>
              <option value="">All lunch slots</option>
              {slotOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
            <Button
              layout="outline"
              onClick={() => {
                setDate(todayKey());
                setSchool("");
                setLunchTime("");
              }}
            >
              Today / reset
            </Button>
          </div>
        </CardBody>
      </Card>

      {loading ? (
        <p className="py-10 text-center">Loading kitchen sheet...</p>
      ) : (
        <>
          <div className="grid gap-4 grid-cols-2 md:grid-cols-4 mb-5">
            <Card className="border border-emerald-200 dark:border-gray-700">
              <CardBody>
                <p className="text-xs uppercase text-gray-500">Meals to prepare</p>
                <p className="text-3xl font-bold text-emerald-700 dark:text-emerald-300">{totals.total}</p>
              </CardBody>
            </Card>
            <Card className="border border-red-200 dark:border-gray-700">
              <CardBody>
                <p className="text-xs uppercase text-gray-500">Cancelled</p>
                <p className="text-3xl font-bold text-red-600">{totals.cancelled}</p>
              </CardBody>
            </Card>
            <Card className="border border-blue-200 dark:border-gray-700">
              <CardBody>
                <p className="text-xs uppercase text-gray-500">Paid extra days</p>
                <p className="text-3xl font-bold text-blue-600">{totals.holiday}</p>
              </CardBody>
            </Card>
            <Card className="border border-gray-200 dark:border-gray-700">
              <CardBody>
                <p className="text-xs uppercase text-gray-500">Schools</p>
                <p className="text-3xl font-bold text-gray-700 dark:text-gray-200">{groups.length}</p>
              </CardBody>
            </Card>
          </div>

          {totals.dishSummary.length > 0 && (
            <Card className="mb-5 kitchen-group">
              <CardBody>
                <h3 className="text-sm font-semibold uppercase text-gray-500 mb-2">Dish totals</h3>
                <div className="flex flex-wrap gap-2">
                  {totals.dishSummary.map((d) => (
                    <span key={d.dish} className="px-3 py-1 rounded-full bg-emerald-50 dark:bg-gray-700 text-emerald-800 dark:text-emerald-200 text-sm border border-emerald-200 dark:border-gray-600">
                      {d.dish}: <strong>{d.count}</strong>
                    </span>
                  ))}
                </div>
              </CardBody>
            </Card>
          )}

          {groups.length === 0 ? (
            <Card>
              <CardBody>
                <p className="text-center py-6 text-gray-500">No meals for this day{school || lunchTime ? " with these filters" : ""}.</p>
              </CardBody>
            </Card>
          ) : (
            groups.map((g) => (
              <Card key={g.school} className="mb-6 kitchen-group">
                <CardBody>
                  <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
                    <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100">{g.school}</h2>
                    <div className="text-sm text-gray-600 dark:text-gray-300">
                      <strong>{g.total}</strong> to prepare
                      {g.cancelled ? <span className="text-red-600"> · {g.cancelled} cancelled</span> : null}
                    </div>
                  </div>
                  {g.slots.map((slot) => (
                    <div key={slot.lunchTime} className="mb-5 last:mb-0">
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-2 border-b border-gray-200 dark:border-gray-700 pb-1">
                        <h3 className="font-semibold text-gray-700 dark:text-gray-200">
                          Lunch slot: {slot.lunchTime}{" "}
                          <span className="font-normal text-sm text-gray-500">
                            ({slot.total} to prepare{slot.cancelled ? `, ${slot.cancelled} cancelled` : ""})
                          </span>
                        </h3>
                        <div className="flex flex-wrap gap-1">
                          {slot.dishSummary.map((d) => (
                            <span key={d.dish} className="text-xs px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-700">
                              {d.dish}: <strong>{d.count}</strong>
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full kitchen-table">
                          <thead>
                            <tr className="text-left text-xs uppercase text-gray-500">
                              <th className="py-1 pr-3">#</th>
                              <th className="py-1 pr-3">Child</th>
                              <th className="py-1 pr-3">Class</th>
                              <th className="py-1 pr-3">Location</th>
                              <th className="py-1 pr-3">Dish</th>
                              <th className="py-1 pr-3">Allergies</th>
                              <th className="py-1 pr-3">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {slot.rows.map((r, i) => (
                              <tr
                                key={`${r.childId}-${r.dateKey}-${r.food}-${i}`}
                                className={`border-t border-gray-100 dark:border-gray-700 text-sm ${r.deleted ? "bg-red-50 dark:bg-red-900/20 text-red-700" : ""}`}
                              >
                                <td className="py-1 pr-3 text-gray-400">{i + 1}</td>
                                <td className={`py-1 pr-3 font-medium ${r.deleted ? "kitchen-cancelled line-through" : ""}`}>
                                  {fullName(r.childFirstName, r.childLastName)}
                                </td>
                                <td className="py-1 pr-3">
                                  {r.childClass}
                                  {r.section ? ` - ${r.section}` : ""}
                                </td>
                                <td className="py-1 pr-3">{r.location}</td>
                                <td className={`py-1 pr-3 ${r.deleted ? "kitchen-cancelled line-through" : "font-medium"}`}>{r.food}</td>
                                <td className="py-1 pr-3">{r.allergies ? <span className="text-red-600 font-semibold">{r.allergies}</span> : "-"}</td>
                                <td className="py-1 pr-3">
                                  <StatusBadge row={r} />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </CardBody>
              </Card>
            ))
          )}
        </>
      )}
    </div>
  );
};

export default Kitchen;
