import { useEffect, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { DateSeparator } from '../components/DateSeparator';
import { dataAPI, API_BASE_URL } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { Layout } from '../components/Layout';
import { MessageSquare, Send, Plus, Trash2, UserPlus, X, Upload } from 'lucide-react';
import { detectLinks, removeLinks, isOnlyLink } from '../lib/messageLinks';
import { isLongMessage, uploadTextAsDocument } from '../lib/messageText';
import { LinkBadges } from '../components/LinkBadges';
import { MessageAttachments } from '../components/MessageAttachments';
import { getStoredAuth } from '../lib/authStorage';
import { EmojiReactions, useReactions } from '../components/MessageReactions';
import { useMessageUploads } from '../hooks/useMessageUploads';
import { UploadTray } from '../components/UploadTray';

interface Group {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
}

interface Message {
  id: string;
  message: string;
  created_at: string;
  user_id: string;
  author_full_name?: string;
  author_avatar_url?: string | null;
  attachments?: any[];
  reactions?: Array<{ user_id: string; emoji: string; created_at: string }>;
  read_by?: Array<{ user_id: string; read_at: string }>;
}

interface Member {
  id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  added_at: string;
}

interface AllUser {
  id: string;
  full_name: string;
  email: string;
}

export function Groups() {
  const { user, isAdmin } = useAuth();
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [attachmentUrl, setAttachmentUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDesc, setNewGroupDesc] = useState('');
  const [allUsers, setAllUsers] = useState<AllUser[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
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
  const selectedGroupRef = useRef<string | null>(null);

  // Keep ref in sync with state for use in socket callback
  useEffect(() => {
    selectedGroupRef.current = selectedGroup;
  }, [selectedGroup]);

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

  // WebSocket connection for real-time group message updates
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

    // Listen for new group messages
    socket.on('new_group_message', (data: { group_id: string; message: Message }) => {
      // If the message is for the currently selected group, add it
      if (selectedGroupRef.current === data.group_id) {
        setMessages(prev => {
          // Avoid duplicates
          if (prev.some(m => m.id === data.message.id)) return prev;
          return [...prev, data.message];
        });
      }
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [user]);

  useEffect(() => {
    loadGroups();
    if (isAdmin) loadAllUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, isAdmin]);

  useEffect(() => {
    if (selectedGroup) {
      loadGroupData(selectedGroup);
    }
  }, [selectedGroup]);

  const loadGroups = async () => {
    try {
      if (!user) return;
      const data = await dataAPI.getGroupsByUser(user.id);
      const mapped = (data || []).map((row: any) => ({
        id: row.group_id,
        name: row.group_name,
        description: row.group_description,
        created_at: row.group_created_at,
      }));
      setGroups(mapped);
    } catch (error) {
      console.error('Error loading groups:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadAllUsers = async () => {
    try {
      const data = await dataAPI.getAllUsers();
      setAllUsers(data || []);
    } catch (error) {
      console.error('Error loading users:', error);
    }
  };

  const loadGroupData = async (groupId: string) => {
    try {
      const [msgs, mems] = await Promise.all([
        dataAPI.getGroupMessages(groupId),
        dataAPI.getGroupMembers(groupId),
      ]);
      setMessages(msgs || []);
      setMembers(
        (mems || []).map((m: any) => ({
          id: m.id,
          user_id: m.user_id,
          user_name: m.full_name || m.user_id,
          user_email: m.email || '',
          added_at: m.joined_at,
        }))
      );
    } catch (error) {
      console.error('Error loading group data:', error);
    }
  };

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
    if (selectedGroup) setIsDragging(true);
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

    if (!selectedGroup) return;

    const files = Array.from(e.dataTransfer.files);
    processFiles(files);
  };

  const handleSendMessage = async () => {
    // Allow send if there's a message OR files attached
    const hasMessage = newMessage.trim().length > 0;
    const hasFiles = uploadedFiles.length > 0 || attachmentUrl.trim().length > 0;

    if (!selectedGroup || !user || (!hasMessage && !hasFiles)) return;
    if (hasPendingUploads) {
      alert('Please wait for uploads to finish, or remove failed uploads before sending.');
      return;
    }

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
      await dataAPI.createGroupMessage(selectedGroup, messageContent, attachments);
      setNewMessage('');
      setAttachmentUrl('');
      clearUploads();
      loadGroupData(selectedGroup);
    } catch (error: any) {
      console.error('Error sending message:', error);
      alert(`Failed to send message: ${error.message}`);
    }
  };

  const handleCreateGroup = async () => {
    if (!newGroupName.trim() || !user) return;

    try {
      const newGroup = await dataAPI.createGroup(newGroupName.trim(), newGroupDesc.trim() || '');

      // Automatically add creator to the group
      if (newGroup?.id) {
        await dataAPI.addGroupMember(newGroup.id, user.id);
      }

      setShowCreateGroup(false);
      setNewGroupName('');
      setNewGroupDesc('');
      loadGroups();
    } catch (error) {
      console.error('Error creating group:', error);
    }
  };

  const handleAddMember = async () => {
    if (!selectedUserId || !selectedGroup || !user) return;

    try {
      await dataAPI.addGroupMember(selectedGroup, selectedUserId);
      setShowAddMember(false);
      setSelectedUserId('');
      loadGroupData(selectedGroup);
    } catch (error) {
      console.error('Error adding member:', error);
    }
  };

  const handleDeleteGroup = async (groupId: string) => {
    if (!confirm('Are you sure you want to delete this group? All messages will be lost.')) return;

    try {
      const res = await fetch(
        `${API_BASE_URL}/data/groups/${groupId}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${getStoredAuth()?.token || ''}`,
          },
        }
      );

      if (res.ok) {
        // Remove group from local state immediately
        setGroups(prev => prev.filter(g => g.id !== groupId));
        // Clear selection if we deleted the selected group
        if (selectedGroup === groupId) {
          setSelectedGroup(null);
          setMessages([]);
          setMembers([]);
        }
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to delete group');
      }
    } catch (error) {
      console.error('Error deleting group:', error);
      alert('Failed to delete group');
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    if (!selectedGroup) return;
    if (!confirm('Delete this message? This cannot be undone.')) return;
    try {
      const res = await fetch(
        `${API_BASE_URL}/data/groups/${selectedGroup}/messages/${messageId}`,
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

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-full">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="h-[calc(100vh-8rem)] flex gap-4">
        <div className="w-80 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 flex flex-col">
          <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Groups</h2>
            {isAdmin && (
              <button
                onClick={() => setShowCreateGroup(true)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                title="Create new group"
              >
                <Plus className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </button>
            )}
          </div>
          <div className="flex-1 overflow-y-auto">
            {groups.length === 0 ? (
              <p className="text-gray-500 dark:text-gray-400 text-center py-8">No groups yet</p>
            ) : (
              groups.map((group) => (
                <div
                  key={group.id}
                  onClick={() => setSelectedGroup(group.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && setSelectedGroup(group.id)}
                  className={`w-full p-4 text-left border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors cursor-pointer ${selectedGroup === group.id ? 'bg-blue-50 dark:bg-blue-900/30' : ''
                    }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <h3 className="font-medium text-gray-900 dark:text-gray-100">{group.name}</h3>
                      {group.description && (
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 line-clamp-1">{group.description}</p>
                      )}
                    </div>
                    {isAdmin && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteGroup(group.id);
                        }}
                        className="ml-2 p-1 hover:bg-red-100 rounded text-red-600 dark:text-red-400"
                        title="Delete group"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {selectedGroup ? (
          <div className="flex-1 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 flex flex-col">
            <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <MessageSquare className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                  {groups.find(g => g.id === selectedGroup)?.name}
                </h2>
                <span className="text-sm text-gray-500 dark:text-gray-400">({members.length} members)</span>
              </div>
              <div className="flex items-center space-x-2">
                {isAdmin && (
                  <button
                    onClick={() => setShowAddMember(true)}
                    className="flex items-center space-x-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>Add Member</span>
                  </button>
                )}
              </div>
            </div>

            <div
              className="flex-1 overflow-y-auto p-4 space-y-4 relative"
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              {isDragging && (
                <div className="absolute inset-0 z-50 bg-blue-500/10 border-2 border-dashed border-blue-500 rounded-xl flex items-center justify-center backdrop-blur-[2px] transition-all">
                  <div className="bg-white dark:bg-gray-800 px-6 py-4 rounded-2xl shadow-xl flex flex-col items-center gap-3">
                    <Upload className="w-10 h-10 text-blue-600 dark:text-blue-400 animate-bounce" />
                    <p className="font-bold text-blue-900 dark:text-blue-200 text-lg">Drop files to group chat</p>
                    <p className="text-sm text-blue-600 dark:text-blue-400">Release to attach up to 5 files</p>
                  </div>
                </div>
              )}
              {messages.map((message, index) => {
                const showDateSeparator = index === 0 ||
                  new Date(message.created_at).toDateString() !== new Date(messages[index - 1].created_at).toDateString();

                const handleReact = async (emoji: string) => {
                  try {
                    const result = await addReaction(message.id, 'group', emoji);
                    setMessages(prev => prev.map(msg =>
                      msg.id === message.id ? { ...msg, reactions: result.reactions } : msg
                    ));
                  } catch (e) {
                    console.error('Failed to add reaction', e);
                  }
                };

                return (
                  <div key={message.id}>
                    {showDateSeparator && <DateSeparator date={message.created_at} />}
                    <div className="flex items-start space-x-3">
                      {message.author_avatar_url ? (
                        <img
                          src={message.author_avatar_url}
                          alt={message.author_full_name || message.user_id}
                          className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center flex-shrink-0">
                          <span className="text-sm font-medium text-blue-600 dark:text-blue-400">
                            {(message.author_full_name || message.user_id).slice(0, 2).toUpperCase()}
                          </span>
                        </div>
                      )}
                      <div className="flex-1">
                        <div className="flex items-center space-x-2">
                          <span className="font-medium text-gray-900 dark:text-gray-100">{message.author_full_name || message.user_id}</span>
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {new Date(message.created_at).toLocaleString()}
                          </span>
                          {message.user_id === user?.id && (
                            <button
                              onClick={() => handleDeleteMessage(message.id)}
                              className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 dark:text-gray-500 hover:text-red-500 transition-colors"
                              title="Delete message"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                        {/* Show message text without URLs if there's other content */}
                        {!isOnlyLink(message.message) && removeLinks(message.message) && (
                          <p className="text-gray-700 dark:text-gray-200 mt-1 whitespace-pre-wrap break-words">{removeLinks(message.message)}</p>
                        )}

                        <LinkBadges links={detectLinks(message.message)} />
                        <MessageAttachments
                          attachments={Array.isArray(message.attachments)
                            ? message.attachments.filter((a: any) => a && (typeof a === 'string' || a.url))
                            : []}
                        />

                        <EmojiReactions
                          messageId={message.id}
                          messageType="group"
                          reactions={message.reactions || []}
                          currentUserId={user?.id || ''}
                          onReact={handleReact}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
              {/* Scroll anchor */}
              <div ref={messagesEndRef} />
            </div>

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
                <div className="flex items-center space-x-2">
                  <textarea
                    rows={1}
                    value={newMessage}
                    onChange={(e) => {
                      setNewMessage(e.target.value);
                      const el = e.currentTarget;
                      el.style.height = 'auto';
                      el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                    placeholder={uploadItems.length > 0 ? "Add a message (optional)..." : "Type a message..."}
                    className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none max-h-40 overflow-y-auto"
                  />
                  <label className={`p-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer transition-colors ${uploadItems.length >= 5 ? 'opacity-50 cursor-not-allowed' : ''}`} title="Upload files">
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
                    onClick={handleSendMessage}
                    disabled={(!newMessage.trim() && uploadedFiles.length === 0 && !attachmentUrl.trim()) || !selectedGroup || hasPendingUploads}
                    className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <Send className="w-5 h-5" />
                  </button>
                </div>
                <input
                  type="url"
                  value={attachmentUrl}
                  onChange={(e) => setAttachmentUrl(e.target.value)}
                  placeholder="Or paste a link (optional)"
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
            <div className="text-center">
              <MessageSquare className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 dark:text-gray-400">Select a group to view messages</p>
            </div>
          </div>
        )}
      </div>

      {showCreateGroup && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Create Group</h3>
              <button onClick={() => setShowCreateGroup(false)} className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Group Name</label>
                <input
                  type="text"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  placeholder="e.g. Engineering Team"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Description</label>
                <textarea
                  value={newGroupDesc}
                  onChange={(e) => setNewGroupDesc(e.target.value)}
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  placeholder="What is this group about?"
                />
              </div>
              <button
                onClick={handleCreateGroup}
                disabled={!newGroupName.trim()}
                className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                Create Group
              </button>
            </div>
          </div>
        </div>
      )}

      {showAddMember && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Add Member</h3>
              <button onClick={() => setShowAddMember(false)} className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Select User</label>
                <select
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                >
                  <option value="">Choose a user...</option>
                  {allUsers
                    .filter(u => !members.some(m => m.user_id === u.id))
                    .map(u => (
                      <option key={u.id} value={u.id}>{u.full_name} ({u.email})</option>
                    ))}
                </select>
              </div>
              <button
                onClick={handleAddMember}
                disabled={!selectedUserId}
                className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                Add Member
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
