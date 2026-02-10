import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

/**
 * K6 AGGRESSIVE STRESS TEST - Maximize Server CPU Load
 * 
 * This test is designed to push the server's CPU to high utilization by:
 * - Using high number of concurrent virtual users (VUs)
 * - Minimal think time between requests
 * - Targeting CPU-intensive API endpoints
 * - Sustained aggressive load patterns
 * 
 * WARNING: This test is intentionally aggressive. Use only on test/dev environments.
 * 
 * Usage:
 *   k6 run k6-stress-cpu.js
 *   k6 run -e MAX_VUS=500 k6-stress-cpu.js
 *   k6 run -e MAX_VUS=1000 -e DURATION=10m k6-stress-cpu.js
 */

// =============================================================================
// CONFIGURATION
// =============================================================================

const BASE_URL = 'https://dev.boarddocs.com';
const BOARD_NSF = '/ind/globallogic/Board.nsf';

// Configurable via environment variables
const MAX_VUS = parseInt(__ENV.MAX_VUS || '200');
const DURATION = __ENV.DURATION || '5m';
const THINK_TIME = parseFloat(__ENV.THINK_TIME || '0.1');  // Very low think time

// =============================================================================
// METRICS
// =============================================================================

const errorRate = new Rate('errors');
const requestsPerSecond = new Counter('requests_total');
const responseTime = new Trend('response_time', true);

// =============================================================================
// SCENARIOS - Aggressive Load Patterns
// =============================================================================

export const options = {
    scenarios: {
        // Scenario 1: Spike test - sudden massive load
        spike_test: {
            executor: 'ramping-vus',
            startVUs: 0,
            stages: [
                { duration: '10s', target: Math.floor(MAX_VUS * 0.5) },   // Quick ramp to 50%
                { duration: '30s', target: MAX_VUS },                     // Push to max
                { duration: DURATION, target: MAX_VUS },                  // Sustain max load
                { duration: '10s', target: Math.floor(MAX_VUS * 0.5) },  // Step down
                { duration: '10s', target: 0 },                          // Ramp down
            ],
            tags: { scenario: 'spike_test' },
        },
        
        // Scenario 2: Constant hammering - sustained high load
        constant_hammer: {
            executor: 'constant-vus',
            vus: Math.floor(MAX_VUS * 0.7),
            duration: DURATION,
            startTime: '1m',  // Start after spike begins
            tags: { scenario: 'constant_hammer' },
        },
        
        // Scenario 3: Arrival rate - control requests per second
        high_rps: {
            executor: 'constant-arrival-rate',
            rate: MAX_VUS * 2,  // Requests per second
            timeUnit: '1s',
            duration: DURATION,
            preAllocatedVUs: MAX_VUS,
            maxVUs: MAX_VUS * 2,
            startTime: '30s',
            tags: { scenario: 'high_rps' },
        },
    },
    
    // Relaxed thresholds for stress testing
    thresholds: {
        'http_req_duration': ['p(95)<10000'],  // Allow up to 10s under stress
        'errors': ['rate<0.5'],                 // Allow up to 50% errors under extreme load
    },
    
    // Disable TLS verification for speed
    insecureSkipTLSVerify: true,
    
    // Disable connection reuse to stress connection handling
    noConnectionReuse: false,
    
    // User agent
    userAgent: 'k6-stress-test/1.0',
};

// =============================================================================
// CPU-INTENSIVE API ENDPOINTS
// These endpoints typically require more server-side processing
// =============================================================================

const CPU_INTENSIVE_APIS = [
    // Database query endpoints - heavy processing
    {
        name: 'BD-GetPacket',
        url: `${BASE_URL}${BOARD_NSF}/BD-GetPacket`,
        weight: 3,  // Higher weight = called more often
    },
    {
        name: 'BD-GETMeetingsListForSEO',
        url: `${BASE_URL}${BOARD_NSF}/BD-GETMeetingsListForSEO`,
        weight: 3,
    },
    {
        name: 'BD-GetMinutes',
        url: `${BASE_URL}${BOARD_NSF}/BD-GetMinutes`,
        weight: 3,
    },
    {
        name: 'Public',
        url: `${BASE_URL}${BOARD_NSF}/Public`,
        weight: 2,
    },
    {
        name: 'Private',
        url: `${BASE_URL}${BOARD_NSF}/Private`,
        weight: 2,
    },
    {
        name: 'Committees',
        url: `${BASE_URL}${BOARD_NSF}/Committees`,
        weight: 2,
    },
    {
        name: 'vpublic',
        url: `${BASE_URL}${BOARD_NSF}/vpublic`,
        weight: 2,
    },
    {
        name: 'goto',
        url: `${BASE_URL}${BOARD_NSF}/goto`,
        weight: 1,
    },
    // Large file downloads - I/O intensive
    {
        name: 'FileDownload',
        url: `${BASE_URL}${BOARD_NSF}/files/DQ3N565D2AA5/$file/document.pdf`,
        weight: 1,
    },
    {
        name: 'WelcomeImage',
        url: `${BASE_URL}${BOARD_NSF}/files/WELCOME_IMAGE/$file/image.png`,
        weight: 1,
    },
];

// Build weighted API list
const WEIGHTED_API_LIST = [];
CPU_INTENSIVE_APIS.forEach(api => {
    for (let i = 0; i < api.weight; i++) {
        WEIGHTED_API_LIST.push(api);
    }
});

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

function getRandomApi() {
    return WEIGHTED_API_LIST[Math.floor(Math.random() * WEIGHTED_API_LIST.length)];
}

function getMultipleRandomApis(count) {
    const apis = [];
    for (let i = 0; i < count; i++) {
        apis.push(getRandomApi());
    }
    return apis;
}

// =============================================================================
// MAIN TEST FUNCTION - Aggressive Request Pattern
// =============================================================================

export default function () {
    // Fire 3-5 requests in parallel per iteration for maximum stress
    const apiCount = 3 + Math.floor(Math.random() * 3);  // 3 to 5 APIs
    const selectedApis = getMultipleRandomApis(apiCount);
    
    // Build batch requests
    const batchRequests = selectedApis.map(api => ({
        method: 'GET',
        url: api.url,
        params: {
            headers: {
                'Accept': '*/*',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
                'Cache-Control': 'no-cache',
            },
            timeout: '30s',
            tags: { api_name: api.name },
        },
    }));
    
    // Execute all requests in parallel
    const responses = http.batch(batchRequests);
    
    // Process responses
    responses.forEach((response, index) => {
        const api = selectedApis[index];
        const isSuccess = response.status >= 200 && response.status < 400;
        
        requestsPerSecond.add(1);
        responseTime.add(response.timings.duration);
        errorRate.add(!isSuccess);
        
        check(response, {
            'status is 2xx-3xx': (r) => r.status >= 200 && r.status < 400,
        });
        
        // Log only critical failures
        if (response.status >= 500) {
            console.error(`[5xx ERROR] ${api.name}: ${response.status}`);
        }
    });
    
    // Minimal think time for maximum request rate
    if (THINK_TIME > 0) {
        sleep(THINK_TIME);
    }
}

// =============================================================================
// SETUP
// =============================================================================

export function setup() {
    console.log('='.repeat(80));
    console.log('AGGRESSIVE CPU STRESS TEST');
    console.log('='.repeat(80));
    console.log(`Target: ${BASE_URL}${BOARD_NSF}`);
    console.log(`Max VUs: ${MAX_VUS}`);
    console.log(`Duration: ${DURATION}`);
    console.log(`Think Time: ${THINK_TIME}s`);
    console.log(`APIs per request: 3-5 (parallel batch)`);
    console.log('');
    console.log('WARNING: This test is designed to stress the server aggressively!');
    console.log('='.repeat(80));
    
    return { startTime: new Date().toISOString() };
}

export function teardown(data) {
    console.log('='.repeat(80));
    console.log('STRESS TEST COMPLETED');
    console.log(`Started: ${data.startTime}`);
    console.log(`Ended: ${new Date().toISOString()}`);
    console.log('='.repeat(80));
}

// =============================================================================
// SUMMARY
// =============================================================================

export function handleSummary(data) {
    const totalRequests = data.metrics.requests_total?.values?.count || 0;
    const avgResponseTime = data.metrics.response_time?.values?.avg?.toFixed(2) || 0;
    const errorRateValue = ((data.metrics.errors?.values?.rate || 0) * 100).toFixed(2);
    const duration = (data.state.testRunDurationMs / 1000 / 60).toFixed(2);
    
    console.log('\n' + '='.repeat(80));
    console.log('STRESS TEST SUMMARY');
    console.log('='.repeat(80));
    console.log(`Duration: ${duration} minutes`);
    console.log(`Total Requests: ${totalRequests}`);
    console.log(`Requests/sec: ${(totalRequests / (data.state.testRunDurationMs / 1000)).toFixed(2)}`);
    console.log(`Avg Response Time: ${avgResponseTime}ms`);
    console.log(`Error Rate: ${errorRateValue}%`);
    console.log('='.repeat(80));
    
    return {
        'stress-summary.json': JSON.stringify({
            duration: duration,
            totalRequests: totalRequests,
            avgResponseTime: avgResponseTime,
            errorRate: errorRateValue,
            timestamp: new Date().toISOString(),
        }, null, 2),
    };
}
