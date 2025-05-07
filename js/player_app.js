// File: js/player_app.js

// --- 模块内变量 ---
let currentVideoTitle = '';
let currentEpisodeIndex = 0;
let currentEpisodes = [];
let episodesReversed = false;
let dp = null;
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
    if (typeof window.isPasswordVerified === 'function' && !window.isPasswordVerified()) {
        if (typeof window.showPasswordModal === 'function') window.showPasswordModal();
        const loadingEl = document.getElementById('loading');
        if (loadingEl) loadingEl.style.display = 'none';
        return;
    }
    initializePageContent();
});

document.addEventListener('passwordVerified', () => {
    const loadingEl = document.getElementById('loading');
    if (loadingEl) loadingEl.style.display = 'block';
    initializePageContent();
});

function initializePageContent() {
    const urlParams = new URLSearchParams(window.location.search);
    const videoUrl = urlParams.get('url');
    const title = urlParams.get('title');
    const sourceCode = urlParams.get('source_code');
    let index = parseInt(urlParams.get('index') || '0', 10);
    const episodesListParam = urlParams.get('episodes');

    currentVideoTitle = title || localStorage.getItem('currentVideoTitle') || '未知视频';
    window.currentVideoTitle = currentVideoTitle; // Expose for saveToHistory potentially

    try {
        let episodesSource = localStorage.getItem('currentEpisodes');
        if (episodesListParam) { // Prioritize URL param for episodes if present
             try {
                currentEpisodes = JSON.parse(decodeURIComponent(episodesListParam));
             } catch(e) {
                console.warn("Failed to parse episodes from URL, falling back to localStorage", e);
                currentEpisodes = episodesSource ? JSON.parse(episodesSource) : [];
             }
        } else if (episodesSource) {
            currentEpisodes = JSON.parse(episodesSource);
        } else {
            currentEpisodes = [];
        }
        window.currentEpisodes = currentEpisodes;

        if (currentEpisodes.length > 0 && (index < 0 || index >= currentEpisodes.length)) {
            console.warn(`[PlayerApp] Invalid episode index ${index} for ${currentEpisodes.length} episodes. Resetting to 0.`);
            index = 0;
            const newUrl = new URL(window.location.href);
            newUrl.searchParams.set('index', index);
            window.history.replaceState({}, '', newUrl.toString());
        }
        currentEpisodeIndex = index;
        window.currentEpisodeIndex = currentEpisodeIndex;

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
            }, 1500);
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
    }, 1000);
    
    document.addEventListener('keydown', handleKeyboardShortcuts);
    window.addEventListener('beforeunload', saveCurrentProgress);
    document.addEventListener('visibilitychange', function() {
        if (document.visibilityState === 'hidden') {
            saveCurrentProgress();
        }
    });

    const waitForVideo = setInterval(() => {
        if (dp && dp.video) {
            dp.video.addEventListener('pause', saveCurrentProgress);
            let lastSaveTime = 0;
            dp.video.addEventListener('timeupdate', function() {
                const now = Date.now();
                if (now - lastSaveTime > 5000) {
                    saveCurrentProgress();
                    lastSaveTime = now;
                }
            });
            clearInterval(waitForVideo);
        }
    }, 200);

    setupPlayerControls();
}

class CustomHlsJsLoader extends Hls.DefaultConfig.loader {
    constructor(config) {
        super(config);
    }

    load(context, config, callbacks) {
        const adFilteringEnabled = (window.PLAYER_CONFIG && typeof window.PLAYER_CONFIG.adFilteringEnabled !== 'undefined')
            ? window.PLAYER_CONFIG.adFilteringEnabled
            : true;

        if ((context.type === 'manifest' || context.type === 'level') && adFilteringEnabled) {
            const origOnSuccess = callbacks.onSuccess;
            callbacks.onSuccess = (response, stats, context) => {
                if (response.data && typeof response.data === 'string') {
                    response.data = this.filterAdsFromM3U8Legacy(response.data);
                }
                return origOnSuccess(response, stats, context);
            };
        }
        super.load(context, config, callbacks);
    }

    filterAdsFromM3U8Legacy(m3u8Content) {
        if (typeof m3u8Content !== 'string' || !m3u8Content) return m3u8Content;
        
        const debugMode = window.PLAYER_CONFIG && window.PLAYER_CONFIG.debugMode;
        if (debugMode) console.log('[AdFilter-Legacy] Applying legacy discontinuity filter.');

        const lines = m3u8Content.split('\n');
        const filteredLines = [];
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (!line.includes('#EXT-X-DISCONTINUITY')) {
                filteredLines.push(line);
            } else {
                if (debugMode) console.log('[AdFilter-Legacy] Removing line:', line);
            }
        }
        return filteredLines.join('\n');
    }
}

function initPlayer(videoUrl, sourceCode) {
    if (!videoUrl) return;

    const adFilteringEnabled = (window.PLAYER_CONFIG && typeof window.PLAYER_CONFIG.adFilteringEnabled !== 'undefined')
        ? window.PLAYER_CONFIG.adFilteringEnabled
        : true;

    const hlsConfig = {
        debug: (window.PLAYER_CONFIG && window.PLAYER_CONFIG.debugMode) || false,
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

    dp = new DPlayer({
        container: document.getElementById('dplayer'),
        autoplay: true, theme: '#00ccff', preload: 'auto', loop: false, lang: 'zh-cn',
        hotkey: true, mutex: true, volume: 0.7, screenshot: true, preventClickToggle: false,
        airplay: true, chromecast: true,
        video: {
            url: videoUrl, type: 'hls',
            pic: (window.SITE_CONFIG && SITE_CONFIG.logo) || 'https://img.picgo.net/2025/04/12/image362e7d38b4af4a74.png',
            customType: {
                hls: function(video, player) {
                    if (currentHls && currentHls.destroy) {
                        try { currentHls.destroy(); } catch (e) { console.warn('销毁旧HLS实例时出错:', e); }
                    }
                    const hls = new Hls(hlsConfig);
                    currentHls = hls; window.currentHls = currentHls;

                    let errorDisplayed = false, errorCount = 0, playbackStarted = false, bufferAppendErrorCount = 0;

                    video.addEventListener('playing', function() {
                        playbackStarted = true;
                        const loadingEl = document.getElementById('loading');
                        if(loadingEl) loadingEl.style.display = 'none';
                        const errorEl = document.getElementById('error');
                        if(errorEl) errorEl.style.display = 'none';
                    });
                    
                    const sourceElement = document.createElement('source');
                    sourceElement.src = videoUrl;
                    if (video.querySelector('source')) video.querySelector('source').remove(); // Remove old source if exists
                    video.appendChild(sourceElement);
                    video.disableRemotePlayback = false;
                    
                    hls.loadSource(video.src);
                    hls.attachMedia(video);

                    hls.on(Hls.Events.MANIFEST_PARSED, function() {
                        video.play().catch(e => console.warn('自动播放被阻止:', e));
                    });
                    
                    hls.on(Hls.Events.ERROR, function(event, data) {
                        if (window.PLAYER_CONFIG && window.PLAYER_CONFIG.debugMode) console.log('HLS事件:', event, '数据:', data);
                        errorCount++;
                        if (data.details === 'bufferAppendError') {
                            bufferAppendErrorCount++;
                            if (window.PLAYER_CONFIG && window.PLAYER_CONFIG.debugMode) console.warn(`bufferAppendError 发生 ${bufferAppendErrorCount} 次`);
                            if (playbackStarted) return; // Ignore if already playing
                            if (bufferAppendErrorCount >= 3) hls.recoverMediaError();
                        }
                        if (data.fatal && !playbackStarted) {
                            console.error('致命HLS错误:', data);
                            switch(data.type) {
                                case Hls.ErrorTypes.NETWORK_ERROR: hls.startLoad(); break;
                                case Hls.ErrorTypes.MEDIA_ERROR: hls.recoverMediaError(); break;
                                default:
                                    if (errorCount > 3 && !errorDisplayed) {
                                        errorDisplayed = true; showError('视频加载失败，格式可能不兼容或源不可用');
                                    }
                                    break;
                            }
                        }
                    });
                    hls.on(Hls.Events.FRAG_LOADED, () => { const el = document.getElementById('loading'); if(el) el.style.display = 'none'; });
                    hls.on(Hls.Events.LEVEL_LOADED, () => { const el = document.getElementById('loading'); if(el) el.style.display = 'none'; });
                }
            }
        }
    });
    window.dp = dp;

    dp.on('fullscreen', () => {
        if (window.screen.orientation && window.screen.orientation.lock) {
            window.screen.orientation.lock('landscape').catch(err => console.warn('屏幕方向锁定失败:', err));
        }
        const fsButton = document.getElementById('fullscreen-button');
        if (fsButton && fsButton.querySelector('svg')) { // Assuming SVG structure needs update
            fsButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-minimize"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"></path></svg>`;
            fsButton.setAttribute('aria-label', '退出全屏');
        }
    });

    dp.on('fullscreen_cancel', () => {
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
        const el = document.getElementById('loading'); if(el) el.style.display = 'none';
        videoHasEnded = false;
        setupProgressBarPreciseClicks();
        setTimeout(saveToHistory, 3000);
        startProgressSaveInterval();
    });

    dp.on('error', function(e) {
        console.error("DPlayer error event:", e);
        if (dp.video && dp.video.currentTime > 1) return;
        showError('播放器遇到错误，请检查视频源');
    });

    setupLongPressSpeedControl();
    
    dp.on('seeking', function() { isUserSeeking = true; videoHasEnded = false; });
    dp.on('seeked', function() {
        if (dp.video && dp.video.duration > 0) {
            const timeFromEnd = dp.video.duration - dp.video.currentTime;
            if (timeFromEnd < 0.3 && isUserSeeking) {
                dp.video.currentTime = Math.max(0, dp.video.currentTime - 1);
            }
        }
        setTimeout(() => { isUserSeeking = false; }, 200);
    });
    
    dp.on('ended', function() {
        videoHasEnded = true;
        saveCurrentProgress();
        clearVideoProgress();
        if (autoplayEnabled && window.currentEpisodeIndex < window.currentEpisodes.length - 1) {
            if (window.PLAYER_CONFIG && window.PLAYER_CONFIG.debugMode) console.log('[PlayerApp] Video ended, autoplaying next.');
            setTimeout(() => {
                if (videoHasEnded && !isUserSeeking) { // Double check state before playing next
                     if(typeof window.playNextEpisode === 'function') window.playNextEpisode();
                }
            }, 1000);
        }
    });

    dp.on('timeupdate', function() {
        if (dp.video && dp.video.duration > 0) {
            if (isUserSeeking && dp.video.currentTime > dp.video.duration * 0.95) {
                videoHasEnded = false;
            }
        }
    });

    setTimeout(function() {
        if (dp && dp.video && dp.video.currentTime > 0) return;
        const loadingEl = document.getElementById('loading');
        if (loadingEl && loadingEl.style.display !== 'none') {
            loadingEl.innerHTML = `<div class="loading-spinner"></div><div>视频加载时间较长...</div><div style="font-size: 12px; color: #aaa; margin-top: 10px;">如长时间无响应，请尝试其他视频源</div>`;
        }
    }, 10000);

    // Native fullscreen integration for DPlayer's internal button
    (function(){
        const dplayerElement = document.getElementById('dplayer');
        if(dplayerElement) {
            dp.on('fullscreen', () => {
                if (document.fullscreenElement || document.webkitFullscreenElement) return;
                if (dplayerElement.requestFullscreen) dplayerElement.requestFullscreen().catch(err => console.warn('DPlayer internal FS to native failed:', err));
                else if (dplayerElement.webkitRequestFullscreen) dplayerElement.webkitRequestFullscreen().catch(err => console.warn('DPlayer internal FS to native failed (webkit):', err));
            });
            dp.on('fullscreen_cancel', () => {
                 if (!document.fullscreenElement && !document.webkitFullscreenElement) return;
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
                        if (playerContainer.requestFullscreen) playerContainer.requestFullscreen().catch(err => console.error(err));
                        else if (playerContainer.webkitRequestFullscreen) playerContainer.webkitRequestFullscreen().catch(err => console.error(err));
                    } else {
                        if (document.exitFullscreen) document.exitFullscreen().catch(err => console.error(err));
                        else if (document.webkitExitFullscreen) document.webkitExitFullscreen().catch(err => console.error(err));
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
                    dp.switchVideo({ url: videoUrlRetry, type: 'hls' });
                    dp.play();
                } else {
                    initPlayer(videoUrlRetry, sourceCodeRetry);
                }
            } else {
                showError('无法重试，视频链接无效');
            }
        });
    }

    const prevEpisodeBtn = document.getElementById('prev-episode');
    if (prevEpisodeBtn) prevEpisodeBtn.addEventListener('click', playPreviousEpisode);

    const nextEpisodeBtn = document.getElementById('next-episode');
    if (nextEpisodeBtn) nextEpisodeBtn.addEventListener('click', playNextEpisode);

    const orderBtn = document.getElementById('order-button');
    if (orderBtn) orderBtn.addEventListener('click', toggleEpisodeOrder);
}

function showError(message) {
    if (dp && dp.video && dp.video.currentTime > 1) {
        console.warn('忽略错误，因为视频已经在播放:', message);
        return;
    }
    const loadingEl = document.getElementById('loading'); if (loadingEl) loadingEl.style.display = 'none';
    const errorElement = document.getElementById('error');
    if (errorElement) {
        const errorTextElement = errorElement.querySelector('.text-xl.font-bold');
        if (errorTextElement) errorTextElement.textContent = message;
        else errorElement.children[1].textContent = message; // Fallback assuming structure
        errorElement.style.display = 'flex';
    }
    if (typeof showMessage === 'function') showMessage(message, 'error');
}

function setupProgressBarPreciseClicks() {
    if (!dp) return;
    const progressBar = document.querySelector('#dplayer .dplayer-bar-wrap');
    if (!progressBar) { console.warn('DPlayer进度条元素未找到'); return; }
    
    progressBar.removeEventListener('click', handleProgressBarClick);
    progressBar.removeEventListener('touchend', handleProgressBarTouch);
    
    progressBar.addEventListener('click', handleProgressBarClick);
    progressBar.addEventListener('touchend', handleProgressBarTouch);
}

function handleProgressBarClick(e) {
    if (!dp || !dp.video || !e.currentTarget) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, offsetX / rect.width));
    const clickTime = percentage * dp.video.duration;
    userClickedPosition = clickTime; 
    dp.seek(clickTime);
}

function handleProgressBarTouch(e) {
    if (!dp || !dp.video || !e.changedTouches || !e.changedTouches[0] || !e.currentTarget) return;
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
    switch (e.key) {
        case 'ArrowLeft':
            if (e.altKey) { playPreviousEpisode(); actionText = '上一集'; direction = 'left'; }
            else { dp.seek(Math.max(0, dp.video.currentTime - 5)); actionText = '后退 5s'; direction = 'left'; }
            e.preventDefault(); break;
        case 'ArrowRight':
            if (e.altKey) { playNextEpisode(); actionText = '下一集'; direction = 'right'; }
            else { dp.seek(Math.min(dp.video.duration, dp.video.currentTime + 5)); actionText = '前进 5s'; direction = 'right'; }
            e.preventDefault(); break;
        case 'PageUp': playPreviousEpisode(); actionText = '上一集'; direction = 'left'; e.preventDefault(); break;
        case 'PageDown': playNextEpisode(); actionText = '下一集'; direction = 'right'; e.preventDefault(); break;
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
        if (touchX > rect.left + rect.width / 2) { // Right half
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

function showMessage(text, type = 'info', duration = 3000) {
    const messageElement = document.getElementById('message');
    if (!messageElement) return;
    let bgColor = ({error:'bg-red-500', success:'bg-green-500', warning:'bg-yellow-500', info:'bg-blue-500'})[type] || 'bg-blue-500';
    messageElement.className = `fixed top-4 right-4 p-3 rounded shadow-lg z-[10001] text-sm ${bgColor} text-white transition-opacity duration-300 opacity-0`;
    messageElement.textContent = text;
    messageElement.offsetHeight; 
    messageElement.classList.remove('opacity-0');
    messageElement.classList.add('opacity-100');
    setTimeout(() => {
        messageElement.classList.remove('opacity-100');
        messageElement.classList.add('opacity-0');
    }, duration);
}

function renderEpisodes() {
    const episodesContainer = document.getElementById('episodes-container');
    const episodeGrid = document.getElementById('episode-grid');
    if (!episodesContainer || !episodeGrid || !window.currentEpisodes || window.currentEpisodes.length <= 1) {
        if (episodesContainer) episodesContainer.classList.add('hidden');
        return;
    }
    episodesContainer.classList.remove('hidden');
    episodeGrid.innerHTML = '';
    const displayEpisodes = episodesReversed ? [...window.currentEpisodes].reverse() : [...window.currentEpisodes];
    
    displayEpisodes.forEach((url, idx) => {
        const realIndex = episodesReversed ? (window.currentEpisodes.length - 1 - idx) : idx;
        const episodeButton = document.createElement('button');
        const isActive = realIndex === window.currentEpisodeIndex;
        episodeButton.className = `episode-button py-2 px-3 text-xs sm:text-sm rounded transition-colors duration-200 ease-in-out truncate ${isActive ? 'bg-blue-600 text-white episode-active' : 'bg-gray-700 hover:bg-gray-600 text-gray-300'}`;
        episodeButton.textContent = `第 ${idx + 1} 集`;
        episodeButton.title = `播放第 ${idx + 1} 集`;
        episodeButton.setAttribute('data-index', realIndex.toString());
        episodeButton.addEventListener('click', () => {
            if (typeof window.playEpisode === 'function') {
                window.playEpisode(realIndex);
            } else {
                console.error('window.playEpisode function not found');
            }
        });
        episodeGrid.appendChild(episodeButton);
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

function toggleEpisodeOrder() {
    episodesReversed = !episodesReversed;
    localStorage.setItem('episodesReversed', episodesReversed.toString());
    updateOrderButton();
    renderEpisodes();
}

function updateOrderButton() {
    const orderButton = document.getElementById('order-button');
    if (!orderButton) return;
    const orderTextSpan = orderButton.querySelector('span');
    const orderIconSvg = orderButton.querySelector('svg');
    if (orderTextSpan) orderTextSpan.textContent = episodesReversed ? '正序排列' : '倒序排列';
    if (orderIconSvg) orderIconSvg.style.transform = episodesReversed ? 'rotate(180deg)' : 'rotate(0deg)';
}


function playPreviousEpisode() {
    if (window.currentEpisodeIndex > 0) {
        if (typeof window.playEpisode === 'function') window.playEpisode(window.currentEpisodeIndex - 1);
    } else {
        if(typeof showMessage === 'function') showMessage('已经是第一集了', 'info');
    }
}
window.playPreviousEpisode = playPreviousEpisode;

function playNextEpisode() {
    if (window.currentEpisodeIndex < window.currentEpisodes.length - 1) {
         if (typeof window.playEpisode === 'function') window.playEpisode(window.currentEpisodeIndex + 1);
    } else {
        if(typeof showMessage === 'function') showMessage('已经是最后一集了', 'info');
    }
}
window.playNextEpisode = playNextEpisode;

function updateButtonStates() {
    const prevButton = document.getElementById('prev-episode');
    const nextButton = document.getElementById('next-episode');
    const totalEpisodes = window.currentEpisodes ? window.currentEpisodes.length : 0;

    if (prevButton) {
        prevButton.disabled = window.currentEpisodeIndex <= 0;
        prevButton.classList.toggle('opacity-50', window.currentEpisodeIndex <= 0);
        prevButton.classList.toggle('cursor-not-allowed', window.currentEpisodeIndex <= 0);
    }
    if (nextButton) {
        nextButton.disabled = window.currentEpisodeIndex >= totalEpisodes - 1;
        nextButton.classList.toggle('opacity-50', window.currentEpisodeIndex >= totalEpisodes - 1);
        nextButton.classList.toggle('cursor-not-allowed', window.currentEpisodeIndex >= totalEpisodes - 1);
    }
}

function saveCurrentProgress() {
    if (!dp || !dp.video || isUserSeeking || videoHasEnded) return;
    const currentTime = dp.video.currentTime;
    const duration = dp.video.duration;
    if (currentTime > 5 && duration > 0 && currentTime < duration * 0.98) { // Min 5s to save
        try {
            const videoInfo = {
                title: currentVideoTitle, // This should be up-to-date from initializePageContent
                url: window.currentEpisodes[window.currentEpisodeIndex],
                episodeIndex: window.currentEpisodeIndex,
                playbackPosition: Math.floor(currentTime),
                duration: Math.floor(duration),
                timestamp: Date.now(),
                sourceName: new URLSearchParams(window.location.search).get('source') || '',
                sourceCode: new URLSearchParams(window.location.search).get('source_code') || '',
                episodes: window.currentEpisodes
            };
            if(typeof window.addToViewingHistory === 'function') { // addToViewingHistory is in ui.js
                window.addToViewingHistory(videoInfo);
            } else {
                console.warn("addToViewingHistory function not found from ui.js");
            }
        } catch (e) {
            console.error('保存播放进度失败:', e);
        }
    }
}

function startProgressSaveInterval() {
    if (progressSaveInterval) clearInterval(progressSaveInterval);
    progressSaveInterval = setInterval(saveCurrentProgress, 30000);
}

function saveToHistory() { // This seems to duplicate saveCurrentProgress functionality slightly
    if (!dp || !dp.video || !currentVideoTitle) return;
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
        if(typeof window.addToViewingHistory === 'function') {
            window.addToViewingHistory(videoInfo);
        }
    } catch (e) {
        console.error('保存到历史记录失败:', e);
    }
}

function clearVideoProgress() {
    const progressKey = `videoProgress_${getVideoId()}`;
    try {
        localStorage.removeItem(progressKey);
        if (window.PLAYER_CONFIG && window.PLAYER_CONFIG.debugMode) console.log('已清除播放进度记录 for ' + progressKey);
    } catch (e) {
        console.error('清除播放进度记录失败', e);
    }
}

function getVideoId() {
    return `${encodeURIComponent(currentVideoTitle)}_${window.currentEpisodeIndex}`;
}