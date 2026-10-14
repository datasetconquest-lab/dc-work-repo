import React, { useState, useEffect, useRef } from 'react';
import {
  FolderGit2,
  Folder,
  File as FileIcon,
  ExternalLink,
  Lock,
  Upload,
  Edit3,
  Eye,
  Trash2,
  Save,
  Loader2,
  RefreshCw,
  ChevronRight,
  Home,
  Link2,
  AlertTriangle,
  X,
  ArrowLeft,
  CheckCircle2,
} from 'lucide-react';
import {
  githubAPI,
  type GitHubTreeEntry,
  type GitHubFileResponse,
} from '../lib/api';

interface TaskGitHubManagerModalProps {
  task: {
    id: string;
    title: string;
    github_repo?: string | null;
  };
  isAdmin: boolean;
  onClose: () => void;
  onRepoLinked: (taskId: string, repo: string) => void;
}

function toRepoName(title: string): string {
  if (!title) return 'task-repo';
  let name = title
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (name.length > 80) {
    name = name.substring(0, 80).replace(/-+$/, '');
  }
  return name || 'task-repo';
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function TaskGitHubManagerModal({
  task,
  isAdmin,
  onClose,
  onRepoLinked,
}: TaskGitHubManagerModalProps) {
  const [repo, setRepo] = useState<string | null>(task.github_repo || null);
  const [currentPath, setCurrentPath] = useState<string>('');
  const [treeEntries, setTreeEntries] = useState<GitHubTreeEntry[]>([]);
  const [canWrite, setCanWrite] = useState<boolean>(true);
  const [isEmptyRepo, setIsEmptyRepo] = useState<boolean>(false);
  const [loadingTree, setLoadingTree] = useState<boolean>(false);

  // File Viewer / Editor state
  const [selectedFile, setSelectedFile] = useState<GitHubFileResponse | null>(null);
  const [loadingFile, setLoadingFile] = useState<boolean>(false);
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [editContent, setEditContent] = useState<string>('');
  const [commitMessage, setCommitMessage] = useState<string>('');
  const [committing, setCommitting] = useState<boolean>(false);

  // Upload state
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [uploading, setUploading] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Delete dialog state
  const [deleteTarget, setDeleteTarget] = useState<GitHubTreeEntry | null>(null);
  const [deleting, setDeleting] = useState<boolean>(false);

  // Creation / Linking states
  const [newRepoName, setNewRepoName] = useState<string>(toRepoName(task.title));
  const [creatingRepo, setCreatingRepo] = useState<boolean>(false);
  const [linkRepoName, setLinkRepoName] = useState<string>('');
  const [linkingRepo, setLinkingRepo] = useState<boolean>(false);

  // Notifications
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Auto-hide success
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (deleteTarget) {
          setDeleteTarget(null);
        } else if (selectedFile) {
          setSelectedFile(null);
          setIsEditing(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [deleteTarget, selectedFile, onClose]);

  // Load tree when repo or currentPath changes
  const loadTree = async (targetRepo: string = repo || '', targetPath: string = currentPath) => {
    if (!targetRepo) return;
    setLoadingTree(true);
    setError(null);
    try {
      const data = await githubAPI.getTree(targetRepo, targetPath);
      setTreeEntries(data.entries || []);
      setCanWrite(data.can_write);
      setIsEmptyRepo(!!data.empty);
    } catch (err: any) {
      setError(err?.message || 'Failed to load repository files');
    } finally {
      setLoadingTree(false);
    }
  };

  useEffect(() => {
    if (repo) {
      loadTree(repo, currentPath);
    }
  }, [repo, currentPath]);

  // Create repo handler
  const handleCreateRepo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRepoName.trim()) return;
    setCreatingRepo(true);
    setError(null);
    try {
      const res = await githubAPI.createRepo(task.id, newRepoName.trim());
      setRepo(res.github_repo);
      onRepoLinked(task.id, res.github_repo);
      setSuccess(`Repository ${res.github_repo} created and linked successfully!`);
      setCurrentPath('');
    } catch (err: any) {
      setError(err?.message || 'Failed to create repository');
    } finally {
      setCreatingRepo(false);
    }
  };

  // Link repo handler (Admin only)
  const handleLinkRepo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!linkRepoName.trim()) return;
    setLinkingRepo(true);
    setError(null);
    try {
      const res = await githubAPI.linkRepo(task.id, linkRepoName.trim());
      setRepo(res.github_repo);
      onRepoLinked(task.id, res.github_repo);
      setSuccess(`Linked repository ${res.github_repo} to task.`);
      setCurrentPath('');
    } catch (err: any) {
      setError(err?.message || 'Failed to link repository');
    } finally {
      setLinkingRepo(false);
    }
  };

  // Open file in viewer
  const handleOpenFile = async (entry: GitHubTreeEntry) => {
    if (!repo) return;
    setLoadingFile(true);
    setError(null);
    try {
      const fileData = await githubAPI.getFile(repo, entry.path);
      setSelectedFile(fileData);
      setEditContent(fileData.content || '');
      setIsEditing(false);
      setCommitMessage(`Update ${entry.name}`);
    } catch (err: any) {
      setError(err?.message || `Failed to open ${entry.name}`);
    } finally {
      setLoadingFile(false);
    }
  };

  // Save / commit file changes
  const handleSaveFile = async () => {
    if (!repo || !selectedFile) return;
    setCommitting(true);
    setError(null);
    try {
      await githubAPI.updateFile(repo, {
        path: selectedFile.path,
        content: editContent,
        sha: selectedFile.sha,
        message: commitMessage.trim() || `Update ${selectedFile.path}`,
      });
      setSuccess(`Committed changes to ${selectedFile.name}`);
      // Re-fetch file to update sha
      const updated = await githubAPI.getFile(repo, selectedFile.path);
      setSelectedFile(updated);
      setEditContent(updated.content || '');
      setIsEditing(false);
      loadTree();
    } catch (err: any) {
      setError(err?.message || 'Failed to commit changes');
    } finally {
      setCommitting(false);
    }
  };

  // Delete file handler
  const handleDeleteConfirm = async () => {
    if (!repo || !deleteTarget) return;
    setDeleting(true);
    setError(null);
    try {
      await githubAPI.deleteFile(repo, {
        path: deleteTarget.path,
        sha: deleteTarget.sha,
        message: `Delete ${deleteTarget.path}`,
      });
      setSuccess(`Deleted ${deleteTarget.name}`);
      setDeleteTarget(null);

      // If viewing this file, close viewer
      if (selectedFile?.path === deleteTarget.path) {
        setSelectedFile(null);
        setIsEditing(false);
      }

      await loadTree();
    } catch (err: any) {
      setError(err?.message || 'Failed to delete file');
    } finally {
      setDeleting(false);
    }
  };

  // File upload handler
  const handleFilesUpload = async (files: FileList | null) => {
    if (!repo || !files || files.length === 0) return;
    const fileArray = Array.from(files);
    setUploading(true);
    setError(null);
    try {
      const res = await githubAPI.uploadFiles(repo, currentPath, fileArray);
      const failed = res.results.filter((r) => r.status === 'failed');
      if (failed.length > 0) {
        setError(`Some files failed to commit: ${failed.map((f) => f.path).join(', ')}`);
      } else {
        setSuccess(`Successfully committed ${fileArray.length} file(s) to GitHub!`);
      }
      await loadTree();
    } catch (err: any) {
      setError(err?.message || 'Failed to upload files');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (canWrite) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (!canWrite) return;
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFilesUpload(e.dataTransfer.files);
    }
  };

  // Breadcrumbs parsing
  const pathSegments = currentPath ? currentPath.split('/') : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl h-[90vh] bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-gray-900 dark:text-gray-100">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50 flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center flex-shrink-0">
              <FolderGit2 className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold truncate tracking-tight">
                  {repo ? repo : 'Task GitHub Repository'}
                </h2>
                {repo && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                    <Lock className="w-3 h-3" />
                    Private
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                Task: {task.title}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {repo && (
              <>
                <a
                  href={`https://github.com/datasetconquest-lab/${repo}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors shadow-sm"
                  title="View on GitHub"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">GitHub</span>
                </a>
                <button
                  type="button"
                  onClick={() => loadTree()}
                  disabled={loadingTree}
                  className="p-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                  title="Refresh files"
                >
                  <RefreshCw className={`w-4 h-4 ${loadingTree ? 'animate-spin' : ''}`} />
                </button>
              </>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Alerts */}
        {error && (
          <div className="px-6 py-2.5 bg-red-50 dark:bg-red-950/40 border-b border-red-200 dark:border-red-900/50 flex items-center justify-between text-xs text-red-700 dark:text-red-300">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
              <span>{error}</span>
            </div>
            <button
              type="button"
              onClick={() => setError(null)}
              className="text-red-500 hover:text-red-700"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {success && (
          <div className="px-6 py-2.5 bg-emerald-50 dark:bg-emerald-950/40 border-b border-emerald-200 dark:border-emerald-900/50 flex items-center justify-between text-xs text-emerald-700 dark:text-emerald-300">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
              <span>{success}</span>
            </div>
            <button
              type="button"
              onClick={() => setSuccess(null)}
              className="text-emerald-500 hover:text-emerald-700"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 flex flex-col">
          {!repo ? (
            /* EMPTY STATE: No Repository Linked */
            <div className="max-w-lg mx-auto my-auto w-full py-8 text-center flex flex-col items-center">
              <div className="w-16 h-16 rounded-2xl bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-4">
                <FolderGit2 className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold mb-2">No Repository Linked Yet</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                Create a private repository under the company GitHub organization (
                <span className="font-mono text-xs font-semibold text-gray-700 dark:text-gray-300">
                  datasetconquest-lab
                </span>
                ) to upload code, documents, and manage files for this task.
              </p>

              {/* Create Repo Form */}
              <form onSubmit={handleCreateRepo} className="w-full space-y-4">
                <div className="text-left">
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Repository Name
                  </label>
                  <input
                    type="text"
                    value={newRepoName}
                    onChange={(e) => setNewRepoName(e.target.value)}
                    placeholder="e.g. customer-churn-model"
                    className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono shadow-sm"
                    required
                  />
                  <p className="mt-1.5 text-xs text-gray-400 dark:text-gray-500 font-mono">
                    Will be created as datasetconquest-lab/{toRepoName(newRepoName) || '<name>'}
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={creatingRepo || !newRepoName.trim()}
                  className="w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-50 shadow-sm"
                >
                  {creatingRepo ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Creating Private Repository...
                    </>
                  ) : (
                    <>
                      <Lock className="w-4 h-4" />
                      Create Private Repository
                    </>
                  )}
                </button>
              </form>

              {/* Admin Link Existing Repo Option */}
              {isAdmin && (
                <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-800 w-full text-left">
                  <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Link2 className="w-3.5 h-3.5" />
                    Admin Option: Link Existing Repo
                  </h4>
                  <form onSubmit={handleLinkRepo} className="flex gap-2">
                    <input
                      type="text"
                      value={linkRepoName}
                      onChange={(e) => setLinkRepoName(e.target.value)}
                      placeholder="existing-repo-name"
                      className="flex-1 px-3 py-2 text-xs rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 font-mono"
                    />
                    <button
                      type="submit"
                      disabled={linkingRepo || !linkRepoName.trim()}
                      className="px-3 py-2 text-xs font-medium rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200 transition-colors disabled:opacity-50"
                    >
                      {linkingRepo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Link'}
                    </button>
                  </form>
                </div>
              )}
            </div>
          ) : selectedFile ? (
            /* FILE VIEWER / EDITOR */
            <div className="flex-1 flex flex-col h-full">
              <div className="flex items-center justify-between pb-3 border-b border-gray-200 dark:border-gray-800 mb-4 flex-shrink-0">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedFile(null);
                      setIsEditing(false);
                    }}
                    className="inline-flex items-center gap-1 text-xs font-medium text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    Back to files
                  </button>
                  <span className="text-gray-300 dark:text-gray-700">|</span>
                  <span className="font-mono text-xs font-medium truncate max-w-md">
                    {selectedFile.path}
                  </span>
                  <span className="text-xs text-gray-400 font-mono">
                    ({formatBytes(selectedFile.size)})
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {selectedFile.can_write && !selectedFile.too_large && !selectedFile.is_binary && (
                    <>
                      {isEditing ? (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setIsEditing(false);
                              setEditContent(selectedFile.content || '');
                            }}
                            className="px-2.5 py-1 text-xs rounded-lg border border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                          >
                            Cancel Edit
                          </button>
                          <button
                            type="button"
                            onClick={handleSaveFile}
                            disabled={committing || editContent === selectedFile.content}
                            className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50"
                          >
                            {committing ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Save className="w-3 h-3" />
                            )}
                            Commit Changes
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setIsEditing(true)}
                          className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          Edit File
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>

              {selectedFile.too_large ? (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-gray-50 dark:bg-gray-800/40 rounded-xl border border-gray-200 dark:border-gray-800">
                  <AlertTriangle className="w-10 h-10 text-amber-500 mb-3" />
                  <h4 className="text-base font-semibold mb-1">File is Too Large to Preview</h4>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
                    Files larger than 2 MB cannot be viewed directly in the in-app editor.
                  </p>
                  <a
                    href={selectedFile.html_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Open on GitHub
                  </a>
                </div>
              ) : selectedFile.is_binary ? (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-gray-50 dark:bg-gray-800/40 rounded-xl border border-gray-200 dark:border-gray-800">
                  <FileIcon className="w-10 h-10 text-blue-500 mb-3" />
                  <h4 className="text-base font-semibold mb-1">Binary File</h4>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
                    Binary files (images, audio, archives) cannot be edited as plain text.
                  </p>
                  <a
                    href={selectedFile.html_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    View File on GitHub
                  </a>
                </div>
              ) : isEditing ? (
                <div className="flex-1 flex flex-col min-h-0 space-y-3">
                  <div className="flex-1 min-h-[300px]">
                    <textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      className="w-full h-full p-4 font-mono text-xs rounded-xl border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                      spellCheck={false}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={commitMessage}
                      onChange={(e) => setCommitMessage(e.target.value)}
                      placeholder={`Update ${selectedFile.name}`}
                      className="flex-1 px-3 py-2 text-xs rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 font-mono"
                    />
                  </div>
                </div>
              ) : (
                <div className="flex-1 overflow-auto rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 p-4">
                  <table className="w-full border-collapse font-mono text-xs">
                    <tbody>
                      {(selectedFile.content || '').split('\n').map((line, idx) => (
                        <tr key={idx} className="hover:bg-gray-100 dark:hover:bg-gray-900/60">
                          <td className="w-12 text-right pr-4 text-gray-400 select-none py-0.5">
                            {idx + 1}
                          </td>
                          <td className="whitespace-pre py-0.5 text-gray-800 dark:text-gray-200">
                            {line || ' '}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : (
            /* FOLDER BROWSER & ACTIONS */
            <div
              className={`flex-1 flex flex-col min-h-0 relative ${
                isDragging ? 'ring-2 ring-blue-500 ring-offset-2 rounded-xl' : ''
              }`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              {/* Drag & Drop Overlay */}
              {isDragging && (
                <div className="absolute inset-0 z-20 bg-blue-50/90 dark:bg-blue-950/90 border-2 border-dashed border-blue-500 rounded-xl flex flex-col items-center justify-center backdrop-blur-sm pointer-events-none">
                  <Upload className="w-12 h-12 text-blue-600 dark:text-blue-400 mb-2 animate-bounce" />
                  <p className="text-base font-semibold text-blue-900 dark:text-blue-200">
                    Drop files to upload to /{currentPath}
                  </p>
                </div>
              )}

              {/* Uploading Spinner Overlay */}
              {uploading && (
                <div className="absolute inset-0 z-30 bg-black/40 backdrop-blur-sm rounded-xl flex flex-col items-center justify-center text-white">
                  <Loader2 className="w-10 h-10 animate-spin mb-3 text-blue-400" />
                  <p className="text-sm font-medium">Uploading and committing files to GitHub...</p>
                </div>
              )}

              {/* Loading File Spinner Overlay */}
              {loadingFile && (
                <div className="absolute inset-0 z-30 bg-black/40 backdrop-blur-sm rounded-xl flex flex-col items-center justify-center text-white">
                  <Loader2 className="w-10 h-10 animate-spin mb-3 text-blue-400" />
                  <p className="text-sm font-medium">Loading file from GitHub...</p>
                </div>
              )}

              {/* Top Bar: Breadcrumbs & Action Buttons */}
              <div className="flex items-center justify-between gap-4 pb-4 mb-2 border-b border-gray-200 dark:border-gray-800 flex-shrink-0">
                {/* Breadcrumbs */}
                <div className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400 overflow-x-auto py-1">
                  <button
                    type="button"
                    onClick={() => setCurrentPath('')}
                    className="flex items-center gap-1 font-semibold hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                  >
                    <Home className="w-3.5 h-3.5" />
                    <span>{repo}</span>
                  </button>

                  {pathSegments.map((segment, index) => {
                    const segPath = pathSegments.slice(0, index + 1).join('/');
                    const isLast = index === pathSegments.length - 1;
                    return (
                      <React.Fragment key={segPath}>
                        <ChevronRight className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                        <button
                          type="button"
                          onClick={() => setCurrentPath(segPath)}
                          className={`font-mono truncate max-w-[140px] hover:text-blue-600 dark:hover:text-blue-400 transition-colors ${
                            isLast ? 'font-semibold text-gray-900 dark:text-gray-100' : ''
                          }`}
                        >
                          {segment}
                        </button>
                      </React.Fragment>
                    );
                  })}
                </div>

                {/* Upload Button */}
                {canWrite ? (
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      className="hidden"
                      onChange={(e) => handleFilesUpload(e.target.files)}
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-sm disabled:opacity-50"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>Upload files</span>
                    </button>
                  </div>
                ) : (
                  <span className="text-xs text-gray-400 italic">Read-only access</span>
                )}
              </div>

              {/* File List */}
              <div className="flex-1 overflow-y-auto">
                {loadingTree ? (
                  <div className="py-12 flex flex-col items-center justify-center text-gray-400">
                    <Loader2 className="w-8 h-8 animate-spin text-blue-500 mb-2" />
                    <span className="text-xs">Loading files from GitHub...</span>
                  </div>
                ) : isEmptyRepo ? (
                  <div className="py-16 text-center flex flex-col items-center justify-center border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-2xl">
                    <FolderGit2 className="w-12 h-12 text-gray-300 dark:text-gray-600 mb-3" />
                    <h4 className="text-base font-semibold mb-1">This repository is empty</h4>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-4 max-w-sm">
                      Upload your initial project files or code above to populate this repository.
                    </p>
                  </div>
                ) : treeEntries.length === 0 ? (
                  <div className="py-12 text-center text-gray-400">
                    <p className="text-xs">This folder is empty.</p>
                  </div>
                ) : (
                  <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden divide-y divide-gray-100 dark:divide-gray-800">
                    {/* Go up row if in subfolder */}
                    {currentPath && (
                      <div
                        onClick={() => {
                          const parts = currentPath.split('/');
                          parts.pop();
                          setCurrentPath(parts.join('/'));
                        }}
                        className="px-4 py-2.5 flex items-center gap-3 text-xs font-mono text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer select-none transition-colors"
                      >
                        <Folder className="w-4 h-4 text-blue-500" />
                        <span>.. (Go up)</span>
                      </div>
                    )}

                    {treeEntries.map((entry) => (
                      <div
                        key={entry.path}
                        className="px-4 py-2.5 flex items-center justify-between text-xs hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors group"
                      >
                        <div
                          className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer"
                          onClick={() => {
                            if (entry.type === 'dir') {
                              setCurrentPath(entry.path);
                            } else {
                              handleOpenFile(entry);
                            }
                          }}
                        >
                          {entry.type === 'dir' ? (
                            <Folder className="w-4 h-4 text-blue-500 flex-shrink-0" />
                          ) : (
                            <FileIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
                          )}
                          <span
                            className={`truncate font-mono ${
                              entry.type === 'dir'
                                ? 'font-semibold text-gray-900 dark:text-gray-100 hover:underline'
                                : 'text-gray-700 dark:text-gray-300'
                            }`}
                          >
                            {entry.name}
                          </span>
                        </div>

                        <div className="flex items-center gap-4 flex-shrink-0">
                          {entry.type === 'file' && (
                            <span className="text-[11px] font-mono text-gray-400">
                              {formatBytes(entry.size)}
                            </span>
                          )}

                          <div className="flex items-center gap-1 opacity-80 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                            {entry.type === 'file' ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleOpenFile(entry)}
                                  className="p-1 text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 rounded"
                                  title="View or Edit"
                                >
                                  {canWrite ? <Edit3 className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                </button>
                                {canWrite && (
                                  <button
                                    type="button"
                                    onClick={() => setDeleteTarget(entry)}
                                    className="p-1 text-gray-500 hover:text-red-600 dark:hover:text-red-400 rounded"
                                    title="Delete file"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Delete Confirmation Dialog */}
        {deleteTarget && (
          <div className="absolute inset-0 z-40 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-6 max-w-sm w-full shadow-2xl text-center">
              <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-950/50 text-red-600 flex items-center justify-center mx-auto mb-3">
                <Trash2 className="w-6 h-6" />
              </div>
              <h4 className="text-base font-semibold mb-1">Delete File?</h4>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                Are you sure you want to delete{' '}
                <span className="font-mono font-medium text-gray-800 dark:text-gray-200">
                  {deleteTarget.path}
                </span>
                ?
              </p>
              <p className="text-[11px] text-gray-400 dark:text-gray-500 mb-6 italic">
                This action commits a deletion to GitHub recorded under your name.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setDeleteTarget(null)}
                  disabled={deleting}
                  className="flex-1 py-2 px-3 text-xs font-medium rounded-xl border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDeleteConfirm}
                  disabled={deleting}
                  className="flex-1 py-2 px-3 text-xs font-medium rounded-xl bg-red-600 hover:bg-red-700 text-white flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default TaskGitHubManagerModal;
