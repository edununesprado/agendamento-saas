'use client';

import {
  FormEvent,
  useEffect,
  useState,
} from 'react';
import { useRouter } from 'next/navigation';

import { PanelShell } from '@/components/panel-shell';
import { apiFetch } from '@/lib/api';

type Tenant = {
  id: string;
  name: string;
  slug: string;

  logoUrl?: string | null;
  primaryColor?: string | null;
  phone?: string | null;
  email?: string | null;

  timezone: string;

  bookingMinAdvanceMinutes: number;
  bookingMaxAdvanceDays: number;

  appointmentRemindersEnabled: boolean;
  appointmentReminderHoursBefore: number;
};

type TenantForm = {
  name: string;
  logoUrl: string;
  primaryColor: string;
  phone: string;
  email: string;
  timezone: string;

  bookingMinAdvanceMinutes: number;
  bookingMaxAdvanceDays: number;

  appointmentRemindersEnabled: boolean;
  appointmentReminderHoursBefore: number;
};

async function readResponse<T>(
  response: Response,
) {
  const data =
    await response
      .json()
      .catch(() => null);

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

export default function SettingsPage() {
  const router =
    useRouter();

  const [
    tenant,
    setTenant,
  ] =
    useState<Tenant | null>(
      null,
    );

  const [
    form,
    setForm,
  ] =
    useState<TenantForm>({
      name:
        '',

      logoUrl:
        '',

      primaryColor:
        '#18181b',

      phone:
        '',

      email:
        '',

      timezone:
        'America/Sao_Paulo',

      bookingMinAdvanceMinutes:
        60,

      bookingMaxAdvanceDays:
        7,

      appointmentRemindersEnabled:
        true,

      appointmentReminderHoursBefore:
        24,
    });

  const [
    loading,
    setLoading,
  ] =
    useState(
      true,
    );

  const [
    saving,
    setSaving,
  ] =
    useState(
      false,
    );

  const [
    error,
    setError,
  ] =
    useState(
      '',
    );

  const [
    success,
    setSuccess,
  ] =
    useState(
      '',
    );

  const [
    publicBookingUrl,
    setPublicBookingUrl,
  ] =
    useState(
      '',
    );

  const [
    copied,
    setCopied,
  ] =
    useState(
      false,
    );

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

  useEffect(() => {
    async function loadTenant() {
      const token =
        localStorage.getItem(
          'accessToken',
        );

      if (!token) {
        router.replace(
          '/login',
        );

        return;
      }

      try {
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

        const data =
          await readResponse<Tenant>(
            response,
          );

        setTenant(
          data,
        );

        setPublicBookingUrl(
          `${window.location.origin}/agendar/${data.slug}`,
        );

        setForm({
          name:
            data.name ??
            '',

          logoUrl:
            data.logoUrl ??
            '',

          primaryColor:
            data.primaryColor ||
            '#18181b',

          phone:
            data.phone ??
            '',

          email:
            data.email ??
            '',

          timezone:
            data.timezone ||
            'America/Sao_Paulo',

          bookingMinAdvanceMinutes:
            data.bookingMinAdvanceMinutes ??
            60,

          bookingMaxAdvanceDays:
            data.bookingMaxAdvanceDays ??
            7,

          appointmentRemindersEnabled:
            data.appointmentRemindersEnabled ??
            true,

          appointmentReminderHoursBefore:
            data.appointmentReminderHoursBefore ??
            24,
        });
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : 'Erro ao carregar empresa',
        );
      } finally {
        setLoading(
          false,
        );
      }
    }

    loadTenant();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCopyPublicLink() {
    if (
      !publicBookingUrl
    ) {
      return;
    }

    try {
      await navigator.clipboard.writeText(
        publicBookingUrl,
      );

      setCopied(
        true,
      );

      window.setTimeout(
        () => {
          setCopied(
            false,
          );
        },
        2000,
      );
    } catch {
      setError(
        'Não foi possível copiar o link automaticamente.',
      );
    }
  }

  function handleOpenPublicPage() {
    if (
      !publicBookingUrl
    ) {
      return;
    }

    window.open(
      publicBookingUrl,
      '_blank',
      'noopener,noreferrer',
    );
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    setError(
      '',
    );

    setSuccess(
      '',
    );

    if (
      !form.name.trim()
    ) {
      setError(
        'Informe o nome da empresa.',
      );

      return;
    }

    if (
      form.bookingMinAdvanceMinutes <
        0 ||
      form.bookingMinAdvanceMinutes >
        1440
    ) {
      setError(
        'A antecedência mínima deve estar entre 0 e 1440 minutos.',
      );

      return;
    }

    if (
      form.bookingMaxAdvanceDays <
        1 ||
      form.bookingMaxAdvanceDays >
        365
    ) {
      setError(
        'O limite da agenda pública deve estar entre 1 e 365 dias.',
      );

      return;
    }

    if (
      form.appointmentReminderHoursBefore <
        1 ||
      form.appointmentReminderHoursBefore >
        168
    ) {
      setError(
        'A antecedência do lembrete deve estar entre 1 e 168 horas.',
      );

      return;
    }

    try {
      setSaving(
        true,
      );

      const response =
        await apiFetch(
          '/tenants/current',
          {
            method:
              'PATCH',

            body:
              JSON.stringify({
                name:
                  form.name.trim(),

                logoUrl:
                  form.logoUrl.trim() ||
                  null,

                primaryColor:
                  form.primaryColor,

                phone:
                  form.phone.trim() ||
                  null,

                email:
                  form.email.trim() ||
                  null,

                timezone:
                  form.timezone,

                bookingMinAdvanceMinutes:
                  form.bookingMinAdvanceMinutes,

                bookingMaxAdvanceDays:
                  form.bookingMaxAdvanceDays,

                appointmentRemindersEnabled:
                  form.appointmentRemindersEnabled,

                appointmentReminderHoursBefore:
                  form.appointmentReminderHoursBefore,
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

      const updated =
        await readResponse<Tenant>(
          response,
        );

      setTenant(
        updated,
      );

      setForm({
        name:
          updated.name ??
          '',

        logoUrl:
          updated.logoUrl ??
          '',

        primaryColor:
          updated.primaryColor ||
          '#18181b',

        phone:
          updated.phone ??
          '',

        email:
          updated.email ??
          '',

        timezone:
          updated.timezone ||
          'America/Sao_Paulo',

        bookingMinAdvanceMinutes:
          updated.bookingMinAdvanceMinutes,

        bookingMaxAdvanceDays:
          updated.bookingMaxAdvanceDays,

        appointmentRemindersEnabled:
          updated.appointmentRemindersEnabled,

        appointmentReminderHoursBefore:
          updated.appointmentReminderHoursBefore,
      });

      const storedUser =
        localStorage.getItem(
          'currentUser',
        );

      if (
        storedUser
      ) {
        const parsed =
          JSON.parse(
            storedUser,
          );

        localStorage.setItem(
          'currentUser',
          JSON.stringify({
            ...parsed,

            tenant:
              updated,
          }),
        );
      }

      setSuccess(
        'Configurações atualizadas com sucesso.',
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Erro ao atualizar empresa',
      );
    } finally {
      setSaving(
        false,
      );
    }
  }

  if (
    loading
  ) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-100">
        <p className="text-sm text-zinc-500">
          Carregando configurações...
        </p>
      </main>
    );
  }

  return (
    <PanelShell
      title="Configurações"
      subtitle="Identidade, agendamento e notificações da empresa"
    >
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

      {tenant && (
        <section className="mb-6 rounded-2xl bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-semibold text-zinc-900">
                Link público de agendamento
              </h2>

              <p className="mt-1 text-sm text-zinc-500">
                Compartilhe este link com seus clientes para que eles possam agendar sem fazer login.
              </p>

              <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3">
                <p className="break-all font-mono text-sm text-zinc-700">
                  {publicBookingUrl}
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={
                  handleCopyPublicLink
                }
                className="rounded-lg border border-zinc-300 bg-white px-5 py-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              >
                {copied
                  ? 'Link copiado!'
                  : 'Copiar link'}
              </button>

              <button
                type="button"
                onClick={
                  handleOpenPublicPage
                }
                className="rounded-lg bg-zinc-900 px-5 py-3 text-sm font-medium text-white hover:bg-zinc-800"
              >
                Abrir página pública
              </button>
            </div>
          </div>

          <p className="mt-3 text-xs text-zinc-400">
            O endereço usa o identificador da empresa:{' '}
            <span className="font-mono">
              {tenant.slug}
            </span>
          </p>
        </section>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <form
          onSubmit={
            handleSubmit
          }
          className="space-y-6"
        >
          {/* DADOS DA EMPRESA */}
          <section className="rounded-2xl bg-white p-6 shadow-sm">
            <div>
              <h2 className="text-lg font-semibold text-zinc-900">
                Dados da empresa
              </h2>

              <p className="mt-1 text-sm text-zinc-500">
                Identidade e informações principais da empresa.
              </p>
            </div>

            <div className="mt-6 grid gap-5 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="mb-2 block text-sm font-medium text-zinc-700">
                  Nome da empresa *
                </label>

                <input
                  value={
                    form.name
                  }
                  onChange={(
                    event,
                  ) =>
                    setForm({
                      ...form,

                      name:
                        event
                          .target
                          .value,
                    })
                  }
                  className="w-full rounded-lg border border-zinc-300 px-4 py-3"
                  placeholder="Barbearia Alpha"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-zinc-700">
                  Telefone
                </label>

                <input
                  value={
                    form.phone
                  }
                  onChange={(
                    event,
                  ) =>
                    setForm({
                      ...form,

                      phone:
                        event
                          .target
                          .value,
                    })
                  }
                  className="w-full rounded-lg border border-zinc-300 px-4 py-3"
                  placeholder="(34) 99999-9999"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-zinc-700">
                  E-mail
                </label>

                <input
                  type="email"
                  value={
                    form.email
                  }
                  onChange={(
                    event,
                  ) =>
                    setForm({
                      ...form,

                      email:
                        event
                          .target
                          .value,
                    })
                  }
                  className="w-full rounded-lg border border-zinc-300 px-4 py-3"
                  placeholder="contato@empresa.com"
                />
              </div>

              <div className="md:col-span-2">
                <label className="mb-2 block text-sm font-medium text-zinc-700">
                  URL da logo
                </label>

                <input
                  value={
                    form.logoUrl
                  }
                  onChange={(
                    event,
                  ) =>
                    setForm({
                      ...form,

                      logoUrl:
                        event
                          .target
                          .value,
                    })
                  }
                  className="w-full rounded-lg border border-zinc-300 px-4 py-3"
                  placeholder="https://..."
                />

                <p className="mt-2 text-xs text-zinc-400">
                  Por enquanto usamos uma URL. Depois implementaremos upload da própria imagem.
                </p>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-zinc-700">
                  Cor principal
                </label>

                <div className="flex gap-3">
                  <input
                    type="color"
                    value={
                      form.primaryColor
                    }
                    onChange={(
                      event,
                    ) =>
                      setForm({
                        ...form,

                        primaryColor:
                          event
                            .target
                            .value,
                      })
                    }
                    className="h-12 w-16 cursor-pointer rounded-lg border border-zinc-300 bg-white p-1"
                  />

                  <input
                    value={
                      form.primaryColor
                    }
                    onChange={(
                      event,
                    ) =>
                      setForm({
                        ...form,

                        primaryColor:
                          event
                            .target
                            .value,
                      })
                    }
                    className="min-w-0 flex-1 rounded-lg border border-zinc-300 px-4 py-3 uppercase"
                    placeholder="#18181B"
                  />
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-zinc-700">
                  Fuso horário
                </label>

                <select
                  value={
                    form.timezone
                  }
                  onChange={(
                    event,
                  ) =>
                    setForm({
                      ...form,

                      timezone:
                        event
                          .target
                          .value,
                    })
                  }
                  className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-3"
                >
                  <option value="America/Sao_Paulo">
                    Brasília / São Paulo
                  </option>

                  <option value="America/Manaus">
                    Manaus
                  </option>

                  <option value="America/Cuiaba">
                    Cuiabá
                  </option>

                  <option value="America/Rio_Branco">
                    Rio Branco
                  </option>

                  <option value="America/Noronha">
                    Fernando de Noronha
                  </option>
                </select>
              </div>
            </div>
          </section>

          {/* AGENDAMENTO PÚBLICO */}
          <section className="rounded-2xl bg-white p-6 shadow-sm">
            <div>
              <h2 className="text-lg font-semibold text-zinc-900">
                Agendamento público
              </h2>

              <p className="mt-1 text-sm text-zinc-500">
                Defina com quanto tempo de antecedência seus clientes podem agendar.
              </p>
            </div>

            <div className="mt-6 grid gap-5 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-zinc-700">
                  Antecedência mínima
                </label>

                <div className="relative">
                  <input
                    type="number"
                    min={
                      0
                    }
                    max={
                      1440
                    }
                    step={
                      1
                    }
                    value={
                      form.bookingMinAdvanceMinutes
                    }
                    onChange={(
                      event,
                    ) =>
                      setForm({
                        ...form,

                        bookingMinAdvanceMinutes:
                          Number(
                            event
                              .target
                              .value,
                          ),
                      })
                    }
                    className="w-full rounded-lg border border-zinc-300 px-4 py-3 pr-24"
                  />

                  <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-zinc-400">
                    minutos
                  </span>
                </div>

                <p className="mt-2 text-xs text-zinc-400">
                  De 0 até 1440 minutos. Ex.: 120 = 2 horas antes.
                </p>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-zinc-700">
                  Agenda disponível
                </label>

                <div className="relative">
                  <input
                    type="number"
                    min={
                      1
                    }
                    max={
                      365
                    }
                    step={
                      1
                    }
                    value={
                      form.bookingMaxAdvanceDays
                    }
                    onChange={(
                      event,
                    ) =>
                      setForm({
                        ...form,

                        bookingMaxAdvanceDays:
                          Number(
                            event
                              .target
                              .value,
                          ),
                      })
                    }
                    className="w-full rounded-lg border border-zinc-300 px-4 py-3 pr-20"
                  />

                  <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-zinc-400">
                    dias
                  </span>
                </div>

                <p className="mt-2 text-xs text-zinc-400">
                  De 1 até 365 dias à frente.
                </p>
              </div>
            </div>
          </section>

          {/* LEMBRETES */}
          <section className="rounded-2xl bg-white p-6 shadow-sm">
            <div>
              <h2 className="text-lg font-semibold text-zinc-900">
                Lembretes automáticos
              </h2>

              <p className="mt-1 text-sm text-zinc-500">
                Envie automaticamente um e-mail ao cliente antes do horário confirmado.
              </p>
            </div>

            <div className="mt-6">
              <label className="flex cursor-pointer items-start justify-between gap-5 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                <div>
                  <p className="text-sm font-medium text-zinc-900">
                    Enviar lembretes por e-mail
                  </p>

                  <p className="mt-1 text-sm text-zinc-500">
                    Somente agendamentos confirmados e clientes com e-mail cadastrado recebem o lembrete.
                  </p>
                </div>

                <div className="relative shrink-0">
                  <input
                    type="checkbox"
                    checked={
                      form.appointmentRemindersEnabled
                    }
                    onChange={(
                      event,
                    ) =>
                      setForm({
                        ...form,

                        appointmentRemindersEnabled:
                          event
                            .target
                            .checked,
                      })
                    }
                    className="peer sr-only"
                  />

                  <div className="h-6 w-11 rounded-full bg-zinc-300 transition peer-checked:bg-green-600" />

                  <div className="absolute left-1 top-1 h-4 w-4 rounded-full bg-white shadow-sm transition peer-checked:translate-x-5" />
                </div>
              </label>

              <div
                className={`mt-5 rounded-xl border p-5 ${
                  form.appointmentRemindersEnabled
                    ? 'border-zinc-200 bg-white'
                    : 'border-zinc-100 bg-zinc-50 opacity-60'
                }`}
              >
                <label className="mb-2 block text-sm font-medium text-zinc-700">
                  Enviar lembrete com antecedência de
                </label>

                <div className="relative max-w-sm">
                  <input
                    type="number"
                    min={
                      1
                    }
                    max={
                      168
                    }
                    step={
                      1
                    }
                    disabled={
                      !form.appointmentRemindersEnabled
                    }
                    value={
                      form.appointmentReminderHoursBefore
                    }
                    onChange={(
                      event,
                    ) =>
                      setForm({
                        ...form,

                        appointmentReminderHoursBefore:
                          Number(
                            event
                              .target
                              .value,
                          ),
                      })
                    }
                    className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 pr-20 disabled:cursor-not-allowed disabled:bg-zinc-100"
                  />

                  <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-zinc-400">
                    horas
                  </span>
                </div>

                <p className="mt-2 text-xs text-zinc-400">
                  Mínimo de 1 hora e máximo de 168 horas (7 dias).
                </p>

                {form.appointmentRemindersEnabled && (
                  <div className="mt-4 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800">
                    O cliente receberá o lembrete aproximadamente{' '}
                    <strong>
                      {form.appointmentReminderHoursBefore}{' '}
                      {form.appointmentReminderHoursBefore ===
                      1
                        ? 'hora'
                        : 'horas'}
                    </strong>{' '}
                    antes do agendamento.
                  </div>
                )}

                {!form.appointmentRemindersEnabled && (
                  <div className="mt-4 rounded-lg bg-zinc-100 px-4 py-3 text-sm text-zinc-600">
                    Os lembretes automáticos estão desativados para esta empresa.
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className="rounded-2xl bg-white p-6 shadow-sm">
            <button
              type="submit"
              disabled={
                saving
              }
              className="rounded-lg bg-green-600 px-6 py-3 text-sm font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving
                ? 'Salvando...'
                : 'Salvar configurações'}
            </button>
          </section>
        </form>

        {/* PREVIEW */}
        <section className="h-fit rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-900">
            Pré-visualização
          </h2>

          <p className="mt-1 text-sm text-zinc-500">
            Veja como a identidade da empresa ficará.
          </p>

          <div className="mt-6 overflow-hidden rounded-2xl bg-zinc-950 p-5 text-white">
            {form.logoUrl ? (
              <div className="mb-5 flex h-24 items-center justify-center overflow-hidden rounded-xl bg-white p-3">
                <img
                  src={
                    form.logoUrl
                  }
                  alt="Logo"
                  className="max-h-full max-w-full object-contain"
                />
              </div>
            ) : (
              <div
                className="mb-5 flex h-14 w-14 items-center justify-center rounded-xl text-xl font-bold"
                style={{
                  backgroundColor:
                    form.primaryColor,
                }}
              >
                {form.name
                  .charAt(
                    0,
                  )
                  .toUpperCase() ||
                  'A'}
              </div>
            )}

            <h3 className="font-semibold">
              {form.name ||
                'Nome da empresa'}
            </h3>

            <p className="mt-1 text-xs text-zinc-400">
              Sistema de agendamento
            </p>

            <div
              className="mt-6 rounded-xl px-4 py-3 text-sm font-medium text-white"
              style={{
                backgroundColor:
                  form.primaryColor,
              }}
            >
              Item selecionado
            </div>
          </div>

          <div className="mt-6 rounded-xl border border-zinc-200 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">
              Agendamento público
            </p>

            <p className="mt-2 text-sm text-zinc-700">
              Mínimo de{' '}
              <strong>
                {form.bookingMinAdvanceMinutes}
              </strong>{' '}
              minutos de antecedência.
            </p>

            <p className="mt-1 text-sm text-zinc-700">
              Agenda aberta por até{' '}
              <strong>
                {form.bookingMaxAdvanceDays}
              </strong>{' '}
              dias.
            </p>
          </div>

          <div className="mt-4 rounded-xl border border-zinc-200 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">
              Lembretes
            </p>

            {form.appointmentRemindersEnabled ? (
              <p className="mt-2 text-sm text-zinc-700">
                Ativos —{' '}
                <strong>
                  {form.appointmentReminderHoursBefore}{' '}
                  {form.appointmentReminderHoursBefore ===
                  1
                    ? 'hora'
                    : 'horas'}
                </strong>{' '}
                antes.
              </p>
            ) : (
              <p className="mt-2 text-sm text-zinc-500">
                Desativados
              </p>
            )}
          </div>

          {tenant && (
            <div className="mt-5 text-xs text-zinc-400">
              Identificador:{' '}
              <span className="font-mono">
                {tenant.slug}
              </span>
            </div>
          )}
        </section>
      </div>
    </PanelShell>
  );
}