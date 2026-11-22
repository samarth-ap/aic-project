"use client";
import { useState } from "react";
import { currentQuarter, parseTerm, QUARTERS } from "@/lib/format";

/** Quarter + year dropdowns. Submits as `quarter` and `year`; the server joins them into "Fall 2026". */
export default function TermPicker({ term, isNew = false }: { term?: string; isNew?: boolean }) {
  const now = currentQuarter();
  const parsed = parseTerm(term);
  const quarter = isNew ? now.quarter : parsed.quarter;
  const year = isNew ? now.year : parsed.year ?? now.year;
  const [q, setQ] = useState<string>(quarter);
  const [y, setY] = useState(String(year));
  const years = Array.from(new Set([now.year - 1, now.year, now.year + 1, now.year + 2, year])).sort();
  return (
    <div className="grid2">
      <label className="field">
        <span>Quarter</span>
        <select className="input" name="quarter" value={q} onChange={(e) => setQ(e.target.value)}>
          {!isNew && <option value="">Not set</option>}
          {QUARTERS.map((q) => <option key={q} value={q}>{q}</option>)}
        </select>
      </label>
      <label className="field">
        <span>Year</span>
        <select className="input" name="year" value={y} onChange={(e) => setY(e.target.value)}>
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </label>
    </div>
  );
}
