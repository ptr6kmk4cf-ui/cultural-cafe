export type CafePrompt = {
  id: string;
  title: string;
  question: string;
};

/** Safe, everyday cultural questions. No dating, money, politics, or private details. */
export const CAFE_PROMPTS: CafePrompt[] = [
  { id: 'sunday', title: 'A normal Sunday', question: 'What does a normal Sunday look like where you live?' },
  { id: 'food', title: 'Something you eat', question: 'What food from your town would you want a visitor to try first?' },
  { id: 'morning', title: 'Morning', question: 'What does a weekday morning look like for you?' },
  { id: 'market', title: 'The market', question: 'What would I see and hear if I walked through your local market?' },
  { id: 'weather', title: 'The weather', question: 'What is the weather doing today, and how does that change the street?' },
  { id: 'garden', title: 'Outside', question: 'Is there a garden, park, balcony, or street you like to sit in?' },
  { id: 'music', title: 'A song', question: 'What song or sound reminds you of home?' },
  { id: 'school', title: 'School days', question: 'What do you remember about school lunches or the walk to school?' },
  { id: 'celebration', title: 'A celebration', question: 'What celebration in your town would you like someone to see once?' },
  { id: 'object', title: 'An object', question: 'Is there an object in your home that says a lot about where you are from?' },
  { id: 'hobby', title: 'Free time', question: 'What do people in your town do with a free afternoon?' },
  { id: 'neighbour', title: 'Neighbours', question: 'How do neighbours greet each other where you live?' },
];

function hashId(id: string) {
  let n = 0;
  for (let i = 0; i < id.length; i++) n = (n * 31 + id.charCodeAt(i)) >>> 0;
  return n;
}

export function cafePromptFor(id: string): CafePrompt {
  return CAFE_PROMPTS[hashId(id) % CAFE_PROMPTS.length];
}
