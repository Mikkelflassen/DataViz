#!/usr/bin/env python3
"""Turn data/raw/votes.csv into the small files the pages load.

Run from the repo root:  python3 scripts/build_data.py

Writes
  data/votes-finals.csv     one row per vote in a final, with its favoritism
  data/jury-televote.csv    2016-2023 finals with jury and televote points apart
  data/top-pairs.json       points between the pairs with the most 12-point scores since 1975

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

TOP_PAIRS = 12   # how many pairs the bias page shows



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

    # ---- 3. bias page: points between the pairs with the most 12-point scores since 1975
    # Since 1975 every country's top score is 12 (since 2016 once from the jury and once from the
    # televote), so all years share one scale. A 12 counts once before 2016, and once each for
    # jury and televote from 2016.
    era = [r for r in finals if r["giver"] != "wld" and r["year"] >= 1975]
    for r in era:
        if r["year"] >= 2016:
            r["jury"], r["tele"] = int(float(r["jury_points"])), int(float(r["tele_points"]))
    twelves = defaultdict(int)
    for r in era:
        twelves[(r["giver"], r["receiver"])] += (r["points"] == 12) if r["year"] < 2016 else (r["jury"] == 12) + (r["tele"] == 12)
    top = sorted(twelves, key=lambda p: (-twelves[p], p))[:TOP_PAIRS]
    by_pair = defaultdict(list)
    for r in sorted(era, key=lambda r: r["year"]):
        if (r["giver"], r["receiver"]) in top:
            by_pair[(r["giver"], r["receiver"])].append(
                {"y": r["year"], "p": r["points"]} if r["year"] < 2016 else {"y": r["year"], "j": r["jury"], "t": r["tele"]})
    pairs = [{"from": g, "to": t, "twelves": twelves[(g, t)], "votes": by_pair[(g, t)]} for g, t in top]
    (OUT / "top-pairs.json").write_text(json.dumps({"pairs": pairs}, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"data/top-pairs.json: {len(pairs)} pairs, " + ", ".join(f"{g}>{t} {twelves[(g, t)]}" for g, t in top[:3]))


if __name__ == "__main__":
    main()
