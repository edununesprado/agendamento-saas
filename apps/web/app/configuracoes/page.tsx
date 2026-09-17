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
};

type TenantForm = {
  name: string;
  logoUrl: string;
  primaryColor: string;
  phone: string;
  email: string;
  timezone: string;
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
  const router = useRouter();

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
    async function loadTenant() {
      const token =
        localStorage.getItem(
          'accessToken',
        );

      if (!token) {
        router.replace('/login');
        return;
      }

      try {
        const response =
          await apiFetch(
            '/tenants/current',
          );

        if (
          response.status === 401
        ) {
          handleLogout();
          return;
        }

        const data =
          await readResponse<Tenant>(
            response,
          );

        setTenant(data);

        setForm({
          name:
            data.name ?? '',

          logoUrl:
            data.logoUrl ?? '',

          primaryColor:
            data.primaryColor ||
            '#18181b',

          phone:
            data.phone ?? '',

          email:
            data.email ?? '',

          timezone:
            data.timezone ||
            'America/Sao_Paulo',
        });
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : 'Erro ao carregar empresa',
        );
      } finally {
        setLoading(false);
      }
    }

    loadTenant();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (!form.name.trim()) {
      setError(
        'Informe o nome da empresa.',
      );

      return;
    }

    try {
      setSaving(true);

      setError('');
      setSuccess('');

      const response =
        await apiFetch(
          '/tenants/current',
          {
            method: 'PATCH',

            body: JSON.stringify({
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
            }),
          },
        );

      if (
        response.status === 401
      ) {
        handleLogout();
        return;
      }

      const updated =
        await readResponse<Tenant>(
          response,
        );

      setTenant(updated);

      const storedUser =
        localStorage.getItem(
          'currentUser',
        );

      if (storedUser) {
        const parsed =
          JSON.parse(
            storedUser,
          );

        localStorage.setItem(
          'currentUser',
          JSON.stringify({
            ...parsed,
            tenant: updated,
          }),
        );
      }

      setSuccess(
        'Configurações atualizadas com sucesso.',
      );

      /*
       * O PanelShell busca novamente os dados
       * quando a página é recarregada.
       */
      window.setTimeout(() => {
        window.location.reload();
      }, 700);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Erro ao atualizar empresa',
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
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
      subtitle="Identidade e dados da empresa"
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
                      event.target
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
                      event.target
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
                      event.target
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
                      event.target
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
                        event.target
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
                        event.target
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
                      event.target
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