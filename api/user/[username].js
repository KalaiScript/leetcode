
export const config = {
    runtime: 'edge',
};

export default async function handler(req) {
    const url = new URL(req.url);
    let username = url.searchParams.get('username');

    // Fallback: parse from URL path for Edge Runtime
    // Expected path: /api/user/USERNAME
    if (!username) {
        const pathParts = url.pathname.split('/');
        const filteredParts = pathParts.filter(p => p.length > 0);
        const userIndex = filteredParts.indexOf('user');
        if (userIndex !== -1 && userIndex + 1 < filteredParts.length) {
            username = filteredParts[userIndex + 1];
        }
    }

    if (!username) {
        return new Response(JSON.stringify({ error: 'Username is required' }), {
            status: 400,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            }
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
            profile {
                ranking
            }
        }
        recentSubmissionList(username: $username, limit: 20) {
            title
            titleSlug
            timestamp
            statusDisplay
            lang
        }
        userContestRanking(username: $username) {
            attendedContestsCount
            globalRanking
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
                'Referer': `https://leetcode.com/${username}/`,
                'Origin': 'https://leetcode.com',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
                'Accept': 'application/json, text/javascript, */*; q=0.01',
                'Accept-Language': 'en-US,en;q=0.9',
                'X-Requested-With': 'XMLHttpRequest',
                'Sec-Fetch-Dest': 'empty',
                'Sec-Fetch-Mode': 'cors',
                'Sec-Fetch-Site': 'same-origin',
            },
            body: payload
        });

        // If LeetCode returned non-OK (e.g. 403), try to still parse the response
        const responseText = await response.text();
        let data;

        try {
            data = JSON.parse(responseText);
        } catch (parseErr) {
            return new Response(JSON.stringify({ error: `LeetCode API Error: received non-JSON response (status ${response.status})` }), {
                status: 502,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                }
            });
        }

        // If there are GraphQL errors but we still got data, use the data
        // LeetCode often returns errors alongside partial data
        // (e.g. userContestRanking can error for users who haven't done contests)
        if (data.data) {
            // Check if the user actually exists
            if (data.data.matchedUser === null) {
                return new Response(JSON.stringify({ error: `User "${username}" not found on LeetCode` }), {
                    status: 404,
                    headers: {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*',
                    }
                });
            }

            return new Response(JSON.stringify(data.data), {
                status: 200,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Cache-Control': 's-maxage=60, stale-while-revalidate=30'
                }
            });
        }

        // Only if there's no data at all and only errors
        if (data.errors) {
            const errorMessage = data.errors.map(e => e.message).join('; ');
            return new Response(JSON.stringify({ error: `LeetCode API Error: ${errorMessage}` }), {
                status: 502,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                }
            });
        }

        // Unexpected response shape
        return new Response(JSON.stringify({ error: 'Unexpected response from LeetCode API' }), {
            status: 502,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            }
        });

    } catch (error) {
        return new Response(JSON.stringify({ error: 'Internal Server Error', details: error.message }), {
            status: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            }
        });
    }
}
