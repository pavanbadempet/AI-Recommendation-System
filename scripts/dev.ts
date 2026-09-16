/**
 * Cross-platform concurrent development runner.
 * Spawns the Rust Axum serving backend (apex_server) and the Bun React 19 frontend
 * concurrently, coordinating lifecycle and propagating termination signals cleanly.
 */

let isShuttingDown = false;

console.log("=================================================");
console.log(" 🎬 Movie Recommendation System — Dev Orchestrator");
console.log("=================================================");
console.log("🦀 Spawning Rust Backend (apex_server)...");

const backend = Bun.spawn(
  ["cargo", "run", "--manifest-path", "backend/rust_core/Cargo.toml", "--bin", "apex_server"],
  {
    stdio: ["inherit", "inherit", "inherit"],
    env: { ...process.env },
  }
);

console.log("⚡ Spawning Bun Frontend (Vite Dev Server)...");

const frontend = Bun.spawn(
  ["bun", "--cwd", "frontend", "dev"],
  {
    stdio: ["inherit", "inherit", "inherit"],
    env: { ...process.env },
  }
);

function cleanup(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`\n🛑 [dev.ts] Received ${signal}, shutting down all processes...`);

  try {
    backend.kill();
  } catch {}

  try {
    frontend.kill();
  } catch {}

  // Allow short grace period for subprocess termination
  setTimeout(() => {
    process.exit(0);
  }, 100);
}

process.on("SIGINT", () => cleanup("SIGINT"));
process.on("SIGTERM", () => cleanup("SIGTERM"));
process.on("exit", () => {
  try { backend.kill(); } catch {}
  try { frontend.kill(); } catch {}
});

backend.exited.then((code) => {
  if (!isShuttingDown && code !== 0 && code !== null) {
    console.error(`⚠️ [dev.ts] Backend process exited with code ${code}`);
    cleanup("BACKEND_EXIT");
  }
});

frontend.exited.then((code) => {
  if (!isShuttingDown && code !== 0 && code !== null) {
    console.error(`⚠️ [dev.ts] Frontend process exited with code ${code}`);
    cleanup("FRONTEND_EXIT");
  }
});
