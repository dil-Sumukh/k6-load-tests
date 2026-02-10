import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import { randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.2.0/index.js';

// =============================================================================
// CONFIGURATION
// =============================================================================

const BASE_URL = 'https://dev.boarddocs.com';
const STATE = 'ind';
const ORG = 'globallogic';
const BOARD_NSF = `/${STATE}/${ORG}/Board.nsf`;

// =============================================================================
// USER-CONFIGURABLE API SELECTION
// =============================================================================
// 
// Configure via environment variables:
//   API_COUNT: Number of APIs to run together (1, 2, 3, etc. or "random")
//   API_LIST:  Comma-separated list of API names to run (or "all" for all APIs)
//
// Examples:
//   k6 run -e API_COUNT=2 -e API_LIST=public,getPacket k6-load-test.js
//   k6 run -e API_COUNT=3 -e API_LIST=javascript,css,public k6-load-test.js
//   k6 run -e API_COUNT=random -e API_LIST=all k6-load-test.js
//
// Available API names:
//   javascript, css, printLogo, getPacket, siteLogo, welcomeImage,
//   meetingsListSEO, public, goto, cssFile, apiScripts, favicon,
//   private, globalJs, fileDownload, globalPng, plusJs, vpublic,
//   globalFavicon, getMinutes, globalCss, bdLoginCss, rootPath,
//   committees, siteLogin
// =============================================================================

const API_COUNT = __ENV.API_COUNT || 'random';  // Number of APIs or "random"
const API_LIST = __ENV.API_LIST || 'all';       // Comma-separated API names or "all"

// Sample file names for parameterized endpoints
const JS_FILES = ['main', 'utils', 'app', 'common', 'core'];
const CSS_FILES = ['style', 'main', 'theme', 'layout', 'responsive'];
const PNG_FILES = ['logo', 'icon', 'bg', 'header', 'footer'];
const SAMPLE_FILENAMES = ['document.pdf', 'report.pdf', 'agenda.pdf', 'minutes.pdf'];

// =============================================================================
// CUSTOM METRICS
// =============================================================================

// Per-API response time trends
const apiTrends = {
    javascript: new Trend('api_javascript_duration', true),
    css: new Trend('api_css_duration', true),
    printLogo: new Trend('api_print_logo_duration', true),
    getPacket: new Trend('api_get_packet_duration', true),
    siteLogo: new Trend('api_site_logo_duration', true),
    welcomeImage: new Trend('api_welcome_image_duration', true),
    meetingsListSEO: new Trend('api_meetings_list_seo_duration', true),
    public: new Trend('api_public_duration', true),
    goto: new Trend('api_goto_duration', true),
    cssFile: new Trend('api_css_file_duration', true),
    apiScripts: new Trend('api_scripts_duration', true),
    favicon: new Trend('api_favicon_duration', true),
    private: new Trend('api_private_duration', true),
    globalJs: new Trend('api_global_js_duration', true),
    fileDownload: new Trend('api_file_download_duration', true),
    globalPng: new Trend('api_global_png_duration', true),
    plusJs: new Trend('api_plus_js_duration', true),
    vpublic: new Trend('api_vpublic_duration', true),
    globalFavicon: new Trend('api_global_favicon_duration', true),
    getMinutes: new Trend('api_get_minutes_duration', true),
    globalCss: new Trend('api_global_css_duration', true),
    bdLoginCss: new Trend('api_bd_login_css_duration', true),
    rootPath: new Trend('api_root_path_duration', true),
    committees: new Trend('api_committees_duration', true),
    siteLogin: new Trend('api_site_login_duration', true),
};

// Error tracking
const errorRate = new Rate('error_rate');
const errorCounter = new Counter('errors_total');
const successCounter = new Counter('success_total');
const apiErrorCounters = {
    javascript: new Counter('errors_javascript'),
    css: new Counter('errors_css'),
    printLogo: new Counter('errors_print_logo'),
    getPacket: new Counter('errors_get_packet'),
    siteLogo: new Counter('errors_site_logo'),
    welcomeImage: new Counter('errors_welcome_image'),
    meetingsListSEO: new Counter('errors_meetings_list_seo'),
    public: new Counter('errors_public'),
    goto: new Counter('errors_goto'),
    cssFile: new Counter('errors_css_file'),
    apiScripts: new Counter('errors_api_scripts'),
    favicon: new Counter('errors_favicon'),
    private: new Counter('errors_private'),
    globalJs: new Counter('errors_global_js'),
    fileDownload: new Counter('errors_file_download'),
    globalPng: new Counter('errors_global_png'),
    plusJs: new Counter('errors_plus_js'),
    vpublic: new Counter('errors_vpublic'),
    globalFavicon: new Counter('errors_global_favicon'),
    getMinutes: new Counter('errors_get_minutes'),
    globalCss: new Counter('errors_global_css'),
    bdLoginCss: new Counter('errors_bd_login_css'),
    rootPath: new Counter('errors_root_path'),
    committees: new Counter('errors_committees'),
    siteLogin: new Counter('errors_site_login'),
};

// =============================================================================
// THRESHOLDS
// =============================================================================

export const options = {
    scenarios: {
        // Scenario 1: Constant load - steady state testing
        constant_load: {
            executor: 'constant-vus',
            vus: 10,
            duration: '2m',
            startTime: '0s',
            tags: { scenario: 'constant_load' },
        },
        
        // Scenario 2: Ramp-up and ramp-down - simulates traffic patterns
        ramp_up_down: {
            executor: 'ramping-vus',
            startVUs: 0,
            stages: [
                { duration: '30s', target: 20 },   // Ramp up to 20 VUs
                { duration: '1m', target: 20 },    // Stay at 20 VUs
                { duration: '30s', target: 50 },   // Ramp up to 50 VUs (peak)
                { duration: '1m', target: 50 },    // Stay at peak
                { duration: '30s', target: 20 },   // Ramp down to 20 VUs
                { duration: '30s', target: 0 },    // Ramp down to 0
            ],
            startTime: '2m30s',
            tags: { scenario: 'ramp_up_down' },
        },
        
        // Scenario 3: Stress test - push beyond normal limits
        stress_test: {
            executor: 'ramping-vus',
            startVUs: 0,
            stages: [
                { duration: '20s', target: 30 },   // Quick ramp up
                { duration: '1m', target: 75 },    // Push to high load
                { duration: '30s', target: 100 },  // Peak stress
                { duration: '20s', target: 0 },    // Quick ramp down
            ],
            startTime: '7m',
            tags: { scenario: 'stress_test' },
        },
    },
    
    thresholds: {
        // Global thresholds
        'http_req_duration': ['p(95)<3000', 'p(99)<5000'],  // 95th percentile < 3s
        'error_rate': ['rate<0.1'],                          // Error rate < 10%
        'http_req_failed': ['rate<0.1'],                     // HTTP failures < 10%
        
        // Per-API thresholds for critical endpoints
        'api_javascript_duration': ['p(95)<2000'],
        'api_css_duration': ['p(95)<2000'],
        'api_get_packet_duration': ['p(95)<3000'],
        'api_public_duration': ['p(95)<3000'],
        'api_meetings_list_seo_duration': ['p(95)<4000'],
        'api_get_minutes_duration': ['p(95)<4000'],
    },
};

// =============================================================================
// API DEFINITIONS
// =============================================================================

const API_ENDPOINTS = [
    {
        name: 'javascript',
        priority: 'Critical',
        buildUrl: () => `${BASE_URL}${BOARD_NSF}/javascript/${JS_FILES[randomIntBetween(0, JS_FILES.length - 1)]}.js`,
        trend: apiTrends.javascript,
        errorCounter: apiErrorCounters.javascript,
    },
    {
        name: 'css',
        priority: 'Critical',
        buildUrl: () => `${BASE_URL}${BOARD_NSF}/css/${CSS_FILES[randomIntBetween(0, CSS_FILES.length - 1)]}.css`,
        trend: apiTrends.css,
        errorCounter: apiErrorCounters.css,
    },
    {
        name: 'printLogo',
        priority: 'High',
        buildUrl: () => `${BASE_URL}${BOARD_NSF}/files/PRINT_LOGO/$file/${SAMPLE_FILENAMES[randomIntBetween(0, SAMPLE_FILENAMES.length - 1)]}`,
        trend: apiTrends.printLogo,
        errorCounter: apiErrorCounters.printLogo,
    },
    {
        name: 'getPacket',
        priority: 'High',
        buildUrl: () => `${BASE_URL}${BOARD_NSF}/BD-GetPacket`,
        trend: apiTrends.getPacket,
        errorCounter: apiErrorCounters.getPacket,
    },
    {
        name: 'siteLogo',
        priority: 'High',
        buildUrl: () => `${BASE_URL}${BOARD_NSF}/files/SITE_LOGO/$file/${SAMPLE_FILENAMES[randomIntBetween(0, SAMPLE_FILENAMES.length - 1)]}`,
        trend: apiTrends.siteLogo,
        errorCounter: apiErrorCounters.siteLogo,
    },
    {
        name: 'welcomeImage',
        priority: 'High',
        buildUrl: () => `${BASE_URL}${BOARD_NSF}/files/WELCOME_IMAGE/$file/${SAMPLE_FILENAMES[randomIntBetween(0, SAMPLE_FILENAMES.length - 1)]}`,
        trend: apiTrends.welcomeImage,
        errorCounter: apiErrorCounters.welcomeImage,
    },
    {
        name: 'meetingsListSEO',
        priority: 'High',
        buildUrl: () => `${BASE_URL}${BOARD_NSF}/BD-GETMeetingsListForSEO`,
        trend: apiTrends.meetingsListSEO,
        errorCounter: apiErrorCounters.meetingsListSEO,
    },
    {
        name: 'public',
        priority: 'High',
        buildUrl: () => `${BASE_URL}${BOARD_NSF}/Public`,
        trend: apiTrends.public,
        errorCounter: apiErrorCounters.public,
    },
    {
        name: 'goto',
        priority: 'High',
        buildUrl: () => `${BASE_URL}${BOARD_NSF}/goto`,
        trend: apiTrends.goto,
        errorCounter: apiErrorCounters.goto,
    },
    {
        name: 'cssFile',
        priority: 'High',
        buildUrl: () => `${BASE_URL}${BOARD_NSF}/${CSS_FILES[randomIntBetween(0, CSS_FILES.length - 1)]}.css`,
        trend: apiTrends.cssFile,
        errorCounter: apiErrorCounters.cssFile,
    },
    {
        name: 'apiScripts',
        priority: 'High',
        buildUrl: () => `${BASE_URL}/api.nsf/getAPIScripts`,
        trend: apiTrends.apiScripts,
        errorCounter: apiErrorCounters.apiScripts,
    },
    {
        name: 'favicon',
        priority: 'High',
        buildUrl: () => `${BASE_URL}/favicon.ico`,
        trend: apiTrends.favicon,
        errorCounter: apiErrorCounters.favicon,
    },
    {
        name: 'private',
        priority: 'High',
        buildUrl: () => `${BASE_URL}${BOARD_NSF}/Private`,
        trend: apiTrends.private,
        errorCounter: apiErrorCounters.private,
    },
    {
        name: 'globalJs',
        priority: 'High',
        buildUrl: () => `${BASE_URL}/global.nsf/javascript/${JS_FILES[randomIntBetween(0, JS_FILES.length - 1)]}.js`,
        trend: apiTrends.globalJs,
        errorCounter: apiErrorCounters.globalJs,
    },
    {
        name: 'fileDownload',
        priority: 'High',
        buildUrl: () => `${BASE_URL}${BOARD_NSF}/files/DQ3N565D2AA5/$file/${SAMPLE_FILENAMES[randomIntBetween(0, SAMPLE_FILENAMES.length - 1)]}`,
        trend: apiTrends.fileDownload,
        errorCounter: apiErrorCounters.fileDownload,
    },
    {
        name: 'globalPng',
        priority: 'High',
        buildUrl: () => `${BASE_URL}/global.nsf/${PNG_FILES[randomIntBetween(0, PNG_FILES.length - 1)]}.png`,
        trend: apiTrends.globalPng,
        errorCounter: apiErrorCounters.globalPng,
    },
    {
        name: 'plusJs',
        priority: 'High',
        buildUrl: () => `${BASE_URL}${BOARD_NSF}/plus/javascript/${JS_FILES[randomIntBetween(0, JS_FILES.length - 1)]}.js`,
        trend: apiTrends.plusJs,
        errorCounter: apiErrorCounters.plusJs,
    },
    {
        name: 'vpublic',
        priority: 'High',
        buildUrl: () => `${BASE_URL}${BOARD_NSF}/vpublic`,
        trend: apiTrends.vpublic,
        errorCounter: apiErrorCounters.vpublic,
    },
    {
        name: 'globalFavicon',
        priority: 'Medium',
        buildUrl: () => `${BASE_URL}/global.nsf/icons/favicon.ico`,
        trend: apiTrends.globalFavicon,
        errorCounter: apiErrorCounters.globalFavicon,
    },
    {
        name: 'getMinutes',
        priority: 'Medium',
        buildUrl: () => `${BASE_URL}${BOARD_NSF}/BD-GetMinutes`,
        trend: apiTrends.getMinutes,
        errorCounter: apiErrorCounters.getMinutes,
    },
    {
        name: 'globalCss',
        priority: 'Medium',
        buildUrl: () => `${BASE_URL}/global.nsf/${CSS_FILES[randomIntBetween(0, CSS_FILES.length - 1)]}.css`,
        trend: apiTrends.globalCss,
        errorCounter: apiErrorCounters.globalCss,
    },
    {
        name: 'bdLoginCss',
        priority: 'Medium',
        buildUrl: () => `${BASE_URL}/BDLogin.nsf/${CSS_FILES[randomIntBetween(0, CSS_FILES.length - 1)]}.css`,
        trend: apiTrends.bdLoginCss,
        errorCounter: apiErrorCounters.bdLoginCss,
    },
    {
        name: 'rootPath',
        priority: 'Medium',
        buildUrl: () => `${BASE_URL}/`,
        trend: apiTrends.rootPath,
        errorCounter: apiErrorCounters.rootPath,
    },
    {
        name: 'committees',
        priority: 'Medium',
        buildUrl: () => `${BASE_URL}${BOARD_NSF}/Committees`,
        trend: apiTrends.committees,
        errorCounter: apiErrorCounters.committees,
    },
    {
        name: 'siteLogin',
        priority: 'Medium',
        buildUrl: () => `${BASE_URL}/BDLogin.nsf/SiteLogin`,
        trend: apiTrends.siteLogin,
        errorCounter: apiErrorCounters.siteLogin,
    },
];

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Parses the configured API list from environment variable
 * Returns array of API endpoint objects based on user selection
 */
function getConfiguredApis() {
    // If "all" is specified, return all endpoints
    if (API_LIST.toLowerCase() === 'all') {
        return API_ENDPOINTS;
    }
    
    // Parse comma-separated list of API names
    const requestedNames = API_LIST.split(',')
        .map(name => name.trim().toLowerCase())
        .filter(name => name.length > 0);
    
    // Filter endpoints based on requested names
    const selectedApis = API_ENDPOINTS.filter(api => 
        requestedNames.includes(api.name.toLowerCase())
    );
    
    if (selectedApis.length === 0) {
        console.error(`ERROR: No valid APIs found in API_LIST: ${API_LIST}`);
        console.error('Available APIs: ' + API_ENDPOINTS.map(a => a.name).join(', '));
        return API_ENDPOINTS.slice(0, 1); // Fallback to first API
    }
    
    return selectedApis;
}

/**
 * Gets the number of APIs to run per iteration
 * Based on API_COUNT environment variable
 */
function getApiCount(availableApis) {
    // If "random" mode, use weighted distribution
    if (API_COUNT.toLowerCase() === 'random') {
        const rand = Math.random() * 100;
        if (rand < 20) return 1;
        if (rand < 45) return 2;
        if (rand < 70) return 3;
        if (rand < 85) return 4;
        if (rand < 95) return 5;
        return randomIntBetween(6, Math.min(8, availableApis.length));
    }
    
    // Otherwise, parse as integer
    const count = parseInt(API_COUNT, 10);
    if (isNaN(count) || count < 1) {
        console.warn(`Invalid API_COUNT: ${API_COUNT}. Using 1.`);
        return 1;
    }
    
    // Don't exceed available APIs
    return Math.min(count, availableApis.length);
}

/**
 * Selects APIs for this iteration based on configuration
 */
function selectApisForIteration() {
    const availableApis = getConfiguredApis();
    const count = getApiCount(availableApis);
    
    // If count equals available, return all
    if (count >= availableApis.length) {
        return availableApis;
    }
    
    // Otherwise, randomly select from available (for variety in load testing)
    const shuffled = [...availableApis].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
}

/**
 * Validates HTTP response status code
 * Success: 200-399 (2xx and 3xx responses)
 */
function isSuccessStatus(status) {
    return status >= 200 && status < 400;
}

/**
 * Logs failed requests with detailed information
 */
function logFailedRequest(apiName, status, url, errorMessage) {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] FAILED REQUEST:
    API: ${apiName}
    Status: ${status}
    URL: ${url}
    Error: ${errorMessage || 'No error message'}`);
}

/**
 * Generates realistic think time between requests
 * Uses a normal distribution around 1-3 seconds
 */
function realisticThinkTime() {
    // Base think time: 0.5 to 3 seconds
    const baseThinkTime = 0.5 + Math.random() * 2.5;
    
    // Occasionally add longer pauses (simulating user reading content)
    if (Math.random() < 0.1) {
        return baseThinkTime + randomIntBetween(2, 5);
    }
    
    return baseThinkTime;
}

// =============================================================================
// MAIN TEST FUNCTION
// =============================================================================

export default function () {
    // Select APIs based on user configuration (API_COUNT and API_LIST env vars)
    const selectedApis = selectApisForIteration();
    const apiCount = selectedApis.length;
    
    group(`Parallel API Batch (${apiCount} APIs)`, function () {
        // Build batch request array
        const batchRequests = selectedApis.map(api => ({
            method: 'GET',
            url: api.buildUrl(),
            params: {
                headers: {
                    'User-Agent': 'k6-load-test/1.0',
                    'Accept': '*/*',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Connection': 'keep-alive',
                },
                tags: {
                    api_name: api.name,
                    priority: api.priority,
                },
                timeout: '30s',
            },
        }));
        
        // Execute all requests in parallel
        const responses = http.batch(batchRequests);
        
        // Process each response
        responses.forEach((response, index) => {
            const api = selectedApis[index];
            const isSuccess = isSuccessStatus(response.status);
            
            // Record metrics
            api.trend.add(response.timings.duration);
            errorRate.add(!isSuccess);
            
            if (isSuccess) {
                successCounter.add(1);
            } else {
                errorCounter.add(1);
                api.errorCounter.add(1);
                logFailedRequest(
                    api.name,
                    response.status,
                    batchRequests[index].url,
                    response.error || response.body?.substring(0, 200)
                );
            }
            
            // Validation checks
            const checkResult = check(response, {
                [`${api.name}: status is 2xx-3xx`]: (r) => isSuccessStatus(r.status),
                [`${api.name}: response time < 5s`]: (r) => r.timings.duration < 5000,
                [`${api.name}: response has body`]: (r) => r.body && r.body.length > 0,
            });
            
            // Additional logging for slow responses
            if (response.timings.duration > 3000) {
                console.warn(`[SLOW RESPONSE] API: ${api.name}, Duration: ${response.timings.duration.toFixed(2)}ms, URL: ${batchRequests[index].url}`);
            }
        });
    });
    
    // Realistic think time between iterations
    sleep(realisticThinkTime());
}

// =============================================================================
// SETUP AND TEARDOWN
// =============================================================================

export function setup() {
    console.log('='.repeat(80));
    console.log('K6 LOAD TEST SUITE - BoardDocs API Performance Testing');
    console.log('='.repeat(80));
    console.log(`Target: ${BASE_URL}${BOARD_NSF}`);
    console.log('');
    console.log('CONFIGURATION:');
    console.log(`  API_COUNT: ${API_COUNT} (APIs per iteration)`);
    console.log(`  API_LIST:  ${API_LIST}`);
    console.log('');
    
    const configuredApis = getConfiguredApis();
    console.log(`Selected APIs (${configuredApis.length} total):`);
    configuredApis.forEach((api, idx) => {
        console.log(`  ${idx + 1}. ${api.name} [${api.priority}]`);
    });
    
    console.log('');
    console.log(`Scenarios: constant_load, ramp_up_down, stress_test`);
    console.log('='.repeat(80));
    
    // Verify connectivity with a simple request
    const testResponse = http.get(`${BASE_URL}${BOARD_NSF}/Public`, {
        timeout: '10s',
    });
    
    if (!isSuccessStatus(testResponse.status)) {
        console.warn(`WARNING: Initial connectivity check returned status ${testResponse.status}`);
    } else {
        console.log(`Connectivity check passed (status: ${testResponse.status})`);
    }
    
    return {
        startTime: new Date().toISOString(),
        targetUrl: `${BASE_URL}${BOARD_NSF}`,
    };
}

export function teardown(data) {
    console.log('='.repeat(80));
    console.log('LOAD TEST COMPLETED');
    console.log('='.repeat(80));
    console.log(`Start Time: ${data.startTime}`);
    console.log(`End Time: ${new Date().toISOString()}`);
    console.log(`Target: ${data.targetUrl}`);
    console.log('='.repeat(80));
    console.log('Review the k6 summary output above for detailed metrics.');
    console.log('Check custom metrics: api_*_duration for per-API performance.');
    console.log('Check error counters: errors_* for failure analysis.');
    console.log('='.repeat(80));
}

// =============================================================================
// CUSTOM SUMMARY HANDLER
// =============================================================================

export function handleSummary(data) {
    const summary = {
        timestamp: new Date().toISOString(),
        testDuration: data.state.testRunDurationMs,
        scenarios: Object.keys(options.scenarios),
        metrics: {
            totalRequests: data.metrics.http_reqs?.values?.count || 0,
            failedRequests: data.metrics.http_req_failed?.values?.passes || 0,
            avgResponseTime: data.metrics.http_req_duration?.values?.avg?.toFixed(2) || 0,
            p95ResponseTime: data.metrics.http_req_duration?.values['p(95)']?.toFixed(2) || 0,
            p99ResponseTime: data.metrics.http_req_duration?.values['p(99)']?.toFixed(2) || 0,
            errorRate: ((data.metrics.error_rate?.values?.rate || 0) * 100).toFixed(2) + '%',
        },
        thresholds: {},
    };
    
    // Collect threshold results
    for (const [key, value] of Object.entries(data.metrics)) {
        if (value.thresholds) {
            summary.thresholds[key] = value.thresholds;
        }
    }
    
    return {
        'stdout': textSummary(data, { indent: ' ', enableColors: true }),
        'summary.json': JSON.stringify(summary, null, 2),
        'summary.html': generateHtmlReport(data, summary),
    };
}

/**
 * Generates a simple text summary (fallback if textSummary is not available)
 */
function textSummary(data, options) {
    let output = '\n';
    output += '='.repeat(80) + '\n';
    output += 'LOAD TEST SUMMARY\n';
    output += '='.repeat(80) + '\n\n';
    
    if (data.metrics.http_reqs) {
        output += `Total Requests: ${data.metrics.http_reqs.values.count}\n`;
    }
    if (data.metrics.http_req_duration) {
        output += `Avg Response Time: ${data.metrics.http_req_duration.values.avg?.toFixed(2)}ms\n`;
        output += `P95 Response Time: ${data.metrics.http_req_duration.values['p(95)']?.toFixed(2)}ms\n`;
        output += `P99 Response Time: ${data.metrics.http_req_duration.values['p(99)']?.toFixed(2)}ms\n`;
    }
    if (data.metrics.http_req_failed) {
        output += `Failed Requests: ${data.metrics.http_req_failed.values.passes}\n`;
    }
    
    output += '\n' + '='.repeat(80) + '\n';
    output += 'THRESHOLD RESULTS\n';
    output += '='.repeat(80) + '\n\n';
    
    for (const [metric, value] of Object.entries(data.metrics)) {
        if (value.thresholds) {
            for (const [threshold, passed] of Object.entries(value.thresholds)) {
                const status = passed ? '✓ PASS' : '✗ FAIL';
                output += `${status} | ${metric}: ${threshold}\n`;
            }
        }
    }
    
    return output;
}

/**
 * Generates an HTML report for the test results
 */
function generateHtmlReport(data, summary) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>K6 Load Test Report - BoardDocs API</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; }
        h1 { color: #333; border-bottom: 3px solid #7B68EE; padding-bottom: 10px; }
        h2 { color: #555; margin-top: 30px; }
        .card { background: white; border-radius: 8px; padding: 20px; margin: 15px 0; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .metric { display: inline-block; margin: 10px 20px 10px 0; }
        .metric-value { font-size: 2em; font-weight: bold; color: #7B68EE; }
        .metric-label { font-size: 0.9em; color: #666; }
        .pass { color: #28a745; }
        .fail { color: #dc3545; }
        table { width: 100%; border-collapse: collapse; margin-top: 15px; }
        th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background: #f8f9fa; font-weight: 600; }
        .timestamp { color: #888; font-size: 0.9em; }
    </style>
</head>
<body>
    <div class="container">
        <h1>K6 Load Test Report</h1>
        <p class="timestamp">Generated: ${summary.timestamp}</p>
        
        <div class="card">
            <h2>Overview</h2>
            <div class="metric">
                <div class="metric-value">${summary.metrics.totalRequests}</div>
                <div class="metric-label">Total Requests</div>
            </div>
            <div class="metric">
                <div class="metric-value">${summary.metrics.avgResponseTime}ms</div>
                <div class="metric-label">Avg Response Time</div>
            </div>
            <div class="metric">
                <div class="metric-value">${summary.metrics.p95ResponseTime}ms</div>
                <div class="metric-label">P95 Response Time</div>
            </div>
            <div class="metric">
                <div class="metric-value">${summary.metrics.errorRate}</div>
                <div class="metric-label">Error Rate</div>
            </div>
        </div>
        
        <div class="card">
            <h2>Test Configuration</h2>
            <p><strong>Target:</strong> ${BASE_URL}${BOARD_NSF}</p>
            <p><strong>Scenarios:</strong> ${summary.scenarios.join(', ')}</p>
            <p><strong>Duration:</strong> ${(summary.testDuration / 1000 / 60).toFixed(2)} minutes</p>
        </div>
        
        <div class="card">
            <h2>Threshold Results</h2>
            <table>
                <tr><th>Metric</th><th>Threshold</th><th>Status</th></tr>
                ${Object.entries(summary.thresholds).map(([metric, thresholds]) => 
                    Object.entries(thresholds).map(([threshold, passed]) => 
                        `<tr>
                            <td>${metric}</td>
                            <td>${threshold}</td>
                            <td class="${passed ? 'pass' : 'fail'}">${passed ? '✓ PASS' : '✗ FAIL'}</td>
                        </tr>`
                    ).join('')
                ).join('')}
            </table>
        </div>
    </div>
</body>
</html>`;
}
