"""Build the owner pay extract from the BLS Occupational Employment and Wage
Statistics (OEWS) flat files.

Input, from https://download.bls.gov/pub/time.series/oe/ :
  oe.data.0.Current, oe.area, oe.occupation, oe.industry
BLS asks for a User-Agent header that identifies the requester.

Series id layout (25 characters):
  "OEU" + areatype(1: N national, S state, M metro/nonmetro) + area(7)
  + industry(6) + occupation(6) + datatype(2)
Datatypes kept: 01 employment, 04 annual mean, 11/12/13/14/15 annual
10th/25th/median/75th/90th percentile.

Industry detail exists at national level only, so state and metro rows are
all-industry (000000). Values BLS suppresses or top-codes are non-numeric in
the file and come through as empty cells.

Usage: python build_bls_extract.py <dir with the four files> --out <dir>
Standard library only.
"""

import argparse
import collections
import csv
import os

OCCUPATIONS = [
    "111011", "111021", "112011", "112021", "112032", "113031", "131161",
    "132011", "132052", "151252", "171011", "231011", "271024", "273031", "413021",
]
INDUSTRIES = ["000000", "524200", "541100", "541200", "541300", "541500", "541600", "541800"]
DATATYPES = {"01": "employment", "04": "mean", "11": "p10", "12": "p25", "13": "p50", "14": "p75", "15": "p90"}


def lookup(path, key_col, val_col):
    out = {}
    with open(path, encoding="utf-8") as f:
        next(f)
        for line in f:
            parts = line.rstrip("\n").split("\t")
            if len(parts) > max(key_col, val_col):
                out[parts[key_col].strip()] = parts[val_col].strip()
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("--out", default=".")
    a = ap.parse_args()
    areas = {}
    with open(os.path.join(a.src, "oe.area"), encoding="utf-8") as f:
        next(f)
        for line in f:
            p = line.rstrip("\n").split("\t")
            areas[p[1]] = (p[0], p[2], p[3])
    occ = lookup(os.path.join(a.src, "oe.occupation"), 0, 1)
    ind = lookup(os.path.join(a.src, "oe.industry"), 0, 1)

    rows = collections.defaultdict(dict)
    year = None
    with open(os.path.join(a.src, "oe.data.0.Current"), encoding="utf-8") as f:
        next(f)
        for line in f:
            sid, yr, _per, val = line.rstrip("\n").split("\t")[:4]
            sid = sid.strip()
            at, area, i, o, dt = sid[3], sid[4:11], sid[11:17], sid[17:23], sid[23:25]
            if o not in OCCUPATIONS or dt not in DATATYPES or i not in INDUSTRIES:
                continue
            if at != "N" and i != "000000":
                continue
            try:
                v = float(val.strip())
            except ValueError:
                continue
            year = yr
            rows[(at, area, i, o)][DATATYPES[dt]] = v

    fields = ["area_type", "area_code", "area_name", "state_code", "industry_code", "industry_name",
              "occupation_code", "occupation_name", "p10", "p25", "p50", "p75", "p90", "mean",
              "employment", "survey_year"]
    with open(os.path.join(a.out, "bls_owner_pay.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields, lineterminator="\n")
        w.writeheader()
        for (at, area, i, o), v in sorted(rows.items()):
            st, _t, name = areas.get(area, ("", "", ""))
            w.writerow({"area_type": at, "area_code": area, "area_name": name, "state_code": st,
                        "industry_code": i, "industry_name": ind.get(i, ""), "occupation_code": o,
                        "occupation_name": occ.get(o, ""), "survey_year": year,
                        **{k: (int(v[k]) if k in v else "") for k in ["p10", "p25", "p50", "p75", "p90", "mean", "employment"]}})
    print(len(rows), "rows, survey year", year)


if __name__ == "__main__":
    main()
