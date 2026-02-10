import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import { randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.2.0/index.js';

/**
 * K6 MEETING & API LOAD TEST
 * 
 * Load testing for BoardDocs Meeting APIs
 * Target: dev.boarddocs.com/ind/globallogic/Board.nsf
 * 
 * API Endpoints:
 *   1. /goto?open&id={meetingId}
 *   2. /BD-GetPacket?open&{random}
 *   3. /BD-WhoAmI.js?open&{random}
 *   4. /BD-NavigateTo.js?open&{random}
 *   5. /BD-GETMeetingsListForSEO?open&{random}
 *   6. /BD-GetPolicyBooks?open&{random}
 *   7. /BD-GetPolicies?open&{random}
 *   8. /BD-GetPolicyItem?open&{random}
 *   9. /BD-GetPublicFiles?open&{random}
 * 
 * Usage:
 *   k6 run k6-meeting-load-test.js
 *   k6 run -e MAX_VUS=100 -e DURATION=5m k6-meeting-load-test.js
 */

// =============================================================================
// CONFIGURATION
// =============================================================================

const BASE_URL = 'https://go.boarddocs.com';
const BOARD_NSF = '/support/Board.nsf';

// Load test parameters
const MAX_VUS = parseInt(__ENV.MAX_VUS || '300');
const DURATION = __ENV.DURATION || '5m';
const THINK_TIME_MIN = parseFloat(__ENV.THINK_TIME_MIN || '0.5');
const THINK_TIME_MAX = parseFloat(__ENV.THINK_TIME_MAX || '2');

// API selection from environment variable (set by run-k6-tests.ps1)
const API_LIST = __ENV.API_LIST || 'all';

// Sample meeting/document IDs for testing
const MEETING_IDS = [
    'DDFEKA3ABB6C',
    'DQZJF82B6244',
    // Add more meeting IDs here for variety
];

// =============================================================================
// CUSTOM METRICS
// =============================================================================

// Per-API metrics for the 7 endpoints
const apiMetrics = {
    goto: { trend: new Trend('api_goto_duration', true), errors: new Counter('errors_goto') },
    getPacket: { trend: new Trend('api_get_packet_duration', true), errors: new Counter('errors_get_packet') },
    meetingsListSEO: { trend: new Trend('api_meetings_list_seo_duration', true), errors: new Counter('errors_meetings_list_seo') },
    getPolicyBooks: { trend: new Trend('api_get_policy_books_duration', true), errors: new Counter('errors_get_policy_books') },
    getPolicies: { trend: new Trend('api_get_policies_duration', true), errors: new Counter('errors_get_policies') },
    getPolicyItem: { trend: new Trend('api_get_policy_item_duration', true), errors: new Counter('errors_get_policy_item') },
    getPublicFiles: { trend: new Trend('api_get_public_files_duration', true), errors: new Counter('errors_get_public_files') },
};

const errorRate = new Rate('error_rate');
const successCounter = new Counter('success_total');
const errorCounter = new Counter('errors_total');

// =============================================================================
// THRESHOLDS & SCENARIOS
// =============================================================================

export const options = {
    scenarios: {
        // Scenario 1: CONSTANT LOAD for 1 minute
        // Maintains steady load throughout the duration
        constant_load: {
            executor: 'constant-vus',
            vus: MAX_VUS,
            duration: '30m',
            tags: { scenario: 'constant_load' },
        },
    },
    
    thresholds: {
        'http_req_duration': ['p(95)<5000', 'p(99)<10000'],
        'error_rate': ['rate<0.2'],
        'api_goto_duration': ['p(95)<3000'],
        'api_get_packet_duration': ['p(95)<5000'],
        'api_meetings_list_seo_duration': ['p(95)<5000'],
        'api_get_policy_books_duration': ['p(95)<3000'],
        'api_get_policies_duration': ['p(95)<3000'],
        'api_get_public_files_duration': ['p(95)<3000'],
    },
    
    // TLS settings
    insecureSkipTLSVerify: true,
};

// =============================================================================
// API ENDPOINTS
// =============================================================================

// Generate random parameter like 0.0907110626765848
function generateRandomParam() {
    return '0.' + Math.random().toString().substring(2, 18);
}

function getRandomMeetingId() {
    return MEETING_IDS[Math.floor(Math.random() * MEETING_IDS.length)];
}

const API_ENDPOINTS = [
    // 1. /goto
    {
        name: 'goto',
        buildUrl: () => `${BASE_URL}${BOARD_NSF}/goto?open&id=${getRandomMeetingId()}`,
        metrics: apiMetrics.goto,
        weight: 3,
    },
    // 2. /BD-GetPacket
    {
        name: 'BD-GetPacket',
        buildUrl: () => `${BASE_URL}${BOARD_NSF}/BD-GetPacket`,
        metrics: apiMetrics.getPacket,
        weight: 4,  // CPU intensive
    },
    // 3. /BD-GETMeetingsListForSEO
    {
        name: 'BD-GETMeetingsListForSEO',
        buildUrl: () => `${BASE_URL}${BOARD_NSF}/BD-GETMeetingsListForSEO?open&${generateRandomParam()}`,
        metrics: apiMetrics.meetingsListSEO,
        weight: 4,  // CPU intensive - large data
    },
    // 4. /BD-GetPolicyBooks
    {
        name: 'BD-GetPolicyBooks',
        buildUrl: () => `${BASE_URL}${BOARD_NSF}/BD-GetPolicyBooks?open&${generateRandomParam()}`,
        metrics: apiMetrics.getPolicyBooks,
        weight: 3,
    },
    // 5. /BD-GetPolicies
    {
        name: 'BD-GetPolicies',
        buildUrl: () => `${BASE_URL}${BOARD_NSF}/BD-GetPolicies?open&${generateRandomParam()}`,
        metrics: apiMetrics.getPolicies,
        weight: 3,
    },
    // 6. /BD-GetPolicyItem
    {
        name: 'BD-GetPolicyItem',
        buildUrl: () => `${BASE_URL}${BOARD_NSF}/BD-GetPolicyItem?open&${generateRandomParam()}`,
        metrics: apiMetrics.getPolicyItem,
        weight: 2,
    },
    // 7. /BD-GetPublicFiles
    {
        name: 'BD-GetPublicFiles',
        buildUrl: () => `${BASE_URL}${BOARD_NSF}/BD-GetPublicFiles?open&${generateRandomParam()}`,
        metrics: apiMetrics.getPublicFiles,
        weight: 3,
    },
];

// Filter APIs based on API_LIST environment variable
function getFilteredApis() {
    if (API_LIST.toLowerCase() === 'all') {
        return API_ENDPOINTS;
    }
    
    const requestedNames = API_LIST.split(',')
        .map(name => name.trim().toLowerCase());
    
    const filtered = API_ENDPOINTS.filter(api => 
        requestedNames.includes(api.name.toLowerCase())
    );
    
    if (filtered.length === 0) {
        console.warn(`No matching APIs found for: ${API_LIST}. Using all APIs.`);
        return API_ENDPOINTS;
    }
    
    return filtered;
}

const FILTERED_API_ENDPOINTS = getFilteredApis();

// Build weighted list for random selection (using filtered APIs)
const WEIGHTED_API_LIST = [];
FILTERED_API_ENDPOINTS.forEach(api => {
    for (let i = 0; i < api.weight; i++) {
        WEIGHTED_API_LIST.push(api);
    }
});

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

function getRandomApis(count) {
    const selected = [];
    for (let i = 0; i < count; i++) {
        const api = WEIGHTED_API_LIST[Math.floor(Math.random() * WEIGHTED_API_LIST.length)];
        selected.push(api);
    }
    return selected;
}

function isSuccessStatus(status) {
    return status >= 200 && status < 400;
}

function logFailedRequest(apiName, status, url, error) {
    console.error(`[FAILED] ${apiName}: Status=${status}, URL=${url}, Error=${error || 'N/A'}`);
}

// =============================================================================
// MAIN TEST FUNCTION
// =============================================================================

export default function () {
    // Select APIs to run in parallel per iteration
    // If only 1 API is selected, use that one; otherwise pick 2-4 randomly
    const maxApis = Math.min(4, FILTERED_API_ENDPOINTS.length);
    const minApis = Math.min(2, FILTERED_API_ENDPOINTS.length);
    const apiCount = FILTERED_API_ENDPOINTS.length === 1 ? 1 : randomIntBetween(minApis, maxApis);
    const selectedApis = getRandomApis(apiCount);
    
    group(`API Batch (${apiCount} APIs)`, function () {
        // Build batch request
        const batchRequests = selectedApis.map(api => ({
            method: 'GET',
            url: api.buildUrl(),
            params: {
                headers: {
                    'User-Agent': 'k6-meeting-load-test/1.0',
                    'Accept': 'application/json, text/javascript, */*',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Connection': 'keep-alive',
                    'Cache-Control': 'no-cache',
                },
                timeout: '60s',
                tags: { api_name: api.name },
            },
        }));
        
        // Execute parallel requests
        const responses = http.batch(batchRequests);
        
        // Process responses
        responses.forEach((response, index) => {
            const api = selectedApis[index];
            const isSuccess = isSuccessStatus(response.status);
            
            // Record metrics
            api.metrics.trend.add(response.timings.duration);
            errorRate.add(!isSuccess);
            
            if (isSuccess) {
                successCounter.add(1);
            } else {
                errorCounter.add(1);
                api.metrics.errors.add(1);
                logFailedRequest(
                    api.name,
                    response.status,
                    batchRequests[index].url,
                    response.error
                );
            }
            
            // Validation
            check(response, {
                [`${api.name}: status 2xx-3xx`]: (r) => isSuccessStatus(r.status),
                [`${api.name}: response time < 10s`]: (r) => r.timings.duration < 10000,
            });
            
            // Warn on slow responses
            if (response.timings.duration > 5000) {
                console.warn(`[SLOW] ${api.name}: ${response.timings.duration.toFixed(0)}ms`);
            }
        });
    });
    
    // Realistic think time
    sleep(randomIntBetween(THINK_TIME_MIN * 10, THINK_TIME_MAX * 10) / 10);
}

// =============================================================================
// SETUP & TEARDOWN
// =============================================================================

export function setup() {
    console.log('='.repeat(80));
    console.log('MEETING & API LOAD TEST');
    console.log('='.repeat(80));
    console.log(`Target: ${BASE_URL}${BOARD_NSF}`);
    console.log(`Max VUs: ${MAX_VUS}`);
    console.log(`Duration: ${DURATION}`);
    console.log(`Think Time: ${THINK_TIME_MIN}s - ${THINK_TIME_MAX}s`);
    console.log('');
    console.log(`API Selection: ${API_LIST}`);
    console.log('');
    console.log(`APIs under test (${FILTERED_API_ENDPOINTS.length} selected):`);
    FILTERED_API_ENDPOINTS.forEach((api, idx) => {
        console.log(`  ${idx + 1}. ${api.name} (weight: ${api.weight})`);
    });
    console.log('');
    console.log('Meeting IDs:', MEETING_IDS.join(', '));
    console.log('='.repeat(80));
    
    // Connectivity check
    const testUrl = `${BASE_URL}${BOARD_NSF}/BD-GetPacket`;
    const testResponse = http.get(testUrl, { timeout: '30s' });
    
    if (isSuccessStatus(testResponse.status)) {
        console.log(`Connectivity check: PASSED (${testResponse.status})`);
    } else {
        console.warn(`Connectivity check: Status ${testResponse.status}`);
    }
    
    console.log('='.repeat(80));
    
    return { startTime: new Date().toISOString() };
}

export function teardown(data) {
    console.log('='.repeat(80));
    console.log('LOAD TEST COMPLETED');
    console.log(`Start: ${data.startTime}`);
    console.log(`End: ${new Date().toISOString()}`);
    console.log('='.repeat(80));
}

// =============================================================================
// SUMMARY
// =============================================================================

export function handleSummary(data) {
    const summary = {
        timestamp: new Date().toISOString(),
        duration: (data.state.testRunDurationMs / 1000 / 60).toFixed(2) + ' minutes',
        totalRequests: data.metrics.http_reqs?.values?.count || 0,
        successCount: data.metrics.success_total?.values?.count || 0,
        errorCount: data.metrics.errors_total?.values?.count || 0,
        errorRate: ((data.metrics.error_rate?.values?.rate || 0) * 100).toFixed(2) + '%',
        avgResponseTime: (data.metrics.http_req_duration?.values?.avg || 0).toFixed(2) + 'ms',
        p95ResponseTime: (data.metrics.http_req_duration?.values['p(95)'] || 0).toFixed(2) + 'ms',
        p99ResponseTime: (data.metrics.http_req_duration?.values['p(99)'] || 0).toFixed(2) + 'ms',
    };
    
    console.log('\n' + '='.repeat(80));
    console.log('SUMMARY');
    console.log('='.repeat(80));
    console.log(`Duration: ${summary.duration}`);
    console.log(`Total Requests: ${summary.totalRequests}`);
    console.log(`Success: ${summary.successCount} | Errors: ${summary.errorCount}`);
    console.log(`Error Rate: ${summary.errorRate}`);
    console.log(`Avg Response Time: ${summary.avgResponseTime}`);
    console.log(`P95 Response Time: ${summary.p95ResponseTime}`);
    console.log(`P99 Response Time: ${summary.p99ResponseTime}`);
    console.log('='.repeat(80));
    
    // Per-API breakdown
    console.log('\nPer-API Metrics:');
    API_ENDPOINTS.forEach(api => {
        const metricKey = `api_${api.name.replace(/([A-Z])/g, '_$1').toLowerCase()}_duration`;
        const metric = data.metrics[metricKey];
        if (metric) {
            console.log(`  ${api.name}: avg=${metric.values.avg?.toFixed(0)}ms, p95=${metric.values['p(95)']?.toFixed(0)}ms`);
        }
    });
    
    return {
        'meeting-load-summary.json': JSON.stringify(summary, null, 2),
    };
}
