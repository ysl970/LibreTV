// File: js/player_preload.js

/**
 * 集数预加载功能 (Episode Preloading Feature)
 * Relies on global variables/functions from config.js and player_app.js:
 * - window.PLAYER_CONFIG (enablePreloading, preloadCount, debugMode)
 * - window.PROXY_URL (from config.js - REQUIRED for CORS)
 * - window.currentEpisodes 
 * - window.currentEpisodeIndex
 * - window.dp (DPlayer instance)
 * - window.playEpisode (Function)
 */
(function() {
    function getPreloadCount() {
        return (window.PLAYER_CONFIG && typeof window.PLAYER_CONFIG.preloadCount !== 'undefined')
            ? parseInt(window.PLAYER_CONFIG.preloadCount, 10)
            : 2;
    }

    function supportsCacheStorage() {
        return 'caches' in window && typeof window.caches.open === 'function';
    }

    function isSlowNetwork() {
        try {
            const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
            return connection && connection.effectiveType && /2g|slow-2g/i.test(connection.effectiveType);
        } catch (e) { return false; }
    }
    
    // Helper function to fetch via proxy
    async function fetchViaProxy(url) {
        if (!window.PROXY_URL) {
             if (window.PLAYER_CONFIG && window.PLAYER_CONFIG.debugMode) console.error("[Preload] PROXY_URL is not defined. Cannot fetch resource:", url);
             throw new Error("Proxy URL not configured");
        }
        const proxyFetchUrl = `${window.PROXY_URL}${encodeURIComponent(url)}`;
        if (window.PLAYER_CONFIG && window.PLAYER_CONFIG.debugMode) console.log(`[Preload] Fetching via proxy: ${proxyFetchUrl} (Original: ${url})`);
        return fetch(proxyFetchUrl, { method: "GET", cache: "force-cache" }); // Use cache for preloaded resources
    }

    async function preloadNextEpisodeParts(count) {
        const preloadCount = typeof count === 'number' ? count : getPreloadCount();
        const debugMode = window.PLAYER_CONFIG && window.PLAYER_CONFIG.debugMode;

        if (!(window.PLAYER_CONFIG && window.PLAYER_CONFIG.enablePreloading)) {
            if (debugMode) console.log('[Preload] Preloading disabled by config.');
            return;
        }
        if (isSlowNetwork()) {
            if (debugMode) console.log('[Preload] Skipping preloading due to slow network.');
            return;
        }
        if (!window.PROXY_URL) { // Check for proxy URL needed for CORS fix
             if (debugMode) console.error('[Preload] Skipping: PROXY_URL is missing.');
             return;
        }
        if (!window.currentEpisodes || !Array.isArray(window.currentEpisodes) || typeof window.currentEpisodeIndex !== 'number' || window.currentEpisodes.length === 0) {
            if (debugMode) console.log('[Preload] Skipping: currentEpisodes or currentEpisodeIndex not properly set on window or empty.');
            return;
        }

        const currentIndex = window.currentEpisodeIndex;
        const totalEpisodes = window.currentEpisodes.length;
        
        if (debugMode) {
            const fromLog = currentIndex + 1 + 1; 
            const toLog = Math.min(currentIndex + 1 + preloadCount, totalEpisodes);
            if (fromLog <= toLog) {
                console.log(`[Preload] WILL PRELOAD episodes for current display index ${currentIndex + 1}. Targets (display index): ${fromLog} to ${toLog}.`);
            } else {
                console.log(`[Preload] NO episodes to preload for current display index ${currentIndex + 1}.`);
            }
        }

        for (let offset = 1; offset <= preloadCount; offset++) {
            const episodeIdxToPreload = currentIndex + offset;
            if (episodeIdxToPreload >= totalEpisodes) {
                if (debugMode) console.log(`[Preload] Reached end of playlist at offset ${offset}. Index to preload: ${episodeIdxToPreload}`);
                break;
            }

            const nextEpisodeUrl = window.currentEpisodes[episodeIdxToPreload];
            if (!nextEpisodeUrl) {
                if (debugMode) console.log(`[Preload] Skipped empty URL at episode index ${episodeIdxToPreload}.`);
                continue;
            }
            
            if (debugMode) console.log(`[Preload] Attempting to preload M3U8 for episode index ${episodeIdxToPreload} (Display ${episodeIdxToPreload + 1}): ${nextEpisodeUrl}`);

            try {
                // --- FETCH M3U8 VIA PROXY ---
                const m3u8Response = await fetchViaProxy(nextEpisodeUrl); 
                // --- END FETCH M3U8 VIA PROXY ---

                if (!m3u8Response.ok) {
                    if (debugMode) console.log(`[Preload] Failed to fetch M3U8 (via proxy) for ${nextEpisodeUrl}. Status: ${m3u8Response.status}`);
                    continue;
                }
                const m3u8Text = await m3u8Response.text();
                const tsUrls = [];
                let baseUrlForSegments = ''; 
                try { // Robust base URL calculation
                    const m3u8UrlObj = new URL(nextEpisodeUrl);
                    baseUrlForSegments = m3u8UrlObj.href.substring(0, m3u8UrlObj.href.lastIndexOf('/') + 1);
                } catch (e) {
                    baseUrlForSegments = nextEpisodeUrl.substring(0, nextEpisodeUrl.lastIndexOf('/') + 1); // Fallback
                }
                
                m3u8Text.split('\n').forEach(line => {
                    const trimmedLine = line.trim();
                    if (trimmedLine && !trimmedLine.startsWith("#") && (trimmedLine.endsWith(".ts") || trimmedLine.includes(".ts?")) && tsUrls.length < 3) { // Limit TS preload count
                        try {
                             // Resolve relative URLs correctly
                             const segmentUrl = new URL(trimmedLine, baseUrlForSegments).toString();
                             tsUrls.push(segmentUrl);
                        } catch(e) {
                            if (debugMode) console.warn(`[Preload] Failed to resolve segment URL: ${trimmedLine} with base ${baseUrlForSegments}`);
                        }
                    }
                });

                if (debugMode) console.log(`[Preload] M3U8 for episode ${episodeIdxToPreload + 1} parsed. Found ${tsUrls.length} TS segments to preload:`, tsUrls);

                for (const tsUrl of tsUrls) {
                     if (supportsCacheStorage()) {
                        try {
                            const cache = await caches.open('libretv-preload-segments-v1');
                            const cachedResponse = await cache.match(tsUrl); // Check cache using original TS URL
                            if (!cachedResponse) {
                                // --- FETCH TS VIA PROXY ---
                                const segmentResponse = await fetchViaProxy(tsUrl);
                                // --- END FETCH TS VIA PROXY ---
                                if (segmentResponse.ok) {
                                    await cache.put(tsUrl, segmentResponse.clone()); // Cache using original TS URL as key
                                    if (debugMode) console.log(`[Preload] TS segment CACHED: ${tsUrl}`);
                                } else if (debugMode) {
                                    console.log(`[Preload] Failed to FETCH TS segment (via proxy): ${tsUrl}`);
                                }
                            } else {
                                if (debugMode) console.log(`[Preload] TS segment ALREADY IN CACHE: ${tsUrl}`);
                            }
                        } catch (cacheEx) {
                            if (debugMode) console.log(`[Preload] TS caching FAILED for ${tsUrl}: ${cacheEx.message}`);
                        }
                    } else { 
                        try {
                            // --- FETCH TS VIA PROXY (No Cache) ---
                            const segmentResponse = await fetchViaProxy(tsUrl);
                            // --- END FETCH TS VIA PROXY (No Cache) ---
                            if (debugMode) {
                                if (segmentResponse.ok) console.log(`[Preload] TS segment fetched (no cache support, via proxy): ${tsUrl}`);
                                else console.log(`[Preload] Failed to fetch TS segment (no cache support, via proxy): ${tsUrl}`);
                            }
                        } catch (fetchEx) {
                             if (debugMode) console.log(`[Preload] TS fetch exception (no cache support, via proxy) for ${tsUrl}: ${fetchEx.message}`);
                        }
                    }
                }
            } catch (e) {
                if (debugMode) console.log(`[Preload] Error processing M3U8/TS for ${nextEpisodeUrl}: ${e.message}`);
            }
        }
    }
    window.preloadNextEpisodeParts = preloadNextEpisodeParts;

    function safeRegisterPreloadEvents() {
        const debugMode = window.PLAYER_CONFIG && window.PLAYER_CONFIG.debugMode;
        if (!(window.PLAYER_CONFIG && window.PLAYER_CONFIG.enablePreloading)) return;

        if (!window.currentEpisodes || !Array.isArray(window.currentEpisodes) || typeof window.currentEpisodeIndex !== 'number') {
            if (debugMode) console.log('[Preload] Deferring event registration, waiting for episode data on window.');
            setTimeout(safeRegisterPreloadEvents, 500);
            return;
        }

        const nextBtn = document.getElementById('next-episode'); // Ensure ID matches player.html
        if (nextBtn && !nextBtn._preloadHooked_mouseenter_touchstart) {
            nextBtn._preloadHooked_mouseenter_touchstart = true;
            nextBtn.addEventListener('mouseenter', () => preloadNextEpisodeParts(getPreloadCount()), { passive: true });
            nextBtn.addEventListener('touchstart', () => preloadNextEpisodeParts(getPreloadCount()), { passive: true });
            if (debugMode) console.log('[Preload] Next button hover/touch events registered.');
        } else if (debugMode && !nextBtn) {
             console.warn('[Preload] Next button with ID "next-episode" not found for event registration.');
        }

        function setupTimeUpdatePreloadListener() {
            if (window.dp && window.dp.video && typeof window.dp.video.addEventListener === 'function' && !window.dp._preloadHooked_timeupdate) {
                window.dp._preloadHooked_timeupdate = true;
                window.dp.video.addEventListener('timeupdate', function() {
                    if (window.dp.video.duration && window.dp.video.currentTime > window.dp.video.duration - 12) {
                        preloadNextEpisodeParts(getPreloadCount());
                    }
                });
                if (debugMode) console.log('[Preload] Video timeupdate event for preloading registered.');
            }
        }

        if (window.dp && window.dp.video) {
            setupTimeUpdatePreloadListener();
        } else {
            let tries = 0;
            const timer = setInterval(() => {
                if (window.dp && window.dp.video) {
                    setupTimeUpdatePreloadListener();
                    clearInterval(timer);
                }
                if (++tries > 50) {
                     if (debugMode) console.warn('[Preload] DPlayer instance (dp.video) not found after 10s for timeupdate listener.');
                    clearInterval(timer);
                }
            }, 200);
        }
        
        // Preloading on episode grid click is handled by the enhanced playEpisode function
        const episodesListContainer = document.getElementById('episode-grid');
        if (episodesListContainer && !episodesListContainer._preloadHooked_click) {
            episodesListContainer._preloadHooked_click = true;
            if (debugMode) console.log('[Preload] Episode grid click preloading handled by enhanced playEpisode.');
        } else if (debugMode && !episodesListContainer) {
            console.warn('[Preload] Episode grid with ID "episode-grid" not found.');
        }
    }

    function triggerFirstPreload(retryCount = 0) {
        const debugMode = window.PLAYER_CONFIG && window.PLAYER_CONFIG.debugMode;
        if (window.PLAYER_CONFIG && window.PLAYER_CONFIG.enablePreloading &&
            window.currentEpisodes && Array.isArray(window.currentEpisodes) && window.currentEpisodes.length > 0 &&
            typeof window.currentEpisodeIndex === 'number') {
            if (debugMode) console.log('[Preload] Triggering initial preload.');
            preloadNextEpisodeParts();
        } else if (retryCount < 20) {
            if (debugMode) console.log(`[Preload] Initial preload deferred (try ${retryCount + 1}), episode data not ready on window.`);
            setTimeout(() => triggerFirstPreload(retryCount + 1), 500);
        } else {
            if (debugMode) console.warn('[Preload] Initial preload failed: episode data not available on window after multiple retries.');
        }
    }
    
    let enhancePlayEpisodeRetries = 0;
    function enhancePlayEpisodeForPreloading() {
        const debugMode = window.PLAYER_CONFIG && window.PLAYER_CONFIG.debugMode;
        if (typeof window.playEpisode === 'function') {
            const originalPlayEpisode = window.playEpisode;
            if (!originalPlayEpisode._preloadEnhanced) {
                window.playEpisode = function(...args) {
                    if (debugMode) console.log(`[Preload] Wrapped playEpisode called. Original will run. New index: ${args[0]}`);
                    originalPlayEpisode.apply(this, args);
                    if (debugMode) console.log(`[Preload] Triggering preload after episode switch. Current window.currentEpisodeIndex: ${window.currentEpisodeIndex}`);
                    setTimeout(() => preloadNextEpisodeParts(getPreloadCount()), 300); // Increased delay slightly more
                };
                window.playEpisode._preloadEnhanced = true;
                if (debugMode) console.log('[Preload] playEpisode function enhanced for preloading.');
            }
        } else if (enhancePlayEpisodeRetries < 20) {
            enhancePlayEpisodeRetries++;
            if (debugMode) console.warn(`[Preload] window.playEpisode not found for enhancing (attempt ${enhancePlayEpisodeRetries}), will retry.`);
            setTimeout(enhancePlayEpisodeForPreloading, 500);
        } else {
            if (debugMode) console.error('[Preload] Failed to enhance window.playEpisode after multiple retries.');
        }
    }

    document.addEventListener('DOMContentLoaded', function() {
        // Give player_app.js ample time to initialize globals
        setTimeout(() => {
            const debugMode = window.PLAYER_CONFIG && window.PLAYER_CONFIG.debugMode;
            if (debugMode) console.log('[Preload] DOMContentLoaded - Initializing preload systems.');
            // Ensure PROXY_URL is loaded from config.js before triggering preload
            if(!window.PROXY_URL && debugMode) console.warn('[Preload] PROXY_URL not yet available. Preloading might fail.');
            
            safeRegisterPreloadEvents();
            triggerFirstPreload();
            enhancePlayEpisodeForPreloading();
        }, 1000); // Increased delay significantly
    });
})();