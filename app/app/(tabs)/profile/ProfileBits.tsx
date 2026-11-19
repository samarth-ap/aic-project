"use client";
import { useState, useTransition } from "react";
import { savePrefs } from "@/app/actions";
import { IconCheck } from "@/components/icons";

export function PrefToggle({ k, label, on, last }: { k: "notify_lecture" | "study_reminder" | "dark_live"; label: string; on: boolean; last?: boolean }) {
  const [v, setV] = useState(on);
  const [, start] = useTransition();
  return (
    <label className="between" style={{ padding: "14px 0", borderBottom: last ? 0 : "1px solid var(--border)", cursor: "pointer" }}>
      <span>{label}</span>
      <input type="checkbox" className="sr-only" checked={v} onChange={(e) => { setV(e.target.checked); start(() => savePrefs({ [k]: e.target.checked })); }} />
      <span aria-hidden style={{ width: 26, height: 26, borderRadius: 6, border: `2px solid ${v ? "var(--violet)" : "var(--faint)"}`, background: v ? "var(--violet)" : "#fff", color: "#fff", display: "grid", placeItems: "center" }}>
        {v && <IconCheck />}
      </span>
    </label>
  );
}

export function ConfirmButton({ action, message, children, className, style }: { action: () => Promise<void>; message: string; children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  const [pending, start] = useTransition();
  return (
    <button className={className} style={style} disabled={pending} onClick={() => confirm(message) && start(() => action())}>
      {children}
    </button>
  );
}
