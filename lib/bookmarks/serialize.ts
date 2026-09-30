const chains = new Map<string, Promise<unknown>>();

/** Runs `task` only after every earlier task with the same `key` has settled,
 * so a rapid save/unsave/save on one target reaches the server in click
 * order and the last click always wins. A failure doesn't block the queue. */
export function serialized<T>(key: string, task: () => Promise<T>): Promise<T> {
  const prev = chains.get(key) ?? Promise.resolve();
  const next = prev.catch(() => {}).then(task);
  chains.set(key, next);
  next.then(
    () => chains.get(key) === next && chains.delete(key),
    () => chains.get(key) === next && chains.delete(key)
  );
  return next;
}
