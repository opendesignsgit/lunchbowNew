import React, { useEffect, useState } from "react";
import { Card, CardBody, Button, Input, Label } from "@windmill/react-ui";
import PageTitle from "@/components/Typography/PageTitle";
import AppSettingsServices from "@/services/AppSettingsServices";

// Labels for each configurable mail event (keys must match the AppSettings model)
const MAIL_EVENTS = [
  ["nutrition", "Nutrition Enquiry"],
  ["trialMeal", "Trial Meal @ 99 Enquiry"],
  ["general", "General Enquiry"],
  ["contact", "Contact Us Enquiry"],
  ["school", "School Service Enquiry"],
  ["mealDelete", "Meal Deleted by Customer"],
  ["subscription", "Subscription Payment"],
  ["tryOurMeal", "Try Our Meal Order"],
];

const PRICE_FIELDS = [
  ["basePricePerDay", "Base price per day (per child)"],
  ["holidayMealPrice", "Holiday meal price"],
  ["addChildPricePerDay", "Add-child price per day"],
  ["adhocMealPrice", "Adhoc meal price"],
  ["walletCreditOnMealDelete", "Wallet credit on meal deletion"],
  ["walletRedeemCapPercent", "Wallet redemption cap (%)"],
  ["multiChildThreshold", "Multi-child discount starts at (children)"],
];

const AppSettings = () => {
  const [tab, setTab] = useState("pricing");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [pricing, setPricing] = useState(null);
  const [mail, setMail] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await AppSettingsServices.getSettings();
        const data = res?.data || res;
        setPricing(data?.pricing || null);
        setMail(data?.mail || null);
      } catch (e) {
        // Surface the real reason (status + message) — a silent "No settings found"
        // hides 401/404/500 and makes this impossible to debug.
        const status = e?.response?.status;
        const detail = e?.response?.data?.message || e?.message || "Unknown error";
        console.error("AppSettings load failed:", status, detail, e);
        setMsg({
          type: "error",
          text: `Failed to load settings${status ? ` (HTTP ${status})` : ""}: ${detail}`,
        });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const setPrice = (k, v) => setPricing((p) => ({ ...p, [k]: v }));

  const setTier = (i, k, v) =>
    setPricing((p) => {
      const tiers = [...(p.planTiers || [])];
      tiers[i] = { ...tiers[i], [k]: v };
      return { ...p, planTiers: tiers };
    });

  const addTier = () =>
    setPricing((p) => ({
      ...p,
      planTiers: [...(p.planTiers || []), { days: 0, discountSingle: 0, discountMulti: 0 }],
    }));

  const removeTier = (i) =>
    setPricing((p) => ({ ...p, planTiers: p.planTiers.filter((_, idx) => idx !== i) }));

  const setEvent = (key, field, value) =>
    setMail((m) => ({
      ...m,
      events: { ...m.events, [key]: { ...m.events[key], [field]: value } },
    }));

  const handleSave = async () => {
    setSaving(true);
    setMsg(null);
    try {
      // Normalise numbers; recipients are sent as a comma string and split server-side
      const payload = {
        pricing: {
          ...pricing,
          planTiers: (pricing.planTiers || []).map((t) => ({
            days: Number(t.days),
            discountSingle: Number(t.discountSingle),
            discountMulti: Number(t.discountMulti),
          })),
        },
        mail,
      };
      const res = await AppSettingsServices.updateSettings(payload);
      const data = res?.data || res;
      if (data?.pricing) setPricing(data.pricing);
      if (data?.mail) setMail(data.mail);
      setMsg({ type: "success", text: "Settings saved" });
    } catch (e) {
      setMsg({ type: "error", text: e?.response?.data?.message || "Failed to save settings" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-6">Loading settings...</div>;

  // Render the error banner instead of returning early, otherwise a failed fetch
  // shows a bare "No settings found." and the actual cause is invisible.
  if (!pricing || !mail) {
    return (
      <div>
        <PageTitle>Settings</PageTitle>
        {msg && (
          <div className="mb-4 px-4 py-2 rounded bg-red-100 text-red-700">{msg.text}</div>
        )}
        <p className="text-gray-600 dark:text-gray-400">
          No settings loaded. Check the browser Network tab for the{" "}
          <code>/settings</code> request and the API logs.
        </p>
      </div>
    );
  }

  return (
    <div>
      <PageTitle>Settings</PageTitle>

      {msg && (
        <div
          className={`mb-4 px-4 py-2 rounded ${
            msg.type === "error" ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"
          }`}
        >
          {msg.text}
        </div>
      )}

      <div className="mb-5 flex gap-2">
        <Button
          layout={tab === "pricing" ? "primary" : "outline"}
          onClick={() => setTab("pricing")}
        >
          Pricing
        </Button>
        <Button layout={tab === "mail" ? "primary" : "outline"} onClick={() => setTab("mail")}>
          Mail
        </Button>
      </div>

      {tab === "pricing" && (
        <Card className="mb-5">
          <CardBody>
            <div className="grid gap-4 md:grid-cols-2">
              {PRICE_FIELDS.map(([k, label]) => (
                <Label key={k}>
                  <span>{label}</span>
                  <Input
                    className="mt-1"
                    type="number"
                    min="0"
                    value={pricing[k] ?? 0}
                    onChange={(e) => setPrice(k, e.target.value)}
                  />
                </Label>
              ))}
            </div>

            <h4 className="mt-8 mb-2 font-semibold text-gray-700 dark:text-gray-300">
              Plan tiers &amp; discounts
            </h4>
            <p className="mb-3 text-sm text-gray-500 dark:text-gray-400">
              Discounts are fractions (0.05 = 5%). "Single" applies to 1 child; "Multi" applies from
              the multi-child threshold upwards. Custom date ranges never get a discount.
            </p>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500">
                    <th className="py-2">Working days</th>
                    <th>Discount (single)</th>
                    <th>Discount (multi)</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {(pricing.planTiers || []).map((t, i) => (
                    <tr key={i}>
                      <td className="py-1 pr-2">
                        <Input
                          type="number"
                          min="1"
                          value={t.days}
                          onChange={(e) => setTier(i, "days", e.target.value)}
                        />
                      </td>
                      <td className="pr-2">
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          max="1"
                          value={t.discountSingle}
                          onChange={(e) => setTier(i, "discountSingle", e.target.value)}
                        />
                      </td>
                      <td className="pr-2">
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          max="1"
                          value={t.discountMulti}
                          onChange={(e) => setTier(i, "discountMulti", e.target.value)}
                        />
                      </td>
                      <td>
                        <Button layout="link" onClick={() => removeTier(i)}>
                          Remove
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Button className="mt-3" layout="outline" onClick={addTier}>
              Add tier
            </Button>
          </CardBody>
        </Card>
      )}

      {tab === "mail" && (
        <Card className="mb-5">
          <CardBody>
            <div className="grid gap-4 md:grid-cols-2 mb-6">
              <Label>
                <span>From name</span>
                <Input
                  className="mt-1"
                  value={mail.fromName || ""}
                  onChange={(e) => setMail({ ...mail, fromName: e.target.value })}
                />
              </Label>
              <Label>
                <span>Company email (shown on invoices)</span>
                <Input
                  className="mt-1"
                  value={mail.companyEmail || ""}
                  onChange={(e) => setMail({ ...mail, companyEmail: e.target.value })}
                />
              </Label>
            </div>

            <p className="mb-3 text-sm text-gray-500 dark:text-gray-400">
              Recipients are comma-separated. Invalid addresses are dropped on save. Turning an event
              off stops that admin notification being sent.
            </p>

            {MAIL_EVENTS.map(([key, label]) => {
              const ev = mail.events?.[key];
              if (!ev) return null;
              return (
                <div key={key} className="mb-5 pb-4 border-b border-gray-200 dark:border-gray-700">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-semibold text-gray-700 dark:text-gray-300">{label}</h4>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={ev.enabled !== false}
                        onChange={(e) => setEvent(key, "enabled", e.target.checked)}
                      />
                      Enabled
                    </label>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <Label>
                      <span>Recipients (To)</span>
                      <Input
                        className="mt-1"
                        value={
                          Array.isArray(ev.recipients) ? ev.recipients.join(", ") : ev.recipients || ""
                        }
                        onChange={(e) => setEvent(key, "recipients", e.target.value.split(","))}
                        placeholder="a@x.com, b@y.com"
                      />
                    </Label>
                    <Label>
                      <span>Subject</span>
                      <Input
                        className="mt-1"
                        value={ev.subject || ""}
                        onChange={(e) => setEvent(key, "subject", e.target.value)}
                      />
                    </Label>
                    <Label>
                      <span>Cc</span>
                      <Input
                        className="mt-1"
                        value={Array.isArray(ev.cc) ? ev.cc.join(", ") : ev.cc || ""}
                        onChange={(e) => setEvent(key, "cc", e.target.value.split(","))}
                        placeholder="optional"
                      />
                    </Label>
                    <Label>
                      <span>Bcc</span>
                      <Input
                        className="mt-1"
                        value={Array.isArray(ev.bcc) ? ev.bcc.join(", ") : ev.bcc || ""}
                        onChange={(e) => setEvent(key, "bcc", e.target.value.split(","))}
                        placeholder="optional"
                      />
                    </Label>
                  </div>
                </div>
              );
            })}
          </CardBody>
        </Card>
      )}

      <Button onClick={handleSave} disabled={saving} className="bg-emerald-700">
        {saving ? "Saving..." : "Save settings"}
      </Button>
    </div>
  );
};

export default AppSettings;
