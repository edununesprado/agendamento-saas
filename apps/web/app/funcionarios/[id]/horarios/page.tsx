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

type StoredUser = {
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
      label: dayLabels[dayOfWeek],
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
      Array.isArray(data?.message)
        ? data.message.join(', ')
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
  ).format(
    new Date(value),
  );
}

export default function EmployeeSchedulePage() {
  const router = useRouter();

  const params =
    useParams<{
      id: string;
    }>();

  const employeeId =
    params.id;

  const [
    employee,
    setEmployee,
  ] =
    useState<Employee | null>(
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

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    saving,
    setSaving,
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
        router.replace('/login');
        return;
      }

      try {
        const parsed =
          JSON.parse(
            storedUser,
          ) as StoredUser;

        setTimezone(
          parsed.tenant.timezone ??
            'America/Sao_Paulo',
        );

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

            day.intervals =
              [];
          }

          day.intervals.push({
            start: rule.start,
            end: rule.end,
          });
        }

        setSchedule(
          grouped,
        );
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

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeId]);

  function toggleDay(
    dayOfWeek: DayOfWeek,
  ) {
    setSchedule(
      (current) =>
        current.map(
          (day) => {
            if (
              day.dayOfWeek !==
              dayOfWeek
            ) {
              return day;
            }

            return {
              ...day,

              enabled:
                !day.enabled,

              intervals:
                day.intervals.length >
                0
                  ? day.intervals
                  : [
                      {
                        start:
                          '08:00',
                        end:
                          '18:00',
                      },
                    ],
            };
          },
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
        current.map(
          (day) => {
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
          },
        ),
    );
  }

  function addInterval(
    dayOfWeek: DayOfWeek,
  ) {
    setSchedule(
      (current) =>
        current.map(
          (day) =>
            day.dayOfWeek ===
            dayOfWeek
              ? {
                  ...day,

                  intervals: [
                    ...day.intervals,

                    {
                      start:
                        '13:00',

                      end:
                        '18:00',
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
        current.map(
          (day) => {
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
          },
        ),
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
            method:
              'PUT',

            body:
              JSON.stringify({
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

      if (
        response.status ===
        401
      ) {
        handleLogout();
        return;
      }

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

    if (
      response.status ===
      401
    ) {
      handleLogout();
      return;
    }

    const data =
      await readResponse<
        BlockedTime[]
      >(response);

    setBlockedTimes(
      data,
    );
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
            method:
              'POST',

            body:
              JSON.stringify({
                startsAt,
                endsAt,

                reason:
                  blockedReason
                    .trim() ||
                  undefined,
              }),
          },
        );

      if (
        response.status ===
        401
      ) {
        handleLogout();
        return;
      }

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
            method:
              'DELETE',
          },
        );

      if (
        response.status ===
        401
      ) {
        handleLogout();
        return;
      }

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

        <p className="text-sm text-zinc-500">
          Carregando horários...
        </p>
      </main>
    );
  }

  return (
    <PanelShell
      title={
        employee?.name ??
        'Horários'
      }
      subtitle="Horários do profissional"
    >
      {/* VOLTAR */}
      <div className="mb-6">

        <Link
          href="/funcionarios"
          className="text-sm font-medium text-blue-600 hover:underline"
        >
          ← Voltar para funcionários
        </Link>

        <p className="mt-4 text-sm text-zinc-500">
          Configure a jornada semanal
          e períodos indisponíveis.
        </p>
      </div>

      {/* ERRO */}
      {error && (
        <div className="mb-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* SUCESSO */}
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
            Defina os horários em que o
            profissional atende.
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

                            {day.intervals
                              .length >
                              1 && (
                              <button
                                type="button"
                                onClick={() =>
                                  removeInterval(
                                    day.dayOfWeek,
                                    index,
                                  )
                                }
                                className="rounded-lg border border-red-300 px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-50"
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
          disabled={
            saving
          }
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
          Use para folgas, consultas,
          compromissos ou outros períodos
          indisponíveis.
        </p>

        <form
          onSubmit={
            createBlockedTime
          }
          className="mt-6 grid gap-4 lg:grid-cols-2"
        >

          {/* INÍCIO */}
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

          {/* FIM */}
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

          {/* MOTIVO */}
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
              disabled={
                saving
              }
              className="rounded-lg bg-zinc-900 px-6 py-3 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
            >
              {saving
                ? 'Salvando...'
                : 'Criar bloqueio'}
            </button>
          </div>
        </form>

        {/* BLOQUEIOS CADASTRADOS */}
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
                (blockedTime) => (
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
    </PanelShell>
  );
}