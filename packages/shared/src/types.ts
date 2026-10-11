/** A profile as read from an authorised site (never persisted unless recommended). */
export interface ProfileInput {
  externalId: string;
  name: string;
  age?: number | null;
  location?: string | null;
  distanceKm?: number | null;
  bio?: string | null;
  interests?: string[];
  lookingFor?: string | null;
  lifestyle?: string[];
  /** Self-stated attributes only (e.g. height). Never inferred from photos. */
  statedAttributes?: Record<string, string>;
  language?: string | null;
  /** Downscaled JPEG data URLs of photos the site displays publicly. */
  photos?: string[];
}

export interface MatchRecommendation {
  id: string;
  externalId: string;
  name: string;
  age: number | null;
  location: string | null;
  score: number;
  reasons: string[];
  cautions: string[];
  photoObservations: string[];
  status: 'SHORTLISTED' | 'CONTACTED';
  contactId: string | null;
}

export interface AnalyzeResponse {
  recommendations: MatchRecommendation[];
  /** Only a count: details of rejected profiles are discarded immediately. */
  rejectedCount: number;
  analyzedCount: number;
}

export interface OpenerOption {
  text: string;
  hook: string;
}

export interface ReplyIntent {
  interestLevel: 'low' | 'medium' | 'high' | 'unknown';
  rejection: boolean;
  stopRequested: boolean;
  meetingAppropriate: boolean;
  needsHuman: boolean;
  needsHumanReason: string | null;
}

export interface ReplySuggestion {
  text: string;
  /** Translation into the user's language when the reply is written in another language. */
  translation: string | null;
}

export interface PhotoSuggestion {
  photoId: string;
  caption: string;
  reason: string;
}

export interface ReplyResponse {
  suggestions: ReplySuggestion[];
  detectedLanguage: string;
  replyLanguage: string;
  incomingTranslation: string | null;
  intent: ReplyIntent;
  photoSuggestion: PhotoSuggestion | null;
  memoryAdded: number;
  mockAi: boolean;
}

export interface ThreadMessage {
  externalId: string;
  direction: 'IN' | 'OUT';
  text: string;
  sentAt?: string;
  hasPhoto?: boolean;
}

export interface ThreadSnapshot {
  platform: string;
  externalId: string;
  contactName: string;
  profileExternalId?: string | null;
  messages: ThreadMessage[];
}

export interface AutopilotDecision {
  allowed: boolean;
  reason: string;
  remainingToday?: number;
}
