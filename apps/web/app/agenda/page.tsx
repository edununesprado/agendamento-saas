'use client';

import {
  FormEvent,
  useEffect,
  useState,
} from 'react';
import { useRouter } from 'next/navigation';

import { apiFetch } from '@/lib/api';
import { PanelShell } from '@/components/panel-shell';

type Role =
  | 'OWNER'
  | 'ADMIN'
  | 'RECEPTIONIST'
  | 'STAFF';

type Employee = {
  id: string;
  name: string;
};

type Client = {
  id: string;
  name: string;
  phone?: string | null;
};

type Service = {
  id: string;
  name: string;
  durationMin: number;
  priceCents: number;
};

type Appointment = {
  id: string;

  employeeId: string;
  serviceId: string;
  clientId: string;

  startsAt: string;
  endsAt: string;

  durationMin: number;
  priceCents: number;

  status:
    | 'PENDING'
    | 'CONFIRMED'
    | 'COMPLETED'
    | 'CANCELED'
    | 'NO_SHOW';

  notes?: string | null;

  employee: Employee;
  service: Service;
  client: Client;
};

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
    timezone?: string;
  };

  membership: {
    id: string;
    role: Role;
  };
};

type AvailabilityResponse = {
  slots: string[];
};

function formatDateInput(
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
  cents: number,
) {
  return new Intl.NumberFormat(
    'pt-BR',
    {
      style: 'currency',
      currency: 'BRL',
    },
  ).format(cents / 100);
}

function formatTime(
  value: string,
  timezone: string,
) {
  return new Intl.DateTimeFormat(
    'pt-BR',
    {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: timezone,
    },
  ).format(
    new Date(value),
  );
}

function zonedLocalToIso(
  date: string,
  time: string,
  timezone: string,
) {
  const [
    year,
    month,
    day,
  ] =
    date
      .split('-')
      .map(Number);

  const [
    hour,
    minute,
  ] =
    time
      .split(':')
      .map(Number);

  const utcGuess =
    new Date(
      Date.UTC(
        year,
        month - 1,
        day,
        hour,
        minute,
        0,
      ),
    );

  const formatter =
    new Intl.DateTimeFormat(
      'en-US',
      {
        timeZone: timezone,

        year: 'numeric',
        month: '2-digit',
        day: '2-digit',

        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',

        hourCycle: 'h23',
      },
    );

  const parts =
    formatter.formatToParts(
      utcGuess,
    );

  const values =
    Object.fromEntries(
      parts
        .filter(
          (part) =>
            part.type !==
            'literal',
        )
        .map((part) => [
          part.type,
          part.value,
        ]),
    );

  const localAsUtc =
    Date.UTC(
      Number(values.year),
      Number(values.month) - 1,
      Number(values.day),
      Number(values.hour),
      Number(values.minute),
      Number(values.second),
    );

  const offset =
    localAsUtc -
    utcGuess.getTime();

  const actualUtc =
    new Date(
      Date.UTC(
        year,
        month - 1,
        day,
        hour,
        minute,
        0,
      ) - offset,
    );

  return actualUtc.toISOString();
}

async function readResponse<T>(
  response: Response,
) {
  const data =
    await response.json();

  if (!response.ok) {
    const message =
      Array.isArray(
        data?.message,
      )
        ? data.message.join(
            ', ',
          )
        : data?.message ??
          'Erro na requisição';

    throw new Error(
      message,
    );
  }

  return data as T;
}

function getStatusLabel(
  status: Appointment['status'],
) {
  switch (status) {
    case 'PENDING':
      return 'Pendente';

    case 'CONFIRMED':
      return 'Confirmado';

    case 'COMPLETED':
      return 'Concluído';

    case 'CANCELED':
      return 'Cancelado';

    case 'NO_SHOW':
      return 'Não compareceu';
  }
}

function getStatusClass(
  status: Appointment['status'],
) {
  switch (status) {
    case 'PENDING':
      return 'bg-yellow-100 text-yellow-800';

    case 'CONFIRMED':
      return 'bg-blue-100 text-blue-800';

    case 'COMPLETED':
      return 'bg-green-100 text-green-800';

    case 'CANCELED':
      return 'bg-red-100 text-red-800';

    case 'NO_SHOW':
      return 'bg-zinc-200 text-zinc-700';
  }
}

export default function AgendaPage() {
  const router =
    useRouter();

  const [
    currentUser,
    setCurrentUser,
  ] =
    useState<CurrentUser | null>(
      null,
    );

  const [
    timezone,
    setTimezone,
  ] =
    useState(
      'America/Sao_Paulo',
    );

  const [
    date,
    setDate,
  ] =
    useState(() =>
      formatDateInput(
        new Date(),
      ),
    );

  const [
    appointments,
    setAppointments,
  ] =
    useState<Appointment[]>(
      [],
    );

  const [
    employees,
    setEmployees,
  ] =
    useState<Employee[]>([]);

  const [
    clients,
    setClients,
  ] =
    useState<Client[]>([]);

  const [
    services,
    setServices,
  ] =
    useState<Service[]>([]);

  const [
    slots,
    setSlots,
  ] =
    useState<string[]>([]);

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    agendaLoading,
    setAgendaLoading,
  ] =
    useState(false);

  const [
    error,
    setError,
  ] =
    useState('');

  const [
    success,
    setSuccess,
  ] =
    useState('');

  const [
    showCreate,
    setShowCreate,
  ] =
    useState(false);

  const [
    employeeId,
    setEmployeeId,
  ] =
    useState('');

  const [
    serviceId,
    setServiceId,
  ] =
    useState('');

  const [
    clientId,
    setClientId,
  ] =
    useState('');

  const [
    selectedSlot,
    setSelectedSlot,
  ] =
    useState('');

  const [
    notes,
    setNotes,
  ] =
    useState('');

  const [
    saving,
    setSaving,
  ] =
    useState(false);

  // Reagendamento
  const [
    rescheduleAppointment,
    setRescheduleAppointment,
  ] =
    useState<Appointment | null>(
      null,
    );

  const [
    rescheduleDate,
    setRescheduleDate,
  ] =
    useState('');

  const [
    rescheduleSlots,
    setRescheduleSlots,
  ] =
    useState<string[]>([]);

  const [
    rescheduleSlot,
    setRescheduleSlot,
  ] =
    useState('');

  /**
   * OWNER, ADMIN e RECEPTIONIST
   * podem gerenciar a agenda.
   *
   * STAFF fica somente com leitura.
   */
  const canManageAppointments =
    currentUser?.membership.role ===
      'OWNER' ||
    currentUser?.membership.role ===
      'ADMIN' ||
    currentUser?.membership.role ===
      'RECEPTIONIST';

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
          ) as CurrentUser;

        setCurrentUser(
          parsed,
        );

        setTimezone(
          parsed.tenant
            .timezone ??
            'America/Sao_Paulo',
        );

        const [
          employeesResponse,
          clientsResponse,
        ] =
          await Promise.all([
            apiFetch(
              '/employees',
            ),

            apiFetch(
              '/clients',
            ),
          ]);

        if (
          employeesResponse.status ===
            401 ||
          clientsResponse.status ===
            401
        ) {
          handleLogout();
          return;
        }

        const employeesData =
          await readResponse<
            Employee[]
          >(
            employeesResponse,
          );

        const clientsData =
          await readResponse<
            Client[]
          >(
            clientsResponse,
          );

        setEmployees(
          employeesData,
        );

        setClients(
          clientsData,
        );

        await loadAgenda(
          date,
        );
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : 'Erro ao carregar agenda',
        );
      } finally {
        setLoading(false);
      }
    }

    initialize();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!loading) {
      loadAgenda(
        date,
      );
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  useEffect(() => {
    if (!employeeId) {
      setServices([]);
      setServiceId('');
      setSlots([]);

      return;
    }

    loadEmployeeServices(
      employeeId,
    );

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeId]);

  useEffect(() => {
    if (
      employeeId &&
      serviceId
    ) {
      loadSlots(
        employeeId,
        serviceId,
        date,
      );
    } else {
      setSlots([]);
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    employeeId,
    serviceId,
    date,
  ]);

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

  async function loadAgenda(
    targetDate: string,
  ) {
    try {
      setAgendaLoading(
        true,
      );

      setError('');

      const response =
        await apiFetch(
          `/appointments?date=${targetDate}`,
        );

      if (
        response.status ===
        401
      ) {
        handleLogout();
        return;
      }

      const data =
        await readResponse<
          Appointment[]
        >(response);

      setAppointments(
        data,
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Erro ao carregar agendamentos',
      );
    } finally {
      setAgendaLoading(
        false,
      );
    }
  }

  async function loadEmployeeServices(
    selectedEmployeeId: string,
  ) {
    try {
      setServiceId('');
      setServices([]);
      setSlots([]);

      const response =
        await apiFetch(
          `/employees/${selectedEmployeeId}/services`,
        );

      const data =
        await readResponse<
          Array<
            | Service
            | {
                service: Service;
              }
          >
        >(response);

      const normalized =
        data.map(
          (item) => {
            if (
              'service' in
              item
            ) {
              return item.service;
            }

            return item;
          },
        );

      setServices(
        normalized,
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Erro ao carregar serviços',
      );
    }
  }

  async function loadSlots(
    selectedEmployeeId: string,
    selectedServiceId: string,
    targetDate: string,
  ) {
    try {
      setSelectedSlot('');
      setSlots([]);

      const params =
        new URLSearchParams({
          employeeId:
            selectedEmployeeId,

          serviceId:
            selectedServiceId,

          date:
            targetDate,
        });

      const response =
        await apiFetch(
          `/availability?${params.toString()}`,
        );

      const data =
        await readResponse<
          AvailabilityResponse
        >(response);

      setSlots(
        data.slots,
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Erro ao carregar horários',
      );
    }
  }

  async function handleCreate(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (
      !canManageAppointments
    ) {
      setError(
        'Você não possui permissão para criar agendamentos.',
      );

      return;
    }

    setError('');
    setSuccess('');

    if (
      !employeeId ||
      !serviceId ||
      !clientId ||
      !selectedSlot
    ) {
      setError(
        'Preencha funcionário, serviço, cliente e horário.',
      );

      return;
    }

    try {
      setSaving(true);

      const startsAt =
        zonedLocalToIso(
          date,
          selectedSlot,
          timezone,
        );

      const response =
        await apiFetch(
          '/appointments',
          {
            method:
              'POST',

            body:
              JSON.stringify({
                employeeId,
                serviceId,
                clientId,
                startsAt,

                notes:
                  notes.trim() ||
                  undefined,
              }),
          },
        );

      await readResponse<Appointment>(
        response,
      );

      setSuccess(
        'Agendamento criado com sucesso.',
      );

      setSelectedSlot('');
      setClientId('');
      setNotes('');

      await loadAgenda(
        date,
      );

      await loadSlots(
        employeeId,
        serviceId,
        date,
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Erro ao criar agendamento',
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleCancel(
    appointment: Appointment,
  ) {
    if (
      !canManageAppointments
    ) {
      setError(
        'Você não possui permissão para cancelar agendamentos.',
      );

      return;
    }

    const confirmed =
      window.confirm(
        `Deseja cancelar o agendamento de ${appointment.client.name}?`,
      );

    if (!confirmed) {
      return;
    }

    const reason =
      window.prompt(
        'Motivo do cancelamento (opcional):',
      );

    try {
      setError('');
      setSuccess('');

      const response =
        await apiFetch(
          `/appointments/${appointment.id}/cancel`,
          {
            method:
              'PATCH',

            body:
              JSON.stringify({
                reason:
                  reason?.trim() ||
                  undefined,
              }),
          },
        );

      await readResponse<Appointment>(
        response,
      );

      setSuccess(
        'Agendamento cancelado.',
      );

      await loadAgenda(
        date,
      );

      if (
        employeeId &&
        serviceId
      ) {
        await loadSlots(
          employeeId,
          serviceId,
          date,
        );
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Erro ao cancelar agendamento',
      );
    }
  }

  async function openReschedule(
    appointment: Appointment,
  ) {
    if (
      !canManageAppointments
    ) {
      setError(
        'Você não possui permissão para reagendar atendimentos.',
      );

      return;
    }

    setError('');
    setSuccess('');

    setRescheduleAppointment(
      appointment,
    );

    setRescheduleDate(
      date,
    );

    setRescheduleSlot('');

    await loadRescheduleSlots(
      appointment,
      date,
    );
  }

  async function loadRescheduleSlots(
    appointment: Appointment,
    targetDate: string,
  ) {
    try {
      setRescheduleSlots(
        [],
      );

      setRescheduleSlot(
        '',
      );

      const params =
        new URLSearchParams({
          employeeId:
            appointment.employeeId,

          serviceId:
            appointment.serviceId,

          date:
            targetDate,
        });

      const response =
        await apiFetch(
          `/availability?${params.toString()}`,
        );

      const data =
        await readResponse<
          AvailabilityResponse
        >(response);

      setRescheduleSlots(
        data.slots,
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Erro ao carregar novos horários',
      );
    }
  }

  async function handleReschedule() {
    if (
      !canManageAppointments
    ) {
      setError(
        'Você não possui permissão para reagendar atendimentos.',
      );

      return;
    }

    if (
      !rescheduleAppointment ||
      !rescheduleDate ||
      !rescheduleSlot
    ) {
      setError(
        'Selecione a nova data e o novo horário.',
      );

      return;
    }

    try {
      setSaving(true);
      setError('');
      setSuccess('');

      const startsAt =
        zonedLocalToIso(
          rescheduleDate,
          rescheduleSlot,
          timezone,
        );

      const response =
        await apiFetch(
          `/appointments/${rescheduleAppointment.id}/reschedule`,
          {
            method:
              'PATCH',

            body:
              JSON.stringify({
                startsAt,
              }),
          },
        );

      await readResponse<Appointment>(
        response,
      );

      setSuccess(
        'Agendamento reagendado com sucesso.',
      );

      setRescheduleAppointment(
        null,
      );

      setRescheduleSlot('');

      setDate(
        rescheduleDate,
      );

      await loadAgenda(
        rescheduleDate,
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Erro ao reagendar',
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-100">

        <p className="text-zinc-500">
          Carregando agenda...
        </p>
      </main>
    );
  }

  return (
    <PanelShell
      title="Agenda"
      subtitle="Gerenciamento de horários e atendimentos"
    >
      {/* CABEÇALHO */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">

        <div>
          <p className="text-sm text-zinc-500">
            {canManageAppointments
              ? 'Consulte, crie, cancele e reagende os atendimentos.'
              : 'Consulte os atendimentos da agenda.'}
          </p>

          {!canManageAppointments && (
            <p className="mt-1 text-xs text-zinc-400">
              Seu perfil possui acesso somente para visualização.
            </p>
          )}
        </div>

        {canManageAppointments && (
          <button
            onClick={() => {
              setShowCreate(
                (value) =>
                  !value,
              );

              setError('');
              setSuccess('');
            }}
            className="rounded-lg bg-zinc-900 px-5 py-3 text-sm font-medium text-white hover:bg-zinc-800"
          >
            {showCreate
              ? 'Fechar'
              : '+ Novo agendamento'}
          </button>
        )}
      </div>

      {/* MENSAGENS */}
      {error && (
        <div className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {success && (
        <div className="mt-5 rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">
          {success}
        </div>
      )}

      {/* NOVO AGENDAMENTO */}
      {showCreate &&
        canManageAppointments && (
          <section className="mt-6 rounded-2xl bg-white p-6 shadow-sm">

            <h2 className="text-lg font-semibold text-zinc-900">
              Novo agendamento
            </h2>

            <p className="mt-1 text-sm text-zinc-500">
              Data selecionada:{' '}
              {date}
            </p>

            <form
              onSubmit={
                handleCreate
              }
              className="mt-6 grid gap-5 md:grid-cols-2"
            >

              <div>
                <label className="mb-2 block text-sm font-medium text-zinc-700">
                  Funcionário
                </label>

                <select
                  value={
                    employeeId
                  }
                  onChange={(
                    event,
                  ) =>
                    setEmployeeId(
                      event.target
                        .value,
                    )
                  }
                  className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-3"
                >
                  <option value="">
                    Selecione
                  </option>

                  {employees.map(
                    (employee) => (
                      <option
                        key={
                          employee.id
                        }
                        value={
                          employee.id
                        }
                      >
                        {
                          employee.name
                        }
                      </option>
                    ),
                  )}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-zinc-700">
                  Serviço
                </label>

                <select
                  value={
                    serviceId
                  }
                  onChange={(
                    event,
                  ) =>
                    setServiceId(
                      event.target
                        .value,
                    )
                  }
                  disabled={
                    !employeeId
                  }
                  className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 disabled:bg-zinc-100"
                >
                  <option value="">
                    Selecione
                  </option>

                  {services.map(
                    (service) => (
                      <option
                        key={
                          service.id
                        }
                        value={
                          service.id
                        }
                      >
                        {
                          service.name
                        }{' '}
                        -{' '}
                        {formatCurrency(
                          service.priceCents,
                        )}
                      </option>
                    ),
                  )}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-zinc-700">
                  Cliente
                </label>

                <select
                  value={
                    clientId
                  }
                  onChange={(
                    event,
                  ) =>
                    setClientId(
                      event.target
                        .value,
                    )
                  }
                  className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-3"
                >
                  <option value="">
                    Selecione
                  </option>

                  {clients.map(
                    (client) => (
                      <option
                        key={
                          client.id
                        }
                        value={
                          client.id
                        }
                      >
                        {
                          client.name
                        }
                      </option>
                    ),
                  )}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-zinc-700">
                  Horário
                </label>

                <select
                  value={
                    selectedSlot
                  }
                  onChange={(
                    event,
                  ) =>
                    setSelectedSlot(
                      event.target
                        .value,
                    )
                  }
                  disabled={
                    !serviceId
                  }
                  className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 disabled:bg-zinc-100"
                >
                  <option value="">
                    Selecione
                  </option>

                  {slots.map(
                    (slot) => (
                      <option
                        key={
                          slot
                        }
                        value={
                          slot
                        }
                      >
                        {slot}
                      </option>
                    ),
                  )}
                </select>
              </div>

              <div className="md:col-span-2">

                <label className="mb-2 block text-sm font-medium text-zinc-700">
                  Observações
                </label>

                <textarea
                  value={
                    notes
                  }
                  onChange={(
                    event,
                  ) =>
                    setNotes(
                      event.target
                        .value,
                    )
                  }
                  rows={3}
                  className="w-full rounded-lg border border-zinc-300 px-4 py-3"
                  placeholder="Observações opcionais..."
                />
              </div>

              <div className="md:col-span-2">

                <button
                  type="submit"
                  disabled={
                    saving
                  }
                  className="rounded-lg bg-green-600 px-6 py-3 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
                >
                  {saving
                    ? 'Salvando...'
                    : 'Criar agendamento'}
                </button>
              </div>
            </form>
          </section>
        )}

      {/* REAGENDAMENTO */}
      {rescheduleAppointment &&
        canManageAppointments && (
          <section className="mt-6 rounded-2xl border border-blue-200 bg-blue-50 p-6">

            <div className="flex items-start justify-between gap-4">

              <div>
                <h2 className="text-lg font-semibold text-zinc-900">
                  Reagendar
                </h2>

                <p className="mt-1 text-sm text-zinc-600">
                  {
                    rescheduleAppointment
                      .client.name
                  }

                  {' — '}

                  {
                    rescheduleAppointment
                      .service.name
                  }
                </p>
              </div>

              <button
                onClick={() =>
                  setRescheduleAppointment(
                    null,
                  )
                }
                className="text-sm text-zinc-500"
              >
                Fechar
              </button>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">

              <div>
                <label className="mb-2 block text-sm font-medium text-zinc-700">
                  Nova data
                </label>

                <input
                  type="date"
                  value={
                    rescheduleDate
                  }
                  onChange={async (
                    event,
                  ) => {
                    const value =
                      event.target
                        .value;

                    setRescheduleDate(
                      value,
                    );

                    if (
                      rescheduleAppointment
                    ) {
                      await loadRescheduleSlots(
                        rescheduleAppointment,
                        value,
                      );
                    }
                  }}
                  className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-3"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-zinc-700">
                  Novo horário
                </label>

                <select
                  value={
                    rescheduleSlot
                  }
                  onChange={(
                    event,
                  ) =>
                    setRescheduleSlot(
                      event.target
                        .value,
                    )
                  }
                  className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-3"
                >
                  <option value="">
                    Selecione
                  </option>

                  {rescheduleSlots.map(
                    (slot) => (
                      <option
                        key={
                          slot
                        }
                        value={
                          slot
                        }
                      >
                        {slot}
                      </option>
                    ),
                  )}
                </select>
              </div>
            </div>

            <button
              onClick={
                handleReschedule
              }
              disabled={
                saving
              }
              className="mt-5 rounded-lg bg-blue-600 px-5 py-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
            >
              Confirmar reagendamento
            </button>
          </section>
        )}

      {/* DATA */}
      <section className="mt-6 rounded-2xl bg-white p-5 shadow-sm">

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">

          <div>
            <label className="mb-2 block text-sm font-medium text-zinc-700">
              Data da agenda
            </label>

            <input
              type="date"
              value={
                date
              }
              onChange={(
                event,
              ) =>
                setDate(
                  event.target
                    .value,
                )
              }
              className="rounded-lg border border-zinc-300 bg-white px-4 py-3"
            />
          </div>

          <button
            onClick={() =>
              loadAgenda(
                date,
              )
            }
            className="rounded-lg border border-zinc-300 px-5 py-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Atualizar
          </button>
        </div>
      </section>

      {/* AGENDAMENTOS */}
      <section className="mt-6 rounded-2xl bg-white p-6 shadow-sm">

        <div className="flex items-center justify-between">

          <h2 className="text-lg font-semibold text-zinc-900">
            Atendimentos
          </h2>

          <span className="text-sm text-zinc-500">
            {appointments.length}{' '}
            agendamento(s)
          </span>
        </div>

        {agendaLoading ? (
          <p className="mt-6 text-sm text-zinc-500">
            Carregando...
          </p>
        ) : appointments.length ===
          0 ? (
          <div className="mt-6 rounded-xl bg-zinc-50 p-8 text-center">

            <p className="text-zinc-500">
              Nenhum agendamento para esta data.
            </p>
          </div>
        ) : (
          <div className="mt-5 space-y-3">

            {appointments.map(
              (appointment) => (
                <article
                  key={
                    appointment.id
                  }
                  className="rounded-xl border border-zinc-200 p-4"
                >

                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">

                    <div className="flex gap-4">

                      <div className="min-w-16 rounded-lg bg-zinc-100 px-3 py-2 text-center">

                        <p className="text-lg font-bold text-zinc-900">
                          {formatTime(
                            appointment.startsAt,
                            timezone,
                          )}
                        </p>

                        <p className="text-xs text-zinc-500">
                          até{' '}

                          {formatTime(
                            appointment.endsAt,
                            timezone,
                          )}
                        </p>
                      </div>

                      <div>
                        <div className="flex flex-wrap items-center gap-2">

                          <h3 className="font-semibold text-zinc-900">
                            {
                              appointment
                                .client
                                .name
                            }
                          </h3>

                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-medium ${getStatusClass(
                              appointment.status,
                            )}`}
                          >
                            {getStatusLabel(
                              appointment.status,
                            )}
                          </span>
                        </div>

                        <p className="mt-1 text-sm text-zinc-600">
                          {
                            appointment
                              .service
                              .name
                          }

                          {' • '}

                          {
                            appointment
                              .employee
                              .name
                          }
                        </p>

                        <p className="mt-1 text-sm font-medium text-zinc-800">
                          {formatCurrency(
                            appointment.priceCents,
                          )}
                        </p>

                        {appointment.notes && (
                          <p className="mt-2 text-xs text-zinc-500">
                            {
                              appointment.notes
                            }
                          </p>
                        )}
                      </div>
                    </div>

                    {/* AÇÕES SOMENTE PARA QUEM PODE GERENCIAR */}
                    {canManageAppointments &&
                      (
                        appointment.status ===
                          'CONFIRMED' ||
                        appointment.status ===
                          'PENDING'
                      ) && (
                        <div className="flex flex-wrap gap-2">

                          <button
                            onClick={() =>
                              openReschedule(
                                appointment,
                              )
                            }
                            className="rounded-lg border border-blue-300 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50"
                          >
                            Reagendar
                          </button>

                          <button
                            onClick={() =>
                              handleCancel(
                                appointment,
                              )
                            }
                            className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
                          >
                            Cancelar
                          </button>
                        </div>
                      )}
                  </div>
                </article>
              ),
            )}
          </div>
        )}
      </section>
    </PanelShell>
  );
}