import { notFound, redirect } from 'next/navigation';
import { getCurrentUser } from './auth';

/**
 * Call at the top of every server-rendered admin page, before loading any data.
 * The admin layout also checks, but Next renders a page alongside its layout,
 * so a layout check alone does not stop the page's data from being sent.
 */
export async function requireAdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (user.role !== 'ADMIN') notFound();
  return user;
}
