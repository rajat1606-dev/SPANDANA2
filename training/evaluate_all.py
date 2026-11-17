#!/usr/bin/env python3
"""SPANDANA — evaluate all four LVH-screening approaches on the SAME
patient-wise test set (strat_fold 10), with thresholds frozen on validation.

  1. Sokolow-Lyon  (score = S(V1) + max(R(V5), R(V6)) voltage, mV)
  2. Cornell       (score = R(aVL) + S(V3) voltage, mV)
  3. Perceptron    (calibrated probability, backend/models/perceptron_*.joblib/json)
  4. CNN           (sigmoid probability, backend/models/cnn_best.pt)

For the voltage criteria BOTH operating points are reported:
  classic  — the literature thresholds (3.5 mV / 2.8-2.0 mV)
  tuned    — threshold chosen on validation fold 9 for max F1 (fair comparison)

Outputs (data/reports/):
  model_comparison.csv / model_comparison.json
  roc_curves.png / pr_curves.png / confusion_matrices.png / comparison_chart.png
and backend/models/metrics.json (payload served by GET /api/v1/models/metrics).

Usage:
    python training/evaluate_all.py
"""
from __future__ import annotations

import json

import joblib
import numpy as np
import pandas as pd
import torch
from sklearn.metrics import f1_score

from cnn_model import load_cnn, normalize, to_channels_first
from config import load_config
from metrics import classification_metrics, roc_pr_points

API_NAMES = {"sokolow": "Sokolow–Lyon", "cornell": "Cornell",
             "perceptron": "Perceptron", "cnn": "CNN"}


def tuned_threshold(y: np.ndarray, score: np.ndarray) -> float:
    cand = np.unique(np.round(score, 4))
    best_f1, best_t = -1.0, 0.5
    for t in cand:
        f1 = f1_score(y, score >= t, zero_division=0)
        if f1 > best_f1:
            best_f1, best_t = f1, float(t)
    return best_t


def main() -> None:
    cfg = load_config()
    fr = pd.read_csv(cfg.feature_rows_path)
    val, test = fr[fr["split"] == "val"], fr[fr["split"] == "test"]
    y_va = (val["label"] == "LVH_positive").astype(int).values
    y_te = (test["label"] == "LVH_positive").astype(int).values
    print(f"val {len(val)} ({y_va.sum()} LVH) | test {len(test)} ({y_te.sum()} LVH)")

    methods: dict[str, dict] = {}

    # ---- 1 + 2: voltage criteria ----------------------------------------
    crit = {
        "sokolow": ("sokolow_lyon_sum", 3.5, None),
        "cornell": ("cornell_sum", None, test["cornell_threshold_mV"].values),
    }
    for key, (col, classic, per_row_thr) in crit.items():
        s_va, s_te = val[col].values, test[col].values
        thr_tuned = tuned_threshold(y_va, s_va)
        if classic is not None:  # fixed literature threshold
            thr_classic = float(classic)
            classic_pred_te = s_te >= thr_classic
        else:  # sex-specific classic thresholds, applied per recording
            thr_classic = float(per_row_thr[0])  # representative value, display only
            classic_pred_te = s_te >= test["cornell_threshold_mV"].values
        m = classification_metrics(y_te, s_te >= thr_tuned, s_te)
        m_classic = classification_metrics(y_te, classic_pred_te, s_te)
        methods[key] = {"name": API_NAMES[key], "family": "criterion",
                        "score_column": col,
                        "classic_threshold_mV": thr_classic,
                        "classic_test": m_classic,
                        "tuned_threshold_mV": thr_tuned,
                        "tuned_test": m,
                        **roc_pr_points(y_te, s_te)}
        print(f"{API_NAMES[key]:14s} classic thr {thr_classic:.1f} mV -> "
              f"sens {m_classic['sensitivity']:.3f} spec {m_classic['specificity']:.3f} | "
              f"tuned {thr_tuned:.2f} mV -> sens {m['sensitivity']:.3f} "
              f"spec {m['specificity']:.3f} | ROC-AUC {m['roc_auc']:.3f}")

    # ---- 3: Perceptron ----------------------------------------------------
    pipe = joblib.load(cfg.models_dir / "perceptron_pipeline.joblib")
    p_meta = json.loads((cfg.models_dir / "perceptron_meta.json").read_text(encoding="utf-8"))
    feats = p_meta["features"]
    a, b = p_meta["calibration"]["a"], p_meta["calibration"]["b"]

    def perc_prob(df: pd.DataFrame) -> np.ndarray:
        margin = pipe.decision_function(df[feats].values)
        return 1.0 / (1.0 + np.exp(-(a * margin + b)))

    p_te = perc_prob(test)
    thr_p = float(p_meta["threshold"])
    m = classification_metrics(y_te, (p_te >= thr_p).astype(int), p_te)
    methods["perceptron"] = {
        "name": API_NAMES["perceptron"], "family": "ml", "threshold": thr_p,
        "test": m, **roc_pr_points(y_te, p_te)}
    print(f"{'Perceptron':14s} thr {thr_p:.3f} -> sens {m['sensitivity']:.3f} "
          f"spec {m['specificity']:.3f} | ROC-AUC {m['roc_auc']:.3f} "
          f"PR-AUC {m['pr_auc']:.3f}")

    # ---- 4: CNN ------------------------------------------------------------
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    c_meta = json.loads((cfg.models_dir / "cnn_meta.json").read_text(encoding="utf-8"))
    cnn = load_cnn(cfg.models_dir / "cnn_best.pt", device,
                   channels=tuple(c_meta.get("channels", (32, 64, 96))),
                   dropout=c_meta.get("dropout", 0.3))
    norm = json.loads(cfg.norm_path.read_text(encoding="utf-8"))
    mean, std = np.array(norm["mean"]), np.array(norm["std"])
    X = np.load(cfg.signals_path, mmap_mode="r")

    @torch.no_grad()
    def cnn_prob(rows: np.ndarray) -> np.ndarray:
        out = []
        for s in range(0, len(rows), 128):
            rec = normalize(np.asarray(X[rows[s:s + 128]]), mean, std)
            xb = torch.from_numpy(to_channels_first(rec)).float().to(device)
            out.append(torch.sigmoid(cnn(xb)).cpu().numpy())
        return np.concatenate(out)

    p_te = cnn_prob(test["row_idx"].values)
    thr_c = float(c_meta["threshold"])
    m = classification_metrics(y_te, (p_te >= thr_c).astype(int), p_te)
    methods["cnn"] = {"name": API_NAMES["cnn"], "family": "ml",
                      "threshold": thr_c, "test": m, **roc_pr_points(y_te, p_te)}
    print(f"{'CNN':14s} thr {thr_c:.3f} -> sens {m['sensitivity']:.3f} "
          f"spec {m['specificity']:.3f} | ROC-AUC {m['roc_auc']:.3f} "
          f"PR-AUC {m['pr_auc']:.3f}")

    # ---- persist -------------------------------------------------------------
    cfg.reports_dir.mkdir(parents=True, exist_ok=True)

    def flat(key: str) -> dict:
        mm = methods[key]
        src = mm["tuned_test"] if "tuned_test" in mm else mm["test"]
        return {"method": key, "name": mm["name"], "family": mm["family"],
                "threshold": mm.get("tuned_threshold_mV", mm.get("threshold")),
                **{k: round(src[k], 4) for k in
                   ("accuracy", "precision", "sensitivity", "specificity",
                    "f1", "roc_auc", "pr_auc")}}

    rows = [flat(k) for k in ("sokolow", "cornell", "perceptron", "cnn")]
    pd.DataFrame(rows).to_csv(cfg.reports_dir / "model_comparison.csv", index=False)
    print(f"saved: {cfg.reports_dir / 'model_comparison.csv'}")

    payload = {
        "generated": pd.Timestamp.now().isoformat(timespec="seconds"),
        "dataset": "PTB-XL v1.0.3, 100 Hz",
        "test_split": "strat_fold 10 (patient-wise, untouched by training/tuning)",
        "validation_split": "strat_fold 9 (threshold tuning only)",
        "label_policy": "LVH = SCP 'LVH' likelihood>=100; control = no LVH statement "
                        "(NOT healthy); low-certainty excluded",
        "metrics": rows,
        "roc_pr_curves": {k: {"roc": methods[k]["roc"], "pr": methods[k]["pr"]}
                          for k in methods},
        "criteria_classic_thresholds": {
            "sokolow": methods["sokolow"]["classic_test"],
            "cornell": methods["cornell"]["classic_test"]},
    }
    cfg.metrics_json.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"saved: {cfg.metrics_json}")

    # ---- charts ---------------------------------------------------------------
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    colors = {"sokolow": "#1d6fbe", "cornell": "#7a5fd0",
              "perceptron": "#e8a13c", "cnn": "#089fbf"}

    def plot_curves(which: str, xkey: str, ykey: str, xlabel: str, ylabel: str,
                    fname: str, diagonal: bool) -> None:
        fig, ax = plt.subplots(figsize=(5.5, 5), constrained_layout=True)
        for k, mm in methods.items():
            pts = mm[which]
            ax.plot(pts[xkey], pts[ykey], color=colors[k], label=mm["name"])
        if diagonal:
            ax.plot([0, 1], [0, 1], "k--", lw=1, alpha=0.5, label="chance")
        ax.set(xlabel=xlabel, ylabel=ylabel, title=fname.replace(".png", "").replace("_", " "))
        ax.legend(loc="lower right" if diagonal else "upper right")
        ax.grid(alpha=0.3)
        fig.savefig(cfg.reports_dir / fname, dpi=150)
        plt.close(fig)
        print(f"saved: {cfg.reports_dir / fname}")

    plot_curves("roc", "fpr", "tpr", "False-positive rate",
                "Sensitivity (recall)", "roc_curves.png", diagonal=True)
    plot_curves("pr", "recall", "precision", "Sensitivity (recall)",
                "Precision", "pr_curves.png", diagonal=False)

    fig, axes = plt.subplots(1, 4, figsize=(16, 4), constrained_layout=True)
    for ax, k in zip(axes, ("sokolow", "cornell", "perceptron", "cnn")):
        mm = methods[k]
        src = mm["tuned_test"] if "tuned_test" in mm else mm["test"]
        cm = src["confusion_matrix"]
        mat = np.array([[cm["tn"], cm["fp"]], [cm["fn"], cm["tp"]]])
        ax.imshow(mat, cmap="Blues")
        for (i, j), v in np.ndenumerate(mat):
            ax.text(j, i, str(v), ha="center", va="center",
                    color="white" if v > mat.max() / 2 else "black")
        ax.set(title=f"{mm['name']}\nsens {src['sensitivity']:.2f} / spec "
                     f"{src['specificity']:.2f}",
               xticks=[0, 1], yticks=[0, 1],
               xticklabels=["pred −", "pred +"], yticklabels=["ref −", "ref +"])
    fig.suptitle("Confusion matrices — test set (strat_fold 10)")
    fig.savefig(cfg.reports_dir / "confusion_matrices.png", dpi=150)
    plt.close(fig)
    print(f"saved: {cfg.reports_dir / 'confusion_matrices.png'}")

    fig, ax = plt.subplots(figsize=(10, 4.5), constrained_layout=True)
    metrics_keys = ["sensitivity", "specificity", "precision", "f1",
                    "roc_auc", "pr_auc"]
    labels = ["Sensitivity", "Specificity", "Precision", "F1", "ROC-AUC", "PR-AUC"]
    width = 0.2
    xs = np.arange(len(metrics_keys))
    for i, k in enumerate(("sokolow", "cornell", "perceptron", "cnn")):
        src = methods[k]["tuned_test"] if "tuned_test" in methods[k] else methods[k]["test"]
        ax.bar(xs + i * width, [src[m] for m in metrics_keys], width,
               color=colors[k], label=methods[k]["name"])
    ax.set_xticks(xs + 1.5 * width, labels)
    ax.set_ylim(0, 1)
    ax.set_title("LVH screening performance — held-out test set (PTB-XL, folds 1-9 for "
                 "training/tuning only)")
    ax.legend(ncols=4)
    ax.grid(axis="y", alpha=0.3)
    fig.savefig(cfg.reports_dir / "comparison_chart.png", dpi=150)
    plt.close(fig)
    print(f"saved: {cfg.reports_dir / 'comparison_chart.png'}")


if __name__ == "__main__":
    main()
