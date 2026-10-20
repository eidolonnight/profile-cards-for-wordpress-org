import { EVENTS, ROLES } from './_events.js';
import { ProfileError, apiHeaders, errorResponse } from './_profile.js';

export async function GET(request) {
  try {
    if (new URL(request.url).searchParams.size) throw new ProfileError('invalid_parameter', 'The event catalogue does not accept query parameters.');
    return Response.json({ events: EVENTS, roles: ROLES }, { headers: apiHeaders });
  } catch (error) { return errorResponse(error); }
}
