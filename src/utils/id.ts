/** Small collision-resistant id generator (no native crypto dependency). */
export function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
