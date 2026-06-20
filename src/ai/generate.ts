import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface WorkspaceSchema {
  title: string;
  summary: string;
  days: {
    day: number;
    date: string;
    theme: string;
    activities: {
      name: string;
      description: string;
      address: string;
      startTime: string;
      duration: number;
      travelToNext?: {
        mode: string;
        duration: number;
        note: string;
      };
    }[];
  }[];
  hotels: {
    name: string;
    address: string;
    checkIn: string;
    checkOut: string;
    notes: string;
  }[];
  tips: string[];
}

export async function generateWorkspace(tripData: {
  tripType: string;
  destination: string;
  startDate: string;
  endDate: string;
  groupSize: number;
  accommodation: string;
  activities: string[];
  preferences: string;
}): Promise<WorkspaceSchema> {
  const prompt = `You are a world-class travel planner. Generate a detailed trip workspace for the following trip:

Trip Type: ${tripData.tripType}
Destination: ${tripData.destination}
Dates: ${tripData.startDate} to ${tripData.endDate}
Group Size: ${tripData.groupSize} people
Accommodation: ${tripData.accommodation || 'Not specified'}
Preferred Activities: ${tripData.activities.join(', ') || 'General sightseeing'}
Additional Preferences: ${tripData.preferences || 'None'}

Keep descriptions concise (under 15 words each). Max 4 activities per day. Max 7 days total.

Return a JSON object with this exact structure:
{
  "title": "Trip title",
  "summary": "2-3 sentence trip overview",
  "days": [
    {
      "day": 1,
      "date": "YYYY-MM-DD",
      "theme": "Day theme",
      "activities": [
        {
          "name": "Activity name",
          "description": "Brief description",
          "address": "Full address",
          "startTime": "HH:MM",
          "duration": 90,
          "travelToNext": {
            "mode": "walk",
            "duration": 10,
            "note": "Short walk along the canal"
          }
        }
      ]
    }
  ],
  "hotels": [
    {
      "name": "Hotel name",
      "address": "Full address",
      "checkIn": "YYYY-MM-DD",
      "checkOut": "YYYY-MM-DD",
      "notes": "Any notes"
    }
  ],
  "tips": ["Tip 1", "Tip 2", "Tip 3"]
}

For travelToNext:
- mode must be one of: "walk", "drive", "subway", "bus", "taxi", "cable car", "boat", "train"
- duration is in minutes (realistic estimate)
- note is a short human-friendly description like "Short walk through the old town" or "~15 min taxi ride"
- The LAST activity of each day should NOT have travelToNext (omit the field)

Return ONLY the JSON, no other text.`;

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 8192,
    temperature: 0.4,
    messages: [{ role: 'user', content: prompt }],
  });

  const content = message.content[0];
  if (content.type !== 'text') throw new Error('Unexpected response type');

  const json = content.text.trim().replace(/^```json\n?/, '').replace(/\n?```$/, '');
  return JSON.parse(json) as WorkspaceSchema;
}
