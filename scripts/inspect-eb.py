"""Inspect eligible-batches JSON output for analysis."""
import json
import sys

sys.stdout.reconfigure(encoding="utf-8")
data = json.load(open(sys.argv[1], encoding="utf-8"))
print(f"Total batches: {len(data)}")
print("---")
for b in data:
    name = b["batch"]
    v = b["verdict"]
    n = len(b.get("subsetResults", []))
    si = b.get("scoreInfo", {})
    if si:
        s_str = f"score gap={si.get('gap')} lineMissing={si.get('lineMissing')}"
    else:
        s_str = "no scoreInfo"
    print(f"  {name} | v={v} subsets={n} | {s_str}")
    for s in b.get("subsetResults", []):
        print(f"    - {s['code']:25} | {s['name']:18} | v={s['verdict']}")
