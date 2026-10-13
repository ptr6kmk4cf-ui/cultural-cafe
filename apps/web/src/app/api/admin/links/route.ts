import { notFound, route } from '@/lib/http';

export const GET = route(async () => {
  throw notFound();
});

export const POST = route(async () => {
  throw notFound();
});
