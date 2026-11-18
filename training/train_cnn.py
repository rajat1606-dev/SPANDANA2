#!/usr/bin/env python3
"""SPANDANA — train the 1D CNN on PTB-XL 100 Hz waveforms (PyTorch).

Input : data/preprocessed/signals.npy (N, 1000, 12), float32 mV
        backend/models/preprocessing.json  (per-lead z-score stats, train-only)
Output: backend/models/cnn_best.pt      (best checkpoint by val PR-AUC)
        backend/models/cnn_meta.json    (architecture + training summary)
        data/cnn_runs/history.json      (per-epoch curves for the graphs)
        data/cnn_runs/training_history.png

Imbalance is handled with a pos_weight-ed BCEWithLogitsLoss; early stopping
monitors validation PR-AUC. Training resumes cleanly with --resume.

All hyper-parameters come from config.json → cnn and can be overridden on
the command line. CPU-only training works out of the box.

Usage:
    python training/train_cnn.py
    python training/train_cnn.py --epochs 5 --limit 4000     # smoke run
    python training/train_cnn.py --resume                    # continue
    python training/train_cnn.py --device cuda --batch-size 128
"""
from __future__ import annotations

import argparse
import json
import platform
import time
from pathlib import Path

import numpy as np
import pandas as pd
import torch
import torch.nn as nn
from sklearn.metrics import average_precision_score, roc_auc_score

from cnn_model import SpandanaCNN, normalize, to_channels_first
from config import load_config


class SignalDataset(torch.utils.data.Dataset):
    """Memory-mapped waveforms; returns (C, T) float32 tensors."""

    def __init__(self, signals_path: Path, row_idx: np.ndarray, y: np.ndarray,
                 mean: np.ndarray, std: np.ndarray):
        self.X = np.load(signals_path, mmap_mode="r")
        self.row_idx = row_idx
        self.y = y.astype(np.float32)
        self.mean = mean.astype(np.float32)
        self.std = std.astype(np.float32)

    def __len__(self) -> int:
        return len(self.row_idx)

    def __getitem__(self, i: int):
        rec = np.asarray(self.X[self.row_idx[i]])          # (T, C) mV
        rec = normalize(rec, self.mean, self.std)          # per-lead z-score
        return torch.from_numpy(to_channels_first(rec)), self.y[i]


@torch.no_grad()
def evaluate(model, loader, device) -> dict[str, float]:
    model.eval()
    ys, ps, loss_sum, n = [], [], 0.0, 0
    for xb, yb in loader:
        xb, yb = xb.to(device), yb.to(device)
        logits = model(xb)
        loss_sum += float(nn.functional.binary_cross_entropy_with_logits(
            logits, yb, reduction="sum"))
        ps.append(torch.sigmoid(logits).cpu().numpy())
        ys.append(yb.cpu().numpy())
        n += len(yb)
    p = np.concatenate(ys); s = np.concatenate(ps)
    return {"loss": loss_sum / n,
            "auprc": average_precision_score(p, s),
            "auroc": roc_auc_score(p, s)}


def plot_history(hist: dict, out: Path) -> None:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    ep = hist["epoch"]
    fig, axes = plt.subplots(1, 2, figsize=(11, 4), constrained_layout=True)
    axes[0].plot(ep, hist["loss"], label="train loss")
    axes[0].plot(ep, hist["val_loss"], label="val loss")
    axes[0].set(title="Binary cross-entropy loss", xlabel="epoch")
    axes[1].plot(ep, hist["auprc"], label="train PR-AUC")
    axes[1].plot(ep, hist["val_auprc"], label="val PR-AUC")
    axes[1].plot(ep, hist["auroc"], "--", label="train ROC-AUC")
    axes[1].plot(ep, hist["val_auroc"], "--", label="val ROC-AUC")
    axes[1].set(title="Area under the curves", xlabel="epoch")
    for ax in axes:
        ax.set_xlabel("epoch")
        ax.legend()
        ax.grid(alpha=0.3)
    fig.suptitle("SPANDANA 1D CNN — training history")
    fig.savefig(out, dpi=150)
    plt.close(fig)
    print(f"saved: {out}")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--batch-size", type=int, default=None)
    ap.add_argument("--epochs", type=int, default=None)
    ap.add_argument("--patience", type=int, default=None)
    ap.add_argument("--lr", type=float, default=None)
    ap.add_argument("--device", type=str, default=None, choices=["auto", "cpu", "cuda"])
    ap.add_argument("--limit", type=int, default=None,
                    help="use only the first N recordings (smoke run)")
    ap.add_argument("--resume", action="store_true",
                    help="continue from data/cnn_runs/latest.pt")
    args = ap.parse_args()

    cfg = load_config()
    seed = int(cfg.cnn.get("random_state", 42))
    np.random.seed(seed)
    torch.manual_seed(seed)
    c = cfg.cnn
    batch_size = args.batch_size or c["batch_size"]
    epochs = args.epochs or c["epochs"]
    patience = args.patience or c["patience"]
    lr = args.lr or c["lr"]
    if args.device and args.device != "auto":
        device = torch.device(args.device)
    else:
        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

    run_dir = cfg._resolve(c["run_dir"])
    run_dir.mkdir(parents=True, exist_ok=True)
    best_path = cfg.models_dir / "cnn_best.pt"
    meta_path = cfg.models_dir / "cnn_meta.json"
    latest_path = run_dir / "latest.pt"
    hist_path = run_dir / "history.json"

    # ---- data -----------------------------------------------------------
    idx = pd.read_csv(cfg.index_path)
    if args.limit:
        idx = idx.groupby("split", group_keys=False).head(args.limit // 3)
    norm = json.loads(cfg.norm_path.read_text(encoding="utf-8"))
    mean, std = np.array(norm["mean"]), np.array(norm["std"])

    def subset(split: str) -> pd.DataFrame:
        return idx[idx["split"] == split]

    tr_df, va_df = subset("train"), subset("val")
    y_tr = (tr_df["label"] == "LVH_positive").astype(int).values
    y_va = (va_df["label"] == "LVH_positive").astype(int).values
    pos_weight = torch.tensor(
        float((y_tr == 0).sum()) / max(float((y_tr == 1).sum()), 1.0))
    print(f"train {len(tr_df)} (LVH {y_tr.sum()}), val {len(va_df)} (LVH {y_va.sum()})")
    print(f"class imbalance -> pos_weight {pos_weight:.2f}")
    print(f"device: {device} | torch {torch.__version__} | "
          f"threads {torch.get_num_threads()}")

    dl_tr = torch.utils.data.DataLoader(
        SignalDataset(cfg.signals_path, tr_df["row_idx"].values, y_tr, mean, std),
        batch_size=batch_size, shuffle=True, num_workers=c["num_workers"],
        drop_last=False, pin_memory=device.type == "cuda",
        generator=torch.Generator().manual_seed(seed))
    dl_va = torch.utils.data.DataLoader(
        SignalDataset(cfg.signals_path, va_df["row_idx"].values, y_va, mean, std),
        batch_size=batch_size, shuffle=False, num_workers=c["num_workers"])
    dl_tr_eval = torch.utils.data.DataLoader(
        SignalDataset(cfg.signals_path, tr_df["row_idx"].values, y_tr, mean, std),
        batch_size=batch_size, shuffle=False, num_workers=c["num_workers"])

    # ---- model / optimiser ----------------------------------------------
    channels = tuple(c["channels"])
    model = SpandanaCNN(channels=channels, dropout=c["dropout"]).to(device)
    opt = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=c["weight_decay"])
    scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(opt, mode="max",
                                                           factor=0.5, patience=2)
    loss_fn = nn.BCEWithLogitsLoss(pos_weight=pos_weight)

    history = {"epoch": [], "loss": [], "val_loss": [], "auprc": [], "val_auprc": [],
               "auroc": [], "val_auroc": [], "seconds": []}
    start_epoch, best_ap = 1, -1.0
    if args.resume and latest_path.exists():
        ck = torch.load(latest_path, map_location=device, weights_only=False)
        model.load_state_dict(ck["model"])
        opt.load_state_dict(ck["optimizer"])
        scheduler.load_state_dict(ck["scheduler"])
        start_epoch = ck["epoch"] + 1
        best_ap = ck["best_ap"]
        history = ck.get("history", history)
        print(f"resumed from epoch {ck['epoch']} (best val AP {best_ap:.4f})")
    elif args.resume:
        print("no latest checkpoint found — training from scratch")

    # ---- training loop ----------------------------------------------------
    bad_epochs = 0
    for epoch in range(start_epoch, epochs + 1):
        model.train()
        t0, run_loss, seen = time.time(), 0.0, 0
        for xb, yb in dl_tr:
            xb, yb = xb.to(device), yb.to(device)
            opt.zero_grad(set_to_none=True)
            logits = model(xb)
            loss = loss_fn(logits, yb)
            loss.backward()
            opt.step()
            run_loss += float(loss.detach()) * len(yb)
            seen += len(yb)
        train_loss = run_loss / seen

        m = evaluate(model, dl_va, device)
        m_tr = evaluate(model, dl_tr_eval, device)
        scheduler.step(m["auprc"])
        history["epoch"].append(epoch)
        history["loss"].append(round(train_loss, 5))
        history["val_loss"].append(round(m["loss"], 5))
        history["auprc"].append(round(m_tr["auprc"], 5))
        history["val_auprc"].append(round(m["auprc"], 5))
        history["auroc"].append(round(m_tr["auroc"], 5))
        history["val_auroc"].append(round(m["auroc"], 5))
        secs = round(time.time() - t0, 1)
        history["seconds"].append(secs)

        marker = ""
        if m["auprc"] > best_ap:
            best_ap = m["auprc"]
            torch.save(model.state_dict(), best_path)
            marker = "  <- saved best"
            bad_epochs = 0
        else:
            bad_epochs += 1
        torch.save({"model": model.state_dict(), "optimizer": opt.state_dict(),
                    "scheduler": scheduler.state_dict(), "epoch": epoch,
                    "best_ap": best_ap, "history": history}, latest_path)
        hist_path.write_text(json.dumps(history, indent=1), encoding="utf-8")
        print(f"epoch {epoch:3d} | loss {train_loss:.4f} | val_loss {m['loss']:.4f} "
              f"| val AP {m['auprc']:.4f} | val AUROC {m['auroc']:.4f} "
              f"| {secs:.0f}s{marker}")

        if bad_epochs >= patience:
            print(f"early stopping: val PR-AUC did not improve for {patience} epochs")
            break

    meta = {
        "architecture": "SpandanaCNN (3x Conv1d+BN+ReLU+MaxPool, dense head)",
        "channels": list(channels), "dropout": c["dropout"],
        "input": "12 leads x 1000 samples (10 s @ 100 Hz), per-lead z-score",
        "normalization_source": "backend/models/preprocessing.json (train-only fit)",
        "imbalance": f"BCEWithLogitsLoss pos_weight={float(pos_weight):.2f}",
        "epochs_run": history["epoch"][-1] if history["epoch"] else 0,
        "best_val_auprc": best_ap,
        "best_val_auroc": max(history["val_auroc"]) if history["val_auroc"] else None,
        "device": str(device),
        "torch": torch.__version__,
        "python": platform.python_version(),
        "trained_samples": {"train": int(len(tr_df)), "val": int(len(va_df))},
    }
    meta_path.write_text(json.dumps(meta, indent=2), encoding="utf-8")
    print(f"saved: {best_path}\nsaved: {meta_path}")
    plot_history(history, run_dir / "training_history.png")


if __name__ == "__main__":
    main()
