// File: js/player_app.js
// Add this helper function at the top of js/player_app.js
function SQuery(selector, callback, timeout = 5000, interval = 100) {
    let elapsedTime = 0;
    const check = () => {
        const element = document.querySelector(selector); // Using querySelector
        if (element) {
            // console.log(`[SQuery] Element '${selector}' found by SQuery.`);
            callback(element);
        } else {
            elapsedTime += interval;
            if (elapsedTime < timeout) {
                setTimeout(check, interval);
            } else {
                console.error(`[SQuery] Element '${selector}' NOT FOUND by SQuery after ${timeout}ms.`);
                // You could call your global showError or showToast here
                // Example: if (typeof showError === 'function') showError(`关键UI元素 '${selector}' 未找到`);
            }
        }
    };
    check();
}
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
let isScreenLocked = false;

// 将需要在 player_preload.js 中访问的变量挂载到 window
window.currentEpisodes = [];
window.currentEpisodeIndex = 0;
// window.PLAYER_CONFIG is set by config.js
// window.dp will be set after DPlayer initialization
// window.playEpisode will be set later

// In js/player_app.js
document.addEventListener('DOMContentLoaded', function () {
    //  console.log('[PlayerApp Debug] DOMContentLoaded event fired.');
    const testGridElement = document.getElementById('episode-grid');
    if (testGridElement) {
        //   console.log('[PlayerApp Debug] SUCCESS: episode-grid was FOUND immediately on DOMContentLoaded.');
    } else {
        console.error('[PlayerApp Debug] FAILURE: episode-grid was NOT FOUND immediately on DOMContentLoaded.');
    }

    // Existing password check and initializePageContent call
    if (typeof window.isPasswordVerified === 'function' && typeof window.isPasswordProtected === 'function') {
        if (window.isPasswordProtected() && !window.isPasswordVerified()) {
            if (typeof window.showPasswordModal === 'function') window.showPasswordModal();
            const loadingEl = document.getElementById('loading');
            if (loadingEl) loadingEl.style.display = 'none';
            return;
        }
    } else {
        console.warn("Password functions (isPasswordProtected/isPasswordVerified) not found. Assuming no password protection.");
    }
    initializePageContent();
});

// Listen for password verification success event
document.addEventListener('passwordVerified', () => {
    const loadingEl = document.getElementById('loading');
    if (loadingEl) {
        loadingEl.style.display = 'flex';              // 原来的
        document.documentElement.classList.add('show-loading'); // ← 新增
    }
    initializePageContent();
});

function initializePageContent() {
    //  console.log('[PlayerApp Debug] initializePageContent starting...');
    const urlParams = new URLSearchParams(window.location.search);
    const videoUrl = urlParams.get('url');
    let title = urlParams.get('title');
    // 把可能的多层编码全部拆掉
    function fullyDecode(str) {
        try {
            let prev, cur = str;
            do { prev = cur; cur = decodeURIComponent(cur); } while (cur !== prev);
            return cur;
        } catch { return str; }   // 遇到非法编码就放弃
    }
    title = title ? fullyDecode(title) : '';
    const sourceCode = urlParams.get('source_code');
    // 兼容旧链接里的 ep=
    let index = parseInt(
        urlParams.get('index') || urlParams.get('ep') || '0',
        10
    );

    // 先用 URL⟨episodes=⟩ → 再退回 localStorage（双保险）
    const episodesListParam = urlParams.get('episodes');

    currentVideoTitle = title || localStorage.getItem('currentVideoTitle') || '未知视频';
    window.currentVideoTitle = currentVideoTitle;

    // Initialize episodes from localStorage or URL parameter
    try {
        let episodesSource = localStorage.getItem('currentEpisodes');
        if (episodesListParam) {
            try {
                currentEpisodes = JSON.parse(decodeURIComponent(episodesListParam));
                //  console.log("[PlayerApp] Episodes loaded from URL parameter.");
            } catch (e) {
                console.warn("[PlayerApp] Failed to parse episodes from URL, falling back to localStorage.", e);
                currentEpisodes = episodesSource ? JSON.parse(episodesSource) : [];
            }
        } else if (episodesSource) {
            currentEpisodes = JSON.parse(episodesSource);
            //  console.log("[PlayerApp] Episodes loaded from localStorage.");
        } else {
            currentEpisodes = [];
            //  console.log("[PlayerApp] No episode data found in URL or localStorage.");
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
    const autoplayToggle =
        document.getElementById('autoplay-next') ||
        document.getElementById('autoplayToggle');
    if (autoplayToggle) {
        autoplayToggle.checked = autoplayEnabled;
        autoplayToggle.addEventListener('change', function (e) {
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
    // Use requestAnimationFrame for initial render to ensure DOM is ready
    requestAnimationFrame(() => {
        renderEpisodes();
        //   console.log('[PlayerApp] renderEpisodes called via requestAnimationFrame in initializePageContent');
    });
    updateButtonStates();
    updateOrderButton();

    setTimeout(() => {
        setupProgressBarPreciseClicks();
    }, 1000); // Delay progress bar setup slightly

    document.addEventListener('keydown', handleKeyboardShortcuts);
    window.addEventListener('beforeunload', saveCurrentProgress);
    document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'hidden') {
            saveCurrentProgress();
        }
    });

    // Ensure critical functions from ui.js are globally available
    let checkUICounter = 0; // Declared with let
    const checkUIInterval = setInterval(() => {
        if (typeof window.addToViewingHistory === 'function' || checkUICounter > 20) { // Check for 2s
            clearInterval(checkUIInterval);
            if (typeof window.addToViewingHistory !== 'function') {
                console.error("UI functions like addToViewingHistory did not become available.");
            }
        }
        checkUICounter++; // Increment counter
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
                    //     console.log('[AdFilter-Legacy] Removing line:', line);
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
                // pic: (window.SITE_CONFIG && window.SITE_CONFIG.logo) || 'https://img.picgo.net/2025/04/12/image362e7d38b4af4a74.png',
                customType: {
                    hls: function (video, player) {
                        if (currentHls && currentHls.destroy) {
                            try { currentHls.destroy(); } catch (e) { console.warn('销毁旧HLS实例时出错:', e); }
                        }
                        const hls = new Hls(hlsConfig);
                        currentHls = hls; window.currentHls = currentHls; // Expose if needed

                        let errorDisplayed = false, errorCount = 0, playbackStarted = false, bufferAppendErrorCount = 0;

                        video.addEventListener('playing', function onPlaying() {
                            playbackStarted = true;
                            const loadingEl = document.getElementById('loading'); if (loadingEl) loadingEl.style.display = 'none';
                            const errorEl = document.getElementById('error'); if (errorEl) errorEl.style.display = 'none';
                            // video.removeEventListener('playing', onPlaying); // Maybe keep listening?
                        });

                        video.disableRemotePlayback = false;
                        // ★ 先拿到“正确的新地址”
                        const src = player.options && player.options.video
                            ? player.options.video.url
                            : '';           // 理论上一定有

                        // ★ 然后再去清理旧 DOM，避免把新地址弄丢
                        const existingSource = video.querySelector('source');
                        if (existingSource) existingSource.remove();
                        if (video.hasAttribute('src')) video.removeAttribute('src');
                        hls.loadSource(src);
                        hls.attachMedia(video);

                        hls.on(Hls.Events.MEDIA_ATTACHED, function () {
                            if (debugMode) console.log("[PlayerApp] HLS Media Attached");
                            // DPlayer usually handles play(), but ensure it happens
                            // setTimeout(() => { player.play().catch(e => console.warn("Autoplay prevented:", e)); }, 100);
                        });

                        hls.on(Hls.Events.MANIFEST_PARSED, function () {
                            if (debugMode) console.log("[PlayerApp] HLS Manifest Parsed");
                            // Don't call video.play() here, let DPlayer handle it after MEDIA_ATTACHED/MANIFEST_PARSED
                        });

                        hls.on(Hls.Events.ERROR, function (event, data) {
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
                                switch (data.type) {
                                    case Hls.ErrorTypes.NETWORK_ERROR: hls.startLoad(); break;
                                    case Hls.ErrorTypes.MEDIA_ERROR: hls.recoverMediaError(); break;
                                    default:
                                        if (errorCount > 3 && !errorDisplayed) { errorDisplayed = true; showError('视频加载失败 (HLS)'); }
                                        break;
                                }
                            }
                        });
                        const loadingElement = document.getElementById('loading');
                        hls.on(Hls.Events.FRAG_LOADED, () => { if (loadingElement) loadingElement.style.display = 'none'; });
                        hls.on(Hls.Events.LEVEL_LOADED, () => { if (loadingElement) loadingElement.style.display = 'none'; });
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

function addDPlayerEventListeners() {
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

    dp.on('loadedmetadata', function () {
        if (debugMode) console.log("[PlayerApp] DPlayer event: loadedmetadata");
        const el = document.getElementById('loading');
        if (el) {
            el.style.display = 'none';                     // 原来的
            document.documentElement.classList.remove('show-loading'); // ← 新增
        }
        videoHasEnded = false;
        setupProgressBarPreciseClicks();
        setTimeout(saveToHistory, 3000); // Save initial state to history
        startProgressSaveInterval(); // Start periodic saving
    });

    dp.on('error', function (e) {
        console.error("DPlayer error event:", e);
        if (dp.video && dp.video.currentTime > 1) { // Allow errors if playing for >1s
            if (debugMode) console.log('DPlayer error ignored as video was playing.');
            return;
        }
        showError('播放器遇到错误，请检查视频源');
    });

    setupLongPressSpeedControl(); // Setup long press after dp is initialized

    dp.on('seeking', function () { if (debugMode) console.log("[PlayerApp] DPlayer event: seeking"); isUserSeeking = true; videoHasEnded = false; });
    dp.on('seeked', function () {
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

    dp.on('ended', function () {
        videoHasEnded = true;
        saveCurrentProgress(); // Ensure final progress is saved
        clearVideoProgress(); // Clear progress for *this specific video*
        if (!autoplayEnabled) return;       // 用户关掉了自动连播
        const nextIdx = currentEpisodeIndex + 1;   // 始终 +1（上一条回复已统一）
        if (nextIdx < currentEpisodes.length) {
            setTimeout(() => {
                // 再确认一下确实播完 & 没有人在拖动
                if (videoHasEnded && !isUserSeeking) playEpisode(nextIdx);
            }, 1000);                       // 1 s 延迟，防误触
        } else {
            if (debugMode) console.log('[PlayerApp] 已到最后一集，自动连播停止');
        }
    });

    dp.on('timeupdate', function () {
        // Reset ended flag if user seeks back after video ended
        if (dp.video && dp.video.duration > 0) {
            if (isUserSeeking && dp.video.currentTime > dp.video.duration * 0.95) {
                videoHasEnded = false;
            }
        }
        // Throttled progress save is handled by initializePageContent interval now
    });

    // Add a timeout to show a message if loading takes too long
    setTimeout(function () {
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
    (function () {
        const dplayerElement = document.getElementById('dplayer');
        if (dplayerElement) {
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
                        if (playerContainer.requestFullscreen) playerContainer.requestFullscreen().catch(err => console.error("Fallback FS error:", err));
                        else if (playerContainer.webkitRequestFullscreen) playerContainer.webkitRequestFullscreen().catch(err => console.error("Fallback FS error (webkit):", err));
                    } else {
                        if (document.exitFullscreen) document.exitFullscreen().catch(err => console.error("Fallback exit FS error:", err));
                        else if (document.webkitExitFullscreen) document.webkitExitFullscreen().catch(err => console.error("Fallback exit FS error (webkit):", err));
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
                const errorEl = document.getElementById('error'); if (errorEl) errorEl.style.display = 'none';
                const loadingEl = document.getElementById('loading'); if (loadingEl) loadingEl.style.display = 'flex';
                if (dp && dp.video) {
                    //  console.log("[PlayerApp] Retrying: Switching video.");
                    dp.switchVideo({ url: videoUrlRetry, type: 'hls' });
                    dp.play();
                } else {
                    //    console.log("[PlayerApp] Retrying: Re-initializing player.");
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
    if (isScreenLocked) return; // Ignore shortcuts if screen is locked
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
        case 'ArrowUp': dp.volume(Math.min(1, dp.video.volume + 0.1)); actionText = `音量 ${Math.round(dp.video.volume * 100)}%`; e.preventDefault(); if (debugMode) console.log(`Keyboard: ${actionText}`); break;
        case 'ArrowDown': dp.volume(Math.max(0, dp.video.volume - 0.1)); actionText = `音量 ${Math.round(dp.video.volume * 100)}%`; e.preventDefault(); if (debugMode) console.log(`Keyboard: ${actionText}`); break;
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
        else keyElement.innerHTML = ''; // Clear for actions like play/pause/volume
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

    playerVideoWrap.addEventListener('touchstart', function (e) {
        if (isScreenLocked || dp.video.paused) return; // Ignore if screen locked or paused
        const touchX = e.touches[0].clientX;
        const rect = playerVideoWrap.getBoundingClientRect();
        // Only trigger if touch is on the right half of the player
        if (touchX > rect.left + rect.width / 2) {
            originalSpeed = dp.video.playbackRate;
            longPressTimer = setTimeout(() => {
                if (isScreenLocked || dp.video.paused) return; // Double check
                dp.speed(2.0);
                speedChangedByLongPress = true;
                if (typeof showMessage === 'function') showMessage('播放速度: 2.0x', 'info', 1000);
            }, 300); // 300ms delay for long press
        }
    }, { passive: true });

    const endLongPress = function () {
        if (longPressTimer) clearTimeout(longPressTimer);
        longPressTimer = null;
        if (speedChangedByLongPress) {
            dp.speed(originalSpeed);
            speedChangedByLongPress = false;
            if (typeof showMessage === 'function') showMessage(`播放速度: ${originalSpeed.toFixed(1)}x`, 'info', 1000);
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

function showMessage(text, type = 'info', duration = 3000) {
    const messageElement = document.getElementById('message');
    if (!messageElement) { console.warn("Message element not found"); return; }

    let bgColorClass = ({ error: 'bg-red-500', success: 'bg-green-500', warning: 'bg-yellow-500', info: 'bg-blue-500' })[type] || 'bg-blue-500';

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

function toggleLockScreen() {
    isScreenLocked = !isScreenLocked;
    const playerContainer = document.querySelector('.player-container'); // Should be .player-area or dplayer container
    const lockButton = document.getElementById('lock-button'); // The button itself
    // Assuming the icon is inside the button, we can find it or just replace innerHTML
    // const lockIcon = document.getElementById('lock-icon'); // More specific if you have an ID on the SVG

    if (playerContainer) { // Ensure player container exists
        playerContainer.classList.toggle('player-locked', isScreenLocked);
    }

    if (lockButton) {
        if (isScreenLocked) {
            lockButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-unlock"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 9.9-1"></path></svg>`; // Unlock icon
            lockButton.setAttribute('aria-label', '解锁屏幕');
            if (typeof showMessage === 'function') showMessage('屏幕已锁定', 'info');
        } else {
            lockButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-lock"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>`; // Lock icon
            lockButton.setAttribute('aria-label', '锁定屏幕');
            if (typeof showMessage === 'function') showMessage('屏幕已解锁', 'info');
        }
    }
}

function renderEpisodes() {
    const grid = document.getElementById('episode-grid');
    if (!grid) { setTimeout(renderEpisodes, 100); return; }
    // ★ 让选集区域可见 / 隐藏
    const container = document.getElementById('episodes-container');
    if (container) {
        if (currentEpisodes.length > 1) {
            container.classList.remove('hidden');
        } else {
            container.classList.add('hidden');
        }
    }

    // ★ 更新“共 x 集”文字
    const countSpan = document.getElementById('episodes-count');
    if (countSpan) countSpan.textContent = `共 ${currentEpisodes.length} 集`;

    grid.innerHTML = '';

    if (!currentEpisodes.length) {
        grid.innerHTML =
            '<div class="col-span-full text-center text-gray-400 py-4">没有可用的剧集</div>';
        return;
    }

    const order = [...Array(currentEpisodes.length).keys()];
    if (episodesReversed) order.reverse();          // 倒序显示

    order.forEach(idx => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = idx === currentEpisodeIndex
            ? 'p-2 rounded episode-active'
            : 'p-2 rounded bg-[#222] hover:bg-[#333] text-gray-300';
        btn.textContent = idx + 1;
        btn.dataset.index = idx;                  // 关键：把真实下标写到 data 上
        grid.appendChild(btn);
    });

    /* 只在父层做一次事件代理，彻底避免闭包 */
    if (!grid._sListenerBound) {
        grid.addEventListener('click', evt => {
            const target = evt.target.closest('button[data-index]');
            if (target) playEpisode(+target.dataset.index);
        });
        grid._sListenerBound = true;
    }

    updateEpisodeInfo();
    updateButtonStates();
}


function updateEpisodeInfo() {
    const episodeInfoSpan = document.getElementById('episode-info-span');
    if (!episodeInfoSpan) return;

    // 只有在剧集总数 > 1 时才显示题注
    if (window.currentEpisodes && window.currentEpisodes.length > 1) {
        const totalEpisodes = window.currentEpisodes.length;
        const currentDisplayNumber = window.currentEpisodeIndex + 1; // 1-based

        // 题注样式：第 x / y 集
        episodeInfoSpan.textContent = `第 ${currentDisplayNumber} / ${totalEpisodes} 集`;

        // 同步顶部 “共 n 集” 小字
        const episodesCountEl = document.getElementById('episodes-count');
        if (episodesCountEl) {
            episodesCountEl.textContent = `共 ${totalEpisodes} 集`;
        }
    } else {
        // 如果只有单集或数据缺失，就清空题注
        episodeInfoSpan.textContent = '';
    }
}

// 复制播放链接
function copyLinks() {
    const urlParams = new URLSearchParams(window.location.search);
    const linkUrl = urlParams.get('url') || (dp && dp.video && dp.video.src) || ''; // 尝试从播放器获取当前链接作为备选

    if (!linkUrl) {
        if (typeof showToast === 'function') {
            showToast('没有可复制的视频链接', 'warning');
        } else {
            alert('没有可复制的视频链接');
        }
        return;
    }

    navigator.clipboard.writeText(linkUrl).then(() => {
        if (typeof showToast === 'function') { // 检查 showToast 是否可用
            showToast('当前视频链接已复制', 'success');
        } else {
            console.error("showToast function is not available in player_app.js");
            alert('当前视频链接已复制 (showToast unavailable)'); // 降级提示
        }
    }).catch(err => {
        console.error('复制链接失败:', err);
        if (typeof showToast === 'function') {
            showToast('复制失败，请检查浏览器权限', 'error');
        } else {
            console.error("showToast function is not available in player_app.js");
            alert('复制失败 (showToast unavailable)'); // 降级提示
        }
    });
}

function toggleEpisodeOrder() {
    episodesReversed = !episodesReversed;
    localStorage.setItem('episodesReversed', episodesReversed.toString());
    //   console.log('[PlayerApp] Episode order toggled. New state:', episodesReversed ? 'Reversed' : 'Normal');
    updateOrderButton();
    renderEpisodes();
}

function updateOrderButton() {
    const icon = document.getElementById('order-icon');
    if (!icon) return;
    // 清空原 path 后填充新图标
    icon.innerHTML = episodesReversed
        ? '<polyline points="18 15 12 9 6 15"></polyline>'  // ⬆️  倒序
        : '<polyline points="6 9 12 15 18 9"></polyline>';  // ⬇️  正序
}

function playPreviousEpisode() {
    if (!currentEpisodes.length) return;
    const prevIdx = currentEpisodeIndex - 1;          // 无论正序 / 倒序都减 1
    if (prevIdx >= 0) {
        playEpisode(prevIdx);
    } else showMessage('已经是第一集了', 'info');
}
window.playPreviousEpisode = playPreviousEpisode;

function playNextEpisode() {
    if (!currentEpisodes.length) return;
    const nextIdx = currentEpisodeIndex + 1;          // 始终加 1
    if (nextIdx < currentEpisodes.length) {
        playEpisode(nextIdx);
    } else showMessage('已经是最后一集了', 'info');
}
window.playNextEpisode = playNextEpisode;

function updateButtonStates() {
    const prevButton = document.getElementById('prev-episode');
    const nextButton = document.getElementById('next-episode');
    const totalEpisodes = window.currentEpisodes ? window.currentEpisodes.length : 0;

    if (prevButton) {
        // "Previous" button is disabled if currentEpisodeIndex is 0 (first actual episode)
        prevButton.disabled = window.currentEpisodeIndex <= 0;
        prevButton.classList.toggle('opacity-50', prevButton.disabled);
        prevButton.classList.toggle('cursor-not-allowed', prevButton.disabled);
    }
    if (nextButton) {
        // "Next" button is disabled if currentEpisodeIndex is the last actual episode
        nextButton.disabled = window.currentEpisodeIndex >= totalEpisodes - 1;
        nextButton.classList.toggle('opacity-50', nextButton.disabled);
        nextButton.classList.toggle('cursor-not-allowed', nextButton.disabled);
    }
}

function saveCurrentProgress() {
    if (!dp || !dp.video || isUserSeeking || videoHasEnded || !window.addToViewingHistory) return;
    const currentTime = dp.video.currentTime;
    const duration = dp.video.duration;

    // Only save if meaningful progress has been made and video hasn't practically ended
    if (currentTime > 5 && duration > 0 && currentTime < duration * 0.98) { // Check against 98% to avoid saving if "ended" event was missed
        try {
            const videoInfo = {
                title: currentVideoTitle,
                url: window.currentEpisodes[window.currentEpisodeIndex], // url of the current episode
                episodeIndex: window.currentEpisodeIndex,
                playbackPosition: Math.floor(currentTime),
                duration: Math.floor(duration),
                timestamp: Date.now(),
                sourceName: new URLSearchParams(window.location.search).get('source') || '', // If you have source name
                sourceCode: new URLSearchParams(window.location.search).get('source_code') || '',
                episodes: window.currentEpisodes // Save the full list for context
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

function saveToHistory() { // This is more like an "initial save" or "episode change save"
    if (!dp || !dp.video || !currentVideoTitle || !window.addToViewingHistory || !currentEpisodes[currentEpisodeIndex]) return;
    try {
        const videoInfo = {
            title: currentVideoTitle,
            url: window.currentEpisodes[window.currentEpisodeIndex],
            episodeIndex: window.currentEpisodeIndex,
            episodes: window.currentEpisodes, // Full list for context
            playbackPosition: Math.floor(dp.video.currentTime), // Current time, even if 0 for new episode
            duration: Math.floor(dp.video.duration) || 0, // Duration, or 0 if not loaded yet
            timestamp: Date.now(),
            sourceName: new URLSearchParams(window.location.search).get('source') || '',
            sourceCode: new URLSearchParams(window.location.search).get('source_code') || ''
        };
        window.addToViewingHistory(videoInfo);
    } catch (e) {
        console.error('保存到历史记录失败:', e);
    }
}

function clearVideoProgress() { // This seems to clear localStorage progress, not related to viewing history
    const progressKey = `videoProgress_${getVideoId()}`;
    try {
        localStorage.removeItem(progressKey);
        if (window.PLAYER_CONFIG && window.PLAYER_CONFIG.debugMode) console.log('已清除 localStorage 播放进度记录 for ' + progressKey);
    } catch (e) { console.error('清除 localStorage 播放进度记录失败', e); }
}

function getVideoId() {
    const sourceCode = new URLSearchParams(window.location.search).get('source_code') || 'unknown';
    return `${encodeURIComponent(currentVideoTitle)}_${sourceCode}_ep${window.currentEpisodeIndex}`;
}

function playEpisode(index) {
    if (index < 0 || index >= currentEpisodes.length) {
        console.warn(`[PlayerApp] Invalid episode index: ${index}`);
        return;
    }

    currentEpisodeIndex = index;
    window.currentEpisodeIndex = index;

    const episodeUrl = currentEpisodes[index];
    if (!episodeUrl) {
        console.warn(`[PlayerApp] No URL found for episode index: ${index}`);
        return;
    }

    //------------------------------------------------------------------
    // 新的方法：直接用 location.href 带 index/url 重新加载 player.html
    //------------------------------------------------------------------
    const playerUrl = new URL(
        window.location.origin + window.location.pathname
    );

    playerUrl.searchParams.set('url', episodeUrl);
    playerUrl.searchParams.set('title', currentVideoTitle);
    playerUrl.searchParams.set('index', index.toString());

    /* 把完整剧集数组塞进 URL，保证新页面即使拿不到
       localStorage 也能渲染选集按钮                */
    if (Array.isArray(currentEpisodes) && currentEpisodes.length) {
        playerUrl.searchParams.set(
            'episodes',
            encodeURIComponent(JSON.stringify(currentEpisodes))
        );
    }
    // 如果你还想保 source_code，也可以加：
    const sourceCode = new URLSearchParams(window.location.search).get('source_code');
    if (sourceCode) playerUrl.searchParams.set('source_code', sourceCode);

    try {
        localStorage.setItem(
            'currentEpisodes',
            JSON.stringify(currentEpisodes)
        );
        localStorage.setItem('currentVideoTitle', currentVideoTitle);
    } catch (_) { }

    window.location.href = playerUrl.toString();
}
window.playEpisode = playEpisode; // Expose globally
window.copyLinks = copyLinks;
window.toggleEpisodeOrder = toggleEpisodeOrder;
window.toggleLockScreen = toggleLockScreen;