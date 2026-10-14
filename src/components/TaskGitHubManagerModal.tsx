import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  FolderGit2,
  Folder,
  File as FileIcon,
  FileCode,
  FileText,
  FileSpreadsheet,
  FileImage,
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
  Search,
  Plus,
  GitBranch,
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

function getFileIcon(filename: string) {
  const ext = filename.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'ts':
    case 'tsx':
    case 'js':
    case 'jsx':
    case 'py':
    case 'html':
    case 'css':
    case 'json':
    case 'sql':
      return <FileCode className="w-4 h-4 text-emerald-500 flex-shrink-0" />;
    case 'md':
    case 'txt':
    case 'doc':
    case 'docx':
    case 'pdf':
      return <FileText className="w-4 h-4 text-blue-500 flex-shrink-0" />;
    case 'csv':
    case 'xlsx':
    case 'xls':
      return <FileSpreadsheet className="w-4 h-4 text-teal-500 flex-shrink-0" />;
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'svg':
    case 'gif':
    case 'webp':
      return <FileImage className="w-4 h-4 text-purple-500 flex-shrink-0" />;
    default:
      return <FileIcon className="w-4 h-4 text-gray-400 dark:text-gray-500 flex-shrink-0" />;
  }
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
  const [searchQuery, setSearchQuery] = useState<string>('');

  // File Viewer / Editor state
  const [selectedFile, setSelectedFile] = useState<GitHubFileResponse | null>(null);
  const [loadingFile, setLoadingFile] = useState<boolean>(false);
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [editContent, setEditContent] = useState<string>('');
  const [commitMessage, setCommitMessage] = useState<string>('');
  const [committing, setCommitting] = useState<boolean>(false);

  // New File modal state
  const [showNewFileModal, setShowNewFileModal] = useState<boolean>(false);
  const [newFileName, setNewFileName] = useState<string>('');
  const [newFileContent, setNewFileContent] = useState<string>('');
  const [creatingFile, setCreatingFile] = useState<boolean>(false);

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
        } else if (showNewFileModal) {
          setShowNewFileModal(false);
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
  }, [deleteTarget, showNewFileModal, selectedFile, onClose]);

  // Load tree
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

  // Link repo handler
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

  // Create New File handler
  const handleCreateNewFile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repo || !newFileName.trim()) return;
    const fullPath = currentPath ? `${currentPath}/${newFileName.trim()}` : newFileName.trim();
    setCreatingFile(true);
    setError(null);
    try {
      await githubAPI.updateFile(repo, {
        path: fullPath,
        content: newFileContent,
        message: `Create ${newFileName.trim()}`,
      });
      setSuccess(`Created file ${newFileName.trim()}`);
      setShowNewFileModal(false);
      setNewFileName('');
      setNewFileContent('');
      await loadTree();
    } catch (err: any) {
      setError(err?.message || 'Failed to create new file');
    } finally {
      setCreatingFile(false);
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
        setError(`Some files failed: ${failed.map((f) => f.path).join(', ')}`);
      } else {
        setSuccess(`Committed ${fileArray.length} file(s) to GitHub!`);
      }
      await loadTree();
    } catch (err: any) {
      setError(err?.message || 'Failed to upload files');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Filtered files
  const filteredEntries = useMemo(() => {
    if (!searchQuery.trim()) return treeEntries;
    const query = searchQuery.toLowerCase().trim();
    return treeEntries.filter((item) => item.name.toLowerCase().includes(query));
  }, [treeEntries, searchQuery]);

  const pathSegments = currentPath ? currentPath.split('/') : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/70 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl h-[92vh] max-h-[860px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-slate-800 dark:text-slate-100">
        
        {/* Top Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200/80 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/80 backdrop-blur-sm flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center shadow-sm flex-shrink-0">
              <FolderGit2 className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-base font-semibold truncate tracking-tight text-slate-900 dark:text-white">
                  {repo || 'Task GitHub Repository'}
                </h2>
                {repo && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                    <Lock className="w-3 h-3" />
                    Private
                  </span>
                )}
                {repo && (
                  <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                    <GitBranch className="w-3 h-3 text-slate-400" />
                    main
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                {task.title}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 flex-shrink-0">
            {repo && (
              <>
                <a
                  href={`https://github.com/datasetconquest-lab/${repo}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-750 transition-colors shadow-xs"
                  title="View on GitHub"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                  <span className="hidden sm:inline">GitHub</span>
                </a>
                <button
                  type="button"
                  onClick={() => loadTree()}
                  disabled={loadingTree}
                  className="p-1.5 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  title="Refresh files"
                >
                  <RefreshCw className={`w-4 h-4 ${loadingTree ? 'animate-spin' : ''}`} />
                </button>
              </>
            )}
            <div className="w-px h-4 bg-slate-200 dark:bg-slate-700 mx-1" />
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Alerts */}
        {error && (
          <div className="px-5 py-2.5 bg-red-500/10 border-b border-red-500/20 flex items-center justify-between text-xs text-red-600 dark:text-red-400 flex-shrink-0">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
            <button type="button" onClick={() => setError(null)} className="hover:opacity-75">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {success && (
          <div className="px-5 py-2.5 bg-emerald-500/10 border-b border-emerald-500/20 flex items-center justify-between text-xs text-emerald-600 dark:text-emerald-400 flex-shrink-0">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              <span>{success}</span>
            </div>
            <button type="button" onClick={() => setSuccess(null)} className="hover:opacity-75">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Modal Main Area */}
        <div className="flex-1 overflow-hidden p-4 sm:p-5 flex flex-col bg-slate-50/50 dark:bg-slate-900/40">
          {!repo ? (
            /* EMPTY STATE: Create Repository */
            <div className="max-w-md mx-auto my-auto w-full py-8 text-center flex flex-col items-center">
              <div className="w-14 h-14 rounded-2xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-4 ring-8 ring-blue-500/5">
                <FolderGit2 className="w-7 h-7" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1.5">
                No Repository Linked
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-6 leading-relaxed">
                Create a private repository under the company GitHub (
                <span className="font-mono text-slate-700 dark:text-slate-300 font-medium">
                  datasetconquest-lab
                </span>
                ) to manage and version control files for this task.
              </p>

              <form onSubmit={handleCreateRepo} className="w-full space-y-3.5">
                <div className="text-left">
                  <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Repository Name
                  </label>
                  <div className="flex rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden shadow-xs focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent">
                    <span className="inline-flex items-center px-3 text-xs text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-800/80 border-r border-slate-200 dark:border-slate-700 select-none">
                      datasetconquest-lab/
                    </span>
                    <input
                      type="text"
                      value={newRepoName}
                      onChange={(e) => setNewRepoName(e.target.value)}
                      placeholder="repo-name"
                      className="flex-1 px-3 py-2 text-xs font-mono bg-transparent text-slate-900 dark:text-white focus:outline-none"
                      required
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={creatingRepo || !newRepoName.trim()}
                  className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-medium text-xs flex items-center justify-center gap-2 transition-all shadow-sm hover:shadow disabled:opacity-50"
                >
                  {creatingRepo ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Creating Private Repository...
                    </>
                  ) : (
                    <>
                      <Lock className="w-3.5 h-3.5" />
                      Create Private Repository
                    </>
                  )}
                </button>
              </form>

              {isAdmin && (
                <div className="mt-8 pt-5 border-t border-slate-200 dark:border-slate-800 w-full text-left">
                  <h4 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Link2 className="w-3 h-3" />
                    Admin: Link Existing Repo
                  </h4>
                  <form onSubmit={handleLinkRepo} className="flex gap-2">
                    <input
                      type="text"
                      value={linkRepoName}
                      onChange={(e) => setLinkRepoName(e.target.value)}
                      placeholder="existing-repo-name"
                      className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <button
                      type="submit"
                      disabled={linkingRepo || !linkRepoName.trim()}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-800 dark:text-slate-200 transition-colors disabled:opacity-50"
                    >
                      {linkingRepo ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Link'}
                    </button>
                  </form>
                </div>
              )}
            </div>
          ) : selectedFile ? (
            /* FILE VIEWER & CODE EDITOR */
            <div className="flex-1 flex flex-col h-full bg-white dark:bg-slate-950 rounded-xl border border-slate-200/90 dark:border-slate-800 overflow-hidden shadow-xs">
              {/* Viewer Sub-Header */}
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex-shrink-0">
                <div className="flex items-center gap-2.5 min-w-0">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedFile(null);
                      setIsEditing(false);
                    }}
                    className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Back</span>
                  </button>
                  <span className="text-slate-300 dark:text-slate-700">/</span>
                  <span className="font-mono text-xs font-semibold text-slate-800 dark:text-slate-200 truncate max-w-sm">
                    {selectedFile.path}
                  </span>
                  <span className="text-[11px] text-slate-400 font-mono">
                    ({formatBytes(selectedFile.size)})
                  </span>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
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
                            className="px-2.5 py-1 text-xs rounded-lg border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={handleSaveFile}
                            disabled={committing || editContent === selectedFile.content}
                            className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 shadow-xs"
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
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-750 transition-colors"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>Edit</span>
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Viewer / Editor Body */}
              {selectedFile.too_large ? (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                  <AlertTriangle className="w-9 h-9 text-amber-500 mb-2" />
                  <h4 className="text-sm font-semibold mb-1">File Too Large to Preview (&gt; 2 MB)</h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                    Large files should be viewed directly on GitHub.
                  </p>
                  <a
                    href={selectedFile.html_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Open on GitHub
                  </a>
                </div>
              ) : selectedFile.is_binary ? (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                  <FileIcon className="w-9 h-9 text-blue-500 mb-2" />
                  <h4 className="text-sm font-semibold mb-1">Binary File</h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                    Binary documents cannot be previewed in text mode.
                  </p>
                  <a
                    href={selectedFile.html_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    View on GitHub
                  </a>
                </div>
              ) : isEditing ? (
                <div className="flex-1 flex flex-col min-h-0 bg-slate-950 text-slate-100">
                  <textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    className="flex-1 w-full p-4 font-mono text-xs bg-transparent text-slate-100 resize-none focus:outline-none leading-relaxed"
                    spellCheck={false}
                    placeholder="Enter file contents..."
                  />
                  <div className="p-3 border-t border-slate-800 bg-slate-900/90 flex items-center gap-2">
                    <input
                      type="text"
                      value={commitMessage}
                      onChange={(e) => setCommitMessage(e.target.value)}
                      placeholder={`Update ${selectedFile.name}`}
                      className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-slate-700 bg-slate-800 text-white font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </div>
              ) : (
                <div className="flex-1 overflow-auto p-3 font-mono text-xs bg-slate-50/50 dark:bg-slate-950/70">
                  <table className="w-full border-collapse">
                    <tbody>
                      {(selectedFile.content || '').split('\n').map((line, idx) => (
                        <tr key={idx} className="hover:bg-blue-500/5 transition-colors">
                          <td className="w-10 text-right pr-3.5 text-slate-400/80 dark:text-slate-600 select-none py-0.5 text-[11px]">
                            {idx + 1}
                          </td>
                          <td className="whitespace-pre py-0.5 text-slate-800 dark:text-slate-200 leading-relaxed">
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
            /* FOLDER BROWSER & FILE LIST */
            <div
              className={`flex-1 flex flex-col min-h-0 relative bg-white dark:bg-slate-900 rounded-xl border border-slate-200/90 dark:border-slate-800 overflow-hidden shadow-xs ${
                isDragging ? 'ring-2 ring-blue-500 ring-offset-2' : ''
              }`}
              onDragOver={(e) => {
                e.preventDefault();
                if (canWrite) setIsDragging(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                setIsDragging(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                if (!canWrite) return;
                if (e.dataTransfer.files?.length > 0) {
                  handleFilesUpload(e.dataTransfer.files);
                }
              }}
            >
              {/* Drag & Drop Overlay */}
              {isDragging && (
                <div className="absolute inset-0 z-20 bg-blue-500/10 dark:bg-blue-500/20 border-2 border-dashed border-blue-500 rounded-xl flex flex-col items-center justify-center backdrop-blur-xs pointer-events-none">
                  <Upload className="w-10 h-10 text-blue-600 dark:text-blue-400 mb-2 animate-bounce" />
                  <p className="text-sm font-semibold text-blue-900 dark:text-blue-200">
                    Drop files to upload to /{currentPath || ''}
                  </p>
                </div>
              )}

              {/* Uploading Overlay */}
              {uploading && (
                <div className="absolute inset-0 z-30 bg-slate-950/50 backdrop-blur-xs rounded-xl flex flex-col items-center justify-center text-white">
                  <Loader2 className="w-8 h-8 animate-spin text-blue-400 mb-2" />
                  <p className="text-xs font-medium">Committing files to GitHub...</p>
                </div>
              )}

              {/* Loading File Overlay */}
              {loadingFile && (
                <div className="absolute inset-0 z-30 bg-slate-950/40 backdrop-blur-xs rounded-xl flex flex-col items-center justify-center text-white">
                  <Loader2 className="w-8 h-8 animate-spin text-blue-400 mb-2" />
                  <p className="text-xs font-medium">Loading file content...</p>
                </div>
              )}

              {/* Sleek Toolbar */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 p-3 border-b border-slate-200/90 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/70 flex-shrink-0">
                {/* Breadcrumbs */}
                <div className="flex items-center gap-1 text-xs text-slate-600 dark:text-slate-400 overflow-x-auto py-0.5 scrollbar-none">
                  <button
                    type="button"
                    onClick={() => setCurrentPath('')}
                    className="flex items-center gap-1 px-1.5 py-1 rounded-md font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors"
                  >
                    <Home className="w-3.5 h-3.5 text-blue-500" />
                    <span>root</span>
                  </button>

                  {pathSegments.map((segment, index) => {
                    const segPath = pathSegments.slice(0, index + 1).join('/');
                    const isLast = index === pathSegments.length - 1;
                    return (
                      <React.Fragment key={segPath}>
                        <ChevronRight className="w-3 h-3 text-slate-400 flex-shrink-0" />
                        <button
                          type="button"
                          onClick={() => setCurrentPath(segPath)}
                          className={`font-mono px-1.5 py-0.5 rounded-md truncate max-w-[120px] transition-colors ${
                            isLast
                              ? 'font-semibold text-slate-900 dark:text-white bg-slate-200/50 dark:bg-slate-800'
                              : 'hover:bg-slate-200/60 dark:hover:bg-slate-800'
                          }`}
                        >
                          {segment}
                        </button>
                      </React.Fragment>
                    );
                  })}
                </div>

                {/* Right Actions: Search + Upload + New File */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  {/* Search Bar */}
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Filter files..."
                      className="w-32 sm:w-40 pl-8 pr-2.5 py-1 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-2xs"
                    />
                  </div>

                  {canWrite && (
                    <>
                      <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        className="hidden"
                        onChange={(e) => handleFilesUpload(e.target.files)}
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewFileModal(true)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-750 transition-colors shadow-2xs"
                        title="Create new file directly"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">New File</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploading}
                        className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-xs disabled:opacity-50"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <span>Upload</span>
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* File List */}
              <div className="flex-1 overflow-y-auto">
                {loadingTree ? (
                  <div className="py-14 flex flex-col items-center justify-center text-slate-400">
                    <Loader2 className="w-7 h-7 animate-spin text-blue-500 mb-2" />
                    <span className="text-xs">Fetching repository tree...</span>
                  </div>
                ) : isEmptyRepo ? (
                  <div className="py-16 text-center flex flex-col items-center justify-center">
                    <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mb-2">
                      <FolderGit2 className="w-6 h-6" />
                    </div>
                    <h4 className="text-sm font-semibold mb-1">Repository is Empty</h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-4 max-w-xs">
                      Drag and drop files here or click Upload above to get started.
                    </p>
                  </div>
                ) : filteredEntries.length === 0 ? (
                  <div className="py-12 text-center text-slate-400 text-xs">
                    {searchQuery ? `No files match "${searchQuery}"` : 'This folder is empty.'}
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
                    {/* Go up row */}
                    {currentPath && !searchQuery && (
                      <div
                        onClick={() => {
                          const parts = currentPath.split('/');
                          parts.pop();
                          setCurrentPath(parts.join('/'));
                        }}
                        className="px-4 py-2.5 flex items-center gap-3 text-xs font-mono text-slate-600 dark:text-slate-400 hover:bg-slate-100/60 dark:hover:bg-slate-800/40 cursor-pointer select-none transition-colors"
                      >
                        <Folder className="w-4 h-4 text-blue-500" />
                        <span className="font-semibold">.. (Parent directory)</span>
                      </div>
                    )}

                    {filteredEntries.map((entry) => (
                      <div
                        key={entry.path}
                        className="px-4 py-2.5 flex items-center justify-between text-xs hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group"
                      >
                        <div
                          className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer"
                          onClick={() => {
                            if (entry.type === 'dir') {
                              setCurrentPath(entry.path);
                              setSearchQuery('');
                            } else {
                              handleOpenFile(entry);
                            }
                          }}
                        >
                          {entry.type === 'dir' ? (
                            <Folder className="w-4 h-4 text-amber-500 flex-shrink-0" />
                          ) : (
                            getFileIcon(entry.name)
                          )}
                          <span
                            className={`truncate font-mono ${
                              entry.type === 'dir'
                                ? 'font-semibold text-slate-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400'
                                : 'text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            {entry.name}
                          </span>
                        </div>

                        <div className="flex items-center gap-4 flex-shrink-0">
                          {entry.type === 'file' && (
                            <span className="text-[11px] font-mono text-slate-400">
                              {formatBytes(entry.size)}
                            </span>
                          )}

                          <div className="flex items-center gap-1 opacity-70 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                            {entry.type === 'file' ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleOpenFile(entry)}
                                  className="p-1 text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 rounded hover:bg-slate-200/50 dark:hover:bg-slate-700/50 transition-colors"
                                  title="View file"
                                >
                                  {canWrite ? <Edit3 className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                </button>
                                {canWrite && (
                                  <button
                                    type="button"
                                    onClick={() => setDeleteTarget(entry)}
                                    className="p-1 text-slate-400 hover:text-red-600 rounded hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
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

        {/* Modal: Create New File In-App */}
        {showNewFileModal && (
          <div className="absolute inset-0 z-40 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 max-w-md w-full shadow-2xl">
              <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <Plus className="w-4 h-4 text-blue-500" />
                <span>Create New File</span>
              </h4>
              <form onSubmit={handleCreateNewFile} className="space-y-3">
                <div>
                  <label className="block text-[11px] font-medium text-slate-500 mb-1">
                    Filename (e.g. index.js, notes.md)
                  </label>
                  <input
                    type="text"
                    value={newFileName}
                    onChange={(e) => setNewFileName(e.target.value)}
                    placeholder="filename.ext"
                    className="w-full px-3 py-1.5 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-500 mb-1">
                    Initial Content (Optional)
                  </label>
                  <textarea
                    value={newFileContent}
                    onChange={(e) => setNewFileContent(e.target.value)}
                    rows={4}
                    className="w-full p-2.5 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="// write code or notes..."
                  />
                </div>
                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowNewFileModal(false)}
                    className="flex-1 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={creatingFile || !newFileName.trim()}
                    className="flex-1 py-1.5 text-xs rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    {creatingFile ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Create & Commit'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Delete Confirmation Dialog */}
        {deleteTarget && (
          <div className="absolute inset-0 z-40 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 max-w-sm w-full shadow-2xl text-center">
              <div className="w-10 h-10 rounded-full bg-red-500/10 text-red-600 flex items-center justify-center mx-auto mb-2.5">
                <Trash2 className="w-5 h-5" />
              </div>
              <h4 className="text-sm font-semibold mb-1">Delete File?</h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                Are you sure you want to delete{' '}
                <span className="font-mono font-medium text-slate-900 dark:text-white">
                  {deleteTarget.name}
                </span>
                ?
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setDeleteTarget(null)}
                  disabled={deleting}
                  className="flex-1 py-1.5 text-xs font-medium rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDeleteConfirm}
                  disabled={deleting}
                  className="flex-1 py-1.5 text-xs font-medium rounded-xl bg-red-600 hover:bg-red-700 text-white flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  {deleting ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Delete'}
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
