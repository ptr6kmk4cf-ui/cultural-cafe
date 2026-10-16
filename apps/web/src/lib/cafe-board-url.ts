/** The board is a separate local app. It is not on the live café yet. */
export function cafeBoardUrl(tableId: string) {
  const path = `/board-app/?table=${encodeURIComponent(tableId)}`;
  if (typeof window === 'undefined') return path;
  if (process.env.NODE_ENV === 'development') return `http://localhost:5173${path}`;
  return `${window.location.origin}${path}`;
}
