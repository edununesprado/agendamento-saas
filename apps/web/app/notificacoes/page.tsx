
'use client';

import {
  type FormEvent,
  useEffect,
  useState,
} from 'react';
import { useRouter } from 'next/navigation';

import { PanelShell } from '@/components/panel-shell';
import { apiFetch } from '@/lib/api';

type Role =
  | 'OWNER'
  | 'ADMIN'
  | 'RECEPTIONIST'
  | 'STAFF';

type StoredUser = {
  membership: {
    role: Role;
  };
};

type NotificationStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'SENT'
  | 'FAILED'
  | 'CANCELED'
  | 'UNCERTAIN';

type NotificationType =
  | 'APPOINTMENT_REQUESTED'
  | 'APPOINTMENT_CONFIRMED'
  | 'APPOINTMENT_CANCELED'
  | 'APPOINTMENT_RESCHEDULED'
  | 'APPOINTMENT_REMINDER';

type Notification = {
  id: string;
  appointmentId: string | null;
  type: NotificationType;
  status: NotificationStatus;
  recipient: string;
  subject: string;
  attempts: number;
  maxAttempts: number;
  nextAttemptAt: string;
  lastAttemptAt: string | null;
  processingStartedAt: string | null;
  sentAt: string | null;
  failedAt: string | null;
  lastError: string | null;
  createdAt: string;
};

type NotificationsResponse = {
  data: Notification[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

type NotificationSummary = {
  total: number;
  pending: number;
  processing: number;
  sent: number;
  failed: number;
  canceled: number;
  uncertain: number;
};

type Filters = {
  status: string;
  type: string;
  startDate: string;
  endDate: string;
};

const PAGE_SIZE = 20;

const emptyFilters: Filters = {
  status: '',
  type: '',
  startDate: '',
  endDate: '',
};

const statusLabels: Record<
  NotificationStatus,
  string
> = {
  PENDING: 'Pendente',
  PROCESSING: 'Processando',
  SENT: 'Enviada',
  FAILED: 'Falha',
  CANCELED: 'Cancelada',
  UNCERTAIN: 'Incerta',
};

const statusStyles: Record<
  NotificationStatus,
  string
> = {
  PENDING:
    'bg-amber-100 text-amber-800',
  PROCESSING:
    'bg-blue-100 text-blue-800',
  SENT:
    'bg-green-100 text-green-800',
  FAILED:
    'bg-red-100 text-red-800',
  CANCELED:
    'bg-zinc-100 text-zinc-700',
  UNCERTAIN:
    'bg-purple-100 text-purple-800',
};

const typeLabels: Record<
  NotificationType,
  string
> = {
  APPOINTMENT_REQUESTED:
    'Solicitação de agendamento',
  APPOINTMENT_CONFIRMED:
    'Confirmação de agendamento',
  APPOINTMENT_CANCELED:
    'Cancelamento de agendamento',
  APPOINTMENT_RESCHEDULED:
    'Reagendamento',
  APPOINTMENT_REMINDER:
    'Lembrete de agendamento',
};

function formatDate(
  value: string | null,
): string {
  if (!value) {
    return '—';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return new Intl.DateTimeFormat(
    'pt-BR',
    {
      dateStyle: 'short',
      timeStyle: 'short',
      timeZone: 'America/Sao_Paulo',
    },
  ).format(date);
}

async function readResponse<T>(
  response: Response,
): Promise<T> {
  const data = await response
    .json()
    .catch(() => null);

  if (!response.ok) {
    const message = (
      data as {
        message?: string | string[];
      } | null
    )?.message;

    const errorMessage =
      Array.isArray(message)
        ? message.join(', ')
        : message ??
          'Não foi possível consultar a API.';

    throw new Error(errorMessage);
  }

  return data as T;
}

export default function NotificationsPage() {
  const router = useRouter();

  const [authorized, setAuthorized] =
    useState(false);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState('');

  const [summary, setSummary] =
    useState<NotificationSummary | null>(
      null,
    );

  const [
    notifications,
    setNotifications,
  ] = useState<Notification[]>([]);

  const [total, setTotal] =
    useState(0);

  const [page, setPage] =
    useState(1);

  const [totalPages, setTotalPages] =
    useState(0);

  const [filters, setFilters] =
    useState<Filters>({
      ...emptyFilters,
    });

  const [
    appliedFilters,
    setAppliedFilters,
  ] = useState<Filters>({
    ...emptyFilters,
  });

  const [refreshKey, setRefreshKey] =
    useState(0);

  const [
    expandedNotificationId,
    setExpandedNotificationId,
  ] = useState<string | null>(
    null,
  );

  function handleLogout() {
    localStorage.removeItem(
      'accessToken',
    );

    localStorage.removeItem(
      'currentUser',
    );

    router.replace('/login');
  }

  /*
   * Autenticação e carregamento.
   *
   * As consultas são executadas
   * somente para OWNER ou ADMIN.
   *
   * Uma requisição anterior é cancelada
   * quando o usuário muda os filtros,
   * a página ou sai da tela.
   */
  useEffect(() => {
    const controller =
      new AbortController();

    async function initialize() {
      const token =
        localStorage.getItem(
          'accessToken',
        );

      const storedUser =
        localStorage.getItem(
          'currentUser',
        );

      if (!token || !storedUser) {
        handleLogout();
        return;
      }

      try {
        const parsed = JSON.parse(
          storedUser,
        ) as StoredUser;

        const role =
          parsed.membership?.role;

        if (
          role !== 'OWNER' &&
          role !== 'ADMIN'
        ) {
          router.replace('/agenda');
          return;
        }
      } catch {
        handleLogout();
        return;
      }

      setAuthorized(true);
      setLoading(true);
      setError('');

      const params =
        new URLSearchParams({
          page: String(page),
          limit: String(PAGE_SIZE),
        });

      if (appliedFilters.status) {
        params.set(
          'status',
          appliedFilters.status,
        );
      }

      if (appliedFilters.type) {
        params.set(
          'type',
          appliedFilters.type,
        );
      }

      if (appliedFilters.startDate) {
        params.set(
          'startDate',
          appliedFilters.startDate,
        );
      }

      if (appliedFilters.endDate) {
        params.set(
          'endDate',
          appliedFilters.endDate,
        );
      }

      try {
        const [
          summaryResponse,
          notificationsResponse,
        ] = await Promise.all([
          apiFetch(
            '/notifications/summary',
            {
              signal: controller.signal,
            },
          ),

          apiFetch(
            `/notifications?${params.toString()}`,
            {
              signal: controller.signal,
            },
          ),
        ]);

        if (
          controller.signal.aborted
        ) {
          return;
        }

        if (
          summaryResponse.status === 401 ||
          notificationsResponse.status === 401
        ) {
          handleLogout();
          return;
        }

        if (
          summaryResponse.status === 403 ||
          notificationsResponse.status === 403
        ) {
          setError(
            'Você não possui permissão para visualizar as notificações.',
          );

          setSummary(null);
          setNotifications([]);
          setTotal(0);
          setTotalPages(0);
          return;
        }

        const [
          summaryData,
          notificationsData,
        ] = await Promise.all([
          readResponse<NotificationSummary>(
            summaryResponse,
          ),

          readResponse<NotificationsResponse>(
            notificationsResponse,
          ),
        ]);

        if (
          controller.signal.aborted
        ) {
          return;
        }

        setSummary(summaryData);

        setNotifications(
          notificationsData.data,
        );

        setTotal(
          notificationsData.total,
        );

        setTotalPages(
          notificationsData.totalPages,
        );
      } catch (err) {
        if (
          controller.signal.aborted
        ) {
          return;
        }

        setError(
          err instanceof Error
            ? err.message
            : 'Erro ao carregar notificações.',
        );

        setSummary(null);
        setNotifications([]);
        setTotal(0);
        setTotalPages(0);
      } finally {
        if (
          !controller.signal.aborted
        ) {
          setLoading(false);
        }
      }
    }

    initialize();

    return () => {
      controller.abort();
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    router,
    page,
    appliedFilters,
    refreshKey,
  ]);

  function handleApplyFilters(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (
      filters.startDate &&
      filters.endDate &&
      filters.startDate > filters.endDate
    ) {
      setError(
        'A data inicial não pode ser posterior à data final.',
      );

      return;
    }

    setError('');
    setPage(1);

    setExpandedNotificationId(null);

    setAppliedFilters({
      ...filters,
    });
  }

  function handleClearFilters() {
    setFilters({
      ...emptyFilters,
    });

    setAppliedFilters({
      ...emptyFilters,
    });

    setPage(1);
    setError('');
    setExpandedNotificationId(null);
  }

  function handleRefresh() {
    setRefreshKey(
      (current) => current + 1,
    );
  }

  const summaryCards = [
    {
      label: 'Total',
      value: summary?.total,
      style: 'bg-zinc-900 text-white',
    },
    {
      label: 'Pendentes',
      value: summary?.pending,
      style: 'bg-amber-50 text-amber-900',
    },
    {
      label: 'Processando',
      value: summary?.processing,
      style: 'bg-blue-50 text-blue-900',
    },
    {
      label: 'Enviadas',
      value: summary?.sent,
      style: 'bg-green-50 text-green-900',
    },
    {
      label: 'Falhas',
      value: summary?.failed,
      style: 'bg-red-50 text-red-900',
    },
    {
      label: 'Canceladas',
      value: summary?.canceled,
      style: 'bg-zinc-200 text-zinc-800',
    },
    {
      label: 'Incertas',
      value: summary?.uncertain,
      style: 'bg-purple-50 text-purple-900',
    },
  ];

  if (!authorized) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-100">
        <p className="text-sm text-zinc-500">
          Verificando acesso...
        </p>
      </main>
    );
  }

  return (
    <PanelShell
      title="Notificações"
      subtitle="Acompanhe os e-mails e lembretes enviados pela empresa."
    >
      <div className="space-y-6">

        {/* CABEÇALHO */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-zinc-900">
              Central de notificações
            </h3>

            <p className="mt-1 text-sm text-zinc-500">
              Histórico de entregas e acompanhamento
              dos envios.
            </p>
          </div>

          <button
            type="button"
            onClick={handleRefresh}
            disabled={loading}
            className="rounded-xl bg-zinc-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading
              ? 'Atualizando...'
              : 'Atualizar dados'}
          </button>
        </div>

        {/* ERROS */}
        {error && (
          <div
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          >
            {error}
          </div>
        )}

        {/* INDICADORES */}
        <section>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-base font-semibold text-zinc-900">
              Indicadores
            </h3>

            <p className="text-xs text-zinc-500">
              Totais de todo o histórico da empresa
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {summaryCards.map((card) => (
              <div
                key={card.label}
                className={`rounded-2xl p-5 shadow-sm ${card.style}`}
              >
                <p className="text-sm font-medium opacity-80">
                  {card.label}
                </p>

                <p className="mt-3 text-3xl font-bold">
                  {card.value ?? '—'}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-xl border border-purple-200 bg-purple-50 p-4">
            <p className="text-sm font-semibold text-purple-900">
              Sobre notificações incertas
            </p>

            <p className="mt-1 text-sm text-purple-800">
              Uma entrega incerta significa que
              não foi possível confirmar o
              resultado do envio pelo servidor
              SMTP. A mensagem pode ter sido
              entregue. Por segurança, o sistema
              não realiza reenvio automático.
            </p>
          </div>
        </section>

        {/* FILTROS */}
        <section className="rounded-2xl bg-white p-5 shadow-sm md:p-6">
          <h3 className="text-base font-semibold text-zinc-900">
            Filtrar notificações
          </h3>

          <p className="mt-1 text-sm text-zinc-500">
            Consulte as mensagens por situação,
            tipo ou data de criação.
          </p>

          <form
            onSubmit={handleApplyFilters}
            className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4"
          >
            <div>
              <label
                htmlFor="notification-status"
                className="mb-2 block text-sm font-medium text-zinc-700"
              >
                Situação
              </label>

              <select
                id="notification-status"
                value={filters.status}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    status: event.target.value,
                  }))
                }
                className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-3 text-sm text-zinc-900"
              >
                <option value="">
                  Todas as situações
                </option>

                {Object.entries(
                  statusLabels,
                ).map(([value, label]) => (
                  <option
                    key={value}
                    value={value}
                  >
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="notification-type"
                className="mb-2 block text-sm font-medium text-zinc-700"
              >
                Tipo
              </label>

              <select
                id="notification-type"
                value={filters.type}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    type: event.target.value,
                  }))
                }
                className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-3 text-sm text-zinc-900"
              >
                <option value="">
                  Todos os tipos
                </option>

                {Object.entries(
                  typeLabels,
                ).map(([value, label]) => (
                  <option
                    key={value}
                    value={value}
                  >
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="notification-start-date"
                className="mb-2 block text-sm font-medium text-zinc-700"
              >
                Data inicial
              </label>

              <input
                id="notification-start-date"
                type="date"
                value={filters.startDate}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    startDate: event.target.value,
                  }))
                }
                className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-3 text-sm text-zinc-900"
              />
            </div>

            <div>
              <label
                htmlFor="notification-end-date"
                className="mb-2 block text-sm font-medium text-zinc-700"
              >
                Data final
              </label>

              <input
                id="notification-end-date"
                type="date"
                value={filters.endDate}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    endDate: event.target.value,
                  }))
                }
                className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-3 text-sm text-zinc-900"
              />
            </div>

            <div className="flex flex-wrap gap-3 md:col-span-2 xl:col-span-4">
              <button
                type="submit"
                disabled={loading}
                className="rounded-xl bg-zinc-900 px-6 py-3 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
              >
                Aplicar filtros
              </button>

              <button
                type="button"
                onClick={handleClearFilters}
                disabled={loading}
                className="rounded-xl border border-zinc-300 bg-white px-6 py-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
              >
                Limpar filtros
              </button>
            </div>
          </form>

          <p className="mt-4 text-xs text-zinc-400">
            As datas seguem o horário de Brasília
            (America/Sao_Paulo).
            Os filtros se aplicam ao histórico
            abaixo, não aos indicadores gerais.
          </p>
        </section>

        {/* HISTÓRICO */}
        <section className="overflow-hidden rounded-2xl bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 p-5 md:p-6">
            <div>
              <h3 className="text-base font-semibold text-zinc-900">
                Histórico de notificações
              </h3>

              <p className="mt-1 text-sm text-zinc-500">
                {loading
                  ? 'Carregando registros...'
                  : `${total} notificação(ões) encontrada(s)`}
              </p>
            </div>

            <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs text-zinc-600">
              Somente leitura
            </span>
          </div>

          {loading ? (
            <div className="p-10 text-center text-sm text-zinc-500">
              Carregando notificações...
            </div>
          ) : notifications.length === 0 ? (
            <div className="p-10 text-center">
              <p className="font-medium text-zinc-800">
                Nenhuma notificação encontrada.
              </p>

              <p className="mt-2 text-sm text-zinc-500">
                Experimente alterar os filtros
                ou verificar outro período.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px] text-left">
                <thead className="bg-zinc-50">
                  <tr className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    <th className="px-5 py-4">
                      Destinatário
                    </th>

                    <th className="px-5 py-4">
                      Tipo / Assunto
                    </th>

                    <th className="px-5 py-4">
                      Situação
                    </th>

                    <th className="px-5 py-4">
                      Tentativas
                    </th>

                    <th className="px-5 py-4">
                      Criada em
                    </th>

                    <th className="px-5 py-4">
                      Enviada em
                    </th>

                    <th className="px-5 py-4 text-right">
                      Detalhes
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {notifications.map(
                    (notification) => {
                      const expanded =
                        expandedNotificationId ===
                        notification.id;

                      return (
                        <tr
                          key={notification.id}
                          className="border-t border-zinc-100 align-top"
                        >
                          <td className="max-w-[220px] break-words px-5 py-4 text-sm text-zinc-700">
                            {notification.recipient}
                          </td>

                          <td className="px-5 py-4">
                            <p className="text-sm font-medium text-zinc-800">
                              {typeLabels[
                                notification.type
                              ] ?? notification.type}
                            </p>

                            <p className="mt-1 max-w-[260px] break-words text-xs text-zinc-500">
                              {notification.subject}
                            </p>
                          </td>

                          <td className="px-5 py-4">
                            <span
                              className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                                statusStyles[
                                  notification.status
                                ] ?? 'bg-zinc-100 text-zinc-700'
                              }`}
                            >
                              {statusLabels[
                                notification.status
                              ] ?? notification.status}
                            </span>
                          </td>

                          <td className="px-5 py-4 text-sm text-zinc-600">
                            {notification.attempts}
                            {' / '}
                            {notification.maxAttempts}
                          </td>

                          <td className="whitespace-nowrap px-5 py-4 text-sm text-zinc-600">
                            {formatDate(
                              notification.createdAt,
                            )}
                          </td>

                          <td className="whitespace-nowrap px-5 py-4 text-sm text-zinc-600">
                            {formatDate(
                              notification.sentAt,
                            )}
                          </td>

                          <td className="px-5 py-4 text-right">
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedNotificationId(
                                  expanded
                                    ? null
                                    : notification.id,
                                )
                              }
                              className="rounded-lg border border-zinc-300 px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                              aria-expanded={expanded}
                            >
                              {expanded
                                ? 'Ocultar'
                                : 'Ver detalhes'}
                            </button>

                            {expanded && (
                              <div className="mt-3 w-72 rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-left text-xs text-zinc-700">
                                <p className="font-semibold">
                                  Detalhes da entrega
                                </p>

                                <p className="mt-3 break-all">
                                  <strong>ID:</strong>{' '}
                                  {notification.id}
                                </p>

                                <p className="mt-2">
                                  <strong>
                                    Última tentativa:
                                  </strong>{' '}
                                  {formatDate(
                                    notification.lastAttemptAt,
                                  )}
                                </p>

                                <p className="mt-2">
                                  <strong>
                                    Próxima tentativa:
                                  </strong>{' '}
                                  {notification.status ===
                                  'PENDING'
                                    ? formatDate(
                                        notification.nextAttemptAt,
                                      )
                                    : 'Não programada para este status'}
                                </p>

                                <p className="mt-2">
                                  <strong>
                                    Falha registrada:
                                  </strong>{' '}
                                  {formatDate(
                                    notification.failedAt,
                                  )}
                                </p>

                                {notification.lastError && (
                                  <div className="mt-3 rounded-lg border border-red-100 bg-red-50 p-3">
                                    <p className="font-semibold text-red-800">
                                      Mensagem de erro
                                    </p>

                                    <p className="mt-1 break-words text-red-700">
                                      {notification.lastError}
                                    </p>
                                  </div>
                                )}

                                {notification.status ===
                                  'UNCERTAIN' && (
                                  <p className="mt-3 rounded-lg bg-purple-100 p-3 text-purple-800">
                                    A entrega não foi
                                    confirmada. Não
                                    reenviar
                                    automaticamente.
                                  </p>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    },
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* PAGINAÇÃO */}
          <div className="flex flex-col gap-3 border-t border-zinc-100 p-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-zinc-500">
              Página {page} de{' '}
              {Math.max(totalPages, 1)}
              {' · '}
              {total} registro(s)
            </p>

            <div className="flex gap-2">
              <button
                type="button"
                disabled={
                  loading ||
                  page <= 1
                }
                onClick={() => {
                  setExpandedNotificationId(null);
                  setPage(
                    (current) => current - 1,
                  );
                }}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Anterior
              </button>

              <button
                type="button"
                disabled={
                  loading ||
                  page >= totalPages
                }
                onClick={() => {
                  setExpandedNotificationId(null);
                  setPage(
                    (current) => current + 1,
                  );
                }}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Próxima
              </button>
            </div>
          </div>
        </section>

      </div>
    </PanelShell>
  );
}
