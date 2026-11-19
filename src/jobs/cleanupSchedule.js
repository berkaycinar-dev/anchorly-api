import { CLEANUP_INTERVAL_MS } from "../constants/cleanup.js";

function describeRemoved(removed) {
  return Object.entries(removed)
    .filter(([, count]) => count > 0)
    .map(([name, count]) => `${name}: ${count}`)
    .join(", ");
}

export function startCleanupSchedule({
  run,
  logger = console,
  intervalMs = CLEANUP_INTERVAL_MS,
  setTimer = setInterval,
  clearTimer = clearInterval,
}) {
  let running = null;

  async function tick() {
    if (running) {
      return running;
    }

    running = (async () => {
      try {
        const summary = describeRemoved(await run());

        if (summary) {
          logger.info(`Cleanup removed ${summary}`);
        }
      } catch (error) {
        logger.error(new Error("Cleanup failed", { cause: error }));
      } finally {
        running = null;
      }
    })();

    return running;
  }

  const timer = setTimer(tick, intervalMs);
  timer.unref?.();
  const first = tick();

  return {
    first,
    tick,
    stop() {
      clearTimer(timer);
    },
  };
}
