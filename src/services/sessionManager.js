const fs = require('fs');
const path = require('path');

class SessionManager {
    constructor(sessionsDir) {
        this.sessionsDir = sessionsDir;
        this.ensureSessionsDirectory();
    }
    
    updateSessionsDirectory(newDir) {
        this.sessionsDir = newDir;
        this.ensureSessionsDirectory();
    }

    ensureSessionsDirectory() {
        if (!fs.existsSync(this.sessionsDir)) {
            fs.mkdirSync(this.sessionsDir, { recursive: true });
        }
    }

    async getAllSessions() {
        try {
            const sessions = [];
            const dirs = fs.readdirSync(this.sessionsDir);
            
            for (const dir of dirs) {
                if (dir.startsWith('session-')) {
                    const metadataPath = path.join(this.sessionsDir, dir, 'metadata.json');
                    if (fs.existsSync(metadataPath)) {
                        try {
                            const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
                            sessions.push(metadata);
                        } catch (error) {
                            console.error(`Error reading metadata for ${dir}:`, error);
                        }
                    }
                }
            }
            
            // Sort by created_at descending (newest first)
            sessions.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            return sessions;
        } catch (error) {
            console.error('Error loading sessions:', error);
            return [];
        }
    }

    async getSession(sessionId) {
        try {
            const metadataPath = path.join(this.sessionsDir, sessionId, 'metadata.json');
            if (fs.existsSync(metadataPath)) {
                return JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
            }
            return null;
        } catch (error) {
            console.error(`Error loading session ${sessionId}:`, error);
            return null;
        }
    }

    async saveSession(session) {
        try {
            const sessionDir = path.join(this.sessionsDir, session.id);
            
            // Ensure session directory exists
            if (!fs.existsSync(sessionDir)) {
                fs.mkdirSync(sessionDir, { recursive: true });
            }
            
            // Write metadata
            const metadataPath = path.join(sessionDir, 'metadata.json');
            fs.writeFileSync(metadataPath, JSON.stringify(session, null, 2));
            
            console.log(`Saved session metadata: ${metadataPath}`);
            return true;
        } catch (error) {
            console.error(`Error saving session ${session.id}:`, error);
            return false;
        }
    }


    async updateSession(sessionId, updates) {
        try {
            const session = await this.getSession(sessionId);
            if (!session) {
                console.error(`Session ${sessionId} not found`);
                return false;
            }
            
            // Merge updates
            const updatedSession = { ...session, ...updates };
            
            // Save updated session
            return await this.saveSession(updatedSession);
        } catch (error) {
            console.error(`Error updating session ${sessionId}:`, error);
            return false;
        }
    }

    async deleteSession(sessionId) {
        try {
            const sessionDir = path.join(this.sessionsDir, sessionId);
            
            if (fs.existsSync(sessionDir)) {
                // Remove directory and all contents
                fs.rmSync(sessionDir, { recursive: true, force: true });
                console.log(`Deleted session: ${sessionId}`);
                return true;
            }
            
            return false;
        } catch (error) {
            console.error(`Error deleting session ${sessionId}:`, error);
            return false;
        }
    }

    async saveNotes(sessionId, notes) {
        try {
            const sessionDir = path.join(this.sessionsDir, sessionId);
            
            // Ensure session directory exists
            if (!fs.existsSync(sessionDir)) {
                fs.mkdirSync(sessionDir, { recursive: true });
            }
            
            // Write notes
            const notesPath = path.join(sessionDir, 'notes.json');
            fs.writeFileSync(notesPath, JSON.stringify({ session_id: sessionId, notes }, null, 2));
            
            console.log(`Saved notes for session: ${sessionId}`);
            return true;
        } catch (error) {
            console.error(`Error saving notes for session ${sessionId}:`, error);
            return false;
        }
    }

    async getNotes(sessionId) {
        try {
            const notesPath = path.join(this.sessionsDir, sessionId, 'notes.json');
            if (fs.existsSync(notesPath)) {
                return JSON.parse(fs.readFileSync(notesPath, 'utf8'));
            }
            return { session_id: sessionId, notes: [] };
        } catch (error) {
            console.error(`Error loading notes for session ${sessionId}:`, error);
            return { session_id: sessionId, notes: [] };
        }
    }

    // Migrate from localStorage to file system (one-time operation)
    async migrateFromLocalStorage(sessions) {
        let migrated = 0;
        
        for (const session of sessions) {
            const exists = await this.getSession(session.id);
            if (!exists) {
                const success = await this.saveSession(session);
                if (success) {
                    migrated++;
                    console.log(`Migrated session: ${session.id}`);
                }
            }
        }
        
        console.log(`Migration complete: ${migrated} sessions migrated`);
        return migrated;
    }

    async saveSettings(settings) {
        try {
            const settingsPath = path.join(this.sessionsDir, 'settings.json');
            fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
            console.log('Saved settings to:', settingsPath);
            return true;
        } catch (error) {
            console.error('Error saving settings:', error);
            return false;
        }
    }

    async getSettings() {
        try {
            const settingsPath = path.join(this.sessionsDir, 'settings.json');
            if (fs.existsSync(settingsPath)) {
                return JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
            }
            
            // Return default settings if file doesn't exist
            return {
                videoQuality: '720p',
                frameRate: 15,
                sessionsDirectory: this.sessionsDir,
                startMinimized: false
            };
        } catch (error) {
            console.error('Error loading settings:', error);
            // Return defaults on error
            return {
                videoQuality: '720p',
                frameRate: 15,
                sessionsDirectory: this.sessionsDir,
                startMinimized: false
            };
        }
    }

    getSessionPath(sessionId) {
        return path.join(this.sessionsDir, sessionId);
    }

    getVideoPath(sessionId) {
        return path.join(this.sessionsDir, sessionId, 'video.mp4');
    }

    getThumbnailPath(sessionId) {
        return path.join(this.sessionsDir, sessionId, 'thumbnail.jpg');
    }

    async getSessionStats() {
        const sessions = await this.getAllSessions();
        
        const stats = {
            totalSessions: sessions.length,
            completedSessions: sessions.filter(s => s.status === 'completed').length,
            totalDuration: sessions.reduce((sum, s) => sum + (s.duration || 0), 0),
            totalSize: 0
        };
        
        // Calculate total size
        for (const session of sessions) {
            const videoPath = this.getVideoPath(session.id);
            if (fs.existsSync(videoPath)) {
                stats.totalSize += fs.statSync(videoPath).size;
            }
        }
        
        return stats;
    }
}

module.exports = SessionManager;