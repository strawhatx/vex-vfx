// Each project has a page of its own, /editor/<id>: a random UUID, made by /editor/new.
export const isProjectId = (id: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
