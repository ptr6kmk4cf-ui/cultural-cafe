export const STYLES = [
  { value: 'natural', label: 'Natural', help: 'Warm, genuine, like you on a good day.' },
  { value: 'funny', label: 'Funny', help: 'Light jokes and wit, never at their expense.' },
  { value: 'charming', label: 'Charming', help: 'Attentive, gracious, a little smooth.' },
  { value: 'romantic', label: 'Romantic', help: 'Sincere and affectionate, not over the top.' },
  { value: 'confident', label: 'Confident', help: 'Direct and self-assured, never pushy.' },
  { value: 'casual', label: 'Casual', help: 'Relaxed and low-key.' },
  { value: 'intellectual', label: 'Intellectual', help: 'Curious, thoughtful, ideas-driven.' },
  { value: 'playful', label: 'Playful', help: 'Teasing and fun, keeps it light.' },
] as const;

export type StyleValue = (typeof STYLES)[number]['value'];
export const STYLE_VALUES = STYLES.map((s) => s.value) as unknown as [StyleValue, ...StyleValue[]];

export const MESSAGE_LENGTHS = ['short', 'medium', 'long'] as const;
export type MessageLength = (typeof MESSAGE_LENGTHS)[number];

export const LEVEL_LABELS = {
  humor: ['None', 'Subtle', 'Moderate', 'Frequent', 'Comedian'],
  flirting: ['None', 'Subtle', 'Friendly', 'Flirty', 'Bold'],
  formality: ['Very casual', 'Casual', 'Polite', 'Formal'],
};
