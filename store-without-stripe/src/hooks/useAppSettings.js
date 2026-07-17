import { useEffect, useState } from "react";
import AppSettingsServices from "@services/AppSettingsServices";

/**
 * Admin-controlled pricing, fetched once and cached for the tab.
 *
 * IMPORTANT: `DEFAULT_PRICING` mirrors the values that used to be hardcoded.
 * If the API is unreachable we fall back to it so checkout can never be blocked
 * by a settings outage — the price shown then matches today's behaviour.
 */
export const DEFAULT_PRICING = {
  basePricePerDay: 225,
  holidayMealPrice: 225,
  addChildPricePerDay: 225,
  adhocMealPrice: 250,
  walletCreditOnMealDelete: 225,
  walletRedeemCapPercent: 80,
  multiChildThreshold: 2,
  planTiers: [
    { days: 22, discountSingle: 0, discountMulti: 0.05 },
    { days: 66, discountSingle: 0.05, discountMulti: 0.15 },
    { days: 132, discountSingle: 0.1, discountMulti: 0.2 },
  ],
};

// Module-level cache + in-flight promise so multiple components share one request.
let cached = null;
let inFlight = null;

export const fetchPricing = async () => {
  if (cached) return cached;
  if (inFlight) return inFlight;

  inFlight = AppSettingsServices.getPublicSettings()
    .then((res) => {
      const pricing = res?.pricing || res?.data?.pricing;
      cached = { ...DEFAULT_PRICING, ...(pricing || {}) };
      return cached;
    })
    .catch((err) => {
      console.error("useAppSettings: falling back to defaults —", err?.message);
      cached = DEFAULT_PRICING;
      return cached;
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
};

/** Build the {days: discount} map for a given child count, from planTiers. */
export const getDiscountMap = (pricing, childCount = 1) => {
  const isMulti = childCount >= (pricing.multiChildThreshold ?? 2);
  const map = {};
  (pricing.planTiers || []).forEach((t) => {
    map[t.days] = isMulti ? t.discountMulti : t.discountSingle;
  });
  return map;
};

const useAppSettings = () => {
  const [pricing, setPricing] = useState(cached || DEFAULT_PRICING);
  const [loading, setLoading] = useState(!cached);

  useEffect(() => {
    let mounted = true;
    fetchPricing().then((p) => {
      if (mounted) {
        setPricing(p);
        setLoading(false);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  return { pricing, loading };
};

export default useAppSettings;
