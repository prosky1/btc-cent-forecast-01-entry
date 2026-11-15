[![make.fun · btc-cent-forecast-01](https://make.fun/badge/btc-cent-forecast-01.svg)](https://make.fun/bounty/btc-cent-forecast-01?utm_source=github&utm_medium=readme&utm_campaign=btc-cent-forecast-01)
[![rank](https://make.fun/badge/btc-cent-forecast-01/prosky1/btc-cent-forecast-01-entry/rank.svg)](https://make.fun/bounty/btc-cent-forecast-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-cent-forecast-01)
[![reward](https://make.fun/badge/btc-cent-forecast-01/prosky1/btc-cent-forecast-01-entry/reward.svg)](https://make.fun/bounty/btc-cent-forecast-01?utm_source=github&utm_medium=readme&utm_campaign=btc-cent-forecast-01)

# BTC cent forecast — 4-hour-ahead forecaster

Entry for [make.fun](https://make.fun) competition `btc-cent-forecast-01`:
forecast Bitcoin's US-dollar price 240 minutes after each checkpoint, from the
last 72 hours of 1-minute closes. Ranked by mean absolute error in cents
(lower is better); a prize needs a score strictly below the house persistence
baseline.

## Method

Absolute error is a proper score for a point forecast, so the target is the
honest conditional **median**. BTC 4 h returns are close to a martingale, so
the forecast stays close to the checkpoint close, with a mild pull toward two
slow anchors of the recent price level:

- **Anchor A** — median close of the last 24 h, pull weight 0.25.
- **Anchor B** — exponentially-weighted mean of log price (6 h halflife),
  pull weight 0.40.

The forecast is the geometric mean of the two anchored estimates, with a
safety rail capping the move at ±5% from the checkpoint close.

No drift/trend term: every drift and trend estimator tested (median 4 h
return, linear-trend extrapolation) was *worse* than persistence in
walk-forward testing, so none is used.

## Validation (practice instance, 6 cases p00–p05)

- Walk-forward inside the 72 h windows (2,304 origins, 10-minute step,
  240-minute horizon): **~3.5% lower MAE than persistence**, winning in all
  6 windows. Per-case walk-forward MAE: see
  `competition-intelligence/btc-cent-forecast-01-experiments.md` in the
  builder's notes (kept outside this repo).
- Practice checkpoints (5 reconstructable, actual = next case's last close):
  mean absolute error **49,730 cents** vs persistence **47,055 cents**.
  Those 5 draws are noisy (SE of their mean ≈ 24% of the mean); the
  walk-forward evidence on the same price data is what the design follows,
  and the pulls are kept small so the downside is bounded.
- Full practice score (6 cases, including p05 whose actual is not in the kit)
  is measured by the server on submission.

## Run

```sh
mkdir -p out && MAKEFUN_INPUT_DIR=input MAKEFUN_OUTPUT_DIR=out node main.ts
```

Node 22, standard library only. Deterministic, offline, no randomness.
Reads every `*.in` in the input directory and writes `<id>.out` with
`{"forecasts":[{"case":"<id>","price":<number>}]}`.

## License

MIT — see `LICENSE`.
