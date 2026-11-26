#!/usr/bin/env python3
"""Turn data/raw/votes.csv into the small files the pages load.

Run from the repo root:  python3 scripts/build_data.py

Writes
  data/votes-finals.csv     one row per vote in a final, with its favoritism
  data/jury-televote.csv    2016-2023 finals with jury and televote points apart
  data/region-bars.json      extra points to the voter's own region by kind of vote, for the bias page

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

BOOTSTRAP = 2000   # resampling rounds for the bias page's 95% intervals
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

    # ---- 3. bias page: standardised favoritism, used by section 4
    # Favoritism of a vote = its points minus the average the OTHER voting countries gave the same
    # song that year, standardised to the 12-point scale the way js/shared/data.js does it for the
    # other pages: each year's points are scaled so their spread (standard deviation) matches an
    # average 1975-2015 final. From 2016 the jury and the televote are separate sets, each scaled
    # on its own and compared with the other juries / other televotes.
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

    # ---- 4. bias page: extra points to the voter's own region, by who voted
    # Same favoritism as above (standardised, compared with the OTHER countries' average for the
    # song), over the votes a country gave to a country in its own region (regions from
    # countries.json) and, as "other", every vote between two regions. Four kinds of vote, each
    # only from years in which every country voted that way: juries 1957-1996, televote 2004-2008,
    # and the jury and televote sets of 2016-2023.
    #
    # Some regions were barely in the contest in some periods (in 1957-1996 the Balkan, Central and
    # Ex-Soviet countries met each other in only a handful of finals), so a plain average of a few
    # votes is mostly noise. Two standard tools make those bars usable:
    #  - standard error: a cluster bootstrap that resamples whole contests (votes in one final are
    #    not independent), B rounds, fixed seed; never below the plain s/sqrt(n) of the votes, which
    #    also covers a region seen in a single contest, where a bootstrap cannot vary;
    #  - partial pooling (empirical Bayes): each region's average is pulled towards the average of
    #    all regions for the same kind of vote, with weight w = tau^2 / (tau^2 + se^2), where tau^2 is
    #    how much the regions really differ (method of moments: the vote-weighted spread of the
    #    region averages minus their average squared standard error). A region with many votes keeps
    #    w close to 1; one with a few votes leans on the shared average. 95% interval:
    #    estimate +/- 1.96 * sqrt(w) * se (the normal-normal posterior).
    region = {c["id"]: c["region"] for c in json.loads((OUT / "countries.json").read_text(encoding="utf-8"))}
    kinds = [("jury-old", "points", 1957, 1996), ("jury-new", "jury", 2016, 2023),
             ("tele-old", "points", 2004, 2008), ("tele-new", "tele", 2016, 2023)]
    rng = random.Random(1)
    bars = {}
    for name, field, lo, hi in kinds:
        per = defaultdict(lambda: defaultdict(list))        # region -> year -> extra points of each vote
        for y in sorted(per_year):
            if lo <= y <= hi:
                for g, t, f, _ in standardised_favs(per_year[y], field):
                    per[region[g] if region.get(g) == region.get(t) else "other"][y].append(f)
        stats = {}
        for key, years in per.items():
            votes = [f for v in years.values() for f in v]
            n, m = len(votes), mean(votes)
            clusters = [(sum(v), len(v)) for v in years.values()]
            boot = []
            for _ in range(BOOTSTRAP):
                pick = [clusters[rng.randrange(len(clusters))] for _ in clusters]
                boot.append(sum(c[0] for c in pick) / sum(c[1] for c in pick))
            se = max(stdev(boot), stdev(votes) / math.sqrt(n) if n > 1 else 0)
            stats[key] = {"raw": m, "n": n, "contests": len(clusters), "first": min(years), "last": max(years), "se": se}
        regs = {k: v for k, v in stats.items() if k != "other"}
        total = sum(v["n"] for v in regs.values())
        prior = sum(v["raw"] * v["n"] for v in regs.values()) / total
        spread = sum(v["n"] * (v["raw"] - prior) ** 2 for v in regs.values()) / total
        tau2 = max(1e-6, spread - sum(v["n"] * v["se"] ** 2 for v in regs.values()) / total)
        for key, v in stats.items():
            w = 1.0 if key == "other" else tau2 / (tau2 + v["se"] ** 2)   # "other" has thousands of votes; not pooled
            est = w * v["raw"] + (1 - w) * prior
            half = 1.96 * math.sqrt(w) * v["se"]
            v.update({"w": w, "est": est, "lo": est - half, "hi": est + half})
            bars.setdefault(key, {})[name] = {k: (round(x, 3) if isinstance(x, float) else x) for k, x in v.items()}
        bars.setdefault("_prior", {})[name] = {"prior": round(prior, 3), "tau": round(math.sqrt(tau2), 3)}
    (OUT / "region-bars.json").write_text(json.dumps(bars, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print("data/region-bars.json: " + ", ".join(f"{k} prior {v['prior']:+.2f}" for k, v in bars["_prior"].items()))


if __name__ == "__main__":
    main()
