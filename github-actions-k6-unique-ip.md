# K6 Load Testing with Unique IP per VU - GitHub Actions

## Goal
Run k6 load tests where each Virtual User (VU) originates from a unique outbound IP address.

---

## Architecture Options

### Option 1: Proxy Pool Approach (Recommended)
**Best for: Cost-effective, scalable, easy to implement**

```
┌─────────────────────────────────────────────────────────────────┐
│                     GitHub Actions Runner                        │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                        K6 Test                               ││
│  │  ┌─────┐  ┌─────┐  ┌─────┐  ┌─────┐  ┌─────┐               ││
│  │  │VU 1 │  │VU 2 │  │VU 3 │  │VU N │  │VU N │               ││
│  │  └──┬──┘  └──┬──┘  └──┬──┘  └──┬──┘  └──┬──┘               ││
│  └─────┼────────┼────────┼────────┼────────┼───────────────────┘│
└────────┼────────┼────────┼────────┼────────┼────────────────────┘
         │        │        │        │        │
         ▼        ▼        ▼        ▼        ▼
   ┌──────────────────────────────────────────────┐
   │            Rotating Proxy Pool                │
   │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ │
   │  │Proxy 1 │ │Proxy 2 │ │Proxy 3 │ │Proxy N │ │
   │  │IP: A   │ │IP: B   │ │IP: C   │ │IP: N   │ │
   │  └────────┘ └────────┘ └────────┘ └────────┘ │
   └──────────────────────────────────────────────┘
         │        │        │        │
         ▼        ▼        ▼        ▼
   ┌──────────────────────────────────────────────┐
   │              Target Server                    │
   │    (Sees different IPs per request)          │
   └──────────────────────────────────────────────┘
```

### Option 2: Multi-Runner Matrix (Cloud VMs)
**Best for: True IP isolation, enterprise use**

```
┌─────────────────────────────────────────────────────────────────┐
│                     GitHub Actions                               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │  Runner 1   │  │  Runner 2   │  │  Runner N   │              │
│  │  (VM in     │  │  (VM in     │  │  (VM in     │              │
│  │  Region A)  │  │  Region B)  │  │  Region N)  │              │
│  │  IP: X.X.X.1│  │  IP: X.X.X.2│  │  IP: X.X.X.N│              │
│  │  ┌───────┐  │  │  ┌───────┐  │  │  ┌───────┐  │              │
│  │  │K6 VUs │  │  │  │K6 VUs │  │  │  │K6 VUs │  │              │
│  │  └───────┘  │  │  └───────┘  │  │  └───────┘  │              │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
└─────────────────────────────────────────────────────────────────┘
```

### Option 3: Container-per-VU with Unique NAT
**Best for: Maximum control, Kubernetes environments**

```
┌─────────────────────────────────────────────────────────────────┐
│                    Kubernetes Cluster                            │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                   K6 Operator                             │   │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐      │   │
│  │  │Pod 1    │  │Pod 2    │  │Pod 3    │  │Pod N    │      │   │
│  │  │NAT GW 1 │  │NAT GW 2 │  │NAT GW 3 │  │NAT GW N │      │   │
│  │  │IP: A    │  │IP: B    │  │IP: C    │  │IP: N    │      │   │
│  │  └─────────┘  └─────────┘  └─────────┘  └─────────┘      │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Option 1: Proxy Pool Implementation (Recommended)

### GitHub Actions Workflow

```yaml
# .github/workflows/k6-load-test-unique-ip.yml

name: K6 Load Test with Unique IPs

on:
  workflow_dispatch:
    inputs:
      vus:
        description: 'Number of Virtual Users'
        required: true
        default: '50'
      duration:
        description: 'Test duration (e.g., 10m, 30m)'
        required: true
        default: '10m'
      target_url:
        description: 'Target URL to test'
        required: true
        default: 'https://dev.boarddocs.com/ind/globallogic/Board.nsf/BD-GetPacket'

env:
  PROXY_POOL_SIZE: 100  # Number of proxies in rotation

jobs:
  load-test:
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Install k6
        run: |
          sudo gpg -k
          sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
          echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
          sudo apt-get update
          sudo apt-get install k6

      - name: Setup Proxy Configuration
        run: |
          # Create proxy list file
          # Option A: Use a commercial proxy service (recommended)
          # Option B: Use your own proxy infrastructure
          
          cat > proxies.txt << 'EOF'
          # Format: protocol://user:pass@host:port
          # These would be your actual proxy endpoints
          http://user:pass@proxy1.example.com:8080
          http://user:pass@proxy2.example.com:8080
          http://user:pass@proxy3.example.com:8080
          # ... add more proxies
          EOF
          
          echo "Proxy list created with $(wc -l < proxies.txt) proxies"

      - name: Create K6 Test Script with Proxy Rotation
        run: |
          cat > k6-unique-ip-test.js << 'EOF'
          import http from 'k6/http';
          import { check, sleep } from 'k6';
          import { SharedArray } from 'k6/data';
          import { Counter, Rate, Trend } from 'k6/metrics';

          // Load proxies from file (shared across VUs but each VU gets unique proxy)
          const proxies = new SharedArray('proxies', function() {
              return open('./proxies.txt')
                  .split('\n')
                  .filter(line => line.trim() && !line.startsWith('#'));
          });

          // Custom metrics
          const requestsPerIP = new Counter('requests_per_ip');
          const uniqueIPs = new Counter('unique_ips_used');

          export const options = {
              vus: parseInt(__ENV.VUS) || 50,
              duration: __ENV.DURATION || '10m',
              thresholds: {
                  'http_req_duration': ['p(95)<5000'],
                  'http_req_failed': ['rate<0.1'],
              },
          };

          // Each VU gets a unique proxy based on VU ID
          function getProxyForVU() {
              const vuId = __VU;
              const proxyIndex = (vuId - 1) % proxies.length;
              return proxies[proxyIndex];
          }

          export default function() {
              const targetUrl = __ENV.TARGET_URL || 'https://httpbin.org/ip';
              const proxy = getProxyForVU();
              
              // Make request through proxy
              const params = {
                  headers: {
                      'User-Agent': `k6-load-test/VU-${__VU}`,
                  },
                  timeout: '30s',
              };
              
              // Note: k6 doesn't natively support per-request proxies
              // You need to use the HTTP_PROXY environment variable
              // or use a custom extension
              
              const response = http.get(targetUrl, params);
              
              check(response, {
                  'status is 2xx-3xx': (r) => r.status >= 200 && r.status < 400,
                  'response time < 5s': (r) => r.timings.duration < 5000,
              });
              
              // Log which IP was used (if testing against httpbin.org/ip)
              if (response.status === 200 && targetUrl.includes('httpbin')) {
                  try {
                      const ip = JSON.parse(response.body).origin;
                      console.log(`VU ${__VU}: Using IP ${ip}`);
                  } catch (e) {}
              }
              
              requestsPerIP.add(1, { vu: __VU.toString() });
              
              sleep(1);
          }

          export function setup() {
              console.log('='.repeat(60));
              console.log('K6 LOAD TEST WITH UNIQUE IPS');
              console.log('='.repeat(60));
              console.log(`VUs: ${options.vus}`);
              console.log(`Duration: ${options.duration}`);
              console.log(`Proxies available: ${proxies.length}`);
              console.log('='.repeat(60));
          }
          EOF

      - name: Run K6 Load Test
        env:
          VUS: ${{ github.event.inputs.vus }}
          DURATION: ${{ github.event.inputs.duration }}
          TARGET_URL: ${{ github.event.inputs.target_url }}
          # Set proxy for all requests (rotates based on logic in script)
          # HTTP_PROXY: ${{ secrets.PROXY_URL }}
          # HTTPS_PROXY: ${{ secrets.PROXY_URL }}
        run: |
          k6 run \
            -e VUS=$VUS \
            -e DURATION=$DURATION \
            -e TARGET_URL=$TARGET_URL \
            --out json=results.json \
            k6-unique-ip-test.js

      - name: Upload Results
        uses: actions/upload-artifact@v4
        with:
          name: k6-results
          path: |
            results.json
            summary.json

      - name: Generate Summary
        if: always()
        run: |
          echo "## K6 Load Test Results" >> $GITHUB_STEP_SUMMARY
          echo "" >> $GITHUB_STEP_SUMMARY
          echo "- **VUs**: ${{ github.event.inputs.vus }}" >> $GITHUB_STEP_SUMMARY
          echo "- **Duration**: ${{ github.event.inputs.duration }}" >> $GITHUB_STEP_SUMMARY
          echo "- **Target**: ${{ github.event.inputs.target_url }}" >> $GITHUB_STEP_SUMMARY
```

---

## Option 2: Multi-Runner Matrix Implementation

### GitHub Actions Workflow

```yaml
# .github/workflows/k6-distributed-unique-ip.yml

name: K6 Distributed Load Test (Unique IPs per Runner)

on:
  workflow_dispatch:
    inputs:
      vus_per_runner:
        description: 'VUs per runner'
        required: true
        default: '10'
      duration:
        description: 'Test duration'
        required: true
        default: '10m'
      runners:
        description: 'Number of parallel runners'
        required: true
        default: '5'

jobs:
  # Generate runner matrix dynamically
  setup:
    runs-on: ubuntu-latest
    outputs:
      matrix: ${{ steps.set-matrix.outputs.matrix }}
    steps:
      - id: set-matrix
        run: |
          RUNNERS=${{ github.event.inputs.runners }}
          # Create JSON array for matrix
          MATRIX=$(seq 1 $RUNNERS | jq -R . | jq -s -c '{runner: .}')
          echo "matrix=$MATRIX" >> $GITHUB_OUTPUT

  # Each runner gets a unique IP from different GitHub infrastructure
  load-test:
    needs: setup
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      max-parallel: 50  # Run all in parallel
      matrix: ${{ fromJson(needs.setup.outputs.matrix) }}
    
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Get Runner IP
        id: ip
        run: |
          MY_IP=$(curl -s https://api.ipify.org)
          echo "Runner ${{ matrix.runner }} IP: $MY_IP"
          echo "ip=$MY_IP" >> $GITHUB_OUTPUT

      - name: Install k6
        run: |
          sudo gpg -k
          sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
          echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
          sudo apt-get update
          sudo apt-get install k6

      - name: Run K6 Test
        run: |
          k6 run \
            --vus ${{ github.event.inputs.vus_per_runner }} \
            --duration ${{ github.event.inputs.duration }} \
            --tag runner=${{ matrix.runner }} \
            --tag ip=${{ steps.ip.outputs.ip }} \
            --out json=results-${{ matrix.runner }}.json \
            k6-meeting-load-test.js

      - name: Upload Results
        uses: actions/upload-artifact@v4
        with:
          name: results-runner-${{ matrix.runner }}
          path: results-${{ matrix.runner }}.json

  # Aggregate results from all runners
  aggregate:
    needs: load-test
    runs-on: ubuntu-latest
    steps:
      - name: Download all results
        uses: actions/download-artifact@v4
        with:
          pattern: results-runner-*
          merge-multiple: true

      - name: Aggregate Results
        run: |
          echo "## Distributed Load Test Summary" >> $GITHUB_STEP_SUMMARY
          echo "" >> $GITHUB_STEP_SUMMARY
          echo "| Runner | IP | Status |" >> $GITHUB_STEP_SUMMARY
          echo "|--------|-----|--------|" >> $GITHUB_STEP_SUMMARY
          
          for f in results-*.json; do
            if [ -f "$f" ]; then
              echo "| $(basename $f .json) | - | ✓ |" >> $GITHUB_STEP_SUMMARY
            fi
          done
```

---

## Option 3: Using K6 Cloud with Geo-Distribution

### GitHub Actions Workflow

```yaml
# .github/workflows/k6-cloud-distributed.yml

name: K6 Cloud Distributed Load Test

on:
  workflow_dispatch:
    inputs:
      vus:
        description: 'Total VUs'
        required: true
        default: '100'
      duration:
        description: 'Test duration'
        required: true
        default: '10m'

jobs:
  cloud-test:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Install k6
        run: |
          sudo apt-get update
          sudo apt-get install -y gnupg software-properties-common
          sudo gpg -k
          sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
          echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
          sudo apt-get update
          sudo apt-get install k6

      - name: Create Distributed Test Script
        run: |
          cat > k6-cloud-distributed.js << 'EOF'
          import http from 'k6/http';
          import { check, sleep } from 'k6';

          export const options = {
              // K6 Cloud handles distribution automatically
              ext: {
                  loadimpact: {
                      projectID: parseInt(__ENV.K6_PROJECT_ID),
                      name: 'Distributed Load Test',
                      distribution: {
                          // Distribute VUs across multiple regions
                          'amazon:us:ashburn': { loadZone: 'amazon:us:ashburn', percent: 25 },
                          'amazon:ie:dublin': { loadZone: 'amazon:ie:dublin', percent: 25 },
                          'amazon:sg:singapore': { loadZone: 'amazon:sg:singapore', percent: 25 },
                          'amazon:au:sydney': { loadZone: 'amazon:au:sydney', percent: 25 },
                      },
                  },
              },
              vus: parseInt(__ENV.VUS) || 100,
              duration: __ENV.DURATION || '10m',
          };

          export default function() {
              const response = http.get(__ENV.TARGET_URL);
              check(response, {
                  'status is 2xx': (r) => r.status >= 200 && r.status < 300,
              });
              sleep(1);
          }
          EOF

      - name: Run K6 Cloud Test
        env:
          K6_CLOUD_TOKEN: ${{ secrets.K6_CLOUD_TOKEN }}
          K6_PROJECT_ID: ${{ secrets.K6_PROJECT_ID }}
          VUS: ${{ github.event.inputs.vus }}
          DURATION: ${{ github.event.inputs.duration }}
          TARGET_URL: 'https://dev.boarddocs.com/ind/globallogic/Board.nsf/BD-GetPacket'
        run: |
          k6 cloud k6-cloud-distributed.js
```

---

## Trade-offs Comparison

| Approach | Unique IPs | Cost | Complexity | Scalability | IP Guarantee |
|----------|-----------|------|------------|-------------|--------------|
| **Proxy Pool** | Per-request rotation | $50-500/mo | Low | High | Depends on pool size |
| **Multi-Runner Matrix** | Per-runner | Free (GitHub Actions) | Medium | Limited to 256 jobs | ~50-100 unique IPs |
| **K6 Cloud** | Per-region | $99+/mo | Low | Very High | 4-10 regions |
| **Self-hosted + NAT** | Per-VU possible | High (infra) | High | Medium | Full control |
| **Kubernetes + NAT GW** | Per-pod | Medium-High | High | Very High | Full control |

---

## How Unique IPs Are Guaranteed

### Proxy Pool Approach
```
VU 1 → Proxy 1 (IP: 1.1.1.1) → Target
VU 2 → Proxy 2 (IP: 2.2.2.2) → Target
VU 3 → Proxy 3 (IP: 3.3.3.3) → Target
...
VU N → Proxy (N % pool_size) → Target
```
- Each VU is assigned a specific proxy based on VU ID
- IP uniqueness = min(VUs, proxy_pool_size)

### Multi-Runner Matrix
```
Runner 1 (VM in datacenter A) → IP: X.X.X.1
Runner 2 (VM in datacenter B) → IP: X.X.X.2
Runner 3 (VM in datacenter C) → IP: X.X.X.3
```
- GitHub spawns runners in different infrastructure
- ~50-100 unique IPs possible (GitHub's pool)
- NOT guaranteed unique - runners may share IPs

### K6 Cloud
```
Region US-East    → Pool of IPs in US-East
Region EU-West    → Pool of IPs in EU-West
Region AP-South   → Pool of IPs in AP-South
```
- Each region has multiple IPs
- Automatic distribution across regions
- Best for geo-distributed testing

---

## Recommended Approach for Your Use Case

Given your BoardDocs load testing needs:

1. **For Development/Testing**: Use **Multi-Runner Matrix**
   - Free with GitHub Actions
   - Gets you 5-50 unique IPs easily
   - Good enough for validating IP-based rate limiting

2. **For Production Load Testing**: Use **Proxy Pool**
   - Services like Bright Data, Oxylabs, or SmartProxy
   - Thousands of IPs available
   - ~$50-200/month for load testing use

3. **For Enterprise/Large Scale**: Use **K6 Cloud**
   - Built-in geo-distribution
   - Professional reporting
   - No infrastructure to manage

---

## Quick Start Commands

```bash
# Option 1: Run locally with proxy
HTTP_PROXY=http://user:pass@proxy.example.com:8080 k6 run k6-meeting-load-test.js

# Option 2: Trigger GitHub Actions workflow
gh workflow run k6-load-test-unique-ip.yml -f vus=50 -f duration=10m

# Option 3: K6 Cloud
K6_CLOUD_TOKEN=xxx k6 cloud k6-meeting-load-test.js
```
