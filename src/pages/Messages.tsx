import { useEffect, useMemo, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { DateSeparator } from '../components/DateSeparator';
import { Layout } from '../components/Layout';
import { dataAPI, API_BASE_URL } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { MessageSquare, User, Send, RefreshCw, Upload, Trash2 } from 'lucide-react';
import { detectLinks, removeLinks, isOnlyLink } from '../lib/messageLinks';
import { isLongMessage, uploadTextAsDocument } from '../lib/messageText';
import { LinkBadges } from '../components/LinkBadges';
import { MessageAttachments } from '../components/MessageAttachments';
import { getStoredAuth } from '../lib/authStorage';
import { EmojiReactions, ReadStatus, useReactions } from '../components/MessageReactions';
import { useMessageUploads } from '../hooks/useMessageUploads';
import { UploadTray } from '../components/UploadTray';

interface SimpleUser {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url?: string | null;
}

interface DirectMessage {
  id: string;
  sender_id: string;
  recipient_id: string;
  content: string;
  attachments: any[];
  created_at: string;
  author_full_name?: string;
  author_avatar_url?: string;
  reactions?: Array<{ user_id: string; emoji: string; created_at: string }>;
  read_at?: string;
}

export function Messages() {
  const { user } = useAuth();
  const [people, setPeople] = useState<SimpleUser[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [loadingPeople, setLoadingPeople] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [attachmentUrl, setAttachmentUrl] = useState('');
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [isDragging, setIsDragging] = useState(false);
  const { addReaction } = useReactions();
  const {
    items: uploadItems,
    uploadedFiles,
    addFiles,
    removeUpload,
    retryUpload,
    clearUploads,
    isUploading,
    hasPendingUploads,
  } = useMessageUploads(5);

  // Refs for auto-scroll and WebSocket
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const selectedUserIdRef = useRef<string | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Typing indicator and online status states
  const [typingUsers, setTypingUsers] = useState<Record<string, boolean>>({});
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());

  // Keep ref in sync with state for use in socket callback
  useEffect(() => {
    selectedUserIdRef.current = selectedUserId;
  }, [selectedUserId]);

  const selectedUser = useMemo(
    () => people.find((p) => p.id === selectedUserId) || null,
    [people, selectedUserId]
  );

  const loadUnreadCounts = async () => {
    try {
      const res = await fetch(
        `${API_BASE_URL}/messages/unread-count`,
        {
          headers: {
            Authorization: `Bearer ${getStoredAuth()?.token || ''}`,
          },
        }
      );
      if (res.ok) {
        const data = await res.json();
        setUnreadCounts(data);
      } else {
        const errorData = await res.json();
        console.error('Failed to load unread counts:', errorData.error || res.statusText);
        alert(`Failed to load unread counts: ${errorData.error || res.statusText}`);
      }
    } catch (e) {
      console.error('Failed to load unread counts', e);
      alert(`Failed to load unread counts: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const markAsRead = async (otherId: string) => {
    try {
      const res = await fetch(
        `${API_BASE_URL}/messages/read/${otherId}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${getStoredAuth()?.token || ''}`,
          },
        }
      );
      if (!res.ok) {
        const errorData = await res.json();
        console.error('Failed to mark as read:', errorData.error || res.statusText);
        alert(`Failed to mark as read: ${errorData.error || res.statusText}`);
      }
      // Update local state to remove unread count
      setUnreadCounts(prev => {
        const next = { ...prev };
        delete next[otherId];
        return next;
      });
    } catch (e) {
      console.error('Failed to mark as read', e);
      alert(`Failed to mark as read: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const loadPeople = async () => {
    setLoadingPeople(true);
    try {
      // Active users for all members
      const all = await dataAPI.getActiveUsers();
      const filtered = (all || []).filter((p: any) => p.id !== user?.id);
      setPeople(filtered);
      if (!selectedUserId && filtered.length) setSelectedUserId(filtered[0].id);
    } catch (e) {
      console.error('Failed to load users for messages', e);
      setPeople([]);
      alert(`Failed to load users for messages: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoadingPeople(false);
    }
  };

  const loadConversation = async (otherId: string) => {
    if (!user) return;
    setLoadingMessages(true);
    try {
      const res = await fetch(
        `${API_BASE_URL}/messages/user/${otherId}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${getStoredAuth()?.token || ''}`,
          },
        }
      );

      if (!res.ok) {
        const errorData = await res.json();
        console.error('Failed to load conversation:', errorData.error || res.statusText);
        alert(`Failed to load conversation: ${errorData.error || res.statusText}`);
        setMessages([]);
        return;
      }

      const data = await res.json();
      setMessages(Array.isArray(data) ? data : []);

      // Mark as read when loading conversation
      markAsRead(otherId);
    } catch (e) {
      console.error('Failed to load conversation', e);
      setMessages([]);
      alert(`Failed to load conversation: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoadingMessages(false);
    }
  };

  // Scroll to bottom of messages
  const scrollToBottom = () => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  // Scroll to bottom when messages change
  useEffect(() => {
    if (messages.length > 0) {
      scrollToBottom();
    }
  }, [messages]);

  // WebSocket connection for real-time message updates
  useEffect(() => {
    if (!user) return;

    let baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
    baseUrl = baseUrl.replace(/\/api\/?$/, '');

    const socket = io(baseUrl, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      autoConnect: true,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      const auth = getStoredAuth();
      if (auth?.token) {
        socket.emit('authenticate', auth.token);
      }
    });

    // Request online users when authenticated
    socket.on('authenticated', () => {
      socket.emit('get_online_users');
    });

    // Listen for online users list
    socket.on('online_users', (userIds: string[]) => {
      setOnlineUsers(new Set(userIds));
    });

    // Listen for user status changes
    socket.on('user_status', (data: { userId: string; status: 'online' | 'offline' }) => {
      setOnlineUsers(prev => {
        const next = new Set(prev);
        if (data.status === 'online') {
          next.add(data.userId);
        } else {
          next.delete(data.userId);
        }
        return next;
      });
    });

    // Listen for typing indicators
    socket.on('user_typing', (data: { userId: string; isTyping: boolean; type: string }) => {
      if (data.type === 'direct') {
        setTypingUsers(prev => ({
          ...prev,
          [data.userId]: data.isTyping
        }));
        // Auto-clear typing indicator after 3 seconds
        if (data.isTyping) {
          setTimeout(() => {
            setTypingUsers(prev => ({
              ...prev,
              [data.userId]: false
            }));
          }, 3000);
        }
      }
    });

    // Listen for new messages
    socket.on('new_message', (data: { sender_id: string; message: DirectMessage }) => {
      // Clear typing indicator when message is received
      setTypingUsers(prev => ({
        ...prev,
        [data.sender_id]: false
      }));

      // If the message is from the currently selected user, add it to the conversation
      if (selectedUserIdRef.current === data.sender_id) {
        setMessages(prev => {
          // Avoid duplicates
          if (prev.some(m => m.id === data.message.id)) return prev;
          return [...prev, data.message];
        });
        // Mark as read since we're viewing the conversation
        markAsRead(data.sender_id);
      } else {
        // Update unread counts
        setUnreadCounts(prev => ({
          ...prev,
          [data.sender_id]: (prev[data.sender_id] || 0) + 1
        }));
      }
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [user]);

  useEffect(() => {
    loadPeople();
    loadUnreadCounts();
    // Poll for unread counts every 10 seconds
    const interval = setInterval(loadUnreadCounts, 10000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selectedUserId) {
      loadConversation(selectedUserId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUserId]);

  const processFiles = (files: File[]) => {
    if (files.length === 0) return;

    const result = addFiles(files);
    if (result.message) alert(result.message);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    processFiles(files);
    e.target.value = '';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (selectedUserId) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (!selectedUserId) return;

    const files = Array.from(e.dataTransfer.files);
    processFiles(files);
  };

  // Handle typing indicator
  const handleTyping = () => {
    if (!selectedUserId || !socketRef.current) return;

    // Emit typing event
    socketRef.current.emit('typing', {
      recipientId: selectedUserId,
      isTyping: true
    });

    // Clear previous timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Set timeout to stop typing indicator after 2 seconds of inactivity
    typingTimeoutRef.current = setTimeout(() => {
      socketRef.current?.emit('typing', {
        recipientId: selectedUserId,
        isTyping: false
      });
    }, 2000);
  };

  const handleSend = async () => {
    // Allow send if there's a message OR files attached
    const hasMessage = newMessage.trim().length > 0;
    const hasFiles = uploadedFiles.length > 0 || attachmentUrl.trim().length > 0;

    if (!user || !selectedUserId || (!hasMessage && !hasFiles)) return;
    if (hasPendingUploads) {
      alert('Please wait for uploads to finish, or remove failed uploads before sending.');
      return;
    }

    // Stop typing indicator when sending
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    socketRef.current?.emit('typing', {
      recipientId: selectedUserId,
      isTyping: false
    });

    try {
      const attachments: Array<{ id?: string; url: string; filename?: string; size?: number; mimetype?: string }> = [];
      if (attachmentUrl.trim()) {
        attachments.push({ url: attachmentUrl.trim() });
      }
      uploadedFiles.forEach(file => {
        attachments.push({
          id: file.id,
          url: file.url,
          filename: file.filename,
          size: file.size,
          mimetype: file.mimetype,
        });
      });

      // A very long message is shared as a .txt document so its structure stays
      // intact instead of being flattened into a chat bubble.
      let messageContent = newMessage.trim();
      if (isLongMessage(messageContent)) {
        const doc = await uploadTextAsDocument(messageContent);
        attachments.push(doc);
        messageContent = '';
      }

      const res = await fetch(
        `${API_BASE_URL}/messages/user/${selectedUserId}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${getStoredAuth()?.token || ''}`,
          },
          body: JSON.stringify({ content: messageContent, attachments }),
        }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to send message');
      }
      setNewMessage('');
      setAttachmentUrl('');
      clearUploads();
      await loadConversation(selectedUserId);
    } catch (e: any) {
      console.error('Failed to send message', e);
      alert(e.message || 'Failed to send message. Please check your connection or IP authorization.');
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    if (!confirm('Delete this message? This cannot be undone.')) return;
    try {
      const res = await fetch(
        `${API_BASE_URL}/messages/${messageId}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${getStoredAuth()?.token || ''}`,
          },
        }
      );
      if (res.ok) {
        setMessages(prev => prev.filter(m => m.id !== messageId));
      }
    } catch (e) {
      console.error('Failed to delete message', e);
    }
  };

  return (
    <Layout>
      <div className="h-[calc(100vh-8rem)] flex gap-4">
        <div className="w-72 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 flex flex-col">
          <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Messages</h2>
            <button
              onClick={loadPeople}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <RefreshCw className="w-4 h-4 text-gray-500 dark:text-gray-400" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {loadingPeople ? (
              <p className="text-gray-500 dark:text-gray-400 text-center py-8">Loading users…</p>
            ) : people.length === 0 ? (
              <p className="text-gray-500 dark:text-gray-400 text-center py-8">No other users</p>
            ) : (
              people.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setSelectedUserId(p.id)}
                  className={`w-full p-3 text-left border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 ${selectedUserId === p.id ? 'bg-blue-50 dark:bg-blue-900/30' : ''
                    }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      {p.avatar_url ? (
                        <img src={p.avatar_url} alt={p.full_name || p.email} className="w-8 h-8 rounded-full object-cover" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center">
                          <User className="w-4 h-4 text-blue-700 dark:text-blue-300" />
                        </div>
                      )}
                      {/* Online status indicator */}
                      {onlineUsers.has(p.id) && (
                        <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 border-2 border-white rounded-full" title="Online" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex justify-between items-center">
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                          {p.full_name || p.email}
                        </p>
                        {unreadCounts[p.id] > 0 && (
                          <span className="w-2.5 h-2.5 bg-blue-600 rounded-full"></span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{p.email}</p>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="flex-1 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 flex flex-col">
          <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center gap-3">
            <MessageSquare className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {selectedUser ? selectedUser.full_name || selectedUser.email : 'Select a user'}
              </h2>
              {selectedUser && (
                <p className="text-xs text-gray-500 dark:text-gray-400">{selectedUser.email}</p>
              )}
            </div>
          </div>

          <div
            className="flex-1 overflow-y-auto p-4 space-y-3 relative"
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            {isDragging && (
              <div className="absolute inset-0 z-50 bg-blue-500/10 border-2 border-dashed border-blue-500 rounded-xl flex items-center justify-center backdrop-blur-[2px] transition-all">
                <div className="bg-white dark:bg-gray-800 px-6 py-4 rounded-2xl shadow-xl flex flex-col items-center gap-3">
                  <Upload className="w-10 h-10 text-blue-600 dark:text-blue-400 animate-bounce" />
                  <p className="font-bold text-blue-900 dark:text-blue-200 text-lg">Drop files to upload</p>
                  <p className="text-sm text-blue-600 dark:text-blue-400">Release to attach up to 5 files</p>
                </div>
              </div>
            )}
            {loadingMessages ? (
              <p className="text-gray-500 dark:text-gray-400 text-center py-8">Loading messages…</p>
            ) : !selectedUser ? (
              <p className="text-gray-500 dark:text-gray-400 text-center py-8">Choose a user to start chatting</p>
            ) : messages.length === 0 ? (
              <p className="text-gray-500 dark:text-gray-400 text-center py-8">
                No messages yet. Say hello!
              </p>
            ) : (
              messages.map((m, index) => {
                const isMine = m.sender_id === user?.id;
                const links = detectLinks(m.content);
                const messageAttachments = Array.isArray(m.attachments)
                  ? m.attachments.filter((a: any) => a && (typeof a === 'string' || a.url))
                  : [];
                const name = m.author_full_name || people.find((p) => p.id === m.sender_id)?.full_name || m.sender_id;
                const avatar = m.author_avatar_url || people.find((p) => p.id === m.sender_id)?.avatar_url;

                const showDateSeparator = index === 0 ||
                  new Date(m.created_at).toDateString() !== new Date(messages[index - 1].created_at).toDateString();

                const handleReact = async (emoji: string) => {
                  try {
                    const result = await addReaction(m.id, 'direct', emoji);
                    // Update local state
                    setMessages(prev => prev.map(msg =>
                      msg.id === m.id ? { ...msg, reactions: result.reactions } : msg
                    ));
                  } catch (e) {
                    console.error('Failed to add reaction', e);
                  }
                };

                return (
                  <div key={m.id}>
                    {showDateSeparator && <DateSeparator date={m.created_at} />}
                    <div
                      className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-xs rounded-2xl px-3 py-2 text-sm ${isMine
                          ? 'bg-blue-600 text-white rounded-br-sm'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-bl-sm'
                          }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          {avatar ? (
                            <img src={avatar} alt={name} className="w-6 h-6 rounded-full object-cover" />
                          ) : (
                            <div className={`w-6 h-6 rounded-full ${isMine ? 'bg-white/20' : 'bg-blue-100 dark:bg-blue-900/40'} flex items-center justify-center`}>
                              <User className="w-3.5 h-3.5" />
                            </div>
                          )}
                          <span className={`text-xs ${isMine ? 'text-white/80' : 'text-gray-600 dark:text-gray-300'}`}>{name}</span>
                        </div>
                        {/* Show message text without URLs if there's other content */}
                        {!isOnlyLink(m.content) && removeLinks(m.content) && (
                          <p className="whitespace-pre-wrap break-words">{removeLinks(m.content)}</p>
                        )}
                        <LinkBadges links={links} />
                        <MessageAttachments attachments={messageAttachments} tone={isMine ? 'dark' : 'light'} />

                        {/* Reactions */}
                        <EmojiReactions
                          messageId={m.id}
                          messageType="direct"
                          reactions={m.reactions || []}
                          currentUserId={user?.id || ''}
                          onReact={handleReact}
                        />

                        <div className="mt-1 flex items-center justify-end gap-1">
                          <span className="text-[10px] opacity-70">
                            {new Date(m.created_at).toLocaleTimeString()}
                          </span>
                          {/* Read status - only show for sender */}
                          {isMine && (
                            <ReadStatus
                              isRead={!!m.read_at}
                              readAt={m.read_at}
                              isSender={true}
                            />
                          )}
                          {isMine && (
                            <button
                              onClick={() => handleDeleteMessage(m.id)}
                              className="ml-1 p-0.5 rounded hover:bg-white/20 transition-colors"
                              title="Delete message"
                            >
                              <Trash2 className="w-3 h-3 opacity-60 hover:opacity-100" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
            {/* Scroll anchor */}
            <div ref={messagesEndRef} />
          </div>

          {/* Typing indicator */}
          {selectedUserId && typingUsers[selectedUserId] && (
            <div className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400 italic">
              {selectedUser?.full_name || 'User'} is typing...
            </div>
          )}

          <div className="p-4 border-t border-gray-200 dark:border-gray-700">
            <div className="flex flex-col gap-2">
              <UploadTray items={uploadItems} onRemove={removeUpload} onRetry={retryUpload} />
              {/* File count indicator */}
              {uploadItems.length > 0 && (
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {uploadItems.length}/5 files attached
                </span>
              )}
              {isLongMessage(newMessage) && (
                <span className="text-xs text-amber-600 dark:text-amber-400">
                  Long message — it will be shared as a .txt document to keep its formatting.
                </span>
              )}
              <div className="flex items-center gap-2">
                <textarea
                  rows={1}
                  value={newMessage}
                  onChange={(e) => {
                    setNewMessage(e.target.value);
                    handleTyping();
                    const el = e.currentTarget;
                    el.style.height = 'auto';
                    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder={uploadItems.length > 0 ? "Add a message (optional)..." : "Type a message or paste a link…"}
                  className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none resize-none max-h-40 overflow-y-auto"
                />
                <label className={`p-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer ${uploadItems.length >= 5 ? 'opacity-50 cursor-not-allowed' : ''}`} title="Upload files">
                  <input
                    type="file"
                    multiple
                    onChange={handleFileUpload}
                    className="hidden"
                    disabled={uploadItems.length >= 5}
                  />
                  {isUploading ? (
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-gray-600"></div>
                  ) : (
                    <Upload className="w-5 h-5 text-gray-600 dark:text-gray-300" />
                  )}
                </label>
                <button
                  onClick={handleSend}
                  disabled={(!newMessage.trim() && uploadedFiles.length === 0 && !attachmentUrl.trim()) || !selectedUserId || hasPendingUploads}
                  className="p-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  <Send className="w-5 h-5" />
                </button>
              </div>
              <input
                type="url"
                value={attachmentUrl}
                onChange={(e) => setAttachmentUrl(e.target.value)}
                placeholder="Or paste a link (optional)"
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}

