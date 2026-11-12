// Gathers a session's data from the DB, builds the report, and stores it.
import { countPresence, getQuestions, getTaps, getTranscript, saveReport, type Session } from "./db";
import { buildReport, type Report } from "./analysis/report";

export async function analyzeSession(s: Session): Promise<Report> {
  const report = await buildReport({
    session: s,
    taps: getTaps(s.id),
    questions: getQuestions(s.id),
    transcript: getTranscript(s.id),
    joinedDevices: countPresence(s.id),
  });
  saveReport(s.id, report);
  return report;
}
