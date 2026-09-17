'use client';

import Link from 'next/link';
import {
  FormEvent,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useRouter } from 'next/navigation';

import { apiFetch } from '@/lib/api';
import { PanelShell } from '@/components/panel-shell';

type Service = {
  id: string;
  name: string;
  description?: string | null;
  durationMin: number;
  priceCents: number;
  active: boolean;
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
  };

  membership: {
    id: string;
    role: string;
  };
};

type ServiceForm = {
  name: string;
  description: string;
  durationMin: string;
  price: string;
};

const emptyForm: ServiceForm = {
  name: '',
  description: '',
  durationMin: '30',
  price: '',
};

async function readResponse<T>(
  response: Response,
) {
  const data = await response.json();

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

function priceToCents(
  value: string,
) {
  const normalized =
    value
      .trim()
      .replace(/\./g, '')
      .replace(',', '.');

  const number =
    Number(normalized);

  if (
    Number.isNaN(number) ||
    number < 0
  ) {
    return null;
  }

  return Math.round(
    number * 100,
  );
}

export default function ServicesPage() {
  const router = useRouter();

  const [
    currentUser,
    setCurrentUser,
  ] =
    useState<CurrentUser | null>(
      null,
    );

  const [
    services,
    setServices,
  ] =
    useState<Service[]>([]);

  const [search, setSearch] =
    useState('');

  const [status, setStatus] =
    useState<
      'active' | 'inactive' | 'all'
    >('active');

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const [error, setError] =
    useState('');

  const [success, setSuccess] =
    useState('');

  const [
    showForm,
    setShowForm,
  ] =
    useState(false);

  const [
    editingService,
    setEditingService,
  ] =
    useState<Service | null>(
      null,
    );

  const [form, setForm] =
    useState<ServiceForm>(
      emptyForm,
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

  async function loadServices(
    targetStatus:
      | 'active'
      | 'inactive'
      | 'all' = status,
  ) {
    try {
      setLoading(true);
      setError('');

      const response =
        await apiFetch(
          `/services?status=${targetStatus}`,
        );

      if (response.status === 401) {
        handleLogout();
        return;
      }

      const data =
        await readResponse<
          Service[]
        >(response);

      setServices(data);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Erro ao carregar serviços',
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
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
        ) as CurrentUser;

      setCurrentUser(parsed);

      loadServices('active');
    } catch {
      handleLogout();
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredServices =
    useMemo(() => {
      const value =
        search
          .trim()
          .toLowerCase();

      if (!value) {
        return services;
      }

      return services.filter(
        (service) =>
          service.name
            .toLowerCase()
            .includes(value) ||
          service.description
            ?.toLowerCase()
            .includes(value),
      );
    }, [services, search]);

  function openCreate() {
    setEditingService(null);
    setForm(emptyForm);
    setShowForm(true);
    setError('');
    setSuccess('');
  }

  function openEdit(
    service: Service,
  ) {
    setEditingService(service);

    setForm({
      name:
        service.name,

      description:
        service.description ?? '',

      durationMin:
        String(
          service.durationMin,
        ),

      price:
        (
          service.priceCents /
          100
        )
          .toFixed(2)
          .replace('.', ','),
    });

    setShowForm(true);
    setError('');
    setSuccess('');
  }

  function closeForm() {
    setShowForm(false);
    setEditingService(null);
    setForm(emptyForm);
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    setError('');
    setSuccess('');

    if (!form.name.trim()) {
      setError(
        'Informe o nome do serviço.',
      );

      return;
    }

    const durationMin =
      Number(form.durationMin);

    if (
      !Number.isInteger(
        durationMin,
      ) ||
      durationMin <= 0
    ) {
      setError(
        'Informe uma duração válida.',
      );

      return;
    }

    const priceCents =
      priceToCents(
        form.price,
      );

    if (priceCents === null) {
      setError(
        'Informe um preço válido.',
      );

      return;
    }

    try {
      setSaving(true);

      const payload = {
        name:
          form.name.trim(),

        description:
          form.description.trim() ||
          undefined,

        durationMin,
        priceCents,
      };

      const response =
        editingService
          ? await apiFetch(
              `/services/${editingService.id}`,
              {
                method: 'PATCH',

                body: JSON.stringify(
                  payload,
                ),
              },
            )
          : await apiFetch(
              '/services',
              {
                method: 'POST',

                body: JSON.stringify(
                  payload,
                ),
              },
            );

      await readResponse<Service>(
        response,
      );

      setSuccess(
        editingService
          ? 'Serviço atualizado com sucesso.'
          : 'Serviço cadastrado com sucesso.',
      );

      closeForm();

      await loadServices();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Erro ao salvar serviço',
      );
    } finally {
      setSaving(false);
    }
  }

  async function deactivateService(
    service: Service,
  ) {
    const confirmed =
      window.confirm(
        `Deseja desativar o serviço ${service.name}?`,
      );

    if (!confirmed) {
      return;
    }

    try {
      setError('');
      setSuccess('');

      const response =
        await apiFetch(
          `/services/${service.id}`,
          {
            method: 'DELETE',
          },
        );

      await readResponse<Service>(
        response,
      );

      setSuccess(
        'Serviço desativado com sucesso.',
      );

      await loadServices();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Erro ao desativar serviço',
      );
    }
  }

  async function restoreService(
    service: Service,
  ) {
    try {
      setError('');
      setSuccess('');

      const response =
        await apiFetch(
          `/services/${service.id}/restore`,
          {
            method: 'PATCH',
          },
        );

      await readResponse<Service>(
        response,
      );

      setSuccess(
        'Serviço reativado com sucesso.',
      );

      await loadServices();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Erro ao reativar serviço',
      );
    }
  }

  return (
    <div className="min-h-screen bg-zinc-100">
      <div className="flex min-h-screen">

        {/* MENU LATERAL */}
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
              className="block rounded-lg px-4 py-3 text-sm text-zinc-300 hover:bg-zinc-900"
            >
              Funcionários
            </Link>

            <Link
              href="/servicos"
              className="block rounded-lg bg-zinc-800 px-4 py-3 text-sm font-medium text-white"
            >
              Serviços
            </Link>
          </nav>

          <div className="mt-auto border-t border-zinc-800 p-4">
            <button
              onClick={handleLogout}
              className="w-full rounded-lg bg-red-600 px-4 py-3 text-sm font-medium text-white hover:bg-red-700"
            >
              Sair
            </button>
          </div>
        </aside>

        {/* CONTEÚDO */}
        <main className="min-w-0 flex-1">

          <header className="border-b border-zinc-200 bg-white px-6 py-5">

            <h2 className="text-xl font-semibold text-zinc-900">
              {currentUser
                ?.tenant
                .name ??
                'Serviços'}
            </h2>

            <p className="text-sm text-zinc-500">
              Catálogo de serviços
            </p>
          </header>

          <div className="p-4 md:p-6">

            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">

              <div>
                <h1 className="text-2xl font-bold text-zinc-900">
                  Serviços
                </h1>

                <p className="mt-1 text-sm text-zinc-500">
                  Cadastre preços,
                  duração e serviços
                  oferecidos.
                </p>
              </div>

              <button
                onClick={openCreate}
                className="rounded-lg bg-zinc-900 px-5 py-3 text-sm font-medium text-white hover:bg-zinc-800"
              >
                + Novo serviço
              </button>
            </div>

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

            {/* FORMULÁRIO */}
            {showForm && (
              <section className="mt-6 rounded-2xl bg-white p-6 shadow-sm">

                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-zinc-900">
                    {editingService
                      ? 'Editar serviço'
                      : 'Novo serviço'}
                  </h2>

                  <button
                    onClick={closeForm}
                    className="text-sm text-zinc-500 hover:text-zinc-900"
                  >
                    Fechar
                  </button>
                </div>

                <form
                  onSubmit={handleSubmit}
                  className="mt-6 grid gap-5 md:grid-cols-2"
                >

                  <div>
                    <label className="mb-2 block text-sm font-medium text-zinc-700">
                      Nome *
                    </label>

                    <input
                      value={form.name}
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
                      placeholder="Ex: Corte Masculino"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-zinc-700">
                      Duração em minutos *
                    </label>

                    <input
                      type="number"
                      min="1"
                      value={
                        form.durationMin
                      }
                      onChange={(
                        event,
                      ) =>
                        setForm({
                          ...form,
                          durationMin:
                            event
                              .target
                              .value,
                        })
                      }
                      className="w-full rounded-lg border border-zinc-300 px-4 py-3"
                      placeholder="30"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-zinc-700">
                      Preço *
                    </label>

                    <input
                      value={form.price}
                      onChange={(
                        event,
                      ) =>
                        setForm({
                          ...form,
                          price:
                            event
                              .target
                              .value,
                        })
                      }
                      className="w-full rounded-lg border border-zinc-300 px-4 py-3"
                      placeholder="50,00"
                    />

                    <p className="mt-1 text-xs text-zinc-400">
                      Digite em reais.
                      Exemplo: 50,00
                    </p>
                  </div>

                  <div className="md:col-span-2">
                    <label className="mb-2 block text-sm font-medium text-zinc-700">
                      Descrição
                    </label>

                    <textarea
                      value={
                        form.description
                      }
                      onChange={(
                        event,
                      ) =>
                        setForm({
                          ...form,
                          description:
                            event
                              .target
                              .value,
                        })
                      }
                      rows={3}
                      className="w-full rounded-lg border border-zinc-300 px-4 py-3"
                      placeholder="Descrição opcional do serviço..."
                    />
                  </div>

                  <div className="md:col-span-2">
                    <button
                      type="submit"
                      disabled={saving}
                      className="rounded-lg bg-green-600 px-6 py-3 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
                    >
                      {saving
                        ? 'Salvando...'
                        : editingService
                          ? 'Salvar alterações'
                          : 'Cadastrar serviço'}
                    </button>
                  </div>
                </form>
              </section>
            )}

            {/* FILTROS */}
            <section className="mt-6 rounded-2xl bg-white p-5 shadow-sm">

              <div className="grid gap-4 md:grid-cols-[1fr_220px]">

                <input
                  value={search}
                  onChange={(
                    event,
                  ) =>
                    setSearch(
                      event
                        .target
                        .value,
                    )
                  }
                  placeholder="Buscar serviço..."
                  className="rounded-lg border border-zinc-300 px-4 py-3"
                />

                <select
                  value={status}
                  onChange={async (
                    event,
                  ) => {
                    const nextStatus =
                      event.target
                        .value as
                        | 'active'
                        | 'inactive'
                        | 'all';

                    setStatus(
                      nextStatus,
                    );

                    await loadServices(
                      nextStatus,
                    );
                  }}
                  className="rounded-lg border border-zinc-300 bg-white px-4 py-3"
                >
                  <option value="active">
                    Ativos
                  </option>

                  <option value="inactive">
                    Inativos
                  </option>

                  <option value="all">
                    Todos
                  </option>
                </select>
              </div>
            </section>

            {/* LISTA */}
            <section className="mt-6 rounded-2xl bg-white p-6 shadow-sm">

              <div className="flex items-center justify-between">

                <h2 className="text-lg font-semibold text-zinc-900">
                  Catálogo
                </h2>

                <span className="text-sm text-zinc-500">
                  {
                    filteredServices.length
                  }{' '}
                  serviço(s)
                </span>
              </div>

              {loading ? (
                <p className="mt-6 text-sm text-zinc-500">
                  Carregando...
                </p>
              ) : filteredServices.length ===
                0 ? (
                <div className="mt-6 rounded-xl bg-zinc-50 p-8 text-center">
                  <p className="text-zinc-500">
                    Nenhum serviço
                    encontrado.
                  </p>
                </div>
              ) : (
                <div className="mt-5 overflow-x-auto">

                  <table className="w-full min-w-[760px] text-left">

                    <thead>
                      <tr className="border-b border-zinc-200 text-sm text-zinc-500">

                        <th className="px-3 py-3">
                          Serviço
                        </th>

                        <th className="px-3 py-3">
                          Duração
                        </th>

                        <th className="px-3 py-3">
                          Preço
                        </th>

                        <th className="px-3 py-3">
                          Status
                        </th>

                        <th className="px-3 py-3 text-right">
                          Ações
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {filteredServices.map(
                        (service) => (
                          <tr
                            key={
                              service.id
                            }
                            className="border-b border-zinc-100"
                          >

                            <td className="px-3 py-4">
                              <p className="font-medium text-zinc-900">
                                {
                                  service.name
                                }
                              </p>

                              {service.description && (
                                <p className="mt-1 max-w-sm text-xs text-zinc-500">
                                  {
                                    service.description
                                  }
                                </p>
                              )}
                            </td>

                            <td className="px-3 py-4 text-sm text-zinc-600">
                              {
                                service.durationMin
                              }{' '}
                              min
                            </td>

                            <td className="px-3 py-4 font-medium text-zinc-900">
                              {formatCurrency(
                                service.priceCents,
                              )}
                            </td>

                            <td className="px-3 py-4">
                              <span
                                className={
                                  service.active
                                    ? 'rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700'
                                    : 'rounded-full bg-zinc-200 px-3 py-1 text-xs font-medium text-zinc-600'
                                }
                              >
                                {service.active
                                  ? 'Ativo'
                                  : 'Inativo'}
                              </span>
                            </td>

                            <td className="px-3 py-4">

                              <div className="flex justify-end gap-2">

                                <button
                                  onClick={() =>
                                    openEdit(
                                      service,
                                    )
                                  }
                                  className="rounded-lg border border-zinc-300 px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                                >
                                  Editar
                                </button>

                                {service.active ? (
                                  <button
                                    onClick={() =>
                                      deactivateService(
                                        service,
                                      )
                                    }
                                    className="rounded-lg border border-red-300 px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-50"
                                  >
                                    Desativar
                                  </button>
                                ) : (
                                  <button
                                    onClick={() =>
                                      restoreService(
                                        service,
                                      )
                                    }
                                    className="rounded-lg border border-green-300 px-3 py-2 text-xs font-medium text-green-700 hover:bg-green-50"
                                  >
                                    Reativar
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ),
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}