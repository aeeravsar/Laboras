const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getSessionsDir: () => ipcRenderer.invoke('get-sessions-dir'),
  getDefaultSessionsDir: () => ipcRenderer.invoke('get-default-sessions-dir'),
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  changeSessionsDirectory: (newDirectory) => ipcRenderer.invoke('change-sessions-directory', newDirectory),
  restartApp: () => ipcRenderer.invoke('restart-app'),
  getPlatform: () => ipcRenderer.invoke('get-platform'),
  showErrorDialog: (title, content) => ipcRenderer.invoke('show-error-dialog', title, content),
  startRecording: (sessionId, settings) => ipcRenderer.invoke('start-recording', sessionId, settings),
  pauseRecording: () => ipcRenderer.invoke('pause-recording'),
  resumeRecording: () => ipcRenderer.invoke('resume-recording'),
  stopRecording: () => ipcRenderer.invoke('stop-recording'),
  getRecordingStatus: () => ipcRenderer.invoke('get-recording-status'),
  openVideoFile: (sessionId) => ipcRenderer.invoke('open-video-file', sessionId),
  getVideoPath: (sessionId) => ipcRenderer.invoke('get-video-path', sessionId),
  deleteSession: (sessionId) => ipcRenderer.invoke('delete-session', sessionId),
  // Session metadata management
  getAllSessions: () => ipcRenderer.invoke('get-all-sessions'),
  getSession: (sessionId) => ipcRenderer.invoke('get-session', sessionId),
  saveSession: (session) => ipcRenderer.invoke('save-session', session),
  updateSession: (sessionId, updates) => ipcRenderer.invoke('update-session', sessionId, updates),
  migrateSessions: (sessions) => ipcRenderer.invoke('migrate-sessions', sessions),
  getSessionStats: () => ipcRenderer.invoke('get-session-stats'),
  // Settings management
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  // External links
  openExternalLink: (url) => ipcRenderer.invoke('open-external-link', url),
  // Thumbnails
  generateThumbnail: (sessionId) => ipcRenderer.invoke('generate-thumbnail', sessionId)
});