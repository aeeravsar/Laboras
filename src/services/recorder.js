const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const ffmpeg = require('fluent-ffmpeg');

// Handle FFmpeg path for different environments
let ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;

// If running from asar archive, we need to extract ffmpeg to a temp location
if (ffmpegPath.includes('.asar')) {
    const tempDir = path.join(os.tmpdir(), 'laboras-ffmpeg');
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
    }
    
    const tempFfmpegPath = path.join(tempDir, 'ffmpeg');
    
    // Copy ffmpeg to temp location if it doesn't exist or is outdated
    if (!fs.existsSync(tempFfmpegPath)) {
        // Read the ffmpeg binary from the asar package
        const originalPath = ffmpegPath.replace('app.asar', 'app.asar.unpacked');
        if (fs.existsSync(originalPath)) {
            fs.copyFileSync(originalPath, tempFfmpegPath);
            fs.chmodSync(tempFfmpegPath, 0o755);
            ffmpegPath = tempFfmpegPath;
        }
    } else {
        ffmpegPath = tempFfmpegPath;
    }
}

ffmpeg.setFfmpegPath(ffmpegPath);

class ScreenRecorder {
    constructor() {
        this.isRecording = false;
        this.isPaused = false;
        this.currentProcess = null;
        this.outputPath = null;
        this.currentOutputPath = null; // Track the current segment being recorded
        this.sessionId = null;
        this.startTime = null;
        this.pausedDuration = 0;
        this.lastPauseTime = null;
        this.segmentPaths = [];
        this.currentSettings = null;
    }

    async startRecording(sessionId, settings, outputDir) {
        if (this.isRecording) {
            throw new Error('Recording is already in progress');
        }

        this.sessionId = sessionId;
        this.outputPath = path.join(outputDir, sessionId, 'video.mp4');
        this.currentOutputPath = this.outputPath; // Initial segment
        this.currentSettings = settings; // Store settings for resume
        this.segmentPaths = []; // Initialize segment paths array - segments will be added on pause/stop
        this.pausedDuration = 0;
        
        const sessionDir = path.dirname(this.outputPath);
        if (!fs.existsSync(sessionDir)) {
            fs.mkdirSync(sessionDir, { recursive: true });
        }

        const platform = process.platform;
        const ffmpegArgs = this.buildFFmpegArgs(platform, settings);
        
        // Update the output path in ffmpegArgs to use currentOutputPath
        const outputIndex = ffmpegArgs.length - 1;
        ffmpegArgs[outputIndex] = this.currentOutputPath;

        try {
            this.currentProcess = spawn(ffmpegPath, ffmpegArgs, {
                stdio: ['pipe', 'pipe', 'pipe'], // Enable stdin for sending commands
                detached: false, // Keep as child process (dies with parent)
                killSignal: 'SIGTERM'
            });
            
            this.currentProcess.stderr.on('data', (data) => {
                console.log(`FFmpeg: ${data}`);
            });

            this.currentProcess.on('close', (code) => {
                console.log(`FFmpeg process closed with code ${code}`);
                if (code !== 0 && this.isRecording) {
                    console.error(`FFmpeg failed with exit code ${code}`);
                    this.cleanup();
                }
            });

            this.currentProcess.on('exit', (code) => {
                console.log(`FFmpeg process exited with code ${code}`);
                if (code !== 0 && this.isRecording) {
                    console.error(`FFmpeg failed with exit code ${code}`);
                    this.cleanup();
                }
            });

            this.currentProcess.on('error', (error) => {
                console.error('FFmpeg error:', error);
                this.cleanup();
                throw error;
            });

            this.isRecording = true;
            this.startTime = Date.now();
            
            return true;
        } catch (error) {
            console.error('Failed to start recording:', error);
            throw error;
        }
    }

    pauseRecording() {
        if (!this.isRecording || this.isPaused) {
            return false;
        }

        // Set paused state immediately for UI feedback
        this.isPaused = true;
        this.lastPauseTime = Date.now();

        return new Promise((resolve) => {
            if (this.currentProcess && !this.currentProcess.killed) {
                // Set up listener for when process ends
                const onProcessEnd = () => {
                    console.log('FFmpeg paused, process ended');
                    
                    // Add current segment to the list if not already there
                    if (this.currentOutputPath && !this.segmentPaths.includes(this.currentOutputPath)) {
                        this.segmentPaths.push(this.currentOutputPath);
                        console.log('Added segment on pause:', this.currentOutputPath);
                        console.log('Current segments after pause:', this.segmentPaths);
                    }
                    
                    // Don't fully cleanup - keep session info for resume
                    this.currentProcess = null;
                    resolve(true);
                };

                this.currentProcess.once('close', onProcessEnd);
                this.currentProcess.once('exit', onProcessEnd);
                
                // Stop FFmpeg gracefully
                try {
                    this.currentProcess.stdin.write('q\n');
                    this.currentProcess.stdin.end();
                    console.log('Sent quit command to FFmpeg for pause...');
                } catch (error) {
                    console.log('Could not send quit command to FFmpeg, using kill signal');
                    this.currentProcess.kill('SIGTERM');
                }
                
                // Fallback timeout
                setTimeout(() => {
                    if (this.currentProcess && !this.currentProcess.killed) {
                        console.log('Force killing FFmpeg process during pause');
                        this.currentProcess.kill('SIGKILL');
                    }
                }, 5000);
            } else {
                resolve(true);
            }
        });
    }

    resumeRecording() {
        if (!this.isRecording || !this.isPaused) {
            return false;
        }

        // Calculate paused duration
        if (this.lastPauseTime) {
            this.pausedDuration += Date.now() - this.lastPauseTime;
        }
        
        this.isPaused = false;
        this.lastPauseTime = null;

        // Create a new segment file for continuation
        const segmentPath = this.outputPath.replace('.mp4', `_part${Date.now()}.mp4`);
        this.currentOutputPath = segmentPath; // Update current segment path
        
        // Start a new FFmpeg process
        const platform = process.platform;
        const ffmpegArgs = this.buildFFmpegArgs(platform, this.currentSettings);
        
        // Update the output path for this segment
        ffmpegArgs[ffmpegArgs.length - 1] = segmentPath;
        
        try {
            this.currentProcess = spawn(ffmpegPath, ffmpegArgs, {
                stdio: ['pipe', 'pipe', 'pipe'],
                detached: false, // Keep as child process (dies with parent)
                killSignal: 'SIGTERM'
            });
            
            this.currentProcess.stderr.on('data', (data) => {
                console.log(`FFmpeg: ${data}`);
            });

            this.currentProcess.on('close', (code) => {
                console.log(`FFmpeg process closed with code ${code}`);
            });

            this.currentProcess.on('exit', (code) => {
                console.log(`FFmpeg process exited with code ${code}`);
            });

            this.currentProcess.on('error', (error) => {
                console.error('FFmpeg error:', error);
                this.cleanup();
                throw error;
            });

            // The new segment will be added to the list
            // No need to add it here since it will be added on next pause or stop
            console.log('Resume recording to new segment:', segmentPath);
            console.log('Current segments list:', this.segmentPaths);
            
            console.log('Recording resumed with new segment');
            return true;
        } catch (error) {
            console.error('Failed to resume recording:', error);
            throw error;
        }
    }

    stopRecording() {
        if (!this.isRecording) {
            return false;
        }

        return new Promise(async (resolve) => {
            if (this.currentProcess && !this.currentProcess.killed) {
                // Set up a one-time listener for when the process actually exits
                const onProcessEnd = async () => {
                    console.log('FFmpeg process ended, cleaning up...');
                    
                    // Add the final segment to the list
                    if (this.currentOutputPath && !this.segmentPaths.includes(this.currentOutputPath)) {
                        this.segmentPaths.push(this.currentOutputPath);
                        console.log('Added final segment:', this.currentOutputPath);
                    }
                    
                    console.log('Final segment list before concatenation:', this.segmentPaths);
                    
                    // If we have multiple segments, concatenate them
                    if (this.segmentPaths && this.segmentPaths.length > 1) {
                        console.log(`Need to concatenate ${this.segmentPaths.length} segments`);
                        await this.concatenateSegments();
                    } else if (this.segmentPaths && this.segmentPaths.length === 1) {
                        console.log('Only one segment, no concatenation needed');
                    } else {
                        console.log('No segments recorded');
                    }
                    
                    this.cleanup();
                    resolve(true);
                };

                this.currentProcess.once('close', onProcessEnd);
                this.currentProcess.once('exit', onProcessEnd);
                
                // Send 'q' command to FFmpeg to stop recording gracefully
                try {
                    this.currentProcess.stdin.write('q\n');
                    this.currentProcess.stdin.end();
                    console.log('Sent quit command to FFmpeg, waiting for process to finish...');
                } catch (error) {
                    console.log('Could not send quit command to FFmpeg, using kill signal');
                    this.currentProcess.kill('SIGTERM');
                }
                
                // Fallback: Force kill if process doesn't terminate
                setTimeout(() => {
                    if (this.currentProcess && !this.currentProcess.killed) {
                        console.log('Force killing FFmpeg process after timeout');
                        this.currentProcess.kill('SIGKILL');
                    }
                }, 10000); // Increased timeout to 10 seconds
            } else {
                this.cleanup();
                resolve(true);
            }
        });
    }

    async concatenateSegments() {
        if (!this.segmentPaths || this.segmentPaths.length <= 1) {
            console.log('No segments to concatenate');
            return;
        }

        console.log(`Concatenating ${this.segmentPaths.length} video segments FAST...`);
        console.log('Segments to concatenate:', this.segmentPaths);
        
        // Filter out any non-existent files
        const existingSegments = this.segmentPaths.filter(segPath => {
            const exists = fs.existsSync(segPath);
            if (!exists) {
                console.log(`Warning: Segment file not found: ${segPath}`);
            }
            return exists;
        });

        if (existingSegments.length <= 1) {
            console.log('Only one valid segment found, no concatenation needed');
            // If we have exactly one segment, just rename it to the final output
            if (existingSegments.length === 1) {
                const singleSegment = existingSegments[0];
                if (singleSegment !== this.outputPath && fs.existsSync(singleSegment)) {
                    try {
                        if (fs.existsSync(this.outputPath)) {
                            fs.unlinkSync(this.outputPath);
                        }
                        fs.renameSync(singleSegment, this.outputPath);
                        console.log('✅ Single segment moved to final output');
                    } catch (error) {
                        console.error('Error moving single segment:', error);
                    }
                }
            }
            return;
        }
        
        // Create a file list for FFmpeg concat demuxer (FASTEST method)
        const listPath = this.outputPath.replace('.mp4', '_segments.txt');
        const fileList = existingSegments.map(p => `file '${path.resolve(p)}'`).join('\n');
        
        try {
            fs.writeFileSync(listPath, fileList);
            console.log('Created segment list file:', listPath);
            console.log('Segment list contents:', fileList);
            
            // Verify all segments exist and have content
            let totalSize = 0;
            for (const segmentPath of existingSegments) {
                if (!fs.existsSync(segmentPath)) {
                    throw new Error(`Segment file missing: ${segmentPath}`);
                }
                const stats = fs.statSync(segmentPath);
                if (stats.size === 0) {
                    throw new Error(`Segment file is empty: ${segmentPath}`);
                }
                totalSize += stats.size;
                console.log(`Segment ${segmentPath}: ${stats.size} bytes`);
            }
            console.log(`Total segments size: ${totalSize} bytes`);
            
            // Create final concatenated video using fastest method
            const finalPath = this.outputPath.replace('.mp4', '_final.mp4');
            const concatArgs = [
                '-f', 'concat',           // Use concat demuxer (fastest)
                '-safe', '0',             // Allow absolute paths
                '-i', listPath,           // Input list file
                '-c', 'copy',             // Stream copy (no re-encoding = FAST!)
                '-avoid_negative_ts', 'make_zero', // Fix timestamp issues
                '-fflags', '+genpts',     // Generate presentation timestamps
                '-y',                     // Overwrite output
                finalPath
            ];

            console.log('Starting FAST concatenation with args:', concatArgs);

            return new Promise((resolve, reject) => {
                const concatProcess = spawn(ffmpegPath, concatArgs);
                let ffmpegOutput = '';
                let ffmpegError = '';
                
                concatProcess.stdout.on('data', (data) => {
                    ffmpegOutput += data.toString();
                    console.log(`Concat FFmpeg stdout: ${data}`);
                });
                
                concatProcess.stderr.on('data', (data) => {
                    ffmpegError += data.toString();
                    console.log(`Concat FFmpeg stderr: ${data}`);
                });
                
                concatProcess.on('error', (error) => {
                    console.error('Concatenation process error:', error);
                    reject(new Error(`FFmpeg process error: ${error.message}`));
                });
                
                concatProcess.on('close', (code) => {
                    console.log(`Concatenation process closed with code ${code}`);
                    
                    if (code === 0) {
                        // Add a small delay to ensure file system operations complete
                        const checkFile = (attempt = 1, maxAttempts = 5) => {
                            setTimeout(() => {
                                try {
                                    // Debug: Check file status
                                    const finalExists = fs.existsSync(finalPath);
                                    const finalSize = finalExists ? fs.statSync(finalPath).size : 0;
                                    console.log(`Final file check attempt ${attempt}: exists: ${finalExists}, size: ${finalSize} bytes`);
                                    
                                    // Check if final file was created and has content
                                    if (finalExists && finalSize > 0) {
                                        // Replace original with concatenated version
                                        if (fs.existsSync(this.outputPath)) {
                                            fs.unlinkSync(this.outputPath);
                                        }
                                        fs.renameSync(finalPath, this.outputPath);
                                        
                                        console.log('✅ FAST concatenation completed successfully!');
                                        
                                        // Clean up segment files (except the final one)
                                        existingSegments.forEach(segPath => {
                                            if (segPath !== this.outputPath && fs.existsSync(segPath)) {
                                                try {
                                                    fs.unlinkSync(segPath);
                                                    console.log(`Cleaned up segment: ${segPath}`);
                                                } catch (err) {
                                                    console.log(`Could not clean up segment ${segPath}:`, err.message);
                                                }
                                            }
                                        });
                                        
                                        // Clean up list file
                                        if (fs.existsSync(listPath)) {
                                            fs.unlinkSync(listPath);
                                        }
                                        
                                        resolve();
                                    } else if (attempt < maxAttempts) {
                                        console.log(`File not ready, retrying in ${attempt * 200}ms...`);
                                        checkFile(attempt + 1, maxAttempts);
                                    } else {
                                        // Final attempt failed
                                        console.error('FFmpeg concatenation output:', ffmpegOutput);
                                        console.error('FFmpeg concatenation error:', ffmpegError);
                                        console.log('Segment list contents:');
                                        if (fs.existsSync(listPath)) {
                                            console.log(fs.readFileSync(listPath, 'utf8'));
                                        } else {
                                            console.log('List file does not exist!');
                                        }
                                        reject(new Error(`Concatenated file was not created or is empty after ${maxAttempts} attempts. Final path: ${finalPath}, exists: ${finalExists}, size: ${finalSize}. FFmpeg error: ${ffmpegError}`));
                                    }
                                } catch (error) {
                                    console.error('Error during file operations:', error);
                                    reject(error);
                                }
                            }, attempt * 200); // Progressive delay: 200ms, 400ms, 600ms, etc.
                        };
                        
                        checkFile(); // Start the file checking process
                    } else {
                        console.error('Concatenation failed with code:', code);
                        console.error('FFmpeg output:', ffmpegOutput);
                        console.error('FFmpeg error:', ffmpegError);
                        reject(new Error(`Concatenation failed with code ${code}. FFmpeg error: ${ffmpegError}`));
                    }
                });
            });
        } catch (error) {
            console.error('Error setting up concatenation:', error);
            throw error;
        }
    }

    cleanup() {
        this.isRecording = false;
        this.isPaused = false;
        
        if (this.currentProcess && !this.currentProcess.killed) {
            this.currentProcess.kill('SIGKILL');
        }
        
        this.currentProcess = null;
        this.startTime = null;
        this.pausedDuration = 0;
        this.lastPauseTime = null;
        this.segmentPaths = [];
        this.currentSettings = null;
    }

    buildFFmpegArgs(platform, settings) {
        const args = [];
        
        // Add framerate before input
        args.push('-framerate', settings.frameRate.toString());
        
        switch (platform) {
            case 'win32':
                args.push('-f', 'gdigrab', '-i', 'desktop');
                break;
            case 'darwin':
                args.push('-f', 'avfoundation', '-i', '1:0');
                break;
            case 'linux':
                // Get screen resolution first, then use it
                args.push('-f', 'x11grab');
                args.push('-video_size', this.getScreenSize());
                args.push('-i', ':0.0');
                break;
            default:
                throw new Error(`Unsupported platform: ${platform}`);
        }

        // Video encoding settings
        args.push('-c:v', 'libx264');
        args.push('-preset', 'fast'); // Faster encoding for real-time
        args.push('-tune', 'zerolatency'); // Better for real-time recording
        args.push('-crf', '23'); // Better quality for screen recording
        args.push('-pix_fmt', 'yuv420p');
        
        // Scale video if needed (after capture)
        const targetResolution = this.getResolution(settings.videoQuality);
        if (targetResolution && platform !== 'linux') {
            args.push('-vf', `scale=${targetResolution}`);
        }


        args.push('-y');
        args.push(this.outputPath);

        return args;
    }

    getResolution(quality) {
        const resolutions = {
            '480p': '854:480',
            '720p': '1280:720',
            '1080p': '1920:1080'
        };
        return resolutions[quality] || null;
    }

    getScreenSize() {
        // For Linux, try to get the actual screen size
        try {
            // Try to get screen resolution from xrandr
            const output = execSync('xrandr --current | grep "*" | head -1', { encoding: 'utf8' });
            const match = output.match(/(\d+)x(\d+)/);
            if (match) {
                return `${match[1]}x${match[2]}`;
            }
        } catch (error) {
            console.log('Could not get screen size from xrandr, using default');
        }
        
        // Fallback to common resolution
        return '1920x1080';
    }

    getCurrentOutputPath() {
        return this.currentOutputPath;
    }


    getRecordingDuration() {
        if (!this.startTime) return 0;
        
        const now = Date.now();
        const totalTime = now - this.startTime;
        return totalTime - this.pausedDuration;
    }

    getEstimatedFileSize() {
        const durationMinutes = this.getRecordingDuration() / 1000 / 60;
        return Math.floor(durationMinutes * 3.5);
    }

    async generateThumbnail(inputPath, outputPath) {
        return new Promise((resolve, reject) => {
            ffmpeg(inputPath)
                .screenshots({
                    timestamps: ['50%'],
                    filename: 'thumbnail.jpg',
                    folder: path.dirname(outputPath),
                    size: '1280x720'
                })
                .on('end', () => {
                    resolve(outputPath);
                })
                .on('error', (error) => {
                    console.error('Thumbnail generation error:', error);
                    reject(error);
                });
        });
    }

    async getVideoInfo(filePath) {
        return new Promise((resolve, reject) => {
            ffmpeg.ffprobe(filePath, (error, metadata) => {
                if (error) {
                    reject(error);
                } else {
                    const duration = metadata.format.duration * 1000;
                    const fileSize = metadata.format.size;
                    resolve({ duration, fileSize });
                }
            });
        });
    }
}

module.exports = ScreenRecorder;