// ==========================  js/player_app.js  ==========================
/* ---------------------------------------------------------------------- */
/*  1. 工具函数                                                           */
/* ---------------------------------------------------------------------- */
function SQuery(selector, callback, timeout = 5000, interval = 100) {
    let elapsed = 0;
    (function check () {
        const el = document.querySelector(selector);
        if (el) { callback(el); return; }
        elapsed += interval;
        if (elapsed < timeout) setTimeout(check, interval);
        else console.error(`[SQuery] '${selector}' NOT found in ${timeout} ms`);
    })();
}
console.log('[DEBUG] player_app.js loaded at', location.href);

/* ---------------------------------------------------------------------- */
/*  2. 全局状态                                                           */
/* ---------------------------------------------------------------------- */
let currentVideoTitle = '';
let currentEpisodeIndex = 0;
let currentEpisodes     = [];
let episodesReversed    = false;

let dp           = null;        // DPlayer 实例
let currentHls   = null;
let autoplayEnabled     = true;
let isUserSeeking       = false;
let videoHasEnded       = false;
let shortcutHintTimeout = null;
let progressSaveInterval = null;
let isScreenLocked      = false;

/* 需要在其他脚本访问的挂到 window */
window.currentEpisodes      = [];
window.currentEpisodeIndex  = 0;
window.playPreviousEpisode  = playPreviousEpisode;
window.playNextEpisode      = playNextEpisode;

/* ---------------------------------------------------------------------- */
/*  3. 启动入口                                                           */
/* ---------------------------------------------------------------------- */
document.addEventListener('DOMContentLoaded', () => {
    // 密码校验（如果有）
    if (typeof window.isPasswordProtected === 'function' &&
        typeof window.isPasswordVerified  === 'function' &&
        window.isPasswordProtected() && !window.isPasswordVerified()) {

        if (typeof window.showPasswordModal === 'function') window.showPasswordModal();
        SQuery('#loading', el => el.style.display = 'none');
        return;
    }
    initializePageContent();
});

document.addEventListener('passwordVerified', () => {
    SQuery('#loading', el => el.style.display = 'flex');
    initializePageContent();
});

/* ---------------------------------------------------------------------- */
/*  4. 页面初始化                                                          */
/* ---------------------------------------------------------------------- */
function initializePageContent () {
    const params      = new URLSearchParams(location.search);
    const videoUrl    = params.get('url');
    const title       = params.get('title');
    const sourceCode  = params.get('source_code');
    const indexParam  = parseInt(params.get('index') || '0', 10);
    const episodesStr = params.get('episodes');

    currentVideoTitle = title || localStorage.getItem('currentVideoTitle') || '未知视频';
    document.title    = `${currentVideoTitle} - ${(window.SITE_CONFIG && SITE_CONFIG.name) || '播放器'}`;
    SQuery('#video-title', el => el.textContent = currentVideoTitle);

    /* ---------- 取剧集列表 ---------- */
    try {
        const localEp = localStorage.getItem('currentEpisodes');
        if (episodesStr) {
            currentEpisodes = JSON.parse(decodeURIComponent(episodesStr));
        } else if (localEp) {
            currentEpisodes = JSON.parse(localEp);
        } else currentEpisodes = [];
    } catch (e) {
        console.error('[PlayerApp] 解析剧集失败:', e);
        currentEpisodes = [];
    }
    window.currentEpisodes = currentEpisodes;

    /* ---------- 当前集 ---------- */
    currentEpisodeIndex = (currentEpisodes.length &&
                           indexParam >= 0 &&
                           indexParam < currentEpisodes.length) ? indexParam : 0;
    window.currentEpisodeIndex = currentEpisodeIndex;

    episodesReversed  = localStorage.getItem('episodesReversed') === 'true';
    autoplayEnabled   = localStorage.getItem('autoplayEnabled') !== 'false';
    SQuery('#autoplay-next', el => {
        el.checked = autoplayEnabled;
        el.onchange = e => {
            autoplayEnabled = e.target.checked;
            localStorage.setItem('autoplayEnabled', autoplayEnabled);
        };
    });

    /* ---------- 播放器 ---------- */
    if (videoUrl) {
        initPlayer(videoUrl, sourceCode);
        const resumePos = parseInt(params.get('position') || '0', 10);
        if (resumePos > 0) setTimeout(() => { dp && dp.seek(resumePos); showPositionRestoreHint(resumePos); }, 1500);
    } else showError('无效的视频链接');

    /* ---------- UI ---------- */
    updateEpisodeInfo();
    requestAnimationFrame(renderEpisodes);
    updateButtonStates();
    updateOrderButton();
    setTimeout(setupPlayerControls, 100);
    setTimeout(setupProgressBarPreciseClicks, 1000);

    /* ---------- 事件 ---------- */
    document.addEventListener('keydown', handleKeyboardShortcuts);
    window.addEventListener('beforeunload', saveCurrentProgress);
    window.addEventListener('error', e => console.error('GLOBAL ERR', e.message, e.filename, e.lineno));

    document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && saveCurrentProgress());
}

/* ---------------------------------------------------------------------- */
/*  5. 自定义 HLS Loader（可过滤广告）                                     */
/* ---------------------------------------------------------------------- */
class CustomHlsJsLoader extends Hls.DefaultConfig.loader {
    constructor (cfg) { super(cfg); }
    load (context, cfg, cbs) {
        const adFilter = (window.PLAYER_CONFIG?.adFilteringEnabled) ?? true;
        if (adFilter && (context.type === 'manifest' || context.type === 'level')) {
            const orig = cbs.onSuccess;
            cbs.onSuccess = (res, stats, ctx) => {
                if (typeof res.data === 'string')
                    res.data = res.data.split('\n').filter(l => !l.includes('#EXT-X-DISCONTINUITY')).join('\n');
                orig(res, stats, ctx);
            };
        }
        super.load(context, cfg, cbs);
    }
}

/* ---------------------------------------------------------------------- */
/*  6. 初始化 DPlayer                                                     */
/* ---------------------------------------------------------------------- */
function initPlayer (videoUrl, sourceCode) {
    if (!Hls || !DPlayer) return showError('播放器组件加载失败，请刷新');

    const debug = window.PLAYER_CONFIG?.debugMode;
    const hlsCfg = {
        debug: debug || false,
        loader: (window.PLAYER_CONFIG?.adFilteringEnabled) ? CustomHlsJsLoader : Hls.DefaultConfig.loader,
        enableWorker: true
    };

    try {
        dp = new DPlayer({
            container: document.getElementById('dplayer'),
            autoplay: true,
            theme: '#00ccff',
            preload: 'auto',
            video: {
                url: videoUrl,
                type: 'hls',
                pic: window.SITE_CONFIG?.logo || '',
                customType: {
                    hls (video, player) {
                        currentHls?.destroy?.();
                        currentHls = new Hls(hlsCfg);
                        currentHls.loadSource(videoUrl);
                        currentHls.attachMedia(video);
                    }
                }
            }
        });
        window.dp = dp;
        addDPlayerEventListeners();
    } catch (e) {
        console.error('DPlayer 初始化失败:', e);
        showError('播放器初始化失败');
    }
}

/* ---------------------------------------------------------------------- */
/*  7. DPlayer 事件                                                       */
/* ---------------------------------------------------------------------- */
function addDPlayerEventListeners () {
    if (!dp) return;
    const debug = window.PLAYER_CONFIG?.debugMode;

    dp.on('loadedmetadata', () => {
        SQuery('#loading', el => el.style.display = 'none');
        videoHasEnded = false;
        setupProgressBarPreciseClicks();
        setTimeout(saveToHistory, 3000);
        startProgressSaveInterval();
    });

    dp.on('error', e => { console.error('DPlayer error:', e); showError('播放器遇到错误'); });

    dp.on('ended', () => {
        videoHasEnded = true;
        saveCurrentProgress();
        clearVideoProgress();
        const hasNext = episodesReversed
            ? currentEpisodeIndex > 0
            : currentEpisodeIndex < currentEpisodes.length - 1;
        if (autoplayEnabled && hasNext) setTimeout(() => !isUserSeeking && playNextEpisode(), 1000);
    });

    dp.on('seeking', () => { isUserSeeking = true; });
    dp.on('seeked',  () => setTimeout(() => { isUserSeeking = false; }, 200));

    setupLongPressSpeedControl();
}

/* ---------------------------------------------------------------------- */
/*  8. 控制条按钮                                                         */
/* ---------------------------------------------------------------------- */
function setupPlayerControls () {
    SQuery('#fullscreen-button', btn => btn.onclick = () => dp.fullScreen.toggle());
    SQuery('#prev-episode',  btn => btn.onclick = playPreviousEpisode);
    SQuery('#next-episode',  btn => btn.onclick = playNextEpisode);
    SQuery('#order-button',  btn => btn.onclick = toggleEpisodeOrder);
    SQuery('#lock-button',   btn => btn.onclick = toggleLockScreen);
    SQuery('#retry-button',  btn => location.reload());
    SQuery('#back-button',   btn => location.href = 'index.html');
}

/* ---------------------------------------------------------------------- */
/*  9. 错误提示 / 全局消息                                                */
/* ---------------------------------------------------------------------- */
function showError (msg) {
    SQuery('#loading', el => el.style.display = 'none');
    SQuery('#error',   el => { el.style.display = 'flex'; el.children[1].textContent = msg; });
    showMessage(msg, 'error');
}
function showMessage (text, type = 'info', ms = 3000) {
    const el = document.getElementById('message');
    if (!el) return;
    const colors = { error:'bg-red-500', success:'bg-green-500', warning:'bg-yellow-500', info:'bg-blue-500' };
    el.className = `fixed top-4 right-4 p-3 rounded shadow-lg z-[10001] text-sm text-white transition-opacity duration-300 opacity-0 ${colors[type]||colors.info}`;
    el.textContent = text;
    void el.offsetWidth;
    el.classList.replace('opacity-0', 'opacity-100');
    clearTimeout(el._timer);
    el._timer = setTimeout(() => el.classList.replace('opacity-100', 'opacity-0'), ms);
}

/* ---------------------------------------------------------------------- */
/* 10. 进度条精确点击                                                     */
/* ---------------------------------------------------------------------- */
function setupProgressBarPreciseClicks () {
    setTimeout(() => {
        const bar = document.querySelector('#dplayer .dplayer-bar-wrap');
        if (!bar) return;
        bar.onclick      = handleProgressBarClick;
        bar.ontouchend   = handleProgressBarTouch;
    }, 500);
}
function handleProgressBarClick(e){ seekByClientX(e.clientX, e.currentTarget); }
function handleProgressBarTouch(e){ seekByClientX(e.changedTouches[0].clientX, e.currentTarget); }
function seekByClientX (x, target) {
    if (!dp?.video?.duration) return;
    const rect = target.getBoundingClientRect();
    const perc = Math.max(0, Math.min(1, (x - rect.left) / rect.width));
    dp.seek(perc * dp.video.duration);
}

/* ---------------------------------------------------------------------- */
/* 11. 键盘 / 长按加速                                                    */
/* ---------------------------------------------------------------------- */
function handleKeyboardShortcuts (e) {
    if (!dp || ['INPUT','TEXTAREA'].includes(document.activeElement.tagName)) return;
    const k = e.key;
    const withAlt = e.altKey;
    if (k === 'ArrowLeft'  && withAlt) return playPreviousEpisode();
    if (k === 'ArrowRight' && withAlt) return playNextEpisode();
    if (k === 'PageUp')  return playPreviousEpisode();
    if (k === 'PageDown') return playNextEpisode();
    if (k === 'ArrowLeft') { dp.seek(Math.max(0, dp.video.currentTime - 5)); }
    if (k === 'ArrowRight'){ dp.seek(Math.min(dp.video.duration, dp.video.currentTime + 5)); }
    if (k === ' ')         { dp.toggle(); }
    if (k === 'ArrowUp')   { dp.volume(Math.min(1, dp.video.volume + 0.1)); }
    if (k === 'ArrowDown') { dp.volume(Math.max(0, dp.video.volume - 0.1)); }
    if (k === 'f')         { dp.fullScreen.toggle(); }
    e.preventDefault();
}
function setupLongPressSpeedControl () {
    const wrap = document.querySelector('#dplayer .dplayer-video-wrap');
    if (!wrap) return;
    let timer = null, sped = false, origin = 1;
    wrap.addEventListener('touchstart', e => {
        if (dp.video.paused) return;
        const x = e.touches[0].clientX;
        if (x > wrap.getBoundingClientRect().left + wrap.clientWidth / 2) {
            origin = dp.video.playbackRate;
            timer = setTimeout(() => { dp.speed(2); sped = true; showMessage('2.0x', 'info', 800); }, 300);
        }
    }, { passive:true });
    const clear = () => { clearTimeout(timer); if (sped) dp.speed(origin); sped = false; };
    wrap.addEventListener('touchend',   clear);
    wrap.addEventListener('touchcancel',clear);
}

/* ---------------------------------------------------------------------- */
/* 12. 屏幕锁定                                                           */
/* ---------------------------------------------------------------------- */
function toggleLockScreen () {
    isScreenLocked = !isScreenLocked;
    document.querySelector('.player-container')?.classList.toggle('player-locked', isScreenLocked);
    const icon = document.getElementById('lock-icon');
    if (icon) icon.innerHTML = isScreenLocked
        ? '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 9.9-1"></path>'
        : '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path>';
    showMessage(isScreenLocked ? '屏幕已锁定' : '屏幕已解锁', 'info');
}

/* ---------------------------------------------------------------------- */
/* 13. 选集列表                                                           */
/* ---------------------------------------------------------------------- */
function renderEpisodes () {
    const grid = document.getElementById('episode-grid');
    if (!grid) { setTimeout(renderEpisodes, 100); return; }
    grid.innerHTML = '';

    if (!currentEpisodes.length) {
        grid.innerHTML = '<div class="col-span-full text-center text-gray-400 py-4">没有可用的剧集</div>';
        return;
    }

    const order = [...Array(currentEpisodes.length).keys()];
    if (episodesReversed) order.reverse();

    order.forEach(idx => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = idx === currentEpisodeIndex
            ? 'p-2 rounded episode-active'
            : 'p-2 rounded bg-[#222] hover:bg-[#333] text-gray-300';
        btn.textContent   = idx + 1;
        btn.dataset.index = idx;
        btn.onclick       = e => playEpisode(+e.currentTarget.dataset.index);
        grid.appendChild(btn);
    });
    updateEpisodeInfo();
    updateButtonStates();
}
function updateEpisodeInfo () {
    SQuery('#episode-info-span', span => {
        if (currentEpisodes.length > 1) span.textContent = `第 ${currentEpisodeIndex + 1} 集 / 共 ${currentEpisodes.length} 集`;
        else span.textContent = '';
    });
}

/* ---------------------------------------------------------------------- */
/* 14. 顺序 / 上下集                                                      */
/* ---------------------------------------------------------------------- */
function toggleEpisodeOrder () {
    episodesReversed = !episodesReversed;
    localStorage.setItem('episodesReversed', episodesReversed);
    updateOrderButton();
    renderEpisodes();
}
function updateOrderButton () {
    const icon = document.getElementById('order-icon');
    if (!icon) return;
    icon.innerHTML = episodesReversed
        ? '<polyline points="18 15 12 9 6 15"></polyline>'
        : '<polyline points="6 9 12 15 18 9"></polyline>';
}

function playPreviousEpisode () {
    if (!currentEpisodes.length) return;
    if (episodesReversed) {            // 倒序：上一集应是 index +1
        if (currentEpisodeIndex < currentEpisodes.length - 1) playEpisode(currentEpisodeIndex + 1);
        else showMessage('已经是第一集了','info');
    } else {
        if (currentEpisodeIndex > 0) playEpisode(currentEpisodeIndex - 1);
        else showMessage('已经是第一集了','info');
    }
}
function playNextEpisode () {
    if (!currentEpisodes.length) return;
    if (episodesReversed) {            // 倒序：下一集应是 index -1
        if (currentEpisodeIndex > 0) playEpisode(currentEpisodeIndex - 1);
        else showMessage('已经是最后一集了','info');
    } else {
        if (currentEpisodeIndex < currentEpisodes.length - 1) playEpisode(currentEpisodeIndex + 1);
        else showMessage('已经是最后一集了','info');
    }
}
function updateButtonStates () {
    const prevBtn = document.getElementById('prev-episode');
    const nextBtn = document.getElementById('next-episode');
    if (prevBtn) {
        prevBtn.disabled = (!episodesReversed && currentEpisodeIndex <= 0) ||
                           (episodesReversed && currentEpisodeIndex >= currentEpisodes.length - 1);
        prevBtn.classList.toggle('opacity-50', prevBtn.disabled);
    }
    if (nextBtn) {
        nextBtn.disabled = (!episodesReversed && currentEpisodeIndex >= currentEpisodes.length - 1) ||
                           (episodesReversed && currentEpisodeIndex <= 0);
        nextBtn.classList.toggle('opacity-50', nextBtn.disabled);
    }
}

/* ---------------------------------------------------------------------- */
/* 15. 播放指定集                                                         */
/* ---------------------------------------------------------------------- */
function playEpisode (idx) {
    if (idx < 0 || idx >= currentEpisodes.length) return;
    currentEpisodeIndex             = idx;
    window.currentEpisodeIndex      = idx;

    const url = currentEpisodes[idx];
    const newUrl = new URL(location.href);
    newUrl.searchParams.set('index', idx);
    history.replaceState({},'',newUrl);
    localStorage.setItem('currentEpisodeIndex', idx);

    updateEpisodeInfo();
    updateButtonStates();
    renderEpisodes();

    if (dp) {
        SQuery('#loading', el => el.style.display = 'flex');
        clearVideoProgress();
        dp.switchVideo({ url, type:'hls' });
        dp.play();
    } else initPlayer(url);
    saveToHistory();
}

/* ---------------------------------------------------------------------- */
/* 16. 播放记录 / 进度持久化                                              */
/* ---------------------------------------------------------------------- */
function saveCurrentProgress () {
    if (!dp?.video || isUserSeeking || videoHasEnded) return;
    const ct = dp.video.currentTime, dur = dp.video.duration;
    if (ct < 5 || ct > dur * 0.98) return;
    try {
        window.addToViewingHistory?.({
            title: currentVideoTitle,
            url: currentEpisodes[currentEpisodeIndex],
            episodeIndex: currentEpisodeIndex,
            playbackPosition: Math.floor(ct),
            duration: Math.floor(dur),
            timestamp: Date.now(),
            sourceCode: new URLSearchParams(location.search).get('source_code') || '',
            episodes: currentEpisodes
        });
    } catch (e) { console.error('保存进度失败:', e); }
}
function startProgressSaveInterval () {
    clearInterval(progressSaveInterval);
    progressSaveInterval = setInterval(saveCurrentProgress, 30000);
}
function saveToHistory () {
    if (!dp?.video) return;
    window.addToViewingHistory?.({
        title: currentVideoTitle,
        url: currentEpisodes[currentEpisodeIndex],
        episodeIndex: currentEpisodeIndex,
        playbackPosition: Math.floor(dp.video.currentTime),
        duration: Math.floor(dp.video.duration),
        timestamp: Date.now(),
        sourceCode: new URLSearchParams(location.search).get('source_code') || '',
        episodes: currentEpisodes
    });
}
function clearVideoProgress () {
    localStorage.removeItem(`videoProgress_${getVideoId()}`);
}
function getVideoId () {
    const code = new URLSearchParams(location.search).get('source_code') || 'unknown';
    return `${encodeURIComponent(currentVideoTitle)}_${code}_ep${currentEpisodeIndex}`;
}

/* ---------------------------------------------------------------------- */
/* 17. 继续播放提示                                                       */
/* ---------------------------------------------------------------------- */
function showPositionRestoreHint (pos) {
    if (pos < 10) return;
    const m = Math.floor(pos / 60);
    const s = `${Math.floor(pos % 60)}`.padStart(2,'0');
    showMessage(`已从 ${m}:${s} 继续播放`, 'info');
}
/* ==========================  END  ===================================== */
