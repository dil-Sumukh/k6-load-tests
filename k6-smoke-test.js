import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

/**
 * K6 SMOKE TEST - BoardDocs API
 * 
 * Quick validation test to verify API connectivity and basic functionality
 * before running full load tests.
 * 
 * Usage: k6 run k6-smoke-test.js
 */

const BASE_URL = 'https://dev.boarddocs.com';
const BOARD_NSF = '/ind/globallogic/Board.nsf';

const errorRate = new Rate('errors');

export const options = {
    vus: 1,
    iterations: 5,
    thresholds: {
        'http_req_duration': ['p(95)<5000'],
        'errors': ['rate<0.5'],
    },
};

// Core endpoints to verify
const SMOKE_ENDPOINTS = [
    { name: 'Public Page', path: `${BOARD_NSF}/Public` },
    { name: 'BD-GetPacket', path: `${BOARD_NSF}/BD-GetPacket` },
    { name: 'Meetings List SEO', path: `${BOARD_NSF}/BD-GETMeetingsListForSEO` },
    { name: 'Committees', path: `${BOARD_NSF}/Committees` },
    { name: 'Favicon', path: '/favicon.ico' },
];

export default function () {
    console.log(`\n--- Smoke Test Iteration ${__ITER + 1} ---`);
    
    SMOKE_ENDPOINTS.forEach((endpoint) => {
        const url = `${BASE_URL}${endpoint.path}`;
        const response = http.get(url, {
            headers: {
                'User-Agent': 'k6-smoke-test/1.0',
            },
            timeout: '15s',
        });
        
        const isSuccess = response.status >= 200 && response.status < 400;
        errorRate.add(!isSuccess);
        
        const checkResult = check(response, {
            [`${endpoint.name}: status 2xx-3xx`]: (r) => r.status >= 200 && r.status < 400,
            [`${endpoint.name}: response time < 5s`]: (r) => r.timings.duration < 5000,
        });
        
        const status = isSuccess ? '✓' : '✗';
        console.log(`${status} ${endpoint.name}: ${response.status} (${response.timings.duration.toFixed(0)}ms)`);
        
        if (!isSuccess) {
            console.error(`  ERROR: ${url} returned ${response.status}`);
        }
    });
    
    sleep(1);
}

export function handleSummary(data) {
    const passed = data.metrics.errors?.values?.rate < 0.5;
    
    console.log('\n' + '='.repeat(60));
    console.log('SMOKE TEST SUMMARY');
    console.log('='.repeat(60));
    console.log(`Status: ${passed ? 'PASSED ✓' : 'FAILED ✗'}`);
    console.log(`Total Requests: ${data.metrics.http_reqs?.values?.count || 0}`);
    console.log(`Error Rate: ${((data.metrics.errors?.values?.rate || 0) * 100).toFixed(1)}%`);
    console.log(`Avg Response Time: ${data.metrics.http_req_duration?.values?.avg?.toFixed(0) || 0}ms`);
    console.log('='.repeat(60));
    
    if (passed) {
        console.log('\n✓ All smoke tests passed. Safe to proceed with load testing.\n');
    } else {
        console.log('\n✗ Smoke tests failed. Check API connectivity before load testing.\n');
    }
    
    return {};
}
