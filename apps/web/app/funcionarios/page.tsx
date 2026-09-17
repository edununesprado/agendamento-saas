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

type Employee = {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  active: boolean;
};

type Service = {
  id: string;
  name: string;
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

type EmployeeForm = {
  name: string;
  email: string;
  phone: string;
};

const emptyForm: EmployeeForm = {
  name: '',
  email: '',
  phone: '',
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

export default function EmployeesPage() {
  const router = useRouter();

  const [
    currentUser,
    setCurrentUser,
  ] =
    useState<CurrentUser | null>(
      null,
    );

  const [
    employees,
    setEmployees,
  ] =
    useState<Employee[]>([]);

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
    editingEmployee,
    setEditingEmployee,
  ] =
    useState<Employee | null>(
      null,
    );

  const [form, setForm] =
    useState<EmployeeForm>(
      emptyForm,
    );

  // Serviços do funcionário
  const [
    serviceEmployee,
    setServiceEmployee,
  ] =
    useState<Employee | null>(
      null,
    );

  const [
    selectedServiceIds,
    setSelectedServiceIds,
  ] =
    useState<string[]>([]);

  const [
    loadingServices,
    setLoadingServices,
  ] =
    useState(false);

  function handleLogout() {
    localStorage.removeItem(
      'accessToken',
    );

    localStorage.removeItem(
      'currentUser',
    );

    router.replace('/login');
  }

  async function loadEmployees(
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
          `/employees?status=${targetStatus}`,
        );

      if (response.status === 401) {
        handleLogout();
        return;
      }

      const data =
        await readResponse<Employee[]>(
          response,
        );

      setEmployees(data);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Erro ao carregar funcionários',
      );
    } finally {
      setLoading(false);
    }
  }

  async function loadServices() {
    try {
      const response =
        await apiFetch(
          '/services?status=active',
        );

      const data =
        await readResponse<Service[]>(
          response,
        );

      setServices(data);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Erro ao carregar serviços',
      );
    }
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

      if (!token || !storedUser) {
        router.replace('/login');
        return;
      }

      try {
        const parsed =
          JSON.parse(
            storedUser,
          ) as CurrentUser;

        setCurrentUser(parsed);

        await Promise.all([
          loadEmployees('active'),
          loadServices(),
        ]);
      } catch {
        handleLogout();
      }
    }

    initialize();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredEmployees =
    useMemo(() => {
      const value =
        search
          .trim()
          .toLowerCase();

      if (!value) {
        return employees;
      }

      return employees.filter(
        (employee) =>
          employee.name
            .toLowerCase()
            .includes(value) ||
          employee.email
            ?.toLowerCase()
            .includes(value) ||
          employee.phone
            ?.toLowerCase()
            .includes(value),
      );
    }, [employees, search]);

  function openCreate() {
    setEditingEmployee(null);
    setForm(emptyForm);
    setShowForm(true);
    setError('');
    setSuccess('');
  }

  function openEdit(
    employee: Employee,
  ) {
    setEditingEmployee(employee);

    setForm({
      name: employee.name,
      email:
        employee.email ?? '',
      phone:
        employee.phone ?? '',
    });

    setShowForm(true);
    setError('');
    setSuccess('');
  }

  function closeForm() {
    setShowForm(false);
    setEditingEmployee(null);
    setForm(emptyForm);
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (!form.name.trim()) {
      setError(
        'Informe o nome do funcionário.',
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
      };

      const response =
        editingEmployee
          ? await apiFetch(
              `/employees/${editingEmployee.id}`,
              {
                method: 'PATCH',
                body: JSON.stringify(
                  payload,
                ),
              },
            )
          : await apiFetch(
              '/employees',
              {
                method: 'POST',
                body: JSON.stringify(
                  payload,
                ),
              },
            );

      await readResponse<Employee>(
        response,
      );

      setSuccess(
        editingEmployee
          ? 'Funcionário atualizado com sucesso.'
          : 'Funcionário cadastrado com sucesso.',
      );

      closeForm();

      await loadEmployees();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Erro ao salvar funcionário',
      );
    } finally {
      setSaving(false);
    }
  }

  async function deactivateEmployee(
    employee: Employee,
  ) {
    const confirmed =
      window.confirm(
        `Deseja desativar ${employee.name}?`,
      );

    if (!confirmed) {
      return;
    }

    try {
      setError('');
      setSuccess('');

      const response =
        await apiFetch(
          `/employees/${employee.id}`,
          {
            method: 'DELETE',
          },
        );

      await readResponse<Employee>(
        response,
      );

      setSuccess(
        'Funcionário desativado com sucesso.',
      );

      await loadEmployees();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Erro ao desativar funcionário',
      );
    }
  }

  async function restoreEmployee(
    employee: Employee,
  ) {
    try {
      setError('');
      setSuccess('');

      const response =
        await apiFetch(
          `/employees/${employee.id}/restore`,
          {
            method: 'PATCH',
          },
        );

      await readResponse<Employee>(
        response,
      );

      setSuccess(
        'Funcionário reativado com sucesso.',
      );

      await loadEmployees();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Erro ao reativar funcionário',
      );
    }
  }

  async function openServices(
    employee: Employee,
  ) {
    try {
      setError('');
      setSuccess('');
      setLoadingServices(true);

      setServiceEmployee(
        employee,
      );

      const response =
        await apiFetch(
          `/employees/${employee.id}/services`,
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

      const ids =
        data.map((item) => {
          if ('service' in item) {
            return item.service.id;
          }

          return item.id;
        });

      setSelectedServiceIds(
        ids,
      );
    } catch (err) {
      setServiceEmployee(null);

      setError(
        err instanceof Error
          ? err.message
          : 'Erro ao carregar serviços do funcionário',
      );
    } finally {
      setLoadingServices(false);
    }
  }

  function toggleService(
    serviceId: string,
  ) {
    setSelectedServiceIds(
      (current) =>
        current.includes(serviceId)
          ? current.filter(
              (id) =>
                id !== serviceId,
            )
          : [
              ...current,
              serviceId,
            ],
    );
  }

  async function saveEmployeeServices() {
    if (!serviceEmployee) {
      return;
    }

    try {
      setSaving(true);
      setError('');
      setSuccess('');

      const response =
        await apiFetch(
          `/employees/${serviceEmployee.id}/services`,
          {
            method: 'PUT',

            body: JSON.stringify({
              serviceIds:
                selectedServiceIds,
            }),
          },
        );

      await readResponse<unknown>(
        response,
      );

      setSuccess(
        'Serviços do funcionário atualizados com sucesso.',
      );

      setServiceEmployee(null);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Erro ao atualizar serviços',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-100">
      <div className="flex min-h-screen">

        {/* MENU */}
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

            <button className="w-full rounded-lg px-4 py-3 text-left text-sm text-zinc-300 hover:bg-zinc-900">
              Serviços
            </button>
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
                'Funcionários'}
            </h2>

            <p className="text-sm text-zinc-500">
              Equipe e serviços realizados
            </p>
          </header>

          <div className="p-4 md:p-6">

            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h1 className="text-2xl font-bold text-zinc-900">
                  Funcionários
                </h1>

                <p className="mt-1 text-sm text-zinc-500">
                  Gerencie sua equipe profissional.
                </p>
              </div>

              <button
                onClick={openCreate}
                className="rounded-lg bg-zinc-900 px-5 py-3 text-sm font-medium text-white hover:bg-zinc-800"
              >
                + Novo funcionário
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
                    {editingEmployee
                      ? 'Editar funcionário'
                      : 'Novo funcionário'}
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
                            event.target
                              .value,
                        })
                      }
                      className="w-full rounded-lg border border-zinc-300 px-4 py-3"
                      placeholder="Nome do profissional"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-zinc-700">
                      Telefone
                    </label>

                    <input
                      value={form.phone}
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

                  <div className="md:col-span-2">
                    <label className="mb-2 block text-sm font-medium text-zinc-700">
                      E-mail
                    </label>

                    <input
                      type="email"
                      value={form.email}
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
                      placeholder="profissional@email.com"
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
                        : editingEmployee
                          ? 'Salvar alterações'
                          : 'Cadastrar funcionário'}
                    </button>
                  </div>
                </form>
              </section>
            )}

            {/* VÍNCULO DE SERVIÇOS */}
            {serviceEmployee && (
              <section className="mt-6 rounded-2xl border border-blue-200 bg-blue-50 p-6">

                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold text-zinc-900">
                      Serviços de {serviceEmployee.name}
                    </h2>

                    <p className="mt-1 text-sm text-zinc-600">
                      Selecione os serviços que este profissional realiza.
                    </p>
                  </div>

                  <button
                    onClick={() =>
                      setServiceEmployee(
                        null,
                      )
                    }
                    className="text-sm text-zinc-500"
                  >
                    Fechar
                  </button>
                </div>

                {loadingServices ? (
                  <p className="mt-5 text-sm text-zinc-500">
                    Carregando...
                  </p>
                ) : services.length ===
                  0 ? (
                  <p className="mt-5 text-sm text-zinc-500">
                    Nenhum serviço ativo cadastrado.
                  </p>
                ) : (
                  <div className="mt-5 grid gap-3 md:grid-cols-2">
                    {services.map(
                      (service) => (
                        <label
                          key={
                            service.id
                          }
                          className="flex cursor-pointer items-center gap-3 rounded-xl border border-blue-100 bg-white p-4"
                        >
                          <input
                            type="checkbox"
                            checked={selectedServiceIds.includes(
                              service.id,
                            )}
                            onChange={() =>
                              toggleService(
                                service.id,
                              )
                            }
                            className="h-4 w-4"
                          />

                          <div>
                            <p className="font-medium text-zinc-900">
                              {service.name}
                            </p>

                            <p className="text-xs text-zinc-500">
                              {
                                service.durationMin
                              }{' '}
                              min •{' '}
                              {formatCurrency(
                                service.priceCents,
                              )}
                            </p>
                          </div>
                        </label>
                      ),
                    )}
                  </div>
                )}

                <button
                  onClick={
                    saveEmployeeServices
                  }
                  disabled={saving}
                  className="mt-5 rounded-lg bg-blue-600 px-5 py-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  {saving
                    ? 'Salvando...'
                    : 'Salvar serviços'}
                </button>
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
                      event.target
                        .value,
                    )
                  }
                  placeholder="Buscar funcionário..."
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

                    await loadEmployees(
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
                  Equipe
                </h2>

                <span className="text-sm text-zinc-500">
                  {
                    filteredEmployees.length
                  }{' '}
                  funcionário(s)
                </span>
              </div>

              {loading ? (
                <p className="mt-6 text-sm text-zinc-500">
                  Carregando...
                </p>
              ) : filteredEmployees.length ===
                0 ? (
                <div className="mt-6 rounded-xl bg-zinc-50 p-8 text-center">
                  <p className="text-zinc-500">
                    Nenhum funcionário encontrado.
                  </p>
                </div>
              ) : (
                <div className="mt-5 overflow-x-auto">

                  <table className="w-full min-w-[720px] text-left">

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
                          Status
                        </th>

                        <th className="px-3 py-3 text-right">
                          Ações
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {filteredEmployees.map(
                        (employee) => (
                          <tr
                            key={
                              employee.id
                            }
                            className="border-b border-zinc-100"
                          >
                            <td className="px-3 py-4 font-medium text-zinc-900">
                              {
                                employee.name
                              }
                            </td>

                            <td className="px-3 py-4 text-sm text-zinc-600">
                              {employee.phone ||
                                '-'}
                            </td>

                            <td className="px-3 py-4 text-sm text-zinc-600">
                              {employee.email ||
                                '-'}
                            </td>

                            <td className="px-3 py-4">
                              <span
                                className={
                                  employee.active
                                    ? 'rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700'
                                    : 'rounded-full bg-zinc-200 px-3 py-1 text-xs font-medium text-zinc-600'
                                }
                              >
                                {employee.active
                                  ? 'Ativo'
                                  : 'Inativo'}
                              </span>
                            </td>

                            <td className="px-3 py-4">
                              <div className="flex justify-end gap-2">

                                <button
                                  onClick={() =>
                                    openServices(
                                      employee,
                                    )
                                  }
                                  className="rounded-lg border border-blue-300 px-3 py-2 text-xs font-medium text-blue-700 hover:bg-blue-50"
                                >
                                  Serviços
                                </button>

                                <button
                                  onClick={() =>
                                    openEdit(
                                      employee,
                                    )
                                  }
                                  className="rounded-lg border border-zinc-300 px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                                >
                                  Editar
                                </button>

                                {employee.active ? (
                                  <button
                                    onClick={() =>
                                      deactivateEmployee(
                                        employee,
                                      )
                                    }
                                    className="rounded-lg border border-red-300 px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-50"
                                  >
                                    Desativar
                                  </button>
                                ) : (
                                  <button
                                    onClick={() =>
                                      restoreEmployee(
                                        employee,
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