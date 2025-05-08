// File: js/player_app.js

// --- 模块内变量 ---
let currentVideoTitle = '';
let currentEpisodeIndex = 0;
let currentEpisodes = [];
let episodesReversed = false;
let dp = null; // DPlayer instance
let currentHls = null;
let autoplayEnabled = true;
let isUserSeeking = false;
let videoHasEnded = false;
let userClickedPosition = null;
let shortcutHintTimeout = null;
let progressSaveInterval = null;

// 将需要在 player_preload.js 中访问的变量挂载到 window
window.currentEpisodes = [];
window.currentEpisodeIndex = 0;
// window.PLAYER_CONFIG is set by config.js
// window.dp will be set after DPlayer initialization
// window.playEpisode will be set later

document.addEventListener('DOMContentLoaded', function() {
    // 检查密码 (需要 password.js 先加载并定义好函数)
    if (typeof window.isPasswordVerified === 'function' && typeof window.isPasswordProtected === 'function') {
        if (window.isPasswordProtected() && !window.isPasswordVerified()) {
            if (typeof window.showPasswordModal === 'function') window.showPasswordModal();
            const loadingEl = document.getElementById('loading');
            if (loadingEl) loadingEl.style.display = 'none';
            return; // Stop initialization if password required but not verified
        }
    } else {
        console.warn("Password functions (isPasswordProtected/isPasswordVerified) not found. Assuming no password protection.");
    }
    initializePageContent();
});

// Listen for password verification success event
document.addEventListener('passwordVerified', () => {
    const loadingEl = document.getElementById('loading');
    if (loadingEl) loadingEl.style.display = 'flex'; // Show loading after password
    initializePageContent();
});

function initializePageContent() {
    const urlParams = new URLSearchParams(window.location.search);
    const videoUrl = urlParams.get('url');
    const title = urlParams.get('title');
    const sourceCode = urlParams.get('source_code');
    let index = parseInt(urlParams.get('index') || '0', 10);
    const episodesListParam = urlParams.get('episodes'); // Check if episodes are passed via URL

    currentVideoTitle = title || localStorage.getItem('currentVideoTitle') || '未知视频';
    window.currentVideoTitle = currentVideoTitle;

    // Initialize episodes from localStorage or URL parameter
    try {
        let episodesSource = localStorage.getItem('currentEpisodes');
        if (episodesListParam) {
            try {
                currentEpisodes = JSON.parse(decodeURIComponent(episodesListParam));
                console.log("[PlayerApp] Episodes loaded from URL parameter.");
            } catch (e) {
                console.warn("[PlayerApp] Failed to parse episodes from URL, falling back to localStorage.", e);
                currentEpisodes = episodesSource ? JSON.parse(episodesSource) : [];
            }
        } else if (episodesSource) {
            currentEpisodes = JSON.parse(episodesSource);
           // console.log("[PlayerApp] Episodes loaded from localStorage.");
        } else {
            currentEpisodes = [];
         //   console.log("[PlayerApp] No episode data found in URL or localStorage.");
        }
        window.currentEpisodes = currentEpisodes; // Expose globally

        // Validate index
        if (currentEpisodes.length > 0 && (index < 0 || index >= currentEpisodes.length)) {
            console.warn(`[PlayerApp] Invalid episode index ${index} for ${currentEpisodes.length} episodes. Resetting to 0.`);
            index = 0;
            const newUrl = new URL(window.location.href);
            newUrl.searchParams.set('index', index.toString());
            window.history.replaceState({}, '', newUrl.toString());
        }
        currentEpisodeIndex = index;
        window.currentEpisodeIndex = currentEpisodeIndex; // Expose globally

        episodesReversed = localStorage.getItem('episodesReversed') === 'true';
    } catch (e) {
        console.error('[PlayerApp] Error initializing episode data:', e);
        currentEpisodes = []; window.currentEpisodes = [];
        currentEpisodeIndex = 0; window.currentEpisodeIndex = 0;
        episodesReversed = false;
    }

    const siteName = (window.SITE_CONFIG && window.SITE_CONFIG.name) ? window.SITE_CONFIG.name : '播放器';
    document.title = `${currentVideoTitle} - ${siteName}`;
    const videoTitleElement = document.getElementById('video-title');
    if (videoTitleElement) videoTitleElement.textContent = currentVideoTitle;
    
    autoplayEnabled = localStorage.getItem('autoplayEnabled') !== 'false';
    const autoplayToggle = document.getElementById('autoplay-next');
    if (autoplayToggle) {
        autoplayToggle.checked = autoplayEnabled;
        autoplayToggle.addEventListener('change', function(e) {
            autoplayEnabled = e.target.checked;
            localStorage.setItem('autoplayEnabled', autoplayEnabled.toString());
        });
    }

    if (videoUrl) {
        initPlayer(videoUrl, sourceCode);
        const position = urlParams.get('position');
        if (position) {
            setTimeout(() => {
                if (dp && dp.video) {
                    const positionNum = parseInt(position, 10);
                    if (!isNaN(positionNum) && positionNum > 0) {
                        dp.seek(positionNum);
                        if (typeof showPositionRestoreHint === 'function') showPositionRestoreHint(positionNum);
                    }
                }
            }, 1500); // Delay seeking slightly
        }
    } else {
        showError('无效的视频链接');
    }

    updateEpisodeInfo();
    renderEpisodes();
    updateButtonStates();
    updateOrderButton();
    
    setTimeout(() => {
        setupProgressBarPreciseClicks();
    }, 1000); // Delay progress bar setup slightly

    document.addEventListener('keydown', handleKeyboardShortcuts);
    window.addEventListener('beforeunload', saveCurrentProgress);
    document.addEventListener('visibilitychange', function() {
        if (document.visibilityState === 'hidden') {
            saveCurrentProgress();
        }
    });

    // Ensure critical functions from ui.js are globally available
    const checkUICounter = 0;
    const checkUIInterval = setInterval(() => {
         if (typeof window.addToViewingHistory === 'function' || checkUICounter > 20) { // Check for 2s
            clearInterval(checkUIInterval);
             if (typeof window.addToViewingHistory !== 'function') {
                 console.error("UI functions like addToViewingHistory did not become available.");
             }
         }
    }, 100);

    // Bind custom control buttons after a slight delay
    setTimeout(setupPlayerControls, 100);
}

// --- Ad Filtering Loader (Using Legacy Logic) ---
class CustomHlsJsLoader extends Hls.DefaultConfig.loader {
    constructor(config) {
        super(config);
    }

    load(context, config, callbacks) {
        // Ensure PLAYER_CONFIG and its properties are accessible and have default fallbacks
        const adFilteringEnabled = (window.PLAYER_CONFIG && typeof window.PLAYER_CONFIG.adFilteringEnabled !== 'undefined')
            ? window.PLAYER_CONFIG.adFilteringEnabled
            : true; // Default to true if not specified

        if ((context.type === 'manifest' || context.type === 'level') && adFilteringEnabled) {
            const origOnSuccess = callbacks.onSuccess;
            callbacks.onSuccess = (response, stats, context) => {
                if (response.data && typeof response.data === 'string') {
                    response.data = this.filterAdsLegacy(response.data); // Call the legacy filter
                }
                return origOnSuccess(response, stats, context);
            };
        }
        
        // Call the original HLS.js loader's load method
        super.load(context, config, callbacks);
    }

    // Legacy filter logic (removes lines with #EXT-X-DISCONTINUITY)
    filterAdsLegacy(m3u8Content) {
        if (typeof m3u8Content !== 'string' || !m3u8Content) {
            return m3u8Content;
        }

        if (window.PLAYER_CONFIG && window.PLAYER_CONFIG.debugMode) {
         //   console.log('[AdFilter-Legacy] Applying legacy discontinuity filter.');
        }

        const lines = m3u8Content.split('\n');
        const filteredLines = [];
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (!line.includes('#EXT-X-DISCONTINUITY')) {
                filteredLines.push(line);
            } else {
                if (window.PLAYER_CONFIG && window.PLAYER_CONFIG.debugMode) {
                 //   console.log('[AdFilter-Legacy] Removing line:', line);
                }
            }
        }
        return filteredLines.join('\n');
    }

    // Keeping the old method name for backward compatibility, but redirecting to the legacy filter
    filterAdsFromM3U8Legacy(m3u8Content) {
        return this.filterAdsLegacy(m3u8Content);
    }
}

// --- Player Initialization ---
function initPlayer(videoUrl, sourceCode) {
    if (!videoUrl) {
        showError("视频链接无效");
        return;
    }
    if (!Hls || !DPlayer) {
        showError("播放器组件加载失败，请刷新");
        return;
    }

    const debugMode = window.PLAYER_CONFIG && window.PLAYER_CONFIG.debugMode;
    const adFilteringEnabled = (window.PLAYER_CONFIG && typeof window.PLAYER_CONFIG.adFilteringEnabled !== 'undefined')
        ? window.PLAYER_CONFIG.adFilteringEnabled
        : true; // Default to true if not specified

    const hlsConfig = {
        debug: debugMode || false,
        loader: adFilteringEnabled ? CustomHlsJsLoader : Hls.DefaultConfig.loader,
        enableWorker: true, lowLatencyMode: false, backBufferLength: 90, maxBufferLength: 30,
        maxMaxBufferLength: 60, maxBufferSize: 30 * 1000 * 1000, maxBufferHole: 0.5,
        fragLoadingMaxRetry: 6, fragLoadingMaxRetryTimeout: 64000, fragLoadingRetryDelay: 1000,
        manifestLoadingMaxRetry: 3, manifestLoadingRetryDelay: 1000, levelLoadingMaxRetry: 4,
        levelLoadingRetryDelay: 1000, startLevel: -1, abrEwmaDefaultEstimate: 500000,
        abrBandWidthFactor: 0.95, abrBandWidthUpFactor: 0.7, abrMaxWithRealBitrate: true,
        stretchShortVideoTrack: true, appendErrorMaxRetry: 5, liveSyncDurationCount: 3,
        liveDurationInfinity: false
    };

    try {
        dp = new DPlayer({
            container: document.getElementById('dplayer'),
            autoplay: true, theme: '#00ccff', preload: 'auto', loop: false, lang: 'zh-cn',
            hotkey: true, mutex: true, volume: 0.7, screenshot: true, preventClickToggle: false,
            airplay: true, chromecast: true,
            video: {
                url: videoUrl, type: 'hls',
                pic: (window.SITE_CONFIG && window.SITE_CONFIG.logo) || 'https://img.picgo.net/2025/04/12/image362e7d38b4af4a74.png',
                customType: {
                    hls: function(video, player) {
                        if (currentHls && currentHls.destroy) {
                            try { currentHls.destroy(); } catch (e) { console.warn('销毁旧HLS实例时出错:', e); }
                        }
                        const hls = new Hls(hlsConfig);
                        currentHls = hls; window.currentHls = currentHls; // Expose if needed

                        let errorDisplayed = false, errorCount = 0, playbackStarted = false, bufferAppendErrorCount = 0;

                        // Clear previous source element if exists, before attaching HLS
                        const existingSource = video.querySelector('source');
                        if (existingSource) existingSource.remove();
                        // Remove src attribute if set, HLS will manage it
                        if (video.hasAttribute('src')) video.removeAttribute('src');

                        video.addEventListener('playing', function onPlaying() {
                            playbackStarted = true;
                             const loadingEl = document.getElementById('loading'); if(loadingEl) loadingEl.style.display = 'none';
                             const errorEl = document.getElementById('error'); if(errorEl) errorEl.style.display = 'none';
                             // video.removeEventListener('playing', onPlaying); // Maybe keep listening?
                        });
                        
                        video.disableRemotePlayback = false;
                        
                        hls.loadSource(videoUrl); // Load source using the URL passed to initPlayer
                        hls.attachMedia(video);

                        hls.on(Hls.Events.MEDIA_ATTACHED, function() {
                             if (debugMode) console.log("[PlayerApp] HLS Media Attached");
                             // DPlayer usually handles play(), but ensure it happens
                             // setTimeout(() => { player.play().catch(e => console.warn("Autoplay prevented:", e)); }, 100);
                        });
                        
                        hls.on(Hls.Events.MANIFEST_PARSED, function() {
                             if (debugMode) console.log("[PlayerApp] HLS Manifest Parsed");
                             // Don't call video.play() here, let DPlayer handle it after MEDIA_ATTACHED/MANIFEST_PARSED
                        });
                        
                        hls.on(Hls.Events.ERROR, function(event, data) {
                            if (debugMode) console.log('[HLS Event] Error:', event, data);
                            errorCount++;
                            if (data.details === 'bufferAppendError') {
                                bufferAppendErrorCount++;
                                if (debugMode) console.warn(`bufferAppendError occurred ${bufferAppendErrorCount} times`);
                                if (playbackStarted) return;
                                if (bufferAppendErrorCount >= 3) hls.recoverMediaError();
                            }
                            if (data.fatal && !playbackStarted) {
                                console.error('Fatal HLS Error:', data);
                                switch(data.type) {
                                    case Hls.ErrorTypes.NETWORK_ERROR: hls.startLoad(); break;
                                    case Hls.ErrorTypes.MEDIA_ERROR: hls.recoverMediaError(); break;
                                    default:
                                        if (errorCount > 3 && !errorDisplayed) { errorDisplayed = true; showError('视频加载失败 (HLS)'); }
                                        break;
                                }
                            }
                        });
                        const loadingElement = document.getElementById('loading');
                        hls.on(Hls.Events.FRAG_LOADED, () => { if(loadingElement) loadingElement.style.display = 'none'; });
                        hls.on(Hls.Events.LEVEL_LOADED, () => { if(loadingElement) loadingElement.style.display = 'none'; });
                    }
                }
            }
        });
        window.dp = dp; // Expose DPlayer instance globally
        if (debugMode) console.log("[PlayerApp] DPlayer instance created.");

        // Add DPlayer event listeners
        addDPlayerEventListeners();

    } catch (playerError) {
        console.error("Failed to initialize DPlayer:", playerError);
        showError("播放器初始化失败");
    }
}

function addDPlayerEventListeners(){
    if (!dp) return;
    const debugMode = window.PLAYER_CONFIG && window.PLAYER_CONFIG.debugMode;

     dp.on('fullscreen', () => {
        if (debugMode) console.log("[PlayerApp] DPlayer event: fullscreen");
        if (window.screen.orientation && window.screen.orientation.lock) {
            window.screen.orientation.lock('landscape').catch(err => console.warn('屏幕方向锁定失败:', err));
        }
        const fsButton = document.getElementById('fullscreen-button');
        if (fsButton && fsButton.querySelector('svg')) {
            fsButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-minimize"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"></path></svg>`;
            fsButton.setAttribute('aria-label', '退出全屏');
        }
    });

    dp.on('fullscreen_cancel', () => {
         if (debugMode) console.log("[PlayerApp] DPlayer event: fullscreen_cancel");
        if (window.screen.orientation && window.screen.orientation.unlock) {
            window.screen.orientation.unlock();
        }
        const fsButton = document.getElementById('fullscreen-button');
         if (fsButton && fsButton.querySelector('svg')) {
            fsButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-maximize"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path></svg>`;
            fsButton.setAttribute('aria-label', '全屏');
        }
    });
    
    dp.on('loadedmetadata', function() {
         if (debugMode) console.log("[PlayerApp] DPlayer event: loadedmetadata");
        const el = document.getElementById('loading'); if(el) el.style.display = 'none';
        videoHasEnded = false;
        setupProgressBarPreciseClicks();
        setTimeout(saveToHistory, 3000); // Save initial state to history
        startProgressSaveInterval(); // Start periodic saving
    });

    dp.on('error', function(e) {
        console.error("DPlayer error event:", e);
        if (dp.video && dp.video.currentTime > 1) { // Allow errors if playing for >1s
             if (debugMode) console.log('DPlayer error ignored as video was playing.');
            return;
        }
        showError('播放器遇到错误，请检查视频源');
    });

    setupLongPressSpeedControl(); // Setup long press after dp is initialized
    
    dp.on('seeking', function() { if (debugMode) console.log("[PlayerApp] DPlayer event: seeking"); isUserSeeking = true; videoHasEnded = false; });
    dp.on('seeked', function() {
         if (debugMode) console.log("[PlayerApp] DPlayer event: seeked");
        // Adjust if seeked very close to the end
        if (dp.video && dp.video.duration > 0) {
            const timeFromEnd = dp.video.duration - dp.video.currentTime;
            if (timeFromEnd < 0.3 && isUserSeeking) {
                dp.video.currentTime = Math.max(0, dp.video.currentTime - 1);
            }
        }
        setTimeout(() => { isUserSeeking = false; }, 200); // Reset seeking flag after a short delay
    });
    
    dp.on('ended', function() {
         if (debugMode) console.log("[PlayerApp] DPlayer event: ended");
        videoHasEnded = true;
        saveCurrentProgress(); // Ensure final progress is saved
        clearVideoProgress(); // Clear progress for *this specific video*
        if (autoplayEnabled && window.currentEpisodeIndex < window.currentEpisodes.length - 1) {
            if (debugMode) console.log('[PlayerApp] Video ended, autoplaying next.');
            setTimeout(() => {
                if (videoHasEnded && !isUserSeeking) { // Ensure it really ended and user isn't seeking
                     if(typeof window.playNextEpisode === 'function') window.playNextEpisode();
                }
            }, 1000); // 1 second delay before playing next
        } else {
             if (debugMode) console.log('[PlayerApp] Video ended, no next episode or autoplay disabled.');
        }
    });

    dp.on('timeupdate', function() {
        // Reset ended flag if user seeks back after video ended
        if (dp.video && dp.video.duration > 0) {
            if (isUserSeeking && dp.video.currentTime > dp.video.duration * 0.95) {
                videoHasEnded = false;
            }
        }
        // Throttled progress save is handled by initializePageContent interval now
    });

     // Add a timeout to show a message if loading takes too long
    setTimeout(function() {
        // Check if player exists, video exists, AND readyState suggests still loading/not enough data
        if (dp && dp.video && dp.video.readyState < 3 && !videoHasEnded) { 
            const loadingEl = document.getElementById('loading');
            if (loadingEl && loadingEl.style.display !== 'none') {
                loadingEl.innerHTML = `<div class="loading-spinner"></div><div>视频加载时间较长...</div><div style="font-size: 12px; color: #aaa; margin-top: 10px;">如长时间无响应，请尝试其他视频源或刷新</div>`;
                 if (debugMode) console.warn("[PlayerApp] Loading timeout reached.");
            }
        }
    }, 15000); // Increased timeout to 15s

    // Native fullscreen integration for DPlayer's *internal* button actions
    (function(){
        const dplayerElement = document.getElementById('dplayer');
        if(dplayerElement) {
            dp.on('fullscreen', () => { // DPlayer *enters* its fullscreen mode
                 if (document.fullscreenElement || document.webkitFullscreenElement) return; // Already native FS
                 if (dplayerElement.requestFullscreen) dplayerElement.requestFullscreen().catch(err => console.warn('DPlayer internal FS to native failed:', err));
                 else if (dplayerElement.webkitRequestFullscreen) dplayerElement.webkitRequestFullscreen().catch(err => console.warn('DPlayer internal FS to native failed (webkit):', err));
            });
            dp.on('fullscreen_cancel', () => { // DPlayer *exits* its fullscreen mode
                 if (!document.fullscreenElement && !document.webkitFullscreenElement) return; // Not in native FS
                if (document.exitFullscreen) document.exitFullscreen().catch(err => console.warn('DPlayer internal exit FS from native failed:', err));
                else if (document.webkitExitFullscreen) document.webkitExitFullscreen().catch(err => console.warn('DPlayer internal exit FS from native failed (webkit):', err));
            });
        }
    })();
}

// ... existing code ...

// Add this variable with other state variables at the top
let isScreenLocked = false;

// Add this function to handle lock button functionality
function toggleLockScreen() {
    isScreenLocked = !isScreenLocked;
    const playerContainer = document.querySelector('.player-container');
    const lockButton = document.getElementById('lock-button');
    
    if (isScreenLocked) {
        // Lock the screen
        playerContainer.classList.add('player-locked');
        if (lockButton) {
            lockButton.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-unlock">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                    <path d="M7 11V7a5 5 0 0 1 9.9-1"></path>
                </svg>
                <span>解锁</span>
            `;
            lockButton.setAttribute('aria-label', '解锁屏幕');
        }
    } else {
        // Unlock the screen
        playerContainer.classList.remove('player-locked');
        if (lockButton) {
            lockButton.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-lock">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                </svg>
                <span>锁定</span>
            `;
            lockButton.setAttribute('aria-label', '锁定屏幕');
        }
    }
}

function setupPlayerControls() {
    const backButton = document.getElementById('back-button');
    if (backButton) {
        backButton.addEventListener('click', () => { window.location.href = 'index.html'; });
    }

    const fullscreenButton = document.getElementById('fullscreen-button');
    if (fullscreenButton) {
        fullscreenButton.addEventListener('click', () => {
            if (dp && dp.fullScreen && typeof dp.fullScreen.toggle === 'function') {
                dp.fullScreen.toggle();
            } else {
                const playerContainer = document.getElementById('dplayer');
                if (playerContainer) {
                    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
                        if (playerContainer.requestFullscreen) playerContainer.requestFullscreen().catch(err => console.error("Fallback FS error:",err));
                        else if (playerContainer.webkitRequestFullscreen) playerContainer.webkitRequestFullscreen().catch(err => console.error("Fallback FS error (webkit):",err));
                    } else {
                        if (document.exitFullscreen) document.exitFullscreen().catch(err => console.error("Fallback exit FS error:",err));
                        else if (document.webkitExitFullscreen) document.webkitExitFullscreen().catch(err => console.error("Fallback exit FS error (webkit):",err));
                    }
                }
            }
        });
    }
    
    const retryButton = document.getElementById('retry-button');
    if (retryButton) {
        retryButton.addEventListener('click', () => {
            const urlParamsRetry = new URLSearchParams(window.location.search);
            const videoUrlRetry = urlParamsRetry.get('url');
            const sourceCodeRetry = urlParamsRetry.get('source_code');
            if (videoUrlRetry) {
                const errorEl = document.getElementById('error'); if(errorEl) errorEl.style.display = 'none';
                const loadingEl = document.getElementById('loading'); if(loadingEl) loadingEl.style.display = 'flex';
                if (dp && dp.video) {
                  //  console.log("[PlayerApp] Retrying: Switching video.");
                    dp.switchVideo({ url: videoUrlRetry, type: 'hls' });
                    dp.play();
                } else {
                   //  console.log("[PlayerApp] Retrying: Re-initializing player.");
                    initPlayer(videoUrlRetry, sourceCodeRetry);
                }
            } else {
                showError('无法重试，视频链接无效');
            }
        });
    }

    const prevEpisodeBtn = document.getElementById('prev-episode');
    if (prevEpisodeBtn) prevEpisodeBtn.addEventListener('click', window.playPreviousEpisode); // Use global

    const nextEpisodeBtn = document.getElementById('next-episode');
    if (nextEpisodeBtn) nextEpisodeBtn.addEventListener('click', window.playNextEpisode); // Use global

    const orderBtn = document.getElementById('order-button');
    if (orderBtn) orderBtn.addEventListener('click', toggleEpisodeOrder); // toggleEpisodeOrder is local
    
    // Add lock button event listener
    const lockButton = document.getElementById('lock-button');
    if (lockButton) lockButton.addEventListener('click', toggleLockScreen);
}

function showError(message) {
    const debugMode = window.PLAYER_CONFIG && window.PLAYER_CONFIG.debugMode;
    if (dp && dp.video && dp.video.currentTime > 1 && !debugMode) { // Show error even if playing if debug mode is on
        console.warn('Ignoring error as video is playing:', message);
        return;
    }
    const loadingEl = document.getElementById('loading'); if (loadingEl) loadingEl.style.display = 'none';
    const errorElement = document.getElementById('error');
    if (errorElement) {
        const errorTextElement = errorElement.querySelector('.text-xl.font-bold'); // More specific
        if (errorTextElement) errorTextElement.textContent = message;
        else errorElement.children[1].textContent = message; // Fallback
        errorElement.style.display = 'flex';
    }
    if (typeof window.showMessage === 'function') window.showMessage(message, 'error'); // Use global showMessage from ui.js
    else console.error("showMessage function not found. Error:", message);
}

function setupProgressBarPreciseClicks() {
    if (!dp) return;
    // Need to wait slightly for DPlayer to render its progress bar
    setTimeout(() => {
        const progressBar = document.querySelector('#dplayer .dplayer-bar-wrap');
        if (!progressBar) { console.warn('DPlayer进度条元素未找到 (.dplayer-bar-wrap)'); return; }
        progressBar.removeEventListener('click', handleProgressBarClick);
        progressBar.removeEventListener('touchend', handleProgressBarTouch);
        progressBar.addEventListener('click', handleProgressBarClick);
        progressBar.addEventListener('touchend', handleProgressBarTouch);
    }, 500); // Delay setup
}

function handleProgressBarClick(e) {
    if (!dp || !dp.video || dp.video.duration <= 0 || !e.currentTarget) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, offsetX / rect.width));
    const clickTime = percentage * dp.video.duration;
    userClickedPosition = clickTime; 
    dp.seek(clickTime);
}

function handleProgressBarTouch(e) {
    if (!dp || !dp.video || dp.video.duration <= 0 || !e.changedTouches || !e.changedTouches[0] || !e.currentTarget) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const touch = e.changedTouches[0];
    const offsetX = touch.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, offsetX / rect.width));
    const touchTime = percentage * dp.video.duration;
    userClickedPosition = touchTime;
    dp.seek(touchTime);
}

function handleKeyboardShortcuts(e) {
    if (!dp || (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA'))) return;
    let actionText = '', direction = '';
    const debugMode = window.PLAYER_CONFIG && window.PLAYER_CONFIG.debugMode;

    switch (e.key) {
        case 'ArrowLeft':
            if (e.altKey) { if (typeof window.playPreviousEpisode === 'function') window.playPreviousEpisode(); actionText = '上一集'; direction = 'left'; }
            else { dp.seek(Math.max(0, dp.video.currentTime - 5)); actionText = '后退 5s'; direction = 'left'; }
            e.preventDefault(); if (debugMode) console.log(`Keyboard: ${actionText}`); break;
        case 'ArrowRight':
            if (e.altKey) { if (typeof window.playNextEpisode === 'function') window.playNextEpisode(); actionText = '下一集'; direction = 'right'; }
            else { dp.seek(Math.min(dp.video.duration, dp.video.currentTime + 5)); actionText = '前进 5s'; direction = 'right'; }
            e.preventDefault(); if (debugMode) console.log(`Keyboard: ${actionText}`); break;
        case 'PageUp': if (typeof window.playPreviousEpisode === 'function') window.playPreviousEpisode(); actionText = '上一集'; direction = 'left'; e.preventDefault(); if (debugMode) console.log(`Keyboard: ${actionText}`); break;
        case 'PageDown': if (typeof window.playNextEpisode === 'function') window.playNextEpisode(); actionText = '下一集'; direction = 'right'; e.preventDefault(); if (debugMode) console.log(`Keyboard: ${actionText}`); break;
        case ' ': // Spacebar for play/pause
             dp.toggle(); actionText = dp.video.paused ? '暂停' : '播放'; e.preventDefault(); if (debugMode) console.log(`Keyboard: ${actionText}`); break;
        case 'ArrowUp': dp.volume(Math.min(1, dp.video.volume + 0.1)); actionText = `音量 ${Math.round(dp.video.volume*100)}%`; e.preventDefault(); if (debugMode) console.log(`Keyboard: ${actionText}`); break;
        case 'ArrowDown': dp.volume(Math.max(0, dp.video.volume - 0.1)); actionText = `音量 ${Math.round(dp.video.volume*100)}%`; e.preventDefault(); if (debugMode) console.log(`Keyboard: ${actionText}`); break;
        case 'f': dp.fullScreen.toggle(); actionText = '切换全屏'; e.preventDefault(); if (debugMode) console.log(`Keyboard: ${actionText}`); break; // 'f' for fullscreen toggle
    }
    if (actionText && typeof showShortcutHint === 'function') showShortcutHint(actionText, direction);
}

function showShortcutHint(text, direction) {
    const hintElement = document.getElementById('shortcut-hint');
    if (!hintElement) return;
    if (shortcutHintTimeout) clearTimeout(shortcutHintTimeout);
    const keyElement = document.getElementById('shortcut-key');
    const actionElement = document.getElementById('shortcut-action');
    if (keyElement && actionElement) {
        if (direction === 'left') keyElement.innerHTML = '◀';
        else if (direction === 'right') keyElement.innerHTML = '▶';
        else keyElement.innerHTML = '';
        actionElement.textContent = text;
    }
    hintElement.classList.add('show');
    shortcutHintTimeout = setTimeout(() => hintElement.classList.remove('show'), 1500);
}

function setupLongPressSpeedControl() {
    if (!dp) return;
    const playerVideoWrap = document.querySelector('#dplayer .dplayer-video-wrap');
    if (!playerVideoWrap) { console.warn('DPlayer video wrap for long press not found.'); return; }
    
    let longPressTimer = null;
    let originalSpeed = 1.0;
    let speedChangedByLongPress = false;

    playerVideoWrap.addEventListener('touchstart', function(e) {
        if (dp.video.paused) return;
        const touchX = e.touches[0].clientX;
        const rect = playerVideoWrap.getBoundingClientRect();
        if (touchX > rect.left + rect.width / 2) {
            originalSpeed = dp.video.playbackRate;
            longPressTimer = setTimeout(() => {
                if (dp.video.paused) return;
                dp.speed(2.0);
                speedChangedByLongPress = true;
                if(typeof showMessage === 'function') showMessage('播放速度: 2.0x', 'info', 1000);
            }, 300);
        }
    }, { passive: true });

    const endLongPress = function() {
        if (longPressTimer) clearTimeout(longPressTimer);
        longPressTimer = null;
        if (speedChangedByLongPress) {
            dp.speed(originalSpeed);
            speedChangedByLongPress = false;
            if(typeof showMessage === 'function') showMessage(`播放速度: ${originalSpeed.toFixed(1)}x`, 'info', 1000);
        }
    };
    playerVideoWrap.addEventListener('touchend', endLongPress);
    playerVideoWrap.addEventListener('touchcancel', endLongPress);
}


function showPositionRestoreHint(position) {
    if (typeof showMessage !== 'function' || !position || position < 10) return;
    const minutes = Math.floor(position / 60);
    const seconds = Math.floor(position % 60);
    const formattedTime = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    showMessage(`已从 ${formattedTime} 继续播放`, 'info');
}

// This function relies on the #message element in player.html
function showMessage(text, type = 'info', duration = 3000) {
    const messageElement = document.getElementById('message');
    if (!messageElement) { console.warn("Message element not found"); return; }
    
    let bgColorClass = ({error:'bg-red-500', success:'bg-green-500', warning:'bg-yellow-500', info:'bg-blue-500'})[type] || 'bg-blue-500';
    
    // Reset classes and apply new ones
    messageElement.className = `fixed top-4 right-4 p-3 rounded shadow-lg z-[10001] text-sm ${bgColorClass} text-white transition-opacity duration-300 opacity-0`;
    messageElement.textContent = text;
    
    // Force reflow to apply initial opacity-0 before transitioning
    void messageElement.offsetWidth; 
    
    messageElement.classList.remove('opacity-0');
    messageElement.classList.add('opacity-100');

    // Clear previous timeout if exists
    if (messageElement._messageTimeout) {
        clearTimeout(messageElement._messageTimeout);
    }

    messageElement._messageTimeout = setTimeout(() => {
        messageElement.classList.remove('opacity-100');
        messageElement.classList.add('opacity-0');
        messageElement._messageTimeout = null;
    }, duration);
}

function renderEpisodes() {
    const episodeGrid = document.getElementById('episode-grid');
    if (!episodeGrid) return;

    // Show episodes container
    const episodesContainer = document.getElementById('episodes-container');
    if (episodesContainer) episodesContainer.classList.remove('hidden');


    episodeGrid.innerHTML = '';
    
    // Use a document fragment for better performance
    const fragment = document.createDocumentFragment();
    
    // Get episodes in current order (normal or reversed)
    const displayEpisodes = episodesReversed ? [...currentEpisodes].reverse() : [...currentEpisodes];
    
    displayEpisodes.forEach((episodeUrl, displayIndex) => {
        // Calculate the real index in the original array
        const realIndex = episodesReversed ? (currentEpisodes.length - 1 - displayIndex) : displayIndex;
        
        // Use module-scoped currentEpisodeIndex for consistency
        const isActive = realIndex === currentEpisodeIndex;
        
        const episodeButton = document.createElement('button');
        episodeButton.className = `episode-button py-2 px-3 text-xs sm:text-sm rounded transition-colors duration-200 ease-in-out truncate ${isActive ? 'bg-blue-600 text-white episode-active' : 'bg-gray-700 hover:bg-gray-600 text-gray-300'}`;
        episodeButton.textContent = `第${displayIndex + 1}集`;
        episodeButton.setAttribute('aria-label', `播放第${displayIndex + 1}集`);
        episodeButton.setAttribute('data-index', realIndex);
        
        // Use window.playEpisode to ensure we're using the enhanced version
        episodeButton.addEventListener('click', () => {
            if (typeof window.playEpisode === 'function') window.playEpisode(realIndex);
        });
        
        fragment.appendChild(episodeButton);
    });
    
    episodeGrid.appendChild(fragment);
}

function updateEpisodeInfo() {
    const episodeInfoSpan = document.getElementById('episode-info-span');
    if (!episodeInfoSpan) return;
    if (window.currentEpisodes && window.currentEpisodes.length > 1) {
        const totalEpisodes = window.currentEpisodes.length;
        const currentNumber = window.currentEpisodeIndex + 1;
        episodeInfoSpan.textContent = `第 ${currentNumber} 集 / 共 ${totalEpisodes} 集`;
    } else {
        episodeInfoSpan.textContent = '';
    }
}

// Add these functions to player_app.js

function toggleEpisodeOrder() {
    episodesReversed = !episodesReversed;
    localStorage.setItem('episodesReversed', episodesReversed.toString());
    updateOrderButton();
    renderEpisodes();
}

function updateOrderButton() {
    const orderButton = document.getElementById('order-button');
    const episodesCount = document.getElementById('episodes-count');
    
    if (orderButton) {
        orderButton.textContent = episodesReversed ? '倒序' : '正序';
        orderButton.setAttribute('aria-label', episodesReversed ? '切换为正序' : '切换为倒序');
    }
    
    if (episodesCount) {
        episodesCount.textContent = `共 ${currentEpisodes.length} 集`;
    }
}

// Add event listener for the order button in the initializePageContent function
function initializePageContent() {
    const urlParams = new URLSearchParams(window.location.search);
    const videoUrl = urlParams.get('url');
    const title = urlParams.get('title');
    const sourceCode = urlParams.get('source_code');
    let index = parseInt(urlParams.get('index') || '0', 10);
    const episodesListParam = urlParams.get('episodes'); // Check if episodes are passed via URL

    currentVideoTitle = title || localStorage.getItem('currentVideoTitle') || '未知视频';
    window.currentVideoTitle = currentVideoTitle;

    // Initialize episodes from localStorage or URL parameter
    try {
        let episodesSource = localStorage.getItem('currentEpisodes');
        if (episodesListParam) {
            try {
                currentEpisodes = JSON.parse(decodeURIComponent(episodesListParam));
                console.log("[PlayerApp] Episodes loaded from URL parameter.");
            } catch (e) {
                console.warn("[PlayerApp] Failed to parse episodes from URL, falling back to localStorage.", e);
                currentEpisodes = episodesSource ? JSON.parse(episodesSource) : [];
            }
        } else if (episodesSource) {
            currentEpisodes = JSON.parse(episodesSource);
           // console.log("[PlayerApp] Episodes loaded from localStorage.");
        } else {
            currentEpisodes = [];
         //   console.log("[PlayerApp] No episode data found in URL or localStorage.");
        }
        window.currentEpisodes = currentEpisodes; // Expose globally

        // Validate index
        if (currentEpisodes.length > 0 && (index < 0 || index >= currentEpisodes.length)) {
            console.warn(`[PlayerApp] Invalid episode index ${index} for ${currentEpisodes.length} episodes. Resetting to 0.`);
            index = 0;
            const newUrl = new URL(window.location.href);
            newUrl.searchParams.set('index', index.toString());
            window.history.replaceState({}, '', newUrl.toString());
        }
        currentEpisodeIndex = index;
        window.currentEpisodeIndex = currentEpisodeIndex; // Expose globally

        episodesReversed = localStorage.getItem('episodesReversed') === 'true';
    } catch (e) {
        console.error('[PlayerApp] Error initializing episode data:', e);
        currentEpisodes = []; window.currentEpisodes = [];
        currentEpisodeIndex = 0; window.currentEpisodeIndex = 0;
        episodesReversed = false;
    }

    const siteName = (window.SITE_CONFIG && window.SITE_CONFIG.name) ? window.SITE_CONFIG.name : '播放器';
    document.title = `${currentVideoTitle} - ${siteName}`;
    const videoTitleElement = document.getElementById('video-title');
    if (videoTitleElement) videoTitleElement.textContent = currentVideoTitle;
    
    autoplayEnabled = localStorage.getItem('autoplayEnabled') !== 'false';
    const autoplayToggle = document.getElementById('autoplay-next');
    if (autoplayToggle) {
        autoplayToggle.checked = autoplayEnabled;
        autoplayToggle.addEventListener('change', function(e) {
            autoplayEnabled = e.target.checked;
            localStorage.setItem('autoplayEnabled', autoplayEnabled.toString());
        });
    }

    if (videoUrl) {
        initPlayer(videoUrl, sourceCode);
        const position = urlParams.get('position');
        if (position) {
            setTimeout(() => {
                if (dp && dp.video) {
                    const positionNum = parseInt(position, 10);
                    if (!isNaN(positionNum) && positionNum > 0) {
                        dp.seek(positionNum);
                        if (typeof showPositionRestoreHint === 'function') showPositionRestoreHint(positionNum);
                    }
                }
            }, 1500); // Delay seeking slightly
        }
    } else {
        showError('无效的视频链接');
    }

    updateEpisodeInfo();
    renderEpisodes();
    updateButtonStates();
    updateOrderButton();
    
    // Order button event listener is now in setupPlayerControls
    
    setTimeout(() => {
        setupProgressBarPreciseClicks();
    }, 1000); // Delay progress bar setup slightly

    document.addEventListener('keydown', handleKeyboardShortcuts);
    window.addEventListener('beforeunload', saveCurrentProgress);
    document.addEventListener('visibilitychange', function() {
        if (document.visibilityState === 'hidden') {
            saveCurrentProgress();
        }
    });

    // Ensure critical functions from ui.js are globally available
    const checkUICounter = 0;
    const checkUIInterval = setInterval(() => {
         if (typeof window.addToViewingHistory === 'function' || checkUICounter > 20) { // Check for 2s
            clearInterval(checkUIInterval);
             if (typeof window.addToViewingHistory !== 'function') {
                 console.error("UI functions like addToViewingHistory did not become available.");
             }
         }
    }, 100);

    // Bind custom control buttons after a slight delay
    setTimeout(setupPlayerControls, 100);
}

function showError(message) {
    const debugMode = window.PLAYER_CONFIG && window.PLAYER_CONFIG.debugMode;
    if (dp && dp.video && dp.video.currentTime > 1 && !debugMode) { // Show error even if playing if debug mode is on
        console.warn('Ignoring error as video is playing:', message);
        return;
    }
    const loadingEl = document.getElementById('loading'); if (loadingEl) loadingEl.style.display = 'none';
    const errorElement = document.getElementById('error');
    if (errorElement) {
        const errorTextElement = errorElement.querySelector('.text-xl.font-bold'); // More specific
        if (errorTextElement) errorTextElement.textContent = message;
        else errorElement.children[1].textContent = message; // Fallback
        errorElement.style.display = 'flex';
    }
    if (typeof window.showMessage === 'function') window.showMessage(message, 'error'); // Use global showMessage from ui.js
    else console.error("showMessage function not found. Error:", message);
}

function setupProgressBarPreciseClicks() {
    if (!dp) return;
    // Need to wait slightly for DPlayer to render its progress bar
    setTimeout(() => {
        const progressBar = document.querySelector('#dplayer .dplayer-bar-wrap');
        if (!progressBar) { console.warn('DPlayer进度条元素未找到 (.dplayer-bar-wrap)'); return; }
        progressBar.removeEventListener('click', handleProgressBarClick);
        progressBar.removeEventListener('touchend', handleProgressBarTouch);
        progressBar.addEventListener('click', handleProgressBarClick);
        progressBar.addEventListener('touchend', handleProgressBarTouch);
    }, 500); // Delay setup
}

function handleProgressBarClick(e) {
    if (!dp || !dp.video || dp.video.duration <= 0 || !e.currentTarget) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, offsetX / rect.width));
    const clickTime = percentage * dp.video.duration;
    userClickedPosition = clickTime; 
    dp.seek(clickTime);
}

function handleProgressBarTouch(e) {
    if (!dp || !dp.video || dp.video.duration <= 0 || !e.changedTouches || !e.changedTouches[0] || !e.currentTarget) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const touch = e.changedTouches[0];
    const offsetX = touch.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, offsetX / rect.width));
    const touchTime = percentage * dp.video.duration;
    userClickedPosition = touchTime;
    dp.seek(touchTime);
}

function handleKeyboardShortcuts(e) {
    if (!dp || (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA'))) return;
    let actionText = '', direction = '';
    const debugMode = window.PLAYER_CONFIG && window.PLAYER_CONFIG.debugMode;

    switch (e.key) {
        case 'ArrowLeft':
            if (e.altKey) { if (typeof window.playPreviousEpisode === 'function') window.playPreviousEpisode(); actionText = '上一集'; direction = 'left'; }
            else { dp.seek(Math.max(0, dp.video.currentTime - 5)); actionText = '后退 5s'; direction = 'left'; }
            e.preventDefault(); if (debugMode) console.log(`Keyboard: ${actionText}`); break;
        case 'ArrowRight':
            if (e.altKey) { if (typeof window.playNextEpisode === 'function') window.playNextEpisode(); actionText = '下一集'; direction = 'right'; }
            else { dp.seek(Math.min(dp.video.duration, dp.video.currentTime + 5)); actionText = '前进 5s'; direction = 'right'; }
            e.preventDefault(); if (debugMode) console.log(`Keyboard: ${actionText}`); break;
        case 'PageUp': if (typeof window.playPreviousEpisode === 'function') window.playPreviousEpisode(); actionText = '上一集'; direction = 'left'; e.preventDefault(); if (debugMode) console.log(`Keyboard: ${actionText}`); break;
        case 'PageDown': if (typeof window.playNextEpisode === 'function') window.playNextEpisode(); actionText = '下一集'; direction = 'right'; e.preventDefault(); if (debugMode) console.log(`Keyboard: ${actionText}`); break;
        case ' ': // Spacebar for play/pause
             dp.toggle(); actionText = dp.video.paused ? '暂停' : '播放'; e.preventDefault(); if (debugMode) console.log(`Keyboard: ${actionText}`); break;
        case 'ArrowUp': dp.volume(Math.min(1, dp.video.volume + 0.1)); actionText = `音量 ${Math.round(dp.video.volume*100)}%`; e.preventDefault(); if (debugMode) console.log(`Keyboard: ${actionText}`); break;
        case 'ArrowDown': dp.volume(Math.max(0, dp.video.volume - 0.1)); actionText = `音量 ${Math.round(dp.video.volume*100)}%`; e.preventDefault(); if (debugMode) console.log(`Keyboard: ${actionText}`); break;
        case 'f': dp.fullScreen.toggle(); actionText = '切换全屏'; e.preventDefault(); if (debugMode) console.log(`Keyboard: ${actionText}`); break; // 'f' for fullscreen toggle
    }
    if (actionText && typeof showShortcutHint === 'function') showShortcutHint(actionText, direction);
}

function showShortcutHint(text, direction) {
    const hintElement = document.getElementById('shortcut-hint');
    if (!hintElement) return;
    if (shortcutHintTimeout) clearTimeout(shortcutHintTimeout);
    const keyElement = document.getElementById('shortcut-key');
    const actionElement = document.getElementById('shortcut-action');
    if (keyElement && actionElement) {
        if (direction === 'left') keyElement.innerHTML = '◀';
        else if (direction === 'right') keyElement.innerHTML = '▶';
        else keyElement.innerHTML = '';
        actionElement.textContent = text;
    }
    hintElement.classList.add('show');
    shortcutHintTimeout = setTimeout(() => hintElement.classList.remove('show'), 1500);
}

function setupLongPressSpeedControl() {
    if (!dp) return;
    const playerVideoWrap = document.querySelector('#dplayer .dplayer-video-wrap');
    if (!playerVideoWrap) { console.warn('DPlayer video wrap for long press not found.'); return; }
    
    let longPressTimer = null;
    let originalSpeed = 1.0;
    let speedChangedByLongPress = false;

    playerVideoWrap.addEventListener('touchstart', function(e) {
        if (dp.video.paused) return;
        const touchX = e.touches[0].clientX;
        const rect = playerVideoWrap.getBoundingClientRect();
        if (touchX > rect.left + rect.width / 2) {
            originalSpeed = dp.video.playbackRate;
            longPressTimer = setTimeout(() => {
                if (dp.video.paused) return;
                dp.speed(2.0);
                speedChangedByLongPress = true;
                if(typeof showMessage === 'function') showMessage('播放速度: 2.0x', 'info', 1000);
            }, 300);
        }
    }, { passive: true });

    const endLongPress = function() {
        if (longPressTimer) clearTimeout(longPressTimer);
        longPressTimer = null;
        if (speedChangedByLongPress) {
            dp.speed(originalSpeed);
            speedChangedByLongPress = false;
            if(typeof showMessage === 'function') showMessage(`播放速度: ${originalSpeed.toFixed(1)}x`, 'info', 1000);
        }
    };
    playerVideoWrap.addEventListener('touchend', endLongPress);
    playerVideoWrap.addEventListener('touchcancel', endLongPress);
}


function showPositionRestoreHint(position) {
    if (typeof showMessage !== 'function' || !position || position < 10) return;
    const minutes = Math.floor(position / 60);
    const seconds = Math.floor(position % 60);
    const formattedTime = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    showMessage(`已从 ${formattedTime} 继续播放`, 'info');
}

// This function relies on the #message element in player.html
function showMessage(text, type = 'info', duration = 3000) {
    const messageElement = document.getElementById('message');
    if (!messageElement) { console.warn("Message element not found"); return; }
    
    let bgColorClass = ({error:'bg-red-500', success:'bg-green-500', warning:'bg-yellow-500', info:'bg-blue-500'})[type] || 'bg-blue-500';
    
    // Reset classes and apply new ones
    messageElement.className = `fixed top-4 right-4 p-3 rounded shadow-lg z-[10001] text-sm ${bgColorClass} text-white transition-opacity duration-300 opacity-0`;
    messageElement.textContent = text;
    
    // Force reflow to apply initial opacity-0 before transitioning
    void messageElement.offsetWidth; 
    
    messageElement.classList.remove('opacity-0');
    messageElement.classList.add('opacity-100');

    // Clear previous timeout if exists
    if (messageElement._messageTimeout) {
        clearTimeout(messageElement._messageTimeout);
    }

    messageElement._messageTimeout = setTimeout(() => {
        messageElement.classList.remove('opacity-100');
        messageElement.classList.add('opacity-0');
        messageElement._messageTimeout = null;
    }, duration);
}

function renderEpisodes() {
    const episodeGrid = document.getElementById('episode-grid');
    if (!episodeGrid) return;
    
    // Show episodes container
    const episodesContainer = document.getElementById('episodes-container');
    if (episodesContainer) episodesContainer.classList.remove('hidden');
    
    // Clear existing episodes
    episodeGrid.innerHTML = '';
    
    if (!currentEpisodes || currentEpisodes.length === 0) {
        episodeGrid.innerHTML = '<div class="col-span-full text-center text-gray-400 py-4">没有可用的剧集</div>';
        return;
    }
    
    // Create a copy of episodes array to avoid modifying the original
    let episodes = [...currentEpisodes];
    
    // Reverse if needed
    if (episodesReversed) {
        episodes = episodes.reverse();
    }
    
    // Render each episode button
    episodes.forEach((_, idx) => {
        const episodeIndex = episodesReversed ? currentEpisodes.length - 1 - idx : idx;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = episodeIndex === currentEpisodeIndex 
            ? 'p-2 rounded bg-blue-600 text-white episode-active' 
            : 'p-2 rounded bg-gray-800 hover:bg-gray-700 text-gray-300';
        button.textContent = `${idx + 1}`;
        button.setAttribute('aria-label', `第 ${idx + 1} 集`);
        button.addEventListener('click', () => playEpisode(episodeIndex));
        
        episodeGrid.appendChild(button);
    });
}

function updateEpisodeInfo() {
    const episodeInfoSpan = document.getElementById('episode-info-span');
    if (!episodeInfoSpan) return;
    if (window.currentEpisodes && window.currentEpisodes.length > 1) {
        const totalEpisodes = window.currentEpisodes.length;
        const currentNumber = window.currentEpisodeIndex + 1;
        episodeInfoSpan.textContent = `第 ${currentNumber} 集 / 共 ${totalEpisodes} 集`;
    } else {
        episodeInfoSpan.textContent = '';
    }
}

function playPreviousEpisode() {
    if (window.currentEpisodeIndex > 0) {
        if (typeof window.playEpisode === 'function') window.playEpisode(window.currentEpisodeIndex - 1);
    } else {
        if(typeof showMessage === 'function') showMessage('已经是第一集了', 'info');
    }
}
// Expose globally if needed by shortcuts or other potential callers
window.playPreviousEpisode = playPreviousEpisode;

function playNextEpisode() {
    if (window.currentEpisodeIndex < window.currentEpisodes.length - 1) {
         if (typeof window.playEpisode === 'function') window.playEpisode(window.currentEpisodeIndex + 1);
    } else {
        if(typeof showMessage === 'function') showMessage('已经是最后一集了', 'info');
    }
}
// Expose globally if needed by shortcuts or other potential callers
window.playNextEpisode = playNextEpisode;

function updateButtonStates() {
    const prevButton = document.getElementById('prev-episode');
    const nextButton = document.getElementById('next-episode');
    const totalEpisodes = window.currentEpisodes ? window.currentEpisodes.length : 0;

    if (prevButton) {
        prevButton.disabled = window.currentEpisodeIndex <= 0;
        prevButton.classList.toggle('opacity-50', prevButton.disabled);
        prevButton.classList.toggle('cursor-not-allowed', prevButton.disabled);
    }
    if (nextButton) {
        nextButton.disabled = window.currentEpisodeIndex >= totalEpisodes - 1;
        nextButton.classList.toggle('opacity-50', nextButton.disabled);
        nextButton.classList.toggle('cursor-not-allowed', nextButton.disabled);
    }
}

function saveCurrentProgress() {
    if (!dp || !dp.video || isUserSeeking || videoHasEnded || !window.addToViewingHistory) return;
    const currentTime = dp.video.currentTime;
    const duration = dp.video.duration;

    if (currentTime > 5 && duration > 0 && currentTime < duration * 0.98) {
        try {
            const videoInfo = {
                title: currentVideoTitle,
                url: window.currentEpisodes[window.currentEpisodeIndex],
                episodeIndex: window.currentEpisodeIndex,
                playbackPosition: Math.floor(currentTime),
                duration: Math.floor(duration),
                timestamp: Date.now(),
                sourceName: new URLSearchParams(window.location.search).get('source') || '',
                sourceCode: new URLSearchParams(window.location.search).get('source_code') || '',
                episodes: window.currentEpisodes
            };
            window.addToViewingHistory(videoInfo); // Call global function from ui.js
        } catch (e) {
            console.error('保存播放进度失败:', e);
        }
    }
}

function startProgressSaveInterval() {
    if (progressSaveInterval) clearInterval(progressSaveInterval);
    progressSaveInterval = setInterval(saveCurrentProgress, 30000); // Save every 30 seconds
}

// Save to history (likely redundant if saveCurrentProgress called often, but keep for now)
function saveToHistory() {
    if (!dp || !dp.video || !currentVideoTitle || !window.addToViewingHistory) return;
    try {
        const videoInfo = {
            title: currentVideoTitle,
            url: window.currentEpisodes[window.currentEpisodeIndex],
            episodeIndex: window.currentEpisodeIndex,
            episodes: window.currentEpisodes,
            playbackPosition: Math.floor(dp.video.currentTime),
            duration: Math.floor(dp.video.duration),
            timestamp: Date.now(),
            sourceName: new URLSearchParams(window.location.search).get('source') || '',
            sourceCode: new URLSearchParams(window.location.search).get('source_code') || ''
        };
        window.addToViewingHistory(videoInfo);
    } catch (e) {
        console.error('保存到历史记录失败:', e);
    }
}

function clearVideoProgress() {
    const progressKey = `videoProgress_${getVideoId()}`;
    try {
        localStorage.removeItem(progressKey);
        if (window.PLAYER_CONFIG && window.PLAYER_CONFIG.debugMode) console.log('已清除播放进度记录 for ' + progressKey);
    } catch (e) { console.error('清除播放进度记录失败', e); }
}

function getVideoId() {
    // Use a combination that's less likely to conflict if title isn't unique enough
     const sourceCode = new URLSearchParams(window.location.search).get('source_code') || 'unknown';
    return `${encodeURIComponent(currentVideoTitle)}_${sourceCode}_ep${window.currentEpisodeIndex}`;
}

// Expose playEpisode globally *after* it's defined
function playEpisode(index) {
    if (index < 0 || index >= currentEpisodes.length) {
        console.warn(`[PlayerApp] Invalid episode index: ${index}`);
        return;
    }
    
    // Update global index immediately after validation
    currentEpisodeIndex = index;
    window.currentEpisodeIndex = index; // Ensure global variable is updated for preloading
    
    const episodeUrl = currentEpisodes[index];
    if (!episodeUrl) {
        console.warn(`[PlayerApp] No URL found for episode index: ${index}`);
        return;
    }
    
    // Update URL parameter without reloading
    const newUrl = new URL(window.location.href);
    newUrl.searchParams.set('index', index.toString());
    window.history.replaceState({}, '', newUrl.toString());
    
    // Update localStorage
    localStorage.setItem('currentEpisodeIndex', index.toString());
    
    // Update UI
    updateEpisodeInfo();
    updateButtonStates();
    renderEpisodes(); // Ensure episode list is re-rendered with correct highlighting
    
    // Play the episode
    if (dp) {
        const loadingEl = document.getElementById('loading');
        if (loadingEl) loadingEl.style.display = 'flex';
        
        // Clear any existing progress for the new episode
        clearVideoProgress();
        
        // Switch video source
        dp.switchVideo({ url: episodeUrl, type: 'hls' });
        dp.play();
    } else {
        console.error('[PlayerApp] DPlayer instance not available for playEpisode');
        initPlayer(episodeUrl);
    }
    
    // Save to history
    saveToHistory();
}