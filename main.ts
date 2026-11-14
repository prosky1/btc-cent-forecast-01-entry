// btc-cent-forecast-01 entry: 4-hour-ahead BTC price forecast (Node 22, stdlib only).
//
// Scoring is mean absolute error in cents, so the honest conditional MEDIAN is the
// optimal point forecast. BTC 4h returns are close to a martingale, so the forecast
// stays close to the checkpoint close (persistence), with a mild, robust pull toward
// two slow anchors of the recent price level:
//
//   anchor A: the median close of the last 24 h (1440 closes)
//   anchor B: an exponentially-weighted mean of log price, 6 h halflife
//
// The forecast is the geometric mean of the two anchored estimates, each pulling the
// last price only part-way toward its anchor (25% toward A, 40% toward B). Both pulls
// are small, bounded, and symmetric, so a trending market is never chased and a
// range-bound market gets a small mean-reversion edge.
//
// Evidence (practice instance, 6 cases p00..p05, 10-11 Nov 2026):
//   - Walk-forward over every 10th minute origin inside the 72 h windows
//     (2,304 origins, horizon 240 min): this estimator beats persistence by ~3.5%
//     in mean absolute error, winning in all 6 windows.
//   - Drift/trend estimators (median 4 h return, linear-trend extrapolation)
//     were all WORSE than persistence walk-forward (+2% to +41%), so no drift
//     term is used. Strong pulls (k >= 0.4) also lose; the chosen pulls sit on
//     the broad, flat optimum (k_A 0.15-0.30, k_B 0.25-0.40 all within ~1%).
//   - The 5 reconstructable practice checkpoints (actual = next case's last
//     close) show this estimator ~5% worse than persistence — but those are 5
//     noisy draws (SE of their mean is ~24% of the mean), while the walk-forward
//     evidence uses the same price data with 2,304 origins. We follow the
//     walk-forward evidence and keep the pulls small so the downside is bounded.
//
// Deterministic, no network, no randomness, no fitted tables: everything is
// computed from the case file alone. Runs in milliseconds on 4,320 closes.

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const INPUT_DIR = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

/** Smallest positive price on the grid: one unit of its 5 decimals. */
const MIN_PRICE = 0.00001;
/** Largest grid price below the scorer's exclusive 10,000,000-dollar cap. */
const MAX_PRICE = 9_999_999.99999;
/** Safety rail: never forecast more than 5% away from the checkpoint close. */
const MAX_MOVE = 0.05;
/** Anchor A: median of the last 24 h (1440 closes). Pull weight toward it. */
const ANCHOR_A_WINDOW = 1440;
const ANCHOR_A_PULL = 0.25;
/** Anchor B: EWMA of log price, 6 h halflife. Pull weight toward it. */
const ANCHOR_B_HALFLIFE_MIN = 360;
const ANCHOR_B_PULL = 0.4;

interface CaseMarket {
  id: string;
  prices: number[];
}

interface Case {
  markets: CaseMarket[];
}

/** x kept on the grid's 5 decimals and inside the scorer's (0, 10,000,000). */
const price5 = (x: number): number =>
  Math.round(Math.min(MAX_PRICE, Math.max(MIN_PRICE, x)) * 1e5) / 1e5;

/** Median of a numeric array (copy, sort, middle). */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[mid] as number)
    : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}

/**
 * Forecast the close 240 minutes after the checkpoint from the case's closes.
 * last = checkpoint close. Returns last pulled part-way toward the two anchors.
 * With fewer than 2 usable closes there is no anchor information, so the
 * forecast is the checkpoint close itself (persistence).
 */
function forecast(prices: number[]): number {
  const finite = prices.filter((p) => typeof p === 'number' && Number.isFinite(p) && p > 0);
  if (finite.length === 0) throw new Error('market has no usable prices');
  const last = finite[finite.length - 1] as number;
  if (finite.length < 2) return price5(last);
  const logLast = Math.log(last);

  // Anchor A: median of the last 24 h.
  const recent = finite.slice(-ANCHOR_A_WINDOW);
  const logAnchorA = Math.log(median(recent));

  // Anchor B: EWMA of log price over the whole window, 6 h halflife.
  const alpha = 1 - Math.pow(0.5, 1 / ANCHOR_B_HALFLIFE_MIN);
  let ewma = Math.log(finite[0] as number);
  for (let i = 1; i < finite.length; i++) {
    ewma += alpha * (Math.log(finite[i] as number) - ewma);
  }

  // Geometric mean of the two anchored estimates: each pulls log-price toward
  // its anchor, then the two pulls are averaged.
  const pullA = ANCHOR_A_PULL * (logAnchorA - logLast);
  const pullB = ANCHOR_B_PULL * (ewma - logLast);
  const logForecast = logLast + 0.5 * (pullA + pullB);

  // Safety rail: cap the move at +/-5% from the checkpoint close. The anchors
  // are slow (24 h median, 6 h halflife EWMA), so their combined pull only
  // reaches this cap after a >15% dislocation; the rail guards against a
  // pathological input, not against normal market moves.
  const capped = Math.min(MAX_MOVE, Math.max(-MAX_MOVE, logForecast - logLast));
  return price5(last * Math.exp(capped));
}

mkdirSync(OUTPUT_DIR, { recursive: true });
// Every case file, in name order, so two runs write the same bytes.
const inputs = readdirSync(INPUT_DIR).filter((f) => f.endsWith('.in')).sort();
for (const file of inputs) {
  const id = file.slice(0, -'.in'.length);
  const c = JSON.parse(readFileSync(join(INPUT_DIR, file), 'utf8')) as Case;
  if (!Array.isArray(c.markets) || c.markets.length !== 1) {
    throw new Error(`${file} does not hold exactly one market`);
  }
  const market = c.markets[0] as CaseMarket;
  writeFileSync(
    join(OUTPUT_DIR, `${id}.out`),
    `${JSON.stringify({ forecasts: [{ case: id, price: forecast(market.prices) }] })}\n`,
  );
}
