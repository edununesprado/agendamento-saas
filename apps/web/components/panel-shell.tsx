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

import { apiFetch } from '@/lib/api';

type Role =
  | 'OWNER'
  | 'ADMIN'
  | 'RECEPTIONIST'
  | 'STAFF';

type Tenant = {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string | null;
  primaryColor?: string | null;
  phone?: string | null;
  email?: string | null;
  timezone?: string;
};

type StoredUser = {
  tenant: Tenant;

  membership: {
    id: string;
    role: Role;
  };
};

type PanelShellProps = {
  title: string;
  subtitle?: string;
  children: ReactNode;
};

type MenuItem = {
  label: string;
  href: string;
  roles?: Role[];
};

const menuItems: MenuItem[] = [
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
  {
    label: 'Usuários',
    href: '/usuarios',
    roles: [
      'OWNER',
      'ADMIN',
    ],
  },
  {
    label: 'Configurações',
    href: '/configuracoes',
    roles: [
      'OWNER',
      'ADMIN',
    ],
  },
];

export function PanelShell({
  title,
  subtitle,
  children,
}: PanelShellProps) {
  const router = useRouter();

  const pathname =
    usePathname();

  const [
    tenant,
    setTenant,
  ] =
    useState<Tenant | null>(
      null,
    );

  const [
    role,
    setRole,
  ] =
    useState<Role | null>(
      null,
    );

  const [
    ready,
    setReady,
  ] =
    useState(false);

  useEffect(() => {
    async function initialize() {
      const token =
        localStorage.getItem(
          'accessToken',
        );

      const storedUser =
        localStorage.getItem(
          'currentUser',
        );

      if (
        !token ||
        !storedUser
      ) {
        router.replace(
          '/login',
        );

        return;
      }

      try {
        const parsed =
          JSON.parse(
            storedUser,
          ) as StoredUser;

        /*
         * Salva a função do usuário
         * para controlar o menu.
         */
        setRole(
          parsed.membership.role,
        );

        /*
         * Mostra imediatamente os dados
         * da empresa que já temos
         * no navegador.
         */
        setTenant(
          parsed.tenant,
        );

        /*
         * Busca os dados mais recentes
         * da empresa no backend.
         */
        const response =
          await apiFetch(
            '/tenants/current',
          );

        if (
          response.status ===
          401
        ) {
          handleLogout();
          return;
        }

        if (response.ok) {
          const tenantData =
            (await response.json()) as Tenant;

          setTenant(
            tenantData,
          );

          /*
           * Atualiza também os dados
           * armazenados no navegador.
           */
          const updatedStoredUser = {
            ...parsed,
            tenant: tenantData,
          };

          localStorage.setItem(
            'currentUser',
            JSON.stringify(
              updatedStoredUser,
            ),
          );
        }

        setReady(true);
      } catch {
        handleLogout();
      }
    }

    initialize();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleLogout() {
    localStorage.removeItem(
      'accessToken',
    );

    localStorage.removeItem(
      'currentUser',
    );

    router.replace(
      '/login',
    );
  }

  function isActive(
    href: string,
  ) {
    if (
      href === '/dashboard'
    ) {
      return (
        pathname ===
        '/dashboard'
      );
    }

    return pathname.startsWith(
      href,
    );
  }

  /*
   * Filtra o menu conforme a
   * função do usuário.
   */
  const visibleMenuItems =
    menuItems.filter(
      (item) =>
        !item.roles ||
        (
          role &&
          item.roles.includes(
            role,
          )
        ),
    );

  const primaryColor =
    tenant?.primaryColor ||
    '#18181b';

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

          {/* EMPRESA */}
          <div className="border-b border-zinc-800 p-5">

            {tenant?.logoUrl ? (
              <div className="mb-4 flex h-16 items-center justify-center overflow-hidden rounded-xl bg-white p-2">

                <img
                  src={
                    tenant.logoUrl
                  }
                  alt={
                    tenant.name
                  }
                  className="max-h-full max-w-full object-contain"
                />
              </div>
            ) : (
              <div
                className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl text-lg font-bold text-white"
                style={{
                  backgroundColor:
                    primaryColor,
                }}
              >
                {tenant?.name
                  ?.charAt(0)
                  .toUpperCase() ??
                  'A'}
              </div>
            )}

            <h1 className="truncate text-lg font-bold">
              {tenant?.name ??
                'Agendamento'}
            </h1>

            <p className="mt-1 text-xs text-zinc-400">
              Sistema de agendamento
            </p>
          </div>

          {/* MENU */}
          <nav className="flex-1 space-y-2 p-4">

            {visibleMenuItems.map(
              (item) => {
                const active =
                  isActive(
                    item.href,
                  );

                return (
                  <Link
                    key={
                      item.href
                    }
                    href={
                      item.href
                    }
                    style={
                      active
                        ? {
                            backgroundColor:
                              primaryColor,
                          }
                        : undefined
                    }
                    className={
                      active
                        ? 'block rounded-xl px-4 py-3 text-sm font-medium text-white shadow-sm'
                        : 'block rounded-xl px-4 py-3 text-sm text-zinc-300 transition hover:bg-zinc-900 hover:text-white'
                    }
                  >
                    {
                      item.label
                    }
                  </Link>
                );
              },
            )}
          </nav>

          {/* DADOS DA EMPRESA */}
          <div className="border-t border-zinc-800 px-5 py-4">

            <p className="truncate text-xs text-zinc-500">
              {tenant?.phone ||
                tenant?.email ||
                tenant?.slug}
            </p>
          </div>

          {/* SAIR */}
          <div className="border-t border-zinc-800 p-4">

            <button
              onClick={
                handleLogout
              }
              className="w-full rounded-xl border border-red-900/60 bg-red-950/40 px-4 py-3 text-sm font-medium text-red-300 transition hover:bg-red-900 hover:text-white"
            >
              Sair
            </button>
          </div>
        </aside>

        {/* CONTEÚDO */}
        <main className="min-w-0 flex-1">

          {/* HEADER */}
          <header className="border-b border-zinc-200 bg-white px-4 py-5 md:px-6">

            <div className="flex items-center justify-between gap-4">

              <div>
                <p className="text-sm font-medium text-zinc-500">
                  {tenant?.name}
                </p>

                <h2 className="mt-1 text-xl font-bold text-zinc-900">
                  {title}
                </h2>

                {subtitle && (
                  <p className="mt-1 text-sm text-zinc-500">
                    {subtitle}
                  </p>
                )}
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

              {visibleMenuItems.map(
                (item) => {
                  const active =
                    isActive(
                      item.href,
                    );

                  return (
                    <Link
                      key={
                        item.href
                      }
                      href={
                        item.href
                      }
                      style={
                        active
                          ? {
                              backgroundColor:
                                primaryColor,
                            }
                          : undefined
                      }
                      className={
                        active
                          ? 'whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium text-white'
                          : 'whitespace-nowrap rounded-lg bg-zinc-100 px-3 py-2 text-sm text-zinc-700'
                      }
                    >
                      {
                        item.label
                      }
                    </Link>
                  );
                },
              )}
            </nav>
          </header>

          {/* BARRA DA COR DA EMPRESA */}
          <div
            className="h-1"
            style={{
              backgroundColor:
                primaryColor,
            }}
          />

          {/* CONTEÚDO DA PÁGINA */}
          <div className="p-4 md:p-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}