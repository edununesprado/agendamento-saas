'use client';

import Link from 'next/link';
import {
  FormEvent,
  useEffect,
  useState,
} from 'react';
import {
  useParams,
  useRouter,
} from 'next/navigation';

import { PanelShell } from '@/components/panel-shell';
import { apiFetch } from '@/lib/api';

type DayOfWeek =
  | 'MONDAY'
  | 'TUESDAY'
  | 'WEDNESDAY'
  | 'THURSDAY'
  | 'FRIDAY'
  | 'SATURDAY'
  | 'SUNDAY';

type Employee = {
  id: string;
  name: string;
  active: boolean;
};

type AvailabilityRule = {
  id: string;
  dayOfWeek: DayOfWeek;
  start: string;
  end: string;
};

type Interval = {
  start: string;
  end: string;
};

type DaySchedule = {
  dayOfWeek: DayOfWeek;
  label: string;
  enabled: boolean;
  intervals: Interval[];
};

type BlockedTime = {
  id: string;
  startsAt: string;
  endsAt: string;
  reason?: string | null;
};

type CurrentUser = {
  tenant: {
    id: string;
    name: string;
    slug: string;
    timezone?: string;
  };
};

const dayLabels: Record<
  DayOfWeek,
  string
> = {
  MONDAY: 'Segunda-feira',
  TUESDAY: 'Terça-feira',
  WEDNESDAY: 'Quarta-feira',
  THURSDAY: 'Quinta-feira',
  FRIDAY: 'Sexta-feira',
  SATURDAY: 'Sábado',
  SUNDAY: 'Domingo',
};

const dayOrder: DayOfWeek[] = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
];

function createEmptySchedule(): DaySchedule[] {
  return dayOrder.map(
    (dayOfWeek) => ({
      dayOfWeek,
      label:
        dayLabels[dayOfWeek],
      enabled: false,
      intervals: [
        {
          start: '08:00',
          end: '18:00',
        },
      ],
    }),
  );
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

    throw new Error(message);
  }

  return data as T;
}

function zonedLocalToIso(
  dateTimeLocal: string,
  timezone: string,
) {
  const [date, time] =
    dateTimeLocal.split('T');

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

  return new Date(
    Date.UTC(
      year,
      month - 1,
      day,
      hour,
      minute,
      0,
    ) - offset,
  ).toISOString();
}

function formatBlockedDate(
  value: string,
  timezone: string,
) {
  return new Intl.DateTimeFormat(
    'pt-BR',
    {
      dateStyle: 'short',
      timeStyle: 'short',
      timeZone: timezone,
    },
  ).format(new Date(value));
}

export default function EmployeeSchedulePage() {
  const router =
    useRouter();

  const params =
    useParams<{
      id: string;
    }>();

  const employeeId =
    params.id;

  const [
    currentUser,
    setCurrentUser,
  ] =
    useState<CurrentUser | null>(
      null,
    );

  const [
    employee,
    setEmployee,
  ] =
    useState<Employee | null>(
      null,
    );

  const [
    schedule,
    setSchedule,
  ] =
    useState<DaySchedule[]>(
      createEmptySchedule(),
    );

  const [
    blockedTimes,
    setBlockedTimes,
  ] =
    useState<BlockedTime[]>(
      [],
    );

  const [
    blockedStart,
    setBlockedStart,
  ] =
    useState('');

  const [
    blockedEnd,
    setBlockedEnd,
  ] =
    useState('');

  const [
    blockedReason,
    setBlockedReason,
  ] =
    useState('');

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const [error, setError] =
    useState('');

  const [success, setSuccess] =
    useState('');

  const timezone =
    currentUser?.tenant
      .timezone ??
    'America/Sao_Paulo';

  function handleLogout() {
    localStorage.removeItem(
      'accessToken',
    );

    localStorage.removeItem(
      'currentUser',
    );

    router.replace('/login');
  }

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

        setCurrentUser(parsed);

        const [
          employeeResponse,
          availabilityResponse,
          blockedResponse,
        ] =
          await Promise.all([
            apiFetch(
              `/employees/${employeeId}`,
            ),

            apiFetch(
              `/employees/${employeeId}/availability`,
            ),

            apiFetch(
              `/employees/${employeeId}/blocked-times`,
            ),
          ]);

        if (
          employeeResponse.status ===
            401 ||
          availabilityResponse.status ===
            401 ||
          blockedResponse.status ===
            401
        ) {
          handleLogout();
          return;
        }

        const employeeData =
          await readResponse<Employee>(
            employeeResponse,
          );

        const availabilityData =
          await readResponse<
            AvailabilityRule[]
          >(
            availabilityResponse,
          );

        const blockedData =
          await readResponse<
            BlockedTime[]
          >(blockedResponse);

        setEmployee(
          employeeData,
        );

        setBlockedTimes(
          blockedData,
        );

        const grouped =
          createEmptySchedule();

        for (
          const rule of availabilityData
        ) {
          const day =
            grouped.find(
              (item) =>
                item.dayOfWeek ===
                rule.dayOfWeek,
            );

          if (!day) {
            continue;
          }

          if (!day.enabled) {
            day.enabled = true;
            day.intervals = [];
          }

          day.intervals.push({
            start: rule.start,
            end: rule.end,
          });
        }

        setSchedule(grouped);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : 'Erro ao carregar horários',
        );
      } finally {
        setLoading(false);
      }
    }

    initialize();
  }, [employeeId, router]);

  function toggleDay(
    dayOfWeek: DayOfWeek,
  ) {
    setSchedule(
      (current) =>
        current.map((day) =>
          day.dayOfWeek ===
          dayOfWeek
            ? {
                ...day,
                enabled:
                  !day.enabled,

                intervals:
                  day.intervals
                    .length >
                  0
                    ? day.intervals
                    : [
                        {
                          start:
                            '08:00',
                          end: '18:00',
                        },
                      ],
              }
            : day,
        ),
    );
  }

  function updateInterval(
    dayOfWeek: DayOfWeek,
    index: number,
    field:
      | 'start'
      | 'end',
    value: string,
  ) {
    setSchedule(
      (current) =>
        current.map((day) => {
          if (
            day.dayOfWeek !==
            dayOfWeek
          ) {
            return day;
          }

          return {
            ...day,

            intervals:
              day.intervals.map(
                (
                  interval,
                  intervalIndex,
                ) =>
                  intervalIndex ===
                  index
                    ? {
                        ...interval,
                        [field]:
                          value,
                      }
                    : interval,
              ),
          };
        }),
    );
  }

  function addInterval(
    dayOfWeek: DayOfWeek,
  ) {
    setSchedule(
      (current) =>
        current.map((day) =>
          day.dayOfWeek ===
          dayOfWeek
            ? {
                ...day,

                intervals: [
                  ...day.intervals,
                  {
                    start:
                      '13:00',
                    end: '18:00',
                  },
                ],
              }
            : day,
        ),
    );
  }

  function removeInterval(
    dayOfWeek: DayOfWeek,
    index: number,
  ) {
    setSchedule(
      (current) =>
        current.map((day) => {
          if (
            day.dayOfWeek !==
            dayOfWeek
          ) {
            return day;
          }

          return {
            ...day,

            intervals:
              day.intervals.filter(
                (
                  _,
                  intervalIndex,
                ) =>
                  intervalIndex !==
                  index,
              ),
          };
        }),
    );
  }

  async function saveSchedule() {
    try {
      setSaving(true);
      setError('');
      setSuccess('');

      const response =
        await apiFetch(
          `/employees/${employeeId}/availability`,
          {
            method: 'PUT',

            body: JSON.stringify({
              days:
                schedule.map(
                  (day) => ({
                    dayOfWeek:
                      day.dayOfWeek,

                    intervals:
                      day.enabled
                        ? day.intervals
                        : [],
                  }),
                ),
            }),
          },
        );

      await readResponse(
        response,
      );

      setSuccess(
        'Jornada atualizada com sucesso.',
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Erro ao salvar jornada',
      );
    } finally {
      setSaving(false);
    }
  }

  async function loadBlockedTimes() {
    const response =
      await apiFetch(
        `/employees/${employeeId}/blocked-times`,
      );

    const data =
      await readResponse<
        BlockedTime[]
      >(response);

    setBlockedTimes(data);
  }

  async function createBlockedTime(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (
      !blockedStart ||
      !blockedEnd
    ) {
      setError(
        'Informe o início e o fim do bloqueio.',
      );

      return;
    }

    try {
      setSaving(true);
      setError('');
      setSuccess('');

      const startsAt =
        zonedLocalToIso(
          blockedStart,
          timezone,
        );

      const endsAt =
        zonedLocalToIso(
          blockedEnd,
          timezone,
        );

      const response =
        await apiFetch(
          `/employees/${employeeId}/blocked-times`,
          {
            method: 'POST',

            body: JSON.stringify({
              startsAt,
              endsAt,

              reason:
                blockedReason
                  .trim() ||
                undefined,
            }),
          },
        );

      await readResponse(
        response,
      );

      setBlockedStart('');
      setBlockedEnd('');
      setBlockedReason('');

      setSuccess(
        'Bloqueio criado com sucesso.',
      );

      await loadBlockedTimes();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Erro ao criar bloqueio',
      );
    } finally {
      setSaving(false);
    }
  }

  async function deleteBlockedTime(
    blockedTime: BlockedTime,
  ) {
    const confirmed =
      window.confirm(
        'Deseja remover este bloqueio?',
      );

    if (!confirmed) {
      return;
    }

    try {
      setError('');
      setSuccess('');

      const response =
        await apiFetch(
          `/employees/${employeeId}/blocked-times/${blockedTime.id}`,
          {
            method: 'DELETE',
          },
        );

      await readResponse(
        response,
      );

      setSuccess(
        'Bloqueio removido com sucesso.',
      );

      await loadBlockedTimes();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Erro ao remover bloqueio',
      );
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-100">
        <p className="text-zinc-500">
          Carregando horários...
        </p>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-100">
      <div className="flex min-h-screen">

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
            <Link
              href="/dashboard"
              className="block rounded-lg px-4 py-3 text-sm text-zinc-300 hover:bg-zinc-900"
            >
              Dashboard
            </Link>

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

            <Link
              href="/servicos"
              className="block rounded-lg px-4 py-3 text-sm text-zinc-300 hover:bg-zinc-900"
            >
              Serviços
            </Link>
          </nav>

          <div className="mt-auto border-t border-zinc-800 p-4">
            <button
              onClick={
                handleLogout
              }
              className="w-full rounded-lg bg-red-600 px-4 py-3 text-sm font-medium text-white hover:bg-red-700"
            >
              Sair
            </button>
          </div>
        </aside>

        <main className="min-w-0 flex-1">

          <header className="border-b border-zinc-200 bg-white px-6 py-5">

            <h2 className="text-xl font-semibold text-zinc-900">
              {currentUser
                ?.tenant.name}
            </h2>

            <p className="text-sm text-zinc-500">
              Horários do profissional
            </p>
          </header>

          <div className="p-4 md:p-6">

            <div className="mb-6">

              <Link
                href="/funcionarios"
                className="text-sm font-medium text-blue-600 hover:underline"
              >
                ← Voltar para funcionários
              </Link>

              <h1 className="mt-4 text-2xl font-bold text-zinc-900">
                {employee?.name}
              </h1>

              <p className="mt-1 text-sm text-zinc-500">
                Configure a jornada semanal e períodos indisponíveis.
              </p>
            </div>

            {error && (
              <div className="mb-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            {success && (
              <div className="mb-5 rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">
                {success}
              </div>
            )}

            {/* JORNADA */}
            <section className="rounded-2xl bg-white p-6 shadow-sm">

              <div>
                <h2 className="text-lg font-semibold text-zinc-900">
                  Jornada semanal
                </h2>

                <p className="mt-1 text-sm text-zinc-500">
                  Defina os horários em que o profissional atende.
                </p>
              </div>

              <div className="mt-6 space-y-4">
                {schedule.map(
                  (day) => (
                    <div
                      key={
                        day.dayOfWeek
                      }
                      className="rounded-xl border border-zinc-200 p-4"
                    >

                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">

                        <label className="flex min-w-44 items-center gap-3">

                          <input
                            type="checkbox"
                            checked={
                              day.enabled
                            }
                            onChange={() =>
                              toggleDay(
                                day.dayOfWeek,
                              )
                            }
                            className="h-4 w-4"
                          />

                          <span className="font-medium text-zinc-900">
                            {day.label}
                          </span>
                        </label>

                        {day.enabled ? (
                          <div className="flex-1 space-y-3">

                            {day.intervals.map(
                              (
                                interval,
                                index,
                              ) => (
                                <div
                                  key={
                                    index
                                  }
                                  className="flex flex-wrap items-center gap-3"
                                >

                                  <input
                                    type="time"
                                    value={
                                      interval.start
                                    }
                                    onChange={(
                                      event,
                                    ) =>
                                      updateInterval(
                                        day.dayOfWeek,
                                        index,
                                        'start',
                                        event.target.value,
                                      )
                                    }
                                    className="rounded-lg border border-zinc-300 px-3 py-2"
                                  />

                                  <span className="text-sm text-zinc-500">
                                    até
                                  </span>

                                  <input
                                    type="time"
                                    value={
                                      interval.end
                                    }
                                    onChange={(
                                      event,
                                    ) =>
                                      updateInterval(
                                        day.dayOfWeek,
                                        index,
                                        'end',
                                        event.target.value,
                                      )
                                    }
                                    className="rounded-lg border border-zinc-300 px-3 py-2"
                                  />

                                  {day.intervals.length >
                                    1 && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        removeInterval(
                                          day.dayOfWeek,
                                          index,
                                        )
                                      }
                                      className="rounded-lg border border-red-300 px-3 py-2 text-xs font-medium text-red-700"
                                    >
                                      Remover
                                    </button>
                                  )}
                                </div>
                              ),
                            )}

                            <button
                              type="button"
                              onClick={() =>
                                addInterval(
                                  day.dayOfWeek,
                                )
                              }
                              className="text-sm font-medium text-blue-600 hover:underline"
                            >
                              + Adicionar intervalo
                            </button>
                          </div>
                        ) : (
                          <p className="text-sm text-zinc-400">
                            Não trabalha neste dia
                          </p>
                        )}
                      </div>
                    </div>
                  ),
                )}
              </div>

              <button
                onClick={
                  saveSchedule
                }
                disabled={saving}
                className="mt-6 rounded-lg bg-green-600 px-6 py-3 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
              >
                {saving
                  ? 'Salvando...'
                  : 'Salvar jornada'}
              </button>
            </section>

            {/* BLOQUEIOS */}
            <section className="mt-6 rounded-2xl bg-white p-6 shadow-sm">

              <h2 className="text-lg font-semibold text-zinc-900">
                Bloqueios de agenda
              </h2>

              <p className="mt-1 text-sm text-zinc-500">
                Use para folgas, consultas, almoço especial ou outros períodos indisponíveis.
              </p>

              <form
                onSubmit={
                  createBlockedTime
                }
                className="mt-6 grid gap-4 lg:grid-cols-2"
              >

                <div>
                  <label className="mb-2 block text-sm font-medium text-zinc-700">
                    Início
                  </label>

                  <input
                    type="datetime-local"
                    value={
                      blockedStart
                    }
                    onChange={(
                      event,
                    ) =>
                      setBlockedStart(
                        event.target.value,
                      )
                    }
                    className="w-full rounded-lg border border-zinc-300 px-4 py-3"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-zinc-700">
                    Fim
                  </label>

                  <input
                    type="datetime-local"
                    value={
                      blockedEnd
                    }
                    onChange={(
                      event,
                    ) =>
                      setBlockedEnd(
                        event.target.value,
                      )
                    }
                    className="w-full rounded-lg border border-zinc-300 px-4 py-3"
                  />
                </div>

                <div className="lg:col-span-2">
                  <label className="mb-2 block text-sm font-medium text-zinc-700">
                    Motivo
                  </label>

                  <input
                    value={
                      blockedReason
                    }
                    onChange={(
                      event,
                    ) =>
                      setBlockedReason(
                        event.target.value,
                      )
                    }
                    placeholder="Ex: Consulta médica"
                    className="w-full rounded-lg border border-zinc-300 px-4 py-3"
                  />
                </div>

                <div className="lg:col-span-2">
                  <button
                    type="submit"
                    disabled={saving}
                    className="rounded-lg bg-zinc-900 px-6 py-3 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
                  >
                    Criar bloqueio
                  </button>
                </div>
              </form>

              <div className="mt-8">

                <h3 className="font-semibold text-zinc-900">
                  Bloqueios cadastrados
                </h3>

                {blockedTimes.length ===
                0 ? (
                  <div className="mt-4 rounded-xl bg-zinc-50 p-6 text-center text-sm text-zinc-500">
                    Nenhum bloqueio cadastrado.
                  </div>
                ) : (
                  <div className="mt-4 space-y-3">

                    {blockedTimes.map(
                      (
                        blockedTime,
                      ) => (
                        <div
                          key={
                            blockedTime.id
                          }
                          className="flex flex-col gap-3 rounded-xl border border-zinc-200 p-4 sm:flex-row sm:items-center sm:justify-between"
                        >

                          <div>
                            <p className="font-medium text-zinc-900">
                              {formatBlockedDate(
                                blockedTime.startsAt,
                                timezone,
                              )}
                              {' → '}
                              {formatBlockedDate(
                                blockedTime.endsAt,
                                timezone,
                              )}
                            </p>

                            <p className="mt-1 text-sm text-zinc-500">
                              {blockedTime.reason ||
                                'Sem motivo informado'}
                            </p>
                          </div>

                          <button
                            onClick={() =>
                              deleteBlockedTime(
                                blockedTime,
                              )
                            }
                            className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
                          >
                            Remover
                          </button>
                        </div>
                      ),
                    )}
                  </div>
                )}
              </div>
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}