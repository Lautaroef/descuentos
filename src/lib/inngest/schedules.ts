// Cron schedule definitions (TZ=America/Argentina/Buenos_Aires).
//
// These strings are consumed in two places:
//   1. The Inngest function definitions — one `cron:` trigger per source.
//   2. The health-check expected-cadence table — how often we expect a successful
//      run for each source, so we know when to alert.
//
// Using a shared source-of-truth avoids the classic drift bug where a cadence
// alert fires because the schedule silently changed but the alert threshold
// didn't. If you change a cron here, the cadence used by staleness detection
// follows automatically.
//
// Times are ART (UTC-3). Inngest supports `TZ=America/Argentina/Buenos_Aires`
// prefixes in cron expressions directly — no UTC math required.

export interface SourceSchedule {
  source_id: string;
  /** Inngest function id. Kebab-case, stable across renames. */
  function_id: string;
  /** Human-friendly label for dashboards. */
  display_name: string;
  /** Cron expression including TZ prefix. */
  cron: string;
  /**
   * Expected cadence in minutes. Used by the health-check to decide when a source
   * is stale. Must align with `cron` — e.g., a weekly cron → 10080 minutes.
   */
  expected_cadence_minutes: number;
}

const WEEKLY = 7 * 24 * 60;      // 10080
const BIWEEKLY = 15 * 24 * 60;   // 21600 — "1st and 15th of the month"

/**
 * The authoritative schedule table. Order doesn't matter; every entry becomes
 * one Inngest function.
 *
 * Stagger: MODO Monday 04:00 (primary source — highest priority; we want it done
 * first so the UI has fresh data even if downstream runs fail). Supermarket
 * catalogs an hour later (Monday 05:00) so they see MODO's fresh promos as
 * reference data if we ever cross-reference. Fintech wallets move to Tuesday so
 * we don't pile 7 scrapes on one morning.
 */
export const SOURCE_SCHEDULES: SourceSchedule[] = [
  // --- Monday MODO block ---
  {
    source_id: 'modo',
    function_id: 'ingest-modo',
    display_name: 'MODO',
    cron: 'TZ=America/Argentina/Buenos_Aires 0 4 * * 1',
    expected_cadence_minutes: WEEKLY,
  },

  // --- Monday supermarket block (05:00 ART) ---
  {
    source_id: 'coto-descuentos',
    function_id: 'ingest-coto',
    display_name: 'Coto — /descuentos',
    cron: 'TZ=America/Argentina/Buenos_Aires 0 5 * * 1',
    expected_cadence_minutes: WEEKLY,
  },
  {
    source_id: 'jumbo-descuentos',
    function_id: 'ingest-jumbo',
    display_name: 'Jumbo — /descuentos-del-dia',
    cron: 'TZ=America/Argentina/Buenos_Aires 0 5 * * 1',
    expected_cadence_minutes: WEEKLY,
  },
  {
    source_id: 'carrefour-descuentos-bancarios',
    function_id: 'ingest-carrefour',
    display_name: 'Carrefour — /descuentos-bancarios',
    cron: 'TZ=America/Argentina/Buenos_Aires 0 5 * * 1',
    expected_cadence_minutes: WEEKLY,
  },

  // --- Tuesday wallets block (04:00 ART) ---
  {
    source_id: 'naranjax',
    function_id: 'ingest-naranjax',
    display_name: 'Naranja X',
    cron: 'TZ=America/Argentina/Buenos_Aires 0 4 * * 2',
    expected_cadence_minutes: WEEKLY,
  },
  {
    source_id: 'uala',
    function_id: 'ingest-uala',
    display_name: 'Ualá',
    cron: 'TZ=America/Argentina/Buenos_Aires 0 4 * * 2',
    expected_cadence_minutes: WEEKLY,
  },
  {
    source_id: 'brubank',
    function_id: 'ingest-brubank',
    display_name: 'Brubank',
    cron: 'TZ=America/Argentina/Buenos_Aires 0 4 * * 2',
    expected_cadence_minutes: WEEKLY,
  },
  {
    source_id: 'personalpay',
    function_id: 'ingest-personalpay',
    display_name: 'Personal Pay',
    cron: 'TZ=America/Argentina/Buenos_Aires 0 4 * * 2',
    expected_cadence_minutes: WEEKLY,
  },

  // --- Cuenta DNI: 1st and 15th of the month (press articles drop monthly) ---
  {
    source_id: 'cuenta-dni',
    function_id: 'ingest-cuentadni',
    display_name: 'Cuenta DNI (press extraction)',
    cron: 'TZ=America/Argentina/Buenos_Aires 0 4 1,15 * *',
    expected_cadence_minutes: BIWEEKLY,
  },
];

/**
 * Health-check cron: daily at 09:00 ART. One summary per day keeps the signal-to-
 * noise ratio high — if anything broke over the last 24h, we hear about it.
 */
export const HEALTH_CHECK_CRON = 'TZ=America/Argentina/Buenos_Aires 0 9 * * *';
