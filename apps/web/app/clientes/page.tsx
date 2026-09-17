'use client';

import {
  FormEvent,
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
    role: Role;
  };
};

type Client = {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  birthDate?: string | null;
  notes?: string | null;
  active: boolean;
};

type ClientForm = {
  name: string;
  email: string;
  phone: string;
  birthDate: string;
  notes: string;
};

const emptyForm: ClientForm = {
  name: '',
  email: '',
  phone: '',
  birthDate: '',
  notes: '',
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

function formatBirthDate(
  value?: string | null,
) {
  if (!value) {
    return '-';
  }

  return new Intl.DateTimeFormat(
    'pt-BR',
    {
      timeZone: 'UTC',
    },
  ).format(
    new Date(value),
  );
}

export default function ClientsPage() {
  const router = useRouter();

  const [
    currentUser,
    setCurrentUser,
  ] =
    useState<CurrentUser | null>(
      null,
    );

  const [
    clients,
    setClients,
  ] =
    useState<Client[]>([]);

  const [
    search,
    setSearch,
  ] =
    useState('');

  const [
    status,
    setStatus,
  ] =
    useState<
      'active' | 'inactive' | 'all'
    >('active');

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
    showForm,
    setShowForm,
  ] =
    useState(false);

  const [
    editingClient,
    setEditingClient,
  ] =
    useState<Client | null>(
      null,
    );

  const [
    form,
    setForm,
  ] =
    useState<ClientForm>(
      emptyForm,
    );

  /**
   * OWNER, ADMIN e RECEPTIONIST
   * podem gerenciar clientes.
   *
   * STAFF fica somente com leitura.
   */
  const canManageClients =
    currentUser?.membership.role ===
      'OWNER' ||
    currentUser?.membership.role ===
      'ADMIN' ||
    currentUser?.membership.role ===
      'RECEPTIONIST';

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

  async function loadClients(
    targetStatus:
      | 'active'
      | 'inactive'
      | 'all' = status,

    targetSearch:
      string = search,
  ) {
    try {
      setLoading(true);
      setError('');

      const params =
        new URLSearchParams();

      params.set(
        'status',
        targetStatus,
      );

      if (
        targetSearch.trim()
      ) {
        params.set(
          'search',
          targetSearch.trim(),
        );
      }

      const response =
        await apiFetch(
          `/clients?${params.toString()}`,
        );

      if (
        response.status === 401
      ) {
        handleLogout();
        return;
      }

      const data =
        await readResponse<
          Client[]
        >(response);

      setClients(
        data,
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Erro ao carregar clientes',
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

      loadClients(
        'active',
        '',
      );
    } catch {
      handleLogout();
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openCreate() {
    if (
      !canManageClients
    ) {
      setError(
        'Você não possui permissão para cadastrar clientes.',
      );

      return;
    }

    setEditingClient(
      null,
    );

    setForm(
      emptyForm,
    );

    setShowForm(
      true,
    );

    setError('');
    setSuccess('');
  }

  function openEdit(
    client: Client,
  ) {
    if (
      !canManageClients
    ) {
      setError(
        'Você não possui permissão para editar clientes.',
      );

      return;
    }

    setEditingClient(
      client,
    );

    setForm({
      name:
        client.name ?? '',

      email:
        client.email ?? '',

      phone:
        client.phone ?? '',

      birthDate:
        client.birthDate
          ? client.birthDate.slice(
              0,
              10,
            )
          : '',

      notes:
        client.notes ?? '',
    });

    setShowForm(
      true,
    );

    setError('');
    setSuccess('');
  }

  function closeForm() {
    setShowForm(
      false,
    );

    setEditingClient(
      null,
    );

    setForm(
      emptyForm,
    );
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (
      !canManageClients
    ) {
      setError(
        'Você não possui permissão para alterar clientes.',
      );

      return;
    }

    if (
      !form.name.trim()
    ) {
      setError(
        'Informe o nome do cliente.',
      );

      return;
    }

    try {
      setSaving(true);

      setError('');
      setSuccess('');

      const payload = {
        name:
          form.name.trim(),

        email:
          form.email.trim() ||
          undefined,

        phone:
          form.phone.trim() ||
          undefined,

        birthDate:
          form.birthDate ||
          undefined,

        notes:
          form.notes.trim() ||
          undefined,
      };

      const response =
        editingClient
          ? await apiFetch(
              `/clients/${editingClient.id}`,
              {
                method:
                  'PATCH',

                body:
                  JSON.stringify(
                    payload,
                  ),
              },
            )
          : await apiFetch(
              '/clients',
              {
                method:
                  'POST',

                body:
                  JSON.stringify(
                    payload,
                  ),
              },
            );

      await readResponse<Client>(
        response,
      );

      setSuccess(
        editingClient
          ? 'Cliente atualizado com sucesso.'
          : 'Cliente cadastrado com sucesso.',
      );

      closeForm();

      await loadClients();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Erro ao salvar cliente',
      );
    } finally {
      setSaving(false);
    }
  }

  async function deactivateClient(
    client: Client,
  ) {
    if (
      !canManageClients
    ) {
      setError(
        'Você não possui permissão para desativar clientes.',
      );

      return;
    }

    const confirmed =
      window.confirm(
        `Deseja desativar o cliente ${client.name}?`,
      );

    if (!confirmed) {
      return;
    }

    try {
      setError('');
      setSuccess('');

      const response =
        await apiFetch(
          `/clients/${client.id}`,
          {
            method:
              'DELETE',
          },
        );

      await readResponse<Client>(
        response,
      );

      setSuccess(
        'Cliente desativado com sucesso.',
      );

      await loadClients();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Erro ao desativar cliente',
      );
    }
  }

  async function restoreClient(
    client: Client,
  ) {
    if (
      !canManageClients
    ) {
      setError(
        'Você não possui permissão para reativar clientes.',
      );

      return;
    }

    try {
      setError('');
      setSuccess('');

      const response =
        await apiFetch(
          `/clients/${client.id}/restore`,
          {
            method:
              'PATCH',
          },
        );

      await readResponse<Client>(
        response,
      );

      setSuccess(
        'Cliente reativado com sucesso.',
      );

      await loadClients();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Erro ao reativar cliente',
      );
    }
  }

  return (
    <PanelShell
      title="Clientes"
      subtitle="Cadastro e gerenciamento de clientes"
    >
      {/* CABEÇALHO */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">

        <div>
          <p className="text-sm text-zinc-500">
            {canManageClients
              ? 'Gerencie os clientes da empresa.'
              : 'Consulte os clientes da empresa.'}
          </p>

          {!canManageClients && (
            <p className="mt-1 text-xs text-zinc-400">
              Seu perfil possui acesso somente para visualização.
            </p>
          )}
        </div>

        {canManageClients && (
          <button
            onClick={
              openCreate
            }
            className="rounded-lg bg-zinc-900 px-5 py-3 text-sm font-medium text-white hover:bg-zinc-800"
          >
            + Novo cliente
          </button>
        )}
      </div>

      {/* ERRO */}
      {error && (
        <div className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* SUCESSO */}
      {success && (
        <div className="mt-5 rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">
          {success}
        </div>
      )}

      {/* FORMULÁRIO */}
      {showForm &&
        canManageClients && (
          <section className="mt-6 rounded-2xl bg-white p-6 shadow-sm">

            <div className="flex items-center justify-between">

              <h2 className="text-lg font-semibold text-zinc-900">
                {editingClient
                  ? 'Editar cliente'
                  : 'Novo cliente'}
              </h2>

              <button
                onClick={
                  closeForm
                }
                className="text-sm text-zinc-500 hover:text-zinc-900"
              >
                Fechar
              </button>
            </div>

            <form
              onSubmit={
                handleSubmit
              }
              className="mt-6 grid gap-5 md:grid-cols-2"
            >

              {/* NOME */}
              <div>
                <label className="mb-2 block text-sm font-medium text-zinc-700">
                  Nome *
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
                  placeholder="Nome do cliente"
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
                  placeholder="cliente@email.com"
                />
              </div>

              {/* NASCIMENTO */}
              <div>
                <label className="mb-2 block text-sm font-medium text-zinc-700">
                  Data de nascimento
                </label>

                <input
                  type="date"
                  value={
                    form.birthDate
                  }
                  onChange={(
                    event,
                  ) =>
                    setForm({
                      ...form,

                      birthDate:
                        event
                          .target
                          .value,
                    })
                  }
                  className="w-full rounded-lg border border-zinc-300 px-4 py-3"
                />
              </div>

              {/* OBSERVAÇÕES */}
              <div className="md:col-span-2">

                <label className="mb-2 block text-sm font-medium text-zinc-700">
                  Observações
                </label>

                <textarea
                  value={
                    form.notes
                  }
                  onChange={(
                    event,
                  ) =>
                    setForm({
                      ...form,

                      notes:
                        event
                          .target
                          .value,
                    })
                  }
                  rows={3}
                  className="w-full rounded-lg border border-zinc-300 px-4 py-3"
                  placeholder="Informações adicionais..."
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
                    : editingClient
                      ? 'Salvar alterações'
                      : 'Cadastrar cliente'}
                </button>
              </div>
            </form>
          </section>
        )}

      {/* FILTROS */}
      <section className="mt-6 rounded-2xl bg-white p-5 shadow-sm">

        <div className="grid gap-4 md:grid-cols-[1fr_200px_auto]">

          <input
            value={
              search
            }
            onChange={(
              event,
            ) =>
              setSearch(
                event.target.value,
              )
            }
            onKeyDown={(
              event,
            ) => {
              if (
                event.key ===
                'Enter'
              ) {
                loadClients();
              }
            }}
            placeholder="Buscar por nome, telefone ou e-mail..."
            className="rounded-lg border border-zinc-300 px-4 py-3"
          />

          <select
            value={
              status
            }
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

              await loadClients(
                nextStatus,
                search,
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

          <button
            onClick={() =>
              loadClients()
            }
            className="rounded-lg bg-zinc-900 px-5 py-3 text-sm font-medium text-white"
          >
            Buscar
          </button>
        </div>
      </section>

      {/* LISTA */}
      <section className="mt-6 rounded-2xl bg-white p-6 shadow-sm">

        <div className="flex items-center justify-between">

          <h2 className="text-lg font-semibold text-zinc-900">
            Lista de clientes
          </h2>

          <span className="text-sm text-zinc-500">
            {clients.length}{' '}
            cliente(s)
          </span>
        </div>

        {loading ? (
          <p className="mt-6 text-sm text-zinc-500">
            Carregando...
          </p>
        ) : clients.length ===
          0 ? (
          <div className="mt-6 rounded-xl bg-zinc-50 p-8 text-center">

            <p className="text-zinc-500">
              Nenhum cliente encontrado.
            </p>
          </div>
        ) : (
          <div className="mt-5 overflow-x-auto">

            <table className="w-full min-w-[750px] text-left">

              <thead>
                <tr className="border-b border-zinc-200 text-sm text-zinc-500">

                  <th className="px-3 py-3">
                    Nome
                  </th>

                  <th className="px-3 py-3">
                    Telefone
                  </th>

                  <th className="px-3 py-3">
                    E-mail
                  </th>

                  <th className="px-3 py-3">
                    Nascimento
                  </th>

                  <th className="px-3 py-3">
                    Status
                  </th>

                  {canManageClients && (
                    <th className="px-3 py-3 text-right">
                      Ações
                    </th>
                  )}
                </tr>
              </thead>

              <tbody>
                {clients.map(
                  (client) => (
                    <tr
                      key={
                        client.id
                      }
                      className="border-b border-zinc-100"
                    >

                      <td className="px-3 py-4 font-medium text-zinc-900">
                        {
                          client.name
                        }
                      </td>

                      <td className="px-3 py-4 text-sm text-zinc-600">
                        {client.phone ||
                          '-'}
                      </td>

                      <td className="px-3 py-4 text-sm text-zinc-600">
                        {client.email ||
                          '-'}
                      </td>

                      <td className="px-3 py-4 text-sm text-zinc-600">
                        {formatBirthDate(
                          client.birthDate,
                        )}
                      </td>

                      <td className="px-3 py-4">

                        <span
                          className={
                            client.active
                              ? 'rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700'
                              : 'rounded-full bg-zinc-200 px-3 py-1 text-xs font-medium text-zinc-600'
                          }
                        >
                          {client.active
                            ? 'Ativo'
                            : 'Inativo'}
                        </span>
                      </td>

                      {canManageClients && (
                        <td className="px-3 py-4">

                          <div className="flex justify-end gap-2">

                            <button
                              onClick={() =>
                                openEdit(
                                  client,
                                )
                              }
                              className="rounded-lg border border-zinc-300 px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                            >
                              Editar
                            </button>

                            {client.active ? (
                              <button
                                onClick={() =>
                                  deactivateClient(
                                    client,
                                  )
                                }
                                className="rounded-lg border border-red-300 px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-50"
                              >
                                Desativar
                              </button>
                            ) : (
                              <button
                                onClick={() =>
                                  restoreClient(
                                    client,
                                  )
                                }
                                className="rounded-lg border border-green-300 px-3 py-2 text-xs font-medium text-green-700 hover:bg-green-50"
                              >
                                Reativar
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </PanelShell>
  );
}