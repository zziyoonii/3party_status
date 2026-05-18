// API 기본 URL
const API_BASE = '/api';

// 차트 인스턴스
let statusCharts = {
    openai: null,
    claude: null,
    gemini: null
};
let externalStatusCharts = {
    cloudflare: null,
    twilio: null,
    channeltalk: null,
    aws: null
};
let responseTimeChart = null;
let externalResponseTimeChart = null;

// 초기화
document.addEventListener('DOMContentLoaded', () => {
    initializeCharts();
    // 외부 서비스 차트는 탭이 활성화될 때 초기화하므로 여기서는 초기화하지 않음
    setupEventListeners();
    setupTabs();
    
    // 저장된 탭 상태 복원
    const savedTab = localStorage.getItem('activeTab') || 'llm-services';
    const tabButton = document.querySelector(`[data-tab="${savedTab}"]`);
    if (tabButton) {
        tabButton.click();
    } else {
        // 기본값으로 LLM 서비스 탭 로드
        loadDashboard();
    }
    
    // 자동 새로고침 (1분마다)
    setInterval(() => {
        const activeTab = document.querySelector('.tab-button.active').dataset.tab;
        if (activeTab === 'llm-services') {
            loadStats();
            loadProviderStatuses();
            loadRecords();
            loadAlerts();
            checkCriticalIssues();
        } else if (activeTab === 'external-services') {
            loadExternalProviderStatuses();
            loadExternalRecords();
            loadExternalAlerts();
            checkExternalCriticalIssues();
            updateExternalStatusChart();
            updateExternalResponseTimeChart();
        }
        updateLastUpdateTime();
    }, 60000);
});

// 이벤트 리스너 설정
function setupEventListeners() {
    document.getElementById('refreshBtn').addEventListener('click', () => {
        const activeTab = document.querySelector('.tab-button.active').dataset.tab;
        if (activeTab === 'llm-services') {
            loadDashboard();
        } else if (activeTab === 'external-services') {
            loadExternalServicesDashboard();
        }
    });
    document.getElementById('providerFilter').addEventListener('change', () => {
        loadRecords();
        loadStats(); // Provider 변경 시 통계와 차트도 업데이트
    });
    document.getElementById('statusFilter').addEventListener('change', loadRecords);
    document.getElementById('statsTimeRange').addEventListener('change', () => {
        updateStatusChart(); // 시간 범위 변경 시 상태 차트만 업데이트
    });
    document.getElementById('responseTimeRange').addEventListener('change', () => {
        updateResponseTimeChart(); // 시간 범위 변경 시 응답 시간 차트 업데이트
    });
    
    // 외부 서비스 탭 이벤트 리스너
    document.getElementById('externalProviderFilter')?.addEventListener('change', () => {
        loadExternalRecords();
        updateExternalStatusChart();
    });
    document.getElementById('externalStatusFilter')?.addEventListener('change', loadExternalRecords);
    document.getElementById('externalStatsTimeRange')?.addEventListener('change', () => {
        updateExternalStatusChart();
    });
    document.getElementById('externalResponseTimeRange')?.addEventListener('change', () => {
        updateExternalResponseTimeChart();
    });
}

// 탭 설정
function setupTabs() {
    const tabButtons = document.querySelectorAll('.tab-button');
    
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetTab = button.dataset.tab;
            
            // 모든 탭 버튼 비활성화
            tabButtons.forEach(btn => btn.classList.remove('active'));
            // 모든 탭 컨텐츠 숨기기
            document.querySelectorAll('.tab-content').forEach(content => {
                content.classList.remove('active');
            });
            
            // 선택된 탭 활성화
            button.classList.add('active');
            document.getElementById(`${targetTab}-tab`).classList.add('active');
            
            // 탭 상태를 localStorage에 저장
            localStorage.setItem('activeTab', targetTab);
            
            // LLM 서비스 탭으로 전환 시 대시보드 로드
            if (targetTab === 'llm-services') {
                loadDashboard();
            } else if (targetTab === 'external-services') {
                loadExternalServicesDashboard();
            }
        });
    });
}

// 차트 초기화
function initializeCharts() {
    // 각 Provider별 원형 차트 초기화
    const providers = ['openai', 'claude', 'gemini'];
    const providerColors = {
        'openai': '#10b981',
        'claude': '#a1a1aa',
        'gemini': '#f59e0b'
    };
    
    providers.forEach((provider, index) => {
        const ctx = document.getElementById(`${provider}StatusChart`).getContext('2d');
        statusCharts[provider] = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['정상', '저하', '다운'],
                datasets: [{
                    data: [0, 0, 0],
                    backgroundColor: [
                        '#10b981',
                        '#f59e0b',
                        '#ef4444'
                    ],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: index === 0,
                        position: 'bottom',
                        labels: {
                            color: '#f1f5f9',
                            padding: 8,
                            font: {
                                size: 11
                            }
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const label = context.label || '';
                                const value = context.parsed || 0;
                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                                return `${label}: ${value}건 (${percentage}%)`;
                            }
                        }
                    }
                }
            }
        });
    });

    const responseTimeCtx = document.getElementById('responseTimeChart').getContext('2d');
    responseTimeChart = new Chart(responseTimeCtx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [] // 동적으로 provider별로 추가됨
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: {
                        color: '#f1f5f9'
                    }
                }
            },
            scales: {
                x: {
                    ticks: {
                        color: '#94a3b8'
                    },
                    grid: {
                        color: '#334155'
                    }
                },
                y: {
                    beginAtZero: true,
                    ticks: {
                        color: '#94a3b8',
                        callback: function(value) {
                            return value + 'ms';
                        }
                    },
                    grid: {
                        color: '#334155'
                    }
                }
            }
        }
    });
}

// 대시보드 데이터 로드
async function loadDashboard() {
    try {
        await Promise.all([
            loadStats(),
            loadProviderStatuses(),
            loadRecords(),
            loadAlerts(),
            checkCriticalIssues()
        ]);
        updateLastUpdateTime();
    } catch (error) {
        console.error('Dashboard load error:', error);
        showError('데이터를 불러오는 중 오류가 발생했습니다.');
    }
}

// Provider별 상태 로드 (병렬 처리로 최적화)
async function loadProviderStatuses() {
    const providers = ['openai', 'claude', 'gemini'];
    
    // 모든 provider의 상태를 병렬로 로드
    await Promise.all(providers.map(async (provider) => {
        try {
            const [statsResponse, recordsResponse] = await Promise.all([
                fetch(`${API_BASE}/monitor/stats?hours=1&provider=${provider}`),
                fetch(`${API_BASE}/monitor/records?limit=1&provider=${provider}`)
            ]);
            
            const stats = await statsResponse.json();
            const recordsData = await recordsResponse.json();
            
            const latestRecord = recordsData.records[0];
            const status = latestRecord ? latestRecord.status : 'UNKNOWN';
            
            // 상태 배지 업데이트
            const badge = document.getElementById(`${provider}StatusBadge`);
            const card = document.getElementById(`${provider}StatusCard`);
            
            if (badge && card) {
                badge.textContent = getStatusText(status);
                badge.className = `provider-status-badge status-${status.toLowerCase()}`;
                card.className = `provider-status-card status-${status.toLowerCase()}`;
            }
            
            // 응답 시간 및 건강도 업데이트
            const responseTimeEl = document.getElementById(`${provider}ResponseTime`);
            const healthRateEl = document.getElementById(`${provider}HealthRate`);
            
            if (responseTimeEl) {
                responseTimeEl.textContent = latestRecord?.response_time_ms 
                    ? `${latestRecord.response_time_ms.toFixed(0)}ms` 
                    : '-';
            }
            
            if (healthRateEl) {
                healthRateEl.textContent = stats.total_records > 0 
                    ? `${stats.health_rate.toFixed(1)}%` 
                    : '-';
            }
        } catch (error) {
            console.error(`Error loading ${provider} status:`, error);
        }
    }));
}

// 통계 로드 (전체 통계) - 병렬 처리로 최적화
async function loadStats() {
    try {
        // LLM 서비스만 통계 로드 (openai, claude, gemini)
        // 기본값: 최근 24시간 (전체 통계는 긴 기간이 더 의미있음)
        const llmProviders = ['openai', 'claude', 'gemini'];
        
        // 모든 provider의 통계를 병렬로 가져오기
        const statsPromises = llmProviders.map(provider => 
            fetch(`${API_BASE}/monitor/stats?hours=24&provider=${provider}`)
                .then(res => res.json())
                .catch(error => {
                    console.error(`Error loading stats for ${provider}:`, error);
                    return null;
                })
        );
        
        const statsResults = await Promise.all(statsPromises);
        
        // 각 LLM provider의 통계를 합산
        let totalRecords = 0;
        let healthyCount = 0;
        let errorCount = 0;
        let totalResponseTime = 0;
        let responseTimeCount = 0;
        
        statsResults.forEach(stats => {
            if (!stats) return;
            
            totalRecords += stats.total_records || 0;
            healthyCount += stats.healthy_count || 0;
            errorCount += stats.error_count || 0;
            
            if (stats.avg_response_time_ms && stats.total_records > 0) {
                totalResponseTime += stats.avg_response_time_ms * stats.total_records;
                responseTimeCount += stats.total_records;
            }
        });
        
        const avgResponseTime = responseTimeCount > 0 ? totalResponseTime / responseTimeCount : null;
        const healthRate = totalRecords > 0 ? (healthyCount / totalRecords) * 100 : 0;
        
        document.getElementById('totalRecords').textContent = totalRecords.toLocaleString();
        document.getElementById('healthyCount').textContent = healthyCount.toLocaleString();
        document.getElementById('errorCount').textContent = errorCount.toLocaleString();
        document.getElementById('healthRate').textContent = `${healthRate.toFixed(1)}%`;
        document.getElementById('avgResponseTime').textContent = 
            avgResponseTime ? `${avgResponseTime.toFixed(0)}ms` : 'N/A';
        
        // 상태 차트 업데이트 (provider별로 구분)
        await updateStatusChart();
        
        // 최근 기록으로 응답 시간 차트 업데이트
        await updateResponseTimeChart();
    } catch (error) {
        console.error('Stats load error:', error);
    }
}

// 상태 통계 차트 업데이트 (provider별 원형 그래프)
async function updateStatusChart() {
    try {
        const providers = ['openai', 'claude', 'gemini'];
        
        // 선택된 시간 범위 가져오기 (기본값: 1시간)
        const hours = parseInt(document.getElementById('statsTimeRange').value || '1', 10);
        
        // 각 provider별 통계 가져오기 및 차트 업데이트
        for (const provider of providers) {
            try {
                const response = await fetch(`${API_BASE}/monitor/stats?hours=${hours}&provider=${provider}`);
                const stats = await response.json();
                
                const chart = statusCharts[provider];
                if (chart) {
                    const degraded = stats.total_records - stats.healthy_count - stats.error_count;
                    
                    chart.data.datasets[0].data = [
                        stats.healthy_count,
                        degraded,
                        stats.error_count
                    ];
                    chart.update();
                }
            } catch (error) {
                console.error(`Error loading stats for ${provider}:`, error);
            }
        }
    } catch (error) {
        console.error('Status chart update error:', error);
    }
}

// 응답 시간 차트 업데이트
async function updateResponseTimeChart() {
    try {
        const provider = document.getElementById('providerFilter').value;
        
        // 선택된 시간 범위 가져오기 (기본값: 1시간)
        const hours = parseInt(document.getElementById('responseTimeRange').value || '1', 10);
        const timeAgo = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
        
        // 시간 범위에 따라 limit 조정 (모니터링이 1분마다 실행되므로 시간당 60개)
        // provider 필터가 없을 때는 모든 LLM provider(5개)를 고려해야 하므로 시간당 300개 필요
        // 충분한 데이터를 가져와서 시간 범위 내 모든 데이터를 확보
        const providerCount = provider ? 1 : 5; // LLM provider: openai, claude, gemini, openai-api, custom
        const limit = Math.min(hours * 60 * providerCount + 200, 5000); // 시간당 60개 * provider 수 + 여유분
        
        // LLM 서비스만 필터링
        const llmProviders = ['openai', 'claude', 'gemini', 'openai-api', 'custom'];
        
        let url = `${API_BASE}/monitor/records?limit=${limit}&since=${timeAgo}`;
        if (provider) {
            // 선택된 provider가 LLM 서비스인지 확인
            if (llmProviders.includes(provider)) {
                url += `&provider=${provider}`;
            } else {
                // 외부 서비스가 선택된 경우 빈 차트 표시
                if (responseTimeChart) {
                    responseTimeChart.data.labels = [];
                    responseTimeChart.data.datasets = [];
                    responseTimeChart.update();
                }
                return;
            }
        }
        
        const response = await fetch(url);
        const data = await response.json();
        
        // 응답 시간이 있는 레코드만 필터링하고 LLM 서비스만 포함, 시간순 정렬
        const records = data.records
            .filter(r => r.response_time_ms !== null && llmProviders.includes(r.provider))
            .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp)); // 시간순 정렬
        
        // 디버깅: 데이터 로드 확인
        console.log(`[LLM ResponseTimeChart] Hours: ${hours}, TimeAgo: ${timeAgo}, Limit: ${limit}, Records fetched: ${data.records.length}, Filtered records: ${records.length}`);
        if (records.length > 0) {
            console.log(`[LLM ResponseTimeChart] First record: ${records[0].timestamp}, Last record: ${records[records.length - 1].timestamp}`);
        }
        
        // Provider별로 데이터셋 분리
        const providerColors = {
            'openai': '#10b981',
            'claude': '#a1a1aa',
            'gemini': '#f59e0b',
            'custom': '#71717a',
            'openai-api': '#71717a'
        };
        
        // 시간 범위에 따라 집계 단위 결정 (데이터 양에 따라 동적 조정)
        let aggregationUnit; // 'minutes' 또는 'hours'
        let aggregationValue; // 분 단위 또는 시간 단위
        let useAggregation = true; // 집계 사용 여부
        
        // 먼저 데이터 양 확인
        const recordCount = records.length;
        
        if (hours <= 1) {
            // 1시간: 데이터가 12개 이하면 집계 안 함, 많으면 5분 단위
            if (recordCount <= 12) {
                useAggregation = false;
            } else {
                aggregationUnit = 'minutes';
                aggregationValue = 5; // 5분 단위
            }
        } else if (hours <= 6) {
            // 6시간: 데이터가 12개 이하면 집계 안 함, 많으면 30분 단위
            if (recordCount <= 12) {
                useAggregation = false;
            } else {
                aggregationUnit = 'minutes';
                aggregationValue = 30; // 30분 단위
            }
        } else if (hours <= 12) {
            // 12시간: 데이터가 12개 이하면 집계 안 함, 많으면 1시간 단위
            if (recordCount <= 12) {
                useAggregation = false;
            } else {
                aggregationUnit = 'hours';
                aggregationValue = 1; // 1시간 단위
            }
        } else {
            // 24시간: 데이터가 12개 이하면 집계 안 함, 많으면 2시간 단위
            if (recordCount <= 12) {
                useAggregation = false;
            } else {
                aggregationUnit = 'hours';
                aggregationValue = 2; // 2시간 단위
            }
        }
        
        // 집계 함수 - 전체 시간 범위를 채우도록 수정
        const aggregate = (records) => {
            // 시간 범위의 시작과 끝 계산 (실시간 기준)
            const now = new Date();
            const startTime = new Date(now.getTime() - hours * 60 * 60 * 1000);
            
            // 전체 시간 슬롯 생성
            const timeSlots = [];
            
            if (!useAggregation) {
                // 집계 안 함: 원본 데이터를 시간 슬롯에 매핑
                const slotMap = {};
                records.forEach(r => {
                    const date = new Date(r.timestamp);
                    const slotKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}-${String(date.getHours()).padStart(2, '0')}-${String(date.getMinutes()).padStart(2, '0')}`;
                    if (!slotMap[slotKey]) {
                        slotMap[slotKey] = {
                            timestamp: new Date(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours(), date.getMinutes()),
                            values: []
                        };
                    }
                    slotMap[slotKey].values.push(r.response_time_ms);
                });
                
                // 전체 시간 범위에 대해 슬롯 생성 (1분 단위)
                const currentSlot = new Date(startTime);
                while (currentSlot <= now) {
                    const slotKey = `${currentSlot.getFullYear()}-${String(currentSlot.getMonth() + 1).padStart(2, '0')}-${String(currentSlot.getDate()).padStart(2, '0')}-${String(currentSlot.getHours()).padStart(2, '0')}-${String(currentSlot.getMinutes()).padStart(2, '0')}`;
                    if (slotMap[slotKey]) {
                        const avg = slotMap[slotKey].values.reduce((sum, val) => sum + val, 0) / slotMap[slotKey].values.length;
                        timeSlots.push({
                            timestamp: new Date(currentSlot),
                            responseTime: Math.round(avg * 100) / 100
                        });
                    } else {
                        timeSlots.push({
                            timestamp: new Date(currentSlot),
                            responseTime: null // 데이터 없음
                        });
                    }
                    currentSlot.setMinutes(currentSlot.getMinutes() + 1);
                }
                
                console.log(`[LLM Aggregate] No aggregation: Created ${timeSlots.length} slots`);
                return timeSlots;
            }
            
            // 집계 사용 시
            const aggregatedMap = {};
            
            records.forEach(r => {
                const date = new Date(r.timestamp);
                let key;
                
                if (aggregationUnit === 'minutes') {
                    // 분 단위로 집계
                    const minutes = Math.floor(date.getMinutes() / aggregationValue) * aggregationValue;
                    key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}-${String(date.getHours()).padStart(2, '0')}-${String(minutes).padStart(2, '0')}`;
                    if (!aggregatedMap[key]) {
                        aggregatedMap[key] = {
                            timestamp: new Date(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours(), minutes),
                            values: []
                        };
                    }
                } else {
                    // 시간 단위로 집계
                    const hour = Math.floor(date.getHours() / aggregationValue) * aggregationValue;
                    key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}-${String(hour).padStart(2, '0')}`;
                    if (!aggregatedMap[key]) {
                        aggregatedMap[key] = {
                            timestamp: new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour),
                            values: []
                        };
                    }
                }
                aggregatedMap[key].values.push(r.response_time_ms);
            });
            
            // 각 집계 단위별 평균 계산
            const aggregated = Object.keys(aggregatedMap).map(key => {
                const group = aggregatedMap[key];
                const avg = group.values.reduce((sum, val) => sum + val, 0) / group.values.length;
                return {
                    timestamp: group.timestamp,
                    responseTime: Math.round(avg * 100) / 100 // 소수점 2자리
                };
            }).sort((a, b) => a.timestamp - b.timestamp);
            
            console.log(`[LLM Aggregate] Aggregated ${aggregated.length} records from ${records.length} raw records`);
            
            // 전체 시간 범위에 대해 슬롯 생성
            const slotStart = new Date(startTime);
            if (aggregationUnit === 'minutes') {
                // 분 단위 집계: 시작 시간을 집계 단위로 정렬
                slotStart.setMinutes(Math.floor(slotStart.getMinutes() / aggregationValue) * aggregationValue);
                slotStart.setSeconds(0);
                slotStart.setMilliseconds(0);
                
                let slotCount = 0;
                while (slotStart <= now) {
                    const slotKey = `${slotStart.getFullYear()}-${String(slotStart.getMonth() + 1).padStart(2, '0')}-${String(slotStart.getDate()).padStart(2, '0')}-${String(slotStart.getHours()).padStart(2, '0')}-${String(slotStart.getMinutes()).padStart(2, '0')}`;
                    const found = aggregated.find(a => {
                        const aKey = `${a.timestamp.getFullYear()}-${String(a.timestamp.getMonth() + 1).padStart(2, '0')}-${String(a.timestamp.getDate()).padStart(2, '0')}-${String(a.timestamp.getHours()).padStart(2, '0')}-${String(a.timestamp.getMinutes()).padStart(2, '0')}`;
                        return aKey === slotKey;
                    });
                    
                    timeSlots.push({
                        timestamp: new Date(slotStart),
                        responseTime: found ? found.responseTime : null
                    });
                    
                    slotStart.setMinutes(slotStart.getMinutes() + aggregationValue);
                    slotCount++;
                }
                console.log(`[LLM Aggregate] Minutes aggregation: Created ${slotCount} slots from ${new Date(startTime).toISOString()} to ${now.toISOString()}`);
            } else {
                // 시간 단위 집계: 시작 시간을 집계 단위로 정렬
                slotStart.setHours(Math.floor(slotStart.getHours() / aggregationValue) * aggregationValue);
                slotStart.setMinutes(0);
                slotStart.setSeconds(0);
                slotStart.setMilliseconds(0);
                
                let slotCount = 0;
                while (slotStart <= now) {
                    const slotKey = `${slotStart.getFullYear()}-${String(slotStart.getMonth() + 1).padStart(2, '0')}-${String(slotStart.getDate()).padStart(2, '0')}-${String(slotStart.getHours()).padStart(2, '0')}`;
                    const found = aggregated.find(a => {
                        const aKey = `${a.timestamp.getFullYear()}-${String(a.timestamp.getMonth() + 1).padStart(2, '0')}-${String(a.timestamp.getDate()).padStart(2, '0')}-${String(a.timestamp.getHours()).padStart(2, '0')}`;
                        return aKey === slotKey;
                    });
                    
                    timeSlots.push({
                        timestamp: new Date(slotStart),
                        responseTime: found ? found.responseTime : null
                    });
                    
                    slotStart.setHours(slotStart.getHours() + aggregationValue);
                    slotCount++;
                }
                console.log(`[LLM Aggregate] Hours aggregation: Created ${slotCount} slots from ${new Date(startTime).toISOString()} to ${now.toISOString()}`);
            }
            
            console.log(`[LLM Aggregate] Total timeSlots: ${timeSlots.length}, With data: ${timeSlots.filter(s => s.responseTime !== null).length}, Without data: ${timeSlots.filter(s => s.responseTime === null).length}`);
            
            return timeSlots;
        };
        
        // 시간 범위에 따라 레이블 형식 결정 (실시간 기준)
        const formatLabel = (date) => {
            const now = new Date();
            const isToday = date.getDate() === now.getDate() && 
                           date.getMonth() === now.getMonth() && 
                           date.getFullYear() === now.getFullYear();
            
            if (!useAggregation) {
                // 집계 안 함: 날짜가 오늘이 아니면 날짜 포함
                if (isToday) {
                    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
                } else {
                    return `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
                }
            }
            
            if (aggregationUnit === 'minutes') {
                if (aggregationValue < 60) {
                    // 분 단위 집계: 날짜가 오늘이 아니면 날짜 포함
                    if (isToday) {
                        return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
                    } else {
                        return `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
                    }
                } else {
                    // 시간 단위 집계
                    if (isToday) {
                        return `${String(date.getHours()).padStart(2, '0')}:00`;
                    } else {
                        return `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:00`;
                    }
                }
            } else {
                // 시간 단위 집계
                if (hours <= 12) {
                    // 12시간 이하: 날짜가 오늘이 아니면 날짜 포함
                    if (isToday) {
                        return `${String(date.getHours()).padStart(2, '0')}:00`;
                    } else {
                        return `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:00`;
                    }
                } else {
                    // 24시간: 항상 날짜와 시간 표시
                    return `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:00`;
                }
            }
        };
        
        if (responseTimeChart) {
            
            if (provider) {
                // 특정 provider 선택 시 단일 라인 - 집계 적용
                console.log(`[ResponseTimeChart] Provider: ${provider}, Hours: ${hours}, TimeAgo: ${timeAgo}, Records: ${records.length}`);
                if (records.length > 0) {
                    console.log(`[ResponseTimeChart] First record: ${records[0].timestamp}, Last record: ${records[records.length - 1].timestamp}`);
                }
                const aggregated = aggregate(records);
                console.log(`[ResponseTimeChart] Aggregated points: ${aggregated.length}`, aggregated);
                console.log(`[ResponseTimeChart] Time range: ${hours} hours, Start: ${new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()}, Now: ${new Date().toISOString()}`);
                console.log(`[ResponseTimeChart] Aggregation: useAggregation=${useAggregation}, unit=${aggregationUnit}, value=${aggregationValue}`);
                
                // null 값이 아닌 데이터만 필터링하지 않고, 모든 슬롯을 표시
                const labels = aggregated.map(a => formatLabel(a.timestamp));
                const responseTimes = aggregated.map(a => a.responseTime !== null ? a.responseTime : null);
                
                responseTimeChart.data.labels = labels;
                responseTimeChart.data.datasets = [{
                    label: `${getProviderDisplayName(provider)} 응답 시간 (ms)`,
                    data: responseTimes,
                    borderColor: providerColors[provider] || '#a1a1aa',
                    backgroundColor: providerColors[provider] ? `${providerColors[provider]}20` : 'rgba(161, 161, 170, 0.1)',
                    tension: 0.4,
                    fill: true,
                    spanGaps: true // null 값 건너뛰기
                }];
            } else {
                // 전체 provider 선택 시 provider별로 분리 - 집계 적용
                const providerGroups = {};
                records.forEach(r => {
                    if (!providerGroups[r.provider]) {
                        providerGroups[r.provider] = [];
                    }
                    providerGroups[r.provider].push(r);
                });
                
                // 각 provider별로 집계 (전체 시간 범위 포함)
                const providerAggregated = {};
                Object.keys(providerGroups).forEach(prov => {
                    providerAggregated[prov] = aggregate(providerGroups[prov]);
                });
                
                // 전체 시간 범위의 모든 레이블 생성 (첫 번째 provider의 집계 결과 사용)
                const firstProviderKey = Object.keys(providerAggregated)[0];
                const allLabels = firstProviderKey 
                    ? providerAggregated[firstProviderKey].map(a => formatLabel(a.timestamp))
                    : [];
                
                const datasets = Object.keys(providerAggregated).map(prov => {
                    const agg = providerAggregated[prov];
                    const data = allLabels.map(label => {
                        const matching = agg.find(a => formatLabel(a.timestamp) === label);
                        return matching ? matching.responseTime : null;
                    });
                    
                    return {
                        label: `${getProviderDisplayName(prov)} (ms)`,
                        data: data,
                        borderColor: providerColors[prov] || '#a1a1aa',
                        backgroundColor: providerColors[prov] ? `${providerColors[prov]}20` : 'rgba(161, 161, 170, 0.1)',
                        tension: 0.4,
                        fill: false,
                        spanGaps: true // null 값 건너뛰기
                    };
                });
                
                responseTimeChart.data.labels = allLabels;
                responseTimeChart.data.datasets = datasets;
            }
            
            responseTimeChart.update();
        }
    } catch (error) {
        console.error('Response time chart update error:', error);
    }
}

// 모니터링 기록 로드 (최근 24시간 전체 기록 누적 표시) - LLM 서비스만
let isLoadingRecords = false;
async function loadRecords() {
    // 중복 호출 방지
    if (isLoadingRecords) {
        console.log('[loadRecords] 이미 로딩 중이므로 스킵');
        return;
    }
    
    isLoadingRecords = true;
    try {
        const provider = document.getElementById('providerFilter').value;
        const status = document.getElementById('statusFilter').value;
        
        // 최근 24시간의 모든 기록을 누적해서 표시
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        
        // LLM 서비스만 필터링 (외부 서비스 제외)
        const llmProviders = ['openai', 'claude', 'gemini', 'openai-api', 'custom'];
        
        // 모니터링이 1분마다 실행되므로 시간당 60개, 24시간이면 1440개 필요
        // 모든 기록을 누적해서 표시하므로 충분한 데이터 확보 필요
        // provider 필터가 있으면 해당 provider만, 없으면 모든 LLM provider
        let url = `${API_BASE}/monitor/records?limit=2000&since=${twentyFourHoursAgo}`;
        if (provider) {
            // 선택된 provider가 LLM 서비스인지 확인
            if (llmProviders.includes(provider)) {
                url += `&provider=${provider}`;
            } else {
                // 외부 서비스가 선택된 경우 빈 결과 반환
                document.getElementById('recordsBody').innerHTML = '<tr><td colspan="6" class="empty-state">LLM 서비스 탭에서는 LLM 서비스만 표시됩니다.</td></tr>';
                isLoadingRecords = false;
                return;
            }
        } else {
            // provider 필터가 없을 때는 각 LLM provider별로 병렬 요청하여 효율성 향상
            // 모니터링이 1분마다 실행되므로 시간당 60개, 24시간이면 1440개 필요
            // 각 provider별로 충분한 데이터를 가져오기 위해 limit 증가
            const providerPromises = llmProviders.map(p => 
                fetch(`${API_BASE}/monitor/records?limit=2000&since=${twentyFourHoursAgo}&provider=${p}${status ? `&status=${status}` : ''}`)
                    .then(res => res.json())
                    .then(data => data.records || [])
                    .catch(() => [])
            );
            
            const providerResults = await Promise.all(providerPromises);
            const llmRecords = providerResults.flat();
            
            // 시간 단위로 그룹화 (각 provider의 각 시간마다 하나의 레코드만 선택)
            const hourlyGrouped = {};
            llmRecords.forEach(record => {
                const date = new Date(record.timestamp);
                const hourKey = `${record.provider}-${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}-${String(date.getHours()).padStart(2, '0')}`;
                
                // 같은 provider의 같은 시간대의 레코드가 없거나, 더 최신 레코드인 경우 업데이트
                if (!hourlyGrouped[hourKey] || new Date(record.timestamp) > new Date(hourlyGrouped[hourKey].timestamp)) {
                    hourlyGrouped[hourKey] = record;
                }
            });
            
            // 시간 단위로 그룹화된 레코드를 시간순으로 정렬 (최신순)
            const sortedRecords = Object.values(hourlyGrouped)
                .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            
            const tbody = document.getElementById('recordsBody');
            if (sortedRecords.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" class="empty-state">기록이 없습니다.</td></tr>';
                isLoadingRecords = false;
                return;
            }
            
            tbody.innerHTML = sortedRecords.map((record, index) => {
                const errorMsg = record.error_message || '';
                const maxLength = 100;
                const isLong = errorMsg.length > maxLength;
                const shortMsg = isLong ? errorMsg.substring(0, maxLength) + '...' : errorMsg;
                const rowId = `error-msg-${Date.now()}-${index}`;
                
                return `
                <tr>
                    <td>${formatDateTimeHourly(record.timestamp)}</td>
                    <td><span class="status-badge" title="${getProviderTitle(record.provider)}">${getProviderDisplayName(record.provider)}</span></td>
                    <td><span class="status-badge status-${record.status.toLowerCase()}">${getStatusText(record.status)}</span></td>
                    <td>${record.response_time_ms ? `${record.response_time_ms.toFixed(0)}ms` : 'N/A'}</td>
                    <td class="${record.error_level ? `error-level-${record.error_level.toLowerCase()}` : ''}">
                        ${record.error_level || '-'}
                    </td>
                    <td class="error-message-cell">
                        ${errorMsg ? `
                            <div class="error-message-wrapper">
                                <span class="error-message-short" id="${rowId}-short">${shortMsg}</span>
                                ${isLong ? `
                                    <span class="error-message-full" id="${rowId}-full" style="display: none;">${errorMsg}</span>
                                    <button class="error-toggle-btn" onclick="toggleErrorMessage('${rowId}')" aria-label="오류 메시지 전체 보기">
                                        <span class="toggle-icon" id="${rowId}-icon">▼</span>
                                    </button>
                                ` : ''}
                            </div>
                        ` : '-'}
                    </td>
                </tr>
            `;
            }).join('');
            
            isLoadingRecords = false;
            return;
        }
        // 모니터링이 1분마다 실행되므로 시간당 60개, 24시간이면 1440개 필요
        // 단일 provider인 경우에도 충분한 데이터를 가져오기 위해 limit 증가
        if (status) url += `&status=${status}`;
        url = `${API_BASE}/monitor/records?limit=2000&since=${twentyFourHoursAgo}${provider ? `&provider=${provider}` : ''}${status ? `&status=${status}` : ''}`;
        
        const response = await fetch(url);
        const data = await response.json();
        
        // 단일 provider인 경우 - 시간 단위로 그룹화
        const llmRecords = provider ? data.records : data.records.filter(record => llmProviders.includes(record.provider));
        
        // 시간 단위로 그룹화 (각 provider의 각 시간마다 하나의 레코드만 선택)
        const hourlyGrouped = {};
        llmRecords.forEach(record => {
            const date = new Date(record.timestamp);
            const hourKey = `${record.provider}-${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}-${String(date.getHours()).padStart(2, '0')}`;
            
            // 같은 provider의 같은 시간대의 레코드가 없거나, 더 최신 레코드인 경우 업데이트
            if (!hourlyGrouped[hourKey] || new Date(record.timestamp) > new Date(hourlyGrouped[hourKey].timestamp)) {
                hourlyGrouped[hourKey] = record;
            }
        });
        
        // 시간 단위로 그룹화된 레코드를 시간순으로 정렬 (최신순)
        const sortedRecords = Object.values(hourlyGrouped)
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        
        const tbody = document.getElementById('recordsBody');
        if (sortedRecords.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="empty-state">기록이 없습니다.</td></tr>';
            isLoadingRecords = false;
            return;
        }
        
        tbody.innerHTML = sortedRecords.map((record, index) => {
            const errorMsg = record.error_message || '';
            const maxLength = 100; // 토글 표시 기준 길이 (100자 이상일 때만 토글 표시)
            const isLong = errorMsg.length > maxLength;
            const shortMsg = isLong ? errorMsg.substring(0, maxLength) + '...' : errorMsg;
            const rowId = `error-msg-${Date.now()}-${index}`;
            
            return `
            <tr>
                <td>${formatDateTimeHourly(record.timestamp)}</td>
                <td><span class="status-badge" title="${getProviderTitle(record.provider)}">${getProviderDisplayName(record.provider)}</span></td>
                <td><span class="status-badge status-${record.status.toLowerCase()}">${getStatusText(record.status)}</span></td>
                <td>${record.response_time_ms ? `${record.response_time_ms.toFixed(0)}ms` : 'N/A'}</td>
                <td class="${record.error_level ? `error-level-${record.error_level.toLowerCase()}` : ''}">
                    ${record.error_level || '-'}
                </td>
                <td class="error-message-cell">
                    ${errorMsg ? `
                        <div class="error-message-wrapper">
                            <span class="error-message-short" id="${rowId}-short">${shortMsg}</span>
                            ${isLong ? `
                                <span class="error-message-full" id="${rowId}-full" style="display: none;">${errorMsg}</span>
                                <button class="error-toggle-btn" onclick="toggleErrorMessage('${rowId}')" aria-label="오류 메시지 전체 보기">
                                    <span class="toggle-icon" id="${rowId}-icon">▼</span>
                                </button>
                            ` : ''}
                        </div>
                    ` : '-'}
                </td>
            </tr>
        `;
        }).join('');
    } catch (error) {
        console.error('Records load error:', error);
        document.getElementById('recordsBody').innerHTML = 
            '<tr><td colspan="6" class="empty-state">데이터를 불러오는 중 오류가 발생했습니다.</td></tr>';
    } finally {
        isLoadingRecords = false;
    }
}

// 알림 로드 - LLM 서비스만
async function loadAlerts() {
    try {
        const response = await fetch(`${API_BASE}/alerts/current`);
        const data = await response.json();
        
        // LLM 서비스 관련 알림만 필터링
        const llmKeywords = ['OpenAI', 'Claude', 'Gemini', 'LLM 서버'];
        const llmAlerts = data.alerts.filter(alert => {
            const message = alert.message || '';
            return llmKeywords.some(keyword => message.includes(keyword));
        });
        
        // 전체 활성 알림 수는 LLM 서비스 알림만 카운트
        document.getElementById('activeAlerts').textContent = llmAlerts.length.toLocaleString();
        
        const tbody = document.getElementById('alertsBody');
        if (llmAlerts.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="empty-state">활성 알림이 없습니다.</td></tr>';
            return;
        }
        
        tbody.innerHTML = llmAlerts.map(alert => `
            <tr>
                <td>${formatDateTime(alert.timestamp)}</td>
                <td><span class="error-level-${alert.error_level.toLowerCase()}">${alert.error_level}</span></td>
                <td>${alert.message}</td>
                <td>
                    <button class="btn-resolve" onclick="resolveAlert(${alert.id})">
                        해결 처리
                    </button>
                </td>
            </tr>
        `).join('');
    } catch (error) {
        console.error('Alerts load error:', error);
        document.getElementById('alertsBody').innerHTML = 
            '<tr><td colspan="4" class="empty-state">데이터를 불러오는 중 오류가 발생했습니다.</td></tr>';
    }
}

// 서버 체크
async function checkServer(provider) {
    const btn = provider === 'custom' ? 
        document.getElementById('checkCustomBtn') : 
        document.getElementById('checkOpenAIBtn');
    
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = '체크 중...';
    
    try {
        const response = await fetch(`${API_BASE}/monitor/check?provider=${provider}`, {
            method: 'POST'
        });
        const result = await response.json();
        
        if (result.success) {
            showSuccess(`${provider === 'custom' ? 'Custom' : 'ChatGPT'} 서버 체크 완료: ${result.status}`);
            setTimeout(loadDashboard, 1000);
        } else {
            showError('서버 체크 실패');
        }
    } catch (error) {
        console.error('Check server error:', error);
        showError('서버 체크 중 오류가 발생했습니다.');
    } finally {
        btn.disabled = false;
        btn.textContent = originalText;
    }
}

// 알림 해결 처리
async function resolveAlert(alertId) {
    try {
        const response = await fetch(`${API_BASE}/alerts/${alertId}/resolve`, {
            method: 'POST'
        });
        const result = await response.json();
        
        if (response.ok) {
            showSuccess('알림이 해결 처리되었습니다.');
            loadAlerts();
            loadStats();
        } else {
            showError('알림 해결 처리 실패');
        }
    } catch (error) {
        console.error('Resolve alert error:', error);
        showError('알림 해결 처리 중 오류가 발생했습니다.');
    }
}

// 유틸리티 함수들
function formatDateTime(isoString) {
    const date = new Date(isoString);
    const now = new Date();
    const diff = now - date;
    
    if (diff < 60000) {
        return '방금 전';
    } else if (diff < 3600000) {
        return `${Math.floor(diff / 60000)}분 전`;
    } else if (diff < 86400000) {
        return `${Math.floor(diff / 3600000)}시간 전`;
    }
    
    return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

// 최근 모니터링 기록용 시간 포맷 (1시간 단위 그룹화)
function formatDateTimeHourly(isoString) {
    const date = new Date(isoString);
    const now = new Date();
    const diff = now - date;
    
    // 1시간 미만이면 "방금 전"으로 표시 (1시간 단위로 그룹화하므로)
    if (diff < 3600000) {
        return '방금 전';
    }
    
    // 1시간 이상이면 시간 단위로 표시 (예: "1시간 전", "2시간 전")
    const hoursAgo = Math.floor(diff / 3600000);
    if (hoursAgo < 24) {
        return `${hoursAgo}시간 전`;
    }
    
    // 24시간 이상이면 날짜 + 시간 표시 (더 정확하게)
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    
    // 오늘이면 시간만 표시, 아니면 날짜 + 시간
    const today = new Date();
    if (date.getDate() === today.getDate() && 
        date.getMonth() === today.getMonth() && 
        date.getFullYear() === today.getFullYear()) {
        return `${hours}:${minutes}`;
    }
    
    return `${month}/${day} ${hours}:${minutes}`;
}

function getStatusText(status) {
    const statusMap = {
        'HEALTHY': '정상',
        'DEGRADED': '저하',
        'DOWN': '다운',
        'UNKNOWN': '알 수 없음'
    };
    return statusMap[status] || status;
}

function getProviderDisplayName(provider) {
    const providerMap = {
        'custom': '설정된 서버',
        'openai': 'ChatGPT',
        'openai-api': 'OpenAI API',
        'claude': 'Claude',
        'gemini': 'Gemini',
        'cloudflare': 'Cloudflare',
        'twilio': 'Twilio',
        'channeltalk': '채널톡',
        'aws': 'AWS'
    };
    return providerMap[provider] || provider;
}

function getProviderTitle(provider) {
    const titleMap = {
        'custom': '설정된 LLM 서버 모니터링 (LLM_SERVER_URL)',
        'openai': 'OpenAI Status API 모니터링',
        'openai-api': 'OpenAI API 직접 호출 모니터링',
        'claude': 'Claude Status API 모니터링',
        'gemini': 'Gemini Status 페이지 모니터링',
        'cloudflare': 'Cloudflare Status API 모니터링',
        'twilio': 'Twilio Status API 모니터링',
        'channeltalk': '채널톡 Status API 모니터링',
        'aws': 'AWS Status 페이지 도달 가능성 모니터링'
    };
    return titleMap[provider] || provider;
}

function updateLastUpdateTime() {
    const now = new Date();
    const kstStr = now.toLocaleString('ko-KR', {
        timeZone: 'Asia/Seoul',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });
    document.getElementById('lastUpdate').textContent = `마지막 업데이트: ${kstStr} KST (1분마다 자동 갱신)`;
    
    // 업데이트 표시 애니메이션
    const updateEl = document.getElementById('lastUpdate');
    updateEl.style.opacity = '0.7';
    setTimeout(() => {
        updateEl.style.opacity = '1';
    }, 200);
}

function showSuccess(message) {
    // 간단한 알림 (나중에 토스트 라이브러리로 교체 가능)
    alert('✓ ' + message);
}

function showError(message) {
    alert('✗ ' + message);
}

// CRITICAL 이슈 확인 및 배너 표시 - LLM 서비스만
async function checkCriticalIssues() {
    try {
        const response = await fetch(`${API_BASE}/alerts/current`);
        const data = await response.json();
        
        // LLM 서비스 관련 CRITICAL 알림만 필터링
        const llmKeywords = ['OpenAI', 'Claude', 'Gemini', 'LLM 서버'];
        const criticalAlerts = data.alerts.filter(a => {
            if (a.error_level !== 'CRITICAL') return false;
            const message = a.message || '';
            return llmKeywords.some(keyword => message.includes(keyword));
        });
        
        // 디버깅: 현재 CRITICAL 알림 정보 출력
        if (criticalAlerts.length > 0) {
            console.log(`[CRITICAL 이슈 감지] 총 ${criticalAlerts.length}개의 LLM 서비스 CRITICAL 알림 발견:`, criticalAlerts.map(a => ({
                id: a.id,
                timestamp: a.timestamp,
                message: a.message,
                duration_minutes: Math.floor((new Date() - new Date(a.timestamp)) / (1000 * 60))
            })));
        }
        
        if (criticalAlerts.length === 0) {
            document.getElementById('criticalBanner').style.display = 'none';
            return;
        }
        
        // 각 CRITICAL 알림에 대해 5분 이상 지속되었는지 확인
        const now = new Date();
        const providerIssues = {}; // Provider별로 가장 오래된 이슈만 저장
        
        for (const alert of criticalAlerts) {
            const alertTime = new Date(alert.timestamp);
            const durationMs = now - alertTime;
            const durationMinutes = durationMs / (1000 * 60);
            
            if (durationMinutes >= 5) {
                // Provider 추출 (더 정확하게)
                let provider = null;
                const message = alert.message.toLowerCase();
                
                if (message.includes('openai 서비스') || message.includes('openai status') || 
                    (message.includes('openai') && !message.includes('api'))) {
                    provider = 'ChatGPT';
                } else if (message.includes('claude 서비스') || message.includes('claude')) {
                    provider = 'Claude';
                } else if (message.includes('gemini 서비스') || message.includes('gemini')) {
                    provider = 'Gemini';
                } else if (message.includes('slack 알림: openai')) {
                    provider = 'ChatGPT';
                } else if (message.includes('slack 알림: claude')) {
                    provider = 'Claude';
                } else if (message.includes('slack 알림: gemini')) {
                    provider = 'Gemini';
                }
                
                if (provider) {
                    // 같은 provider의 여러 알림 중 가장 오래된 것만 저장
                    if (!providerIssues[provider] || durationMinutes > providerIssues[provider].duration) {
                        providerIssues[provider] = {
                            provider: provider,
                            duration: Math.floor(durationMinutes),
                            message: alert.message
                        };
                    }
                } else {
                    // Provider를 찾을 수 없는 경우도 로그 출력
                    console.warn(`[CRITICAL 이슈] Provider를 찾을 수 없는 알림:`, alert.message);
                }
            }
        }
        
        const criticalIssues = Object.values(providerIssues);
        
        if (criticalIssues.length > 0) {
            console.log(`[CRITICAL 배너 표시] ${criticalIssues.length}개의 이슈:`, criticalIssues);
            displayCriticalBanner(criticalIssues);
        } else {
            console.log('[CRITICAL 배너] 5분 이상 지속된 이슈가 없어 배너를 숨깁니다.');
            document.getElementById('criticalBanner').style.display = 'none';
        }
    } catch (error) {
        console.error('Check critical issues error:', error);
    }
}

// CRITICAL 배너 표시
function displayCriticalBanner(issues) {
    const banner = document.getElementById('criticalBanner');
    const detailsEl = document.getElementById('criticalDetails');
    const actionEl = document.getElementById('criticalAction');
    
    if (issues.length === 1) {
        const issue = issues[0];
        detailsEl.innerHTML = `<strong>${issue.provider}</strong> 서비스에서 문제가 <strong>${issue.duration}분</strong> 이상 지속되고 있습니다.`;
        actionEl.textContent = getActionMessage(issue.provider);
    } else {
        // 불렛 포인트로 각 서비스 구분
        const issueList = issues.map(i => 
            `• <strong>${i.provider}</strong>: ${i.duration}분 지속`
        ).join('<br>');
        detailsEl.innerHTML = `다음 서비스들에서 문제가 지속되고 있습니다:<br>${issueList}`;
        
        // 여러 서비스 장애 시 조치 메시지
        const affectedServices = issues.map(i => i.provider).join(', ');
        actionEl.textContent = `${affectedServices} 서비스 장애로 인해 서비스에 영향을 줄 수 있습니다. 정상 작동 중인 서비스로 대체하거나 사용자에게 공지를 발송하세요.`;
    }
    
    banner.style.display = 'block';
}

// Provider별 조치 메시지
function getActionMessage(provider) {
    const messages = {
        'ChatGPT': 'ChatGPT 서비스 장애로 인해 GPT 모델 사용이 불가능할 수 있습니다. Claude 또는 Gemini로 대체하거나 사용자에게 공지를 발송하세요.',
        'Claude': 'Claude 서비스 장애로 인해 Claude 모델 사용이 불가능할 수 있습니다. ChatGPT 또는 Gemini로 대체하거나 사용자에게 공지를 발송하세요.',
        'Gemini': 'Gemini 서비스 장애로 인해 Gemini 모델 사용이 불가능할 수 있습니다. OpenAI 또는 Claude로 대체하거나 사용자에게 공지를 발송하세요.'
    };
    return messages[provider] || '외부 AI 서비스 장애로 인해 서비스에 영향을 줄 수 있습니다. 대체 서비스 사용을 고려하거나 사용자에게 공지를 발송하세요.';
}

// ========== 외부 서비스 탭 함수들 ==========

// 외부 서비스 차트 초기화
function initializeExternalCharts() {
    const providers = ['aws', 'cloudflare', 'twilio', 'channeltalk'];

    providers.forEach((provider, index) => {
        // 이미 차트가 존재하면 destroy
        if (externalStatusCharts[provider]) {
            externalStatusCharts[provider].destroy();
            externalStatusCharts[provider] = null;
        }

        const ctx = document.getElementById(`${provider}StatusChart`)?.getContext('2d');
        if (ctx) {
            externalStatusCharts[provider] = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: ['정상', '저하', '다운'],
                    datasets: [{
                        data: [0, 0, 0],
                        backgroundColor: [
                            '#10b981',
                            '#f59e0b',
                            '#ef4444'
                        ],
                        borderWidth: 0
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            display: index === 0,
                            position: 'bottom',
                            labels: {
                                color: '#f1f5f9',
                                padding: 8,
                                font: {
                                    size: 11
                                }
                            }
                        },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    const label = context.label || '';
                                    const value = context.parsed || 0;
                                    const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                    const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                                    return `${label}: ${value}건 (${percentage}%)`;
                                }
                            }
                        }
                    }
                }
            });
        }
    });

    // 응답 시간 차트도 이미 존재하면 destroy
    if (externalResponseTimeChart) {
        externalResponseTimeChart.destroy();
        externalResponseTimeChart = null;
    }

    const externalResponseTimeCtx = document.getElementById('externalResponseTimeChart')?.getContext('2d');
    if (externalResponseTimeCtx) {
        externalResponseTimeChart = new Chart(externalResponseTimeCtx, {
            type: 'line',
            data: {
                labels: [],
                datasets: []
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        labels: {
                            color: '#f1f5f9'
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: {
                            color: '#94a3b8'
                        },
                        grid: {
                            color: '#334155'
                        }
                    },
                    y: {
                        ticks: {
                            color: '#94a3b8',
                            callback: function(value) {
                                return value + ' ms';
                            }
                        },
                        grid: {
                            color: '#334155'
                        }
                    }
                }
            }
        });
    }
}

// 외부 서비스 대시보드 로드
function loadExternalServicesDashboard() {
    // 차트가 아직 초기화되지 않았을 때만 초기화
    const needsInit = !externalStatusCharts.aws || !externalResponseTimeChart;
    if (needsInit) {
        initializeExternalCharts();
    }
    loadExternalProviderStatuses();
    loadExternalRecords();
    loadExternalAlerts();
    loadExternalStats();
    checkExternalCriticalIssues();
    updateExternalStatusChart();
    updateExternalResponseTimeChart();
}

// 외부 서비스 통계 요약 로드
async function loadExternalStats() {
    try {
        const externalProviders = ['aws', 'cloudflare', 'twilio', 'channeltalk'];
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const results = await Promise.all(
            externalProviders.map(p =>
                fetch(`${API_BASE}/monitor/stats?provider=${p}&hours=24`)
                    .then(r => r.json())
                    .catch(() => ({}))
            )
        );
        let total = 0, healthy = 0, error = 0;
        results.forEach(s => {
            total += s.total_records || 0;
            healthy += s.healthy_count || 0;
            error += (s.total_records || 0) - (s.healthy_count || 0);
        });
        const totalEl = document.getElementById('extTotalRecords');
        const healthyEl = document.getElementById('extHealthyCount');
        const errorEl = document.getElementById('extErrorCount');
        if (totalEl) totalEl.textContent = total.toLocaleString();
        if (healthyEl) healthyEl.textContent = healthy.toLocaleString();
        if (errorEl) errorEl.textContent = Math.max(0, error).toLocaleString();
    } catch (e) {
        console.error('Load external stats error:', e);
    }
}

// 외부 서비스 Provider 상태 로드 (병렬 처리로 최적화)
async function loadExternalProviderStatuses() {
    const providers = ['cloudflare', 'twilio', 'channeltalk', 'aws'];
    
    // 모든 provider의 상태를 병렬로 로드
    await Promise.all(providers.map(async (provider) => {
        try {
            // 최신 레코드와 통계를 병렬로 가져오기
            const [recordsResponse, statsResponse] = await Promise.all([
                fetch(`${API_BASE}/monitor/records?limit=1&provider=${provider}`),
                fetch(`${API_BASE}/monitor/stats?provider=${provider}&hours=1`)
            ]);
            
            const recordsData = await recordsResponse.json();
            const stats = await statsResponse.json();
            
            const card = document.getElementById(`${provider}StatusCard`);
            const badge = document.getElementById(`${provider}StatusBadge`);
            const responseTimeEl = document.getElementById(`${provider}ResponseTime`);
            const healthRateEl = document.getElementById(`${provider}HealthRate`);
            
            const latestRecord = recordsData.records && recordsData.records.length > 0 ? recordsData.records[0] : null;
            const status = latestRecord ? latestRecord.status : 'UNKNOWN';
            
            // 상태 배지 업데이트
            if (badge && card) {
                const statusText = getStatusText(status);
                badge.textContent = statusText;
                badge.className = `provider-status-badge status-${status.toLowerCase()}`;
                card.className = `provider-status-card status-${status.toLowerCase()}`;
            }
            
            // 응답 시간 업데이트
            if (responseTimeEl) {
                if (latestRecord && latestRecord.response_time_ms !== null) {
                    responseTimeEl.textContent = `${latestRecord.response_time_ms.toFixed(0)}ms`;
                } else {
                    responseTimeEl.textContent = '-';
                }
            }
            
            // 건강도 업데이트 (최근 1시간 기준)
            if (healthRateEl) {
                // health_rate가 직접 제공되면 사용, 없으면 계산
                let healthRate = stats.health_rate;
                
                if (healthRate === undefined || healthRate === null) {
                    // health_rate가 없으면 직접 계산
                    const healthyCount = stats.healthy_count || 0;
                    const totalRecords = stats.total_records || 0;
                    if (totalRecords > 0) {
                        healthRate = (healthyCount / totalRecords) * 100;
                    }
                }
                
                if (healthRate !== undefined && healthRate !== null && stats.total_records > 0) {
                    healthRateEl.textContent = `${healthRate.toFixed(1)}%`;
                } else {
                    healthRateEl.textContent = '-';
                }
            }
            
            // 디버깅: 데이터 확인
            console.log(`[${provider}] Status loaded:`, {
                hasRecord: !!latestRecord,
                status: status,
                responseTime: latestRecord?.response_time_ms,
                stats: {
                    total: stats.total_records,
                    healthy_count: stats.healthy_count,
                    health_rate: stats.health_rate
                },
                healthRateEl: healthRateEl ? 'found' : 'not found'
            });
        } catch (error) {
            console.error(`Error loading ${provider} status:`, error);
            
            // 에러 발생 시 기본값 표시
            const card = document.getElementById(`${provider}StatusCard`);
            const badge = document.getElementById(`${provider}StatusBadge`);
            const responseTimeEl = document.getElementById(`${provider}ResponseTime`);
            const healthRateEl = document.getElementById(`${provider}HealthRate`);
            
            if (badge) {
                badge.textContent = '알 수 없음';
                badge.className = 'provider-status-badge status-unknown';
            }
            if (card) {
                card.className = 'provider-status-card';
            }
            if (responseTimeEl) {
                responseTimeEl.textContent = '-';
            }
            if (healthRateEl) {
                healthRateEl.textContent = '-';
            }
        }
    }));
}

// 외부 서비스 상태 차트 업데이트
async function updateExternalStatusChart() {
    try {
        const hours = parseInt(document.getElementById('externalStatsTimeRange')?.value || '1', 10);
        
        const providers = ['cloudflare', 'twilio', 'channeltalk', 'aws'];
        
        // 차트가 초기화되지 않았으면 초기화
        const needsInit = providers.some(provider => !externalStatusCharts[provider]);
        if (needsInit) {
            initializeExternalCharts();
        }
        
        for (const provider of providers) {
            try {
                // hours 파라미터 사용 (LLM 서비스와 동일)
                const response = await fetch(`${API_BASE}/monitor/stats?provider=${provider}&hours=${hours}`);
                const stats = await response.json();
                
                // 차트가 없으면 초기화 시도
                if (!externalStatusCharts[provider]) {
                    const ctx = document.getElementById(`${provider}StatusChart`)?.getContext('2d');
                    if (ctx) {
                        externalStatusCharts[provider] = new Chart(ctx, {
                            type: 'doughnut',
                            data: {
                                labels: ['정상', '저하', '다운'],
                                datasets: [{
                                    data: [0, 0, 0],
                                    backgroundColor: ['#10b981', '#f59e0b', '#ef4444'],
                                    borderWidth: 0
                                }]
                            },
                            options: {
                                responsive: true,
                                maintainAspectRatio: false,
                                plugins: {
                                    legend: {
                                        position: 'bottom',
                                        labels: {
                                            color: '#f1f5f9',
                                            padding: 8,
                                            font: { size: 11 }
                                        }
                                    },
                                    tooltip: {
                                        callbacks: {
                                            label: function(context) {
                                                const label = context.label || '';
                                                const value = context.parsed || 0;
                                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                                const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                                                return `${label}: ${value}건 (${percentage}%)`;
                                            }
                                        }
                                    }
                                }
                            }
                        });
                    }
                }
                
                if (externalStatusCharts[provider]) {
                    // API 응답 형식에 맞게 수정: healthy_count, error_count 사용
                    const healthy = stats.healthy_count || 0;
                    const error = stats.error_count || 0;
                    const totalRecords = stats.total_records || 0;
                    // degraded는 전체에서 healthy와 error를 제외한 나머지
                    const degraded = Math.max(0, totalRecords - healthy - error);
                    const total = healthy + degraded + error;
                    
                    // 데이터가 없어도 차트는 표시 (모두 0이면 "데이터 없음" 표시)
                    if (total === 0) {
                        // 데이터가 없을 때는 최소한의 값으로 표시하여 차트가 보이도록 함
                        externalStatusCharts[provider].data.datasets[0].data = [1, 0, 0];
                        externalStatusCharts[provider].data.labels = ['데이터 없음'];
                    } else {
                        externalStatusCharts[provider].data.datasets[0].data = [healthy, degraded, error];
                        externalStatusCharts[provider].data.labels = ['정상', '저하', '다운'];
                    }
                    
                    externalStatusCharts[provider].update();
                }
            } catch (error) {
                console.error(`Error loading stats for ${provider}:`, error);
            }
        }
    } catch (error) {
        console.error('External status chart update error:', error);
    }
}

// 외부 서비스 응답 시간 차트 업데이트
async function updateExternalResponseTimeChart() {
    try {
        const provider = document.getElementById('externalProviderFilter')?.value || '';
        const hours = parseInt(document.getElementById('externalResponseTimeRange')?.value || '1', 10);
        const timeAgo = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
        
        // 시간 범위에 따라 limit 조정 (모니터링이 1분마다 실행되므로 시간당 60개)
        // provider 필터가 없을 때는 모든 외부 서비스 provider(3개)를 고려해야 하므로 시간당 180개 필요
        // 충분한 데이터를 가져와서 시간 범위 내 모든 데이터를 확보
        const providerCount = provider ? 1 : 4; // 외부 서비스 provider: cloudflare, twilio, channeltalk, aws
        const limit = Math.min(hours * 60 * providerCount + 200, 2000); // 시간당 60개 * provider 수 + 여유분
        
        let url = `${API_BASE}/monitor/records?limit=${limit}&since=${timeAgo}`;
        const externalProviders = ['cloudflare', 'twilio', 'channeltalk', 'aws'];
        
        if (provider) {
            // 선택된 provider가 외부 서비스인지 확인
            if (externalProviders.includes(provider)) {
                url += `&provider=${provider}`;
            } else {
                // LLM 서비스가 선택된 경우 빈 차트 표시
                if (externalResponseTimeChart) {
                    externalResponseTimeChart.data.labels = [];
                    externalResponseTimeChart.data.datasets = [];
                    externalResponseTimeChart.update();
                }
                return;
            }
        }
        // provider 필터가 없을 때는 모든 레코드를 가져온 후 클라이언트에서 외부 서비스만 필터링
        
        const response = await fetch(url);
        const data = await response.json();
        
        const records = data.records
            .filter(r => r.response_time_ms !== null && externalProviders.includes(r.provider))
            .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        
        const providerColors = {
            'cloudflare': '#f97316',
            'twilio': '#06b6d4',
            'channeltalk': '#a1a1aa',
            'aws': '#ff9900'
        };
        
        // 시간 범위에 따라 집계 단위 결정 (데이터 양에 따라 동적 조정)
        let aggregationUnit; // 'minutes' 또는 'hours'
        let aggregationValue; // 분 단위 또는 시간 단위
        let useAggregation = true; // 집계 사용 여부
        
        // 먼저 데이터 양 확인
        const recordCount = records.length;
        
        if (hours <= 1) {
            // 1시간: 데이터가 12개 이하면 집계 안 함, 많으면 5분 단위
            if (recordCount <= 12) {
                useAggregation = false;
            } else {
                aggregationUnit = 'minutes';
                aggregationValue = 5; // 5분 단위
            }
        } else if (hours <= 6) {
            // 6시간: 데이터가 12개 이하면 집계 안 함, 많으면 30분 단위
            if (recordCount <= 12) {
                useAggregation = false;
            } else {
                aggregationUnit = 'minutes';
                aggregationValue = 30; // 30분 단위
            }
        } else if (hours <= 12) {
            // 12시간: 데이터가 12개 이하면 집계 안 함, 많으면 1시간 단위
            if (recordCount <= 12) {
                useAggregation = false;
            } else {
                aggregationUnit = 'hours';
                aggregationValue = 1; // 1시간 단위
            }
        } else {
            // 24시간: 데이터가 12개 이하면 집계 안 함, 많으면 2시간 단위
            if (recordCount <= 12) {
                useAggregation = false;
            } else {
                aggregationUnit = 'hours';
                aggregationValue = 2; // 2시간 단위
            }
        }
        
        // 집계 함수 - 전체 시간 범위를 채우도록 수정
        const aggregate = (records) => {
            // 시간 범위의 시작과 끝 계산
            const now = new Date();
            const startTime = new Date(now.getTime() - hours * 60 * 60 * 1000);
            
            // 전체 시간 슬롯 생성
            const timeSlots = [];
            
            if (!useAggregation) {
                // 집계 안 함: 원본 데이터를 시간 슬롯에 매핑
                const slotMap = {};
                records.forEach(r => {
                    const date = new Date(r.timestamp);
                    const slotKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}-${String(date.getHours()).padStart(2, '0')}-${String(date.getMinutes()).padStart(2, '0')}`;
                    if (!slotMap[slotKey]) {
                        slotMap[slotKey] = {
                            timestamp: new Date(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours(), date.getMinutes()),
                            values: []
                        };
                    }
                    slotMap[slotKey].values.push(r.response_time_ms);
                });
                
                // 전체 시간 범위에 대해 슬롯 생성 (1분 단위)
                const currentSlot = new Date(startTime);
                while (currentSlot <= now) {
                    const slotKey = `${currentSlot.getFullYear()}-${String(currentSlot.getMonth() + 1).padStart(2, '0')}-${String(currentSlot.getDate()).padStart(2, '0')}-${String(currentSlot.getHours()).padStart(2, '0')}-${String(currentSlot.getMinutes()).padStart(2, '0')}`;
                    if (slotMap[slotKey]) {
                        const avg = slotMap[slotKey].values.reduce((sum, val) => sum + val, 0) / slotMap[slotKey].values.length;
                        timeSlots.push({
                            timestamp: new Date(currentSlot),
                            responseTime: Math.round(avg * 100) / 100
                        });
                    } else {
                        timeSlots.push({
                            timestamp: new Date(currentSlot),
                            responseTime: null // 데이터 없음
                        });
                    }
                    currentSlot.setMinutes(currentSlot.getMinutes() + 1);
                }
                
                return timeSlots;
            }
            
            // 집계 사용 시
            const aggregatedMap = {};
            
            records.forEach(r => {
                const date = new Date(r.timestamp);
                let key;
                
                if (aggregationUnit === 'minutes') {
                    // 분 단위로 집계
                    const minutes = Math.floor(date.getMinutes() / aggregationValue) * aggregationValue;
                    key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}-${String(date.getHours()).padStart(2, '0')}-${String(minutes).padStart(2, '0')}`;
                    if (!aggregatedMap[key]) {
                        aggregatedMap[key] = {
                            timestamp: new Date(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours(), minutes),
                            values: []
                        };
                    }
                } else {
                    // 시간 단위로 집계
                    const hour = Math.floor(date.getHours() / aggregationValue) * aggregationValue;
                    key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}-${String(hour).padStart(2, '0')}`;
                    if (!aggregatedMap[key]) {
                        aggregatedMap[key] = {
                            timestamp: new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour),
                            values: []
                        };
                    }
                }
                aggregatedMap[key].values.push(r.response_time_ms);
            });
            
            // 각 집계 단위별 평균 계산
            const aggregated = Object.keys(aggregatedMap).map(key => {
                const group = aggregatedMap[key];
                const avg = group.values.reduce((sum, val) => sum + val, 0) / group.values.length;
                return {
                    timestamp: group.timestamp,
                    responseTime: Math.round(avg * 100) / 100 // 소수점 2자리
                };
            }).sort((a, b) => a.timestamp - b.timestamp);
            
            // 전체 시간 범위에 대해 슬롯 생성
            const slotStart = new Date(startTime);
            if (aggregationUnit === 'minutes') {
                // 분 단위 집계: 시작 시간을 집계 단위로 정렬
                slotStart.setMinutes(Math.floor(slotStart.getMinutes() / aggregationValue) * aggregationValue);
                slotStart.setSeconds(0);
                slotStart.setMilliseconds(0);
                
                while (slotStart <= now) {
                    const slotKey = `${slotStart.getFullYear()}-${String(slotStart.getMonth() + 1).padStart(2, '0')}-${String(slotStart.getDate()).padStart(2, '0')}-${String(slotStart.getHours()).padStart(2, '0')}-${String(slotStart.getMinutes()).padStart(2, '0')}`;
                    const found = aggregated.find(a => {
                        const aKey = `${a.timestamp.getFullYear()}-${String(a.timestamp.getMonth() + 1).padStart(2, '0')}-${String(a.timestamp.getDate()).padStart(2, '0')}-${String(a.timestamp.getHours()).padStart(2, '0')}-${String(a.timestamp.getMinutes()).padStart(2, '0')}`;
                        return aKey === slotKey;
                    });
                    
                    timeSlots.push({
                        timestamp: new Date(slotStart),
                        responseTime: found ? found.responseTime : null
                    });
                    
                    slotStart.setMinutes(slotStart.getMinutes() + aggregationValue);
                }
            } else {
                // 시간 단위 집계: 시작 시간을 집계 단위로 정렬
                slotStart.setHours(Math.floor(slotStart.getHours() / aggregationValue) * aggregationValue);
                slotStart.setMinutes(0);
                slotStart.setSeconds(0);
                slotStart.setMilliseconds(0);
                
                while (slotStart <= now) {
                    const slotKey = `${slotStart.getFullYear()}-${String(slotStart.getMonth() + 1).padStart(2, '0')}-${String(slotStart.getDate()).padStart(2, '0')}-${String(slotStart.getHours()).padStart(2, '0')}`;
                    const found = aggregated.find(a => {
                        const aKey = `${a.timestamp.getFullYear()}-${String(a.timestamp.getMonth() + 1).padStart(2, '0')}-${String(a.timestamp.getDate()).padStart(2, '0')}-${String(a.timestamp.getHours()).padStart(2, '0')}`;
                        return aKey === slotKey;
                    });
                    
                    timeSlots.push({
                        timestamp: new Date(slotStart),
                        responseTime: found ? found.responseTime : null
                    });
                    
                    slotStart.setHours(slotStart.getHours() + aggregationValue);
                }
            }
            
            return timeSlots;
        };
        
        // 시간 범위에 따라 레이블 형식 결정 (실시간 기준)
        const formatLabel = (date) => {
            const now = new Date();
            const isToday = date.getDate() === now.getDate() && 
                           date.getMonth() === now.getMonth() && 
                           date.getFullYear() === now.getFullYear();
            
            if (!useAggregation) {
                // 집계 안 함: 날짜가 오늘이 아니면 날짜 포함
                if (isToday) {
                    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
                } else {
                    return `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
                }
            }
            
            if (aggregationUnit === 'minutes') {
                if (aggregationValue < 60) {
                    // 분 단위 집계: 날짜가 오늘이 아니면 날짜 포함
                    if (isToday) {
                        return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
                    } else {
                        return `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
                    }
                } else {
                    // 시간 단위 집계
                    if (isToday) {
                        return `${String(date.getHours()).padStart(2, '0')}:00`;
                    } else {
                        return `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:00`;
                    }
                }
            } else {
                // 시간 단위 집계
                if (hours <= 12) {
                    // 12시간 이하: 날짜가 오늘이 아니면 날짜 포함
                    if (isToday) {
                        return `${String(date.getHours()).padStart(2, '0')}:00`;
                    } else {
                        return `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:00`;
                    }
                } else {
                    // 24시간: 항상 날짜와 시간 표시
                    return `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:00`;
                }
            }
        };
        
        if (externalResponseTimeChart) {
            if (provider) {
                // 특정 provider 선택 시 단일 라인 - 집계 적용
                console.log(`[ExternalResponseTimeChart] Provider: ${provider}, Hours: ${hours}, TimeAgo: ${timeAgo}, Records: ${records.length}`);
                if (records.length > 0) {
                    console.log(`[ExternalResponseTimeChart] First record: ${records[0].timestamp}, Last record: ${records[records.length - 1].timestamp}`);
                }
                const aggregated = aggregate(records);
                console.log(`[ExternalResponseTimeChart] Aggregated points: ${aggregated.length}`, aggregated);
                const labels = aggregated.map(a => formatLabel(a.timestamp));
                const responseTimes = aggregated.map(a => a.responseTime);
                
                externalResponseTimeChart.data.labels = labels;
                externalResponseTimeChart.data.datasets = [{
                    label: `${getProviderDisplayName(provider)} 응답 시간 (ms)`,
                    data: responseTimes,
                    borderColor: providerColors[provider] || '#a1a1aa',
                    backgroundColor: providerColors[provider] ? `${providerColors[provider]}20` : 'rgba(161, 161, 170, 0.1)',
                    tension: 0.4,
                    fill: true,
                    spanGaps: true // null 값 건너뛰기
                }];
            } else {
                // 전체 provider 선택 시 provider별로 분리 - 집계 적용
                const providerGroups = {};
                records.forEach(r => {
                    if (!providerGroups[r.provider]) {
                        providerGroups[r.provider] = [];
                    }
                    providerGroups[r.provider].push(r);
                });
                
                // 각 provider별로 집계 (전체 시간 범위 포함)
                const providerAggregated = {};
                Object.keys(providerGroups).forEach(prov => {
                    providerAggregated[prov] = aggregate(providerGroups[prov]);
                });
                
                // 전체 시간 범위의 모든 레이블 생성 (첫 번째 provider의 집계 결과 사용)
                const firstProviderKey = Object.keys(providerAggregated)[0];
                const allLabels = firstProviderKey 
                    ? providerAggregated[firstProviderKey].map(a => formatLabel(a.timestamp))
                    : [];
                
                const datasets = Object.keys(providerAggregated).map(prov => {
                    const agg = providerAggregated[prov];
                    const data = allLabels.map(label => {
                        const matching = agg.find(a => formatLabel(a.timestamp) === label);
                        return matching ? matching.responseTime : null;
                    });
                    
                    return {
                        label: `${getProviderDisplayName(prov)} (ms)`,
                        data: data,
                        borderColor: providerColors[prov] || '#a1a1aa',
                        backgroundColor: providerColors[prov] ? `${providerColors[prov]}20` : 'rgba(161, 161, 170, 0.1)',
                        tension: 0.4,
                        fill: false,
                        spanGaps: true // null 값 건너뛰기
                    };
                });
                
                externalResponseTimeChart.data.labels = allLabels;
                externalResponseTimeChart.data.datasets = datasets;
            }
            
            externalResponseTimeChart.update();
        }
    } catch (error) {
        console.error('External response time chart update error:', error);
    }
}

// 외부 서비스 모니터링 기록 로드
let isLoadingExternalRecords = false;
async function loadExternalRecords() {
    // 중복 호출 방지
    if (isLoadingExternalRecords) {
        console.log('[loadExternalRecords] 이미 로딩 중이므로 스킵');
        return;
    }
    
    isLoadingExternalRecords = true;
    try {
        const provider = document.getElementById('externalProviderFilter')?.value || '';
        const status = document.getElementById('externalStatusFilter')?.value || '';
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(); // 최근 24시간
        const externalProviders = ['cloudflare', 'twilio', 'channeltalk', 'aws'];
        
        // 모니터링이 1분마다 실행되므로 시간당 60개, 24시간이면 1440개 필요
        // 모든 기록을 누적해서 표시하므로 충분한 데이터 확보 필요
        if (provider) {
            // 선택된 provider가 외부 서비스인지 확인
            if (externalProviders.includes(provider)) {
                const url = `${API_BASE}/monitor/records?limit=2000&since=${twentyFourHoursAgo}&provider=${provider}${status ? `&status=${status}` : ''}`;
                const response = await fetch(url);
                const data = await response.json();
                const externalRecords = data.records;
                
                // 시간 단위로 그룹화 (각 provider의 각 시간마다 하나의 레코드만 선택)
                const hourlyGrouped = {};
                externalRecords.forEach(record => {
                    const date = new Date(record.timestamp);
                    const hourKey = `${record.provider}-${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}-${String(date.getHours()).padStart(2, '0')}`;
                    
                    if (!hourlyGrouped[hourKey] || new Date(record.timestamp) > new Date(hourlyGrouped[hourKey].timestamp)) {
                        hourlyGrouped[hourKey] = record;
                    }
                });
                
                // 시간 단위로 그룹화된 레코드를 시간순으로 정렬 (최신순)
                const sortedRecords = Object.values(hourlyGrouped)
                    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
                
                const tbody = document.querySelector('#externalRecordsTable tbody');
                if (sortedRecords.length === 0) {
                    if (tbody) {
                        tbody.innerHTML = '<tr><td colspan="5" class="empty-state">아직 기록이 없습니다. 모니터링 수집 중이며 잠시 후 새로고침하면 표시됩니다.</td></tr>';
                    }
                    isLoadingExternalRecords = false;
                    return;
                }
                
                if (tbody) {
                    tbody.innerHTML = sortedRecords.map((record, index) => {
                        const errorMsg = record.error_message || '';
                        const maxLength = 100;
                        const isLong = errorMsg.length > maxLength;
                        const shortMsg = isLong ? errorMsg.substring(0, maxLength) + '...' : errorMsg;
                        const rowId = `external-error-msg-${Date.now()}-${index}`;
                        
                        return `
                        <tr>
                            <td>${formatDateTimeHourly(record.timestamp)}</td>
                            <td><span class="status-badge" title="${getProviderTitle(record.provider)}">${getProviderDisplayName(record.provider)}</span></td>
                            <td><span class="status-badge status-${record.status.toLowerCase()}">${getStatusText(record.status)}</span></td>
                            <td>${record.response_time_ms ? `${record.response_time_ms.toFixed(0)}ms` : 'N/A'}</td>
                            <td class="error-message-cell">
                                ${errorMsg ? `
                                    <div class="error-message-wrapper">
                                        <span class="error-message-short" id="${rowId}-short">${shortMsg}</span>
                                        ${isLong ? `
                                            <span class="error-message-full" id="${rowId}-full" style="display: none;">${errorMsg}</span>
                                            <button class="error-toggle-btn" onclick="toggleErrorMessage('${rowId}')" aria-label="오류 메시지 전체 보기">
                                                <span class="toggle-icon" id="${rowId}-icon">▼</span>
                                            </button>
                                        ` : ''}
                                    </div>
                                ` : '-'}
                            </td>
                        </tr>
                    `;
                    }).join('');
                }
                
                isLoadingExternalRecords = false;
                return;
            } else {
                // LLM 서비스가 선택된 경우 빈 결과 반환
                const tbody = document.querySelector('#externalRecordsTable tbody');
                if (tbody) {
                    tbody.innerHTML = '<tr><td colspan="5" class="loading">외부 서비스 탭에서는 외부 서비스만 표시됩니다.</td></tr>';
                }
                isLoadingExternalRecords = false;
                return;
            }
        }
        
        // provider 필터가 없을 때는 각 외부 서비스 provider별로 병렬 요청
        // 모니터링이 1분마다 실행되므로 시간당 60개, 24시간이면 1440개 필요
        // 각 provider별로 충분한 데이터를 가져오기 위해 limit 증가
        const providerPromises = externalProviders.map(p => 
            fetch(`${API_BASE}/monitor/records?limit=2000&since=${twentyFourHoursAgo}&provider=${p}${status ? `&status=${status}` : ''}`)
                .then(res => res.json())
                .then(data => data.records || [])
                .catch(() => [])
        );
        
        const providerResults = await Promise.all(providerPromises);
        const externalRecords = providerResults.flat();
        
        // 시간 단위로 그룹화 (각 provider의 각 시간마다 하나의 레코드만 선택)
        const hourlyGrouped = {};
        externalRecords.forEach(record => {
            const date = new Date(record.timestamp);
            const hourKey = `${record.provider}-${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}-${String(date.getHours()).padStart(2, '0')}`;
            
            if (!hourlyGrouped[hourKey] || new Date(record.timestamp) > new Date(hourlyGrouped[hourKey].timestamp)) {
                hourlyGrouped[hourKey] = record;
            }
        });
        
        // 시간 단위로 그룹화된 레코드를 시간순으로 정렬 (최신순)
        const sortedRecords = Object.values(hourlyGrouped)
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        
        const tbody = document.querySelector('#externalRecordsTable tbody');
        if (!tbody) {
            isLoadingExternalRecords = false;
            return;
        }
        
        if (sortedRecords.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="empty-state">아직 기록이 없습니다. 모니터링 수집 중이며 잠시 후 새로고침하면 표시됩니다.</td></tr>';
            isLoadingExternalRecords = false;
            return;
        }
        
        tbody.innerHTML = sortedRecords.map((record, index) => {
            const statusClass = `status-${record.status.toLowerCase()}`;
            const statusText = {
                'HEALTHY': '정상',
                'DEGRADED': '저하',
                'DOWN': '다운',
                'UNKNOWN': '알 수 없음'
            }[record.status] || record.status;
            
            const errorMsg = record.error_message || '';
            const maxLength = 100; // 토글 표시 기준 길이 (100자 이상일 때만 토글 표시)
            const isLong = errorMsg.length > maxLength;
            const shortMsg = isLong ? errorMsg.substring(0, maxLength) + '...' : errorMsg;
            const rowId = `external-error-msg-${Date.now()}-${index}`;
            
            return `
                <tr>
                    <td>${formatDateTimeHourly(record.timestamp)}</td>
                    <td>${getProviderDisplayName(record.provider)}</td>
                    <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                    <td>${record.response_time_ms ? `${record.response_time_ms}ms` : '-'}</td>
                    <td class="error-message-cell">
                        ${errorMsg ? `
                            <div class="error-message-wrapper">
                                <span class="error-message-short" id="${rowId}-short">${shortMsg}</span>
                                ${isLong ? `
                                    <span class="error-message-full" id="${rowId}-full" style="display: none;">${errorMsg}</span>
                                    <button class="error-toggle-btn" onclick="toggleErrorMessage('${rowId}')" aria-label="오류 메시지 전체 보기">
                                        <span class="toggle-icon" id="${rowId}-icon">▼</span>
                                    </button>
                                ` : ''}
                            </div>
                        ` : '-'}
                    </td>
                </tr>
            `;
        }).join('');
    } catch (error) {
        console.error('Load external records error:', error);
        const tbody = document.querySelector('#externalRecordsTable tbody');
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="5" class="empty-state">데이터를 불러오는 중 오류가 발생했습니다.</td></tr>';
        }
    } finally {
        isLoadingExternalRecords = false;
    }
}

// 외부 서비스 알림 로드
async function loadExternalAlerts() {
    try {
        const response = await fetch(`${API_BASE}/alerts/current`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        
        // 외부 서비스 관련 알림만 필터링
        const externalAlerts = data.alerts.filter(alert => {
            const message = (alert.message || '').toLowerCase();
            return message.includes('cloudflare') || 
                   message.includes('twilio') || 
                   message.includes('채널톡') ||
                   message.includes('aws');
        });
        
        const tbody = document.querySelector('#externalAlertsTable tbody');
        if (!tbody) return;
        
        if (externalAlerts.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="empty-state">활성 알림이 없습니다.</td></tr>';
            return;
        }
        
        tbody.innerHTML = externalAlerts.map(alert => {
            const levelClass = `error-level-${alert.error_level.toLowerCase()}`;

            return `
                <tr>
                    <td>${formatDateTime(alert.timestamp)}</td>
                    <td><span class="${levelClass}">${alert.error_level}</span></td>
                    <td>${alert.message}</td>
                    <td>활성</td>
                </tr>
            `;
        }).join('');

        const extActiveAlertsEl = document.getElementById('extActiveAlerts');
        if (extActiveAlertsEl) extActiveAlertsEl.textContent = externalAlerts.length.toLocaleString();
    } catch (error) {
        console.error('Load external alerts error:', error);
        const tbody = document.querySelector('#externalAlertsTable tbody');
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="4" class="empty-state">데이터를 불러오는 중 오류가 발생했습니다.</td></tr>';
        }
    }
}

// 외부 서비스 CRITICAL 이슈 확인
async function checkExternalCriticalIssues() {
    try {
        const response = await fetch(`${API_BASE}/alerts/current`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        
        // CRITICAL 레벨만 필터링
        const criticalAlerts = data.alerts.filter(alert => alert.error_level === 'CRITICAL');
        
        const providerIssues = {};
        const now = Date.now();
        const fiveMinutesAgo = now - 5 * 60 * 1000;
        
        for (const alert of criticalAlerts) {
            if (!alert.message) continue;
            
            const message = alert.message.toLowerCase();
            let provider = null;
            
            if (message.includes('cloudflare')) {
                provider = 'Cloudflare';
            } else if (message.includes('twilio')) {
                provider = 'Twilio';
            } else if (message.includes('채널톡')) {
                provider = '채널톡';
            } else if (message.includes('aws')) {
                provider = 'AWS';
            }
            
            if (provider) {
                const alertTime = new Date(alert.timestamp).getTime();
                if (alertTime < fiveMinutesAgo) {
                    const durationMinutes = Math.floor((now - alertTime) / (60 * 1000));
                    
                    // 같은 provider의 더 오래된 이슈만 저장
                    if (!providerIssues[provider] || providerIssues[provider].duration < durationMinutes) {
                        providerIssues[provider] = {
                            provider: provider,
                            duration: durationMinutes,
                            alert: alert
                        };
                    }
                }
            }
        }
        
        const criticalIssues = Object.values(providerIssues);
        
        if (criticalIssues.length > 0) {
            displayExternalCriticalBanner(criticalIssues);
        } else {
            document.getElementById('externalCriticalBanner').style.display = 'none';
        }
    } catch (error) {
        console.error('Check external critical issues error:', error);
    }
}

// 외부 서비스 CRITICAL 배너 표시
function displayExternalCriticalBanner(issues) {
    const banner = document.getElementById('externalCriticalBanner');
    const detailsEl = document.getElementById('externalCriticalDetails');
    const actionEl = document.getElementById('externalCriticalAction');
    
    if (issues.length === 1) {
        const issue = issues[0];
        detailsEl.innerHTML = `<strong>${issue.provider}</strong> 서비스에서 문제가 <strong>${issue.duration}분</strong> 이상 지속되고 있습니다.`;
        actionEl.textContent = getExternalActionMessage(issue.provider);
    } else {
        const issueList = issues.map(i => 
            `• <strong>${i.provider}</strong>: ${i.duration}분 지속`
        ).join('<br>');
        detailsEl.innerHTML = `다음 서비스들에서 문제가 지속되고 있습니다:<br>${issueList}`;
        
        const affectedServices = issues.map(i => i.provider).join(', ');
        actionEl.textContent = `${affectedServices} 서비스 장애로 인해 서비스에 영향을 줄 수 있습니다. 관련 기능을 확인하고 사용자에게 공지를 발송하세요.`;
    }
    
    banner.style.display = 'block';
}

// 외부 서비스 Provider별 조치 메시지
function getExternalActionMessage(provider) {
    const messages = {
        'Cloudflare': 'Cloudflare 서비스 장애로 인해 CDN, DNS, 보안 기능에 영향을 줄 수 있습니다. 관련 기능을 확인하고 사용자에게 공지를 발송하세요.',
        'Twilio': 'Twilio 서비스 장애로 인해 SMS 인증 기능에 영향을 줄 수 있습니다. 대체 인증 방법을 활성화하거나 사용자에게 공지를 발송하세요.',
        '채널톡': '채널톡 서비스 장애로 인해 고객 지원 채널에 영향을 줄 수 있습니다. 대체 지원 채널을 안내하거나 사용자에게 공지를 발송하세요.',
        'AWS': 'AWS 서비스 장애로 인해 클라우드 인프라, 스토리지, API 등에 영향을 줄 수 있습니다. AWS 상태 페이지를 확인하고 사용자에게 공지를 발송하세요.'
    };
    return messages[provider] || '외부 서비스 장애로 인해 서비스에 영향을 줄 수 있습니다. 관련 기능을 확인하고 사용자에게 공지를 발송하세요.';
}

// 오류 메시지 토글 함수
function toggleErrorMessage(rowId) {
    const shortEl = document.getElementById(`${rowId}-short`);
    const fullEl = document.getElementById(`${rowId}-full`);
    const iconEl = document.getElementById(`${rowId}-icon`);
    
    if (!shortEl || !fullEl || !iconEl) return;
    
    if (fullEl.style.display === 'none') {
        // 전체 메시지 표시
        shortEl.style.display = 'none';
        fullEl.style.display = 'inline';
        iconEl.textContent = '▲';
    } else {
        // 짧은 메시지 표시
        shortEl.style.display = 'inline';
        fullEl.style.display = 'none';
        iconEl.textContent = '▼';
    }
}

// ============================================
// 테스트용: 띠배너 목업 표시 함수
// 브라우저 콘솔에서 실행 가능
// ============================================

/**
 * 띠배너 목업 표시 함수
 * @param {string} type - 'llm' (LLM 서비스) 또는 'external' (외부 서비스)
 * @param {boolean} single - true면 단일 서비스, false면 여러 서비스
 * 
 * 사용 예시:
 * - showMockCriticalBanner('llm', true)  // LLM 단일 서비스 장애
 * - showMockCriticalBanner('llm', false) // LLM 여러 서비스 장애
 * - showMockCriticalBanner('external', true)  // 외부 서비스 단일 장애
 * - showMockCriticalBanner('external', false) // 외부 서비스 여러 장애
 */
window.showMockCriticalBanner = function(type = 'llm', single = true) {
    if (type === 'llm') {
        if (single) {
            // 단일 서비스 장애 목업
            displayCriticalBanner([{
                provider: 'ChatGPT',
                duration: 18,
                message: 'ChatGPT 서비스 상태 이상 감지: DOWN'
            }]);
            console.log('✓ LLM 서비스 탭 - 단일 서비스 장애 배너 표시됨 (OpenAI, 18분 지속)');
        } else {
            // 여러 서비스 장애 목업
            displayCriticalBanner([
                { provider: 'ChatGPT', duration: 18, message: 'ChatGPT 서비스 상태 이상 감지: DOWN' },
                { provider: 'Claude', duration: 12, message: 'Claude 서비스 상태 이상 감지: DEGRADED' },
                { provider: 'Gemini', duration: 25, message: 'Gemini 서비스 상태 이상 감지: DOWN' }
            ]);
            console.log('✓ LLM 서비스 탭 - 여러 서비스 장애 배너 표시됨 (ChatGPT 18분, Claude 12분, Gemini 25분)');
        }
    } else if (type === 'external') {
        if (single) {
            // 단일 외부 서비스 장애 목업
            displayExternalCriticalBanner([{
                provider: '채널톡',
                duration: 25,
                alert: { message: '채널톡 서비스 상태 이상 감지' }
            }]);
            console.log('✓ 외부 서비스 탭 - 단일 서비스 장애 배너 표시됨 (채널톡, 25분 지속)');
        } else {
            // 여러 외부 서비스 장애 목업
            displayExternalCriticalBanner([
                { provider: 'Cloudflare', duration: 15, alert: { message: 'Cloudflare 서비스 상태 이상 감지' } },
                { provider: 'Twilio', duration: 8, alert: { message: 'Twilio 서비스 상태 이상 감지' } },
                { provider: '채널톡', duration: 25, alert: { message: '채널톡 서비스 상태 이상 감지' } }
            ]);
            console.log('✓ 외부 서비스 탭 - 여러 서비스 장애 배너 표시됨 (Cloudflare 15분, Twilio 8분, 채널톡 25분)');
        }
    }
    console.log('💡 배너를 숨기려면: hideMockCriticalBanner() 실행');
};

/**
 * 띠배너 숨기기 함수
 * @param {string} type - 'llm', 'external', 또는 'both' (기본값: 'both')
 * 
 * 사용 예시:
 * - hideMockCriticalBanner()        // 모든 배너 숨기기
 * - hideMockCriticalBanner('llm')    // LLM 서비스 배너만 숨기기
 * - hideMockCriticalBanner('external') // 외부 서비스 배너만 숨기기
 */
window.hideMockCriticalBanner = function(type = 'both') {
    if (type === 'llm' || type === 'both') {
        document.getElementById('criticalBanner').style.display = 'none';
        console.log('✓ LLM 서비스 배너 숨김');
    }
    if (type === 'external' || type === 'both') {
        const externalBanner = document.getElementById('externalCriticalBanner');
        if (externalBanner) {
            externalBanner.style.display = 'none';
            console.log('✓ 외부 서비스 배너 숨김');
        }
    }
};
