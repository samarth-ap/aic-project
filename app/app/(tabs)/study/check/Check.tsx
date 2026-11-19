"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

interface Quiz {
  topic: string;
  mode: "ai" | "offline";
  questions: { q: string; options: string[]; answer: number; why: string }[];
}

export default function Check({ classCode, topic }: { classCode: string; topic: string }) {
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [err, setErr] = useState("");
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState<null | boolean>(null);

  useEffect(() => {
    fetch("/api/study/check", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ class_code: classCode, topic }) })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "Couldn't build a check");
        setQuiz(d);
      })
      .catch((e) => setErr(e.message));
  }, [classCode, topic]);

  if (err) return <p className="card muted" style={{ marginTop: 20 }}>{err}</p>;
  if (!quiz) return <p className="muted typing" style={{ marginTop: 20 }}>Building your check</p>;
  const total = quiz.questions.length;

  if (done !== null) {
    return (
      <div className="card center stack" style={{ marginTop: 20, padding: 28 }}>
        <p className="small muted bold">{quiz.topic}</p>
        <h1>{score} of {total}</h1>
        <p className="muted">{done ? "Passed. This weak spot is cleared." : "Not quite yet. Rewatch the moment or ask the tutor to explain it again, then try once more."}</p>
        <Link className="btn" href={`/app/study?class=${classCode}`}>Back to the plan</Link>
      </div>
    );
  }

  const q = quiz.questions[i];
  const next = async () => {
    const s = score + (picked === q.answer ? 1 : 0);
    setScore(s);
    setPicked(null);
    if (i + 1 < total) setI(i + 1);
    else {
      const r = await fetch("/api/study/result", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ class_code: classCode, topic, score: s, total }) }).then((x) => x.json()).catch(() => ({ passed: false }));
      setDone(Boolean(r.passed));
    }
  };
  return (
    <div style={{ marginTop: 14 }}>
      <div className="between">
        <p className="small muted bold">{quiz.topic}</p>
        <p className="small muted">{i + 1} of {total}</p>
      </div>
      <div className="bar" style={{ marginTop: 8 }}><div style={{ width: `${((i + (picked !== null ? 1 : 0)) / total) * 100}%`, background: "var(--violet)" }} /></div>
      <h2 style={{ marginTop: 22, lineHeight: 1.35 }}>{q.q}</h2>
      <div className="stack" style={{ marginTop: 18 }}>
        {q.options.map((o, k) => {
          const state = picked === null ? "" : k === q.answer ? "right" : k === picked ? "wrong" : "";
          return (
            <button
              key={k}
              className="card"
              disabled={picked !== null}
              onClick={() => setPicked(k)}
              style={{
                width: "100%",
                textAlign: "left",
                cursor: picked === null ? "pointer" : "default",
                fontWeight: 600,
                borderColor: state === "right" ? "var(--ok)" : state === "wrong" ? "var(--red)" : undefined,
                background: state === "right" ? "var(--ok-soft)" : state === "wrong" ? "#fdecea" : undefined,
              }}
            >
              {o}
            </button>
          );
        })}
      </div>
      {picked !== null && (
        <>
          <p className="notice" style={{ marginTop: 16 }}>{picked === q.answer ? "Right. " : "Not quite. "}{q.why}</p>
          <button className="btn block" style={{ marginTop: 16 }} onClick={next}>{i + 1 < total ? "Next question" : "See my result"}</button>
        </>
      )}
      {quiz.mode === "offline" && <p className="tiny muted" style={{ marginTop: 18 }}>AI is off on this server, so these questions come straight from what your professor said.</p>}
    </div>
  );
}
