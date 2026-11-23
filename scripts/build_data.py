#!/usr/bin/env python3
"""Turn data/raw/votes.csv into the small files the pages load.

Run from the repo root:  python3 scripts/build_data.py

Writes
  data/votes-finals.csv     one row per vote in a final, with its favoritism
  data/jury-televote.csv    2016-2023 finals with jury and televote points apart
  data/favoritism-years.json  votes far above the song's average, per year, for the bias page

Only the standard library is used, so there is nothing to install.
"""
import csv
import json
from collections import defaultdict
from pathlib import Path
from statistics import mean, stdev

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw" / "votes.csv"
OUT = ROOT / "data"

TOP_VOTES = 5   # biggest votes per year kept for the tooltip on the bias page
REFERENCE_YEARS = (1975, 2015)   # as in js/shared/data.js: the 12-point system before the split vote



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

    # ---- 3. bias page: how many votes are far above the average for the song, per year
    # Favoritism of a vote = its points minus the average the OTHER voting countries gave the same
    # song that year, standardised to the 12-point scale the way js/shared/data.js does it for the
    # other pages: each year's points are scaled so their spread (standard deviation) matches an
    # average 1975-2015 final. From 2016 the jury and the televote are separate sets, each scaled
    # on its own and compared with the other juries / other televotes. For every threshold t from
    # 0 to 12 standardised points (the page uses 5 to 12): how many votes had favoritism >= t.
    # The biggest votes go along for the tooltip, with the points actually given.
    per_year = defaultdict(list)
    for r in finals:
        if r["giver"] != "wld":
            per_year[r["year"]].append(r)
    for y, rows in per_year.items():
        if y >= 2016:
            for r in rows:
                r["jury"], r["tele"] = int(float(r["jury_points"])), int(float(r["tele_points"]))
    reference = mean(stdev(r["points"] for r in rows) for y, rows in per_year.items()
                     if REFERENCE_YEARS[0] <= y <= REFERENCE_YEARS[1])

    def standardised_favs(rows, field):
        k = reference / stdev(r[field] for r in rows)
        song = defaultdict(list)
        for r in rows:
            song[r["receiver"]].append(r[field])
        out = []
        for r in rows:
            pts = song[r["receiver"]]
            out.append((r["giver"], r["receiver"], k * (r[field] - (sum(pts) - r[field]) / (len(pts) - 1)), r[field]))
        return out

    def summary(favs):
        return {"n": len(favs), "c": [sum(f >= t - 1e-9 for _, _, f, _ in favs) for t in range(13)],
                "top": [[g, t, round(f, 1), p] for g, t, f, p in sorted(favs, key=lambda x: -x[2])[:TOP_VOTES]]}

    years = []
    for y in sorted(per_year):
        rows = per_year[y]
        if y < 2016:
            years.append({"y": y, "all": summary(standardised_favs(rows, "points"))})
        else:
            years.append({"y": y, "jury": summary(standardised_favs(rows, "jury")), "tele": summary(standardised_favs(rows, "tele"))})
    (OUT / "favoritism-years.json").write_text(json.dumps({"years": years, "reference": round(reference, 3)}, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"data/favoritism-years.json: {len(years)} years, reference spread {reference:.2f} points")


if __name__ == "__main__":
    main()
