# Gameplay 500 Evaluation

- Scenarios completed: 500/500
- Resolved deal forecasts: 2359
- Mechanical health: PASS
- Scoring integrity: PASS
- ML right/off: 1617/742
- AI-agent market right/off: 1491/868
- Consensus market right/off: 1521/838
- FNG right/off: 1379/980
- Mean Brier: ML 0.2355, AI-agent 0.2364, Consensus 0.2363, FNG 0.2818
- LR consensus vs ML: -7.74
- LR consensus vs AI-agent market: 0.55

## Run Winners

{
  "market": 147,
  "ml": 216,
  "fng": 137
}

## Best Consensus Lift vs ML

| Subset | N | ML Brier | Agent Brier | Consensus Brier | Consensus lift vs ML | Consensus lift vs agent |
|---|---:|---:|---:|---:|---:|---:|
| Stage: Technical Validation | 248 | 0.2636 | 0.2391 | 0.2449 | +0.0187 | -0.0058 |
| Forecast: Best Case | 248 | 0.2636 | 0.2391 | 0.2449 | +0.0187 | -0.0058 |
| Stage: Qualified | 248 | 0.2750 | 0.2582 | 0.2596 | +0.0154 | -0.0013 |
| Forecast: Omitted | 248 | 0.2750 | 0.2582 | 0.2596 | +0.0154 | -0.0013 |
| Low-value deals | 870 | 0.2329 | 0.2215 | 0.2230 | +0.0099 | -0.0015 |
| Target: slipped_to_next_quarter | 742 | 0.2549 | 0.2441 | 0.2464 | +0.0086 | -0.0023 |
| Policy: contrarian | 307 | 0.2352 | 0.2344 | 0.2277 | +0.0075 | +0.0067 |
| Target: legal_approved_by_date | 500 | 0.2494 | 0.2434 | 0.2428 | +0.0066 | +0.0006 |

## Worst Consensus Lift vs ML

| Subset | N | ML Brier | Agent Brier | Consensus Brier | Consensus lift vs ML | Consensus lift vs agent |
|---|---:|---:|---:|---:|---:|---:|
| Human moved consensus >= 5pp | 176 | 0.2316 | 0.2328 | 0.2483 | -0.0167 | -0.0154 |
| Policy: optimistic | 171 | 0.2355 | 0.2444 | 0.2518 | -0.0162 | -0.0073 |
| High-value deals | 620 | 0.2280 | 0.2466 | 0.2441 | -0.0161 | +0.0025 |
| Consensus disagrees with ML >= 5pp | 365 | 0.2361 | 0.2415 | 0.2495 | -0.0134 | -0.0080 |
| Stage: Business Case | 748 | 0.2022 | 0.2157 | 0.2138 | -0.0116 | +0.0019 |
| Target: closed_above_threshold | 1117 | 0.2163 | 0.2281 | 0.2266 | -0.0103 | +0.0014 |
| Policy: random | 171 | 0.2355 | 0.2365 | 0.2450 | -0.0095 | -0.0085 |
| Deal count: 3 | 378 | 0.2179 | 0.2252 | 0.2244 | -0.0065 | +0.0008 |

## Best Consensus Lift vs AI-Agent Market

| Subset | N | ML Brier | Agent Brier | Consensus Brier | Consensus lift vs ML | Consensus lift vs agent |
|---|---:|---:|---:|---:|---:|---:|
| Policy: contrarian | 307 | 0.2352 | 0.2344 | 0.2277 | +0.0075 | +0.0067 |
| High-value deals | 620 | 0.2280 | 0.2466 | 0.2441 | -0.0161 | +0.0025 |
| Policy: high_conviction | 342 | 0.2355 | 0.2347 | 0.2322 | +0.0033 | +0.0024 |
| Stage: Business Case | 748 | 0.2022 | 0.2157 | 0.2138 | -0.0116 | +0.0019 |
| Policy: calibrated_blend | 342 | 0.2355 | 0.2368 | 0.2353 | +0.0002 | +0.0015 |
| Policy: pessimistic | 171 | 0.2355 | 0.2356 | 0.2341 | +0.0014 | +0.0015 |
| Target: closed_above_threshold | 1117 | 0.2163 | 0.2281 | 0.2266 | -0.0103 | +0.0014 |
| Run length: 15 | 798 | 0.2355 | 0.2367 | 0.2354 | +0.0001 | +0.0013 |

## Notes

The current result field may use absolute-error winners while the headline uses aggregate Brier; this flags any divergence.
