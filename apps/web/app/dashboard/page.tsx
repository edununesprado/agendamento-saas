'use client';

import {
  useEffect,
  useState,
} from 'react';
import { useRouter } from 'next/navigation';

import { apiFetch } from '@/lib/api';
import Link from 'next/link';

type CurrentUser = {
  user: {
    id: string;
    name: string;
    email: string;
  };

  tenant: {
    id: string;
    name: string;
    slug: string;
  };

  membership: {
    id: string;
    role: string;
  };
};

type DashboardData = {
  period: {
    startDate: string;
    endDate: string;
    timezone: string;
  };

  appointments: {
    total: number;
    pending: number;
    confirmed: number;
    completed: number;
    canceled: number;
    noShow: number;
  };

  revenue: {
    completedCents: number;
    completed: number;
    confirmedCents: number;
    confirmed: number;
  };

  clients: {
    attended: number;
  };

  revenueByDay: {
    date: string;
    appointments: number;
    revenueCents: number;
    revenue: number;
  }[];

  topServices: {
    serviceId: string;
    serviceName: string;
    completed: number;
    revenueCents: number;
    revenue: number;
  }[];

  employees: {
    employeeId: string;
    employeeName: string;
    total: number;
    completed: number;
    confirmed: number;
    canceled: number;
    noShow: number;
    revenueCents: number;
    revenue: number;
  }[];
};

function formatDate(
  date: Date,
) {
  const year =
    date.getFullYear();

  const month =
    String(
      date.getMonth() + 1,
    ).padStart(2, '0');

  const day =
    String(
      date.getDate(),
    ).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function formatCurrency(
  value: number,
) {
  return new Intl.NumberFormat(
    'pt-BR',
    {
      style: 'currency',
      currency: 'BRL',
    },
  ).format(value);
}

export default function DashboardPage() {
  const router = useRouter();

  const [
    currentUser,
    setCurrentUser,
  ] =
    useState<CurrentUser | null>(
      null,
    );

  const [
    dashboard,
    setDashboard,
  ] =
    useState<DashboardData | null>(
      null,
    );

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState('');

  useEffect(() => {
    async function loadDashboard() {
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
        const parsedUser =
          JSON.parse(
            storedUser,
          ) as CurrentUser;

        setCurrentUser(
          parsedUser,
        );

        const now =
          new Date();

        const firstDay =
          new Date(
            now.getFullYear(),
            now.getMonth(),
            1,
          );

        const lastDay =
          new Date(
            now.getFullYear(),
            now.getMonth() + 1,
            0,
          );

        const startDate =
          formatDate(firstDay);

        const endDate =
          formatDate(lastDay);

        const response =
          await apiFetch(
            `/dashboard?startDate=${startDate}&endDate=${endDate}`,
          );

        if (
          response.status === 401
        ) {
          localStorage.removeItem(
            'accessToken',
          );

          localStorage.removeItem(
            'currentUser',
          );

          router.replace(
            '/login',
          );

          return;
        }

        const data =
          await response.json();

        if (!response.ok) {
          throw new Error(
            data.message ??
              'Erro ao carregar dashboard',
          );
        }

        setDashboard(data);
      } catch (error) {
        setError(
          error instanceof Error
            ? error.message
            : 'Erro ao carregar dashboard',
        );
      } finally {
        setLoading(false);
      }
    }

    loadDashboard();
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

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-100">
        <p className="text-zinc-500">
          Carregando painel...
        </p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-100 p-4">
        <div className="rounded-xl bg-white p-6 shadow-sm">
          <p className="text-red-600">
            {error}
          </p>
        </div>
      </main>
    );
  }

  if (
    !currentUser ||
    !dashboard
  ) {
    return null;
  }

  return (
    <div className="min-h-screen bg-zinc-100">
      <div className="flex min-h-screen">
        {/* MENU LATERAL */}
        <aside className="hidden w-64 flex-col bg-zinc-950 text-white md:flex">
          <div className="border-b border-zinc-800 p-6">
            <h1 className="text-xl font-bold">
              Agendamento
            </h1>

            <p className="mt-1 text-sm text-zinc-400">
              SaaS
            </p>
          </div>

          <nav className="flex-1 space-y-2 p-4">
            <button
              className="w-full rounded-lg bg-zinc-800 px-4 py-3 text-left text-sm font-medium"
            >
              Dashboard
            </button>

            <Link
              href="/agenda"
              className="block rounded-lg px-4 py-3 text-sm text-zinc-300 hover:bg-zinc-900"
            >
              Agenda
            </Link>

            <Link
              href="/clientes"
              className="block rounded-lg px-4 py-3 text-sm text-zinc-300 hover:bg-zinc-900"
            >
              Clientes
            </Link>

            <Link
              href="/funcionarios"
              className="block rounded-lg bg-zinc-800 px-4 py-3 text-sm font-medium text-white"
            >
              Funcionários
            </Link>

            <button className="w-full rounded-lg px-4 py-3 text-left text-sm text-zinc-300 hover:bg-zinc-900">
              Serviços
            </button>
          </nav>

            <div className="mt-auto border-t border-zinc-800 p-4">
                <button
                    onClick={handleLogout}
                    className="w-full rounded-lg bg-red-600 px-4 py-3 text-center text-sm font-medium text-white transition hover:bg-red-700">
                    Sair
                </button>
            </div>
        </aside>

        {/* CONTEÚDO */}
        <main className="flex-1">
          {/* TOPO */}
          <header className="border-b border-zinc-200 bg-white px-6 py-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-zinc-900">
                  {
                    currentUser
                      .tenant
                      .name
                  }
                </h2>

                <p className="text-sm text-zinc-500">
                  Olá,{' '}
                  {
                    currentUser
                      .user
                      .name
                  }
                </p>
              </div>

              <button
                onClick={
                  handleLogout
                }
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 md:hidden"
              >
                Sair
              </button>
            </div>
          </header>

          <div className="p-6">
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-zinc-900">
                Dashboard
              </h1>

              <p className="mt-1 text-sm text-zinc-500">
                Visão geral do mês
                atual
              </p>
            </div>

            {/* CARDS */}
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl bg-white p-5 shadow-sm">
                <p className="text-sm text-zinc-500">
                  Agendamentos
                </p>

                <p className="mt-2 text-3xl font-bold text-zinc-900">
                  {
                    dashboard
                      .appointments
                      .total
                  }
                </p>
              </div>

              <div className="rounded-2xl bg-white p-5 shadow-sm">
                <p className="text-sm text-zinc-500">
                  Confirmados
                </p>

                <p className="mt-2 text-3xl font-bold text-zinc-900">
                  {
                    dashboard
                      .appointments
                      .confirmed
                  }
                </p>
              </div>

              <div className="rounded-2xl bg-white p-5 shadow-sm">
                <p className="text-sm text-zinc-500">
                  Concluídos
                </p>

                <p className="mt-2 text-3xl font-bold text-zinc-900">
                  {
                    dashboard
                      .appointments
                      .completed
                  }
                </p>
              </div>

              <div className="rounded-2xl bg-white p-5 shadow-sm">
                <p className="text-sm text-zinc-500">
                  Clientes atendidos
                </p>

                <p className="mt-2 text-3xl font-bold text-zinc-900">
                  {
                    dashboard
                      .clients
                      .attended
                  }
                </p>
              </div>
            </div>

            {/* FINANCEIRO */}
            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl bg-white p-6 shadow-sm">
                <p className="text-sm text-zinc-500">
                  Faturamento realizado
                </p>

                <p className="mt-2 text-3xl font-bold text-zinc-900">
                  {formatCurrency(
                    dashboard
                      .revenue
                      .completed,
                  )}
                </p>

                <p className="mt-2 text-xs text-zinc-400">
                  Somente atendimentos
                  concluídos
                </p>
              </div>

              <div className="rounded-2xl bg-white p-6 shadow-sm">
                <p className="text-sm text-zinc-500">
                  Receita prevista
                </p>

                <p className="mt-2 text-3xl font-bold text-zinc-900">
                  {formatCurrency(
                    dashboard
                      .revenue
                      .confirmed,
                  )}
                </p>

                <p className="mt-2 text-xs text-zinc-400">
                  Agendamentos
                  confirmados
                </p>
              </div>
            </div>

            {/* STATUS */}
            <div className="mt-6 rounded-2xl bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-zinc-900">
                Status dos
                agendamentos
              </h2>

              <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                <StatusItem
                  label="Pendentes"
                  value={
                    dashboard
                      .appointments
                      .pending
                  }
                />

                <StatusItem
                  label="Confirmados"
                  value={
                    dashboard
                      .appointments
                      .confirmed
                  }
                />

                <StatusItem
                  label="Concluídos"
                  value={
                    dashboard
                      .appointments
                      .completed
                  }
                />

                <StatusItem
                  label="Cancelados"
                  value={
                    dashboard
                      .appointments
                      .canceled
                  }
                />

                <StatusItem
                  label="Não compareceu"
                  value={
                    dashboard
                      .appointments
                      .noShow
                  }
                />
              </div>
            </div>

            {/* SERVIÇOS */}
            <div className="mt-6 grid gap-6 xl:grid-cols-2">
              <section className="rounded-2xl bg-white p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-zinc-900">
                  Serviços realizados
                </h2>

                {dashboard
                  .topServices
                  .length === 0 ? (
                  <p className="mt-4 text-sm text-zinc-500">
                    Nenhum serviço
                    concluído no período.
                  </p>
                ) : (
                  <div className="mt-4 space-y-3">
                    {dashboard.topServices.map(
                      (
                        service,
                      ) => (
                        <div
                          key={
                            service.serviceId
                          }
                          className="flex items-center justify-between border-b border-zinc-100 py-3 last:border-0"
                        >
                          <div>
                            <p className="font-medium text-zinc-800">
                              {
                                service.serviceName
                              }
                            </p>

                            <p className="text-xs text-zinc-500">
                              {
                                service.completed
                              }{' '}
                              atendimento(s)
                            </p>
                          </div>

                          <strong className="text-sm text-zinc-900">
                            {formatCurrency(
                              service.revenue,
                            )}
                          </strong>
                        </div>
                      ),
                    )}
                  </div>
                )}
              </section>

              {/* FUNCIONÁRIOS */}
              <section className="rounded-2xl bg-white p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-zinc-900">
                  Profissionais
                </h2>

                {dashboard
                  .employees
                  .length === 0 ? (
                  <p className="mt-4 text-sm text-zinc-500">
                    Nenhum dado no
                    período.
                  </p>
                ) : (
                  <div className="mt-4 space-y-3">
                    {dashboard.employees.map(
                      (
                        employee,
                      ) => (
                        <div
                          key={
                            employee.employeeId
                          }
                          className="flex items-center justify-between border-b border-zinc-100 py-3 last:border-0"
                        >
                          <div>
                            <p className="font-medium text-zinc-800">
                              {
                                employee.employeeName
                              }
                            </p>

                            <p className="text-xs text-zinc-500">
                              {
                                employee.completed
                              }{' '}
                              concluído(s)
                            </p>
                          </div>

                          <strong className="text-sm text-zinc-900">
                            {formatCurrency(
                              employee.revenue,
                            )}
                          </strong>
                        </div>
                      ),
                    )}
                  </div>
                )}
              </section>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

function StatusItem({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-xl bg-zinc-50 p-4">
      <p className="text-xs text-zinc-500">
        {label}
      </p>

      <p className="mt-1 text-xl font-bold text-zinc-900">
        {value}
      </p>
    </div>
  );
}