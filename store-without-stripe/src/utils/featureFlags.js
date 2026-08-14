/**
 * Feature flags for temporarily switching funnels on/off without a code change.
 *
 * NEXT_PUBLIC_* vars are inlined by Next.js at BUILD time, so changing the value
 * requires a rebuild/restart of the dev server — not just a page refresh.
 *
 * TRIAL_ENABLED — the paid trial funnel ("Trial @ 99" header CTA + /free-trial page).
 *   Disabled by default. To re-enable, add to .env.local (or .env):
 *       NEXT_PUBLIC_ENABLE_TRIAL=true
 */
export const TRIAL_ENABLED = process.env.NEXT_PUBLIC_ENABLE_TRIAL === "true";

export default { TRIAL_ENABLED };
