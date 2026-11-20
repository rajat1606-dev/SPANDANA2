# -*- coding: utf-8 -*-
"""Add the model columns to the 30-recording batch key.

Same contract as the eight-file key: one backend call per recording returns
both the voltage rules and both trained models, each with the threshold it
was judged at. The batch key keeps its existing columns; the model verdicts
and a per-file outcome are appended.
"""
import csv
import io
import json
import os
import sys
import urllib.request

BASE = os.environ.get("SPANDANA_API", "http://127.0.0.1:8001")
ROOT = sys.argv[1]
KEY = os.path.join(ROOT, "batch_ANSWER_KEY.csv")
FILES = os.path.join(ROOT, "batch")
LEADS = ["I", "II", "III", "aVR", "aVL", "aVF",
         "V1", "V2", "V3", "V4", "V5", "V6"]


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
        "patient": {"code": "BATCH", "age": int(round(float(age))), "sex": sex},
        "waveform": {"sampleRate": fs, "durationSec": dur, "leads": leads},
    }).encode("utf-8")
    req = urllib.request.Request(BASE + "/api/v1/screen", data=body,
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=120) as resp:
        return json.loads(resp.read().decode("utf-8"))


rows = list(csv.DictReader(io.open(KEY, encoding="utf-8")))
out = []
tally = {"modern wins": 0, "old rules win": 0, "tie": 0}
old_tot = new_tot = 0

for r in rows:
    leads, fs, dur = read_csv_leads(os.path.join(FILES, r["file"]))
    res = screen(leads, fs, dur, r["age"], r["sex"])
    crit, preds = res["criteria"], {p["model"]: p for p in res["predictions"]}
    sl, co = crit["sokolowLyon"], crit["cornell"]
    pc, cn = preds["perceptron"], preds["cnn"]

    # The backend must reproduce the key's own voltage sums.
    for got, want, what in ((sl["sum"], r["sokolow_sum"], "Sokolow-Lyon"),
                            (co["sum"], r["cornell_sum"], "Cornell")):
        if abs(float(got) - float(want)) > 0.02:
            raise SystemExit("%s: %s %.4f vs key %.4f"
                             % (r["file"], what, float(got), float(want)))

    truth_pos = r["true_label"] == "LVH"
    say = lambda p: "LVH" if p else "normal"
    mark = lambda p: "correct" if p == truth_pos else "WRONG"
    old_right = sum(1 for p in (sl["positive"], co["positive"]) if p == truth_pos)
    new_right = sum(1 for p in (pc["positive"], cn["positive"]) if p == truth_pos)
    outcome = ("modern wins" if new_right > old_right else
               "old rules win" if new_right < old_right else "tie")
    tally[outcome] += 1
    old_tot += old_right
    new_tot += new_right

    rec = dict(r)
    rec.update({
        "sokolow_says": say(sl["positive"]), "sokolow_verdict": mark(sl["positive"]),
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
    out.append(rec)

with io.open(KEY, "w", encoding="utf-8", newline="") as fh:
    w = csv.DictWriter(fh, fieldnames=list(out[0].keys()))
    w.writeheader()
    w.writerows(out)

print("batch: %d files | rules %d/%d correct, models %d/%d | %s"
      % (len(out), old_tot, 2 * len(out), new_tot, 2 * len(out),
         ", ".join("%s %d" % (k, v) for k, v in tally.items())))
