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
};

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
      name: '',
      logoUrl: '',

      primaryColor:
        '#18181b',

      phone: '',
      email: '',

      timezone:
        'America/Sao_Paulo',

      bookingMinAdvanceMinutes:
        60,

      bookingMaxAdvanceDays:
        7,
    });

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

  const [
    publicBookingUrl,
    setPublicBookingUrl,
  ] =
    useState('');

  const [
    copied,
    setCopied,
  ] =
    useState(false);

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

    setError('');
    setSuccess('');

    if (
      !form.name.trim()
    ) {
      setError(
        'Informe o nome da empresa.',
      );

      return;
    }

    if (
      !Number.isInteger(
        form.bookingMinAdvanceMinutes,
      ) ||
      form.bookingMinAdvanceMinutes <
        0 ||
      form.bookingMinAdvanceMinutes >
        1440
    ) {
      setError(
        'A antecedência mínima deve ser um número inteiro entre 0 e 1440 minutos.',
      );

      return;
    }

    if (
      !Number.isInteger(
        form.bookingMaxAdvanceDays,
      ) ||
      form.bookingMaxAdvanceDays <
        1 ||
      form.bookingMaxAdvanceDays >
        365
    ) {
      setError(
        'O limite de agendamento deve ser um número inteiro entre 1 e 365 dias.',
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
                  form.logoUrl
                    .trim() ||
                  null,

                primaryColor:
                  form.primaryColor,

                phone:
                  form.phone
                    .trim() ||
                  null,

                email:
                  form.email
                    .trim() ||
                  null,

                timezone:
                  form.timezone,

                bookingMinAdvanceMinutes:
                  form.bookingMinAdvanceMinutes,

                bookingMaxAdvanceDays:
                  form.bookingMaxAdvanceDays,
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

      /*
       * O PanelShell busca novamente
       * os dados quando a página
       * é recarregada.
       */
      window.setTimeout(
        () => {
          window.location.reload();
        },
        700,
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
      subtitle="Identidade, dados e regras de agendamento"
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

        {/* FORMULÁRIO */}
        <section className="rounded-2xl bg-white p-6 shadow-sm">

          <div>
            <h2 className="text-lg font-semibold text-zinc-900">
              Dados da empresa
            </h2>

            <p className="mt-1 text-sm text-zinc-500">
              Essas informações pertencem somente a esta empresa.
            </p>
          </div>

          <form
            onSubmit={
              handleSubmit
            }
            className="mt-6 grid gap-5 md:grid-cols-2"
          >

            {/* NOME */}
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

            {/* TELEFONE */}
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

            {/* EMAIL */}
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

            {/* LOGO */}
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

            {/* COR */}
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

            {/* TIMEZONE */}
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

            {/* REGRAS DO AGENDAMENTO */}
            <div className="md:col-span-2 mt-2 border-t border-zinc-200 pt-6">
              <h3 className="text-base font-semibold text-zinc-900">
                Regras do agendamento público
              </h3>

              <p className="mt-1 text-sm text-zinc-500">
                Defina com quanto tempo de antecedência o cliente pode reservar e até quantos dias à frente a agenda ficará disponível.
              </p>
            </div>

            {/* ANTECEDÊNCIA */}
            <div>
              <label className="mb-2 block text-sm font-medium text-zinc-700">
                Antecedência mínima
              </label>

              <div className="relative">
                <input
                  type="number"
                  min={0}
                  max={1440}
                  step={1}
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

                <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-sm text-zinc-400">
                  minutos
                </span>
              </div>

              <p className="mt-2 text-xs text-zinc-400">
                Exemplo: 60 significa que o cliente precisa agendar pelo menos 1 hora antes.
              </p>
            </div>

            {/* DIAS À FRENTE */}
            <div>
              <label className="mb-2 block text-sm font-medium text-zinc-700">
                Agendar até
              </label>

              <div className="relative">
                <input
                  type="number"
                  min={1}
                  max={365}
                  step={1}
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

                <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-sm text-zinc-400">
                  dias
                </span>
              </div>

              <p className="mt-2 text-xs text-zinc-400">
                Exemplo: 7 permite agendamentos de hoje até os próximos 7 dias.
              </p>
            </div>

            {/* RESUMO */}
            <div className="md:col-span-2 rounded-xl border border-green-200 bg-green-50 px-4 py-4">
              <p className="text-sm font-medium text-green-900">
                Regra atual
              </p>

              <p className="mt-1 text-sm text-green-800">
                O cliente poderá agendar com pelo menos{' '}
                <strong>
                  {form.bookingMinAdvanceMinutes}{' '}
                  minutos
                </strong>{' '}
                de antecedência e no máximo{' '}
                <strong>
                  {form.bookingMaxAdvanceDays}{' '}
                  dias
                </strong>{' '}
                à frente.
              </p>
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
                  : 'Salvar configurações'}
              </button>
            </div>
          </form>
        </section>

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
                  .charAt(0)
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

          <div className="mt-5 rounded-xl bg-zinc-50 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">
              Agendamento público
            </p>

            <p className="mt-2 text-sm text-zinc-700">
              Antecedência mínima:{' '}
              <strong>
                {form.bookingMinAdvanceMinutes}{' '}
                min
              </strong>
            </p>

            <p className="mt-1 text-sm text-zinc-700">
              Agenda aberta por:{' '}
              <strong>
                {form.bookingMaxAdvanceDays}{' '}
                dias
              </strong>
            </p>
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