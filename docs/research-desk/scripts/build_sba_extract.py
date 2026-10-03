"""Build the SBA acquisitions extract for the Market data page.

Input: the SBA 7(a) FOIA loan files (CSV), downloaded from
https://data.sba.gov/dataset/7a-504-foia
  FOIA_7a_FY2010_FY2019_asof_YYMMDD.csv
  FOIA_7a_FY2020_Present_asof_YYMMDD.csv
(The "Change of Ownership" label only appears from fiscal year 2018, so the
FY2010-FY2019 file contributes FY2018 and FY2019 only.)

Output:
  sba_acquisitions.csv         one row per acquisition in the tracked industries
  sba_all_industry_by_fy.csv   count and median loan per fiscal year, all industries

Method, in order:
  1. Keep loans where BusinessAge == "Change of Ownership".
  2. Drop loans where LoanStatus == "CANCLD" (approved, never funded).
  3. Map NaicsCode to one of eight industry groups (GROUPS below).
  4. Collapse loans with the same borrower name, borrower state and approval
     date into one acquisition; loan_amount is the sum, the other fields come
     from the largest loan.
  5. Status: "Charged off" if any loan is CHGOFF; "Paid in full" if all are
     P I F; "Not yet disbursed" if all are COMMIT; otherwise "Active".

Usage: python build_sba_extract.py <file1.csv> <file2.csv> --out <dir>
Requires pandas.
"""

import argparse
import os

import pandas as pd

GROUPS = {
    "Advertising & marketing agencies": [
        "541810", "541820", "541830", "541840", "541850", "541860",
        "541870", "541890", "541430", "541613", "541910",
    ],
    "Accounting, tax & bookkeeping": ["541211", "541213", "541214", "541219"],
    "Law firms": ["541110", "541191", "541199"],
    "Architecture & engineering": [
        "541310", "541320", "541330", "541340", "541350", "541360", "541370", "541380",
    ],
    "IT & software services": ["541511", "541512", "541513", "541519"],
    "Management consulting": ["541611", "541612", "541614", "541618", "541620", "541690"],
    "Insurance agencies": ["524210"],
    "Financial advisors": ["523930", "523940"],
}
CODE_TO_GROUP = {code: group for group, codes in GROUPS.items() for code in codes}

COLS = [
    "AsOfDate", "BorrName", "BorrCity", "BorrState", "BankName", "GrossApproval",
    "ApprovalDate", "ApprovalFY", "ProcessingMethod", "InitialInterestRate",
    "TermInMonths", "NaicsCode", "NaicsDescription", "BusinessAge", "LoanStatus",
    "RevolverStatus", "JobsSupported",
]


def load(paths):
    frames = [pd.read_csv(p, usecols=COLS, dtype=str, low_memory=False) for p in paths]
    d = pd.concat(frames, ignore_index=True)
    d = d[(d.BusinessAge == "Change of Ownership") & (d.LoanStatus != "CANCLD")].copy()
    d["amt"] = d.GrossApproval.astype(float)
    d["code"] = d.NaicsCode.fillna("").str.strip()
    d["deal"] = (
        d.BorrName.fillna("").str.upper().str.strip()
        + "|" + d.BorrState.fillna("") + "|" + d.ApprovalDate
    )
    return d


def deal_status(statuses):
    s = set(statuses)
    if "CHGOFF" in s:
        return "Charged off"
    if s == {"P I F"}:
        return "Paid in full"
    if s == {"COMMIT"}:
        return "Not yet disbursed"
    return "Active"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("files", nargs="+")
    ap.add_argument("--out", default=".")
    a = ap.parse_args()
    d = load(a.files)
    as_of = d.AsOfDate.max()

    # All industries, per fiscal year.
    allind = d.groupby("deal").agg(fy=("ApprovalFY", "first"), amt=("amt", "sum"))
    by_fy = allind.groupby("fy").agg(acquisitions=("amt", "size"), median_loan=("amt", "median"))
    by_fy.index.name = "approval_fy"
    by_fy.assign(source_as_of=as_of).to_csv(os.path.join(a.out, "sba_all_industry_by_fy.csv"))

    # Tracked industries, one row per acquisition.
    t = d[d.code.isin(CODE_TO_GROUP)].copy()
    t["grp"] = t.code.map(CODE_TO_GROUP)
    t = t.sort_values("amt", ascending=False)
    rows = []
    for _, s in t.groupby("deal", sort=False):
        top = s.iloc[0]
        rows.append({
            "industry_group": top.grp,
            "naics_code": top.code,
            "naics_description": str(top.NaicsDescription).strip(),
            "borrower_name": str(top.BorrName).strip().title(),
            "borrower_city": str(top.BorrCity).strip().title(),
            "borrower_state": top.BorrState,
            "approval_date": top.ApprovalDate,
            "approval_fy": int(top.ApprovalFY),
            "loan_amount": int(round(s.amt.sum())),
            "loan_count": len(s),
            "lender": str(top.BankName).strip(),
            "initial_rate": top.InitialInterestRate,
            "term_months": top.TermInMonths,
            "jobs_supported": pd.to_numeric(s.JobsSupported, errors="coerce").max(),
            "status": deal_status(s.LoanStatus),
            "sba_express": str(top.ProcessingMethod).strip() == "SBA Express Program",
            "has_revolver": bool((s.RevolverStatus == "Y").any()),
            "source_as_of": as_of,
        })
    out = pd.DataFrame(rows).sort_values(["approval_date", "borrower_name"])
    out.to_csv(os.path.join(a.out, "sba_acquisitions.csv"), index=False)
    print(len(out), "acquisitions;", out.groupby("industry_group").size().to_dict())


if __name__ == "__main__":
    main()
