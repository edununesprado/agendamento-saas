'use client';

import {
  useEffect,
  useState,
} from 'react';
import { useRouter } from 'next/navigation';

import { apiFetch } from '@/lib/api';
import { PanelShell } from '@/components/panel-shell';

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
  <PanelShell
    title="Dashboard"
    subtitle="Visão geral da empresa"
  >
    <p className="mb-6 text-sm text-zinc-500">
      Olá, {currentUser.user.name}
    </p>

    {/* CARDS */}
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <div className="rounded-2xl bg-white p-5 shadow-sm">
        <p className="text-sm text-zinc-500">
          Agendamentos
        </p>

        <p className="mt-2 text-3xl font-bold text-zinc-900">
          {dashboard.appointments.total}
        </p>
      </div>

      <div className="rounded-2xl bg-white p-5 shadow-sm">
        <p className="text-sm text-zinc-500">
          Confirmados
        </p>

        <p className="mt-2 text-3xl font-bold text-zinc-900">
          {dashboard.appointments.confirmed}
        </p>
      </div>

      <div className="rounded-2xl bg-white p-5 shadow-sm">
        <p className="text-sm text-zinc-500">
          Concluídos
        </p>

        <p className="mt-2 text-3xl font-bold text-zinc-900">
          {dashboard.appointments.completed}
        </p>
      </div>

      <div className="rounded-2xl bg-white p-5 shadow-sm">
        <p className="text-sm text-zinc-500">
          Clientes atendidos
        </p>

        <p className="mt-2 text-3xl font-bold text-zinc-900">
          {dashboard.clients.attended}
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
            dashboard.revenue.completed,
          )}
        </p>

        <p className="mt-2 text-xs text-zinc-400">
          Somente atendimentos concluídos
        </p>
      </div>

      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <p className="text-sm text-zinc-500">
          Receita prevista
        </p>

        <p className="mt-2 text-3xl font-bold text-zinc-900">
          {formatCurrency(
            dashboard.revenue.confirmed,
          )}
        </p>

        <p className="mt-2 text-xs text-zinc-400">
          Agendamentos confirmados
        </p>
      </div>
    </div>

    {/* STATUS */}
    <div className="mt-6 rounded-2xl bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-zinc-900">
        Status dos agendamentos
      </h2>

      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatusItem
          label="Pendentes"
          value={
            dashboard.appointments.pending
          }
        />

        <StatusItem
          label="Confirmados"
          value={
            dashboard.appointments.confirmed
          }
        />

        <StatusItem
          label="Concluídos"
          value={
            dashboard.appointments.completed
          }
        />

        <StatusItem
          label="Cancelados"
          value={
            dashboard.appointments.canceled
          }
        />

        <StatusItem
          label="Não compareceu"
          value={
            dashboard.appointments.noShow
          }
        />
      </div>
    </div>

    {/* SERVIÇOS E FUNCIONÁRIOS */}
    <div className="mt-6 grid gap-6 xl:grid-cols-2">

      {/* SERVIÇOS */}
      <section className="rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-900">
          Serviços realizados
        </h2>

        {dashboard.topServices.length === 0 ? (
          <p className="mt-4 text-sm text-zinc-500">
            Nenhum serviço concluído no período.
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            {dashboard.topServices.map(
              (service) => (
                <div
                  key={service.serviceId}
                  className="flex items-center justify-between border-b border-zinc-100 py-3 last:border-0"
                >
                  <div>
                    <p className="font-medium text-zinc-800">
                      {service.serviceName}
                    </p>

                    <p className="text-xs text-zinc-500">
                      {service.completed}{' '}
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

      {/* PROFISSIONAIS */}
      <section className="rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-900">
          Profissionais
        </h2>

        {dashboard.employees.length === 0 ? (
          <p className="mt-4 text-sm text-zinc-500">
            Nenhum dado no período.
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            {dashboard.employees.map(
              (employee) => (
                <div
                  key={employee.employeeId}
                  className="flex items-center justify-between border-b border-zinc-100 py-3 last:border-0"
                >
                  <div>
                    <p className="font-medium text-zinc-800">
                      {employee.employeeName}
                    </p>

                    <p className="text-xs text-zinc-500">
                      {employee.completed}{' '}
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
  </PanelShell>
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