// 鏀硅繘杩斿洖鍔熻兘
function goBack(e) {
    if (e) e.preventDefault();
    
    // 1. 棣栧厛妫€鏌ユ槸鍚︿粠鎼滅储椤甸潰杩涘叆鐨勬挱鏀惧櫒 (浼樺厛浣跨敤localStorage涓殑璁板綍)
    const cameFromSearch = localStorage.getItem('cameFromSearch') === 'true';
    const searchPageUrl = localStorage.getItem('searchPageUrl');
    
    if (cameFromSearch && searchPageUrl) {
        console.log('杩斿洖鎼滅储椤甸潰:', searchPageUrl);
        window.location.href = searchPageUrl;
        // 娓呴櫎鏍囪锛岄伩鍏嶄笅娆¤繑鍥炰粛鐒跺幓鎼滅储椤?        localStorage.removeItem('cameFromSearch');
        return;
    }
    
    // 缁х画鍘熸湁鐨勮繑鍥為€昏緫...
    const referrer = document.referrer;
    
    // 妫€鏌eferrer鏄惁鍖呭惈鎼滅储鍙傛暟
    if (referrer && (referrer.includes('?s=') || referrer.includes('/s='))) {
        // 濡傛灉鏄粠鎼滅储椤甸潰鏉ョ殑锛岃繑鍥炲埌鎼滅储椤甸潰
        console.log('鏍规嵁referrer杩斿洖鎼滅储椤甸潰:', referrer);
        window.location.href = referrer;
        return;
    }
    
    // 2. 灏濊瘯浠嶶RL鍙傛暟鑾峰彇杩斿洖鍦板潃
    const urlParams = new URLSearchParams(window.location.search);
    const returnUrl = urlParams.get('returnUrl');
    
    if (returnUrl) {
        // 瀛樺湪鏄庣‘鐨勮繑鍥炲湴鍧€
        console.log('浣跨敤returnUrl鍙傛暟杩斿洖:', decodeURIComponent(returnUrl)); // decodeURIComponent added
        window.location.href = decodeURIComponent(returnUrl); // decodeURIComponent added
        return;
    }
    
    // 3. 濡傛灉鏄湪iframe涓墦寮€鐨勶紝灏濊瘯鍏抽棴iframe
    if (closeEmbeddedPlayer()) {
        console.log('鍏抽棴浜嗗祵鍏ュ紡鎾斁鍣?);
        return;
    }
    
    // 4. 鍏舵灏濊瘯浠巐ocalStorage涓幏鍙栦笂涓€椤礥RL
    const lastPageUrl = localStorage.getItem('lastPageUrl');
    if (lastPageUrl && lastPageUrl !== window.location.href) {
        console.log('浠巐ocalStorage杩斿洖:', lastPageUrl);
        window.location.href = lastPageUrl;
        return;
    }
    
    // 5. 妫€鏌eferrer鏄惁鏄湁鏁堢殑绔欏唴椤甸潰
    if (referrer && 
        referrer !== window.location.href && 
        (referrer.includes(window.location.hostname) || referrer.startsWith('/'))) {
        console.log('杩斿洖referrer椤甸潰:', referrer);
        window.location.href = referrer;
        return;
    }
    
    // 6. 閮戒笉婊¤冻鏃讹紝杩斿洖棣栭〉
    console.log('杩斿洖棣栭〉');
    window.location.href = '/';
}

// 椤甸潰鍔犺浇鏃朵繚瀛樺綋鍓峌RL鍒發ocalStorage锛屼綔涓鸿繑鍥炵洰鏍?window.addEventListener('load', function() {
    // 淇濆瓨鍓嶄竴椤甸潰URL
    if (document.referrer && document.referrer !== window.location.href) {
        localStorage.setItem('lastPageUrl', document.referrer);
    }
    
    // 鎻愬彇褰撳墠URL涓殑閲嶈鍙傛暟锛屼互渚垮湪闇€瑕佹椂鑳藉鎭㈠褰撳墠椤甸潰
    const urlParams = new URLSearchParams(window.location.search);
    const videoId = urlParams.get('id');
    const sourceCode = urlParams.get('source');
    
    if (videoId && sourceCode) {
        // 淇濆瓨褰撳墠鎾斁鐘舵€侊紝浠ヤ究鍏朵粬椤甸潰鍙互杩斿洖
        localStorage.setItem('currentPlayingId', videoId);
        localStorage.setItem('currentPlayingSource', sourceCode);
    }
});


// =================================
// ============== PLAYER ==========
// =================================
// 鍏ㄥ眬鍙橀噺
let currentVideoTitle = '';
let currentEpisodeIndex = 0;
let currentEpisodes = [];
let episodesReversed = false;
let dp = null;
let currentHls = null; // 璺熻釜褰撳墠HLS瀹炰緥
let autoplayEnabled = true; // 榛樿寮€鍚嚜鍔ㄨ繛鎾?let isUserSeeking = false; // 璺熻釜鐢ㄦ埛鏄惁姝ｅ湪鎷栧姩杩涘害鏉?let videoHasEnded = false; // 璺熻釜瑙嗛鏄惁宸茬粡鑷劧缁撴潫
let userClickedPosition = null; // 璁板綍鐢ㄦ埛鐐瑰嚮鐨勪綅缃?let shortcutHintTimeout = null; // 鐢ㄤ簬鎺у埗蹇嵎閿彁绀烘樉绀烘椂闂?let adFilteringEnabled = true; // 榛樿寮€鍚箍鍛婅繃婊?let progressSaveInterval = null; // 瀹氭湡淇濆瓨杩涘害鐨勮鏃跺櫒
let currentVideoUrl = ''; // 璁板綍褰撳墠瀹為檯鐨勮棰慤RL

// 椤甸潰鍔犺浇
document.addEventListener('DOMContentLoaded', function() {
    // 鍏堟鏌ョ敤鎴锋槸鍚﹀凡閫氳繃瀵嗙爜楠岃瘉
    if (!isPasswordVerified()) {
        // 闅愯棌鍔犺浇鎻愮ず
        document.getElementById('loading').style.display = 'none';
        return;
    }

    initializePageContent();
});

// 鐩戝惉瀵嗙爜楠岃瘉鎴愬姛浜嬩欢
document.addEventListener('passwordVerified', () => {
    document.getElementById('loading').style.display = 'block';

    initializePageContent();
});

// 鍒濆鍖栭〉闈㈠唴瀹?function initializePageContent() {
    // 瑙ｆ瀽URL鍙傛暟
    const urlParams = new URLSearchParams(window.location.search);
    let videoUrl = urlParams.get('url');
    const title = urlParams.get('title');
    const sourceCode = urlParams.get('source_code');
    let index = parseInt(urlParams.get('index') || '0');
    const episodesList = urlParams.get('episodes'); // 浠嶶RL鑾峰彇闆嗘暟淇℃伅
    const savedPosition = parseInt(urlParams.get('position') || '0'); // 鑾峰彇淇濆瓨鐨勬挱鏀句綅缃?      // 瑙ｅ喅鍘嗗彶璁板綍闂锛氭鏌RL鏄惁鏄痯layer.html寮€澶寸殑閾炬帴
    // 濡傛灉鏄紝璇存槑杩欐槸鍘嗗彶璁板綍閲嶅畾鍚戯紝闇€瑕佽В鏋愮湡瀹炵殑瑙嗛URL
    if (videoUrl && videoUrl.includes('player.html')) {
        console.log('妫€娴嬪埌鍘嗗彶璁板綍閲嶅畾鍚慤RL:', videoUrl);
        try {
            // 灏濊瘯浠庡祵濂桿RL涓彁鍙栫湡瀹炵殑瑙嗛閾炬帴
            const nestedUrlParams = new URLSearchParams(videoUrl.split('?')[1]);
            // 浠庡祵濂楀弬鏁颁腑鑾峰彇鐪熷疄瑙嗛URL
            const nestedVideoUrl = nestedUrlParams.get('url');
            // 妫€鏌ュ祵濂桿RL鏄惁鍖呭惈鎾斁浣嶇疆淇℃伅
            const nestedPosition = nestedUrlParams.get('position');
            const nestedIndex = nestedUrlParams.get('index');
            const nestedTitle = nestedUrlParams.get('title');
            
            if (nestedVideoUrl) {
                videoUrl = nestedVideoUrl;
                console.log('宸蹭慨姝ｄ负鐪熷疄瑙嗛URL:', videoUrl);
                
                // 鏇存柊褰撳墠URL鍙傛暟
                const url = new URL(window.location.href);
                if (!urlParams.has('position') && nestedPosition) {
                    url.searchParams.set('position', nestedPosition);
                }
                if (!urlParams.has('index') && nestedIndex) {
                    url.searchParams.set('index', nestedIndex);
                }
                if (!urlParams.has('title') && nestedTitle) {
                    url.searchParams.set('title', nestedTitle);
                }
                // 鏇挎崲褰撳墠URL
                window.history.replaceState({}, '', url);
                console.log('浠庡祵濂桿RL鎻愬彇鍙傛暟:', {position: nestedPosition, index: nestedIndex});
            } else {
                console.warn('鏃犳硶浠庨噸瀹氬悜URL涓彁鍙栬棰戦摼鎺?);
                showError('鍘嗗彶璁板綍閾炬帴鏃犳晥锛岃杩斿洖棣栭〉閲嶆柊璁块棶');
            }
        } catch (e) {
            console.error('瑙ｆ瀽宓屽URL鍑洪敊:', e);
        }
    }
    
    // 淇濆瓨褰撳墠瑙嗛URL
    currentVideoUrl = videoUrl || '';

    // 浠巐ocalStorage鑾峰彇鏁版嵁
    currentVideoTitle = title || localStorage.getItem('currentVideoTitle') || '鏈煡瑙嗛';
    currentEpisodeIndex = index;
    
    // 璁剧疆鑷姩杩炴挱寮€鍏崇姸鎬?    autoplayEnabled = localStorage.getItem('autoplayEnabled') !== 'false'; // 榛樿涓簍rue
    document.getElementById('autoplayToggle').checked = autoplayEnabled;
    
    // 鑾峰彇骞垮憡杩囨护璁剧疆
    adFilteringEnabled = localStorage.getItem(PLAYER_CONFIG.adFilteringStorage) !== 'false'; // 榛樿涓簍rue
    
    // 鐩戝惉鑷姩杩炴挱寮€鍏冲彉鍖?    document.getElementById('autoplayToggle').addEventListener('change', function(e) {
        autoplayEnabled = e.target.checked;
        localStorage.setItem('autoplayEnabled', autoplayEnabled);
    });
    
    // 浼樺厛浣跨敤URL浼犻€掔殑闆嗘暟淇℃伅锛屽惁鍒欎粠localStorage鑾峰彇
    try {
        if (episodesList) {
            // 濡傛灉URL涓湁闆嗘暟鏁版嵁锛屼紭鍏堜娇鐢ㄥ畠
            currentEpisodes = JSON.parse(decodeURIComponent(episodesList));
            console.log('浠嶶RL鎭㈠闆嗘暟淇℃伅:', currentEpisodes.length);
        } else {
            // 鍚﹀垯浠巐ocalStorage鑾峰彇
            currentEpisodes = JSON.parse(localStorage.getItem('currentEpisodes') || '[]');
            console.log('浠巐ocalStorage鎭㈠闆嗘暟淇℃伅:', currentEpisodes.length);
        }
        
        // 妫€鏌ラ泦鏁扮储寮曟槸鍚︽湁鏁堬紝濡傛灉鏃犳晥鍒欒皟鏁翠负0
        if (index < 0 || (currentEpisodes.length > 0 && index >= currentEpisodes.length)) {
            console.warn(`鏃犳晥鐨勫墽闆嗙储寮?${index}锛岃皟鏁翠负鑼冨洿鍐呯殑鍊糮);
            
            // 濡傛灉绱㈠紩澶ぇ锛屽垯浣跨敤鏈€澶ф湁鏁堢储寮?            if (index >= currentEpisodes.length && currentEpisodes.length > 0) {
                index = currentEpisodes.length - 1;
            } else {
                index = 0;
            }
            
            // 鏇存柊URL浠ュ弽鏄犱慨姝ｅ悗鐨勭储寮?            const newUrl = new URL(window.location.href);
            newUrl.searchParams.set('index', index);
            window.history.replaceState({}, '', newUrl);
        }
        
        // 鏇存柊褰撳墠绱㈠紩涓洪獙璇佽繃鐨勫€?        currentEpisodeIndex = index;
        
        episodesReversed = localStorage.getItem('episodesReversed') === 'true';
    } catch (e) {
        console.error('鑾峰彇闆嗘暟淇℃伅澶辫触:', e);
        currentEpisodes = [];
        currentEpisodeIndex = 0;
        episodesReversed = false;
    }

    // 璁剧疆椤甸潰鏍囬
    document.title = currentVideoTitle + ' - LibreTV鎾斁鍣?;
    document.getElementById('videoTitle').textContent = currentVideoTitle;

    // 鍒濆鍖栨挱鏀惧櫒
    if (videoUrl) {
        initPlayer(videoUrl, sourceCode);
    } else {
        showError('鏃犳晥鐨勮棰戦摼鎺?);
    }

    // 鏇存柊闆嗘暟淇℃伅
    updateEpisodeInfo();
    
    // 娓叉煋闆嗘暟鍒楄〃
    renderEpisodes();
    
    // 鏇存柊鎸夐挳鐘舵€?    updateButtonStates();
    
    // 鏇存柊鎺掑簭鎸夐挳鐘舵€?    updateOrderButton();

    // 娣诲姞瀵硅繘搴︽潯鐨勭洃鍚紝纭繚鐐瑰嚮鍑嗙‘璺宠浆
    setTimeout(() => {
        setupProgressBarPreciseClicks();
    }, 1000);

    // 娣诲姞閿洏蹇嵎閿簨浠剁洃鍚?    document.addEventListener('keydown', handleKeyboardShortcuts);

    // 娣诲姞椤甸潰绂诲紑浜嬩欢鐩戝惉锛屼繚瀛樻挱鏀句綅缃?    window.addEventListener('beforeunload', saveCurrentProgress);

    // 鏂板锛氶〉闈㈤殣钘忥紙鍒囧悗鍙?鍒囨爣绛撅級鏃朵篃淇濆瓨
    document.addEventListener('visibilitychange', function() {
        if (document.visibilityState === 'hidden') {
            saveCurrentProgress();
        }
    });

    // 鏂板锛氳棰戞殏鍋滄椂涔熶繚瀛?    // 闇€纭繚 dp.video 宸插垵濮嬪寲
    const waitForVideo = setInterval(() => {
        if (dp && dp.video) {
            dp.video.addEventListener('pause', saveCurrentProgress);

            // 鏂板锛氭挱鏀捐繘搴﹀彉鍖栨椂鑺傛祦淇濆瓨
            let lastSave = 0;
            dp.video.addEventListener('timeupdate', function() {
                const now = Date.now();
                if (now - lastSave > 5000) { // 姣?绉掓渶澶氫繚瀛樹竴娆?                    saveCurrentProgress();
                    lastSave = now;
                }
            });

            clearInterval(waitForVideo);
        }
    }, 200);
}

// 澶勭悊閿洏蹇嵎閿?function handleKeyboardShortcuts(e) {
    // 蹇界暐杈撳叆妗嗕腑鐨勬寜閿簨浠?    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    // Alt + 宸︾澶?= 涓婁竴闆?    if (e.altKey && e.key === 'ArrowLeft') {
        if (currentEpisodeIndex > 0) {
            playPreviousEpisode();
            showShortcutHint('涓婁竴闆?, 'left');
            e.preventDefault();
        }
    }
    
    // Alt + 鍙崇澶?= 涓嬩竴闆?    if (e.altKey && e.key === 'ArrowRight') {
        if (currentEpisodeIndex < currentEpisodes.length - 1) {
            playNextEpisode();
            showShortcutHint('涓嬩竴闆?, 'right');
            e.preventDefault();
        }
    }
}

// 鏄剧ず蹇嵎閿彁绀?function showShortcutHint(text, direction) {
    const hintElement = document.getElementById('shortcutHint');
    const textElement = document.getElementById('shortcutText');
    const iconElement = document.getElementById('shortcutIcon');
    
    // 娓呴櫎涔嬪墠鐨勮秴鏃?    if (shortcutHintTimeout) {
        clearTimeout(shortcutHintTimeout);
    }
    
    // 璁剧疆鏂囨湰鍜屽浘鏍囨柟鍚?    textElement.textContent = text;
    
    if (direction === 'left') {
        iconElement.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path>';
    } else {
        iconElement.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>';
    }
    
    // 鏄剧ず鎻愮ず
    hintElement.classList.add('show');
    
    // 涓ょ鍚庨殣钘?    shortcutHintTimeout = setTimeout(() => {
        hintElement.classList.remove('show');
    }, 2000);
}

// 鏍规嵁婧愪唬鐮佹煡鎵捐棰戞簮淇℃伅
function findSourceInfoByCode(sourceCode) {
    // 瀹氫箟瑙嗛婧愬垪琛?    const sources = [
        { code: 'iqy', name: '鐖卞鑹? },
        { code: 'tx', name: '鑵捐瑙嗛' },
        { code: 'mg', name: '鑺掓灉TV' },
        { code: 'yk', name: '浼橀叿' },
        { code: 'bjh', name: '鐧惧鍙? },
        { code: 'dy', name: '鎶栭煶' },
        { code: 'hz', name: '铏庣墮' },
        { code: 'blbl', name: '鍝斿摡鍝斿摡' },
        { code: 'wzbs', name: '鐜嬭€呯洿鎾? },
        { code: 'jy', name: '鏂楅奔' }
    ];
    
    if (!sourceCode) return null;
    
    return sources.find(source => source.code === sourceCode) || { code: sourceCode, name: '鏈煡鏉ユ簮' };
}

// 鑾峰彇瑙嗛鐨勫敮涓€ID
function getVideoId() {
    // 灏濊瘯浠庡綋鍓嶉〉闈RL涓彁鍙栧敮涓€鏍囪瘑
    const urlParams = new URLSearchParams(window.location.search);
    const id = urlParams.get('id');
    
    if (id) return id;
    
    // 濡傛灉娌℃湁ID锛屼娇鐢ㄥ綋鍓嶈棰慤RL鐨勬憳瑕佷綔涓烘爣璇?    if (currentVideoUrl) {
        // 鐢熸垚瑙嗛URL鐨勭畝鍖栨爣璇?        try {
            // 浣跨敤URL鐨勬渶鍚庝竴閮ㄥ垎浣滀负鏍囪瘑
            const urlParts = currentVideoUrl.split('/');
            const lastPart = urlParts[urlParts.length - 1].split('?')[0];
            
            if (lastPart) return 'video_' + lastPart.replace(/\W/g, '_');
        } catch (e) {
            console.error('鏃犳硶鐢熸垚鍞竴瑙嗛ID:', e);
        }
    }
    
    // 濡傛灉娌℃湁鏇村ソ鐨勬爣璇嗭紝浣跨敤褰撳墠鏃堕棿鎴?    return 'video_' + Date.now();
}

// 鍒濆鍖栨挱鏀惧櫒
function initPlayer(videoUrl, sourceCode) {
    if (!videoUrl) {
        showError('瑙嗛閾炬帴鏃犳晥');
        return;
    }
    
    // 闅愯棌閿欒鎻愮ず
    document.getElementById('error').style.display = 'none';
    
    // 鏄剧ず鍔犺浇鎸囩ず鍣?    const loadingElement = document.getElementById('loading');
    if (loadingElement) {
        loadingElement.style.display = 'flex';
    }
    
    // 鏍规嵁婧愪唬鐮佽皟鏁村鐞嗛€昏緫
    const sourceInfo = findSourceInfoByCode(sourceCode);
    const displayName = sourceInfo ? sourceInfo.name : '鏈煡鏉ユ簮';
    console.log(`姝ｅ湪浠?${displayName} 鍔犺浇瑙嗛...`);
    
    // 璁板綍褰撳墠瑙嗛URL
    currentVideoUrl = videoUrl;
    
    // 浣跨敤ArtPlayer API鍔犺浇瑙嗛
    if (window.playerAPI && typeof window.playerAPI.loadVideo === 'function') {
        // 鍑嗗瑙嗛鏁版嵁
        const videoData = {
            videoId: getVideoId(),
            currentEpisode: currentEpisodeIndex,
            title: currentVideoTitle,
            url: videoUrl,
            poster: ''
        };
        
        // 浣跨敤ArtPlayer API鍔犺浇瑙嗛
        window.playerAPI.loadVideo(videoData)
            .then(artPlayer => {
                // 瀛樺偍鍏ㄥ眬鎾斁鍣ㄥ疄渚嬪紩鐢?                dp = artPlayer;
                
                // 闅愯棌鍔犺浇鍔ㄧ敾
                if (loadingElement) {
                    loadingElement.style.display = 'none';
                }
                
                // 璁剧疆ArtPlayer浜嬩欢澶勭悊
                setupArtPlayerEvents();
                
                // 娣诲姞鍒板巻鍙茶褰?                saveToHistory();
                
                // 鍚姩瀹氭湡淇濆瓨鎾斁杩涘害
                startProgressSaveInterval();
            })
            .catch(error => {
                console.error('鍔犺浇瑙嗛澶辫触:', error);
                showError('瑙嗛鍔犺浇澶辫触: ' + (error.message || '鏈煡閿欒'));
            });
    } else {
        console.error('ArtPlayer API涓嶅彲鐢?);
        showError('鎾斁鍣ㄥ姞杞藉け璐? ArtPlayer API涓嶅彲鐢?);
    }
}

// 璁剧疆ArtPlayer浜嬩欢澶勭悊
function setupArtPlayerEvents() {
    if (!dp) return;
    
    // 浜嬩欢鏄犲皠 - 灏咥rtPlayer浜嬩欢鏄犲皠鍒板師DPlayer浜嬩欢澶勭悊鍑芥暟
    
    // 瑙嗛鍔犺浇瀹屾垚浜嬩欢
    dp.on('ready', function() {
        document.getElementById('loading').style.display = 'none';
        videoHasEnded = false; // 瑙嗛鍔犺浇鏃堕噸缃粨鏉熸爣蹇?        
        // 妫€鏌ユ槸鍚﹂渶瑕佹仮澶嶆挱鏀捐繘搴?        restorePlaybackPosition();
        
        // 璁剧疆杩涘害鏉＄偣鍑荤洃鍚?        setupProgressBarPreciseClicks();
        
        // 鍚姩闀挎寜涓ゅ€嶉€熷姛鑳?        setupLongPressSpeedControl();
    });
    
    // 閿欒澶勭悊
    dp.on('error', function(error) {
        // 濡傛灉姝ｅ湪鍒囨崲瑙嗛锛屽拷鐣ラ敊璇?        if (window.isSwitchingVideo) {
            console.log('姝ｅ湪鍒囨崲瑙嗛锛屽拷鐣ラ敊璇?);
            return;
        }
        
        console.error('鎾斁鍣ㄩ敊璇?', error);
        showError('瑙嗛鎾斁澶辫触: ' + (error.message || '鏈煡閿欒'));
    });
    
    // 瑙嗛鎾斁缁撴潫浜嬩欢
    dp.on('video:ended', function() {
        videoHasEnded = true;
        console.log('瑙嗛鎾斁缁撴潫');
        
        // 濡傛灉鑷姩鎾斁涓嬩竴闆嗗紑鍚紝涓旂‘瀹炴湁涓嬩竴闆?        if (autoplayEnabled && currentEpisodeIndex < currentEpisodes.length - 1) {
            console.log('鑷姩鎾斁涓嬩竴闆?..');
            setTimeout(() => playNextEpisode(), 1500);
        }
    });
    
    // 鍏ㄥ睆妯″紡澶勭悊
    dp.on('fullscreen', function() {
        if (window.screen.orientation && window.screen.orientation.lock) {
            window.screen.orientation.lock('landscape')
            .then(() => {
                console.log('灞忓箷宸查攣瀹氫负妯悜妯″紡');
            })
            .catch((error) => {
                console.warn('鏃犳硶閿佸畾灞忓箷鏂瑰悜:', error);
            });
        }
    });
    
    // 閫€鍑哄叏灞忔ā寮?    dp.on('fullscreen_cancel', function() {
        if (window.screen.orientation && window.screen.orientation.unlock) {
            window.screen.orientation.unlock();
        }
    });
}

// 鎭㈠鎾斁杩涘害
function restorePlaybackPosition() {
    if (!dp || !dp.duration) return;
    
    // 浼樺厛浣跨敤URL浼犻€掔殑position鍙傛暟
    const urlParams = new URLSearchParams(window.location.search);
    const savedPosition = parseInt(urlParams.get('position') || '0');
    
    if (savedPosition > 10 && savedPosition < dp.duration - 2) {
        // 濡傛灉URL涓湁鏈夋晥鐨勬挱鏀句綅缃弬鏁帮紝鐩存帴浣跨敤瀹?        dp.currentTime = savedPosition;
        showPositionRestoreHint(savedPosition);
    } else {
        // 鍚﹀垯灏濊瘯浠庢湰鍦板瓨鍌ㄦ仮澶嶆挱鏀捐繘搴?        try {
            const progressKey = 'videoProgress_' + getVideoId();
            const progressStr = localStorage.getItem(progressKey);
            if (progressStr && dp.duration > 0) {
                const progress = JSON.parse(progressStr);
                if (
                    progress &&
                    typeof progress.position === 'number' &&
                    progress.position > 10 &&
                    progress.position < dp.duration - 2
                ) {
                    dp.currentTime = progress.position;
                    showPositionRestoreHint(progress.position);
                }
            }
        } catch (e) {
            console.error('鎭㈠鎾斁杩涘害澶辫触:', e);
        }
    }
}

// 鏄剧ず鎭㈠鎾斁浣嶇疆鎻愮ず
function showPositionRestoreHint(position) {
    if (!dp) return;
    
    // 鏍煎紡鍖栨椂闂?    const formatTime = seconds => {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        return `${h > 0 ? h + ':' : ''}${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };
    
    // 鏄剧ず鎻愮ず
    showToast(`宸叉仮澶嶅埌 ${formatTime(position)} 澶勭户缁挱鏀綻);
}

// 璁剧疆蹇繘蹇€€鐨勫揩鎹烽敭
function setupPlayerShortcuts() {
    if (!dp) return;
    
    // 娣诲姞榧犳爣鍙屽嚮浜嬩欢鍏ㄥ睆
    dp.video.addEventListener('dblclick', function() {
        if (typeof dp.fullscreen === 'function') {
            dp.fullscreen.toggle();
        }
    });
}

// 閲嶅啓鎾斁鍣ㄩ敊璇鐞嗗嚱鏁?function handlePlayerError() {
    if (!dp) return;
    
    dp.on('error', function() {
        // 濡傛灉姝ｅ湪鍒囨崲瑙嗛锛屽拷鐣ラ敊璇?        if (window.isSwitchingVideo) {
            console.log('姝ｅ湪鍒囨崲瑙嗛锛屽拷鐣ラ敊璇?);
            return;
        }
        
        // 妫€鏌ヨ棰戞槸鍚﹀凡缁忓湪鎾斁
        if (dp.video && dp.video.currentTime > 1) {
            console.log('鍙戠敓閿欒锛屼絾瑙嗛宸插湪鎾斁涓紝蹇界暐');
            return;
        }
        showError('瑙嗛鎾斁澶辫触锛岃妫€鏌ヨ棰戞簮鎴栫綉缁滆繛鎺?);
    });
}

// 娣诲姞绉诲姩绔暱鎸変袱鍊嶉€熸挱鏀惧姛鑳藉拰鐩戝惉鍣?function setupPlayerEventListeners() {
    if (!dp) return;
    
    // 璁剧疆闀挎寜涓ゅ€嶉€熷姛鑳?    setupLongPressSpeedControl();
    
    // 娣诲姞seeking鍜宻eeked浜嬩欢鐩戝惉鍣紝浠ユ娴嬬敤鎴锋槸鍚﹀湪鎷栧姩杩涘害鏉?    dp.on('seeking', function() {
        isUserSeeking = true;
        videoHasEnded = false; // 閲嶇疆瑙嗛缁撴潫鏍囧織
        
        // 濡傛灉鏄敤鎴烽€氳繃鐐瑰嚮杩涘害鏉¤缃殑浣嶇疆锛岀‘淇濆噯纭烦杞?        if (userClickedPosition !== null && dp.video) {
            // 纭繚鐢ㄦ埛鐨勭偣鍑讳綅缃姝ｇ‘搴旂敤锛岄伩鍏嶈嚜鍔ㄨ烦鑷宠棰戞湯灏?            const clickedTime = userClickedPosition;
            
            // 闃叉璺宠浆鍒拌棰戠粨灏?            if (Math.abs(dp.video.duration - clickedTime) < 0.5) {
                // 濡傛灉鐐瑰嚮鐨勪綅缃潪甯告帴杩戠粨灏撅紝绋嶅井鍑忓皯涓€鐐规椂闂?                dp.video.currentTime = Math.max(0, clickedTime - 0.5);
            } else {
                dp.video.currentTime = clickedTime;
            }
            
            // 娓呴櫎璁板綍鐨勪綅缃?            setTimeout(() => {
                userClickedPosition = null;
            }, 200);
        }
    });
    
    // 鏀硅繘seeked浜嬩欢澶勭悊
    dp.on('seeked', function() {
        // 濡傛灉瑙嗛璺宠浆鍒颁簡闈炲父鎺ヨ繎缁撳熬鐨勪綅缃?灏忎簬0.3绉?锛屼笖涓嶆槸鑷劧鎾斁鍒版澶?        if (dp.video && dp.video.duration > 0) {
            const timeFromEnd = dp.video.duration - dp.video.currentTime;
            if (timeFromEnd < 0.3 && isUserSeeking) {
                // 灏嗘挱鏀炬椂闂村線鍥炵Щ鍔ㄤ竴鐐圭偣锛岄伩鍏嶈Е鍙戠粨鏉熶簨浠?                dp.video.currentTime = Math.max(0, dp.video.currentTime - 1);
            }
        }
        
        // 寤惰繜閲嶇疆seeking鏍囧織锛屼互渚夸簬鍖哄垎鑷劧鎾斁缁撴潫鍜岀敤鎴锋嫋鎷?        setTimeout(() => {
            isUserSeeking = false;
        }, 200);
    });
    
    // 淇敼瑙嗛缁撴潫浜嬩欢鐩戝惉鍣紝娣诲姞棰濆妫€鏌?    dp.on('ended', function() {
        videoHasEnded = true; // 鏍囪瑙嗛宸茶嚜鐒剁粨鏉?        
        // 瑙嗛宸叉挱鏀惧畬锛屾竻闄ゆ挱鏀捐繘搴﹁褰?        clearVideoProgress();
        
        // 濡傛灉鍚敤浜嗚嚜鍔ㄨ繛鎾紝骞朵笖鏈変笅涓€闆嗗彲鎾斁锛屽垯鑷姩鎾斁涓嬩竴闆?        if (autoplayEnabled && currentEpisodeIndex < currentEpisodes.length - 1) {
            console.log('瑙嗛鎾斁缁撴潫锛岃嚜鍔ㄦ挱鏀句笅涓€闆?);
            // 绋嶉暱寤惰繜浠ョ‘淇濇墍鏈変簨浠跺鐞嗗畬鎴?            setTimeout(() => {
                // 纭涓嶆槸鍥犱负鐢ㄦ埛鎷栨嫿瀵艰嚧鐨勫亣缁撴潫浜嬩欢
                if (videoHasEnded && !isUserSeeking) {
                    playNextEpisode();
                    videoHasEnded = false; // 閲嶇疆鏍囧織
                }
            }, 1000);
        } else {
            console.log('瑙嗛鎾斁缁撴潫锛屾棤涓嬩竴闆嗘垨鏈惎鐢ㄨ嚜鍔ㄨ繛鎾?);
        }
    });
    
    // 娣诲姞浜嬩欢鐩戝惉浠ユ娴嬭繎瑙嗛鏈熬鐨勭偣鍑绘嫋鍔?    dp.on('timeupdate', function() {
        if (dp.video && dp.duration > 0) {
            // 濡傛灉瑙嗛鎺ヨ繎缁撳熬浣嗕笉鏄嚜鐒舵挱鏀惧埌缁撳熬锛岄噸缃嚜鐒剁粨鏉熸爣蹇?            if (isUserSeeking && dp.video.currentTime > dp.video.duration * 0.95) {
                videoHasEnded = false;
            }
        }
    });

    // 娣诲姞鍙屽嚮鍏ㄥ睆鏀寔
    dp.on('playing', () => {
        // 缁戝畾鍙屽嚮浜嬩欢鍒拌棰戝鍣?        dp.video.addEventListener('dblclick', () => {
            dp.fullScreen.toggle();
        });
    });

    // 10绉掑悗濡傛灉浠嶅湪鍔犺浇锛屼絾涓嶇珛鍗虫樉绀洪敊璇?    setTimeout(function() {
        // 濡傛灉瑙嗛宸茬粡鎾斁寮€濮嬶紝鍒欎笉鏄剧ず閿欒
        if (dp && dp.video && dp.video.currentTime > 0) {
            return;
        }
        
        if (document.getElementById('loading').style.display !== 'none') {
            document.getElementById('loading').innerHTML = `
                <div class="loading-spinner"></div>
                <div>瑙嗛鍔犺浇鏃堕棿杈冮暱锛岃鑰愬績绛夊緟...</div>
                <div style="font-size: 12px; color: #aaa; margin-top: 10px;">濡傞暱鏃堕棿鏃犲搷搴旓紝璇峰皾璇曞叾浠栬棰戞簮</div>
            `;
        }
    }, 10000);

    // 缁戝畾鍘熺敓鍏ㄥ睆锛欴Player 瑙﹀彂鍏ㄥ睆鏃惰皟鐢?requestFullscreen
    (function(){
        const fsContainer = document.getElementById('playerContainer');
        dp.on('fullscreen', () => {
            if (fsContainer.requestFullscreen) {
                fsContainer.requestFullscreen().catch(err => console.warn('鍘熺敓鍏ㄥ睆澶辫触:', err));
            }
        });
        dp.on('fullscreen_cancel', () => {
            if (document.fullscreenElement) {
                document.exitFullscreen();
            }
        });
    })();

// 鑷畾涔塎3U8 Loader鐢ㄤ簬杩囨护骞垮憡
// Only define if Hls is available
if (typeof Hls !== 'undefined' && Hls.DefaultConfig && Hls.DefaultConfig.loader) {
    class CustomHlsJsLoader extends Hls.DefaultConfig.loader {
        constructor(config) {
            super(config);
            const load = this.load.bind(this);
            this.load = function(context, config, callbacks) {
                // 鎷︽埅manifest鍜宭evel璇锋眰
                if (context.type === 'manifest' || context.type === 'level') {
                    const onSuccess = callbacks.onSuccess;
                    callbacks.onSuccess = function(response, stats, context) {
                        // 濡傛灉鏄痬3u8鏂囦欢锛屽鐞嗗唴瀹逛互绉婚櫎骞垮憡鍒嗘
                        if (response.data && typeof response.data === 'string') {
                            // 杩囨护鎺夊箍鍛婃 - 瀹炵幇鏇寸簿纭殑骞垮憡杩囨护閫昏緫
                            response.data = filterAdsFromM3U8(response.data, true);
                        }
                        return onSuccess(response, stats, context);
                    };
                }
                // 鎵ц鍘熷load鏂规硶
                load(context, config, callbacks);
            };
        }
    }
}

// 杩囨护鍙枒鐨勫箍鍛婂唴瀹?function filterAdsFromM3U8(m3u8Content, strictMode = false) {
    if (!m3u8Content) return '';

    // 鎸夎鍒嗗壊M3U8鍐呭
    const lines = m3u8Content.split('\n');
    const filteredLines = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // 鍙繃婊?EXT-X-DISCONTINUITY鏍囪瘑
        if (!line.includes('#EXT-X-DISCONTINUITY')) {
            filteredLines.push(line);
        }
    }

    return filteredLines.join('\n');
}


// 鏄剧ず閿欒
function showError(message) {
    // 鍦ㄨ棰戝凡缁忔挱鏀剧殑鎯呭喌涓嬩笉鏄剧ず閿欒
    if (dp && dp.video && dp.video.currentTime > 1) {
        console.log('蹇界暐閿欒:', message);
        return;
    }
    
    document.getElementById('loading').style.display = 'none';
    document.getElementById('error').style.display = 'flex';
    document.getElementById('error-message').textContent = message;
}

// 鏇存柊闆嗘暟淇℃伅
function updateEpisodeInfo() {
    if (currentEpisodes.length > 0) {
        document.getElementById('episodeInfo').textContent = `绗?${currentEpisodeIndex + 1}/${currentEpisodes.length} 闆哷;
    } else {
        document.getElementById('episodeInfo').textContent = '鏃犻泦鏁颁俊鎭?;
    }
}

// 鏇存柊鎸夐挳鐘舵€?function updateButtonStates() {
    const prevButton = document.getElementById('prevButton');
    const nextButton = document.getElementById('nextButton');
    
    // 澶勭悊涓婁竴闆嗘寜閽?    if (currentEpisodeIndex > 0) {
        prevButton.classList.remove('bg-gray-700', 'cursor-not-allowed');
        prevButton.classList.add('bg-[#222]', 'hover:bg-[#333]');
        prevButton.removeAttribute('disabled');
    } else {
        prevButton.classList.add('bg-gray-700', 'cursor-not-allowed');
        prevButton.classList.remove('bg-[#222]', 'hover:bg-[#333]');
        prevButton.setAttribute('disabled', '');
    }
    
    // 澶勭悊涓嬩竴闆嗘寜閽?    if (currentEpisodeIndex < currentEpisodes.length - 1) {
        nextButton.classList.remove('bg-gray-700', 'cursor-not-allowed');
        nextButton.classList.add('bg-[#222]', 'hover:bg-[#333]');
        nextButton.removeAttribute('disabled');
    } else {
        nextButton.classList.add('bg-gray-700', 'cursor-not-allowed');
        nextButton.classList.remove('bg-[#222]', 'hover:bg-[#333]');
        nextButton.setAttribute('disabled', '');
    }
}

// 娓叉煋闆嗘暟鎸夐挳
function renderEpisodes() {
    const episodesList = document.getElementById('episodesList');
    if (!episodesList) return;
    
    if (!currentEpisodes || currentEpisodes.length === 0) {
        episodesList.innerHTML = '<div class="col-span-full text-center text-gray-400 py-8">娌℃湁鍙敤鐨勯泦鏁?/div>';
        return;
    }
    
    const episodes = episodesReversed ? [...currentEpisodes].reverse() : currentEpisodes;
    let html = '';
    
    episodes.forEach((episode, index) => {
        // 鏍规嵁鍊掑簭鐘舵€佽绠楃湡瀹炵殑鍓ч泦绱㈠紩
        const realIndex = episodesReversed ? currentEpisodes.length - 1 - index : index;
        const isActive = realIndex === currentEpisodeIndex;
        
        html += `
            <button id="episode-${realIndex}" 
                    onclick="playEpisode(${realIndex})" 
                    class="px-4 py-2 ${isActive ? 'episode-active' : '!bg-[#222] hover:!bg-[#333] hover:!shadow-none'} !border ${isActive ? '!border-blue-500' : '!border-[#333]'} rounded-lg transition-colors text-center episode-btn">
                绗?{realIndex + 1}闆?            </button>
        `;
    });
    
    episodesList.innerHTML = html;
}

// 鎾斁鎸囧畾闆嗘暟
function playEpisode(index) {
    // 纭繚index鍦ㄦ湁鏁堣寖鍥村唴
    if (index < 0 || index >= currentEpisodes.length) {
        console.error(`鏃犳晥鐨勫墽闆嗙储寮? ${index}, 褰撳墠鍓ч泦鏁伴噺: ${currentEpisodes.length}`);
        showToast(`鏃犳晥鐨勫墽闆嗙储寮? ${index + 1}锛屽綋鍓嶅墽闆嗘€绘暟: ${currentEpisodes.length}`);
        return;
    }
    
    // 淇濆瓨褰撳墠鎾斁杩涘害锛堝鏋滄鍦ㄦ挱鏀撅級
    if (dp && dp.video && !dp.video.paused && !videoHasEnded) {
        saveCurrentProgress();
    }
    
    // 娓呴櫎杩涘害淇濆瓨璁℃椂鍣?    if (progressSaveInterval) {
        clearInterval(progressSaveInterval);
        progressSaveInterval = null;
    }
    
    // 棣栧厛闅愯棌涔嬪墠鍙兘鏄剧ず鐨勯敊璇?    document.getElementById('error').style.display = 'none';
    // 鏄剧ず鍔犺浇鎸囩ず鍣?    document.getElementById('loading').style.display = 'flex';
    document.getElementById('loading').innerHTML = `
        <div class="loading-spinner"></div>
        <div>姝ｅ湪鍔犺浇瑙嗛...</div>
    `;
    
    const url = currentEpisodes[index];
    // 鏇存柊鍏ㄥ眬URL璁板綍
    currentVideoUrl = url;
    currentEpisodeIndex = index;
    videoHasEnded = false; // 閲嶇疆瑙嗛缁撴潫鏍囧織
    
    // 鏂板锛氭竻闄や箣鍓嶇殑鎾斁浣嶇疆璁板綍锛岀‘淇濆垏鎹㈤€夐泦鍚庝粠澶村紑濮嬫挱鏀?    clearVideoProgress();
    
    // 鑾峰彇褰撳墠URL鐨勬墍鏈夊弬鏁?    const currentUrl = new URL(window.location.href);
    const urlParams = currentUrl.searchParams;
    const sourceName = urlParams.get('source') || ''; 
    const sourceCode = urlParams.get('source_code') || '';
    const videoId = urlParams.get('id') || '';
    const returnUrl = urlParams.get('returnUrl') || '';
    
    // 鏋勫缓鏂扮殑URL锛屼繚鎸佹煡璇㈠弬鏁颁絾鏇存柊index鍜寀rl
    const newUrl = new URL(window.location.origin + window.location.pathname);
    // 淇濈暀鎵€鏈夊師濮嬪弬鏁?    for(const [key, value] of urlParams.entries()) {
        newUrl.searchParams.set(key, value);
    }
    // 鏇存柊闇€瑕佸彉鏇寸殑鍙傛暟
    newUrl.searchParams.set('index', index);
    newUrl.searchParams.set('url', url);
    // 绉婚櫎position鍙傛暟锛岀‘淇濅笉浼氫粠璁板綍鐨勪綅缃紑濮嬫挱鏀?    newUrl.searchParams.delete('position');
    
    // 浣跨敤replaceState鏇存柊URL锛岃繖鏍蜂笉浼氬鍔犳祻瑙堝巻鍙茶褰?    window.history.replaceState({}, '', newUrl);
    
    // 鏇存柊鎾斁鍣?    if (dp) {
        try {
            // 妫€娴嬫槸鍚︿负Safari娴忚鍣ㄦ垨iOS璁惧
            const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
            const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
            
            if (isSafari || isIOS) {
                // Safari鎴杋OS璁惧锛氬畬鍏ㄩ噸鏂板垵濮嬪寲鎾斁鍣?                console.log('妫€娴嬪埌Safari鎴杋OS璁惧锛岄噸鏂板垵濮嬪寲鎾斁鍣?);

                // 鏍囪姝ｅ湪鍒囨崲瑙嗛锛岄伩鍏嶉敊璇鐞?                window.isSwitchingVideo = true;
                
                // 濡傛灉瀛樺湪鏃х殑鎾斁鍣ㄥ疄渚嬶紝鍏堥攢姣佸畠
                if (dp && dp.destroy) {
                    try {
                        dp.destroy();
                    } catch (e) {
                        console.warn('閿€姣佹棫鎾斁鍣ㄥ疄渚嬪嚭閿?', e);
                    }
                }
                
                // 閲嶆柊鍒濆鍖栨挱鏀惧櫒
                initPlayer(url, sourceCode);

                // 寤惰繜閲嶇疆鏍囪
                setTimeout(() => {
                    window.isSwitchingVideo = false;
                }, 1000);
            } else {
                // 鍏朵粬娴忚鍣ㄤ娇鐢ㄦ甯哥殑switchVideo鏂规硶
                if (dp.video) {
                    // 鏇存柊source鍏冪礌
                    const sources = dp.video.querySelectorAll('source');
                    sources.forEach(source => source.src = url);
                }
                
                dp.switchVideo({
                    url: url,
                    type: 'hls'
                });
            }
            
            // 纭繚鎾斁寮€濮?            if (dp) {
                const playPromise = dp.play();
                if (playPromise !== undefined) {
                    playPromise.catch(error => {
                        console.warn('鎾斁澶辫触锛屽皾璇曢噸鏂板垵濮嬪寲:', error);
                        // 濡傛灉鍒囨崲瑙嗛澶辫触锛岄噸鏂板垵濮嬪寲鎾斁鍣?                        initPlayer(url, sourceCode);
                    });
                }
            }
        } catch (e) {
            console.error('鍒囨崲瑙嗛鍑洪敊锛屽皾璇曢噸鏂板垵濮嬪寲:', e);
            // 濡傛灉鍑洪敊锛岄噸鏂板垵濮嬪寲鎾斁鍣?            initPlayer(url, sourceCode);
        }
    } else {
        initPlayer(url, sourceCode);
    }
    
    // 鏇存柊UI
    updateEpisodeInfo();
    updateButtonStates();
    renderEpisodes();

    // 閲嶇疆鐢ㄦ埛鐐瑰嚮浣嶇疆璁板綍
    userClickedPosition = null;
    
    // 涓夌鍚庝繚瀛樺埌鍘嗗彶璁板綍
    setTimeout(() => saveToHistory(), 3000);
}

// 鎾斁涓婁竴闆?function playPreviousEpisode() {
    if (currentEpisodeIndex > 0) {
        playEpisode(currentEpisodeIndex - 1);
    }
}

// 鎾斁涓嬩竴闆?function playNextEpisode() {
    if (currentEpisodeIndex < currentEpisodes.length - 1) {
        playEpisode(currentEpisodeIndex + 1);
    }
}

// 澶嶅埗鎾斁閾炬帴
function copyLinks() {
    // 灏濊瘯浠嶶RL涓幏鍙栧弬鏁?    const urlParams = new URLSearchParams(window.location.search);
    const linkUrl = urlParams.get('url') || '';
    if (linkUrl !== '') {
        navigator.clipboard.writeText(linkUrl).then(() => {
            showToast('鎾斁閾炬帴宸插鍒?, 'success');
        }).catch(err => {
            showToast('澶嶅埗澶辫触锛岃妫€鏌ユ祻瑙堝櫒鏉冮檺', 'error');
        });
    }
}

// 鍒囨崲闆嗘暟鎺掑簭
function toggleEpisodeOrder() {
    episodesReversed = !episodesReversed;
    
    // 淇濆瓨鍒發ocalStorage
    localStorage.setItem('episodesReversed', episodesReversed);
    
    // 閲嶆柊娓叉煋闆嗘暟鍒楄〃
    renderEpisodes();
    
    // 鏇存柊鎺掑簭鎸夐挳
    updateOrderButton();
}

// 鏇存柊鎺掑簭鎸夐挳鐘舵€?function updateOrderButton() {
    const orderText = document.getElementById('orderText');
    const orderIcon = document.getElementById('orderIcon');
    
    if (orderText && orderIcon) {
        orderText.textContent = episodesReversed ? '姝ｅ簭鎺掑垪' : '鍊掑簭鎺掑垪';
        orderIcon.style.transform = episodesReversed ? 'rotate(180deg)' : '';
    }
}

// 璁剧疆杩涘害鏉″噯纭偣鍑诲鐞?function setupProgressBarPreciseClicks() {
    // 鏌ユ壘DPlayer鐨勮繘搴︽潯鍏冪礌
    const progressBar = document.querySelector('.dplayer-bar-wrap');
    if (!progressBar || !dp || !dp.video) return;
    
    // 绉婚櫎鍙兘瀛樺湪鐨勬棫浜嬩欢鐩戝惉鍣?    progressBar.removeEventListener('mousedown', handleProgressBarClick);
    
    // 娣诲姞鏂扮殑浜嬩欢鐩戝惉鍣?    progressBar.addEventListener('mousedown', handleProgressBarClick);
    
    // 鍦ㄧЩ鍔ㄧ涔熸坊鍔犺Е鎽镐簨浠舵敮鎸?    progressBar.removeEventListener('touchstart', handleProgressBarTouch);
    progressBar.addEventListener('touchstart', handleProgressBarTouch);
    
    console.log('杩涘害鏉＄簿纭偣鍑荤洃鍚櫒宸茶缃?);
}

// 澶勭悊杩涘害鏉＄偣鍑?function handleProgressBarClick(e) {
    if (!dp || !dp.video) return;
    
    // 璁＄畻鐐瑰嚮浣嶇疆鐩稿浜庤繘搴︽潯鐨勬瘮渚?    const rect = e.currentTarget.getBoundingClientRect();
    const percentage = (e.clientX - rect.left) / rect.width;
    
    // 璁＄畻鐐瑰嚮浣嶇疆瀵瑰簲鐨勮棰戞椂闂?    const duration = dp.video.duration;
    let clickTime = percentage * duration;
    
    // 澶勭悊瑙嗛鎺ヨ繎缁撳熬鐨勬儏鍐?    if (duration - clickTime < 1) {
        // 濡傛灉鐐瑰嚮浣嶇疆闈炲父鎺ヨ繎缁撳熬锛岀◢寰線鍓嶇Щ涓€鐐?        clickTime = Math.min(clickTime, duration - 1.5);
        console.log(`杩涘害鏉＄偣鍑绘帴杩戠粨灏撅紝璋冩暣鏃堕棿涓?${clickTime.toFixed(2)}/${duration.toFixed(2)}`);
    }
    
    // 璁板綍鐢ㄦ埛鐐瑰嚮鐨勪綅缃?    userClickedPosition = clickTime;
    
    // 杈撳嚭璋冭瘯淇℃伅
    console.log(`杩涘害鏉＄偣鍑? ${percentage.toFixed(4)}, 鏃堕棿: ${clickTime.toFixed(2)}/${duration.toFixed(2)}`);
    
    // 闃绘榛樿浜嬩欢浼犳挱锛岄伩鍏岲Player鍐呴儴閫昏緫灏嗚棰戣烦鑷虫湯灏?    e.stopPropagation();
    
    // 鐩存帴璁剧疆瑙嗛鏃堕棿
    dp.seek(clickTime);
}

// 澶勭悊绉诲姩绔Е鎽镐簨浠?function handleProgressBarTouch(e) {
    if (!dp || !dp.video || !e.touches[0]) return;
    
    const touch = e.touches[0];
    const rect = e.currentTarget.getBoundingClientRect();
    const percentage = (touch.clientX - rect.left) / rect.width;
    
    const duration = dp.video.duration;
    let clickTime = percentage * duration;
    
    // 澶勭悊瑙嗛鎺ヨ繎缁撳熬鐨勬儏鍐?    if (duration - clickTime < 1) {
        clickTime = Math.min(clickTime, duration - 1.5);
    }
    
    // 璁板綍鐢ㄦ埛鐐瑰嚮鐨勪綅缃?    userClickedPosition = clickTime;
    
    console.log(`杩涘害鏉¤Е鎽? ${percentage.toFixed(4)}, 鏃堕棿: ${clickTime.toFixed(2)}/${duration.toFixed(2)}`);
    
    e.stopPropagation();
    dp.seek(clickTime);
}

// 鍦ㄦ挱鏀惧櫒鍒濆鍖栧悗娣诲姞瑙嗛鍒板巻鍙茶褰?function saveToHistory() {
    // 纭繚 currentEpisodes 闈炵┖涓旀湁褰撳墠瑙嗛URL
    if (!currentEpisodes || currentEpisodes.length === 0 || !currentVideoUrl) {
        console.warn('娌℃湁鍙敤鐨勫墽闆嗗垪琛ㄦ垨瑙嗛URL锛屾棤娉曚繚瀛樺畬鏁寸殑鍘嗗彶璁板綍');
        return;
    }
    
    // 灏濊瘯浠嶶RL涓幏鍙栧弬鏁?    const urlParams = new URLSearchParams(window.location.search);
    const sourceName = urlParams.get('source') || '';
    const sourceCode = urlParams.get('source_code') || '';

    // 鑾峰彇褰撳墠鎾斁杩涘害
    let currentPosition = 0;
    let videoDuration = 0;
    
    if (dp && dp.video) {
        currentPosition = dp.video.currentTime;
        videoDuration = dp.video.duration;
    }

    // 鏋勫缓瑕佷繚瀛樼殑瑙嗛淇℃伅瀵硅薄
    const videoInfo = {
        title: currentVideoTitle,
        // 鐩存帴淇濆瓨鍘熷瑙嗛閾炬帴锛岃€岄潪鎾斁椤甸潰閾炬帴
        directVideoUrl: currentVideoUrl,
        // 瀹屾暣鐨勬挱鏀惧櫒URL
        url: `player.html?url=${encodeURIComponent(currentVideoUrl)}&title=${encodeURIComponent(currentVideoTitle)}&source=${encodeURIComponent(sourceName)}&source_code=${encodeURIComponent(sourceCode)}&index=${currentEpisodeIndex}&position=${Math.floor(currentPosition || 0)}`,
        episodeIndex: currentEpisodeIndex,
        sourceName: sourceName,
        timestamp: Date.now(),
        // 娣诲姞鎾斁杩涘害淇℃伅
        playbackPosition: currentPosition,
        duration: videoDuration,
        // 閲嶈锛氫繚瀛樺畬鏁寸殑闆嗘暟鍒楄〃锛岀‘淇濊繘琛屾繁鎷疯礉
        episodes: currentEpisodes && currentEpisodes.length > 0 ? [...currentEpisodes] : []
    };
    
    try {
        // 鑾峰彇鐜版湁鍘嗗彶璁板綍
        const history = JSON.parse(localStorage.getItem('viewingHistory') || '[]');
        
        // 妫€鏌ユ槸鍚﹀凡缁忓瓨鍦ㄧ浉鍚屾爣棰樼殑璁板綍锛堝悓涓€瑙嗛鐨勪笉鍚岄泦鏁帮級
        const existingIndex = history.findIndex(item => item.title === videoInfo.title);
        if (existingIndex !== -1) {
            // 瀛樺湪鍒欐洿鏂扮幇鏈夎褰曠殑闆嗘暟銆佹椂闂存埑鍜孶RL
            history[existingIndex].episodeIndex = currentEpisodeIndex;
            history[existingIndex].timestamp = Date.now();
            history[existingIndex].sourceName = sourceName;
            // 鏇存柊鍘熷瑙嗛URL
            history[existingIndex].directVideoUrl = currentVideoUrl;
            // 鏇存柊鎾斁杩涘害淇℃伅
            history[existingIndex].playbackPosition = currentPosition > 10 ? currentPosition : history[existingIndex].playbackPosition;
            history[existingIndex].duration = videoDuration || history[existingIndex].duration;
            // 鏇存柊瀹屾暣URL锛岀‘淇濆甫鏈夋纭殑瑙嗛閾炬帴
            history[existingIndex].url = videoInfo.url;
            // 鏇存柊闆嗘暟鍒楄〃锛堝鏋滄湁涓斾笌褰撳墠涓嶅悓锛?            if (currentEpisodes && currentEpisodes.length > 0) {
                // 妫€鏌ユ槸鍚﹂渶瑕佹洿鏂伴泦鏁版暟鎹紙閽堝涓嶅悓闀垮害鐨勯泦鏁板垪琛級
                if (!history[existingIndex].episodes || 
                    !Array.isArray(history[existingIndex].episodes) || 
                    history[existingIndex].episodes.length !== currentEpisodes.length) {
                    history[existingIndex].episodes = [...currentEpisodes]; // 娣辨嫹璐?                    console.log(`鏇存柊 "${currentVideoTitle}" 鐨勫墽闆嗘暟鎹? ${currentEpisodes.length}闆哷);
                }
            }
            
            // 绉诲埌鏈€鍓嶉潰
            const updatedItem = history.splice(existingIndex, 1)[0];
            history.unshift(updatedItem);
        } else {
            // 娣诲姞鏂拌褰曞埌鏈€鍓嶉潰
            console.log(`鍒涘缓鏂扮殑鍘嗗彶璁板綍: "${currentVideoTitle}", ${currentEpisodes.length}闆哷);
            history.unshift(videoInfo);
        }
        
        // 闄愬埗鍘嗗彶璁板綍鏁伴噺涓?0鏉?        if (history.length > 50) history.splice(50);
        
        localStorage.setItem('viewingHistory', JSON.stringify(history));
        console.log('鎴愬姛淇濆瓨鍘嗗彶璁板綍');
    } catch (e) {
        console.error('淇濆瓨瑙傜湅鍘嗗彶澶辫触:', e);
    }
}

// 鏄剧ず鎭㈠浣嶇疆鎻愮ず
function showPositionRestoreHint(position) {
    if (!position || position < 10) return;
    
    // 鍒涘缓鎻愮ず鍏冪礌
    const hint = document.createElement('div');
    hint.className = 'position-restore-hint';
    hint.innerHTML = `
        <div class="hint-content">
            宸蹭粠 ${formatTime(position)} 缁х画鎾斁
        </div>
    `;
    
    // 娣诲姞鍒版挱鏀惧櫒瀹瑰櫒
    const playerContainer = document.querySelector('.player-container'); // Ensure this selector is correct
    if (playerContainer) { // Check if playerContainer exists
        playerContainer.appendChild(hint);
    } else {
        console.warn("Player container not found for position hint.");
        return; // Exit if container not found
    }
    
    // 鏄剧ず鎻愮ず
    setTimeout(() => {
        hint.classList.add('show');
        
        // 3绉掑悗闅愯棌
        setTimeout(() => {
            hint.classList.remove('show');
            setTimeout(() => hint.remove(), 300);
        }, 3000);
    }, 100);
}

// 鏍煎紡鍖栨椂闂翠负 mm:ss 鏍煎紡
function formatTime(seconds) {
    if (isNaN(seconds)) return '00:00';
    
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
}

// 寮€濮嬪畾鏈熶繚瀛樻挱鏀捐繘搴?function startProgressSaveInterval() {
    // 娓呴櫎鍙兘瀛樺湪鐨勬棫璁℃椂鍣?    if (progressSaveInterval) {
        clearInterval(progressSaveInterval);
    }
    
    // 姣?0绉掍繚瀛樹竴娆℃挱鏀捐繘搴?    progressSaveInterval = setInterval(saveCurrentProgress, 30000);
}

// 淇濆瓨褰撳墠鎾斁杩涘害
function saveCurrentProgress() {
    if (!dp || !dp.video) return;
    const currentTime = dp.video.currentTime;
    const duration = dp.video.duration;
    if (!duration || currentTime < 1) return;

    // 鍦╨ocalStorage涓繚瀛樿繘搴?    const progressKey = `videoProgress_${getVideoId()}`;
    const progressData = {
        position: currentTime,
        duration: duration,
        timestamp: Date.now()
    };
    try {
        localStorage.setItem(progressKey, JSON.stringify(progressData));
        // --- 鏂板锛氬悓姝ユ洿鏂?viewingHistory 涓殑杩涘害 ---
        try {
            const historyRaw = localStorage.getItem('viewingHistory');
            if (historyRaw) {
                const history = JSON.parse(historyRaw);
                // 鐢?title + 闆嗘暟绱㈠紩鍞竴鏍囪瘑
                const idx = history.findIndex(item =>
                    item.title === currentVideoTitle &&
                    (item.episodeIndex === undefined || item.episodeIndex === currentEpisodeIndex)
                );
                if (idx !== -1) {
                    // 鍙湪杩涘害鏈夋槑鏄惧彉鍖栨椂鎵嶆洿鏂帮紝鍑忓皯鍐欏叆
                    if (
                        Math.abs((history[idx].playbackPosition || 0) - currentTime) > 2 ||
                        Math.abs((history[idx].duration || 0) - duration) > 2
                    ) {
                        history[idx].playbackPosition = currentTime;
                        history[idx].duration = duration;
                        history[idx].timestamp = Date.now();
                        localStorage.setItem('viewingHistory', JSON.stringify(history));
                    }
                }
            }
        } catch (e) {
            // 蹇界暐 viewingHistory 鏇存柊閿欒
        }
    } catch (e) {
        console.error('淇濆瓨鎾斁杩涘害澶辫触', e);
    }
}

// 璁剧疆绉诲姩绔暱鎸変袱鍊嶉€熸挱鏀惧姛鑳?function setupLongPressSpeedControl() {
    if (!dp || !dp.video) return;
    
    const playerElement = document.getElementById('player');
    let longPressTimer = null;
    let originalPlaybackRate = 1.0;
    let isLongPress = false;
    
    // 鏄剧ず蹇€熸彁绀?    function showSpeedHint(speed) {
        showShortcutHint(`${speed}鍊嶉€焋, 'right');
    }

    // 绂佺敤鍙抽敭
    playerElement.oncontextmenu =  () => {
        // 妫€娴嬫槸鍚︿负绉诲姩璁惧
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        
        // 鍙湪绉诲姩璁惧涓婄鐢ㄥ彸閿?        if (isMobile) {
            const dplayerMenu = document.querySelector(".dplayer-menu");
            const dplayerMask = document.querySelector(".dplayer-mask");
            if (dplayerMenu) dplayerMenu.style.display = "none";
            if (dplayerMask) dplayerMask.style.display = "none";
            return false;
        }
        return true; // 鍦ㄦ闈㈣澶囦笂鍏佽鍙抽敭鑿滃崟
    };
    
    // 瑙︽懜寮€濮嬩簨浠?    playerElement.addEventListener('touchstart', function(e) {
        // 妫€鏌ヨ棰戞槸鍚︽鍦ㄦ挱鏀撅紝濡傛灉娌℃湁鎾斁鍒欎笉瑙﹀彂闀挎寜鍔熻兘
        if (dp.video.paused) {
            return; // 瑙嗛鏆傚仠鏃朵笉瑙﹀彂闀挎寜鍔熻兘
        }
        
        // 淇濆瓨鍘熷鎾斁閫熷害
        originalPlaybackRate = dp.video.playbackRate;
        
        // 璁剧疆闀挎寜璁℃椂鍣?        longPressTimer = setTimeout(() => {
            // 鍐嶆妫€鏌ヨ棰戞槸鍚︿粛鍦ㄦ挱鏀?            if (dp.video.paused) {
                clearTimeout(longPressTimer);
                longPressTimer = null;
                return;
            }
            
            // 闀挎寜瓒呰繃500ms锛岃缃负3鍊嶉€?            dp.video.playbackRate = 3.0;
            isLongPress = true;
            showSpeedHint(3.0);
            
            // 鍙湪纭涓洪暱鎸夋椂闃绘榛樿琛屼负
            e.preventDefault();
        }, 500);
    }, { passive: false });
    
    // 瑙︽懜缁撴潫浜嬩欢
    playerElement.addEventListener('touchend', function(e) {
        // 娓呴櫎闀挎寜璁℃椂鍣?        if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
        }
        
        // 濡傛灉鏄暱鎸夌姸鎬侊紝鎭㈠鍘熷鎾斁閫熷害
        if (isLongPress) {
            dp.video.playbackRate = originalPlaybackRate;
            isLongPress = false;
            showSpeedHint(originalPlaybackRate);
            
            // 闃绘闀挎寜鍚庣殑鐐瑰嚮浜嬩欢
            e.preventDefault();
        }
        // 濡傛灉涓嶆槸闀挎寜锛屽垯鍏佽姝ｅ父鐨勭偣鍑讳簨浠讹紙鏆傚仠/鎾斁锛?    });
    
    // 瑙︽懜鍙栨秷浜嬩欢
    playerElement.addEventListener('touchcancel', function() {
        // 娓呴櫎闀挎寜璁℃椂鍣?        if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
        }
        
        // 濡傛灉鏄暱鎸夌姸鎬侊紝鎭㈠鍘熷鎾斁閫熷害
        if (isLongPress) {
            dp.video.playbackRate = originalPlaybackRate;
            isLongPress = false;
        }
    });
    
    // 瑙︽懜绉诲姩浜嬩欢 - 闃叉鍦ㄩ暱鎸夋椂瑙﹀彂椤甸潰婊氬姩
    playerElement.addEventListener('touchmove', function(e) {
        if (isLongPress) {
            e.preventDefault();
        }
    }, { passive: false });
    
    // 瑙嗛鏆傚仠鏃跺彇娑堥暱鎸夌姸鎬?    dp.video.addEventListener('pause', function() {
        if (isLongPress) {
            dp.video.playbackRate = originalPlaybackRate;
            isLongPress = false;
        }
        
        if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
        }
    });
}

// 娓呴櫎瑙嗛杩涘害璁板綍
function clearVideoProgress() {
    const progressKey = `videoProgress_${getVideoId()}`;
    try {
        localStorage.removeItem(progressKey);
        console.log('宸叉竻闄ゆ挱鏀捐繘搴﹁褰?);
    } catch (e) {
        console.error('娓呴櫎鎾斁杩涘害璁板綍澶辫触', e);
    }
}

// 娉ㄦ剰: 宸插湪鏂囦欢鍓嶉儴瀹氫箟 getVideoId 鍑芥暟

let controlsLocked = false;
function toggleControlsLock() {
    const container = document.getElementById('playerContainer');
    controlsLocked = !controlsLocked;
    container.classList.toggle('controls-locked', controlsLocked);
    const icon = document.getElementById('lockIcon');
    // 鍒囨崲鍥炬爣锛氶攣 / 瑙ｉ攣
    icon.innerHTML = controlsLocked
        ? '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d=\"M12 15v2m0-8V7a4 4 0 00-8 0v2m8 0H4v8h16v-8H6v-6z\"/>'
        : '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d=\"M15 11V7a3 3 0 00-6 0v4m-3 4h12v6H6v-6z\"/>';
}

// 鏀寔鍦╥frame涓叧闂挱鏀惧櫒
function closeEmbeddedPlayer() {
    try {
        if (window.self !== window.top) {
            // 濡傛灉鍦╥frame涓紝灏濊瘯璋冪敤鐖剁獥鍙ｇ殑鍏抽棴鏂规硶
            if (window.parent && typeof window.parent.closeVideoPlayer === 'function') {
                window.parent.closeVideoPlayer();
                return true;
            }
        }
    } catch (e) {
        console.error('灏濊瘯鍏抽棴宓屽叆寮忔挱鏀惧櫒澶辫触:', e);
    }
    return false;
}

// Properly close any incomplete blocks
(function() {
    // Self-executing function to ensure all code blocks are properly closed
    // This also isolates any variables that might be causing scope issues
    
    // Initialize event listeners when the DOM is ready
    document.addEventListener('DOMContentLoaded', function() {
        // Setup any player event listeners if the player and function exist
        if (typeof setupPlayerEventListeners === 'function' && dp) {
            setupPlayerEventListeners();
        }
    });
})();

/* End of player.js */
