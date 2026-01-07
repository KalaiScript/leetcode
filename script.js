const usernameInput = document.getElementById('usernameInput');
const addBtn = document.getElementById('addBtn');
const userGrid = document.getElementById('userGrid');
const lastUpdated = document.getElementById('lastUpdated');

// State
let friends = JSON.parse(localStorage.getItem('leetcode_friends')) || [];
let currentLeaderboardData = [];

// Event Listeners
addBtn.addEventListener('click', addFriend);
document.getElementById('downloadBtn').addEventListener('click', exportToCSV);
usernameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addFriend();
});

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    if (friends.length > 0) {
        fetchAllData();
    } else {
        userGrid.innerHTML = `
            <div class="glass-panel" style="grid-column: 1/-1; text-align: center; padding: 40px; opacity: 0.7;">
                <i class="fa-solid fa-user-group" style="font-size: 3rem; margin-bottom: 15px;"></i>
                <h3>No friends added yet</h3>
                <p>Enter a LeetCode username above to start tracking.</p>
            </div>
        `;
    }
});

function exportToCSV() {
    if (currentLeaderboardData.length === 0) {
        alert("No data to export!");
        return;
    }

    const headers = ["Rank", "Username", "Status", "Problems Today", "Total Solved", "Easy", "Medium", "Hard", "Last Solved Problem", "Last Solved Time"];

    const rows = currentLeaderboardData.map((user, index) => {
        const lastSub = user.recentSubs.length > 0 ? user.recentSubs[0] : null;
        const lastProblem = lastSub ? lastSub.title : "-";
        const lastTime = lastSub ? new Date(parseInt(lastSub.timestamp) * 1000).toLocaleString() : "-";

        return [
            index + 1,
            user.username,
            user.solvedToday ? "Active" : "Sleeping",
            user.solvedTodayCount,
            user.totalSolved,
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

function addFriend() {
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

    if (friends.includes(username)) {
        alert('User already added!');
        return;
    }

    friends.push(username);
    saveFriends();
    usernameInput.value = '';
    fetchAllData();
}

function removeFriend(username) {
    friends = friends.filter(f => f !== username);
    saveFriends();
    fetchAllData();
}

function saveFriends() {
    localStorage.setItem('leetcode_friends', JSON.stringify(friends));
}

async function fetchAllData() {
    const loadingState = document.getElementById('loadingState');
    if (loadingState) loadingState.style.display = 'block';
    userGrid.innerHTML = ''; // Clear table

    const userData = [];

    for (const username of friends) {
        try {
            const res = await fetch(`/api/user/${username}`);
            const data = await res.json();

            if (data.error) {
                console.error(data.error);
                continue; // Skip invalid users
            }

            userData.push(processUserData(username, data));
        } catch (error) {
            console.error(`Failed to fetch ${username}`, error);
        }
    }

    renderGrid(userData);
    lastUpdated.textContent = `Last updated: ${new Date().toLocaleTimeString()}`;
}

function processUserData(username, data) {
    const matchedUser = data.matchedUser;
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

    return {
        username,
        totalSolved,
        easy,
        medium,
        hard,
        solvedToday,
        solvedTodayCount,
        recentSubs
    };
}

function renderGrid(data) {
    // Sort: Solved Today (High to Low), then Total Solved (High to Low)
    data.sort((a, b) => {
        if (a.solvedToday !== b.solvedToday) {
            return a.solvedToday ? -1 : 1;
        }
        return b.totalSolved - a.totalSolved;
    });

    // Store for export
    currentLeaderboardData = data;

    userGrid.innerHTML = '';
    const loadingState = document.getElementById('loadingState');
    if (loadingState) loadingState.style.display = 'none';

    if (data.length === 0 && friends.length > 0) {
        userGrid.innerHTML = '<tr><td colspan="7" style="text-align:center">Unable to load data</td></tr>';
        return;
    }

    data.forEach((user, index) => {
        const row = document.createElement('tr');

        // Stats
        const total = user.totalSolved || 1;
        const pEasy = (user.easy / total) * 100;
        const pMed = (user.medium / total) * 100;
        const pHard = (user.hard / total) * 100;

        // Initials for avatar
        const initial = user.username.charAt(0).toUpperCase();

        row.innerHTML = `
            <td>
                <span style="font-weight: 700; color: ${index < 3 ? 'var(--accent-color)' : 'inherit'}; font-size: 1.1rem;">#${index + 1}</span>
            </td>
            <td>
                <div class="user-cell">
                    <div class="user-avatar">${initial}</div>
                    <div>
                        <a href="https://leetcode.com/${user.username}/" target="_blank" class="username">${user.username}</a>
                        <div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 2px;">
                           <span class="status-dot ${user.solvedToday ? 'active' : ''}"></span> ${user.solvedToday ? 'Active Now' : 'Offline'}
                        </div>
                    </div>
                </div>
            </td>
            <td>
                <div class="today-count ${user.solvedToday ? 'active' : ''}">
                    ${user.solvedTodayCount}
                    ${user.solvedTodayCount > 0 ? '<i class="fa-solid fa-fire" style="font-size: 0.8rem; margin-left:5px;"></i>' : ''}
                </div>
            </td>
            <td>
                <div class="total-count">${user.totalSolved}</div>
            </td>
            <td>
                <div class="diff-text">
                    <span style="color:#00b8a3">${user.easy}</span> / 
                    <span style="color:#ffc01e">${user.medium}</span> / 
                    <span style="color:#ff375f">${user.hard}</span>
                </div>
                <div class="diff-mini-bar">
                    <div class="diff-segment seg-easy" style="width: ${pEasy}%"></div>
                    <div class="diff-segment seg-medium" style="width: ${pMed}%"></div>
                    <div class="diff-segment seg-hard" style="width: ${pHard}%"></div>
                </div>
            </td>
            <td>
                <span style="font-size: 0.85rem; color: var(--text-secondary);">
                    ${getRecentActivityText(user.recentSubs, true)}
                </span>
            </td>
            <td style="text-align: right;">
                <button class="delete-btn" onclick="removeFriend('${user.username}')">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </td>
        `;

        userGrid.appendChild(row);
    });
}

function getRecentActivityText(subs, short = false) {
    if (!subs || subs.length === 0) return '-';
    const lastSub = subs[0];
    const date = new Date(parseInt(lastSub.timestamp) * 1000);
    const timeAgo = timeSince(date);

    if (short) {
        // Show Title + Time
        return `
            <div style="font-weight:600; color:var(--text-primary); white-space: normal;">${lastSub.title}</div>
            <div style="font-size:0.75rem; color:var(--text-secondary);"><i class="fa-regular fa-clock"></i> ${timeAgo}</div>
        `;
    }
    return `<i class="fa-solid fa-clock-rotate-left"></i> ${timeAgo}`;
}

function timeSince(date) {
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
