/**
 * @fileoverview Jotai atoms for notification state management.
 * 
 * Provides global notification state for displaying success, error,
 * and informational messages across the application.
 */

import { atom } from 'jotai';

/**
 * Notification type enum.
 */
export type NotificationType = 'success' | 'error' | 'warning' | 'info';

/**
 * Notification interface.
 */
export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message?: string;
  dismissible?: boolean;
  autoHide?: boolean;
  duration?: number; // in milliseconds
  timestamp: number;
}

/**
 * Notification state atom.
 * Stores array of active notifications.
 */
export const notificationsAtom = atom<Notification[]>([]);

/**
 * Derived atom for adding notifications.
 */
export const addNotificationAtom = atom(
  null,
  (get, set, notification: Omit<Notification, 'id' | 'timestamp'>) => {
    const notifications = get(notificationsAtom);
    const newNotification: Notification = {
      ...notification,
      id: `notification-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      dismissible: notification.dismissible ?? true,
      autoHide: notification.autoHide ?? true,
      duration: notification.duration ?? 5000
    };
    
    set(notificationsAtom, [...notifications, newNotification]);
    
    // Auto-hide notification if enabled
    if (newNotification.autoHide && newNotification.duration) {
      setTimeout(() => {
        set(removeNotificationAtom, newNotification.id);
      }, newNotification.duration);
    }
    
    return newNotification.id;
  }
);

/**
 * Derived atom for removing notifications.
 */
export const removeNotificationAtom = atom(
  null,
  (get, set, notificationId: string) => {
    const notifications = get(notificationsAtom);
    set(notificationsAtom, notifications.filter(n => n.id !== notificationId));
  }
);

/**
 * Derived atom for clearing all notifications.
 */
export const clearNotificationsAtom = atom(
  null,
  (get, set) => {
    set(notificationsAtom, []);
  }
);

/**
 * Helper function to create success notification.
 */
export const createSuccessNotification = (
  title: string, 
  message?: string,
  options?: Partial<Notification>
): Omit<Notification, 'id' | 'timestamp'> => ({
  type: 'success',
  title,
  message,
  ...options
});

/**
 * Helper function to create error notification.
 */
export const createErrorNotification = (
  title: string, 
  message?: string,
  options?: Partial<Notification>
): Omit<Notification, 'id' | 'timestamp'> => ({
  type: 'error',
  title,
  message,
  autoHide: false, // Errors should not auto-hide by default
  ...options
});

/**
 * Helper function to create warning notification.
 */
export const createWarningNotification = (
  title: string, 
  message?: string,
  options?: Partial<Notification>
): Omit<Notification, 'id' | 'timestamp'> => ({
  type: 'warning',
  title,
  message,
  ...options
});

/**
 * Helper function to create info notification.
 */
export const createInfoNotification = (
  title: string, 
  message?: string,
  options?: Partial<Notification>
): Omit<Notification, 'id' | 'timestamp'> => ({
  type: 'info',
  title,
  message,
  ...options
});