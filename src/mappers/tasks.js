export function toTask(row) {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    date: row.date ?? "",
    completed: row.completed,
    completedAt: row.completedAt,
    projectId: row.projectId,
    description: row.description,
    steps: row.steps,
    order: row.position,
    repeat: row.repeat,
    repeatGroupId: row.repeatGroupId,
    boardStatus: row.boardStatus,
    important: row.important,
    dueTime: row.dueTime ?? "",
    attachments: [],
  };
}

const FIELD_TO_COLUMN = {
  title: "title",
  category: "category",
  date: "date",
  completed: "completed",
  completedAt: "completedAt",
  projectId: "projectId",
  description: "description",
  steps: "steps",
  order: "position",
  repeat: "repeat",
  repeatGroupId: "repeatGroupId",
  boardStatus: "boardStatus",
  important: "important",
  dueTime: "dueTime",
};

const EMPTY_STRING_AS_NULL = ["date", "dueTime"];

export function toTaskColumns(fields) {
  const columns = {};

  for (const [field, column] of Object.entries(FIELD_TO_COLUMN)) {
    if (fields[field] === undefined) {
      continue;
    }

    columns[column] =
      EMPTY_STRING_AS_NULL.includes(field) && fields[field] === ""
        ? null
        : fields[field];
  }

  return columns;
}
