import { useState } from 'react';
import { Smile, Check, CheckCheck } from 'lucide-react';
import { getStoredAuth } from '../lib/authStorage';

// Common emoji options for quick reactions
const EMOJI_OPTIONS = ['👍', '❤️', '😂', '😮', '😢', '🎉', '🔥', '👏'];

interface Reaction {
    user_id: string;
    emoji: string;
    created_at: string;
}

interface EmojiReactionsProps {
    messageId: string;
    messageType: 'direct' | 'group';
    reactions: Reaction[];
    currentUserId: string;
    onReact: (emoji: string) => void;
}

export function EmojiReactions({
    messageId: _messageId,
    messageType: _messageType,
    reactions,
    currentUserId,
    onReact
}: EmojiReactionsProps) {
    const [showPicker, setShowPicker] = useState(false);

    // Group reactions by emoji and count
    const reactionCounts = reactions.reduce((acc, r) => {
        if (!acc[r.emoji]) {
            acc[r.emoji] = { count: 0, users: [], hasCurrentUser: false };
        }
        acc[r.emoji].count++;
        acc[r.emoji].users.push(r.user_id);
        if (r.user_id === currentUserId) {
            acc[r.emoji].hasCurrentUser = true;
        }
        return acc;
    }, {} as Record<string, { count: number; users: string[]; hasCurrentUser: boolean }>);

    const handleEmojiClick = (emoji: string) => {
        onReact(emoji);
        setShowPicker(false);
    };

    return (
        <div className="flex items-center gap-1 flex-wrap mt-1">
            {/* Display existing reactions */}
            {Object.entries(reactionCounts).map(([emoji, data]) => (
                <button
                    key={emoji}
                    onClick={() => handleEmojiClick(emoji)}
                    className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs transition-all
            ${data.hasCurrentUser
                            ? 'bg-blue-100 dark:bg-blue-900/40 border border-blue-300 text-blue-700 dark:text-blue-300'
                            : 'bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600'
                        }`}
                    title={`${data.count} reaction${data.count > 1 ? 's' : ''}`}
                >
                    <span>{emoji}</span>
                    <span className="font-medium">{data.count}</span>
                </button>
            ))}

            {/* Emoji picker toggle */}
            <div className="relative">
                <button
                    onClick={() => setShowPicker(!showPicker)}
                    className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                    title="Add reaction"
                >
                    <Smile className="w-4 h-4" />
                </button>

                {showPicker && (
                    <div className="absolute bottom-full left-0 mb-1 p-2 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 flex gap-1 z-10">
                        {EMOJI_OPTIONS.map(emoji => (
                            <button
                                key={emoji}
                                onClick={() => handleEmojiClick(emoji)}
                                className="text-lg hover:scale-125 transition-transform p-1"
                            >
                                {emoji}
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

interface ReadStatusProps {
    isRead: boolean;
    readAt?: string;
    isSender: boolean;
}

export function ReadStatus({ isRead, readAt, isSender }: ReadStatusProps) {
    if (!isSender) return null;

    return (
        <span
            className={`ml-1 inline-flex ${isRead ? 'text-red-500' : 'text-gray-400 dark:text-gray-500'}`}
            title={isRead && readAt ? `Read at ${new Date(readAt).toLocaleString()}` : 'Sent'}
        >
            {isRead ? (
                <CheckCheck className="w-3.5 h-3.5" />
            ) : (
                <Check className="w-3.5 h-3.5" />
            )}
        </span>
    );
}

// Hook to manage reactions API calls
export function useReactions() {
    const addReaction = async (messageId: string, messageType: 'direct' | 'group', emoji: string) => {
        try {
            const res = await fetch(
                `${import.meta.env.VITE_API_URL}/reactions/${messageType}/${messageId}/react`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${getStoredAuth()?.token || ''}`,
                    },
                    body: JSON.stringify({ emoji }),
                }
            );

            if (!res.ok) throw new Error('Failed to add reaction');
            return await res.json();
        } catch (error) {
            console.error('Error adding reaction:', error);
            throw error;
        }
    };

    const markAsRead = async (messageId: string, messageType: 'direct' | 'group') => {
        try {
            const res = await fetch(
                `${import.meta.env.VITE_API_URL}/reactions/${messageType}/${messageId}/read`,
                {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${getStoredAuth()?.token || ''}`,
                    },
                }
            );

            if (!res.ok) throw new Error('Failed to mark as read');
            return await res.json();
        } catch (error) {
            console.error('Error marking as read:', error);
            throw error;
        }
    };

    const markAllAsRead = async (targetId: string, messageType: 'direct' | 'group') => {
        try {
            const endpoint = messageType === 'direct'
                ? `/reactions/direct/user/${targetId}/read-all`
                : `/reactions/group/${targetId}/read-all`;

            const res = await fetch(
                `${import.meta.env.VITE_API_URL}${endpoint}`,
                {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${getStoredAuth()?.token || ''}`,
                    },
                }
            );

            if (!res.ok) throw new Error('Failed to mark all as read');
            return await res.json();
        } catch (error) {
            console.error('Error marking all as read:', error);
            throw error;
        }
    };

    const getUnreadCount = async (messageType: 'direct' | 'group', groupId?: string) => {
        try {
            const endpoint = messageType === 'direct'
                ? '/reactions/direct/unread-count'
                : `/reactions/group/${groupId}/unread-count`;

            const res = await fetch(
                `${import.meta.env.VITE_API_URL}${endpoint}`,
                {
                    headers: {
                        Authorization: `Bearer ${getStoredAuth()?.token || ''}`,
                    },
                }
            );

            if (!res.ok) throw new Error('Failed to get unread count');
            return await res.json();
        } catch (error) {
            console.error('Error getting unread count:', error);
            throw error;
        }
    };

    return { addReaction, markAsRead, markAllAsRead, getUnreadCount };
}
