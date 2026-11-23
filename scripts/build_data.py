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
from statistics import mean

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw" / "votes.csv"
OUT = ROOT / "data"

TOP_VOTES = 5   # biggest votes per year kept for the tooltip on the bias page



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
    # song that year. For every year since 1975 (top score always 12) and every threshold t from
    # 0 to 12 points (the page uses 5 to 12): how many votes had favoritism >= t. From 2016 jury and televote are counted
    # apart, each against the other juries / other televotes. The biggest votes go along for the
    # tooltip.
    def leave_one_out(rows, field):
        song = defaultdict(list)
        for r in rows:
            song[r["receiver"]].append(r[field])
        out = []
        for r in rows:
            pts = song[r["receiver"]]
            out.append((r["giver"], r["receiver"], r[field] - (sum(pts) - r[field]) / (len(pts) - 1)))
        return out

    def summary(favs):
        return {"n": len(favs), "c": [sum(f >= t for _, _, f in favs) for t in range(13)],
                "top": [[g, t, round(f, 1)] for g, t, f in sorted(favs, key=lambda x: -x[2])[:TOP_VOTES]]}

    per_year = defaultdict(list)
    for r in finals:
        if r["giver"] != "wld" and r["year"] >= 1975:
            per_year[r["year"]].append(r)
    years = []
    for y in sorted(per_year):
        rows = per_year[y]
        if y < 2016:
            years.append({"y": y, "all": summary(leave_one_out(rows, "points"))})
        else:
            for r in rows:
                r["jury"], r["tele"] = int(float(r["jury_points"])), int(float(r["tele_points"]))
            years.append({"y": y, "jury": summary(leave_one_out(rows, "jury")), "tele": summary(leave_one_out(rows, "tele"))})
    (OUT / "favoritism-years.json").write_text(json.dumps({"years": years}, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"data/favoritism-years.json: {len(years)} years")


if __name__ == "__main__":
    main()
