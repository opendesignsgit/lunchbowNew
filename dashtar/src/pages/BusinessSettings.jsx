import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardBody, Button, Input, Label, Textarea, Badge } from "@windmill/react-ui";

import PageTitle from "@/components/Typography/PageTitle";
import AdminOpsServices from "@/services/AdminOpsServices";
import { notifyError, notifySuccess } from "@/utils/toast";
import { fmtDateTime, errMessage } from "@/utils/adminOps";

/**
 * Field definitions. `path` is the dotted settings key the API accepts.
 * kind: number | int | percent | time | bool | string | intList | emailList
 */
const GROUPS = [
  {
    title: "Pricing",
    fields: [
      { path: "pricePerDayPerChild", label: "Price per day per child (₹)", kind: "number" },
      { path: "planDurations.oneMonth", label: "1-month plan days", kind: "int" },
      { path: "planDurations.threeMonths", label: "3-month plan days", kind: "int" },
      { path: "planDurations.sixMonths", label: "6-month plan days", kind: "int" },
      { path: "singleChildDiscounts.oneMonth", label: "Single child discount · 1 month (%)", kind: "percent" },
      { path: "singleChildDiscounts.threeMonths", label: "Single child discount · 3 months (%)", kind: "percent" },
      { path: "singleChildDiscounts.sixMonths", label: "Single child discount · 6 months (%)", kind: "percent" },
      { path: "multiChildDiscounts.oneMonth", label: "Multi child discount · 1 month (%)", kind: "percent" },
      { path: "multiChildDiscounts.threeMonths", label: "Multi child discount · 3 months (%)", kind: "percent" },
      { path: "multiChildDiscounts.sixMonths", label: "Multi child discount · 6 months (%)", kind: "percent" },
      { path: "multiChildThreshold", label: "Multi child threshold (children)", kind: "int" },
      { path: "holidayMealPricePerChild", label: "Holiday meal price per child (₹)", kind: "number" },
      { path: "maxChildren", label: "Max children per account", kind: "int" },
      { path: "walletMaxRedeemPercent", label: "Wallet max redeem (%)", kind: "percent" },
    ],
  },
  {
    title: "Ordering",
    fields: [
      { path: "mealCutoffTime", label: "Meal cut-off time (HH:MM, 24h)", kind: "time" },
      { path: "mealLockDaysAhead", label: "Meal lock days ahead", kind: "int" },
    ],
  },
  {
    title: "Reminders",
    fields: [{ path: "renewalReminderDays", label: "Renewal reminder days before expiry (comma separated)", kind: "intList" }],
  },
  {
    title: "Notifications",
    fields: [{ path: "adminNotifyEmails", label: "Admin notification emails (comma separated)", kind: "emailList" }],
  },
  {
    title: "Features",
    fields: [
      { path: "trialEnabled", label: "Free trial enabled", kind: "bool" },
      { path: "trialPrice", label: "Trial price (₹)", kind: "number" },
      { path: "tryOurMealEnabled", label: "“Try our meal” enabled", kind: "bool" },
    ],
  },
  {
    title: "Support",
    fields: [
      { path: "supportPhone", label: "Support phone", kind: "string" },
      { path: "supportEmail", label: "Support email", kind: "string" },
      { path: "whatsappNumber", label: "WhatsApp number", kind: "string" },
    ],
  },
];

const getPath = (obj, path) => path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);

/** Effective value → text for an input. */
const toText = (kind, v) => {
  if (v === undefined || v === null) return "";
  if (kind === "bool") return Boolean(v);
  if (kind === "intList" || kind === "emailList") return Array.isArray(v) ? v.join(", ") : String(v);
  return String(v);
};

/** Input text → API value. Returns { value } or { error }. */
const parse = (kind, text) => {
  if (kind === "bool") return { value: Boolean(text) };
  const t = String(text ?? "").trim();
  switch (kind) {
    case "number":
    case "int":
    case "percent": {
      if (t === "") return { error: "required" };
      const n = Number(t);
      if (!Number.isFinite(n)) return { error: "must be a number" };
      if (kind === "int" && !Number.isInteger(n)) return { error: "must be a whole number" };
      if (kind === "percent" && (n < 0 || n > 100)) return { error: "0–100" };
      return { value: n };
    }
    case "time":
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) return { error: 'must be "HH:MM"' };
      return { value: t };
    case "intList": {
      const parts = t.split(",").map((x) => x.trim()).filter(Boolean);
      if (!parts.length) return { error: "at least one number" };
      const nums = parts.map(Number);
      if (nums.some((n) => !Number.isInteger(n) || n < 0)) return { error: "whole numbers only" };
      return { value: nums };
    }
    case "emailList":
      return { value: t ? t.split(",").map((x) => x.trim()).filter(Boolean) : [] };
    default:
      return { value: t };
  }
};

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const BusinessSettings = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({});
  const [channels, setChannels] = useState({});
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState({});
  const [clearing, setClearing] = useState(new Set());

  const resetFrom = useCallback((d) => {
    const next = {};
    GROUPS.forEach((g) => g.fields.forEach((f) => (next[f.path] = toText(f.kind, getPath(d.effective, f.path)))));
    setForm(next);
    setChannels(d.effective?.notificationChannels || {});
    setClearing(new Set());
    setErrors({});
    setReason("");
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await AdminOpsServices.getSettings();
      setData(res?.data || null);
      if (res?.data) resetFrom(res.data);
    } catch (err) {
      notifyError(errMessage(err));
    } finally {
      setLoading(false);
    }
  }, [resetFrom]);

  useEffect(() => {
    load();
  }, [load]);

  const overrides = data?.overrides || {};
  const hasOverride = (path) => getPath(overrides, path) !== undefined || overrides[path] !== undefined;
  const defaultOf = (path) => getPath(data?.defaults || {}, path);

  const events = data?.notificationEvents || [];
  const allChannels = data?.channels || ["dashboard", "email", "push", "digest"];
  const channelOverrides = overrides.notificationChannels || {};

  const toggleChannel = (type, ch) => {
    setChannels((c) => {
      const ev = events.find((e) => e.type === type);
      const current = c[type] || ev?.defaultChannels || [];
      const next = current.includes(ch) ? current.filter((x) => x !== ch) : [...current, ch];
      return { ...c, [type]: next };
    });
  };

  const resetChannel = (type) => {
    setChannels((c) => {
      const next = { ...c };
      delete next[type];
      return next;
    });
  };

  const toggleClear = (path) => {
    setClearing((s) => {
      const next = new Set(s);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const patch = useMemo(() => {
    if (!data) return { body: {}, errors: {} };
    const body = {};
    const errs = {};
    GROUPS.forEach((g) =>
      g.fields.forEach((f) => {
        if (clearing.has(f.path)) {
          if (hasOverride(f.path)) body[f.path] = null;
          return;
        }
        const effective = getPath(data.effective, f.path);
        const parsed = parse(f.kind, form[f.path]);
        if (parsed.error) {
          if (!same(toText(f.kind, effective), form[f.path])) errs[f.path] = parsed.error;
          return;
        }
        if (!same(parsed.value, effective)) body[f.path] = parsed.value;
      })
    );
    // Notification channels: send the full override map when it changed.
    const effChannels = data.effective?.notificationChannels || {};
    if (!same(channels, effChannels)) body.notificationChannels = channels;
    return { body, errors: errs };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, form, channels, clearing]);

  const dirty = Object.keys(patch.body).length > 0;

  const save = async () => {
    if (Object.keys(patch.errors).length) {
      setErrors(patch.errors);
      return notifyError("Fix the highlighted fields first");
    }
    if (!dirty) return notifyError("Nothing changed");
    setSaving(true);
    setErrors({});
    try {
      const res = await AdminOpsServices.updateSettings({ ...patch.body, reason: reason.trim() });
      notifySuccess(`Saved: ${(res?.changed || []).join(", ")}`);
      setData(res?.data || null);
      if (res?.data) resetFrom(res.data);
    } catch (err) {
      const list = err?.response?.data?.errors;
      if (Array.isArray(list)) {
        // "path: message" per entry
        const mapped = {};
        list.forEach((e) => {
          const m = String(e).match(/^([^:]+):\s*(.*)$/);
          if (m) mapped[m[1].trim()] = m[2];
        });
        setErrors(mapped);
      }
      notifyError(errMessage(err));
    } finally {
      setSaving(false);
    }
  };

  if (loading || !data) return <p className="py-10 text-center">{loading ? "Loading settings..." : "Settings unavailable"}</p>;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageTitle>Settings</PageTitle>
        <div className="text-xs text-gray-500">
          {data.updatedAt ? `Last change ${fmtDateTime(data.updatedAt)}` : "No overrides saved yet"}
          {data.updatedBy?.name ? ` by ${data.updatedBy.name}` : ""}
        </div>
      </div>

      <p className="text-sm text-gray-500 mb-4">
        Values are the merge of defaults ← server .env ← overrides saved here. Fields marked{" "}
        <Badge type="primary">override</Badge> replace the env/default value; tick “clear” to go back to it.
      </p>

      {GROUPS.map((g) => (
        <Card key={g.title} className="mb-6">
          <CardBody>
            <h3 className="text-base font-semibold text-gray-700 dark:text-gray-200 mb-4">{g.title}</h3>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {g.fields.map((f) => {
                const ov = hasOverride(f.path);
                const def = defaultOf(f.path);
                const err = errors[f.path] || patch.errors[f.path];
                const isClearing = clearing.has(f.path);
                return (
                  <div key={f.path} className={isClearing ? "opacity-60" : ""}>
                    <Label>
                      <span className="flex items-center gap-2">
                        {f.label}
                        {ov && <Badge type="primary">override</Badge>}
                      </span>
                      {f.kind === "bool" ? (
                        <div className="mt-2">
                          <label className="inline-flex items-center gap-2 text-sm">
                            <input type="checkbox" checked={Boolean(form[f.path])} disabled={isClearing} onChange={(e) => setForm({ ...form, [f.path]: e.target.checked })} />
                            <span>{form[f.path] ? "On" : "Off"}</span>
                          </label>
                        </div>
                      ) : f.kind === "emailList" || f.kind === "intList" ? (
                        <Textarea className="mt-1" rows="2" value={form[f.path] ?? ""} disabled={isClearing} valid={err ? false : undefined} onChange={(e) => setForm({ ...form, [f.path]: e.target.value })} />
                      ) : (
                        <Input
                          className="mt-1"
                          type={f.kind === "string" || f.kind === "time" ? "text" : "number"}
                          step={f.kind === "int" ? "1" : "any"}
                          value={form[f.path] ?? ""}
                          disabled={isClearing}
                          valid={err ? false : undefined}
                          onChange={(e) => setForm({ ...form, [f.path]: e.target.value })}
                        />
                      )}
                    </Label>
                    <div className="flex items-center justify-between mt-1 text-xs">
                      <span className="text-gray-400">
                        {ov ? `Overrides env/default (${toText(f.kind, def) === "" ? "unset" : String(toText(f.kind, def))})` : "env/default value"}
                      </span>
                      {ov && (
                        <label className="inline-flex items-center gap-1 text-gray-500">
                          <input type="checkbox" checked={isClearing} onChange={() => toggleClear(f.path)} /> clear
                        </label>
                      )}
                    </div>
                    {err && <p className="text-xs text-red-600 mt-1">{err}</p>}
                  </div>
                );
              })}
            </div>
          </CardBody>
        </Card>
      ))}

      <Card className="mb-6">
        <CardBody>
          <h3 className="text-base font-semibold text-gray-700 dark:text-gray-200 mb-1">Notification channels per event</h3>
          <p className="text-xs text-gray-500 mb-4">
            Defaults follow severity (critical → email + push, warning → push + digest, info → dashboard + digest). Dashboard is always on.
            {errors.notificationChannels && <span className="text-red-600 ml-2">{errors.notificationChannels}</span>}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs uppercase text-gray-500">
                  <th className="py-2 pr-3">Event</th>
                  <th className="py-2 pr-3">Severity</th>
                  {allChannels.map((c) => (
                    <th key={c} className="py-2 pr-3">
                      {c}
                    </th>
                  ))}
                  <th className="py-2 pr-3"></th>
                </tr>
              </thead>
              <tbody>
                {events.map((ev) => {
                  const current = channels[ev.type] || ev.defaultChannels || [];
                  const overridden = Boolean(channels[ev.type]);
                  return (
                    <tr key={ev.type} className="border-t border-gray-100 dark:border-gray-700 text-sm">
                      <td className="py-1.5 pr-3">
                        <div>{ev.title}</div>
                        <div className="text-xs text-gray-400">{ev.type}</div>
                      </td>
                      <td className="py-1.5 pr-3">
                        <Badge type={ev.severity === "critical" ? "danger" : ev.severity === "warning" ? "warning" : "neutral"}>{ev.severity}</Badge>
                      </td>
                      {allChannels.map((c) => (
                        <td key={c} className="py-1.5 pr-3">
                          <input
                            type="checkbox"
                            checked={current.includes(c) || c === "dashboard"}
                            disabled={c === "dashboard"}
                            onChange={() => toggleChannel(ev.type, c)}
                          />
                        </td>
                      ))}
                      <td className="py-1.5 pr-3 text-xs">
                        {overridden ? (
                          <span className="inline-flex items-center gap-2">
                            {channelOverrides[ev.type] && <Badge type="primary">override</Badge>}
                            <button type="button" className="text-emerald-600 hover:underline" onClick={() => resetChannel(ev.type)}>
                              use default
                            </button>
                          </span>
                        ) : (
                          <span className="text-gray-400">default</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>

      <Card className="mb-10">
        <CardBody>
          <div className="grid gap-4 md:grid-cols-3 items-end">
            <Label className="md:col-span-2">
              <span>Reason for this change (stored in the audit log)</span>
              <Input className="mt-1" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. price revision from 1 June" />
            </Label>
            <div className="flex gap-2 justify-end">
              <Button layout="outline" onClick={() => resetFrom(data)} disabled={saving}>
                Discard
              </Button>
              <Button onClick={save} disabled={saving || !dirty}>
                {saving ? "Saving..." : `Save${dirty ? ` (${Object.keys(patch.body).length})` : ""}`}
              </Button>
            </div>
          </div>
          {Object.keys(patch.errors).length > 0 && (
            <p className="text-xs text-red-600 mt-2">Invalid: {Object.entries(patch.errors).map(([k, v]) => `${k} (${v})`).join(", ")}</p>
          )}
        </CardBody>
      </Card>
    </>
  );
};

export default BusinessSettings;
