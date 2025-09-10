const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const ScreenRecorder = require('./services/recorder');
const SessionManager = require('./services/sessionManager');

let mainWindow;
let recorder;
let sessionManager;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 1200,
    minHeight: 800,
    icon: path.join(__dirname, '..', 'logo.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    show: false,
    titleBarStyle: 'default'
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  
  // Completely remove the menu bar
  mainWindow.setMenu(null);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }
}

app.whenReady().then(async () => {
  // Register custom protocol for thumbnails
  const { protocol } = require('electron');
  protocol.registerFileProtocol('thumbnail', (request, callback) => {
    const sessionId = request.url.replace('thumbnail://', '');
    const thumbnailPath = path.join(sessionsDir, sessionId, 'thumbnail.jpg');
    callback({ path: thumbnailPath });
  });

  createWindow();
  recorder = new ScreenRecorder();
  sessionManager = new SessionManager(sessionsDir);
  
  // Clean up any sessions that were recording when app crashed/lost power
  try {
    const sessions = await sessionManager.getAllSessions();
    for (const session of sessions) {
      if (session.status === 'recording' || session.status === 'paused') {
        console.log(`Found incomplete session ${session.id}, marking as completed`);
        await sessionManager.updateSession(session.id, {
          status: 'completed',
          completed_at: new Date().toISOString(),
          notes: 'Session was interrupted due to app closure or power loss'
        });
      }
    }
  } catch (error) {
    console.error('Error cleaning up incomplete sessions:', error);
  }
});

app.on('window-all-closed', async () => {
  // Stop any active recording before quitting
  if (recorder && recorder.isRecording) {
    console.log('Stopping active recording before app close...');
    try {
      await recorder.stopRecording();
      
      // Mark the session as completed
      if (recorder.sessionId && sessionManager) {
        await sessionManager.updateSession(recorder.sessionId, {
          status: 'completed',
          completed_at: new Date().toISOString()
        });
      }
    } catch (error) {
      console.error('Error stopping recording on app close:', error);
    }
  }
  
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('before-quit', async (event) => {
  // Stop any active recording before quitting
  if (recorder && recorder.isRecording) {
    event.preventDefault(); // Prevent immediate quit
    
    console.log('Stopping active recording before quit...');
    try {
      await recorder.stopRecording();
      
      // Mark the session as completed
      if (recorder.sessionId && sessionManager) {
        await sessionManager.updateSession(recorder.sessionId, {
          status: 'completed',
          completed_at: new Date().toISOString()
        });
      }
    } catch (error) {
      console.error('Error stopping recording on quit:', error);
    }
    
    // Force kill any remaining FFmpeg processes
    killOrphanedFFmpegProcesses();
    
    // Now quit for real
    app.quit();
  } else {
    // No active recording, but still check for orphaned FFmpeg processes
    killOrphanedFFmpegProcesses();
  }
});

// Emergency cleanup function to kill any orphaned FFmpeg processes
function killOrphanedFFmpegProcesses() {
  try {
    const { execSync } = require('child_process');
    
    // Kill FFmpeg processes that might be related to our app
    if (process.platform === 'linux' || process.platform === 'darwin') {
      execSync('pkill -f "ffmpeg.*laboras-sessions" 2>/dev/null || true');
    } else if (process.platform === 'win32') {
      execSync('taskkill /F /IM ffmpeg.exe 2>nul || exit 0');
    }
    
    console.log('Cleaned up any orphaned FFmpeg processes');
  } catch (error) {
    // Ignore errors - this is cleanup, not critical
    console.log('FFmpeg cleanup completed (some processes may not have been running)');
  }
}

// Get OS-appropriate default directory
function getDefaultSessionsDirectory() {
  const platform = process.platform;
  const homeDir = os.homedir();
  
  switch (platform) {
    case 'win32':
      // Windows: %LOCALAPPDATA%\laboras_data - create if doesn't exist
      const localAppData = process.env.LOCALAPPDATA || path.join(homeDir, 'AppData', 'Local');
      if (!fs.existsSync(localAppData)) {
        fs.mkdirSync(localAppData, { recursive: true });
      }
      return path.join(localAppData, 'laboras_data');
      
    case 'darwin':
      // macOS: ~/Library/Application Support/laboras_data - create if doesn't exist
      const appSupport = path.join(homeDir, 'Library', 'Application Support');
      if (!fs.existsSync(appSupport)) {
        fs.mkdirSync(appSupport, { recursive: true });
      }
      return path.join(appSupport, 'laboras_data');
      
    case 'linux':
      // Linux: ~/.local/share/laboras_data - create if doesn't exist
      const localShare = path.join(homeDir, '.local', 'share');
      if (!fs.existsSync(localShare)) {
        fs.mkdirSync(localShare, { recursive: true });
      }
      return path.join(localShare, 'laboras_data');
      
    default:
      // Other platforms: ~/laboras_data
      return path.join(homeDir, 'laboras_data');
  }
}

// Get user's app data directory for persistent settings
// Note: This is our custom config file, not an Electron built-in
const userDataPath = app.getPath('userData'); // Electron provides this path
const appConfigPath = path.join(userDataPath, 'laboras-preferences.json'); // Our custom config file

// Load saved storage directory or use default
let sessionsDir;
try {
  if (fs.existsSync(appConfigPath)) {
    const config = JSON.parse(fs.readFileSync(appConfigPath, 'utf8'));
    if (config.storageDirectory && fs.existsSync(config.storageDirectory)) {
      sessionsDir = config.storageDirectory;
    } else {
      sessionsDir = getDefaultSessionsDirectory();
    }
  } else {
    sessionsDir = getDefaultSessionsDirectory();
  }
} catch (error) {
  console.error('Error loading config:', error);
  sessionsDir = getDefaultSessionsDirectory();
}

if (!fs.existsSync(sessionsDir)) {
  fs.mkdirSync(sessionsDir, { recursive: true });
}

// Handle unhandled process exits (SIGINT, SIGTERM, etc.)
process.on('SIGINT', () => {
  console.log('Received SIGINT, cleaning up...');
  killOrphanedFFmpegProcesses();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('Received SIGTERM, cleaning up...');
  killOrphanedFFmpegProcesses();
  process.exit(0);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  killOrphanedFFmpegProcesses();
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  killOrphanedFFmpegProcesses();
  process.exit(1);
});

ipcMain.handle('get-sessions-dir', () => {
  return sessionsDir;
});

ipcMain.handle('get-default-sessions-dir', () => {
  return getDefaultSessionsDirectory();
});

ipcMain.handle('select-directory', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

ipcMain.handle('change-sessions-directory', async (event, newDirectory) => {
  try {
    // Check if the new directory has existing Laboras data
    const hasExistingData = fs.existsSync(path.join(newDirectory, 'settings.json')) || 
                           fs.readdirSync(newDirectory).some(item => item.startsWith('session-'));
    
    // Update the session manager's directory
    if (sessionManager) {
      sessionManager.updateSessionsDirectory(newDirectory);
    }
    
    // Save the new directory to persistent config
    try {
      const config = { storageDirectory: newDirectory };
      fs.writeFileSync(appConfigPath, JSON.stringify(config, null, 2));
      console.log('Saved storage directory to config:', newDirectory);
    } catch (saveError) {
      console.error('Failed to save config:', saveError);
    }
    
    return { 
      success: true, 
      hasExistingData: hasExistingData,
      newDirectory: newDirectory
    };
  } catch (error) {
    console.error('Failed to change sessions directory:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('restart-app', async () => {
  // Restart the app to refresh with new directory
  app.relaunch();
  app.exit(0);
});

ipcMain.handle('get-platform', () => {
  return process.platform;
});

ipcMain.handle('show-error-dialog', async (event, title, content) => {
  dialog.showErrorBox(title, content);
});

ipcMain.handle('start-recording', async (event, sessionId, settings) => {
  try {
    const result = await recorder.startRecording(sessionId, settings, sessionsDir);
    return { success: true, result };
  } catch (error) {
    console.error('Recording start failed:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('pause-recording', async () => {
  try {
    const result = await recorder.pauseRecording();
    return { success: true, result };
  } catch (error) {
    console.error('Recording pause failed:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('resume-recording', async () => {
  try {
    const result = recorder.resumeRecording();
    return { success: true, result };
  } catch (error) {
    console.error('Recording resume failed:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('stop-recording', async () => {
  try {
    const result = await recorder.stopRecording();
    return { success: true, result };
  } catch (error) {
    console.error('Recording stop failed:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-recording-status', () => {
  return {
    isRecording: recorder.isRecording,
    isPaused: recorder.isPaused,
    duration: recorder.getRecordingDuration(),
    estimatedSize: recorder.getEstimatedFileSize()
  };
});

ipcMain.handle('open-video-file', async (event, sessionId) => {
  const { shell } = require('electron');
  const videoPath = path.join(sessionsDir, sessionId, 'video.mp4');
  
  if (fs.existsSync(videoPath)) {
    shell.openPath(videoPath);
    return { success: true };
  } else {
    return { success: false, error: 'Video file not found' };
  }
});

ipcMain.handle('get-video-path', async (event, sessionId) => {
  const videoPath = path.join(sessionsDir, sessionId, 'video.mp4');
  
  if (fs.existsSync(videoPath)) {
    return { success: true, path: videoPath };
  } else {
    return { success: false, error: 'Video file not found' };
  }
});

ipcMain.handle('delete-session', async (event, sessionId) => {
  try {
    const success = await sessionManager.deleteSession(sessionId);
    return { success };
  } catch (error) {
    console.error('Failed to delete session:', error);
    return { success: false, error: error.message };
  }
});

// Session metadata management
ipcMain.handle('get-all-sessions', async () => {
  try {
    const sessions = await sessionManager.getAllSessions();
    return { success: true, sessions };
  } catch (error) {
    console.error('Failed to get sessions:', error);
    return { success: false, error: error.message, sessions: [] };
  }
});

ipcMain.handle('get-session', async (event, sessionId) => {
  try {
    const session = await sessionManager.getSession(sessionId);
    return { success: true, session };
  } catch (error) {
    console.error('Failed to get session:', error);
    return { success: false, error: error.message, session: null };
  }
});

ipcMain.handle('save-session', async (event, session) => {
  try {
    const success = await sessionManager.saveSession(session);
    return { success };
  } catch (error) {
    console.error('Failed to save session:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('update-session', async (event, sessionId, updates) => {
  try {
    const success = await sessionManager.updateSession(sessionId, updates);
    return { success };
  } catch (error) {
    console.error('Failed to update session:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('migrate-sessions', async (event, sessions) => {
  try {
    const migrated = await sessionManager.migrateFromLocalStorage(sessions);
    return { success: true, migrated };
  } catch (error) {
    console.error('Failed to migrate sessions:', error);
    return { success: false, error: error.message, migrated: 0 };
  }
});

ipcMain.handle('get-session-stats', async () => {
  try {
    const stats = await sessionManager.getSessionStats();
    return { success: true, stats };
  } catch (error) {
    console.error('Failed to get session stats:', error);
    return { success: false, error: error.message, stats: null };
  }
});

// Settings management
ipcMain.handle('get-settings', async () => {
  try {
    const settings = await sessionManager.getSettings();
    return { success: true, settings };
  } catch (error) {
    console.error('Failed to get settings:', error);
    return { success: false, error: error.message, settings: null };
  }
});

ipcMain.handle('save-settings', async (event, settings) => {
  try {
    const success = await sessionManager.saveSettings(settings);
    return { success };
  } catch (error) {
    console.error('Failed to save settings:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('open-external-link', async (event, url) => {
  try {
    const { shell } = require('electron');
    await shell.openExternal(url);
    return { success: true };
  } catch (error) {
    console.error('Failed to open external link:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('generate-thumbnail', async (event, sessionId) => {
  try {
    const videoPath = path.join(sessionsDir, sessionId, 'video.mp4');
    const thumbnailPath = path.join(sessionsDir, sessionId, 'thumbnail.jpg');
    
    if (!fs.existsSync(videoPath)) {
      throw new Error('Video file not found');
    }
    
    await recorder.generateThumbnail(videoPath, thumbnailPath);
    return { success: true, thumbnailPath };
  } catch (error) {
    console.error('Failed to generate thumbnail:', error);
    return { success: false, error: error.message };
  }
});