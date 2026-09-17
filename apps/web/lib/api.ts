export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ??
  'http://localhost:3333';

export async function apiFetch(
  path: string,
  options: RequestInit = {},
) {
  const token =
    typeof window !== 'undefined'
      ? localStorage.getItem('accessToken')
      : null;

  const headers = new Headers(
    options.headers,
  );

  headers.set(
    'Content-Type',
    'application/json',
  );

  if (token) {
    headers.set(
      'Authorization',
      `Bearer ${token}`,
    );
  }

  const response = await fetch(
    `${API_URL}${path}`,
    {
      ...options,
      headers,
    },
  );

  if (response.status === 401) {
    if (
      typeof window !== 'undefined'
    ) {
      localStorage.removeItem(
        'accessToken',
      );
    }
  }

  return response;
}