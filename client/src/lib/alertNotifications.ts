import { useSyncExternalStore } from "react";

type Listener = () => void;

interface NotificationState {
  unreadCount: number;
  lastClearedAt: number;
}

let state: NotificationState = {
  unreadCount: 0,
  lastClearedAt: 0,
};

const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((l) => l());
}

export function incrementUnread(by = 1) {
  state = { ...state, unreadCount: state.unreadCount + by };
  emit();
}

export function clearUnread() {
  if (state.unreadCount === 0 && state.lastClearedAt !== 0) return;
  state = { unreadCount: 0, lastClearedAt: Date.now() };
  emit();
}

export function getUnreadCount(): number {
  return state.unreadCount;
}

function subscribe(l: Listener) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function useUnreadAlertCount(): number {
  return useSyncExternalStore(subscribe, getUnreadCount, () => 0);
}
