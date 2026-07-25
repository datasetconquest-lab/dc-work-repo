import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from '../contexts/AuthContext';
import { getStoredAuth } from '../lib/authStorage';
import { Bell, X, CheckCircle, XCircle, Wifi, WifiOff } from 'lucide-react';

// Notification toast component
function Toast({ message, onClose }: { message: string; onClose: () => void }) {
    useEffect(() => {
        const timer = setTimeout(onClose, 5000);
        return () => clearTimeout(timer);
    }, [onClose]);

    return (
        <div className="bg-gray-900 text-white px-4 py-3 rounded-lg shadow-lg flex items-start gap-3 min-w-[300px] max-w-md animate-slide-in">
            <Bell className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm flex-1">{message}</p>
            <button onClick={onClose} className="text-gray-400 dark:text-gray-500 hover:text-white">
                <X className="w-4 h-4" />
            </button>
        </div>
    );
}

export function GlobalNotifications() {
    const { user } = useAuth();
    const swRegistrationRef = useRef<ServiceWorkerRegistration | null>(null);
    const socketRef = useRef<Socket | null>(null);
    const [permission, setPermission] = useState<NotificationPermission>('default');
    const [dismissed, setDismissed] = useState(() => {
        return localStorage.getItem('notification-prompt-dismissed') === 'true';
    });
    const [toasts, setToasts] = useState<{ id: number; message: string }[]>([]);
    const [connected, setConnected] = useState(false);
    const toastIdRef = useRef(0);

    const handleDismiss = useCallback(() => {
        setDismissed(true);
        localStorage.setItem('notification-prompt-dismissed', 'true');
    }, []);

    // Register service worker on mount
    useEffect(() => {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js').then(registration => {
                console.log('[SW] Service Worker registered:', registration);
                swRegistrationRef.current = registration;
            }).catch(err => {
                console.error('[SW] Registration failed:', err);
            });
        }
    }, []);

    // Check notification permission on mount
    useEffect(() => {
        if ('Notification' in window) {
            setPermission(Notification.permission);
            if (Notification.permission !== 'default') {
                setDismissed(true);
                localStorage.setItem('notification-prompt-dismissed', 'true');
            }
        }
    }, []);

    const showToast = useCallback((message: string) => {
        const id = ++toastIdRef.current;
        setToasts(prev => [...prev.slice(-4), { id, message }]);
    }, []);

    const removeToast = useCallback((id: number) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    const showOSNotification = useCallback(async (title: string, body: string, tag: string) => {
        console.log('[Notification] Attempting OS notification via SW:', { title, permission: Notification.permission });

        if (!('Notification' in window)) {
            console.warn('[Notification] Browser does not support notifications');
            return;
        }

        if (Notification.permission !== 'granted') {
            console.warn('[Notification] Permission not granted:', Notification.permission);
            return;
        }

        try {
            const options = {
                body,
                tag,
                badge: '/favicon.png',
                icon: '/favicon.png',
                requireInteraction: false,
                silent: false,
                vibrate: [200, 100, 200],
                data: {
                    url: window.location.origin
                }
            };

            // Prefer a Service Worker registration that actually has an ACTIVE
            // worker. The stored ref can point at a registration that is still
            // installing (no .active), which makes showNotification throw
            // "No active registration available". navigator.serviceWorker.ready
            // resolves only once a worker is active.
            if ('serviceWorker' in navigator) {
                const registration = swRegistrationRef.current?.active
                    ? swRegistrationRef.current
                    : await navigator.serviceWorker.ready;
                await registration.showNotification(title, options);
                console.log('[Notification] SW OS notification shown');
            } else {
                const notif = new Notification(title, options);
                notif.onclick = () => {
                    window.focus();
                    notif.close();
                };
                console.log('[Notification] Fallback OS notification shown');
            }
        } catch (err) {
            console.error('[Notification] Failed to show OS notification:', err);
            // Last-resort fallback to the Notification constructor (desktop).
            try {
                const notif = new Notification(title, { body, tag });
                notif.onclick = () => {
                    window.focus();
                    notif.close();
                };
            } catch {
                /* notifications unavailable; in-app toast already shown */
            }
        }
    }, [showToast]);

    const enableNotifications = async () => {
        if ('Notification' in window) {
            try {
                const result = await Notification.requestPermission();
                setPermission(result);

                if (result === 'granted') {
                    showOSNotification(
                        'Notifications Enabled!',
                        'You will now receive instant desktop notifications.',
                        'test-notification'
                    );
                }
            } catch (err) {
                console.error('Failed to request notification permission:', err);
            }
        }
    };

    // WebSocket connection for real-time notifications
    useEffect(() => {
        if (!user) return;

        // Get base URL for Socket.IO (remove /api if present)
        let baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
        baseUrl = baseUrl.replace(/\/api\/?$/, ''); // Remove /api suffix

        console.log('[WebSocket] Connecting to:', baseUrl);

        const socket = io(baseUrl, {
            path: '/socket.io',
            transports: ['websocket', 'polling'],
            autoConnect: true,
            reconnection: true,
            reconnectionAttempts: 10,
            reconnectionDelay: 1000,
        });

        socketRef.current = socket;

        socket.on('connect', () => {
            console.log('[WebSocket] Connected');
            setConnected(true);

            // Authenticate with the server
            const auth = getStoredAuth();
            if (auth?.token) {
                socket.emit('authenticate', auth.token);
            }
        });

        socket.on('authenticated', (data) => {
            console.log('[WebSocket] Authenticated:', data);
        });

        socket.on('auth_error', (error) => {
            console.error('[WebSocket] Auth error:', error);
        });

        socket.on('disconnect', () => {
            console.log('[WebSocket] Disconnected');
            setConnected(false);
        });

        // Listen for notifications
        socket.on('notification', (notification: { type: string; title: string; message: string; timestamp: string }) => {
            console.log('[WebSocket] Notification received:', notification);

            // Show in-app toast immediately
            const fullMessage = `${notification.title}: ${notification.message}`;
            showToast(fullMessage);

            // Show OS notification
            const tag = `${notification.type}-${notification.timestamp || Date.now()}`;
            showOSNotification(notification.title, notification.message, tag);
        });

        socket.on('connect_error', (error) => {
            console.error('[WebSocket] Connection error:', error);
            setConnected(false);
        });

        return () => {
            socket.disconnect();
            socketRef.current = null;
        };
    }, [user, showToast, showOSNotification]);

    if (!user) return null;

    return (
        <>
            {/* Toast notifications container */}
            <div className="fixed top-4 right-4 z-[9999] space-y-2">
                {toasts.map(toast => (
                    <Toast
                        key={toast.id}
                        message={toast.message}
                        onClose={() => removeToast(toast.id)}
                    />
                ))}
            </div>

            {/* Connection status indicator */}
            <div className={`fixed bottom-4 right-4 z-[9998] px-3 py-1.5 rounded-full text-xs flex items-center gap-1.5 transition-all ${connected ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300' : 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300'
                }`}>
                {connected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                {connected ? 'Live' : 'Reconnecting...'}
            </div>

            {/* Permission prompt */}
            {permission === 'default' && !dismissed && (
                <div className="fixed bottom-4 left-4 z-[9999] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 px-4 py-3 rounded-lg shadow-xl flex items-center gap-4 max-w-sm">
                    <div className="bg-blue-100 dark:bg-blue-900/40 p-2 rounded-full text-blue-600 dark:text-blue-400">
                        <Bell className="w-5 h-5" />
                    </div>
                    <div className="flex-1">
                        <p className="text-sm font-medium">Enable desktop notifications</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Get instant updates when you're away</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={enableNotifications}
                            className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg font-medium hover:bg-blue-700 transition-colors whitespace-nowrap"
                        >
                            Enable
                        </button>
                        <button
                            onClick={handleDismiss}
                            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            )}

            {/* Permission denied message */}
            {permission === 'denied' && !dismissed && (
                <div className="fixed bottom-4 left-4 z-[9999] bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-900 dark:text-red-200 px-4 py-3 rounded-lg shadow-xl flex items-center gap-4 max-w-sm">
                    <div className="bg-red-100 dark:bg-red-900/40 p-2 rounded-full text-red-600 dark:text-red-400">
                        <XCircle className="w-5 h-5" />
                    </div>
                    <div className="flex-1">
                        <p className="text-sm font-medium">Notifications blocked</p>
                        <p className="text-xs text-red-700 dark:text-red-300">Please enable in browser settings</p>
                    </div>
                    <button
                        onClick={handleDismiss}
                        className="p-1 hover:bg-red-100 rounded text-red-400 hover:text-red-600 transition-colors"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            )}

            {/* Permission granted confirmation (briefly shown) */}
            {permission === 'granted' && !dismissed && (
                <GrantedBadge onDismiss={handleDismiss} />
            )}
        </>
    );
}

// Small badge that shows briefly when notifications are enabled
function GrantedBadge({ onDismiss }: { onDismiss: () => void }) {
    useEffect(() => {
        const timer = setTimeout(onDismiss, 3000);
        return () => clearTimeout(timer);
    }, [onDismiss]);

    return (
        <div className="fixed bottom-4 left-4 z-[9999] bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 text-green-900 dark:text-green-200 px-3 py-2 rounded-lg shadow-lg flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
            <span className="text-sm">Desktop notifications enabled</span>
        </div>
    );
}
