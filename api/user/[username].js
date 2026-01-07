
export const config = {
    runtime: 'edge', // Use Edge Runtime for better performance and fetch support
};

export default async function handler(req) {
    const { searchParams } = new URL(req.url);
    const username = searchParams.get('username');

    if (!username) {
        return new Response(JSON.stringify({ error: 'Username is required' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    const leetCodeUrl = 'https://leetcode.com/graphql';

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

    try {
        const response = await fetch(leetCodeUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Referer': `https://leetcode.com/u/${username}/`,
                'Origin': 'https://leetcode.com',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': '*/*',
            },
            body: payload
        });

        if (!response.ok) {
            return new Response(JSON.stringify({ error: `LeetCode API error: ${response.status}` }), {
                status: response.status,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const data = await response.json();

        if (data.errors) {
            return new Response(JSON.stringify({ error: 'LeetCode API Error', details: data.errors }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        return new Response(JSON.stringify(data), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 's-maxage=60, stale-while-revalidate=30'
            }
        });

    } catch (error) {
        return new Response(JSON.stringify({ error: 'Internal Server Error', details: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
