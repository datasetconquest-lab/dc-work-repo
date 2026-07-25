import { useEffect } from 'react';
import { CheckCircle, XCircle, Info, AlertTriangle } from 'lucide-react';

export type NotificationType = 'success' | 'error' | 'info' | 'warning';

export interface NotificationProps {
  type: NotificationType;
  message: string;
  onClose: () => void;
  duration?: number;
}

export function Notification({ type, message, onClose, duration = 5000 }: NotificationProps) {
  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(() => {
        onClose();
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [duration, onClose]);

  const icons = {
    success: <CheckCircle className="w-6 h-6" />,
    error: <XCircle className="w-6 h-6" />,
    info: <Info className="w-6 h-6" />,
    warning: <AlertTriangle className="w-6 h-6" />
  };

  const colors = {
    success: 'bg-green-500',
    error: 'bg-red-500',
    info: 'bg-blue-500',
    warning: 'bg-yellow-500'
  };

  return (
    <div
      className={`fixed top-4 right-4 z-50 ${colors[type]} text-white rounded-lg shadow-lg p-4 min-w-[300px] max-w-md animate-slide-in`}
      role="alert"
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5">
          {icons[type]}
        </div>
        <div className="flex-1">
          <p className="font-medium text-sm">{message}</p>
        </div>
        <button
          onClick={onClose}
          className="flex-shrink-0 ml-2 hover:bg-white/20 rounded p-1 transition-colors"
          aria-label="Close notification"
        >
          <XCircle className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}

// Hook for managing notifications
import { useState, useCallback } from 'react';

export interface NotificationState {
  id: number;
  type: NotificationType;
  message: string;
}

let notificationCounter = 0;

export function useNotifications() {
  const [notifications, setNotifications] = useState<NotificationState[]>([]);

  const showNotification = useCallback((type: NotificationType, message: string) => {
    const id = Date.now() * 1000 + (++notificationCounter % 1000);
    setNotifications(prev => [...prev, { id, type, message }]);
  }, []);

  const removeNotification = useCallback((id: number) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  const showSuccess = useCallback((message: string) => showNotification('success', message), [showNotification]);
  const showError = useCallback((message: string) => showNotification('error', message), [showNotification]);
  const showInfo = useCallback((message: string) => showNotification('info', message), [showNotification]);
  const showWarning = useCallback((message: string) => showNotification('warning', message), [showNotification]);

  const NotificationContainer = () => (
    <div className="fixed top-4 right-4 z-50 space-y-2">
      {notifications.map((notif, index) => (
        <div
          key={notif.id}
          style={{ top: `${index * 80}px` }}
          className="relative"
        >
          <Notification
            type={notif.type}
            message={notif.message}
            onClose={() => removeNotification(notif.id)}
          />
        </div>
      ))}
    </div>
  );

  return {
    showNotification,
    showSuccess,
    showError,
    showInfo,
    showWarning,
    NotificationContainer
  };
}