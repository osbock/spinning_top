"""Print snowflake discs from snowflake_top.py as JSON, for the parity tests.
Usage: python3 dump_python.py '[[R, style, seed, hole], ...]'"""
import json, sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "snowflake"))
import snowflake_top as st

out = []
for R, style, seed, hole in json.loads(sys.argv[1]):
    st.HOLE = hole
    g = st.snowflake(R, style, seed)
    out.append({"outer": list(g.exterior.coords), "holes": [list(i.coords) for i in g.interiors], "area": g.area})
print(json.dumps(out))
