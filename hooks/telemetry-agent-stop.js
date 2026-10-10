#!/usr/bin/env node
/**
 * SubagentStop Hook: telemetry-agent-stop — zamyka krok agenta panelu zdarzeniem `step.end`
 * (ADR 0012, krok 3; TASK-OBS-003). Parą jest telemetry-agent-start.js, który zapisał plik agenta.
 *
 * SubagentStop odpala się w KAŻDYM projekcie przy KAŻDYM agencie (także agentach Workflow), więc
 * pierwsza i najtańsza decyzja to „czy ten agent ma plik stanu": nie ma → wyjście od razu, bez
 * czytania transkryptu i bez ładowania modułów ESM. Transkrypt (readTranscriptUsage — ta sama
 * funkcja co w subagent-stop-cost-log.js) czytamy tylko dla agentów panelu otwartego przebiegu.
 *
 * Wynik kroku liczy się z transkryptu i odpowiedzi, nie z deklaracji agenta: błąd API na końcu →
 * failed/infra, pusta odpowiedź → died/silent, reszta → ok (telemetry-sessions.classifyStop).
 *
 * Kontrakt: stdin → stdout bez zmian, exit 0 zawsze, stderr = diagnostyka.
 */

const { readStdinJsonWithRaw } = require("./lib/utils");
const sessions = require("./lib/telemetry-sessions");

async function main() {
  const { raw, parsed: input } = await readStdinJsonWithRaw();

  try {
    const agentId = input.agent_id;
    let agent = agentId ? sessions.readAgent(agentId) : null;

    // SubagentStop potrafi wyprzedzić PostToolUse(Agent) (szybki agent). Nieznany agent przy
    // otwartym przebiegu = zapisz oczekujące zatrzymanie, a potem sprawdź, czy hook startu nie
    // zdążył w międzyczasie — wtedy domykamy krok sami. Bez otwartego przebiegu: wyjście od razu.
    if (agentId && !agent) {
      const open = sessions.findOpenRun(input.cwd || process.cwd());
      if (open) {
        sessions.recordPendingStop({
          agentId, runId: open.runId, transcriptPath: input.agent_transcript_path,
          hasReply: Boolean(String(input.last_assistant_message || "").trim()),
        });
        agent = sessions.readAgent(agentId);
      }
    }

    const run = agent && !agent.done ? sessions.readRun(agent.runId) : null;
    if (run) {
      const res = await sessions.completeStep(run, agent, {
        transcriptPath: input.agent_transcript_path,
        hasReply: Boolean(String(input.last_assistant_message || "").trim()),
      });
      if (!res.ok) console.error("[telemetry-agent-stop] zapis nieudany:", res.error);
    }
  } catch (err) {
    console.error("[telemetry-agent-stop] pominięto:", err.message);
  }

  process.stdout.write(raw);
  process.exit(0);
}

main();
