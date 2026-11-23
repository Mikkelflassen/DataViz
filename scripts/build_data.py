#!/usr/bin/env python3
"""Turn data/raw/votes.csv into the small files the pages load.

Run from the repo root:  python3 scripts/build_data.py

Writes
  data/votes-finals.csv     one row per vote in a final, with its favoritism
  data/jury-televote.csv    2016-2023 finals with jury and televote points apart
  data/twelve-arcs.json     12-point scores between pairs, per period, for the bias page

Only the standard library is used, so there is nothing to install.
"""
import csv
import json
from collections import defaultdict
from pathlib import Path
from statistics import mean

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw" / "votes.csv"
OUT = ROOT / "data"

PERIODS = [(1975, 1984), (1985, 1994), (1995, 2004), (2005, 2015), (2016, 2023)]
MIN_MEETINGS = 3     # shared finals in a period before a pair can get an arc
MIN_WEIGHT = 0.25    # share of possible 12s the pair gave each other



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


def write_csv(path, header, rows):
    with open(path, "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh, lineterminator="\n")
        w.writerow(header)
        w.writerows(rows)
    print(f"{path.relative_to(ROOT)}: {len(rows)} rows")


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

    # ---- 3. bias page: 12-point scores between pairs of countries, as arcs, per period
    # Weight of an arc = the share of possible 12s the two countries gave each other: 12s in both
    # directions divided by 2 x the finals both took part in. From 2016 the jury and the televote
    # each give a set; the period view counts both (so 4 possible 12s per final), the split view
    # keeps them apart. Arcs need at least MIN_MEETINGS shared finals and weight >= MIN_WEIGHT.
    era = [r for r in finals if r["giver"] != "wld" and r["year"] >= 1975]
    for r in era:
        if r["year"] >= 2016:
            r["jury"], r["tele"] = int(float(r["jury_points"])), int(float(r["tele_points"]))

    def arcs(rows, twelves_in, per_final):
        met, got = defaultdict(set), defaultdict(int)
        for r in rows:
            pair = tuple(sorted((r["giver"], r["receiver"])))
            met[pair].add(r["year"])
            got[(r["giver"], r["receiver"])] += twelves_in(r)
        out = []
        for (a, b), years in met.items():
            n = len(years)
            w = (got[(a, b)] + got[(b, a)]) / (2 * per_final * n)
            if n >= MIN_MEETINGS and w >= MIN_WEIGHT:
                out.append({"a": a, "b": b, "ab": got[(a, b)], "ba": got[(b, a)], "n": n, "w": round(w, 3)})
        return sorted(out, key=lambda d: -d["w"])

    def all_twelves(r):
        return (r["points"] == 12) if r["year"] < 2016 else (r["jury"] == 12) + (r["tele"] == 12)

    periods = []
    for lo, hi in PERIODS:
        rows = [r for r in era if lo <= r["year"] <= hi]
        periods.append({"from": lo, "to": hi, "arcs": arcs(rows, all_twelves, 2 if lo >= 2016 else 1)})
    split = [r for r in era if r["year"] >= 2016]
    arc_data = {"periods": periods,
                "jury": arcs(split, lambda r: r["jury"] == 12, 1),
                "tele": arcs(split, lambda r: r["tele"] == 12, 1)}
    (OUT / "twelve-arcs.json").write_text(json.dumps(arc_data, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print("data/twelve-arcs.json: " + ", ".join(f"{p['from']}-{p['to']} {len(p['arcs'])}" for p in periods)
          + f"; 2016-2023 jury {len(arc_data['jury'])}, televote {len(arc_data['tele'])} arcs")


if __name__ == "__main__":
    main()
