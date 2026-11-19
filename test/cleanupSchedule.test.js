import { describe, expect, it, vi } from "vitest";
import { startCleanupSchedule } from "../src/jobs/cleanupSchedule.js";

function createTimers() {
  const timers = { callback: null, interval: null, cleared: false };

  return {
    timers,
    setTimer: (callback, interval) => {
      timers.callback = callback;
      timers.interval = interval;
      return { unref: vi.fn() };
    },
    clearTimer: () => {
      timers.cleared = true;
    },
  };
}

function createLogger() {
  return { info: vi.fn(), error: vi.fn() };
}

describe("cleanup schedule", () => {
  it("runs once right away and then every day", async () => {
    const run = vi.fn(async () => ({ tasks: 0 }));
    const { timers, setTimer, clearTimer } = createTimers();

    const schedule = startCleanupSchedule({
      run,
      logger: createLogger(),
      setTimer,
      clearTimer,
    });
    await schedule.first;

    expect(run).toHaveBeenCalledTimes(1);
    expect(timers.interval).toBe(24 * 60 * 60 * 1000);

    await timers.callback();
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("logs only the tables it removed rows from", async () => {
    const logger = createLogger();
    const { setTimer, clearTimer } = createTimers();

    const schedule = startCleanupSchedule({
      run: async () => ({ tasks: 3, projects: 0, sessions: 2 }),
      logger,
      setTimer,
      clearTimer,
    });
    await schedule.first;

    expect(logger.info).toHaveBeenCalledWith(
      "Cleanup removed tasks: 3, sessions: 2",
    );
  });

  it("stays quiet when nothing was removed", async () => {
    const logger = createLogger();
    const { setTimer, clearTimer } = createTimers();

    const schedule = startCleanupSchedule({
      run: async () => ({ tasks: 0 }),
      logger,
      setTimer,
      clearTimer,
    });
    await schedule.first;

    expect(logger.info).not.toHaveBeenCalled();
  });

  it("logs a failure and keeps the schedule going", async () => {
    const logger = createLogger();
    const { timers, setTimer, clearTimer } = createTimers();
    const run = vi
      .fn()
      .mockRejectedValueOnce(new Error("database is down"))
      .mockResolvedValueOnce({ tasks: 1 });

    const schedule = startCleanupSchedule({
      run,
      logger,
      setTimer,
      clearTimer,
    });
    await schedule.first;
    await timers.callback();

    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error.mock.calls[0][0].cause.message).toBe(
      "database is down",
    );
    expect(logger.info).toHaveBeenCalledWith("Cleanup removed tasks: 1");
  });

  it("does not start a second run while one is still going", async () => {
    let finish;
    const run = vi.fn(
      () =>
        new Promise((resolve) => {
          finish = () => resolve({});
        }),
    );
    const { timers, setTimer, clearTimer } = createTimers();

    const schedule = startCleanupSchedule({
      run,
      logger: createLogger(),
      setTimer,
      clearTimer,
    });
    const second = timers.callback();
    finish();
    await Promise.all([schedule.first, second]);

    expect(run).toHaveBeenCalledTimes(1);
  });

  it("lets the process exit and stops on request", async () => {
    const { timers, setTimer, clearTimer } = createTimers();
    let unref;
    const schedule = startCleanupSchedule({
      run: async () => ({}),
      logger: createLogger(),
      setTimer: (callback, interval) => {
        const timer = setTimer(callback, interval);
        unref = timer.unref;
        return timer;
      },
      clearTimer,
    });
    await schedule.first;

    schedule.stop();

    expect(unref).toHaveBeenCalled();
    expect(timers.cleared).toBe(true);
  });
});
