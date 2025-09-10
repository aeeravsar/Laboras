class LaborasApp {
    constructor() {
        this.currentSession = null;
        this.isRecording = false;
        this.isPaused = false;
        this.recordingStartTime = null;
        this.recordingDuration = 0;
        this.sessions = [];
        this.settings = {
            videoQuality: '720p',
            frameRate: 15,
            sessionsDirectory: ''
        };

        this.currentTags = [];
        this.currentNotes = [];
        this.init();
    }

    async init() {
        await this.loadSettings();
        await this.loadSessions();
        this.setupEventListeners();
        this.updateSessionsGrid();
        this.updateTagFilter();
        this.updateSettingsUI();
        
        // Hide recording panel initially if there's no active incomplete session
        const hasActiveIncompleteSession = this.sessions.some(session => 
            session.status === 'recording' || 
            session.status === 'paused' || 
            session.status === 'created'
        );
        
        if (!hasActiveIncompleteSession) {
            this.hideRecordingPanel();
        }
    }

    setupEventListeners() {
        // No back button needed - users can use sidebar navigation
        
        // Video player notes functionality
        this.setupVideoNotesInput();


        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                this.switchView(e.currentTarget.dataset.view);
            });
        });

        document.getElementById('new-session-btn').addEventListener('click', () => {
            this.showNewSessionModal();
        });

        document.getElementById('close-modal').addEventListener('click', () => {
            this.hideNewSessionModal();
        });

        document.getElementById('cancel-session').addEventListener('click', () => {
            this.hideNewSessionModal();
        });

        document.getElementById('create-session').addEventListener('click', () => {
            this.createNewSession();
        });

        document.getElementById('search-input').addEventListener('input', (e) => {
            this.filterSessions();
        });

        document.getElementById('tag-filter').addEventListener('change', () => {
            this.filterSessions();
        });

        document.getElementById('sort-select').addEventListener('change', () => {
            this.sortSessions();
        });

        document.getElementById('close-details').addEventListener('click', () => {
            this.hideSessionDetails();
        });


        document.getElementById('start-recording').addEventListener('click', () => {
            this.startRecording();
        });

        document.getElementById('pause-recording').addEventListener('click', () => {
            this.pauseRecording();
        });

        document.getElementById('stop-recording').addEventListener('click', () => {
            this.stopRecording();
        });

        document.getElementById('play-session-btn').addEventListener('click', () => {
            this.playCurrentSession();
        });

        document.getElementById('delete-session-btn').addEventListener('click', () => {
            this.deleteCurrentSession();
        });

        document.getElementById('browse-directory').addEventListener('click', () => {
            this.browseDirectory();
        });

        document.getElementById('reset-directory').addEventListener('click', () => {
            this.resetDirectory();
        });

        document.getElementById('video-quality').addEventListener('change', (e) => {
            this.updateSetting('videoQuality', e.target.value);
        });

        document.getElementById('frame-rate').addEventListener('change', (e) => {
            this.handleFrameRateChange(e.target.value);
        });

        document.getElementById('custom-fps-input').addEventListener('input', (e) => {
            this.handleCustomFrameRateInput(e.target.value);
        });


        document.getElementById('github-link').addEventListener('click', (e) => {
            e.preventDefault();
            window.electronAPI.openExternalLink('https://github.com/aeeravsar/Laboras');
        });

        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal')) {
                this.hideNewSessionModal();
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.hideNewSessionModal();
                this.hideSessionDetails();
            }
        });

        // Tag input functionality
        this.setupTagInput();
        
        // Notes functionality
        this.setupNotesInput();
        
        // Video player session actions
        this.setupVideoPlayerActions();
    }

    setupTagInput() {
        const tagInput = document.getElementById('session-tags-input');
        const tagsDisplay = document.getElementById('tags-display');
        
        tagInput.addEventListener('input', (e) => {
            const value = e.target.value;
            
            // Check if user typed a comma
            if (value.includes(',')) {
                const parts = value.split(',');
                const newTag = parts[0].trim();
                
                // Add the new tag if it's not empty and not already exists
                if (newTag && !this.currentTags.includes(newTag)) {
                    this.currentTags.push(newTag);
                    this.renderTags();
                }
                
                // Set input value to the remaining text after the comma
                e.target.value = parts.slice(1).join(',').trim();
            }
        });

        tagInput.addEventListener('keydown', (e) => {
            // Handle backspace when input is empty to remove last tag
            if (e.key === 'Backspace' && e.target.value === '' && this.currentTags.length > 0) {
                this.currentTags.pop();
                this.renderTags();
            }
        });
    }

    renderTags() {
        const tagsDisplay = document.getElementById('tags-display');
        tagsDisplay.innerHTML = '';
        
        this.currentTags.forEach((tag, index) => {
            const tagChip = document.createElement('div');
            tagChip.className = 'tag-chip';
            tagChip.innerHTML = `
                ${tag}
                <span class="tag-remove" data-index="${index}">×</span>
            `;
            
            // Add click handler for remove button
            tagChip.querySelector('.tag-remove').addEventListener('click', () => {
                this.removeTag(index);
            });
            
            tagsDisplay.appendChild(tagChip);
        });
    }

    removeTag(index) {
        this.currentTags.splice(index, 1);
        this.renderTags();
    }

    setupNotesInput() {
        const noteInput = document.getElementById('note-input');
        const addNoteBtn = document.getElementById('add-note-btn');
        
        // Add note on button click
        addNoteBtn.addEventListener('click', () => {
            this.addNote();
        });
        
        // Add note on Enter key
        noteInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.addNote();
            }
        });
    }

    setupVideoNotesInput() {
        const videoNoteInput = document.getElementById('video-note-input');
        const videoAddNoteBtn = document.getElementById('video-add-note-btn');
        
        // Add note on button click
        videoAddNoteBtn.addEventListener('click', () => {
            this.addVideoNote();
        });
        
        // Add note on Enter key
        videoNoteInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.addVideoNote();
            }
        });
    }

    setupVideoPlayerActions() {
        document.getElementById('edit-session-btn').addEventListener('click', () => {
            this.editCurrentVideoSession();
        });

        document.getElementById('delete-session-video-btn').addEventListener('click', () => {
            this.deleteCurrentVideoSession();
        });
    }

    addNote() {
        const noteInput = document.getElementById('note-input');
        const noteText = noteInput.value.trim();
        
        if (!noteText || !this.currentSession) return;
        
        // Determine timestamp based on session state
        let timestamp = 0;
        let timestampLabel = 'Pre-recording';
        
        if (this.isRecording || this.isPaused) {
            // Active recording - use current duration
            timestamp = this.recordingDuration || 0;
            timestampLabel = this.formatDuration(timestamp);
        } else if (this.currentSession.status === 'completed') {
            // Recording ended - use total duration
            timestamp = this.currentSession.duration || 0;
            timestampLabel = `${this.formatDuration(timestamp)} (post-recording)`;
        }
        
        const note = {
            id: Date.now(),
            text: noteText,
            timestamp: timestamp,
            timestampLabel: timestampLabel,
            sessionState: this.currentSession.status,
            createdAt: new Date().toISOString()
        };
        
        this.currentNotes.push(note);
        this.renderNotes();
        noteInput.value = '';
        
        // Auto-scroll to bottom
        const notesContainer = document.getElementById('notes-messages');
        notesContainer.scrollTop = notesContainer.scrollHeight;
    }

    renderNotes() {
        const notesContainer = document.getElementById('notes-messages');
        
        if (this.currentNotes.length === 0) {
            notesContainer.innerHTML = '<div class="notes-empty">No notes yet. Add notes anytime during your session!</div>';
            return;
        }
        
        notesContainer.innerHTML = this.currentNotes.map((note, index) => `
            <div class="note-message">
                <div class="note-header">
                    <div class="note-timestamp">${note.timestampLabel || this.formatDuration(note.timestamp)}</div>
                    <button class="note-delete" data-index="${index}" title="Delete note">×</button>
                </div>
                <div class="note-content">${this.escapeHtml(note.text)}</div>
            </div>
        `).join('');
        
        // Add event listeners for delete buttons
        notesContainer.querySelectorAll('.note-delete').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = parseInt(e.target.dataset.index);
                this.deleteNote(index);
            });
        });
    }

    deleteNote(index) {
        this.currentNotes.splice(index, 1);
        this.renderNotes();
        
        // Auto-save notes if session is completed
        if (this.currentSession && this.currentSession.status === 'completed') {
            this.updateSession(this.currentSession.id, {
                notes: this.currentNotes
            });
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    addVideoNote() {
        const videoNoteInput = document.getElementById('video-note-input');
        const noteText = videoNoteInput.value.trim();
        
        if (!noteText || !this.currentVideoSession) return;
        
        // For completed sessions, always use post-recording timestamp
        const note = {
            id: Date.now(),
            text: noteText,
            timestamp: this.currentVideoSession.duration || 0,
            timestampLabel: 'Post-recording',
            sessionState: 'completed',
            createdAt: new Date().toISOString()
        };
        
        // Add to the session's notes
        if (!this.currentVideoSession.notes) {
            this.currentVideoSession.notes = [];
        }
        this.currentVideoSession.notes.push(note);
        
        // Update the session in the main sessions array
        const sessionIndex = this.sessions.findIndex(s => s.id === this.currentVideoSession.id);
        if (sessionIndex !== -1) {
            this.sessions[sessionIndex].notes = this.currentVideoSession.notes;
        }
        
        // Save to storage
        this.updateSession(this.currentVideoSession.id, {
            notes: this.currentVideoSession.notes
        });
        
        this.renderVideoNotes();
        videoNoteInput.value = '';
        
        // Auto-scroll to bottom
        const notesContainer = document.getElementById('session-notes-list');
        notesContainer.scrollTop = notesContainer.scrollHeight;
    }

    renderVideoNotes() {
        const notesContainer = document.getElementById('session-notes-list');
        
        if (!this.currentVideoSession || !this.currentVideoSession.notes || this.currentVideoSession.notes.length === 0) {
            notesContainer.innerHTML = '<div class="no-notes">No notes for this session.</div>';
            return;
        }
        
        notesContainer.innerHTML = this.currentVideoSession.notes.map((note, index) => `
            <div class="note-item">
                <button class="note-delete" data-index="${index}" title="Delete note">×</button>
                <div class="note-time">${note.timestampLabel || this.formatDuration(note.timestamp)}</div>
                <div class="note-text">${this.escapeHtml(note.text)}</div>
            </div>
        `).join('');
        
        // Add event listeners for delete buttons
        notesContainer.querySelectorAll('.note-delete').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = parseInt(e.target.dataset.index);
                this.deleteVideoNote(index);
            });
        });
    }

    deleteVideoNote(index) {
        if (!this.currentVideoSession || !this.currentVideoSession.notes) return;
        
        this.currentVideoSession.notes.splice(index, 1);
        
        // Update the session in the main sessions array
        const sessionIndex = this.sessions.findIndex(s => s.id === this.currentVideoSession.id);
        if (sessionIndex !== -1) {
            this.sessions[sessionIndex].notes = this.currentVideoSession.notes;
        }
        
        // Save to storage
        this.updateSession(this.currentVideoSession.id, {
            notes: this.currentVideoSession.notes
        });
        
        this.renderVideoNotes();
    }

    async editCurrentVideoSession() {
        if (!this.currentVideoSession) return;
        
        // Populate the modal with current session data
        document.getElementById('session-title-input').value = this.currentVideoSession.title || '';
        document.getElementById('session-description').value = this.currentVideoSession.description || '';
        
        // Set up tags
        this.currentTags = [...(this.currentVideoSession.tags || [])];
        this.renderTags();
        document.getElementById('session-tags-input').value = '';
        
        // Show modal with editing context
        const modal = document.getElementById('new-session-modal');
        const modalHeader = modal.querySelector('.modal-header h3');
        const createButton = document.getElementById('create-session');
        
        modalHeader.textContent = 'Edit Session';
        createButton.textContent = 'Save Changes';
        
        // Store editing context
        this.isEditingSession = true;
        this.editingSessionId = this.currentVideoSession.id;
        
        modal.classList.remove('hidden');
        document.getElementById('session-title-input').focus();
    }

    async deleteCurrentVideoSession() {
        if (!this.currentVideoSession) return;
        
        const confirmed = await this.showConfirmDialog(
            'Delete Session',
            `Are you sure you want to delete "${this.currentVideoSession.title}"? This action cannot be undone.`,
            'Delete',
            true
        );
        
        if (!confirmed) return;
        
        try {
            const result = await window.electronAPI.deleteSession(this.currentVideoSession.id);
            
            if (!result.success) {
                throw new Error(result.error);
            }
            
            // Remove from sessions list
            this.sessions = this.sessions.filter(session => session.id !== this.currentVideoSession.id);
            
            // Update UI
            this.updateSessionsGrid();
            this.updateTagFilter();
            
            // Close video player view
            this.hideSessionDetailsView();
            
            console.log('Deleted session:', this.currentVideoSession.id);
        } catch (error) {
            console.error('Failed to delete session:', error);
            await window.electronAPI.showErrorDialog('Delete Error', `Failed to delete session: ${error.message}`);
        }
    }

    showConfirmDialog(title, message, confirmText = 'Confirm', isDanger = true) {
        return new Promise((resolve) => {
            const dialog = document.getElementById('confirmation-dialog');
            const titleEl = document.getElementById('confirmation-title');
            const messageEl = document.getElementById('confirmation-message');
            const confirmBtn = document.getElementById('confirmation-confirm');
            const cancelBtn = document.getElementById('confirmation-cancel');
            
            titleEl.textContent = title;
            messageEl.textContent = message;
            confirmBtn.textContent = confirmText;
            confirmBtn.className = isDanger ? 'btn btn-danger' : 'btn btn-primary';
            
            dialog.classList.remove('hidden');
            
            const handleConfirm = () => {
                cleanup();
                resolve(true);
            };
            
            const handleCancel = () => {
                cleanup();
                resolve(false);
            };
            
            const handleEscape = (e) => {
                if (e.key === 'Escape') {
                    cleanup();
                    resolve(false);
                }
            };
            
            const handleClickOutside = (e) => {
                if (e.target.classList.contains('modal')) {
                    cleanup();
                    resolve(false);
                }
            };
            
            const cleanup = () => {
                dialog.classList.add('hidden');
                confirmBtn.removeEventListener('click', handleConfirm);
                cancelBtn.removeEventListener('click', handleCancel);
                document.removeEventListener('keydown', handleEscape);
                dialog.removeEventListener('click', handleClickOutside);
            };
            
            confirmBtn.addEventListener('click', handleConfirm);
            cancelBtn.addEventListener('click', handleCancel);
            document.addEventListener('keydown', handleEscape);
            dialog.addEventListener('click', handleClickOutside);
        });
    }

    switchView(view) {
        // If currently in video player view, hide it first
        const videoView = document.getElementById('video-player-view');
        if (videoView.classList.contains('active')) {
            this.hideSessionDetailsView();
        }
        
        // Hide recording panel when switching away from sessions view unless there's an active incomplete session
        if (view !== 'sessions') {
            const hasActiveIncompleteSession = this.currentSession && 
                (this.currentSession.status === 'recording' || 
                 this.currentSession.status === 'paused' || 
                 this.currentSession.status === 'created');
            
            if (!hasActiveIncompleteSession) {
                this.hideRecordingPanel();
            }
        }
        
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
        });
        document.querySelector(`[data-view="${view}"]`).classList.add('active');

        document.querySelectorAll('.view').forEach(v => {
            v.classList.remove('active');
        });
        document.getElementById(`${view}-view`).classList.add('active');
    }

    showNewSessionModal() {
        const modal = document.getElementById('new-session-modal');
        modal.classList.remove('hidden');
        
        const titleInput = document.getElementById('session-title-input');
        const now = new Date();
        titleInput.value = `Session ${now.toLocaleDateString()} ${now.toLocaleTimeString()}`;
        titleInput.focus();
        titleInput.select();
    }

    hideNewSessionModal() {
        const modal = document.getElementById('new-session-modal');
        modal.classList.add('hidden');
        this.clearModalForm();
        this.resetModalState();
    }

    clearModalForm() {
        document.getElementById('session-title-input').value = '';
        document.getElementById('session-description').value = '';
        document.getElementById('session-tags-input').value = '';
        this.currentTags = [];
        this.renderTags();
    }
    
    clearNotes() {
        this.currentNotes = [];
        this.renderNotes();
        document.getElementById('note-input').value = '';
    }

    resetModalState() {
        // Reset modal to create mode
        const modal = document.getElementById('new-session-modal');
        const modalHeader = modal.querySelector('.modal-header h3');
        const createButton = document.getElementById('create-session');
        
        modalHeader.textContent = 'New Session';
        createButton.textContent = 'Create Session';
        
        // Clear editing context
        this.isEditingSession = false;
        this.editingSessionId = null;
    }

    updateVideoPlayerSessionInfo() {
        if (!this.currentVideoSession) return;
        
        // Update the video player view with new session info
        document.getElementById('session-info-title').textContent = this.currentVideoSession.title || 'Untitled Session';
        document.getElementById('session-description-detail').textContent = this.currentVideoSession.description || 'No description';
        
        // Update tags
        const tagsContainer = document.getElementById('session-tags-detail');
        if (this.currentVideoSession.tags && this.currentVideoSession.tags.length > 0) {
            tagsContainer.innerHTML = this.currentVideoSession.tags.map(tag => 
                `<span class="tag">${tag}</span>`
            ).join('');
        } else {
            tagsContainer.innerHTML = '<span style="color: #6c757d; font-style: italic;">No tags</span>';
        }
    }

    async createNewSession() {
        const title = document.getElementById('session-title-input').value.trim();
        const description = document.getElementById('session-description').value.trim();
        const tagsInput = document.getElementById('session-tags-input').value.trim();
        
        if (!title) {
            alert('Session title is required');
            return;
        }

        // Handle any remaining text in the input as a final tag
        let finalTags = [...this.currentTags];
        if (tagsInput) {
            const remainingTag = tagsInput.trim();
            if (remainingTag && !finalTags.includes(remainingTag)) {
                finalTags.push(remainingTag);
            }
        }

        const tags = finalTags;
        
        if (this.isEditingSession) {
            // Edit existing session
            try {
                const updates = {
                    title,
                    description,
                    tags
                };
                
                const success = await this.updateSession(this.editingSessionId, updates);
                
                if (success) {
                    // Update local sessions array
                    const sessionIndex = this.sessions.findIndex(s => s.id === this.editingSessionId);
                    if (sessionIndex !== -1) {
                        this.sessions[sessionIndex] = { ...this.sessions[sessionIndex], ...updates };
                    }
                    
                    // Update current video session if it's the one being edited
                    if (this.currentVideoSession && this.currentVideoSession.id === this.editingSessionId) {
                        this.currentVideoSession = { ...this.currentVideoSession, ...updates };
                        // Update the video player view
                        this.updateVideoPlayerSessionInfo();
                    }
                    
                    this.updateSessionsGrid();
                    this.updateTagFilter();
                    this.hideNewSessionModal();
                    this.resetModalState();
                } else {
                    await window.electronAPI.showErrorDialog('Error', 'Failed to update session');
                }
            } catch (error) {
                console.error('Failed to edit session:', error);
                await window.electronAPI.showErrorDialog('Error', `Failed to update session: ${error.message}`);
            }
        } else {
            // Create new session
            const session = {
                id: `session-${Date.now()}`,
                title,
                description,
                tags,
                created_at: new Date().toISOString(),
                completed_at: null,
                duration: 0,
                file_size: 0,
                status: 'created',
                notes: []
            };

            this.currentSession = session;
            
            // Save to file system
            const saved = await this.saveSession(session);
            if (saved) {
                this.sessions.unshift(session);
                this.updateSessionsGrid();
                this.updateTagFilter();
                this.hideNewSessionModal();
                this.showRecordingPanel(true);
            } else {
                await window.electronAPI.showErrorDialog('Error', 'Failed to create session');
            }
        }
    }

    showRecordingPanel(isNewSession = false) {
        const panel = document.getElementById('recording-panel');
        const details = document.getElementById('session-details');
        const rightPanel = document.querySelector('.right-panel');
        
        rightPanel.style.display = 'flex';
        details.classList.add('hidden');
        panel.classList.remove('hidden');
        
        // Only clear notes for brand new sessions, not resumed ones
        if (isNewSession) {
            this.clearNotes();
            // Reset recording duration for new sessions
            this.recordingDuration = 0;
            this.recordingStartTime = null;
        } else {
            // Load existing notes from the current session
            this.loadSessionNotes();
        }
        this.updateRecordingUI();
    }

    loadSessionNotes() {
        if (this.currentSession && this.currentSession.notes) {
            this.currentNotes = [...this.currentSession.notes];
        } else {
            this.currentNotes = [];
        }
        this.renderNotes();
    }

    hideRecordingPanel() {
        const recordingPanel = document.getElementById('recording-panel');
        const rightPanel = document.querySelector('.right-panel');
        recordingPanel.classList.add('hidden');
        rightPanel.style.display = 'none';
        this.currentSession = null;
    }

    showSessionDetails(session) {
        const detailsPanel = document.getElementById('session-details');
        const recordingPanel = document.getElementById('recording-panel');
        
        // Only show recording panel for incomplete sessions
        const isIncompleteSession = session.status === 'recording' || session.status === 'paused' || session.status === 'created';
        
        detailsPanel.classList.add('hidden');
        
        if (isIncompleteSession) {
            const rightPanel = document.querySelector('.right-panel');
            rightPanel.style.display = 'flex';
            recordingPanel.classList.remove('hidden');
            
            // Check if this session is currently being recorded or paused
            const isActiveSession = this.currentSession && this.currentSession.id === session.id;
            
            if (isActiveSession) {
                // Active recording session - keep current session reference
                
                // Restore recording state
                if (session.status === 'recording') {
                    this.isRecording = true;
                    this.isPaused = false;
                } else if (session.status === 'paused') {
                    this.isRecording = true;
                    this.isPaused = true;
                } else if (session.status === 'created') {
                    this.isRecording = false;
                    this.isPaused = false;
                }
                
            } else {
                // New incomplete session - set as current
                this.currentSession = session;
                
                // Set recording state based on session status
                if (session.status === 'recording') {
                    this.isRecording = true;
                    this.isPaused = false;
                } else if (session.status === 'paused') {
                    this.isRecording = true;
                    this.isPaused = true;
                } else if (session.status === 'created') {
                    this.isRecording = false;
                    this.isPaused = false;
                }
            }
            
            // Load session notes and update UI for incomplete sessions
            this.loadSessionNotes();
            this.updateRecordingUI();
        } else {
            // For completed sessions, hide the recording panel to save space
            recordingPanel.classList.add('hidden');
            // Completed sessions will use the video player view instead
        }
    }

    hideSessionDetails() {
        const panel = document.getElementById('session-details');
        panel.classList.add('hidden');
    }

    resumeInactiveSession(session) {
        // Set this session as the current one
        this.currentSession = session;
        
        // Restore recording state based on session status
        if (session.status === 'recording') {
            this.isRecording = true;
            this.isPaused = false;
        } else if (session.status === 'paused') {
            this.isRecording = true;
            this.isPaused = true;
        } else {
            this.isRecording = false;
            this.isPaused = false;
        }
        
        // Show the recording panel
        this.showRecordingPanel();
        
        // If it was recording, we might need to restart the timer
        if (session.status === 'recording') {
            // Estimate the recording duration from the last update
            this.recordingDuration = session.duration || 0;
            this.recordingStartTime = Date.now() - this.recordingDuration;
            this.startRecordingTimer();
        }
    }

    async playCurrentSession() {
        const sessionToPlay = this.currentSession;
        if (!sessionToPlay) return;
        
        // Navigate to session details view with video player
        this.showSessionDetailsView(sessionToPlay);
    }

    showSessionDetailsView(session) {
        // Hide main content and right panel, show video player view
        const mainContent = document.querySelector('.main-content');
        const rightPanel = document.querySelector('.right-panel');
        const videoView = document.getElementById('video-player-view');
        
        mainContent.style.display = 'none';
        rightPanel.style.display = 'none';
        videoView.classList.add('active');
        
        // Load video
        this.loadSessionVideo(session.id);
        
        // Update session information
        document.getElementById('session-info-title').textContent = session.title || 'Untitled Session';
        document.getElementById('session-description-detail').textContent = session.description || 'No description';
        document.getElementById('session-duration-detail').textContent = this.formatDuration(session.duration);
        
        const createdDate = new Date(session.created_at);
        document.getElementById('session-created-detail').textContent = createdDate.toLocaleString();
        
        // Update tags
        const tagsContainer = document.getElementById('session-tags-detail');
        if (session.tags && session.tags.length > 0) {
            tagsContainer.innerHTML = session.tags.map(tag => 
                `<span class="tag">${tag}</span>`
            ).join('');
        } else {
            tagsContainer.innerHTML = '<span style="color: #6c757d; font-style: italic;">No tags</span>';
        }
        
        // Store the current session for video notes functionality
        this.currentVideoSession = session;
        
        // Update notes
        this.renderVideoNotes();
        
        // Remove active state from sidebar items
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
        });
    }

    async loadSessionVideo(sessionId) {
        try {
            const result = await window.electronAPI.getVideoPath(sessionId);
            if (result.success) {
                const videoPlayer = document.getElementById('session-video-player');
                // Use file:// protocol for local file access
                videoPlayer.src = `file://${result.path}`;
            } else {
                console.error('Failed to get video path:', result.error);
                // Show error message in video player
                const videoPlayer = document.getElementById('session-video-player');
                videoPlayer.innerHTML = '<div style="color: white; text-align: center; padding: 20px;">Video file not found</div>';
            }
        } catch (error) {
            console.error('Error loading video:', error);
        }
    }

    hideSessionDetailsView() {
        // Show main content, hide video player view
        const mainContent = document.querySelector('.main-content');
        const rightPanel = document.querySelector('.right-panel');
        const videoView = document.getElementById('video-player-view');
        
        mainContent.style.display = 'flex';
        videoView.classList.remove('active');
        
        // Stop the video
        const videoPlayer = document.getElementById('session-video-player');
        videoPlayer.pause();
        videoPlayer.src = '';
        
        // Restore active sidebar item
        document.querySelector('[data-view="sessions"]').classList.add('active');
        
        // Show recording panel only if there's an active incomplete session
        if (this.currentSession && (this.currentSession.status === 'recording' || 
            this.currentSession.status === 'paused' || 
            this.currentSession.status === 'created')) {
            this.showRecordingPanel();
        } else {
            // Hide the right panel if no active incomplete session
            rightPanel.style.display = 'none';
        }
    }

    async deleteCurrentSession() {
        const sessionToDelete = this.currentSession;
        if (!sessionToDelete) return;
        
        const confirmed = await this.showConfirmDialog(
            'Delete Session',
            `Are you sure you want to delete "${sessionToDelete.title}"? This action cannot be undone.`,
            'Delete',
            true
        );
        
        if (!confirmed) return;
        
        try {
            const result = await window.electronAPI.deleteSession(sessionToDelete.id);
            
            if (!result.success) {
                throw new Error(result.error);
            }
            
            // Remove from sessions list
            this.sessions = this.sessions.filter(session => session.id !== sessionToDelete.id);
            
            // Clear current session and hide panel
            this.currentSession = null;
            this.hideRecordingPanel();
            
            // Then update UI
            this.updateSessionsGrid();
            this.updateTagFilter();
            
            console.log('Deleted session:', sessionToDelete.id);
        } catch (error) {
            console.error('Failed to delete session:', error);
            await window.electronAPI.showErrorDialog('Delete Error', `Failed to delete session: ${error.message}`);
        }
    }

    updateRecordingUI() {
        if (!this.currentSession) return;
        
        const startBtn = document.getElementById('start-recording');
        const pauseBtn = document.getElementById('pause-recording');
        const stopBtn = document.getElementById('stop-recording');
        const playBtn = document.getElementById('play-session-btn');
        const deleteBtn = document.getElementById('delete-session-btn');
        const statusIndicator = document.getElementById('status-indicator');
        const qualitySpan = document.getElementById('current-quality');
        const recordingHeader = document.querySelector('.recording-header h3');
        const recordingDuration = document.getElementById('recording-duration');
        
        // First hide all buttons
        startBtn.classList.add('hidden');
        pauseBtn.classList.add('hidden');
        stopBtn.classList.add('hidden');
        playBtn.classList.add('hidden');
        deleteBtn.classList.add('hidden');
        
        // Update header based on session type
        if (this.currentSession.status === 'completed') {
            recordingHeader.textContent = this.currentSession.title;
            recordingDuration.textContent = this.formatDuration(this.currentSession.duration);
            statusIndicator.textContent = '⏹';
            statusIndicator.classList.remove('recording');
            
            // For completed sessions, don't show Play and Delete buttons
            // Users can click on the session card to view in the new video player
            // and delete functionality can be added to the video player if needed
        } else {
            recordingHeader.textContent = 'Recording Session';
            
            if (this.isRecording && !this.isPaused) {
                // Currently recording: show Pause and Stop
                pauseBtn.classList.remove('hidden');
                stopBtn.classList.remove('hidden');
                stopBtn.textContent = 'Stop';
                stopBtn.className = 'btn btn-danger';
                statusIndicator.textContent = '🔴';
                statusIndicator.classList.add('recording');
            } else if (this.isPaused) {
                // Paused: show Resume and Stop
                startBtn.classList.remove('hidden');
                startBtn.textContent = 'Resume';
                stopBtn.classList.remove('hidden');
                stopBtn.textContent = 'Stop';
                stopBtn.className = 'btn btn-danger';
                statusIndicator.textContent = '⏸';
                statusIndicator.classList.remove('recording');
                // Show current recorded duration for paused sessions
                recordingDuration.textContent = this.formatDuration(this.recordingDuration);
            } else {
                // Session created but recording never started: show Start and Cancel
                startBtn.classList.remove('hidden');
                startBtn.textContent = 'Start';
                stopBtn.classList.remove('hidden');
                stopBtn.textContent = 'Cancel';
                stopBtn.className = 'btn btn-secondary';
                statusIndicator.textContent = '⏹';
                statusIndicator.classList.remove('recording');
                // Reset duration display for new sessions
                recordingDuration.textContent = '00:00:00';
            }
        }
        
        qualitySpan.textContent = `${this.settings.videoQuality} @ ${this.settings.frameRate}fps`;
        
        // Update session tags display
        const tagsDisplay = document.getElementById('session-tags-display');
        if (this.currentSession.tags && this.currentSession.tags.length > 0) {
            tagsDisplay.innerHTML = this.currentSession.tags.map(tag => 
                `<span class="tag clickable-tag" data-tag="${tag}">${tag}</span>`
            ).join('');
            
            // Add click handlers for tags
            tagsDisplay.querySelectorAll('.clickable-tag').forEach(tagElement => {
                tagElement.addEventListener('click', () => {
                    const tagValue = tagElement.dataset.tag;
                    // Set the tag filter dropdown and trigger filtering
                    const tagFilter = document.getElementById('tag-filter');
                    tagFilter.value = tagValue;
                    this.filterSessions();
                });
            });
        } else {
            tagsDisplay.textContent = '--';
        }
        
        // Update notes input - now always enabled during a session
        const noteInput = document.getElementById('note-input');
        const addNoteBtn = document.getElementById('add-note-btn');
        
        // Enable notes for any active session (created, recording, paused, or completed)
        const canAddNotes = !!this.currentSession;
        noteInput.disabled = !canAddNotes;
        addNoteBtn.disabled = !canAddNotes;
        
        if (!canAddNotes) {
            noteInput.placeholder = 'No active session';
        } else if (this.isRecording && !this.isPaused) {
            noteInput.placeholder = 'Add a note...';
        } else if (this.isPaused) {
            noteInput.placeholder = 'Add a note... (paused)';
        } else if (this.currentSession.status === 'completed') {
            noteInput.placeholder = 'Add a note... (recording ended)';
        } else {
            noteInput.placeholder = 'Add a note... (ready to record)';
        }
    }

    startRecording() {
        if (!this.currentSession) return;
        
        if (this.isPaused) {
            this.resumeRecording();
        } else {
            this.beginRecording();
        }
    }

    async beginRecording() {
        try {
            const result = await window.electronAPI.startRecording(this.currentSession.id, this.settings);
            
            if (!result.success) {
                throw new Error(result.error);
            }
            
            this.isRecording = true;
            this.isPaused = false;
            this.recordingStartTime = Date.now();
            this.currentSession.status = 'recording';
            
            // Update status in file system
            await this.updateSession(this.currentSession.id, { status: 'recording' });
            
            // Update local copy
            const sessionIndex = this.sessions.findIndex(s => s.id === this.currentSession.id);
            if (sessionIndex !== -1) {
                this.sessions[sessionIndex].status = 'recording';
            }
            
            this.updateRecordingUI();
            this.startRecordingTimer();
            this.updateSessionCard(this.currentSession);
            
            console.log('Recording started for session:', this.currentSession.id);
        } catch (error) {
            console.error('Failed to start recording:', error);
            await window.electronAPI.showErrorDialog('Recording Error', `Failed to start recording: ${error.message}`);
        }
    }

    async resumeRecording() {
        if (!this.currentSession) return;
        
        try {
            const result = await window.electronAPI.resumeRecording();
            
            if (!result.success) {
                throw new Error(result.error);
            }
            
            this.isPaused = false;
            this.recordingStartTime = Date.now() - this.recordingDuration;
            this.currentSession.status = 'recording';
            
            // Update status in file system
            await this.updateSession(this.currentSession.id, { status: 'recording' });
            
            // Update local copy
            const sessionIndex = this.sessions.findIndex(s => s.id === this.currentSession.id);
            if (sessionIndex !== -1) {
                this.sessions[sessionIndex].status = 'recording';
            }
            
            this.updateRecordingUI();
            this.updateSessionCard(this.currentSession);
            
            console.log('Recording resumed for session:', this.currentSession.id);
        } catch (error) {
            console.error('Failed to resume recording:', error);
            await window.electronAPI.showErrorDialog('Recording Error', `Failed to resume recording: ${error.message}`);
        }
    }

    async pauseRecording() {
        if (!this.isRecording || !this.currentSession) return;
        
        try {
            const result = await window.electronAPI.pauseRecording();
            
            if (!result.success) {
                throw new Error(result.error);
            }
            
            this.isPaused = true;
            this.currentSession.status = 'paused';
            
            // Update status in file system
            await this.updateSession(this.currentSession.id, { 
                status: 'paused',
                notes: [...this.currentNotes]
            });
            
            // Update local copy
            const sessionIndex = this.sessions.findIndex(s => s.id === this.currentSession.id);
            if (sessionIndex !== -1) {
                this.sessions[sessionIndex].status = 'paused';
            }
            
            this.updateRecordingUI();
            this.updateSessionCard(this.currentSession);
            
            console.log('Recording paused for session:', this.currentSession.id);
        } catch (error) {
            console.error('Failed to pause recording:', error);
            await window.electronAPI.showErrorDialog('Recording Error', `Failed to pause recording: ${error.message}`);
        }
    }

    async stopRecording() {
        if (!this.currentSession) {
            console.warn('No current session found when stopping recording');
            return;
        }
        
        // If recording never started (status is still 'created'), delete the session
        if (this.currentSession.status === 'created' && !this.isRecording && !this.isPaused) {
            console.log('Session never started recording, deleting it');
            
            const confirmed = await this.showConfirmDialog(
                'Cancel Session',
                `Are you sure you want to cancel this session? The session will be deleted.`,
                'Cancel Session',
                true
            );
            
            if (!confirmed) return;
            
            try {
                const result = await window.electronAPI.deleteSession(this.currentSession.id);
                
                if (result.success) {
                    // Remove from sessions list
                    this.sessions = this.sessions.filter(session => session.id !== this.currentSession.id);
                    
                    // Clear current session and hide panel
                    this.currentSession = null;
                    this.hideRecordingPanel();
                    
                    // Update UI
                    this.updateSessionsGrid();
                    this.updateTagFilter();
                    
                    console.log('Deleted unused session');
                } else {
                    throw new Error(result.error);
                }
            } catch (error) {
                console.error('Failed to delete unused session:', error);
                await window.electronAPI.showErrorDialog('Error', `Failed to delete session: ${error.message}`);
            }
            return;
        }
        
        // Normal stop for sessions that have been recording
        if (!this.isRecording && !this.isPaused) return;
        
        try {
            const result = await window.electronAPI.stopRecording();
            
            if (!result.success) {
                throw new Error(result.error);
            }
            
            this.isRecording = false;
            this.isPaused = false;
            this.currentSession.status = 'completed';
            this.currentSession.completed_at = new Date().toISOString();
            this.currentSession.duration = this.recordingDuration;
            this.currentSession.notes = [...this.currentNotes];
            
            // Update session in file system
            await this.updateSession(this.currentSession.id, {
                status: 'completed',
                completed_at: this.currentSession.completed_at,
                duration: this.currentSession.duration,
                notes: this.currentSession.notes
            });
            
            // Update local copy
            const sessionIndex = this.sessions.findIndex(s => s.id === this.currentSession.id);
            if (sessionIndex !== -1) {
                this.sessions[sessionIndex] = this.currentSession;
            }
            
            // Don't update UI for completed sessions - we'll hide the panel
            this.updateSessionCard(this.currentSession);
            
            // Generate thumbnail for the completed session
            try {
                const thumbnailResult = await window.electronAPI.generateThumbnail(this.currentSession.id);
                if (thumbnailResult.success) {
                    console.log('Thumbnail generated successfully');
                    this.currentSession.hasThumbnail = true;
                    // Update the session with thumbnail info
                    await this.updateSession(this.currentSession.id, {
                        hasThumbnail: true
                    });
                    // Update local copy
                    const sessionIndex = this.sessions.findIndex(s => s.id === this.currentSession.id);
                    if (sessionIndex !== -1) {
                        this.sessions[sessionIndex].hasThumbnail = true;
                    }
                    // Refresh the session card to show thumbnail
                    this.updateSessionsGrid();
                } else {
                    console.error('Failed to generate thumbnail:', thumbnailResult.error);
                }
            } catch (error) {
                console.error('Error generating thumbnail:', error);
            }
            
            this.hideRecordingPanel();
            
            if (this.recordingTimer) {
                clearInterval(this.recordingTimer);
            }
            
            console.log('Recording stopped for session:', this.currentSession?.id || 'unknown');
        } catch (error) {
            console.error('Failed to stop recording:', error);
            await window.electronAPI.showErrorDialog('Recording Error', `Failed to stop recording: ${error.message}`);
        }
    }

    startRecordingTimer() {
        if (this.recordingTimer) {
            clearInterval(this.recordingTimer);
        }
        
        this.recordingTimer = setInterval(() => {
            if (this.isRecording && !this.isPaused) {
                this.recordingDuration = Date.now() - this.recordingStartTime;
                document.getElementById('recording-duration').textContent = this.formatDuration(this.recordingDuration);
                
                const estimatedSize = Math.floor(this.recordingDuration / 1000 / 60 * 3.5);
                document.getElementById('file-size-estimate').textContent = `${estimatedSize} MB`;
                
                // Update the session card in the grid with current duration
                this.updateSessionCard(this.currentSession);
            }
        }, 1000);
    }

    updateSessionCard(session) {
        const card = document.querySelector(`[data-session-id="${session.id}"]`);
        if (card) {
            const statusElement = card.querySelector('.session-status');
            const metaElement = card.querySelector('.session-meta');
            
            statusElement.textContent = session.status;
            statusElement.className = `session-status status-${session.status}`;
            
            if (session.status === 'recording' && this.isRecording && !this.isPaused) {
                metaElement.querySelector('.duration').textContent = this.formatDuration(this.recordingDuration);
            }
        }
    }

    updateSessionsGrid() {
        const grid = document.getElementById('sessions-grid');
        
        if (this.sessions.length === 0) {
            grid.innerHTML = `
                <div class="empty-state">
                    <h3>No sessions yet</h3>
                    <p>Create your first recording session to get started</p>
                    <button class="btn btn-primary" onclick="document.getElementById('new-session-btn').click()">
                        Create Session
                    </button>
                </div>
            `;
            return;
        }
        
        grid.innerHTML = this.sessions.map(session => this.createSessionCard(session)).join('');
        
        document.querySelectorAll('.session-card').forEach(card => {
            card.addEventListener('click', () => {
                const sessionId = card.dataset.sessionId;
                const session = this.sessions.find(s => s.id === sessionId);
                if (session) {
                    // If clicking on the current recording/paused session, show recording controls
                    if (this.currentSession && this.currentSession.id === sessionId && 
                        (session.status === 'recording' || session.status === 'paused' || session.status === 'created')) {
                        this.showRecordingPanel();
                    } else if (session.status === 'completed') {
                        // For completed sessions, show the video player view
                        this.showSessionDetailsView(session);
                    } else {
                        this.showSessionDetails(session);
                    }
                }
            });
        });

        // Add mouse wheel scrolling to session tags
        document.querySelectorAll('.session-tags').forEach(tagsContainer => {
            tagsContainer.addEventListener('wheel', (e) => {
                // Prevent default vertical scrolling
                e.preventDefault();
                
                // Scroll horizontally based on wheel delta
                tagsContainer.scrollLeft += e.deltaY;
            });
        });
    }

    createSessionCard(session) {
        const createdDate = new Date(session.created_at);
        const statusClass = `status-${session.status}`;
        
        // Check if session has thumbnail
        let thumbnailContent;
        if (session.hasThumbnail && session.status === 'completed') {
            // Use relative path that will be handled by Electron's file protocol
            thumbnailContent = `<img src="thumbnail://${session.id}" alt="Session thumbnail" class="thumbnail-image">`;
        } else {
            thumbnailContent = '<div class="thumbnail-placeholder">📹</div>';
        }
        
        // Create tags HTML
        let tagsHtml = '';
        if (session.tags && session.tags.length > 0) {
            tagsHtml = `
                <div class="session-tags">
                    ${session.tags.map(tag => `<span class="session-tag">${tag}</span>`).join('')}
                </div>
            `;
        }
        
        return `
            <div class="session-card" data-session-id="${session.id}">
                <div class="session-thumbnail">${thumbnailContent}</div>
                <div class="session-info">
                    <h4>${session.title}</h4>
                    ${tagsHtml}
                    <div class="session-bottom-info">
                        <div class="session-meta">
                            <span class="duration">${this.formatDuration(session.duration)}</span>
                            <span class="date">${createdDate.toLocaleDateString()}</span>
                        </div>
                        <div class="session-status ${statusClass}">${session.status}</div>
                    </div>
                </div>
            </div>
        `;
    }

    filterSessions() {
        const searchTerm = document.getElementById('search-input').value.toLowerCase();
        const selectedTag = document.getElementById('tag-filter').value;
        
        // If no search/filter is active, show regular grid
        if (!searchTerm && !selectedTag) {
            this.updateSessionsGrid();
            return;
        }
        
        let filtered = this.sessions;
        
        if (searchTerm) {
            filtered = filtered.filter(session => 
                session.title.toLowerCase().includes(searchTerm) ||
                session.description.toLowerCase().includes(searchTerm)
            );
        }
        
        if (selectedTag) {
            filtered = filtered.filter(session => 
                session.tags && session.tags.includes(selectedTag)
            );
        }
        
        this.displayFilteredSessions(filtered);
    }

    sortSessions() {
        const sortBy = document.getElementById('sort-select').value;
        
        let sorted = [...this.sessions];
        
        switch (sortBy) {
            case 'recent':
                sorted.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
                break;
            case 'duration':
                sorted.sort((a, b) => b.duration - a.duration);
                break;
            case 'alphabetical':
                sorted.sort((a, b) => a.title.localeCompare(b.title));
                break;
        }
        
        this.sessions = sorted;
        this.updateSessionsGrid();
    }

    displayFilteredSessions(sessions) {
        const grid = document.getElementById('sessions-grid');
        
        if (sessions.length === 0) {
            grid.innerHTML = `
                <div class="empty-state">
                    <h3>No sessions found</h3>
                    <p>Try adjusting your search or filter criteria</p>
                </div>
            `;
            return;
        }
        
        grid.innerHTML = sessions.map(session => this.createSessionCard(session)).join('');
        
        // Add mouse wheel scrolling to session tags
        document.querySelectorAll('.session-tags').forEach(tagsContainer => {
            tagsContainer.addEventListener('wheel', (e) => {
                // Prevent default vertical scrolling
                e.preventDefault();
                
                // Scroll horizontally based on wheel delta
                tagsContainer.scrollLeft += e.deltaY;
            });
        });
        
        document.querySelectorAll('.session-card').forEach(card => {
            card.addEventListener('click', () => {
                const sessionId = card.dataset.sessionId;
                const session = this.sessions.find(s => s.id === sessionId);
                if (session) {
                    // If clicking on the current recording/paused session, show recording controls
                    if (this.currentSession && this.currentSession.id === sessionId && 
                        (session.status === 'recording' || session.status === 'paused' || session.status === 'created')) {
                        this.showRecordingPanel();
                    } else if (session.status === 'completed') {
                        // For completed sessions, show the video player view
                        this.showSessionDetailsView(session);
                    } else {
                        this.showSessionDetails(session);
                    }
                }
            });
        });
    }

    updateTagFilter() {
        const tagFilter = document.getElementById('tag-filter');
        const allTags = new Set();
        
        this.sessions.forEach(session => {
            if (session.tags) {
                session.tags.forEach(tag => allTags.add(tag));
            }
        });
        
        const currentValue = tagFilter.value;
        tagFilter.innerHTML = '<option value="">All Tags</option>';
        
        [...allTags].sort().forEach(tag => {
            const option = document.createElement('option');
            option.value = tag;
            option.textContent = tag;
            tagFilter.appendChild(option);
        });
        
        tagFilter.value = currentValue;
    }

    async resetDirectory() {
        try {
            const defaultDir = await window.electronAPI.getDefaultSessionsDir();
            const currentDir = this.settings.sessionsDirectory || await window.electronAPI.getSessionsDir();
            
            if (defaultDir === currentDir) {
                return; // Already using default
            }
            
            const confirmed = await this.showConfirmDialog(
                'Reset Storage Directory',
                `Reset storage directory to the default location? The app will restart to apply changes.\n\nDefault: ${defaultDir}`,
                'Reset and Restart',
                false
            );
            
            if (!confirmed) return;
            
            // Change to default directory
            const result = await window.electronAPI.changeSessionsDirectory(defaultDir);
            if (result.success) {
                // Update the setting
                await this.updateSetting('sessionsDirectory', defaultDir);
                
                // Always restart to apply changes
                await window.electronAPI.restartApp();
            } else {
                await window.electronAPI.showErrorDialog('Error', `Failed to reset directory: ${result.error}`);
            }
        } catch (error) {
            console.error('Error resetting directory:', error);
            await window.electronAPI.showErrorDialog('Error', `Failed to reset directory: ${error.message}`);
        }
    }

    async browseDirectory() {
        try {
            const selectedDir = await window.electronAPI.selectDirectory();
            if (selectedDir) {
                // Check if this is a different directory
                const currentDir = this.settings.sessionsDirectory || await window.electronAPI.getSessionsDir();
                if (selectedDir === currentDir) {
                    return; // No change needed
                }
                
                // Show confirmation dialog before making any changes
                const confirmed = await this.showConfirmDialog(
                    'Change Storage Directory',
                    `Change storage directory to:\n${selectedDir}\n\nThe app will restart to apply the changes.`,
                    'Change and Restart',
                    false
                );
                
                if (!confirmed) {
                    return; // User cancelled
                }
                
                // User confirmed - proceed with the change
                const result = await window.electronAPI.changeSessionsDirectory(selectedDir);
                if (result.success) {
                    // Update the setting
                    await this.updateSetting('sessionsDirectory', selectedDir);
                    
                    // Always restart to apply changes
                    await window.electronAPI.restartApp();
                } else {
                    await window.electronAPI.showErrorDialog('Error', `Failed to change directory: ${result.error}`);
                }
            }
        } catch (error) {
            console.error('Error selecting directory:', error);
            await window.electronAPI.showErrorDialog('Error', `Failed to change directory: ${error.message}`);
        }
    }

    async updateSetting(key, value) {
        this.settings[key] = value;
        await this.saveSettings();
    }

    handleFrameRateChange(value) {
        const customContainer = document.getElementById('custom-fps-container');
        
        if (value === 'custom') {
            customContainer.classList.remove('hidden');
            // Focus on the custom input
            const customInput = document.getElementById('custom-fps-input');
            customInput.focus();
            
            // If we have a custom frame rate stored, display it
            if (typeof this.settings.frameRate === 'number' && 
                this.settings.frameRate !== 15 && 
                this.settings.frameRate !== 30) {
                customInput.value = this.settings.frameRate;
            }
        } else {
            customContainer.classList.add('hidden');
            // Update setting with predefined value
            this.updateSetting('frameRate', parseInt(value));
        }
    }

    handleCustomFrameRateInput(value) {
        // Validate input
        let fps = parseInt(value);
        const customInput = document.getElementById('custom-fps-input');
        
        if (value === '' || isNaN(fps)) {
            // Empty or invalid input - don't save yet
            return;
        }
        
        // Auto-correct values outside valid range
        if (fps < 1) {
            fps = 1;
            customInput.value = fps;
        } else if (fps > 240) {
            fps = 240;
            customInput.value = fps;
        }
        
        // Save the (potentially corrected) value
        this.updateSetting('frameRate', fps);
    }

    updateSettingsUI() {
        document.getElementById('video-quality').value = this.settings.videoQuality;
        
        // Handle frame rate display
        const frameRateSelect = document.getElementById('frame-rate');
        const customContainer = document.getElementById('custom-fps-container');
        const customInput = document.getElementById('custom-fps-input');
        
        if (this.settings.frameRate === 15 || this.settings.frameRate === 30) {
            // Standard frame rate
            frameRateSelect.value = this.settings.frameRate.toString();
            customContainer.classList.add('hidden');
        } else {
            // Custom frame rate
            frameRateSelect.value = 'custom';
            customContainer.classList.remove('hidden');
            customInput.value = this.settings.frameRate;
        }
        
        const dirInput = document.getElementById('sessions-directory');
        dirInput.value = this.settings.sessionsDirectory || 'Default location';
    }

    formatDuration(ms) {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        
        const h = hours.toString().padStart(2, '0');
        const m = (minutes % 60).toString().padStart(2, '0');
        const s = (seconds % 60).toString().padStart(2, '0');
        
        return `${h}:${m}:${s}`;
    }

    async loadSettings() {
        try {
            const result = await window.electronAPI.getSettings();
            if (result.success && result.settings) {
                this.settings = { ...this.settings, ...result.settings };
            } else {
                console.error('Error loading settings:', result.error);
                // Use defaults if loading fails
                this.settings.sessionsDirectory = await window.electronAPI.getSessionsDir();
            }
        } catch (error) {
            console.error('Error loading settings:', error);
            // Use defaults on error
            this.settings.sessionsDirectory = await window.electronAPI.getSessionsDir();
        }
    }

    async saveSettings() {
        try {
            const result = await window.electronAPI.saveSettings(this.settings);
            if (!result.success) {
                console.error('Error saving settings:', result.error);
            }
        } catch (error) {
            console.error('Error saving settings:', error);
        }
    }

    async loadSessions() {
        try {
            const result = await window.electronAPI.getAllSessions();
            if (result.success) {
                this.sessions = result.sessions;
            } else {
                console.error('Error loading sessions:', result.error);
                this.sessions = [];
            }
        } catch (error) {
            console.error('Error loading sessions:', error);
            this.sessions = [];
        }
    }

    async saveSession(session) {
        try {
            const result = await window.electronAPI.saveSession(session);
            if (!result.success) {
                console.error('Error saving session:', result.error);
            }
            return result.success;
        } catch (error) {
            console.error('Error saving session:', error);
            return false;
        }
    }

    async updateSession(sessionId, updates) {
        try {
            const result = await window.electronAPI.updateSession(sessionId, updates);
            if (!result.success) {
                console.error('Error updating session:', result.error);
            }
            return result.success;
        } catch (error) {
            console.error('Error updating session:', error);
            return false;
        }
    }
}

const app = new LaborasApp();