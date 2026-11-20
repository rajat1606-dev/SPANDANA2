# Sample uploads: 1980s voltage rules vs the trained models

Eight real PTB-XL recordings from the held-out test fold (fold 10), exported straight from the raw 100 Hz signals. Upload any of them on the ECG Analysis page; the numbers below are what the backend returns.

**How each method decides**

| Method | Era | Decides by |
|---|---|---|
| Sokolow-Lyon | 1949 | S in V1 + tallest R in V5/V6 >= 3.5 mV |
| Cornell | 1985 | R in aVL + S in V3 >= 2.8 mV (men) / 2.0 mV (women) |
| Perceptron | trained here | 5 voltages + age/sex, linear |
| CNN | trained here | the whole 12-lead waveform, 1-D convolutions |

Model thresholds are the tuned operating points from training, not 0.5.

| Recording | Truth | Sokolow-Lyon | Cornell | Perceptron | CNN | Outcome |
|---|---|---|---|---|---|---|
| `ecg_10594_LVH_both_rules_miss.csv` | LVH | 3.23 mV -> normal MISS | 1.43 mV -> normal MISS | 0.026 -> normal MISS | 0.973 -> LVH ok | **modern wins** |
| `ecg_160_control_false_alarm.csv` | control | 2.46 mV -> normal ok | 2.33 mV -> LVH MISS | 0.027 -> normal ok | 0.029 -> normal ok | **modern wins** |
| `ecg_1961_LVH_sokolow_only.csv` | LVH | 3.70 mV -> LVH ok | 1.86 mV -> normal MISS | 0.061 -> normal MISS | 0.801 -> normal MISS | **old rules win** |
| `ecg_21325_LVH_cornell_only.csv` | LVH | 2.66 mV -> normal MISS | 6.47 mV -> LVH ok | 0.041 -> normal MISS | 0.141 -> normal MISS | **old rules win** |
| `ecg_685_control_rule_false_alarm2.csv` | control | 5.43 mV -> LVH MISS | 2.91 mV -> LVH MISS | 0.068 -> normal ok | 0.323 -> normal ok | **modern wins** |
| `ecg_8241_LVH_both_rules_miss.csv` | LVH | 3.05 mV -> normal MISS | 2.33 mV -> normal MISS | 0.057 -> normal MISS | 0.966 -> LVH ok | **modern wins** |
| `ecg_8963_normal_clear.csv` | control | 1.09 mV -> normal ok | 0.70 mV -> normal ok | 0.003 -> normal ok | 0.000 -> normal ok | **tie** |
| `ecg_9869_LVH_concordant.csv` | LVH | 8.01 mV -> LVH ok | 5.03 mV -> LVH ok | 0.994 -> LVH ok | 1.000 -> LVH ok | **tie** |

Across these eight files: the two voltage rules are right on **7 of 16** verdicts, the two models on **10 of 16**.

These eight were picked to be instructive, not representative - they deliberately include the cases where each method breaks. The honest whole-test-fold numbers (101 LVH in 2,085 recordings) are in the README: CNN 72/101 caught at 28 false alarms, Sokolow-Lyon 62/101.

## The 30-recording batch

`batch/` holds thirty more test-fold recordings, and `batch_ANSWER_KEY.csv`
carries the same columns as the key above. Across those thirty the two
voltage rules and the two models are level: **40 of 60 verdicts each**
(models ahead on 4 files, rules ahead on 4, the other 22 tied).

That is worth saying out loud rather than hiding: on a handful of files the
winner depends on which handful. The separation the project actually claims
shows up over the whole held-out fold, not over thirty cases.

## Reproducing these keys

Both keys are generated, never hand-edited. With the backend running:

```
python scripts/score_sample_uploads.py sample_uploads
python scripts/score_sample_batch.py sample_uploads
```

Each script cross-checks the backend's voltage sums against the project's
own stored values and stops if they disagree, so a lead-order mistake fails
loudly instead of producing a plausible wrong table.
