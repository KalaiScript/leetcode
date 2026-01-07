const https = require('https');

// Vercel Serverless Function
// Handles GET /api/user/[username]
export default async function handler(req, res) {
    const { username } = req.query;

    if (!username) {
        return res.status(400).json({ error: 'Username is required' });
    }

    const leetCodeUrl = 'https://leetcode.com/graphql';

    // Exact same query as local server.js
    const query = `
    query getUserProfile($username: String!) {
        matchedUser(username: $username) {
            username
            submitStats: submitStatsGlobal {
                acSubmissionNum {
                    difficulty
                    count
                }
            }
        }
        recentSubmissionList(username: $username, limit: 20) {
            title
            titleSlug
            timestamp
            statusDisplay
            lang
        }
    }
    `;

    const payload = JSON.stringify({
        query,
        variables: { username }
    });

    proxyReq.write(payload);
    proxyReq.end();
});
}
