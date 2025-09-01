document.addEventListener('DOMContentLoaded', function() {
    // 共有ヘルパー
    const DAYS_LABEL = ['日', '月', '火', '水', '木', '金', '土'];

    function parseCSV(text) {
        return text
            .replace(/\r\n?/g, "\n")
            .split("\n")
            .filter(line => line.trim() !== "")
            .map(line => line.split(",").map(s => s.trim()).map(x => x === "" ? null : x));
    }

    function splitDays(cells) {
        const days = [[], [], [], [], []];
        let d = 0;
        for (const c of cells) {
            if (c === null || c === undefined || c === "") {
                d += 1; if (d > 4) break;
            } else {
                if (d < 5) days[d].push(c);
            }
        }
        return days;
    }

    function buildData(rows) {
        const data = new Map();
        for (const r of rows) {
            if (!r.length) continue;
            const hr = r[0];
            if (!hr) continue;
            const cells = r.slice(1);
            const days = splitDays(cells);
            data.set(hr, { days });
        }
        return data;
    }

    // Cookie 操作（スケジュールページ用）
    function setCookie(name, value, days) {
        const date = new Date();
        date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
        const expires = "expires=" + date.toUTCString();
        document.cookie = name + "=" + encodeURIComponent(value) + ";" + expires + ";path=/";
    }
    function getCookie(name) {
        const key = name + "=";
        const decodedCookie = decodeURIComponent(document.cookie);
        const ca = decodedCookie.split(';');
        for (let i = 0; i < ca.length; i++) {
            let c = ca[i];
            while (c.charAt(0) === ' ') c = c.substring(1);
            if (c.indexOf(key) === 0) return c.substring(key.length, c.length);
        }
        return "";
    }

    // =====================
    // ホーム(index.html)用
    // =====================
    function initHome() {
        const classSelect = document.getElementById('class-select');
        const daySelect = document.getElementById('day-select');
        const scheduleContainer = document.getElementById('schedule-container');
        if (!classSelect || !daySelect || !scheduleContainer) return; // このページではない

        let HR_DATA = new Map();

        // 初期の一瞬表示対策: 既存の静的オプション(HR21など)を消し、プレースホルダを表示して無効化
        try {
            classSelect.innerHTML = '';
            const ph = document.createElement('option');
            ph.value = '';
            ph.textContent = '読み込み中…';
            classSelect.appendChild(ph);
            classSelect.disabled = true;
        } catch (_) {}

        // きょうの時間割: 45分授業 固定時刻
        const PERIOD_TIMES = [
            { start: '08:34', end: '09:30' }, // 1
            { start: '09:40', end: '10:25' }, // 2
            { start: '10:35', end: '11:20' }, // 3
            { start: '11:30', end: '12:15' }, // 4
            { start: '13:00', end: '13:45' }, // 5
            { start: '13:55', end: '14:40' }, // 6
            { start: '14:50', end: '15:35' }, // 7
        ];

        function hhmmToToday(hhmm) {
            const [h, m] = hhmm.split(':').map(Number);
            const d = new Date();
            d.setHours(h, m, 0, 0);
            return d;
        }

        function getCurrentPeriodIndex(now = new Date()) {
            for (let i = 0; i < PERIOD_TIMES.length; i++) {
                const st = hhmmToToday(PERIOD_TIMES[i].start);
                const en = hhmmToToday(PERIOD_TIMES[i].end);
                if (now >= st && now < en) return i; // 0-based
            }
            return -1;
        }

        function getNextPeriodIndex(now = new Date()) {
            for (let i = 0; i < PERIOD_TIMES.length; i++) {
                const st = hhmmToToday(PERIOD_TIMES[i].start);
                if (now < st) return i;
            }
            return -1;
        }

        function isWeekend(date = new Date()) {
            const d = date.getDay();
            return d === 0 || d === 6; // 日:0, 土:6
        }

        function isFeatureActiveNow(date = new Date()) {
            // 7:00以降のみ
            const start = new Date(date);
            start.setHours(7, 0, 0, 0);
            return date >= start;
        }

        function clearIndicators() {
            const list = scheduleContainer.querySelectorAll('p');
            list.forEach(p => {
                p.classList.remove('in-class');
                const dot = p.querySelector('.next-dot');
                if (dot) dot.remove();
            });
        }

        function applyTodayIndicators() {
            const now = new Date();
            // 土日でも曜日を手動で変更した場合は表示する
            const tile = scheduleContainer.closest('.tile');
            const todayLabel = DAYS_LABEL[now.getDay()];
            const selectedDay = daySelect.value;
            
            // 土日で、かつ選択されている曜日が土日の場合のみ非表示
            if ((todayLabel === '土' || todayLabel === '日') && (selectedDay === '土' || selectedDay === '日')) {
                if (tile) tile.style.display = 'none';
                return;
            } else {
                if (tile) tile.style.display = '';
            }

            // きょう以外の曜日を選んでいる場合はインジケータ無し

            clearIndicators();

            if (selectedDay !== todayLabel) return;
            if (!isFeatureActiveNow(now)) return; // 7:00以前は何もしない

            const ps = scheduleContainer.querySelectorAll('p');
            if (!ps.length) return;

            const currentIdx = getCurrentPeriodIndex(now);
            if (currentIdx >= 0 && currentIdx < ps.length) {
                ps[currentIdx].classList.add('in-class');
                return; // 授業中は点滅のみ
            }

            // 授業外のときは次の授業に小さな丸（左の「x時間目」側）
            const nextIdx = getNextPeriodIndex(now);
            if (nextIdx >= 0 && nextIdx < ps.length) {
                const dot = document.createElement('span');
                dot.className = 'next-dot';
                const left = ps[nextIdx].querySelector('.left');
                if (left) {
                    left.insertBefore(dot, left.firstChild);
                } else {
                    ps[nextIdx].insertBefore(dot, ps[nextIdx].firstChild);
                }
            }
        }

        // ローディング: スケルトン表示/解除
        function showScheduleSkeleton() {
            scheduleContainer.classList.add('loading');
            scheduleContainer.innerHTML = '';
            const skeletonCount = 6;
            for (let i = 0; i < skeletonCount; i++) {
                const line = document.createElement('div');
                line.className = 'schedule-skeleton-line';
                scheduleContainer.appendChild(line);
            }
        }

        function finishScheduleLoading() {
            scheduleContainer.classList.remove('loading');
            // 軽いフェードイン
            scheduleContainer.classList.add('fade-in');
            setTimeout(() => scheduleContainer.classList.remove('fade-in'), 300);
            // 読み込み完了後にセレクトを有効化
            try { classSelect.disabled = false; } catch (_) {}
        }

        function renderHRList(data) {
            classSelect.innerHTML = "";
            const hrs = Array.from(data.keys()).sort((a,b)=> a.localeCompare(b, 'ja'));
            for (const hr of hrs) {
                const opt = document.createElement('option');
                opt.value = hr; opt.textContent = hr; classSelect.appendChild(opt);
            }
            return hrs;
        }

        function displaySchedule() {
            const selectedClass = classSelect.value;
            const selectedDay = daySelect.value; // '月'..'金'

            localStorage.setItem('selectedClass', selectedClass);
            // 同期: スケジュールページと同じキーにも保存
            try { setCookie('selectedHR', selectedClass, 180); } catch(_) {}

            const rec = HR_DATA.get(selectedClass);
            scheduleContainer.innerHTML = '';
            if (!rec) { scheduleContainer.textContent = '時間割が見つかりません。'; return; }

            const idx = ['月','火','水','木','金'].indexOf(selectedDay);
            if (idx === -1) { scheduleContainer.textContent = '曜日が不正です。'; return; }
            const list = rec.days[idx] || [];
            if (!list.length) { scheduleContainer.textContent = '時間割が見つかりません。'; return; }

            list.forEach((subject, i) => {
                const p = document.createElement('p');
                p.dataset.idx = String(i);

                const left = document.createElement('span');
                left.className = 'left';
                left.textContent = `${i + 1}時間目`;

                const sep = document.createElement('span');
                sep.className = 'sep';
                sep.textContent = ':';

                const right = document.createElement('span');
                right.className = 'right';
                right.textContent = subject || '';

                p.appendChild(left);
                p.appendChild(sep);
                p.appendChild(right);

                scheduleContainer.appendChild(p);
            });

            // 表示後に現在時刻のインジケータを適用
            applyTodayIndicators();
        }

        async function tryFetchLocal() {
            // 読み込み開始: スケルトン表示
            showScheduleSkeleton();
            try {
                // Google スプレッドシート（CSV）を一次ソースとして取得
                const res = await fetch('ここにCSVファイルを指定', { cache: 'no-store' });
                if (!res.ok) throw new Error('HTTP ' + res.status);
                const text = await res.text();
                const rows = parseCSV(text);
                HR_DATA = buildData(rows);
                const hrs = renderHRList(HR_DATA);

                // 復元: Cookie優先、なければlocalStorage
                const savedClass = (function() {
                    try { return getCookie('selectedHR') || localStorage.getItem('selectedClass'); } catch(_) { return localStorage.getItem('selectedClass'); }
                })();
                if (savedClass && HR_DATA.has(savedClass)) {
                    classSelect.value = savedClass;
                } else if (hrs[0]) {
                    classSelect.value = hrs[0];
                }

                const today = new Date();
                const todayLabel = DAYS_LABEL[today.getDay()];
                // 土日は月曜日を表示
                if (todayLabel === '土' || todayLabel === '日') {
                    daySelect.value = '月';
                } else {
                    daySelect.value = todayLabel;
                }

                displaySchedule();
                finishScheduleLoading();
            } catch(e) {
                scheduleContainer.classList.remove('loading');
                scheduleContainer.textContent = '時間割データの取得に失敗しました。ネットワーク接続を確認してください。';
            }
        }

        classSelect.addEventListener('change', displaySchedule);
        daySelect.addEventListener('change', displaySchedule);

        tryFetchLocal();

        // 分単位で更新（なめらかさ不要のため60秒間隔）
        setInterval(applyTodayIndicators, 60 * 1000);

        // 行事予定（ホームのみ）
        function displayNextEvent() {
            const eventContainer = document.getElementById('event-container');
            if (!eventContainer) return;

            // ローディング: スケルトン表示/解除（時間割と同様の見た目）
            function showEventSkeleton() {
                eventContainer.classList.add('loading');
                eventContainer.innerHTML = '';
                const skeletonCount = 3; // 次の予定は最大3件
                for (let i = 0; i < skeletonCount; i++) {
                    const line = document.createElement('div');
                    line.className = 'schedule-skeleton-line';
                    eventContainer.appendChild(line);
                }
            }
            function finishEventLoading() {
                eventContainer.classList.remove('loading');
                eventContainer.classList.add('fade-in');
                setTimeout(() => eventContainer.classList.remove('fade-in'), 300);
            }

            showEventSkeleton();

            // CSV: YYYY/MM/DD,タイトル の形式を想定
            function parseCalendarCSV(text) {
                return text
                    .replace(/\r\n?/g, "\n")
                    .split("\n")
                    .map(line => line.trim())
                    .filter(line => line !== "")
                    .map(line => {
                        const [dateStr, name] = line.split(',').map(s => s.trim());
                        return { dateStr, name };
                    });
            }

            function parseToDate(dateStr) {
                // フォーマット: 2025/01/07 等
                const [y, m, d] = dateStr.split('/').map(n => parseInt(n, 10));
                if (!y || !m || !d) return null;
                const dt = new Date(y, m - 1, d);
                if (isNaN(dt.getTime())) return null;
                return dt;
            }

            const CALENDAR_CSV_URL = 'ここにCSVファイルを指定';

            function loadCalendarCSV() {
                return fetch(CALENDAR_CSV_URL, { cache: 'no-store' })
                    .then(res => { if (!res.ok) throw new Error('HTTP ' + res.status); return res.text(); });
            }

            loadCalendarCSV()
                .then(text => {
                    const raw = parseCalendarCSV(text);
                    const today = new Date();
                    // 0時基準で今日未満を除外するため時分秒を0に
                    today.setHours(0,0,0,0);

                    const future = raw
                        .map(ev => ({ name: ev.name, date: parseToDate(ev.dateStr) }))
                        .filter(ev => ev.date && ev.date >= today)
                        .sort((a, b) => a.date - b.date);

                    eventContainer.innerHTML = '';
                    if (future.length > 0) {
                        const numberOfEventsToShow = Math.min(future.length, 3);
                        for (let i = 0; i < numberOfEventsToShow; i++) {
                            const ev = future[i];
                            const p = document.createElement('p');
                            p.textContent = `${ev.date.toLocaleDateString('ja-JP')} - ${ev.name}`;
                            eventContainer.appendChild(p);
                        }
                    } else {
                        eventContainer.textContent = '次の行事予定はありません。';
                    }
                    finishEventLoading();
                })
                .catch(error => {
                    console.error('Error fetching events (CSV):', error);
                    eventContainer.textContent = '行事予定の取得に失敗しました。';
                    finishEventLoading();
                });
        }

        displayNextEvent();
    }

    // =====================
    // スケジュール(pages/schedule.html)用
    // =====================
    function initSchedulePage() {
        const sel = document.getElementById('classSelect');
        if (!sel) return; // このページではない

        const DAYS_ID = ["mon", "tue", "wed", "thu", "fri"]; // 表のid接頭辞
        let HR_DATA = new Map();

        function clearCells() {
            for (let p = 1; p <= 7; p++) {
                for (let d = 0; d < DAYS_ID.length; d++) {
                    const id = DAYS_ID[d] + p;
                    const td = document.getElementById(id);
                    if (td) td.textContent = "";
                }
            }
        }

        function fillCells(record) {
            clearCells();
            const days = record.days;
            const maxPeriods = Math.max(...days.map(d => d.length), 0);
            for (let p = 0; p < Math.min(maxPeriods, 7); p++) {
                for (let d = 0; d < DAYS_ID.length; d++) {
                    const id = DAYS_ID[d] + (p + 1);
                    const td = document.getElementById(id);
                    if (td) td.textContent = days[d][p] || "";
                }
            }
        }

        function updateSchedule() {
            const hr = sel.value;
            if (!hr) { clearCells(); return; }
            const rec = HR_DATA.get(hr);
            if (rec) fillCells(rec); else clearCells();
            setCookie('selectedHR', hr, 180);
        }

        async function initFromCSVText(text) {
            const rows = parseCSV(text);
            HR_DATA = buildData(rows);

            // セレクト再生成（先頭の案内文は残す）
            const firstOption = sel.querySelector('option');
            sel.innerHTML = "";
            if (firstOption) sel.appendChild(firstOption);
            const hrs = Array.from(HR_DATA.keys()).sort((a,b)=> a.localeCompare(b, 'ja'));
            for (const hr of hrs) {
                const opt = document.createElement('option');
                opt.value = hr; opt.textContent = hr; sel.appendChild(opt);
            }

            const saved = getCookie('selectedHR');
            if (saved && HR_DATA.has(saved)) {
                sel.value = saved;
            } else if (hrs[0]) {
                sel.value = hrs[0];
            }
            updateSchedule();
        }

        async function tryFetchLocalSchedule() {
            try {
                // Google スプレッドシート（CSV）を一次ソースとして取得
                const res = await fetch('ここにCSVファイルを指定', { cache: 'no-store' });
                if (!res.ok) throw new Error('HTTP ' + res.status);
                const text = await res.text();
                await initFromCSVText(text);
            } catch (e) {
                alert('時間割データの取得に失敗しました。ネットワーク接続を確認してください。');
            }
        }

        // onchange="updateSchedule()" に対応
        window.updateSchedule = updateSchedule;
        tryFetchLocalSchedule();
    }

    // =====================
    // マップ(pages/maps.html)用
    // =====================
    function initMapsPage() {
        // このページかどうかをチェック
        const mapFrame = document.getElementById('map-frame');
        if (!mapFrame) return; // このページではない

        function changeFloor(floor) {
            document.getElementById('map-frame').src = 'map_' + floor + '.html';
            updateActiveTab(floor);
        }

        function updateActiveTab(floor) {
            var tabs = document.getElementsByClassName('tab');
            for (var i = 0; i < tabs.length; i++) {
                tabs[i].classList.remove('active');
            }
            tabs[floor - 1].classList.add('active');
        }

        function goHome() {
            window.location.href = '../index.html'; 
        }

        // グローバル関数として公開（HTMLのonclickから呼び出されるため）
        window.changeFloor = changeFloor;
        window.updateActiveTab = updateActiveTab;
        window.goHome = goHome;

        // 初期化
        updateActiveTab(1);
    }

    // =====================
    // カレンダー(pages/calendar.html)用
    // =====================
    function initCalendarPage() {
        // このページかどうかをチェック
        const calendarBody = document.getElementById('calendarBody');
        if (!calendarBody) return; // このページではない

        let currentDate = new Date();
        let events = [];

        function parseCSVToEvents(text) {
            return text
                .replace(/\r\n?/g, "\n")
                .split("\n")
                .map(line => line.trim())
                .filter(line => line !== "")
                .map(line => {
                    const [date, name] = line.split(',').map(s => s.trim());
                    return { date, name };
                });
        }

        const CALENDAR_CSV_URL = 'ここにCSVファイルを指定';

        function loadCalendarCSV() {
            return fetch(CALENDAR_CSV_URL, { cache: 'no-store' })
                .then(res => {
                    if (!res.ok) throw new Error('HTTP ' + res.status);
                    return res.text();
                });
        }

        loadCalendarCSV()
            .then(text => {
                events = parseCSVToEvents(text);
                renderCalendar();
            })
            .catch(error => console.error('Error loading events (CSV):', error));

        function renderCalendar() {
            const year = currentDate.getFullYear();
            const month = currentDate.getMonth();
            const today = new Date();
            
            document.getElementById('currentMonth').textContent = 
                `${year}年${month + 1}月`;

            const firstDay = new Date(year, month, 1);
            const lastDay = new Date(year, month + 1, 0);
            
            let calendarHTML = '';
            let day = 1;
            
            for (let i = 0; i < 6; i++) {
                let row = '<tr>';
                
                for (let j = 0; j < 7; j++) {
                    if ((i === 0 && j < firstDay.getDay()) || day > lastDay.getDate()) {
                        row += '<td></td>';
                    } else {
                        const dateStr = `${year}/${String(month + 1).padStart(2, '0')}/${String(day).padStart(2, '0')}`;
                        const dayEvents = events.filter(event => event.date === dateStr);
                        
                        const isToday = year === today.getFullYear() && 
                                      month === today.getMonth() && 
                                      day === today.getDate();
                        
                        row += `<td>${isToday ? `<div class="today">${day}</div>` : day}${dayEvents.map(event => 
                            `<div class="event">${event.name}</div>`).join('')}</td>`;
                        day++;
                    }
                }
                
                row += '</tr>';
                calendarHTML += row;
                
                if (day > lastDay.getDate()) break;
            }
            
            document.getElementById('calendarBody').innerHTML = calendarHTML;
        }

        function changeMonth(delta) {
            currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + delta, 1);
            renderCalendar();
        }

        // グローバル関数として公開（HTMLのonclickから呼び出されるため）
        window.changeMonth = changeMonth;
    }

    // =====================
    // Service Worker登録
    // =====================
    if ("serviceWorker" in navigator) {
        window.addEventListener("load", function () {
            navigator.serviceWorker.register("/sw.js").catch(function (error) {
                console.log("Service Worker registration failed:", error);
            });
        });
    }

    // 実行
    initHome();
    initSchedulePage();
    initMapsPage();
    initCalendarPage();
});
