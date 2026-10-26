
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
  tenant?: {
    timezone?: string;
  };
};

type NamedResource = {
  id: string;
  name: string;
};

type Appointment = {
  id: string;
  startsAt: string;
  status: string;
  employeeId: string;
  serviceId: string;
  client: {
    name: string;
  };
  employee: NamedResource;
  service: NamedResource;
};

type AuditEvent = {
  id: string;
  appointmentId: string;
  action: string;
  actorType: 'USER' | 'PUBLIC' | 'SYSTEM';
  actorUserId: string | null;
  actorName: string | null;
  actorRole: Role | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  createdAt: string;
};

type HistoryResponse = {
  appointmentId: string;
  data: AuditEvent[];
};

type DateRange = {
  startDate: string;
  endDate: string;
};

type ResourceNames = {
  employees: Record<string, string>;
  services: Record<string, string>;
};

const actionLabels: Record<string, string> = {
  CREATED: 'Agendamento criado',
  CONFIRMED: 'Agendamento confirmado',
  RESCHEDULED: 'Agendamento reagendado',
  CANCELED: 'Agendamento cancelado',
  COMPLETED: 'Atendimento concluído',
  NO_SHOW: 'Cliente não compareceu',
  UPDATED: 'Agendamento atualizado',
};

const statusLabels: Record<string, string> = {
  PENDING: 'Pendente',
  CONFIRMED: 'Confirmado',
  COMPLETED: 'Concluído',
  CANCELED: 'Cancelado',
  NO_SHOW: 'Não compareceu',
};

const roleLabels: Record<string, string> = {
  OWNER: 'Proprietário',
  ADMIN: 'Administrador',
  RECEPTIONIST: 'Recepcionista',
  STAFF: 'Funcionário',
};

const fieldLabels: Record<string, string> = {
  status: 'Situação',
  startsAt: 'Início',
  endsAt: 'Término',
  canceledAt: 'Cancelado em',
  cancelReason: 'Motivo',
  employeeId: 'Funcionário',
  serviceId: 'Serviço',
};

function formatDateInput(date: Date): string {
  const year = date.getFullYear();

  const month = String(
    date.getMonth() + 1,
  ).padStart(2, '0');

  const day = String(
    date.getDate(),
  ).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function getInitialDateRange(): DateRange {
  const now = new Date();

  return {
    startDate: formatDateInput(
      new Date(
        now.getFullYear(),
        now.getMonth(),
        1,
      ),
    ),
    endDate: formatDateInput(
      new Date(
        now.getFullYear(),
        now.getMonth() + 1,
        0,
      ),
    ),
  };
}

function formatDateTime(
  value: string,
  timezone: string,
): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(
    'pt-BR',
    {
      dateStyle: 'short',
      timeStyle: 'short',
      timeZone: timezone,
    },
  ).format(date);
}

/*
 * Traduz os dados da auditoria
 * para uma apresentação amigável.
 *
 * IDs de funcionários e serviços
 * são substituídos pelos nomes
 * encontrados nas APIs.
 *
 * Como segurança adicional, utiliza
 * os nomes do agendamento selecionado
 * quando o ID corresponde.
 *
 * Se o nome não estiver disponível,
 * mantém o ID para não ocultar dados.
 */
function formatAuditValue(
  field: string,
  value: unknown,
  timezone: string,
  resourceNames: ResourceNames,
  appointment: Appointment | undefined,
): string {
  if (value === null || value === undefined) {
    return '—';
  }

  if (
    field === 'employeeId' &&
    typeof value === 'string'
  ) {
    const name =
      resourceNames.employees[value] ??
      (
        appointment?.employeeId === value
          ? appointment.employee.name
          : undefined
      );

    return name ?? `ID: ${value}`;
  }

  if (
    field === 'serviceId' &&
    typeof value === 'string'
  ) {
    const name =
      resourceNames.services[value] ??
      (
        appointment?.serviceId === value
          ? appointment.service.name
          : undefined
      );

    return name ?? `ID: ${value}`;
  }

  if (
    field === 'status' &&
    typeof value === 'string'
  ) {
    return statusLabels[value] ?? value;
  }

  if (
    [
      'startsAt',
      'endsAt',
      'canceledAt',
    ].includes(field) &&
    typeof value === 'string'
  ) {
    return formatDateTime(value, timezone);
  }

  if (typeof value === 'boolean') {
    return value ? 'Sim' : 'Não';
  }

  if (typeof value === 'object') {
    return JSON.stringify(value);
  }

  return String(value);
}

function getActorLabel(event: AuditEvent): string {
  if (event.actorType === 'PUBLIC') {
    return 'Cliente — agendamento online';
  }

  if (event.actorType === 'SYSTEM') {
    return 'Sistema';
  }

  const name = event.actorName || 'Usuário';

  const role = event.actorRole
    ? roleLabels[event.actorRole] ?? event.actorRole
    : '';

  return role
    ? `${name} (${role})`
    : name;
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

    throw new Error(
      Array.isArray(message)
        ? message.join(', ')
        : message ?? 'Erro ao consultar a API.',
    );
  }

  return data as T;
}

export default function AuditoriaPage() {
  const router = useRouter();

  const [authorized, setAuthorized] =
    useState(false);

  const [timezone, setTimezone] =
    useState('America/Sao_Paulo');

  const [dates, setDates] =
    useState<DateRange>(getInitialDateRange);

  const [appliedDates, setAppliedDates] =
    useState<DateRange>(getInitialDateRange);

  const [appointments, setAppointments] =
    useState<Appointment[]>([]);

  const [selectedId, setSelectedId] =
    useState<string | null>(null);

  const [history, setHistory] =
    useState<AuditEvent[]>([]);

  const [resourceNames, setResourceNames] =
    useState<ResourceNames>({
      employees: {},
      services: {},
    });

  const [
    loadingAppointments,
    setLoadingAppointments,
  ] = useState(true);

  const [
    loadingHistory,
    setLoadingHistory,
  ] = useState(false);

  const [error, setError] =
    useState('');

  const [historyError, setHistoryError] =
    useState('');

  const [refreshKey, setRefreshKey] =
    useState(0);

  /*
   * AUTORIZAÇÃO DO FRONTEND
   *
   * Somente OWNER e ADMIN
   * podem entrar na página.
   *
   * O backend também valida
   * esses perfis por RolesGuard.
   */
  useEffect(() => {
    const token =
      localStorage.getItem('accessToken');

    const storedUser =
      localStorage.getItem('currentUser');

    if (!token || !storedUser) {
      router.replace('/login');
      return;
    }

    try {
      const user =
        JSON.parse(storedUser) as StoredUser;

      const role =
        user.membership?.role;

      if (
        role !== 'OWNER' &&
        role !== 'ADMIN'
      ) {
        router.replace('/agenda');
        return;
      }

      setTimezone(
        user.tenant?.timezone ||
        'America/Sao_Paulo',
      );

      setAuthorized(true);
    } catch {
      router.replace('/login');
    }
  }, [router]);

  /*
   * CARREGAMENTO DA AUDITORIA
   *
   * Consulta:
   * 1. Agendamentos do período
   * 2. Funcionários ativos e inativos
   * 3. Serviços ativos e inativos
   *
   * Os cadastros são utilizados apenas
   * para traduzir IDs em nomes.
   *
   * Uma falha na consulta dos nomes
   * não impede a listagem de agendamentos.
   */
  useEffect(() => {
    if (!authorized) {
      return;
    }

    const controller =
      new AbortController();

    async function loadAppointments() {
      setLoadingAppointments(true);
      setError('');
      setHistoryError('');
      setAppointments([]);
      setSelectedId(null);
      setHistory([]);

      const params = new URLSearchParams({
        startDate: appliedDates.startDate,
        endDate: appliedDates.endDate,
      });

      try {
        const [
          appointmentsResponse,
          employeesResponse,
          servicesResponse,
        ] = await Promise.all([
          apiFetch(
            `/appointments?${params.toString()}`,
            {
              signal: controller.signal,
            },
          ),

          apiFetch(
            '/employees?status=all',
            {
              signal: controller.signal,
            },
          ).catch(() => null),

          apiFetch(
            '/services?status=all',
            {
              signal: controller.signal,
            },
          ).catch(() => null),
        ]);

        if (controller.signal.aborted) {
          return;
        }

        if (
          appointmentsResponse.status === 401
        ) {
          router.replace('/login');
          return;
        }

        const appointmentData =
          await readResponse<Appointment[]>(
            appointmentsResponse,
          );

        let employeeData: NamedResource[] = [];
        let serviceData: NamedResource[] = [];

        /*
         * As consultas auxiliares são
         * opcionais para a apresentação.
         *
         * Se alguma falhar, continuamos
         * com os nomes disponíveis
         * no próprio agendamento.
         */
        if (employeesResponse?.ok) {
          employeeData =
            await readResponse<NamedResource[]>(
              employeesResponse,
            );
        }

        if (servicesResponse?.ok) {
          serviceData =
            await readResponse<NamedResource[]>(
              servicesResponse,
            );
        }

        if (controller.signal.aborted) {
          return;
        }

        const employeeNames =
          Object.fromEntries(
            employeeData.map((employee) => [
              employee.id,
              employee.name,
            ]),
          );

        const serviceNames =
          Object.fromEntries(
            serviceData.map((service) => [
              service.id,
              service.name,
            ]),
          );

        /*
         * Completa os nomes com os dados
         * dos agendamentos encontrados.
         */
        for (const appointment of appointmentData) {
          if (
            appointment.employee?.id &&
            appointment.employee?.name
          ) {
            employeeNames[appointment.employee.id] =
              appointment.employee.name;
          }

          if (
            appointment.service?.id &&
            appointment.service?.name
          ) {
            serviceNames[appointment.service.id] =
              appointment.service.name;
          }
        }

        setResourceNames({
          employees: employeeNames,
          services: serviceNames,
        });

        setAppointments(appointmentData);
      } catch (err) {
        if (controller.signal.aborted) {
          return;
        }

        setAppointments([]);

        setError(
          err instanceof Error
            ? err.message
            : 'Erro ao carregar agendamentos.',
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoadingAppointments(false);
        }
      }
    }

    loadAppointments();

    return () => controller.abort();
  }, [
    authorized,
    appliedDates.startDate,
    appliedDates.endDate,
    refreshKey,
    router,
  ]);

  /*
   * HISTÓRICO DO AGENDAMENTO
   *
   * GET /appointments/:id/history
   *
   * Os eventos são somente leitura.
   * A página não modifica a auditoria.
   */
  useEffect(() => {
    if (!authorized || !selectedId) {
      return;
    }

    const controller =
      new AbortController();

    async function loadHistory() {
      setLoadingHistory(true);
      setHistory([]);
      setHistoryError('');

      try {
        const response = await apiFetch(
          `/appointments/${selectedId}/history`,
          {
            signal: controller.signal,
          },
        );

        if (response.status === 401) {
          router.replace('/login');
          return;
        }

        if (response.status === 403) {
          setHistoryError(
            'Você não possui permissão para consultar esta auditoria.',
          );
          return;
        }

        const data =
          await readResponse<HistoryResponse>(
            response,
          );

        if (!controller.signal.aborted) {
          setHistory(data.data);
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setHistoryError(
            err instanceof Error
              ? err.message
              : 'Erro ao carregar o histórico.',
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoadingHistory(false);
        }
      }
    }

    loadHistory();

    return () => controller.abort();
  }, [
    authorized,
    selectedId,
    router,
  ]);

  function handleSearch(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (
      !dates.startDate ||
      !dates.endDate ||
      dates.startDate > dates.endDate
    ) {
      setError('Informe um período válido.');
      return;
    }

    setAppliedDates({ ...dates });

    setRefreshKey(
      (current) => current + 1,
    );
  }

  function handleRefresh() {
    setRefreshKey(
      (current) => current + 1,
    );
  }

  const selectedAppointment =
    appointments.find(
      (appointment) =>
        appointment.id === selectedId,
    );

  if (!authorized) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-100">
        <p className="text-sm text-zinc-500">
          Verificando acesso à auditoria...
        </p>
      </main>
    );
  }

  return (
    <PanelShell
      title="Auditoria"
      subtitle="Consulte o histórico das alterações realizadas nos agendamentos."
    >
      <div className="space-y-6">

        {/* INTRODUÇÃO */}
        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h3 className="text-lg font-semibold text-zinc-900">
            Histórico de agendamentos
          </h3>

          <p className="mt-2 text-sm text-zinc-600">
            Selecione um período e um agendamento para
            consultar as ações registradas, seus
            responsáveis e as alterações realizadas.
          </p>
        </section>

        {/* FILTROS */}
        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h3 className="font-semibold text-zinc-900">
            Filtrar período
          </h3>

          <form
            onSubmit={handleSearch}
            className="mt-4 flex flex-wrap items-end gap-3"
          >
            <div>
              <label
                htmlFor="audit-start"
                className="mb-1 block text-sm font-medium text-zinc-700"
              >
                Data inicial
              </label>

              <input
                id="audit-start"
                type="date"
                value={dates.startDate}
                onChange={(event) =>
                  setDates((current) => ({
                    ...current,
                    startDate: event.target.value,
                  }))
                }
                className="rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
              />
            </div>

            <div>
              <label
                htmlFor="audit-end"
                className="mb-1 block text-sm font-medium text-zinc-700"
              >
                Data final
              </label>

              <input
                id="audit-end"
                type="date"
                value={dates.endDate}
                onChange={(event) =>
                  setDates((current) => ({
                    ...current,
                    endDate: event.target.value,
                  }))
                }
                className="rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
              />
            </div>

            <button
              type="submit"
              disabled={loadingAppointments}
              className="rounded-lg bg-zinc-900 px-5 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
            >
              Consultar
            </button>

            <button
              type="button"
              onClick={handleRefresh}
              disabled={loadingAppointments}
              className="rounded-lg border border-zinc-300 px-5 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
            >
              Atualizar
            </button>
          </form>

          <p className="mt-3 text-xs text-zinc-500">
            O período filtra a data dos agendamentos.
            Os eventos históricos são exibidos após
            selecionar um agendamento.
          </p>
        </section>

        {/* ERRO DE CONSULTA */}
        {error && (
          <div
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
          >
            {error}
          </div>
        )}

        {/* AGENDAMENTOS */}
        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-semibold text-zinc-900">
              Agendamentos encontrados
            </h3>

            <span className="text-sm text-zinc-500">
              {appointments.length} registro(s)
            </span>
          </div>

          {loadingAppointments ? (
            <p className="mt-4 text-sm text-zinc-500">
              Carregando agendamentos...
            </p>
          ) : appointments.length === 0 ? (
            <p className="mt-4 text-sm text-zinc-500">
              Nenhum agendamento encontrado nesse período.
            </p>
          ) : (
            <div className="mt-4 max-h-[420px] space-y-2 overflow-y-auto">
              {appointments.map((appointment) => (
                <button
                  key={appointment.id}
                  type="button"
                  onClick={() =>
                    setSelectedId(appointment.id)
                  }
                  aria-pressed={
                    selectedId === appointment.id
                  }
                  className={`w-full rounded-xl border p-4 text-left transition ${
                    selectedId === appointment.id
                      ? 'border-zinc-900 bg-zinc-100'
                      : 'border-zinc-200 hover:border-zinc-400 hover:bg-zinc-50'
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-zinc-900">
                        {appointment.client.name}
                      </p>

                      <p className="mt-1 text-sm text-zinc-600">
                        {appointment.service.name}
                        {' · '}
                        {appointment.employee.name}
                      </p>
                    </div>

                    <span className="rounded-lg bg-zinc-200 px-3 py-1 text-xs font-medium text-zinc-800">
                      {statusLabels[appointment.status] ??
                        appointment.status}
                    </span>
                  </div>

                  <p className="mt-2 text-sm text-zinc-500">
                    {formatDateTime(
                      appointment.startsAt,
                      timezone,
                    )}
                  </p>
                </button>
              ))}
            </div>
          )}
        </section>

        {/* HISTÓRICO */}
        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h3 className="font-semibold text-zinc-900">
            Histórico de alterações
          </h3>

          {!selectedId ? (
            <p className="mt-4 text-sm text-zinc-500">
              Selecione um agendamento acima para
              visualizar seu histórico.
            </p>
          ) : (
            <div className="mt-4 space-y-4">

              {/* AGENDAMENTO SELECIONADO */}
              {selectedAppointment && (
                <div className="rounded-xl bg-zinc-100 p-4">
                  <p className="font-medium text-zinc-900">
                    {selectedAppointment.client.name}
                  </p>

                  <p className="mt-1 text-sm text-zinc-600">
                    {selectedAppointment.service.name}
                    {' · '}
                    {selectedAppointment.employee.name}
                  </p>

                  <p className="mt-1 text-sm text-zinc-500">
                    {formatDateTime(
                      selectedAppointment.startsAt,
                      timezone,
                    )}
                  </p>
                </div>
              )}

              {/* ERRO NO HISTÓRICO */}
              {historyError && (
                <div
                  role="alert"
                  className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
                >
                  {historyError}
                </div>
              )}

              {loadingHistory ? (
                <p className="text-sm text-zinc-500">
                  Carregando histórico...
                </p>
              ) : history.length === 0 && !historyError ? (
                <p className="text-sm text-zinc-500">
                  Nenhuma alteração registrada para este
                  agendamento.
                </p>
              ) : (
                <div className="space-y-4">
                  {history.map((event) => (
                    <article
                      key={event.id}
                      className="rounded-xl border border-zinc-200 p-4"
                    >
                      {/* AÇÃO, RESPONSÁVEL E DATA */}
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h4 className="font-semibold text-zinc-900">
                            {actionLabels[event.action] ??
                              event.action}
                          </h4>

                          <p className="mt-1 text-sm text-zinc-600">
                            {getActorLabel(event)}
                          </p>
                        </div>

                        <time className="text-sm text-zinc-500">
                          {formatDateTime(
                            event.createdAt,
                            timezone,
                          )}
                        </time>
                      </div>

                      <div className="mt-4 grid gap-3 md:grid-cols-2">

                        {/* VALORES ANTERIORES */}
                        <div className="rounded-lg bg-zinc-50 p-3">
                          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                            Antes
                          </p>

                          {event.before &&
                          Object.keys(event.before).length > 0 ? (
                            Object.entries(event.before).map(
                              ([field, value]) => (
                                <p
                                  key={field}
                                  className="mb-2 text-sm text-zinc-700"
                                >
                                  <span className="font-medium">
                                    {fieldLabels[field] ?? field}:
                                  </span>{' '}

                                  <span className="break-words">
                                    {formatAuditValue(
                                      field,
                                      value,
                                      timezone,
                                      resourceNames,
                                      selectedAppointment,
                                    )}
                                  </span>
                                </p>
                              ),
                            )
                          ) : (
                            <p className="text-sm text-zinc-500">
                              Sem estado anterior
                            </p>
                          )}
                        </div>

                        {/* VALORES POSTERIORES */}
                        <div className="rounded-lg bg-zinc-50 p-3">
                          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                            Depois
                          </p>

                          {event.after &&
                          Object.keys(event.after).length > 0 ? (
                            Object.entries(event.after).map(
                              ([field, value]) => (
                                <p
                                  key={field}
                                  className="mb-2 text-sm text-zinc-700"
                                >
                                  <span className="font-medium">
                                    {fieldLabels[field] ?? field}:
                                  </span>{' '}

                                  <span className="break-words">
                                    {formatAuditValue(
                                      field,
                                      value,
                                      timezone,
                                      resourceNames,
                                      selectedAppointment,
                                    )}
                                  </span>
                                </p>
                              ),
                            )
                          ) : (
                            <p className="text-sm text-zinc-500">
                              Sem estado posterior
                            </p>
                          )}
                        </div>
                      </div>
                    </article>
                  ))}

                  {history.length === 100 && (
                    <p className="text-xs text-zinc-500">
                      Exibindo até 100 eventos mais recentes,
                      conforme o limite atual da API.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </PanelShell>
  );
}
