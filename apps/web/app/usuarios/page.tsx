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

type TeamMember = {
  id: string;
  role: Role;
  createdAt: string;

  user: {
    id: string;
    name: string;
    email: string;
  };
};

type StoredUser = {
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

type UserForm = {
  name: string;
  email: string;
  password: string;
  role:
    | 'ADMIN'
    | 'RECEPTIONIST'
    | 'STAFF';
};

const emptyForm: UserForm = {
  name: '',
  email: '',
  password: '',
  role: 'RECEPTIONIST',
};

const roleLabels: Record<Role, string> = {
  OWNER: 'Proprietário',
  ADMIN: 'Administrador',
  RECEPTIONIST: 'Recepção',
  STAFF: 'Funcionário',
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

export default function UsersPage() {
  const router = useRouter();

  const [
    members,
    setMembers,
  ] =
    useState<TeamMember[]>([]);

  const [
    currentUser,
    setCurrentUser,
  ] =
    useState<StoredUser | null>(
      null,
    );

  const [
    form,
    setForm,
  ] =
    useState<UserForm>(
      emptyForm,
    );

  const [
    showForm,
    setShowForm,
  ] =
    useState(false);

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

  async function loadMembers() {
    try {
      setLoading(true);
      setError('');

      const response =
        await apiFetch(
          '/team-members',
        );

      if (
        response.status === 401
      ) {
        handleLogout();
        return;
      }

      if (
        response.status === 403
      ) {
        setError(
          'Você não possui permissão para acessar os usuários da empresa.',
        );

        return;
      }

      const data =
        await readResponse<
          TeamMember[]
        >(response);

      setMembers(data);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Erro ao carregar usuários',
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
        ) as StoredUser;

      setCurrentUser(
        parsed,
      );

      if (
        parsed.membership.role !==
          'OWNER' &&
        parsed.membership.role !==
          'ADMIN'
      ) {
        router.replace(
          '/dashboard',
        );

        return;
      }

      loadMembers();
    } catch {
      handleLogout();
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openCreate() {
    setForm(
      emptyForm,
    );

    setShowForm(true);

    setError('');
    setSuccess('');
  }

  function closeForm() {
    setShowForm(false);

    setForm(
      emptyForm,
    );
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (
      !form.name.trim()
    ) {
      setError(
        'Informe o nome do usuário.',
      );

      return;
    }

    if (
      !form.email.trim()
    ) {
      setError(
        'Informe o e-mail.',
      );

      return;
    }

    if (
      form.password.length < 6
    ) {
      setError(
        'A senha deve possuir pelo menos 6 caracteres.',
      );

      return;
    }

    try {
      setSaving(true);

      setError('');
      setSuccess('');

      const response =
        await apiFetch(
          '/team-members',
          {
            method: 'POST',

            body: JSON.stringify({
              name:
                form.name.trim(),

              email:
                form.email
                  .trim()
                  .toLowerCase(),

              password:
                form.password,

              role:
                form.role,
            }),
          },
        );

      if (
        response.status === 401
      ) {
        handleLogout();
        return;
      }

      await readResponse<TeamMember>(
        response,
      );

      setSuccess(
        'Usuário cadastrado com sucesso.',
      );

      closeForm();

      await loadMembers();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Erro ao cadastrar usuário',
      );
    } finally {
      setSaving(false);
    }
  }

  async function updateRole(
    member: TeamMember,
    role:
      | 'ADMIN'
      | 'RECEPTIONIST'
      | 'STAFF',
  ) {
    try {
      setSaving(true);

      setError('');
      setSuccess('');

      const response =
        await apiFetch(
          `/team-members/${member.id}/role`,
          {
            method: 'PATCH',

            body: JSON.stringify({
              role,
            }),
          },
        );

      if (
        response.status === 401
      ) {
        handleLogout();
        return;
      }

      await readResponse<TeamMember>(
        response,
      );

      setSuccess(
        `Permissão de ${member.user.name} atualizada.`,
      );

      await loadMembers();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Erro ao alterar permissão',
      );
    } finally {
      setSaving(false);
    }
  }

  const isOwner =
    currentUser?.membership.role ===
    'OWNER';

  return (
    <PanelShell
      title="Usuários"
      subtitle="Acessos e permissões da empresa"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">

        <div>
          <p className="text-sm text-zinc-500">
            Controle quem pode acessar o sistema.
          </p>
        </div>

        {isOwner && (
          <button
            onClick={
              openCreate
            }
            className="rounded-lg bg-zinc-900 px-5 py-3 text-sm font-medium text-white hover:bg-zinc-800"
          >
            + Novo usuário
          </button>
        )}
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

      {showForm && isOwner && (
        <section className="mt-6 rounded-2xl bg-white p-6 shadow-sm">

          <div className="flex items-center justify-between">

            <div>
              <h2 className="text-lg font-semibold text-zinc-900">
                Novo usuário
              </h2>

              <p className="mt-1 text-sm text-zinc-500">
                Crie um acesso para uma pessoa da empresa.
              </p>
            </div>

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
                      event.target.value,
                  })
                }
                className="w-full rounded-lg border border-zinc-300 px-4 py-3"
                placeholder="Nome do usuário"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-zinc-700">
                E-mail *
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
                      event.target.value,
                  })
                }
                className="w-full rounded-lg border border-zinc-300 px-4 py-3"
                placeholder="usuario@empresa.com"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-zinc-700">
                Senha inicial *
              </label>

              <input
                type="password"
                value={
                  form.password
                }
                onChange={(
                  event,
                ) =>
                  setForm({
                    ...form,
                    password:
                      event.target.value,
                  })
                }
                className="w-full rounded-lg border border-zinc-300 px-4 py-3"
                placeholder="Mínimo 6 caracteres"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-zinc-700">
                Função *
              </label>

              <select
                value={
                  form.role
                }
                onChange={(
                  event,
                ) =>
                  setForm({
                    ...form,

                    role:
                      event.target
                        .value as
                        | 'ADMIN'
                        | 'RECEPTIONIST'
                        | 'STAFF',
                  })
                }
                className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-3"
              >
                <option value="ADMIN">
                  Administrador
                </option>

                <option value="RECEPTIONIST">
                  Recepção
                </option>

                <option value="STAFF">
                  Funcionário
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
                  : 'Criar usuário'}
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="mt-6 rounded-2xl bg-white p-6 shadow-sm">

        <div className="flex items-center justify-between">

          <div>
            <h2 className="text-lg font-semibold text-zinc-900">
              Usuários da empresa
            </h2>

            <p className="mt-1 text-sm text-zinc-500">
              {members.length}{' '}
              usuário(s) com acesso
            </p>
          </div>
        </div>

        {loading ? (
          <p className="mt-6 text-sm text-zinc-500">
            Carregando...
          </p>
        ) : members.length ===
          0 ? (
          <div className="mt-6 rounded-xl bg-zinc-50 p-8 text-center">

            <p className="text-zinc-500">
              Nenhum usuário encontrado.
            </p>
          </div>
        ) : (
          <div className="mt-6 overflow-x-auto">

            <table className="w-full min-w-[760px] text-left">

              <thead>
                <tr className="border-b border-zinc-200 text-sm text-zinc-500">

                  <th className="px-3 py-3">
                    Usuário
                  </th>

                  <th className="px-3 py-3">
                    E-mail
                  </th>

                  <th className="px-3 py-3">
                    Função
                  </th>

                  <th className="px-3 py-3 text-right">
                    Permissão
                  </th>
                </tr>
              </thead>

              <tbody>
                {members.map(
                  (member) => (
                    <tr
                      key={
                        member.id
                      }
                      className="border-b border-zinc-100"
                    >

                      <td className="px-3 py-4">

                        <div className="flex items-center gap-3">

                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-100 font-semibold text-zinc-700">
                            {member.user.name
                              .charAt(0)
                              .toUpperCase()}
                          </div>

                          <div>
                            <p className="font-medium text-zinc-900">
                              {member.user.name}
                            </p>

                            {currentUser
                              ?.membership
                              .id ===
                              member.id && (
                              <p className="text-xs text-zinc-400">
                                Você
                              </p>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="px-3 py-4 text-sm text-zinc-600">
                        {member.user.email}
                      </td>

                      <td className="px-3 py-4">

                        <span
                          className={
                            member.role ===
                            'OWNER'
                              ? 'rounded-full bg-purple-100 px-3 py-1 text-xs font-medium text-purple-700'
                              : member.role ===
                                  'ADMIN'
                                ? 'rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700'
                                : member.role ===
                                    'RECEPTIONIST'
                                  ? 'rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700'
                                  : 'rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-700'
                          }
                        >
                          {
                            roleLabels[
                              member.role
                            ]
                          }
                        </span>
                      </td>

                      <td className="px-3 py-4 text-right">

                        {member.role ===
                        'OWNER' ? (
                          <span className="text-xs text-zinc-400">
                            Proprietário
                          </span>
                        ) : isOwner ? (
                          <select
                            value={
                              member.role
                            }
                            disabled={
                              saving
                            }
                            onChange={(
                              event,
                            ) =>
                              updateRole(
                                member,

                                event.target
                                  .value as
                                  | 'ADMIN'
                                  | 'RECEPTIONIST'
                                  | 'STAFF',
                              )
                            }
                            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
                          >
                            <option value="ADMIN">
                              Administrador
                            </option>

                            <option value="RECEPTIONIST">
                              Recepção
                            </option>

                            <option value="STAFF">
                              Funcionário
                            </option>
                          </select>
                        ) : (
                          <span className="text-xs text-zinc-400">
                            Somente leitura
                          </span>
                        )}
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-6 rounded-2xl border border-zinc-200 bg-zinc-50 p-5">

        <h3 className="font-semibold text-zinc-900">
          Sobre as funções
        </h3>

        <div className="mt-4 grid gap-3 md:grid-cols-2">

          <div className="rounded-xl bg-white p-4">
            <p className="font-medium text-zinc-900">
              Proprietário
            </p>

            <p className="mt-1 text-sm text-zinc-500">
              Responsável principal pela empresa e pelos acessos.
            </p>
          </div>

          <div className="rounded-xl bg-white p-4">
            <p className="font-medium text-zinc-900">
              Administrador
            </p>

            <p className="mt-1 text-sm text-zinc-500">
              Pode gerenciar as principais áreas da operação.
            </p>
          </div>

          <div className="rounded-xl bg-white p-4">
            <p className="font-medium text-zinc-900">
              Recepção
            </p>

            <p className="mt-1 text-sm text-zinc-500">
              Destinado ao atendimento e gerenciamento da agenda.
            </p>
          </div>

          <div className="rounded-xl bg-white p-4">
            <p className="font-medium text-zinc-900">
              Funcionário
            </p>

            <p className="mt-1 text-sm text-zinc-500">
              Perfil com acesso mais restrito.
            </p>
          </div>
        </div>
      </section>
    </PanelShell>
  );
}