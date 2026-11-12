// A signal that the user just changed something on the server, so shared
// shell data (the sidebar's accounts and Review count) can reload. The API
// client sends it after every successful non-read request - see the ui-shell
// spec, "Navigation stays current after a change".
const listeners = new Set();

export function onDataChanged(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function notifyDataChanged() {
  for (const listener of [...listeners]) {
    try {
      listener();
    } catch (e) {
      // One broken listener mustn't stop the others from reloading.
      console.error(e);
    }
  }
}
