import { notFound, route } from '@/lib/http';

export const GET = route(async () => {
  throw notFound();
});

export const PATCH = route(async () => {
  throw notFound();
});
