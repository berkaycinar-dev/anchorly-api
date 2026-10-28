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
};

export function toTaskColumns(fields) {
  const columns = {};

  for (const [field, column] of Object.entries(FIELD_TO_COLUMN)) {
    if (fields[field] === undefined) {
      continue;
    }

    columns[column] =
      field === "date" && fields.date === "" ? null : fields[field];
  }

  return columns;
}
