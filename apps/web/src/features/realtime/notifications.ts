"use client";

export type BrowserNotificationStatus =
  | "unsupported"
  | "default"
  | "granted"
  | "denied";

export function getBrowserNotificationStatus(): BrowserNotificationStatus {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }

  return Notification.permission;
}

export async function requestBrowserNotifications(): Promise<BrowserNotificationStatus> {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }

  return Notification.requestPermission();
}

export function canShowBrowserNotification(): boolean {
  return getBrowserNotificationStatus() === "granted";
}

