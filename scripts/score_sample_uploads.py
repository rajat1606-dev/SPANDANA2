# -*- coding: utf-8 -*-
"""Rebuild the sample-upload answer key as an old-vs-modern comparison.

Every CSV in the folder is scored by the real backend, which returns both
halves in one call: the 1980s voltage rules and the two trained models, each
with the threshold it was judged at. Truth, age and sex come from the
project's own feature_rows.csv, so nothing here is hand-typed.
"""
import csv
import io
import json
import os
import re
import sys
import urllib.request

BASE = os.environ.get("SPANDANA_API", "http://127.0.0.1:8001")
OUT = sys.argv[1]
LEADS = ["I", "II", "III", "aVR", "aVL", "aVF",
         "V1", "V2", "V3", "V4", "V5", "V6"]

meta = {r["ecg_id"]: r for r in csv.DictReader(
    io.open("data/metadata/feature_rows.csv", encoding="utf-8"))}


def read_csv_leads(path):
    cols, times = {n: [] for n in LEADS}, []
    for line in io.open(path, encoding="utf-8"):
        line = line.strip()
        if not line:
            continue
        p = line.split(",")
        if len(p) != 13:
            raise SystemExit("%s: expected 13 columns, got %d" % (path, len(p)))
        times.append(float(p[0]))
        for i, n in enumerate(LEADS):
            cols[n].append(float(p[i + 1]))
    fs = round(1.0 / (times[1] - times[0]))
    return cols, fs, len(times) / float(fs)


def screen(leads, fs, dur, age, sex):
    body = json.dumps({
        "patient": {"code": "KEY", "age": int(round(float(age))), "sex": sex},
        "waveform": {"sampleRate": fs, "durationSec": dur, "leads": leads},
    }).encode("utf-8")
    req = urllib.request.Request(BASE + "/api/v1/screen", data=body,
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=120) as resp:
        return json.loads(resp.read().decode("utf-8"))


files = sorted(f for f in os.listdir(OUT)
               if f.endswith(".csv") and f != "ANSWER_KEY.csv")

rows, cards = [], []
for name in files:
    ecg_id = re.search(r"ecg_(\d+)_", name).group(1)
    m = meta[ecg_id]
    leads, fs, dur = read_csv_leads(os.path.join(OUT, name))
    res = screen(leads, fs, dur, m["age"], m["sex"])
    crit, preds = res["criteria"], {p["model"]: p for p in res["predictions"]}

    truth_pos = m["label"] in ("1", "LVH", "LVH_positive", "True", "true")
    sl, co = crit["sokolowLyon"], crit["cornell"]
    pc, cn = preds["perceptron"], preds["cnn"]

    # Cross-check the backend against the project's own stored voltages.
    for got, want, what in ((sl["sum"], m["sokolow_lyon_sum"], "Sokolow-Lyon"),
                            (co["sum"], m["cornell_sum"], "Cornell")):
        if abs(float(got) - float(want)) > 0.02:
            raise SystemExit("%s: %s %.4f vs stored %.4f"
                             % (name, what, float(got), float(want)))

    say = lambda p: "LVH" if p else "normal"
    mark = lambda p: "correct" if p == truth_pos else "WRONG"
    old_right = sum(1 for p in (sl["positive"], co["positive"]) if p == truth_pos)
    new_right = sum(1 for p in (pc["positive"], cn["positive"]) if p == truth_pos)
    outcome = ("modern wins" if new_right > old_right else
               "old rules win" if new_right < old_right else "tie")

    rows.append({
        "file": name, "ecg_id": ecg_id,
        "truth": "LVH" if truth_pos else "Normal/Control",
        "age": m["age"], "sex": m["sex"],
        "sokolow_mV": "%.3f" % sl["sum"], "sokolow_thr_mV": "%.2f" % sl["threshold"],
        "sokolow_says": say(sl["positive"]), "sokolow_verdict": mark(sl["positive"]),
        "cornell_mV": "%.3f" % co["sum"], "cornell_thr_mV": "%.2f" % co["threshold"],
        "cornell_says": say(co["positive"]), "cornell_verdict": mark(co["positive"]),
        "perceptron_prob": "%.3f" % pc["probability"],
        "perceptron_thr": "%.3f" % pc["threshold"],
        "perceptron_says": say(pc["positive"]),
        "perceptron_verdict": mark(pc["positive"]),
        "cnn_prob": "%.3f" % cn["probability"], "cnn_thr": "%.3f" % cn["threshold"],
        "cnn_says": say(cn["positive"]), "cnn_verdict": mark(cn["positive"]),
        "old_correct_of_2": old_right, "modern_correct_of_2": new_right,
        "outcome": outcome,
    })
    cards.append((name, ecg_id, truth_pos, sl, co, pc, cn, outcome, m))

with io.open(os.path.join(OUT, "ANSWER_KEY.csv"), "w",
             encoding="utf-8", newline="") as fh:
    w = csv.DictWriter(fh, fieldnames=list(rows[0].keys()))
    w.writeheader()
    w.writerows(rows)

# --- readable companion -------------------------------------------------
NL = chr(10)
md = []
md.append("# Sample uploads: 1980s voltage rules vs the trained models")
md.append("")
md.append("Eight real PTB-XL recordings from the held-out test fold (fold 10), "
          "exported straight from the raw 100 Hz signals. Upload any of them on "
          "the ECG Analysis page; the numbers below are what the backend returns.")
md.append("")
md.append("**How each method decides**")
md.append("")
md.append("| Method | Era | Decides by |")
md.append("|---|---|---|")
md.append("| Sokolow-Lyon | 1949 | S in V1 + tallest R in V5/V6 >= 3.5 mV |")
md.append("| Cornell | 1985 | R in aVL + S in V3 >= 2.8 mV (men) / 2.0 mV (women) |")
md.append("| Perceptron | trained here | 5 voltages + age/sex, linear |")
md.append("| CNN | trained here | the whole 12-lead waveform, 1-D convolutions |")
md.append("")
md.append("Model thresholds are the tuned operating points from training, not 0.5.")
md.append("")
md.append("| Recording | Truth | Sokolow-Lyon | Cornell | Perceptron | CNN | Outcome |")
md.append("|---|---|---|---|---|---|---|")
tick = {"correct": "ok", "WRONG": "MISS"}
for name, ecg_id, truth_pos, sl, co, pc, cn, outcome, m in cards:
    f = lambda v, p: "%s %s" % (v, "(%s)" % p if p else "")
    md.append("| `%s` | %s | %.2f mV -> %s %s | %.2f mV -> %s %s | %.3f -> %s %s | %.3f -> %s %s | **%s** |" % (
        name, "LVH" if truth_pos else "control",
        sl["sum"], "LVH" if sl["positive"] else "normal",
        tick["correct" if sl["positive"] == truth_pos else "WRONG"],
        co["sum"], "LVH" if co["positive"] else "normal",
        tick["correct" if co["positive"] == truth_pos else "WRONG"],
        pc["probability"], "LVH" if pc["positive"] else "normal",
        tick["correct" if pc["positive"] == truth_pos else "WRONG"],
        cn["probability"], "LVH" if cn["positive"] else "normal",
        tick["correct" if cn["positive"] == truth_pos else "WRONG"],
        outcome))

old_tot = sum(r["old_correct_of_2"] for r in rows)
new_tot = sum(r["modern_correct_of_2"] for r in rows)
md.append("")
md.append("Across these eight files: the two voltage rules are right on "
          "**%d of %d** verdicts, the two models on **%d of %d**."
          % (old_tot, 2 * len(rows), new_tot, 2 * len(rows)))
md.append("")
md.append("These eight were picked to be instructive, not representative - they "
          "deliberately include the cases where each method breaks. The honest "
          "whole-test-fold numbers (101 LVH in 2,085 recordings) are in the "
          "README: CNN 72/101 caught at 28 false alarms, Sokolow-Lyon 62/101.")
io.open(os.path.join(OUT, "OLD_VS_MODERN.md"), "w",
        encoding="utf-8", newline=NL).write(NL.join(md) + NL)

for junk in ("_scored.json", "_added.json"):
    p = os.path.join(OUT, junk)
    if os.path.exists(p):
        os.remove(p)

print("scored %d files; old %d/%d, modern %d/%d"
      % (len(rows), old_tot, 2 * len(rows), new_tot, 2 * len(rows)))
