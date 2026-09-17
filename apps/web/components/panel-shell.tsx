'use client';

import Link from 'next/link';
import {
  ReactNode,
  useEffect,
  useState,
} from 'react';
import {
  usePathname,
  useRouter,
} from 'next/navigation';

type CurrentUser = {
  tenant: {
    id: string;
    name: string;
    slug: string;
  };
};

type PanelShellProps = {
  title: string;
  subtitle?: string;
  children: ReactNode;
};

const menuItems = [
  {
    label: 'Dashboard',
    href: '/dashboard',
  },
  {
    label: 'Agenda',
    href: '/agenda',
  },
  {
    label: 'Clientes',
    href: '/clientes',
  },
  {
    label: 'Funcionários',
    href: '/funcionarios',
  },
  {
    label: 'Serviços',
    href: '/servicos',
  },
];

export function PanelShell({
  title,
  subtitle,
  children,
}: PanelShellProps) {
  const router = useRouter();
  const pathname = usePathname();

  const [
    tenantName,
    setTenantName,
  ] = useState('');

  const [ready, setReady] =
    useState(false);

  useEffect(() => {
    const token =
      localStorage.getItem(
        'accessToken',
      );

    const storedUser =
      localStorage.getItem(
        'currentUser',
      );

    if (!token || !storedUser) {
      router.replace('/login');
      return;
    }

    try {
      const parsed =
        JSON.parse(
          storedUser,
        ) as CurrentUser;

      setTenantName(
        parsed.tenant.name,
      );

      setReady(true);
    } catch {
      localStorage.removeItem(
        'accessToken',
      );

      localStorage.removeItem(
        'currentUser',
      );

      router.replace('/login');
    }
  }, [router]);

  function handleLogout() {
    localStorage.removeItem(
      'accessToken',
    );

    localStorage.removeItem(
      'currentUser',
    );

    router.replace('/login');
  }

  function isActive(
    href: string,
  ) {
    if (href === '/dashboard') {
      return (
        pathname === '/dashboard'
      );
    }

    return pathname.startsWith(
      href,
    );
  }

  if (!ready) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-100">
        <p className="text-sm text-zinc-500">
          Carregando...
        </p>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-100">
      <div className="flex min-h-screen">

        {/* MENU DESKTOP */}
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col bg-zinc-950 text-white md:flex">

          <div className="border-b border-zinc-800 p-6">
            <h1 className="text-xl font-bold">
              Agendamento
            </h1>

            <p className="mt-1 text-sm text-zinc-400">
              SaaS
            </p>
          </div>

          <nav className="flex-1 space-y-2 p-4">
            {menuItems.map(
              (item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={
                    isActive(
                      item.href,
                    )
                      ? 'block rounded-lg bg-zinc-800 px-4 py-3 text-sm font-medium text-white'
                      : 'block rounded-lg px-4 py-3 text-sm text-zinc-300 hover:bg-zinc-900'
                  }
                >
                  {item.label}
                </Link>
              ),
            )}
          </nav>

          <div className="mt-auto border-t border-zinc-800 p-4">
            <button
              onClick={
                handleLogout
              }
              className="w-full rounded-lg bg-red-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-red-700"
            >
              Sair
            </button>
          </div>
        </aside>

        {/* CONTEÚDO */}
        <main className="min-w-0 flex-1">

          <header className="border-b border-zinc-200 bg-white px-4 py-5 md:px-6">

            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-zinc-900">
                  {tenantName}
                </h2>

                <p className="text-sm text-zinc-500">
                  {subtitle}
                </p>
              </div>

              <button
                onClick={
                  handleLogout
                }
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white md:hidden"
              >
                Sair
              </button>
            </div>

            {/* MENU MOBILE */}
            <nav className="mt-4 flex gap-2 overflow-x-auto pb-1 md:hidden">
              {menuItems.map(
                (item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={
                      isActive(
                        item.href,
                      )
                        ? 'whitespace-nowrap rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white'
                        : 'whitespace-nowrap rounded-lg bg-zinc-100 px-3 py-2 text-sm text-zinc-700'
                    }
                  >
                    {item.label}
                  </Link>
                ),
              )}
            </nav>
          </header>

          <div className="p-4 md:p-6">

            <div className="mb-6">
              <h1 className="text-2xl font-bold text-zinc-900">
                {title}
              </h1>
            </div>

            {children}
          </div>
        </main>
      </div>
    </div>
  );
}