import { runDoctorCommand } from "./commands/doctor.js";
import { runDiscoverCommand } from "./commands/discover.js";
import { runGenerateCommand } from "./commands/generate.js";
import { runExecuteCommand } from "./commands/execute.js";
import { runReportCommand } from "./commands/report.js";

const commandName = process.argv[2] ?? "doctor";

const commandHandlers = {
  doctor: runDoctorCommand,
  discover: runDiscoverCommand,
  generate: runGenerateCommand,
  execute: runExecuteCommand,
  report: runReportCommand
};

async function runPipelineCommand() {
  const results = [];
  results.push(await runDoctorCommand());
  results.push(await runDiscoverCommand());
  results.push(await runGenerateCommand());
  results.push(await runExecuteCommand());
  results.push(await runReportCommand());

  return {
    command: "pipeline",
    status: "ok",
    steps: results
  };
}

async function main() {
  if (commandName === "pipeline") {
    const result = await runPipelineCommand();
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  const handler = commandHandlers[commandName];

  if (!handler) {
    console.error(
      [
        `Unknown command: ${commandName}`,
        "Supported commands: doctor, discover, generate, execute, report, pipeline"
      ].join("\n")
    );
    process.exitCode = 1;
    return;
  }

  const result = await handler();
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ status: "error", message: error.message }, null, 2));
  process.exitCode = 1;
});
