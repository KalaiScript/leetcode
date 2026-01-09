const addBtn = document.getElementById('addBtn');
const usernameInput = document.getElementById('usernameInput');
const userGrid = document.getElementById('userGrid');
const loadingState = document.getElementById('loadingState');
const lastUpdatedEl = document.getElementById('lastUpdated');

// State
let usersData = [];

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
        renderLeaderboard();
        usernameInput.value = '';
    } catch (err) {
        alert('Failed to add user: ' + err.message);
    } finally {
        loadingState.style.display = 'none';
        addBtn.disabled = false;
    }
}

async function fetchAllData() {
    const loadingState = document.getElementById('loadingState');
    if (loadingState) loadingState.style.display = 'block';
    userGrid.innerHTML = ''; // Clear table

    const userData = [];

    for (const username of friends) {
        try {
            let baseUrl = '';
            if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
                if (window.location.port === '5500') {
                    baseUrl = 'http://localhost:3000';
                }
            }
            const res = await fetch(`${baseUrl}/api/user/${username}?t=${new Date().getTime()}`);
            const data = await res.json();

            if (data.error) {
                console.error(data.error);
                continue; // Skip invalid users
            }

            userData.push(processUserData(username, data));
        } catch (error) {
            console.error(`Failed to fetch ${username}`, error);
        }
        throw error;
    }
}

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
        solvedToday: calculateSolvedToday(data.recentSubmissionList), // Placeholder logic needed
        lastSolved: data.recentSubmissionList.length > 0 ? new Date(data.recentSubmissionList[0].timestamp * 1000) : null,
        activeNow: true // Mock for design match
    };
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

        // Add specific classes to cells for Mobile targeting
        tr.innerHTML = `
            <td class="rank-cell">
                <div class="rank-badge rank-${index + 1}">${index + 1}</div>
            </td>
            <td class="user-cell">
                <div class="user-info">
                    <div class="avatar">${user.username[0].toUpperCase()}</div>
                    <div>
                        <a href="https://leetcode.com/${user.username}" target="_blank" class="username">${user.username}</a>
                        <div class="status-indicator mobile-only">
                            <span class="status-dot"></span> Active Now
                        </div>
                    </div>
                </div>
            </td>
            <td class="today-cell">
                <span style="color: #2da44e; font-weight: bold;">
                    ${user.solvedToday} <i class="fa-solid fa-fire"></i>
                </span>
            </td>
            <td class="total-cell">
                <strong>${user.totalSolved}</strong>
            </td>
            <td class="global-rank-cell">
                #${parseInt(user.globalRank).toLocaleString()}
            </td>
            <td>
                <div class="total-count">${user.globalRanking ? user.globalRanking.toLocaleString() : '-'}</div>
            </td>
            <td>
                <div class="total-count">${user.attendedContestsCount}</div>
            </td>
            <td>
                <div class="diff-text">
                    <span style="color:#00b8a3">${user.easy}</span> / 
                    <span style="color:#ffc01e">${user.medium}</span> / 
                    <span style="color:#ff375f">${user.hard}</span>
                </div>
                <div class="sub-text">E: ${user.easy} M: ${user.medium} H: ${user.hard}</div>
            </td>
            <td class="last-cell">
                ${user.lastSolved ? timeAgo(user.lastSolved) : 'Never'}
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
        renderLeaderboard();
    }
}

// Export functions (basic stubs)
document.getElementById('downloadCsv').addEventListener('click', () => alert('CSV Export not implemented'));
document.getElementById('downloadExcel').addEventListener('click', () => alert('Excel Export not implemented'));
document.getElementById('downloadPdf').addEventListener('click', () => alert('PDF Export not implemented'));
