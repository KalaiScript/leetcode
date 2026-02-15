const addBtn = document.getElementById('addBtn');
const usernameInput = document.getElementById('usernameInput');
const userGrid = document.getElementById('userGrid');
const loadingState = document.getElementById('loadingState');
const lastUpdatedEl = document.getElementById('lastUpdated');

// State
let usersData = [];

// Init
// Init
document.addEventListener('DOMContentLoaded', () => {
    loadUsers();
});

// Event Listeners
addBtn.addEventListener('click', addFriend);
// document.getElementById('downloadBtn').addEventListener('click', exportToCSV);
document.getElementById('downloadCsv').addEventListener('click', exportToCSV);
usernameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addFriend();
});

// Initialization
// Init handled by loadUsers() above

function exportToCSV() {
    if (usersData.length === 0) {
        alert("No data to export!");
        return;
    }

    const headers = ["Rank", "Username", "Status", "Problems Today", "Total Solved", "Global Rank", "Contests", "Easy", "Medium", "Hard", "Last Solved Problem", "Last Solved Time"];

    const rows = usersData.map((user, index) => {
        const lastSub = user.recentSubs.length > 0 ? user.recentSubs[0] : null;
        const lastProblem = lastSub ? lastSub.title : "-";
        const lastTime = lastSub ? new Date(parseInt(lastSub.timestamp) * 1000).toLocaleString() : "-";

        return [
            index + 1,
            user.username,
            user.solvedToday ? "Active" : "Sleeping",
            user.solvedTodayCount,
            user.totalSolved,
            user.globalRanking || "-",
            user.attendedContestsCount,
            user.easy,
            user.medium,
            user.hard,
            `"${lastProblem}"`, // Quote to handle commas in titles
            `"${lastTime}"`
        ];
    });

    const csvContent = [
        headers.join(","),
        ...rows.map(row => row.join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `leetcode_leaderboard_${new Date().toISOString().slice(0, 10)}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

async function addFriend() {
    let input = usernameInput.value.trim();
    if (!input) return;

    // Remove trailing slash if present
    if (input.endsWith('/')) {
        input = input.slice(0, -1);
    }

    // Extraction logic
    // Supports:
    // https://leetcode.com/u/username
    // leetcode.com/u/username
    // username
    let username = input;

    try {
        if (!input.match(/^https?:\/\//)) {
            if (input.includes('leetcode.com')) {
                input = 'https://' + input;
            }
        }

        if (input.startsWith('http')) {
            const urlObj = new URL(input);
            const pathParts = urlObj.pathname.split('/').filter(Boolean); // Remove empty strings

            // Check for /u/username or /username
            if (pathParts.length > 0) {
                if (pathParts[0] === 'u' && pathParts.length > 1) {
                    username = pathParts[1];
                } else {
                    username = pathParts[0];
                }
            }
        }
    } catch (e) {
        // Not a URL, assume it's a username
        username = input;
    }

    const existingUser = usersData.some(u => u.username.toLowerCase() === username.toLowerCase());
    if (existingUser) {
        alert('User already added!');
        return;
    }

    loadingState.style.display = 'block';
    addBtn.disabled = true;

    try {
        const data = await fetchUserData(username);
        if (data.error) throw new Error(data.error);

        usersData.push(processUserData(username, data));
        saveUsers();
        renderGrid(usersData);
        usernameInput.value = '';
    } catch (err) {
        alert('Failed to add user: ' + err.message);
    } finally {
        loadingState.style.display = 'none';
        addBtn.disabled = false;
    }
}

async function fetchUserData(username) {
    try {
        let baseUrl = '';
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            if (window.location.port === '5500') {
                baseUrl = 'http://127.0.0.1:3000';
            }
        }

        const response = await fetch(`${baseUrl}/api/user/${username}`);

        // Check if response is JSON
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("text/html")) {
            throw new Error("Server Misconfiguration: API returned HTML. You are likely running on Live Server. Please run 'node server.js' and access localhost:3000.");
        }

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `API Error (status ${response.status})`);
        }

        return await response.json();
    } catch (error) {
        if (error.message.includes("Unexpected token") || error.message.includes("is not valid JSON")) {
            throw new Error("Failed to connect to backend API. Please run 'node server.js' locally.");
        }
        if (error.message === "Failed to fetch") {
            throw new Error("Backend server not reachable. Is 'node server.js' running?");
        }
        throw error;
    }
}

function saveUsers() {
    localStorage.setItem('leetcode-users', JSON.stringify(usersData.map(u => u.username)));
}

async function loadUsers() {
    const saved = JSON.parse(localStorage.getItem('leetcode-users') || '[]');
    if (saved.length === 0) return;

    if (loadingState) loadingState.style.display = 'block';
    usersData = [];

    // Parallel fetch for speed
    const promises = saved.map(username => fetchUserData(username)
        .then(data => {
            if (!data.error) {
                return processUserData(username, data);
            }
            return null;
        })
        .catch(e => null)
    );

    const results = await Promise.all(promises);
    usersData = results.filter(u => u !== null);

    renderGrid(usersData);
    if (loadingState) loadingState.style.display = 'none';
    if (lastUpdatedEl) lastUpdatedEl.textContent = 'Last updated: ' + new Date().toLocaleTimeString();
}

// function fetchAllData() removed - redundancy with loadUsers

function processUserData(username, data) {
    const matchedUser = data.matchedUser;
    const userContestRanking = data.userContestRanking;
    const recentSubs = data.recentSubmissionList || [];

    // 1. Total Solved & Breakdown
    let totalSolved = 0;
    let easy = 0, medium = 0, hard = 0;

    if (matchedUser && matchedUser.submitStats) {
        const acStats = matchedUser.submitStats.acSubmissionNum;
        // Expected: [{difficulty: 'All', count: X}, {difficulty: 'Easy', count: Y}, ...]

        const allStat = acStats.find(s => s.difficulty === 'All');
        const easyStat = acStats.find(s => s.difficulty === 'Easy');
        const mediumStat = acStats.find(s => s.difficulty === 'Medium');
        const hardStat = acStats.find(s => s.difficulty === 'Hard');

        totalSolved = allStat ? allStat.count : 0;
        easy = easyStat ? easyStat.count : 0;
        medium = mediumStat ? mediumStat.count : 0;
        hard = hardStat ? hardStat.count : 0;
    }

    // 2. Check "Solved Today"
    // LeetCode days reset at 00:00 UTC
    // We get current UTC Day
    const now = new Date();
    const todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    // Check if any submission in recent list is >= todayUTC
    let solvedToday = false;
    let solvedTodayCount = 0;

    const uniqueProblemsToday = new Set();

    if (recentSubs.length > 0) {
        for (const sub of recentSubs) {
            // Timestamp is in seconds, convert to ms
            const subDate = new Date(parseInt(sub.timestamp) * 1000);

            // Compare dates (ignoring time) & check if accepted
            // Note: LeetCode sometimes returns 'Accepted' or 'accepted' depending on legacy, usually capitalized.
            // We'll filter for 'Accepted' status to be accurate to "Solved".
            if (subDate >= todayUTC && sub.statusDisplay === 'Accepted') {
                uniqueProblemsToday.add(sub.titleSlug);
            }
        }
    }

    solvedTodayCount = uniqueProblemsToday.size;
    solvedToday = solvedTodayCount > 0;

    // 3. Simple Streak Calculation (Optimistic - just checking recent list for continuity)
    // This is hard to do perfectly without full calendar, but we can try basic check on recent queries
    // or just rely on manual streak if API doesn't return it easily. 
    // For now, let's just display "Solved Today" count as the primary daily metric.

    // 4. Contest Data
    const attendedContestsCount = userContestRanking ? userContestRanking.attendedContestsCount : 0;
    const globalRanking = matchedUser && matchedUser.profile ? matchedUser.profile.ranking : 0;

    return {
        username,
        totalSolved,
        globalRanking,
        attendedContestsCount,
        easy,
        medium,
        hard,
        globalRank: data.matchedUser.profile.ranking,
        attendedContests: data.userContestRanking ? data.userContestRanking.attendedContestsCount : 0,
        attendedContests: data.userContestRanking ? data.userContestRanking.attendedContestsCount : 0,
        solvedToday: solvedTodayCount,
        lastSolved: data.recentSubmissionList.length > 0 ? new Date(data.recentSubmissionList[0].timestamp * 1000) : null,
        activeNow: true, // Mock for design match
        recentSubs: recentSubs
    };
}

function calculateSolvedToday(submissions) {
    if (!submissions || submissions.length === 0) return 0;
    const today = new Date().setHours(0, 0, 0, 0);
    return submissions.filter(sub => {
        const subDate = new Date(sub.timestamp * 1000).setHours(0, 0, 0, 0);
        return subDate === today;
    }).length;
}

function renderGrid(data) {
    // Sort: Total Solved (High to Low)
    data.sort((a, b) => {
        return b.totalSolved - a.totalSolved;
    });

    // Store for export
    currentLeaderboardData = data;

    userGrid.innerHTML = '';

    usersData.forEach((user, index) => {
        const tr = document.createElement('tr');
        tr.className = 'user-row';

        // Calculate percentages for progress bar
        const total = (user.easy + user.medium + user.hard) || 1;
        const easyPct = (user.easy / total) * 100;
        const medPct = (user.medium / total) * 100;
        const hardPct = (user.hard / total) * 100;

        // Clean up title for display
        const lastTitle = user.recentSubs && user.recentSubs.length > 0
            ? user.recentSubs[0].title
            : 'No problems solved yet';

        tr.innerHTML = `
            <td class="rank-cell">
                <div class="rank-badge rank-${index + 1}">#${index + 1}</div>
            </td>
            <td class="user-cell">
                <div class="user-info">
                    <div class="avatar">${user.username[0].toUpperCase()}</div>
                    <div>
                        <a href="https://leetcode.com/${user.username}" target="_blank" class="username">${user.username}</a>
                        ${user.solvedToday > 0
                ? `<div class="active-now"><div class="active-dot"></div> Active Now</div>`
                : `<div class="sleeping-status"><div class="sleeping-dot"></div> Sleeping</div>`
            }
                    </div>
                </div>
            </td>
            <td class="today-cell">
                <span style="color: ${user.solvedToday > 0 ? '#2da44e' : '#8b949e'}; font-weight: bold; font-size: 1.1rem;">
                    ${user.solvedToday} ${user.solvedToday > 0 ? '<i class="fa-solid fa-fire" style="color: #2da44e;"></i>' : ''}
                </span>
            </td>
            <td class="total-cell">
                <strong style="font-size: 1rem; color: #e6edf3;">${user.totalSolved}</strong>
            </td>
            <td class="global-rank-cell">
                <div style="color: #8b949e;">${user.globalRanking ? user.globalRanking.toLocaleString() : '-'}</div>
            </td>
            <td class="contests-cell">
                <div style="color: #8b949e;">${user.attendedContestsCount}</div>
            </td>
            <td class="difficulty-cell">
                <div class="diff-stats">
                    <span style="color:#00b8a3">${user.easy}</span>
                    <span style="color:#58a6ff">/</span>
                    <span style="color:#ffc01e">${user.medium}</span>
                    <span style="color:#58a6ff">/</span>
                    <span style="color:#ff375f">${user.hard}</span>
                </div>
                <div class="difficulty-bar">
                    <div class="diff-segment diff-easy" style="width: ${easyPct}%"></div>
                    <div class="diff-segment diff-medium" style="width: ${medPct}%"></div>
                    <div class="diff-segment diff-hard" style="width: ${hardPct}%"></div>
                </div>
            </td>
            <td class="last-solved-cell">
                 <a href="#" class="last-solved-title" title="${lastTitle}">${lastTitle}</a>
                 <div class="last-solved-time">
                    <i class="fa-regular fa-clock"></i>
                    ${user.lastSolved ? timeAgo(user.lastSolved) : 'Never'}
                 </div>
            </td>
            <td class="actions-cell">
                <button class="delete-btn" onclick="removeUser('${user.username}')">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </td>
        `;
        userGrid.appendChild(tr);
    });
}

function timeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);
    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + "y ago";
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + "mo ago";
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + "d ago";
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + "h ago";
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + "m ago";
    return Math.floor(seconds) + "s ago";
}

window.removeUser = function (username) {
    if (confirm('Remove ' + username + '?')) {
        usersData = usersData.filter(u => u.username !== username);
        saveUsers();
        saveUsers();
        renderGrid(usersData);
    }
}

// Export functions
document.getElementById('downloadExcel').addEventListener('click', () => {
    if (!currentLeaderboardData || currentLeaderboardData.length === 0) {
        alert("No data to export!");
        return;
    }

    const wsData = currentLeaderboardData.map((user, index) => ({
        Rank: index + 1,
        User: user.username,
        "Solved Today": user.solvedToday,
        "Total Solved": user.totalSolved,
        "Easy": user.easy,
        "Medium": user.medium,
        "Hard": user.hard,
        "Global Rank": user.globalRank,
        "Last Solved": user.lastSolved ? new Date(user.lastSolved).toLocaleString() : 'Never'
    }));

    const ws = XLSX.utils.json_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Leaderboard");
    XLSX.writeFile(wb, "LeetCode_Leaderboard.xlsx");
});

document.getElementById('downloadPdf').addEventListener('click', () => {
    if (!currentLeaderboardData || currentLeaderboardData.length === 0) {
        alert("No data to export!");
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('l', 'mm', 'a4');

    doc.setFontSize(18);
    doc.text("LeetCode Leaderboard", 14, 22);
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 30);

    const tableColumn = ["Rank", "User", "Today", "Total", "Global Rank", "Contests", "Difficulty", "Last Solved"];
    const tableRows = [];

    currentLeaderboardData.forEach((user, index) => {
        const rowData = [
            index + 1,
            user.username,
            user.solvedToday,
            user.totalSolved,
            user.globalRank ? user.globalRank.toLocaleString() : '-',
            user.attendedContests,
            `${user.easy} / ${user.medium} / ${user.hard}`,
            (user.recentSubs && user.recentSubs.length > 0 ? user.recentSubs[0].title : '') +
            (user.lastSolved ? `\n${new Date(user.lastSolved).toLocaleDateString()}` : 'Never')
        ];
        tableRows.push(rowData);
    });

    doc.autoTable({
        head: [tableColumn],
        body: tableRows,
        startY: 40,
        theme: 'grid',
        styles: { fontSize: 10, cellPadding: 3 },
        headStyles: { fillColor: [22, 27, 34] }, // Dark header
    });

    doc.save("LeetCode_Leaderboard.pdf");
});
