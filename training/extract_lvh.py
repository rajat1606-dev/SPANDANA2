#!/usr/bin/env python3
"""SPANDANA step 3/6 — extract the LVH cohort and the control group.

The LVH label comes from the SCP statement dictionary bundled with PTB-XL:
recordings carry ``scp_codes`` such as ``{'LVH': 100.0, 'SR': 0.0, ...}``
where the value is the annotator's likelihood in percent.

Label policy (configured in config.json → labels.lvh_likelihood_threshold):
  LVH_positive      : 'LVH' statement present with likelihood >= threshold
  LVH_low_certainty : 'LVH' statement present with likelihood < threshold
                      (kept aside — never mixed into either group)
  control           : NO 'LVH' statement at all

IMPORTANT — this is NOT a healthy group. A control recording can still
carry any other cardiac annotation (bundle-branch block, infarction,
rhythm disorders ...). The script prints the evidence for that so the
limitation cannot be overlooked.

Usage:
    python training/extract_lvh.py
"""
from __future__ import annotations

import ast
from pathlib import Path

import pandas as pd

from config import load_config

LABEL_POS = "LVH_positive"
LABEL_LOW = "LVH_low_certainty"
LABEL_CTRL = "control"


def parse_scp(cell: str) -> dict[str, float]:
    return {k: float(v) for k, v in ast.literal_eval(cell).items()}


def main() -> None:
    cfg = load_config()
    data_dir = cfg.find_data_dir()
    assert data_dir is not None, "PTB-XL not found — run download_dataset.py first."
    thr = cfg.lvh_threshold

    db = pd.read_csv(data_dir / "ptbxl_database.csv", index_col="ecg_id")
    scp = pd.read_csv(data_dir / "scp_statements.csv", index_col=0)

    # ---- identify the LVH code FROM the dictionary, not from memory ----
    lvh_rows = scp[scp.index.str.upper().str.contains("LVH", na=False)]
    print("LVH-related rows found in scp_statements.csv:")
    print(lvh_rows[["description", "diagnostic", "diagnostic_class"]].to_string())
    lvh_code = lvh_rows.index[lvh_rows["description"]
                              .str.contains("left ventricular hypertrophy",
                                            case=False, na=False)]
    assert len(lvh_code) >= 1, "no LVH statement found in the dictionary"
    print(f"\ndiagnostic statement used for labelling: 'LVH' (likelihood >= {thr})")
    print("note: 'VCLVH' is a form-level voltage statement, NOT used as a label")

    # ---- label every recording ----------------------------------------
    parsed = db["scp_codes"].map(parse_scp)
    lvh_likelihood = parsed.map(lambda d: d.get("LVH", 0.0) if "LVH" in d else 0.0)

    # PTB-XL sex coding: 0 = male, 1 = female (per the dataset documentation;
    # the cohort is ~52% male). Map to strings for the sex-specific Cornell cutoff.
    sex = db["sex"].map({0: "male", 1: "female"})

    label = pd.Series(LABEL_CTRL, index=db.index)
    label[(lvh_likelihood > 0) & (lvh_likelihood < thr)] = LABEL_LOW
    label[lvh_likelihood >= thr] = LABEL_POS

    meta = pd.DataFrame({
        "ecg_id": db.index,
        "patient_id": db["patient_id"].values,
        "age": db["age"].values,
        "sex": sex.values,
        "height": db["height"].values,
        "weight": db["weight"].values,
        "site": db["site"].values,
        "device": db["device"].values,
        "recording_date": db["recording_date"].values,
        "heart_axis": db["heart_axis"].values,
        "scp_codes": db["scp_codes"].values,
        "strat_fold": db["strat_fold"].values,
        "filename_lr": db["filename_lr"].values,
        "lvh_likelihood": lvh_likelihood.values,
        "label": label.values,
    })

    counts = meta["label"].value_counts()
    n_pos, n_low, n_ctrl = (int(counts.get(k, 0)) for k in (LABEL_POS, LABEL_LOW, LABEL_CTRL))
    print("\ncohort sizes:")
    print(f"  LVH_positive      : {n_pos:6d}  ({n_pos / len(meta) * 100:.2f} %)")
    print(f"  LVH_low_certainty : {n_low:6d}  (excluded from training — ambiguous)")
    print(f"  control           : {n_ctrl:6d}  ({n_ctrl / len(meta) * 100:.2f} %)")
    print(f"  imbalance ratio   : 1 : {n_ctrl / max(n_pos, 1):.1f}")

    # ---- document the control-group limitation with evidence ----------
    ctrl = meta[meta["label"] == LABEL_CTRL]["scp_codes"].map(parse_scp)
    ctrl_other = ctrl.map(lambda d: any(k != "LVH" and v >= 50 for k, v in d.items()
                                        if k != "SR" or v >= 50))
    n_other = int(ctrl_other.sum())
    print("\nlabel limitation — control does NOT mean healthy:")
    print(f"  control recordings carrying OTHER statements (likelihood>=50): "
          f"{n_other}/{len(ctrl)} ({n_other / len(ctrl) * 100:.1f} %)")
    top = {}
    for d in ctrl:
        for k, v in d.items():
            if k != "LVH" and v >= 50:
                top[k] = top.get(k, 0) + 1
    for k, c in sorted(top.items(), key=lambda kv: -kv[1])[:8]:
        print(f"    {k:12s} {c:6d}")

    # ---- persist -------------------------------------------------------
    out = cfg.lvh_metadata_path
    meta.to_csv(out, index=False)
    print(f"\nsaved: {out}  ({len(meta)} recordings)")

    lim = cfg.reports_dir / "label_limitations.md"
    lim.write_text(
        "# SPANDANA label limitations (PTB-XL)\n\n"
        f"- LVH-positive = SCP statement `LVH` with likelihood >= {thr}. "
        "The SCP likelihood reflects annotator confidence in the ECG statement, "
        "not an echocardiographic diagnosis.\n"
        "- PTB-XL labels are cardiologist ECG-statement annotations. Studies have "
        "shown only moderate agreement between ECG-derived and echo-derived LVH; "
        "any model trained here learns to reproduce ECG annotations, not true anatomy.\n"
        f"- {n_low} low-certainty LVH statements (<{thr}) are EXCLUDED from both "
        "classes rather than guessed.\n"
        f"- The control group ({n_ctrl} recordings) is defined as *no LVH statement* — "
        f"{n_other / len(ctrl) * 100:.1f}% of them still carry other cardiac "
        "statements. Control is NOT healthy.\n"
        "- Single recordings per patient may share patients across... none: the "
        "official strat_fold is patient-wise, so no patient leaks across splits "
        "(verified by create_splits.py).\n",
        encoding="utf-8",
    )
    print(f"saved: {lim}")


if __name__ == "__main__":
    main()
