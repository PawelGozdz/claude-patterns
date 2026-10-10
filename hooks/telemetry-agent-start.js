#!/usr/bin/env node
/**
 * PostToolUse(Agent) Hook: telemetry-agent-start — przypina startującego agenta panelu do otwartego
 * przebiegu telemetrii (ADR 0012, krok 3; TASK-OBS-003).
 *
 * Agent z narzędzia Agent startuje asynchronicznie (`async_launched`), więc w tym momencie nie ma
 * jeszcze wyniku ani kosztu — zdarzenie `step.end` pisze zwykle hook SubagentStop
 * (telemetry-agent-stop.js), a tu zostaje mapowanie agentId → slot panelu w pliku NA AGENTA.
 * Wyjątek: szybki agent potrafi się zatrzymać PRZED tym hookiem (SubagentStop wyprzedza
 * PostToolUse — zmierzone na żywo). Hook stop zostawia wtedy „oczekujące zatrzymanie", a ten hook
 * po rejestracji agenta domyka krok sam.
 *
 * Co hook robi, tylko gdy WSZYSTKO się zgadza:
 *   - narzędzie Agent z głównej pętli (nie subagent),
 *   - odpowiedź niesie agentId,
 *   - opis zaczyna się od markera `[slot:<id>]` (komenda wpisuje go do opisu każdego agenta panelu),
 *   - w `cwd` jest otwarty, świeży przebieg (telemetry-emit run-start).
 * Inaczej nic nie robi i wychodzi, bez dotykania dysku poza odczytem katalogu stanu.
 *
 * Kontrakt: stdin → stdout bez zmian, exit 0 zawsze, stderr = diagnostyka (jak workflow-metrics-postrun.js).
 * Z opisu agenta bierze WYŁĄCZNIE marker slotu — reszta to tekst z promptu i nie jest zapisywana.
 */

const { readStdinJsonWithRaw, isSubagent } = require("./lib/utils");
const sessions = require("./lib/telemetry-sessions");

async function main() {
  const { raw, parsed: input } = await readStdinJsonWithRaw();

  try {
    if (input.tool_name === "Agent" && !isSubagent(input)) {
      const agentId = input.tool_response && input.tool_response.agentId;
      const slot = sessions.parseSlot(input.tool_input && input.tool_input.description);
      const run = agentId && slot ? sessions.findOpenRun(input.cwd || process.cwd()) : null;
      if (run) {
        const agent = sessions.registerAgent({
          agentId,
          runId: run.runId,
          slot,
          agentType: input.tool_input.subagent_type,
          sessionId: input.session_id,
        });
        // Szybki agent mógł się zatrzymać PRZED tym hookiem — wtedy jego zatrzymanie czeka w stanie.
        const pending = agent ? sessions.readPendingStop(agentId) : null;
        if (pending) {
          const res = await sessions.completeStep(run, agent, {
            transcriptPath: pending.transcriptPath,
            hasReply: pending.hasReply,
          });
          if (!res.ok) console.error("[telemetry-agent-start] zapis nieudany:", res.error);
        }
      }
    }
  } catch (err) {
    console.error("[telemetry-agent-start] pominięto:", err.message);
  }

  process.stdout.write(raw);
  process.exit(0);
}

main();
