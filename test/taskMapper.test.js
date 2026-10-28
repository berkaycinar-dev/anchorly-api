import { describe, expect, it } from "vitest";
import { toTask, toTaskColumns } from "../src/mappers/tasks.js";

const row = {
  userId: "00000000-0000-4000-8000-000000000001",
  id: "4cbd7450-6231-43eb-96a2-3be6d2b1d532",
  title: "Write report",
  category: "Work",
  date: null,
  completed: false,
  completedAt: null,
  projectId: null,
  description: "",
  steps: [],
  position: 1761500000000,
  repeat: "none",
  repeatGroupId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
};

describe("task mapper", () => {
  it("turns a database row into the frontend task shape", () => {
    expect(toTask(row)).toEqual({
      id: row.id,
      title: "Write report",
      category: "Work",
      date: "",
      completed: false,
      completedAt: null,
      projectId: null,
      description: "",
      steps: [],
      order: 1761500000000,
      repeat: "none",
      repeatGroupId: null,
      attachments: [],
    });
  });

  it("keeps a real date as it is", () => {
    expect(toTask({ ...row, date: "2026-10-28" }).date).toBe("2026-10-28");
  });

  it("turns frontend fields into database columns", () => {
    expect(
      toTaskColumns({
        id: row.id,
        title: "Write report",
        date: "",
        order: 3,
        attachments: [{ id: "a" }],
      }),
    ).toEqual({ title: "Write report", date: null, position: 3 });
  });

  it("skips fields that were not sent", () => {
    expect(toTaskColumns({ completed: true })).toEqual({ completed: true });
  });
});
