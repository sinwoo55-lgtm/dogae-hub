// Name matching is a convenience policy, not proof of identity.
export function mayManageBoardPost(author, currentName, verifiedAdministrator = false) {
  if (verifiedAdministrator === true) return true;
  if (typeof author !== 'string' || typeof currentName !== 'string') return false;
  const original = author.trim();
  return Boolean(original) && original === currentName.trim();
}
