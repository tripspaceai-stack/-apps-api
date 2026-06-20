import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface ParsedTicket {
  destination?: string;
  startDate?: string;
  endDate?: string;
  flights?: {
    direction: string;
    from: string;
    to: string;
    departTime: string;
    arriveTime: string;
    date: string;
    flightNumber: string;
  }[];
}

export async function parseTicketImage(base64: string, mediaType: string): Promise<ParsedTicket> {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mediaType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
              data: base64,
            },
          },
          {
            type: 'text',
            text: `Extract trip information from this travel document (flight ticket, hotel booking, itinerary, etc.).

Return ONLY a JSON object with these fields (omit any field you cannot find):
{
  "destination": "City name of the main destination",
  "startDate": "YYYY-MM-DD of departure/check-in",
  "endDate": "YYYY-MM-DD of return/check-out",
  "flights": [
    {
      "direction": "Outbound",
      "from": "3-letter airport code",
      "to": "3-letter airport code",
      "departTime": "HH:MM",
      "arriveTime": "HH:MM",
      "date": "YYYY-MM-DD",
      "flightNumber": "e.g. LY381"
    }
  ]
}

If there are two flights (outbound + return), include both. Return ONLY the JSON, no other text.`,
          },
        ],
      },
    ],
  });

  const content = response.content[0];
  if (content.type !== 'text') return {};

  const json = content.text.trim().replace(/^```json\n?/, '').replace(/\n?```$/, '');
  try {
    return JSON.parse(json);
  } catch {
    return {};
  }
}
