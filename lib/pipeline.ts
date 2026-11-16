// Gathers a session's data from the DB, builds the report, and stores it.
import { countPresence, getChatQuestions, getQuestions, getTaps, getTranscript, saveReport, type Session } from "./db";
import { buildReport, type Report } from "./analysis/report";

export async function analyzeSession(s: Session): Promise<Report> {
  const report = await buildReport({
    session: s,
    taps: await getTaps(s.id),
    questions: await getQuestions(s.id),
    tutorQuestions: await getChatQuestions(s.id),
    transcript: await getTranscript(s.id),
    joinedDevices: await countPresence(s.id),
  });
  await saveReport(s.id, report);
  return report;
}
