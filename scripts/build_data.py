#!/usr/bin/env python3
"""Turn data/raw/votes.csv into the small files the pages load.

Run from the repo root:  python3 scripts/build_data.py

Writes
  data/votes-finals.csv     one row per vote in a final, with its favoritism
  data/jury-televote.csv    2016-2023 finals with jury and televote points apart
  data/favoritism-votes.json  votes far above the song's average, for the bias page

Only the standard library is used, so there is nothing to install.
"""
import csv
import json
import math
from collections import defaultdict
from pathlib import Path
from statistics import mean

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw" / "votes.csv"
OUT = ROOT / "data"




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

    # ---- 3. bias page: votes far above the average for the song, per year and country
    # Favoritism of a vote = its points minus the average the OTHER voting countries gave the same
    # song that year. Since 1975 (top score always 12). From 2016 jury and televote are separate
    # sets, each against the other juries / other televotes. The page counts votes over a threshold
    # of at least 1 point, so only those votes are stored, as [year, set, giver, receiver, fav x 10 rounded down].
    # n holds how many votes each country gave and received per year and set, for shares.
    per_year = defaultdict(list)
    for r in finals:
        if r["giver"] != "wld" and r["year"] >= 1975:
            per_year[r["year"]].append(r)
    ids = sorted({r[k] for rows in per_year.values() for r in rows for k in ("giver", "receiver")})
    index = {c: i for i, c in enumerate(ids)}
    SET_NAMES = ["all", "jury", "tele"]
    votes, n = [], {}
    for y in sorted(per_year):
        rows = per_year[y]
        sets = [("all", lambda r: r["points"])] if y < 2016 else \
               [("jury", lambda r: int(float(r["jury_points"]))), ("tele", lambda r: int(float(r["tele_points"])))]
        n[y] = {}
        for name, pts in sets:
            song = defaultdict(list)
            for r in rows:
                song[r["receiver"]].append(pts(r))
            given, received = defaultdict(int), defaultdict(int)
            for r in rows:
                p, others = pts(r), song[r["receiver"]]
                fav = p - (sum(others) - p) / (len(others) - 1)
                given[r["giver"]] += 1
                received[r["receiver"]] += 1
                if fav >= 1:
                    # rounded down, so a vote counts for a threshold only if it really reaches it
                    votes.append([y, SET_NAMES.index(name), index[r["giver"]], index[r["receiver"]], math.floor(fav * 10 + 1e-9)])
            n[y][name] = {"g": [given.get(c, 0) for c in ids], "r": [received.get(c, 0) for c in ids]}
    fav_data = {"countries": ids, "sets": SET_NAMES, "votes": votes, "n": n}
    (OUT / "favoritism-votes.json").write_text(json.dumps(fav_data, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"data/favoritism-votes.json: {len(votes)} votes at least 1 point above the average, {len(ids)} countries")


if __name__ == "__main__":
    main()
