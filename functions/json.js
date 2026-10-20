import { queryOptions, getProfile, apiHeaders, errorResponse } from './_profile.js';
export async function GET(request) {
  try {
    const options = queryOptions(request);
    const profile = await getProfile(options.username, { refresh: options.refresh });
    return Response.json(profile, { headers: apiHeaders });
  } catch (error) { return errorResponse(error); }
}
