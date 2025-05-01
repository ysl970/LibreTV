// js/api.js

(function(window) {
    'use strict';

    // --- Constants ---

    const API_SITES = window.API_SITES || {};
    const API_CONFIG = window.API_CONFIG || { search: {}, detail: {} };
    const PROXY_URL = window.PROXY_URL || ''; // Make sure PROXY_URL ends with '/' if it's a prefix, or adjust usage.
    const PLAYER_CONFIG = window.PLAYER_CONFIG || { debugMode: false }; // Default debugMode to false
    const AGGREGATED_SEARCH_CONFIG = window.AGGREGATED_SEARCH_CONFIG || { timeout: 5000 };
    const CUSTOM_API_CONFIG = window.CUSTOM_API_CONFIG || { separator: ',', maxSources: 5, testTimeout: 5000, namePrefix: '自定义源' };

    // Regular Expressions (cached for performance)
    const M3U8_PATTERN = /\$?(https?:\/\/[^"'\s]+?\.m3u8)/g; // General M3U8 pattern
    const FFZY_M3U8_PATTERN = /\$(https?:\/\/[^"'\s]+?\/\d{8}\/\d+_[a-f0-9]+\/index\.m3u8)/g;
    const VALID_ID_PATTERN = /^[\w-]+$/; // Pattern for validating IDs
    const URL_PATTERN = /^https?:\/\//i; // Pattern for validating URLs

    // --- Utilities ---
    function logDebug(...args) {
        if (PLAYER_CONFIG.debugMode) {
            console.log('[API DEBUG]', ...args);
        }
    }
    
    function safeJsonParse(text, defaultValue = null) {
        try {
            return JSON.parse(text);
        } catch (e) {
            logDebug('JSON parse error:', e.message, 'Input:', text.substring(0, 100));
            return defaultValue;
        }
    }


    function buildProxiedUrl(targetUrl) {
        if (!PROXY_URL) {
             console.error("PROXY_URL is not configured.");
             throw new Error("Proxy URL prefix is not configured.");
        }

        return `${PROXY_URL}${encodeURIComponent(targetUrl)}`;
    }

    async function fetchJsonWithTimeout(targetUrl, options = {}, timeout = 10000) {
        logDebug(`Fetching proxied JSON: ${targetUrl} with timeout ${timeout}ms`);
        const proxiedUrl = buildProxiedUrl(targetUrl);
        let response;
        try {
            // Use AbortSignal.timeout for cleaner timeout handling
            response = await fetch(proxiedUrl, {
                ...options,
                signal: AbortSignal.timeout(timeout) // Directly use browser/worker API
            });
        } catch (error) {
             // Network errors or AbortError (timeout)
             logDebug(`Fetch error for ${targetUrl}:`, error.name, error.message);
             if (error.name === 'AbortError' || error.name === 'TimeoutError') {
                 throw new Error(`Request timed out after ${timeout}ms for ${targetUrl}`);
             }
             throw new Error(`Network error fetching ${targetUrl}: ${error.message}`);
        }

        if (!response.ok) {
             logDebug(`Fetch failed for ${targetUrl}: Status ${response.status} ${response.statusText}`);
             // Try reading body for more context, but don't fail if it's empty/unreadable
             let errorBody = '';
             try { errorBody = await response.text(); } catch (_) {}
             throw new Error(`Request failed for ${targetUrl}: ${response.status} ${response.statusText}. Body: ${errorBody.substring(0,100)}`);
        }

        try {
            const jsonData = await response.json();
            logDebug(`Fetch successful for ${targetUrl}, received JSON.`);
            return jsonData;
        } catch (error) {
            logDebug(`JSON parsing failed for ${targetUrl}:`, error.message);
            throw new Error(`Failed to parse JSON response from ${targetUrl}: ${error.message}`);
        }
    }

    async function fetchHtmlWithTimeout(targetUrl, options = {}, timeout = 10000) {
        logDebug(`Fetching proxied HTML: ${targetUrl} with timeout ${timeout}ms`);
        const proxiedUrl = buildProxiedUrl(targetUrl);
        let response;
         try {
            response = await fetch(proxiedUrl, {
                ...options,
                signal: AbortSignal.timeout(timeout)
            });
        } catch (error) {
             logDebug(`Fetch error for ${targetUrl}:`, error.name, error.message);
             if (error.name === 'AbortError' || error.name === 'TimeoutError') {
                 throw new Error(`Request timed out after ${timeout}ms for ${targetUrl}`);
             }
             throw new Error(`Network error fetching ${targetUrl}: ${error.message}`);
        }

        if (!response.ok) {
            logDebug(`Fetch failed for ${targetUrl}: Status ${response.status} ${response.statusText}`);
             let errorBody = '';
             try { errorBody = await response.text(); } catch (_) {}
            throw new Error(`Request failed for ${targetUrl}: ${response.status} ${response.statusText}. Body: ${errorBody.substring(0,100)}`);
        }

        try {
            const htmlContent = await response.text();
            logDebug(`Fetch successful for ${targetUrl}, received HTML content (length: ${htmlContent.length}).`);
            return htmlContent;
        } catch (error) {
            logDebug(`Failed to read HTML response body for ${targetUrl}:`, error.message);
            throw new Error(`Failed to read response body from ${targetUrl}: ${error.message}`);
        }
    }


    // --- Search Handlers ---

    async function handleSingleSourceSearch(searchQuery, sourceCode, customApiUrl = '') {
        logDebug(`Handling single source search: query=${searchQuery}, source=${sourceCode}, customApi=${customApiUrl}`);

        if (sourceCode === 'custom' && !customApiUrl) {
            throw new Error('Custom API URL is required when source is "custom".');
        }
        if (sourceCode === 'custom' && !URL_PATTERN.test(customApiUrl)) {
            throw new Error('Invalid Custom API URL format.');
        }
        if (sourceCode !== 'custom' && !API_SITES[sourceCode]?.api) {
             throw new Error(`Invalid or unknown API source: ${sourceCode}`);
        }

        const baseUrl = sourceCode === 'custom' ? customApiUrl : API_SITES[sourceCode].api;
        const searchPath = API_CONFIG.search.path || ''; // Ensure path is defined
        const apiUrl = `${baseUrl}${searchPath}${encodeURIComponent(searchQuery)}`;
        const sourceName = sourceCode === 'custom' ? '自定义源' : (API_SITES[sourceCode]?.name || sourceCode);

        const result = await fetchJsonWithTimeout(apiUrl, {
            headers: API_CONFIG.search.headers || {} // Use configured headers
        });

        if (!result || !Array.isArray(result.list)) {
            logDebug('Invalid API response format for search:', result);
            throw new Error(`API response from ${sourceName} has invalid format.`);
        }

        // Add source information to each result item
        result.list.forEach(item => {
            item.source_name = sourceName;
            item.source_code = sourceCode;
            if (sourceCode === 'custom') {
                 item.api_url = customApiUrl; // Include the specific custom API URL
            }
        });

        return { code: 200, list: result.list };
    }


    async function handleAggregatedSearch(searchQuery) {
        logDebug(`Handling aggregated search: query=${searchQuery}`);
        const availableSources = Object.keys(API_SITES).filter(key =>
            key !== 'aggregated' && key !== 'custom' && API_SITES[key]?.api // Exclude special keys and ensure API URL exists
        );

        if (availableSources.length === 0) {
            return { code: 200, list: [], msg: 'No standard API sources configured for aggregation.' };
        }

        logDebug('Aggregating searches for sources:', availableSources);

        const searchPromises = availableSources.map(sourceCode => {
            const baseUrl = API_SITES[sourceCode].api;
            const searchPath = API_CONFIG.search.path || '';
            const apiUrl = `${baseUrl}${searchPath}${encodeURIComponent(searchQuery)}`;
            const sourceName = API_SITES[sourceCode].name || sourceCode;

            // Fetch individually and catch errors per source
            return fetchJsonWithTimeout(apiUrl, { headers: API_CONFIG.search.headers }, AGGREGATED_SEARCH_CONFIG.timeout)
                .then(result => {
                    if (result && Array.isArray(result.list)) {
                        // Add source info immediately
                        result.list.forEach(item => {
                             item.source_name = sourceName;
                             item.source_code = sourceCode;
                        });
                        return result.list;
                    }
                    logDebug(`Invalid list format from ${sourceName}`, result);
                    return []; // Return empty array for invalid format
                })
                .catch(error => {
                    logDebug(`Search failed for source ${sourceName}:`, error.message);
                    return []; // Return empty array on error for this source
                });
        });

        const resultsArray = await Promise.all(searchPromises);
        const allResults = resultsArray.flat(); // Flatten the array of arrays

        if (allResults.length === 0) {
            return { code: 200, list: [], msg: 'No results found from any aggregated source.' };
        }

        // Deduplicate results based on source_code and vod_id
        const uniqueResults = [];
        const seen = new Set();
        allResults.forEach(item => {
            // Ensure item and vod_id exist before creating key
            if (item && item.vod_id !== undefined && item.source_code !== undefined) {
                const key = `${item.source_code}_${item.vod_id}`;
                if (!seen.has(key)) {
                    seen.add(key);
                    uniqueResults.push(item);
                }
            } else {
                logDebug("Skipping invalid item during deduplication:", item);
            }
        });

        // Sort results (optional, but good for consistency)
        uniqueResults.sort((a, b) => {
            const nameCompare = (a.vod_name || '').localeCompare(b.vod_name || '');
            return nameCompare !== 0 ? nameCompare : (a.source_name || '').localeCompare(b.source_name || '');
        });


        return { code: 200, list: uniqueResults };
    }

    async function handleMultipleCustomSearch(searchQuery, customApiUrlsString) {
        logDebug(`Handling multiple custom search: query=${searchQuery}`);
        const apiUrls = customApiUrlsString.split(CUSTOM_API_CONFIG.separator || ',')
            .map(url => url.trim())
            .filter(url => url && URL_PATTERN.test(url)) // Basic validation
            .slice(0, CUSTOM_API_CONFIG.maxSources || 5); // Limit number of sources

        if (apiUrls.length === 0) {
             return { code: 200, list: [], msg: 'No valid custom API URLs provided.' };
        }

        logDebug('Searching multiple custom APIs:', apiUrls);

        const searchPromises = apiUrls.map((apiUrl, index) => {
            const searchPath = API_CONFIG.search.path || '';
            const fullApiUrl = `${apiUrl}${searchPath}${encodeURIComponent(searchQuery)}`;
            const sourceName = `${CUSTOM_API_CONFIG.namePrefix || '自定义源'}${index + 1}`; // e.g., 自定义源1

             // Fetch individually, catch errors per source
            return fetchJsonWithTimeout(fullApiUrl, { headers: API_CONFIG.search.headers }, CUSTOM_API_CONFIG.testTimeout || 5000)
                 .then(result => {
                     if (result && Array.isArray(result.list)) {
                         // Add source info immediately
                         result.list.forEach(item => {
                             item.source_name = sourceName;
                             item.source_code = 'custom'; // Generic code for custom
                             item.api_url = apiUrl; // Store the specific API URL used
                         });
                         return result.list;
                     }
                    logDebug(`Invalid list format from custom API ${sourceName} (${apiUrl})`, result);
                    return [];
                 })
                 .catch(error => {
                     logDebug(`Search failed for custom API ${sourceName} (${apiUrl}):`, error.message);
                     return []; // Return empty array on error
                 });
        });

        const resultsArray = await Promise.all(searchPromises);
        const allResults = resultsArray.flat();

        if (allResults.length === 0) {
            return { code: 200, list: [], msg: 'No results found from any specified custom API.' };
        }

        // Deduplicate results based on api_url and vod_id
        const uniqueResults = [];
        const seen = new Set();
         allResults.forEach(item => {
            if (item && item.vod_id !== undefined && item.api_url !== undefined) {
                const key = `${item.api_url}_${item.vod_id}`;
                if (!seen.has(key)) {
                    seen.add(key);
                    uniqueResults.push(item);
                }
            } else {
                 logDebug("Skipping invalid custom item during deduplication:", item);
            }
        });

        return { code: 200, list: uniqueResults };
    }


    // --- Detail Handlers ---

    function extractStandardEpisodes(videoDetail) {
        let episodes = [];
        if (videoDetail.vod_play_url) {
            try {
                const playSources = videoDetail.vod_play_url.split('$$$');
                // Prefer the first source block if multiple exist
                if (playSources.length > 0) {
                    const mainSource = playSources[0];
                    episodes = mainSource.split('#')
                        .map(ep => {
                            const parts = ep.split('$');
                            // Ensure URL part exists and looks like a URL
                            return (parts.length > 1 && parts[1].trim() && URL_PATTERN.test(parts[1].trim())) ? parts[1].trim() : null;
                        })
                        .filter(url => url !== null); // Filter out nulls/empty/invalid URLs
                }
            } catch (e) {
                 logDebug("Error parsing vod_play_url:", e.message, videoDetail.vod_play_url);
                 episodes = []; // Reset on error
            }
        }

        // Fallback: If no valid episodes found via vod_play_url, try regex on vod_content for M3U8
        if (episodes.length === 0 && videoDetail.vod_content && typeof videoDetail.vod_content === 'string') {
            logDebug("No episodes from vod_play_url, trying regex on vod_content");
            const contentMatches = videoDetail.vod_content.matchAll(M3U8_PATTERN); // Use matchAll for global regex
            episodes = Array.from(contentMatches, match => match[1]) // Get the first capture group (the URL)
                          .filter(url => url); // Ensure URL is not empty
        }
        logDebug(`Extracted ${episodes.length} standard episodes.`);
        return episodes;
    }


    async function handleStandardDetail(id, sourceCode, customApiUrl = '') {
        logDebug(`Handling standard detail: id=${id}, source=${sourceCode}, customApi=${customApiUrl}`);

        if (sourceCode === 'custom' && !customApiUrl) {
             throw new Error('Custom API URL is required for custom source detail.');
        }
        if (sourceCode === 'custom' && !URL_PATTERN.test(customApiUrl)) {
            throw new Error('Invalid Custom API URL format for detail.');
        }
        if (sourceCode !== 'custom' && !API_SITES[sourceCode]?.api) {
            throw new Error(`Invalid or unknown API source for detail: ${sourceCode}`);
        }

        const baseUrl = sourceCode === 'custom' ? customApiUrl : API_SITES[sourceCode].api;
        const detailPath = API_CONFIG.detail.path || '';
        const detailApiUrl = `${baseUrl}${detailPath}${id}`; // Construct the API URL for detail fetch
        const sourceName = sourceCode === 'custom' ? '自定义源' : (API_SITES[sourceCode]?.name || sourceCode);

        const result = await fetchJsonWithTimeout(detailApiUrl, {
            headers: API_CONFIG.detail.headers || {}
        });

        if (!result || !Array.isArray(result.list) || result.list.length === 0) {
             logDebug('Invalid API response format for detail:', result);
             throw new Error(`No valid detail data received from ${sourceName}.`);
        }

        const videoDetail = result.list[0]; // Assume first item is the correct detail
        const episodes = extractStandardEpisodes(videoDetail);

        // Return consistent structure, even if some fields are missing
        return {
            code: 200,
            episodes: episodes,
            detailUrl: detailApiUrl, // Return the API URL called
            videoInfo: {
                title: videoDetail.vod_name || '',
                cover: videoDetail.vod_pic || '',
                desc: videoDetail.vod_content || '',
                type: videoDetail.type_name || '',
                year: videoDetail.vod_year || '',
                area: videoDetail.vod_area || '',
                director: videoDetail.vod_director || '',
                actor: videoDetail.vod_actor || '',
                remarks: videoDetail.vod_remarks || '',
                source_name: sourceName,
                source_code: sourceCode,
                api_url: sourceCode === 'custom' ? customApiUrl : undefined // Include custom API URL if applicable
            }
        };
    }


    async function handleHtmlDetailScraping(id, sourceCode, baseUrl, sourceName) {
        logDebug(`Handling HTML detail scraping: id=${id}, source=${sourceCode}, baseUrl=${baseUrl}`);

        // Construct the direct HTML page URL (assuming common pattern)
        // TODO: Make the path configurable if it varies significantly?
        const detailHtmlUrl = `${baseUrl}/index.php/vod/detail/id/${id}.html`;

        const htmlContent = await fetchHtmlWithTimeout(detailHtmlUrl, {
            // Use a common UA, maybe make configurable?
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Accept': 'text/html' // Indicate we expect HTML
            }
        });

        // --- Extract Episodes using Regex ---
        let episodeMatches = [];
        if (sourceCode === 'ffzy') {
             // Try FFZY specific pattern first
             episodeMatches = Array.from(htmlContent.matchAll(FFZY_M3U8_PATTERN), m => m[1]);
             logDebug(`FFZY pattern found ${episodeMatches.length} matches.`);
        }

        // If no matches with specific pattern (or not FFZY), use the general M3U8 pattern
        if (episodeMatches.length === 0) {
            episodeMatches = Array.from(htmlContent.matchAll(M3U8_PATTERN), m => m[1]);
            logDebug(`General M3U8 pattern found ${episodeMatches.length} matches.`);
        }

        // Clean up extracted links (remove potential artifacts like trailing parenthesis)
        const episodes = [...new Set(episodeMatches)] // Deduplicate
            .map(link => {
                const parenIndex = link.indexOf('('); // Example cleanup
                return parenIndex > 0 ? link.substring(0, parenIndex) : link;
            })
            .filter(link => URL_PATTERN.test(link)); // Final validation

        logDebug(`Extracted ${episodes.length} episodes via HTML scraping.`);

        // --- Extract Basic Info using Regex (simple extraction) ---
        // These are basic and might break easily if HTML structure changes.
        const titleMatch = htmlContent.match(/<h1[^>]*>([^<]+)<\/h1>/);
        const descMatch = htmlContent.match(/<div[^>]*class=["'](?:content_detail|sketch)["'][^>]*>([\s\S]*?)<\/div>/); // Try common class names

        const title = titleMatch ? titleMatch[1].trim() : 'N/A';
        let desc = descMatch ? descMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : 'N/A';
        // Limit description length
        desc = desc.length > 200 ? desc.substring(0, 200) + '...' : desc;


        return {
            code: 200,
            episodes: episodes,
            detailUrl: detailHtmlUrl, // URL of the scraped HTML page
            videoInfo: {
                title: title,
                desc: desc,
                // Other fields might not be easily available via simple regex
                cover: '', type: '', year: '', area: '', director: '', actor: '', remarks: '',
                source_name: sourceName,
                source_code: sourceCode,
                api_url: sourceCode === 'custom' ? baseUrl : undefined
            }
        };
    }

    // --- Main API Router ---

    // Map pathnames to handler functions
    const apiRoutes = {
        '/api/search': async (url) => {
            const searchQuery = url.searchParams.get('wd');
            const sourceCode = url.searchParams.get('source') || 'heimuer'; // Default source
            const customApiUrl = url.searchParams.get('customApi') || '';
            const customApiUrlsString = url.searchParams.get('customApiUrls') || ''; // For multiple custom

            if (!searchQuery) throw new Error('Search query parameter "wd" is missing.');

            if (sourceCode === 'aggregated') {
                 return handleAggregatedSearch(searchQuery);
            } else if (sourceCode === 'custom' && customApiUrlsString) {
                // Handle multiple custom APIs if 'customApiUrls' is provided
                return handleMultipleCustomSearch(searchQuery, customApiUrlsString);
            } else {
                 // Handle single source (built-in or one custom API via 'customApi')
                 return handleSingleSourceSearch(searchQuery, sourceCode, customApiUrl);
            }
        },
        '/api/detail': async (url) => {
            const id = url.searchParams.get('id');
            const sourceCode = url.searchParams.get('source') || 'heimuer'; // Default source
            const customApiUrl = url.searchParams.get('customApi') || '';
            const useCustomDetailScraping = url.searchParams.get('useDetail') === 'true'; // Check if custom needs scraping

            if (!id) throw new Error('Video ID parameter "id" is missing.');
            if (!VALID_ID_PATTERN.test(id)) throw new Error('Invalid video ID format.');

            const specialScrapingSources = ['ffzy', 'jisu', 'huangcang']; // Sources known to need HTML scraping

            // Determine if HTML scraping is needed
            const needsScraping = specialScrapingSources.includes(sourceCode) || (sourceCode === 'custom' && useCustomDetailScraping);

            if (needsScraping) {
                let baseUrl;
                let sourceName;
                if (sourceCode === 'custom') {
                     if (!customApiUrl || !URL_PATTERN.test(customApiUrl)) throw new Error('Invalid or missing custom API URL for HTML detail scraping.');
                     baseUrl = customApiUrl;
                     sourceName = '自定义源';
                 } else {
                     if (!API_SITES[sourceCode]?.detail) throw new Error(`HTML detail URL base not configured for source: ${sourceCode}`);
                     baseUrl = API_SITES[sourceCode].detail;
                     sourceName = API_SITES[sourceCode]?.name || sourceCode;
                 }
                return handleHtmlDetailScraping(id, sourceCode, baseUrl, sourceName);
            } else {
                // Use standard API detail fetching
                return handleStandardDetail(id, sourceCode, customApiUrl);
            }
        }
        // Add other API endpoints here if needed
    };

    /**
     * Main handler for all /api/* requests intercepted by the fetch hook.
     * Routes requests based on pathname and handles overall error reporting.
     * @param {URL} url - The parsed URL object of the request.
     * @returns {Promise<string>} JSON string representation of the response.
     */
    async function handleApiRequest(url) {
        logDebug(`Handling API request for path: ${url.pathname}`);
        const handler = apiRoutes[url.pathname];

        if (!handler) {
             logDebug(`No handler found for path: ${url.pathname}`);
             throw new Error(`Unknown API endpoint: ${url.pathname}`);
        }

        // Execute the specific handler (search, detail, etc.)
        // The handler itself should throw errors on failure
        const resultData = await handler(url);

        // Return successful result as JSON string
        return JSON.stringify(resultData);
    }

    // --- Fetch Hook ---

    // Immediately invoked function to setup the fetch interceptor
    (function() {
        // Store the original fetch function
        const originalFetch = window.fetch;
        if (!originalFetch) {
            console.error("Original window.fetch not found. API interception cannot be set up.");
            return;
        }

        // Define the replacement fetch function
        window.fetch = async function(input, init) {
            let requestUrlString;
            try {
                // Determine the full URL of the request
                requestUrlString = (typeof input === 'string') ? input : input.url;
                // Resolve relative URLs against the current page origin
                const requestUrl = new URL(requestUrlString, window.location.origin);

                // Check if it's an API call we should intercept
                if (requestUrl.pathname.startsWith('/api/')) {
                    logDebug(`Intercepting fetch request for: ${requestUrl.pathname}`);

                     // --- Password Check (copied from original, maintain behavior) ---
                     // Note: The logic seems potentially redundant/complex, but kept as is.
                     // Consider simplifying if requirements allow.
                     let blockRequest = false;
                     if (typeof window.isPasswordProtected === 'function' && typeof window.isPasswordVerified === 'function') {
                         if (window.isPasswordProtected() && !window.isPasswordVerified()) {
                             logDebug("API request blocked due to password protection.");
                             blockRequest = true;
                         }
                     } else if (window.isPasswordProtected && window.isPasswordVerified) { // Check properties if functions don't exist
                         if (window.isPasswordProtected && !window.isPasswordVerified) {
                              logDebug("API request blocked due to password protection (properties).");
                              blockRequest = true;
                         }
                     }

                     if (blockRequest) {
                         // Return an empty response or specific error? Original returns undefined implicitly.
                         // Returning a specific error response is better practice.
                         return new Response(JSON.stringify({ code: 403, msg: 'Access Denied: Password verification required.' }), {
                             status: 403,
                             headers: { 'Content-Type': 'application/json' }
                         });
                     }
                     // --- End Password Check ---


                    try {
                        // Delegate to the main API handler
                        const responseDataString = await handleApiRequest(requestUrl);
                        // Return the successful JSON response
                        return new Response(responseDataString, {
                            headers: {
                                'Content-Type': 'application/json',
                                'Access-Control-Allow-Origin': '*', // Add CORS header
                            },
                        });
                    } catch (error) {
                        // Catch errors from handleApiRequest or its sub-handlers
                        console.error(`API request failed for ${requestUrl.pathname}:`, error);
                        // Return a standardized error response
                        return new Response(JSON.stringify({
                            code: error.code || 400, // Use error code if available, else 400
                            msg: error.message || 'API request processing failed.',
                            list: [],     // Ensure these arrays exist in error responses too
                            episodes: []
                        }), {
                            status: error.status || 400, // Use error status if available
                            headers: {
                                'Content-Type': 'application/json',
                                'Access-Control-Allow-Origin': '*',
                            },
                        });
                    }
                }
            } catch (urlError) {
                 console.error("Error processing fetch input URL:", urlError, "Input:", input);
                 // Fall through to original fetch if URL parsing failed before API check
            }

            // If it's not an API call, or URL parsing failed early, use the original fetch
            logDebug(`Passing non-API request to original fetch: ${requestUrlString}`);
            return originalFetch.apply(this, arguments);
        };

        logDebug("Fetch interceptor initialized.");
    })();


    // --- Publicly Exposed Functions ---
    // (As required by the prompt, maintaining original exposure)
    async function testSiteAvailability(apiUrl) {
        logDebug(`Testing site availability for: ${apiUrl}`);
        if (!apiUrl || !URL_PATTERN.test(apiUrl)) {
            logDebug("Invalid API URL provided for testing.");
            return false;
        }
        try {
             // Use the internal handler logic for consistency, with a short timeout
             // Need to construct a dummy URL object for the handler
             const testQuery = 'test'; // A common, likely-to-exist search term
             const testUrl = new URL(`/api/search?source=custom&wd=${encodeURIComponent(testQuery)}&customApi=${encodeURIComponent(apiUrl)}`, window.location.origin);

             // Call the search handler directly, bypassing fetch hook complexity for testing
             const result = await handleSingleSourceSearch(testQuery, 'custom', apiUrl);

             // Check for successful code and valid list structure
            const success = result && result.code === 200 && Array.isArray(result.list);
            logDebug(`Site availability test result for ${apiUrl}: ${success}`);
            return success;

        } catch (error) {
            logDebug(`Site availability test failed for ${apiUrl}:`, error.message);
            return false; // Any error during the test means unavailability
        }
    }

    // Expose functions to the global scope (window) as originally intended
    window.testSiteAvailability = testSiteAvailability;


    logDebug("API module initialized and attached to window.");

})(window); // Pass the window object into the IIFE
