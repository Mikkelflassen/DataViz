#!/usr/bin/env python3
"""Turn data/raw/votes.csv into the small files the pages load.

Run from the repo root:  python3 scripts/build_data.py

Writes
  data/votes-finals.csv     one row per vote in a final, with its favoritism
  data/jury-televote.csv    2016-2023 finals with jury and televote points apart
  data/bias-over-time.json  yearly series for the "Bias over time" page
  data/old-friendships.json  jury and televote points to the strongest 2004-2015 friendships

Only the standard library is used, so there is nothing to install.
"""
import csv
import json
import random
from collections import defaultdict
from pathlib import Path
from statistics import mean

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw" / "votes.csv"
OUT = ROOT / "data"

FRIENDSHIPS = 15   # how many old friendships the bias page shows

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


def write_csv(path, header, rows):
    with open(path, "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh, lineterminator="\n")
        w.writerow(header)
        w.writerows(rows)
    print(f"{path.relative_to(ROOT)}: {len(rows)} rows")


def random_favoritism(rows, rounds=50, seed=1):
    """Mean absolute favoritism if every country gave its own points to random songs.

    Each voter keeps exactly the points it handed out that year (e.g. 12, 10, 8 ... 1 and zeros),
    but they are shuffled over the songs it could vote for. Averaged over `rounds` shuffles.
    """
    rng = random.Random(seed)
    by_giver = defaultdict(list)
    for r in rows:
        by_giver[r["giver"]].append(r)
    results = []
    for _ in range(rounds):
        shuffled = []
        for votes in by_giver.values():
            pts = [r["points"] for r in votes]
            rng.shuffle(pts)
            shuffled += [{"receiver": r["receiver"], "points": p} for r, p in zip(votes, pts)]
        per_song = defaultdict(list)
        for r in shuffled:
            per_song[r["receiver"]].append(r["points"])
        avg = {song: mean(p) for song, p in per_song.items()}
        results.append(mean(abs(r["points"] - avg[r["receiver"]]) for r in shuffled))
    return mean(results)


def era_mean(series, key):
    return {name: round(mean(d[key] for d in series if a <= d["y"] <= b), 2)
            for name, (a, b) in ERAS.items()}


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
                       "rnd": round(random_favoritism(rows), 3),
                       "ppv": round(mean(handed_out.values()), 1)})

    bias = {"years": series, "eraRaw": era_mean(series, "raw"), "eraRandom": era_mean(series, "rnd")}
    (OUT / "bias-over-time.json").write_text(json.dumps(bias, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"data/bias-over-time.json: {len(series)} years")

    # ---- 4. bias page: what the strongest old friendships get from jury and televote since 2016
    # Old friendship = a pair's mean favoritism in the 2004-2015 finals (at least 5 meetings).
    # For the strongest pairs that met at least 3 times since 2016: the average jury and televote
    # points the giver gave the receiver in 2016-2023 finals.
    old = defaultdict(list)
    for r in votes:
        if 2004 <= r["year"] <= 2015:
            old[(r["giver"], r["receiver"])].append(r["fav"])
    old = {pair: mean(v) for pair, v in old.items() if len(v) >= 5}
    since = defaultdict(list)
    for r in split:
        if r["giver"] != "wld":
            since[(r["giver"], r["receiver"])].append((float(r["jury_points"]), float(r["tele_points"])))
    pairs = sorted((p for p in old if len(since.get(p, [])) >= 3), key=lambda p: -old[p])[:FRIENDSHIPS]
    rows = [{"from": g, "to": t, "old": round(old[(g, t)], 1), "n": len(since[(g, t)]),
             "jury": round(mean(j for j, _ in since[(g, t)]), 1),
             "tele": round(mean(v for _, v in since[(g, t)]), 1)} for g, t in pairs]
    every = [x for v in since.values() for x in v]
    friends = {"pairs": rows,
               "mean": {"jury": round(mean(r["jury"] for r in rows), 1), "tele": round(mean(r["tele"] for r in rows), 1)},
               "anyPair": {"jury": round(mean(j for j, _ in every), 1), "tele": round(mean(v for _, v in every), 1)}}
    (OUT / "old-friendships.json").write_text(json.dumps(friends, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"data/old-friendships.json: {len(rows)} pairs, jury {friends['mean']['jury']}, televote {friends['mean']['tele']}")


if __name__ == "__main__":
    main()
