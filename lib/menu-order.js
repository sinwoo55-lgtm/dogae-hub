export function normalizedMenuOrder(menuIds, value) {
  if (!Array.isArray(menuIds) || !Array.isArray(value) || new Set(value).size !== value.length || value.some((id) => !menuIds.includes(id))) return null;
  return [...value, ...menuIds.filter((id) => !value.includes(id))];
}
