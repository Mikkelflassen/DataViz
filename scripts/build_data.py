#!/usr/bin/env python3
"""Turn data/raw/votes.csv into the small files the pages load.

Run from the repo root:  python3 scripts/build_data.py

Writes
  data/votes-finals.csv     one row per vote in a final, with its favoritism
  data/jury-televote.csv    2016-2023 finals with jury and televote points apart
  data/bias-over-time.json  yearly series for the "Bias over time" page

Only the standard library is used, so there is nothing to install.
"""
import csv
import json
import math
import random
from collections import defaultdict
from pathlib import Path
from statistics import mean, stdev

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw" / "votes.csv"
OUT = ROOT / "data"

ERAS = {"1957–1974": (1957, 1974), "1975–2003": (1975, 2003),
        "2004–2015": (2004, 2015), "2016–2023": (2016, 2023)}


def read_finals():
    """Final-round rows. A country's own row (always 0) is dropped."""
    with open(RAW, newline="", encoding="utf-8") as fh:
        rows = [r for r in csv.DictReader(fh) if r["round"] == "final"]
    for r in rows:
        r["year"] = int(r["year"])
        r["giver"], r["receiver"] = r["from_country_id"], r["to_country_id"]
        r["points"] = int(r["total_points"])
    return [r for r in rows if r["giver"] != r["receiver"]]


def add_favoritism(rows, field="points", out="fav"):
    """favoritism = points given - the receiver's average from all voters that year."""
    groups = defaultdict(list)
    for r in rows:
        groups[(r["year"], r["receiver"])].append(r)
    for group in groups.values():
        avg = mean(r[field] for r in group)
        for r in group:
            r[out] = r[field] - avg


def pearson(xs, ys):
    n = len(xs)
    if n < 3:
        return None
    mx, my = mean(xs), mean(ys)
    sxx = sum((x - mx) ** 2 for x in xs)
    syy = sum((y - my) ** 2 for y in ys)
    if not sxx or not syy:
        return None
    return sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / math.sqrt(sxx * syy)


def write_csv(path, header, rows):
    with open(path, "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh, lineterminator="\n")
        w.writerow(header)
        w.writerows(rows)
    print(f"{path.relative_to(ROOT)}: {len(rows)} rows")


def era_mean(series, key):
    return {name: round(mean(d[key] for d in series if a <= d["y"] <= b), 2)
            for name, (a, b) in ERAS.items()}


def persistence(votes, years, keep=None, window=5, min_meetings=2):
    """Correlation between each pair's favoritism in a year and its average
    over the previous `window` contests (pairs that met at least twice in them)."""
    by_year = defaultdict(dict)
    for r in votes:
        if keep and (r["giver"] not in keep or r["receiver"] not in keep):
            continue
        by_year[r["year"]][(r["giver"], r["receiver"])] = r["fav"]
    out = {}
    for i, y in enumerate(years):
        if i < window:
            continue
        xs, ys = [], []
        for pair, fav in by_year[y].items():
            past = [by_year[p][pair] for p in years[i - window:i] if pair in by_year[p]]
            if len(past) >= min_meetings:
                xs.append(mean(past))
                ys.append(fav)
        out[y] = pearson(xs, ys)
    return out


def main():
    finals = read_finals()

    # ---- 1. votes in finals, with favoritism (no rest-of-world televote)
    votes = [r for r in finals if r["giver"] != "wld"]
    add_favoritism(votes)
    votes.sort(key=lambda r: (r["year"], r["giver"], r["receiver"]))
    write_csv(OUT / "votes-finals.csv", ["giver", "receiver", "year", "points", "fav"],
              [(r["giver"], r["receiver"], r["year"], r["points"], f'{r["fav"]:.2f}') for r in votes])

    # ---- 2. jury and televote points since the 2016 split (rest of world kept, it has no jury)
    split = [r for r in finals if r["year"] >= 2016]
    write_csv(OUT / "jury-televote.csv", ["giver", "receiver", "year", "jury", "tele"],
              [(r["giver"], r["receiver"], r["year"],
                "" if r["jury_points"] == "" else int(float(r["jury_points"])),
                int(float(r["tele_points"]))) for r in sorted(split, key=lambda r: (r["year"], r["giver"], r["receiver"]))])

    # ---- 3. yearly series for the bias-over-time page
    years = sorted({r["year"] for r in votes})
    per_year = defaultdict(list)
    for r in votes:
        per_year[r["year"]].append(r)

    series = []
    for y in years:
        rows = per_year[y]
        handed_out = defaultdict(int)
        for r in rows:
            handed_out[r["giver"]] += r["points"]
        raw = mean(abs(r["fav"]) for r in rows)
        series.append({"y": y, "raw": round(raw, 3),
                       "z": round(raw / stdev(r["points"] for r in rows), 3),
                       "ppv": round(mean(handed_out.values()))})

    # countries that were in a final before 2004, in 2004-2015 and after 2016
    seen = defaultdict(set)
    for r in votes:
        era = 0 if r["year"] < 2004 else 1 if r["year"] < 2016 else 2
        seen[r["giver"]].add(era)
        seen[r["receiver"]].add(era)
    stable = {c for c, eras in seen.items() if len(eras) == 3}

    p_all, p_stable = persistence(votes, years), persistence(votes, years, keep=stable)
    persist = [{"y": y, "all": round(p_all[y], 3), "stable": round(p_stable[y], 3)}
               for y in years if p_all.get(y) is not None]

    # shuffle baseline: the same test with each giver's points dealt out at random
    random.seed(1)
    shuffled = [dict(r) for r in votes]
    by_giver_year = defaultdict(list)
    for r in shuffled:
        by_giver_year[(r["year"], r["giver"])].append(r)
    for group in by_giver_year.values():
        pts = [r["points"] for r in group]
        random.shuffle(pts)
        for r, p in zip(group, pts):
            r["points"] = p
    add_favoritism(shuffled)
    p_shuffled = [v for v in persistence(shuffled, years).values() if v is not None]

    # jury and televote favoritism against each pair's 2004-2015 average
    old = defaultdict(list)
    for r in votes:
        if 2004 <= r["year"] <= 2015:
            old[(r["giver"], r["receiver"])].append(r["fav"])
    old = {pair: mean(v) for pair, v in old.items() if len(v) >= 3}
    both = [dict(r, jury=int(float(r["jury_points"])), tele=int(float(r["tele_points"])))
            for r in split if r["giver"] != "wld"]
    add_favoritism(both, "jury", "jfav")
    add_favoritism(both, "tele", "tfav")
    jt = []
    for y in sorted({r["year"] for r in both}):
        rows = [r for r in both if r["year"] == y and (r["giver"], r["receiver"]) in old]
        base = [old[(r["giver"], r["receiver"])] for r in rows]
        jt.append({"y": y, "jury": round(pearson(base, [r["jfav"] for r in rows]), 3),
                   "tele": round(pearson(base, [r["tfav"] for r in rows]), 3), "n": len(rows)})

    era_p = {name: {"all": round(mean(d["all"] for d in persist if a <= d["y"] <= b), 2),
                    "stable": round(mean(d["stable"] for d in persist if a <= d["y"] <= b), 2)}
             for name, (a, b) in ERAS.items()}
    bias = {"years": series, "persist": persist, "jt": jt,
            "eraRaw": era_mean(series, "raw"), "eraZ": era_mean(series, "z"), "eraP": era_p,
            "jtMean": {"jury": round(mean(d["jury"] for d in jt), 2), "tele": round(mean(d["tele"] for d in jt), 2)},
            "shuffled": round(mean(p_shuffled), 2), "stableCount": len(stable)}
    (OUT / "bias-over-time.json").write_text(json.dumps(bias, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"data/bias-over-time.json: {len(series)} years, {len(stable)} countries in every era, shuffled baseline {bias['shuffled']}")


if __name__ == "__main__":
    main()
