'use client';
import {
  FormEvent,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useRouter } from 'next/navigation';
import { PanelShell } from '@/components/panel-shell';
import { API_URL, apiFetch } from '@/lib/api';
import { getTenantLogoUrl } from '@/lib/tenant-logo';
type Tenant = {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string | null;
  hasStoredLogo?: boolean;
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
type SettingsTab =
  | 'empresa'
  | 'aparencia'
  | 'agendamento'
  | 'notificacoes';
const DEFAULT_COLOR = '#18181b';
const INITIAL_FORM: TenantForm = {
  name: '',
  logoUrl: '',
  primaryColor: DEFAULT_COLOR,
  phone: '',
  email: '',
  timezone: 'America/Sao_Paulo',
  bookingMinAdvanceMinutes: 60,
  bookingMaxAdvanceDays: 7,
  appointmentRemindersEnabled: true,
  appointmentReminderHoursBefore: 24,
};
const TABS: {
  id: SettingsTab;
  label: string;
  description: string;
}[] = [
  {
    id: 'empresa',
    label: 'Empresa',
    description: 'Dados e informações de contato',
  },
  {
    id: 'aparencia',
    label: 'Aparência',
    description: 'Logo e identidade visual',
  },
  {
    id: 'agendamento',
    label: 'Agendamento',
    description: 'Regras da agenda pública',
  },
  {
    id: 'notificacoes',
    label: 'Notificações',
    description: 'Lembretes automáticos',
  },
];
const TAB_FIELDS: Record<
  SettingsTab,
  (keyof TenantForm)[]
> = {
  empresa: [
    'name',
    'phone',
    'email',
  ],
  aparencia: [
    'primaryColor',
  ],
  agendamento: [
    'timezone',
    'bookingMinAdvanceMinutes',
    'bookingMaxAdvanceDays',
  ],
  notificacoes: [
    'appointmentRemindersEnabled',
    'appointmentReminderHoursBefore',
  ],
};
const INPUT_CLASS =
  'w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 ' +
  'text-sm text-zinc-900 outline-none transition ' +
  'focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10 ' +
  'disabled:cursor-not-allowed disabled:bg-zinc-100';
const LABEL_CLASS =
  'mb-2 block text-sm font-medium text-zinc-700';
const TIMEZONES = [
  {
    value: 'America/Sao_Paulo',
    label: 'Brasília / São Paulo',
  },
  {
    value: 'America/Manaus',
    label: 'Manaus',
  },
  {
    value: 'America/Cuiaba',
    label: 'Cuiabá',
  },
  {
    value: 'America/Rio_Branco',
    label: 'Rio Branco',
  },
  {
    value: 'America/Noronha',
    label: 'Fernando de Noronha',
  },
];
function tenantToForm(tenant: Tenant): TenantForm {
  return {
    name: tenant.name ?? '',
    logoUrl: tenant.logoUrl ?? '',
    primaryColor:
      tenant.primaryColor || DEFAULT_COLOR,
    phone: tenant.phone ?? '',
    email: tenant.email ?? '',
    timezone:
      tenant.timezone || 'America/Sao_Paulo',
    bookingMinAdvanceMinutes:
      tenant.bookingMinAdvanceMinutes ?? 60,
    bookingMaxAdvanceDays:
      tenant.bookingMaxAdvanceDays ?? 7,
    appointmentRemindersEnabled:
      tenant.appointmentRemindersEnabled ?? true,
    appointmentReminderHoursBefore:
      tenant.appointmentReminderHoursBefore ?? 24,
  };
}
function pickTabValues(
  form: TenantForm,
  tab: SettingsTab,
): Partial<TenantForm> {
  return Object.fromEntries(
    TAB_FIELDS[tab].map((key) => [
      key,
      form[key],
    ]),
  ) as Partial<TenantForm>;
}
function isTabDirty(
  form: TenantForm,
  savedForm: TenantForm,
  tab: SettingsTab,
): boolean {
  return TAB_FIELDS[tab].some(
    (key) => form[key] !== savedForm[key],
  );
}
function isValidColor(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}
function getContrastColor(hex: string): string {
  if (!isValidColor(hex)) {
    return '#ffffff';
  }
  const red = parseInt(hex.slice(1, 3), 16);
  const green = parseInt(hex.slice(3, 5), 16);
  const blue = parseInt(hex.slice(5, 7), 16);
  const brightness =
    (red * 299 + green * 587 + blue * 114) /
    1000;
  return brightness > 180
    ? '#18181b'
    : '#ffffff';
}
async function readResponse<T>(
  response: Response,
): Promise<T> {
  const data = await response
    .json()
    .catch(() => null);
  if (!response.ok) {
    const message = Array.isArray(data?.message)
      ? data.message.join(', ')
      : data?.message ??
        'Não foi possível concluir a operação.';
    throw new Error(message);
  }
  return data as T;
}
function buildPayload(
  form: TenantForm,
  tab: SettingsTab,
): Record<string, string | number | boolean | null> {
  switch (tab) {
    case 'empresa':
      return {
        name: form.name.trim(),
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
      };
    case 'aparencia':
      // A logo fica no PostgreSQL e usa um endpoint multipart separado.
      return {
        primaryColor: form.primaryColor,
      };
    case 'agendamento':
      return {
        timezone: form.timezone,
        bookingMinAdvanceMinutes:
          form.bookingMinAdvanceMinutes,
        bookingMaxAdvanceDays:
          form.bookingMaxAdvanceDays,
      };
    case 'notificacoes':
      return {
        appointmentRemindersEnabled:
          form.appointmentRemindersEnabled,
        appointmentReminderHoursBefore:
          form.appointmentReminderHoursBefore,
      };
  }
}
function validateTab(
  form: TenantForm,
  tab: SettingsTab,
): string | null {
  if (tab === 'empresa') {
    if (form.name.trim().length < 2) {
      return 'Informe um nome de empresa com pelo menos 2 caracteres.';
    }
    if (
      form.email.trim() &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
        form.email.trim(),
      )
    ) {
      return 'Informe um e-mail válido.';
    }
  }
  if (tab === 'aparencia') {
    if (!isValidColor(form.primaryColor)) {
      return 'A cor principal deve estar no formato #RRGGBB.';
    }
  }
  if (tab === 'agendamento') {
    const min = form.bookingMinAdvanceMinutes;
    const max = form.bookingMaxAdvanceDays;
    if (
      !Number.isInteger(min) ||
      min < 0 ||
      min > 1440
    ) {
      return 'A antecedência mínima deve estar entre 0 e 1440 minutos.';
    }
    if (
      !Number.isInteger(max) ||
      max < 1 ||
      max > 365
    ) {
      return 'A agenda deve estar aberta entre 1 e 365 dias.';
    }
    if (!form.timezone.trim()) {
      return 'Selecione o fuso horário da empresa.';
    }
  }
  if (tab === 'notificacoes') {
    const hours =
      form.appointmentReminderHoursBefore;
    if (
      !Number.isInteger(hours) ||
      hours < 1 ||
      hours > 168
    ) {
      return 'A antecedência do lembrete deve estar entre 1 e 168 horas.';
    }
  }
  return null;
}
export default function SettingsPage() {
  const router = useRouter();
  const [tenant, setTenant] =
    useState<Tenant | null>(null);
  const [form, setForm] =
    useState<TenantForm>(INITIAL_FORM);
  const [savedForm, setSavedForm] =
    useState<TenantForm>(INITIAL_FORM);
  const [activeTab, setActiveTab] =
    useState<SettingsTab>('empresa');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [copied, setCopied] = useState(false);
  // Logo selecionada ainda nao foi persistida.
  const [selectedLogo, setSelectedLogo] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoRevision, setLogoRevision] = useState(0);
  const [removingLogo, setRemovingLogo] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const storedLogoUrl = getTenantLogoUrl(tenant, logoRevision);
  const displayedLogoUrl = logoPreview || storedLogoUrl;
  const dirtyTabs = TABS.filter((tab) =>
    isTabDirty(form, savedForm, tab.id) ||
    (tab.id === 'aparencia' && selectedLogo !== null),
  );
  const hasUnsavedChanges = dirtyTabs.length > 0;
  const activeTabDirty =
    isTabDirty(form, savedForm, activeTab) ||
    (activeTab === 'aparencia' && selectedLogo !== null);
  const primaryColor = isValidColor(
    form.primaryColor,
  )
    ? form.primaryColor
    : DEFAULT_COLOR;
  const buttonTextColor =
    getContrastColor(primaryColor);
  const publicBookingUrl =
    tenant && typeof window !== 'undefined'
      ? `${window.location.origin}/agendar/${tenant.slug}`
      : '';
  function handleLogout() {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('currentUser');
    router.replace('/login');
  }
  useEffect(() => {
    let active = true;
    async function loadTenant() {
      const token = localStorage.getItem(
        'accessToken',
      );
      if (!token) {
        router.replace('/login');
        return;
      }
      try {
        const response = await apiFetch(
          '/tenants/current',
        );
        if (response.status === 401) {
          handleLogout();
          return;
        }
        const data =
          await readResponse<Tenant>(response);
        if (!active) return;
        const initial = tenantToForm(data);
        setTenant(data);
        setForm(initial);
        setSavedForm(initial);
      } catch (err) {
        if (!active) return;
        setError(
          err instanceof Error
            ? err.message
            : 'Erro ao carregar as configurações.',
        );
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }
    loadTenant();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    return () => {
      if (logoPreview) URL.revokeObjectURL(logoPreview);
    };
  }, [logoPreview]);
  /*
   * Protege alterações em caso de fechamento
   * ou recarregamento da página.
   *
   * A troca entre abas preserva as edições
   * em memória, mesmo antes de salvar.
   */
  useEffect(() => {
    if (!hasUnsavedChanges) {
      return;
    }
    function warnBeforeUnload(
      event: BeforeUnloadEvent,
    ) {
      event.preventDefault();
      event.returnValue = '';
    }
    window.addEventListener(
      'beforeunload',
      warnBeforeUnload,
    );
    return () => {
      window.removeEventListener(
        'beforeunload',
        warnBeforeUnload,
      );
    };
  }, [hasUnsavedChanges]);
  function changeTab(tab: SettingsTab) {
    if (saving || removingLogo) return;
    setActiveTab(tab);
    setError('');
    setSuccess('');
  }
  function updateField<K extends keyof TenantForm>(
    field: K,
    value: TenantForm[K],
  ) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
    setError('');
    setSuccess('');
  }
  function discardActiveChanges() {
    if (activeTab === 'aparencia') {
      setSelectedLogo(null);
      setLogoPreview(null);
      if (logoInputRef.current) logoInputRef.current.value = '';
    }
    setForm((current) => ({
      ...current,
      ...pickTabValues(savedForm, activeTab),
    }));
    setError('');
    setSuccess('');
  }
  async function handleCopyPublicLink() {
    if (!publicBookingUrl) return;
    try {
      await navigator.clipboard.writeText(
        publicBookingUrl,
      );
      setCopied(true);
      window.setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch {
      setError(
        'Não foi possível copiar o link automaticamente.',
      );
    }
  }
  function handleOpenPublicPage() {
    if (!publicBookingUrl) return;
    window.open(
      publicBookingUrl,
      '_blank',
      'noopener,noreferrer',
    );
  }
  function selectLogo(file: File | undefined) {
    if (!file) return;
    const allowed = ['image/png', 'image/jpeg', 'image/webp'];
    if (!allowed.includes(file.type)) {
      setError('Escolha uma imagem PNG, JPEG ou WebP.');
      if (logoInputRef.current) logoInputRef.current.value = '';
      return;
    }
    if (file.size === 0 || file.size > 2 * 1024 * 1024) {
      setError('A imagem deve ter entre 1 byte e 2 MB.');
      if (logoInputRef.current) logoInputRef.current.value = '';
      return;
    }
    setSelectedLogo(file);
    setLogoPreview(URL.createObjectURL(file));
    setError('');
    setSuccess('');
  }
  function synchronizeStoredTenant(updated: Tenant) {
    const storedUser = localStorage.getItem('currentUser');
    if (storedUser) {
      try {
        const parsed = JSON.parse(storedUser);
        localStorage.setItem(
          'currentUser',
          JSON.stringify({ ...parsed, tenant: updated }),
        );
      } catch {
        // Cache corrompido nao invalida uma operacao concluida na API.
      }
    }
    window.dispatchEvent(new Event('tenant-updated'));
  }
  async function loadCurrentTenant(): Promise<Tenant | null> {
    const response = await apiFetch('/tenants/current');
    if (response.status === 401) {
      handleLogout();
      return null;
    }
    return readResponse<Tenant>(response);
  }
  async function handleRemoveLogo() {
    if (saving || removingLogo) return;
    if (!tenant?.hasStoredLogo && !tenant?.logoUrl) {
      setSelectedLogo(null);
      setLogoPreview(null);
      return;
    }
    if (!window.confirm('Deseja remover a logo da empresa?')) return;
    setError('');
    setSuccess('');
    setRemovingLogo(true);
    try {
      const response = await apiFetch('/tenants/current/logo', {
        method: 'DELETE',
      });
      if (response.status === 401) {
        handleLogout();
        return;
      }
      await readResponse(response);
      const updated = await loadCurrentTenant();
      if (!updated) return;
      setTenant(updated);
      setLogoRevision(Date.now());
      setSelectedLogo(null);
      setLogoPreview(null);
      if (logoInputRef.current) logoInputRef.current.value = '';
      setForm((current) => ({ ...current, logoUrl: updated.logoUrl || '' }));
      setSavedForm((current) => ({
        ...current,
        logoUrl: updated.logoUrl || '',
      }));
      synchronizeStoredTenant(updated);
      setSuccess('Logo removida com sucesso.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao remover a logo.');
    } finally {
      setRemovingLogo(false);
    }
  }
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || removingLogo || !activeTabDirty) return;
    setError('');
    setSuccess('');
    const validationError = validateTab(form, activeTab);
    if (validationError) {
      setError(validationError);
      return;
    }
    try {
      setSaving(true);
      const changedFields = isTabDirty(form, savedForm, activeTab);
      // As configuracoes comuns continuam no PATCH JSON da aba ativa.
      if (changedFields) {
        const response = await apiFetch('/tenants/current', {
          method: 'PATCH',
          body: JSON.stringify(buildPayload(form, activeTab)),
        });
        if (response.status === 401) {
          handleLogout();
          return;
        }
        await readResponse<Tenant>(response);
      }
      // O upload multipart deve ir diretamente ao fetch: apiFetch sempre
      // adiciona Content-Type: application/json, incompatível com FormData.
      if (activeTab === 'aparencia' && selectedLogo) {
        const token = localStorage.getItem('accessToken');
        if (!token) {
          handleLogout();
          return;
        }
        const data = new FormData();
        data.append('logo', selectedLogo, selectedLogo.name);
        const response = await fetch(
          `${API_URL.replace(/\/+$/, '')}/tenants/current/logo`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
            },
            body: data,
          },
        );
        if (response.status === 401) {
          handleLogout();
          return;
        }
        await readResponse(response);
      }
      const updated = await loadCurrentTenant();
      if (!updated) return;
      // Atualiza apenas os dados da aba salva, preservando edicoes nas outras.
      const updatedForm = tenantToForm(updated);
      const savedValues = pickTabValues(updatedForm, activeTab);
      setTenant(updated);
      setSavedForm((current) => ({ ...current, ...savedValues }));
      setForm((current) => ({ ...current, ...savedValues }));
      // Alteracoes pendentes de imagem nao sao descartadas quando salvamos
      // outra aba, como Empresa, Agendamento ou Notificacoes.
      if (activeTab === 'aparencia') {
        setSelectedLogo(null);
        setLogoPreview(null);
        setLogoRevision(Date.now());
        if (logoInputRef.current) logoInputRef.current.value = '';
      }
      synchronizeStoredTenant(updated);
      setSuccess('Configurações desta seção salvas com sucesso.');
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Erro ao salvar as configurações.',
      );
    } finally {
      setSaving(false);
    }
  }
  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-100">
        <div className="text-center">
          <div className="mx-auto h-9 w-9 animate-spin rounded-full border-4 border-zinc-200 border-t-zinc-900" />
          <p className="mt-4 text-sm text-zinc-500">
            Carregando configurações...
          </p>
        </div>
      </main>
    );
  }
  if (!tenant) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-100 px-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-sm">
          <h1 className="text-lg font-semibold text-zinc-900">
            Configurações indisponíveis
          </h1>
          <p className="mt-3 text-sm text-red-600">
            {error || 'Empresa não encontrada.'}
          </p>
          <button
            type="button"
            onClick={() => router.push('/dashboard')}
            className="mt-5 rounded-xl bg-zinc-900 px-5 py-3 text-sm font-medium text-white"
          >
            Voltar ao painel
          </button>
        </div>
      </main>
    );
  }
  return (
    <PanelShell
      title="Configurações"
      subtitle="Gerencie sua empresa, identidade visual, agendamento e notificações"
    >
      <div className="mx-auto max-w-6xl space-y-6">
        {/* CABEÇALHO */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-zinc-900">
              Central de Configurações
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              Personalize sua empresa sem afetar
              as configurações de outras seções.
            </p>
          </div>
          {hasUnsavedChanges ? (
            <span className="rounded-full bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-800">
              {dirtyTabs.length === 1
                ? '1 seção com alterações não salvas'
                : `${dirtyTabs.length} seções com alterações não salvas`}
            </span>
          ) : (
            <span className="rounded-full bg-green-100 px-3 py-1.5 text-xs font-semibold text-green-800">
              Configurações sincronizadas
            </span>
          )}
        </div>
        {/* LINK PÚBLICO */}
        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0 flex-1">
              <h3 className="text-base font-semibold text-zinc-900">
                Link público de agendamento
              </h3>
              <p className="mt-1 text-sm text-zinc-500">
                Compartilhe com seus clientes para
                receber solicitações de agendamento.
              </p>
              <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3">
                <p className="break-all font-mono text-xs text-zinc-700 sm:text-sm">
                  {publicBookingUrl}
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={handleCopyPublicLink}
                className="rounded-xl border border-zinc-300 bg-white px-5 py-3 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
              >
                {copied ? 'Link copiado!' : 'Copiar link'}
              </button>
              <button
                type="button"
                onClick={handleOpenPublicPage}
                className="rounded-xl bg-zinc-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-zinc-800"
              >
                Abrir página pública
              </button>
            </div>
          </div>
        </section>
        {/* NAVEGAÇÃO DAS CONFIGURAÇÕES */}
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {TABS.map((tab) => {
            const selected = activeTab === tab.id;
            const dirty =
              isTabDirty(form, savedForm, tab.id) ||
              (tab.id === 'aparencia' && selectedLogo !== null);
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => changeTab(tab.id)}
                disabled={saving || removingLogo}
                aria-pressed={selected}
                className={`relative rounded-2xl border px-4 py-4 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${
                  selected
                    ? 'border-zinc-900 bg-zinc-900 text-white shadow-md'
                    : 'border-zinc-200 bg-white text-zinc-800 hover:border-zinc-400'
                }`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold">
                    {tab.label}
                  </span>
                  {dirty && (
                    <span
                      className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                        selected
                          ? 'bg-amber-300'
                          : 'bg-amber-500'
                      }`}
                      aria-label="Alterações não salvas"
                      title="Alterações não salvas"
                    />
                  )}
                </span>
                <span
                  className={`mt-1 block text-xs ${
                    selected
                      ? 'text-zinc-300'
                      : 'text-zinc-500'
                  }`}
                >
                  {tab.description}
                </span>
              </button>
            );
          })}
        </div>
        {/* MENSAGENS */}
        <div aria-live="polite">
          {error && (
            <div
              role="alert"
              className="mb-4 rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700"
            >
              {error}
            </div>
          )}
          {success && (
            <div
              role="status"
              className="mb-4 rounded-xl border border-green-200 bg-green-50 px-5 py-4 text-sm text-green-800"
            >
              {success}
            </div>
          )}
        </div>
        {/* CONTEÚDO PRINCIPAL */}
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <form
            onSubmit={handleSubmit}
            className="min-w-0 space-y-5"
          >
            <fieldset
              disabled={saving || removingLogo}
              className="min-w-0"
            >
              {/* EMPRESA */}
              {activeTab === 'empresa' && (
                <section className="rounded-2xl bg-white p-5 shadow-sm sm:p-7">
                  <div>
                    <h3 className="text-lg font-bold text-zinc-900">
                      Dados da empresa
                    </h3>
                    <p className="mt-1 text-sm text-zinc-500">
                      Informações utilizadas para identificar
                      sua empresa e facilitar o contato.
                    </p>
                  </div>
                  <div className="mt-6 grid gap-5 md:grid-cols-2">
                    <div className="md:col-span-2">
                      <label
                        htmlFor="tenant-name"
                        className={LABEL_CLASS}
                      >
                        Nome da empresa *
                      </label>
                      <input
                        id="tenant-name"
                        value={form.name}
                        onChange={(event) =>
                          updateField(
                            'name',
                            event.target.value,
                          )
                        }
                        minLength={2}
                        maxLength={120}
                        required
                        className={INPUT_CLASS}
                        placeholder="Barbearia Alpha"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="tenant-phone"
                        className={LABEL_CLASS}
                      >
                        Telefone
                      </label>
                      <input
                        id="tenant-phone"
                        type="tel"
                        value={form.phone}
                        onChange={(event) =>
                          updateField(
                            'phone',
                            event.target.value,
                          )
                        }
                        className={INPUT_CLASS}
                        placeholder="(34) 99999-9999"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="tenant-email"
                        className={LABEL_CLASS}
                      >
                        E-mail
                      </label>
                      <input
                        id="tenant-email"
                        type="email"
                        value={form.email}
                        onChange={(event) =>
                          updateField(
                            'email',
                            event.target.value,
                          )
                        }
                        className={INPUT_CLASS}
                        placeholder="contato@empresa.com"
                      />
                    </div>
                  </div>
                  <div className="mt-6 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                      Identificador da empresa
                    </p>
                    <p className="mt-2 font-mono text-sm text-zinc-800">
                      {tenant.slug}
                    </p>
                    <p className="mt-2 text-xs text-zinc-500">
                      Esse identificador faz parte do link
                      público e não é alterado nesta tela.
                    </p>
                  </div>
                </section>
              )}
              {/* APARÊNCIA */}
              {activeTab === 'aparencia' && (
                <section className="rounded-2xl bg-white p-5 shadow-sm sm:p-7">
                  <div>
                    <h3 className="text-lg font-bold text-zinc-900">
                      Identidade visual
                    </h3>
                    <p className="mt-1 text-sm text-zinc-500">
                      Personalize o visual utilizado no
                      painel e na página pública.
                    </p>
                  </div>
                  <div className="mt-6 space-y-6">
                    <div>
                      <label htmlFor="tenant-logo" className={LABEL_CLASS}>
                        Logo da empresa
                      </label>
                      <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-5">
                        <div className="flex flex-wrap items-center gap-4">
                          <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-zinc-200 bg-white p-2">
                            {displayedLogoUrl ? (
                              <img
                                src={displayedLogoUrl}
                                alt="Prévia da logo"
                                className="max-h-full max-w-full object-contain"
                              />
                            ) : (
                              <span className="text-xs text-zinc-400">Sem logo</span>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-zinc-900">
                              {selectedLogo ? selectedLogo.name : 'Imagem da empresa'}
                            </p>
                            <p className="mt-1 text-xs text-zinc-500">
                              PNG, JPG ou WebP com até 2 MB. O servidor converte
                              a imagem para WebP e a armazena no PostgreSQL.
                            </p>
                            {selectedLogo && (
                              <p className="mt-2 text-xs font-medium text-amber-700">
                                Imagem selecionada. Clique em Salvar alterações para enviar.
                              </p>
                            )}
                            {tenant?.hasStoredLogo && !selectedLogo && (
                              <p className="mt-2 text-xs font-medium text-green-700">
                                Logo armazenada no banco de dados.
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="mt-5 flex flex-wrap items-center gap-3">
                          <input
                            id="tenant-logo"
                            ref={logoInputRef}
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            onChange={(event) => selectLogo(event.target.files?.[0])}
                            className="block w-full max-w-sm text-sm text-zinc-700 file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-900 file:px-4 file:py-2 file:font-medium file:text-white hover:file:bg-zinc-700"
                          />
                          {selectedLogo && (
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedLogo(null);
                                setLogoPreview(null);
                                if (logoInputRef.current) logoInputRef.current.value = '';
                              }}
                              className="rounded-xl border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
                            >
                              Cancelar seleção
                            </button>
                          )}
                          {(tenant?.hasStoredLogo || tenant?.logoUrl) && (
                            <button
                              type="button"
                              onClick={handleRemoveLogo}
                              disabled={saving || removingLogo}
                              className="rounded-xl border border-red-200 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {removingLogo ? 'Removendo...' : 'Remover logo'}
                            </button>
                          )}
                        </div>
                        {!tenant?.hasStoredLogo && tenant?.logoUrl && (
                          <p className="mt-3 text-xs text-zinc-500">
                            A empresa possui uma URL de logo antiga. Ela continuará
                            funcionando até você substituí-la pelo upload ou removê-la.
                          </p>
                        )}
                      </div>
                    </div>
                    <div>
                      <label
                        htmlFor="tenant-color"
                        className={LABEL_CLASS}
                      >
                        Cor principal
                      </label>
                      <div className="flex gap-3">
                        <input
                          id="tenant-color"
                          type="color"
                          value={primaryColor}
                          onChange={(event) =>
                            updateField(
                              'primaryColor',
                              event.target.value,
                            )
                          }
                          className="h-12 w-16 shrink-0 cursor-pointer rounded-xl border border-zinc-300 bg-white p-1"
                        />
                        <input
                          aria-label="Código hexadecimal da cor"
                          value={form.primaryColor}
                          onChange={(event) =>
                            updateField(
                              'primaryColor',
                              event.target.value,
                            )
                          }
                          className={INPUT_CLASS}
                          placeholder="#18181B"
                          maxLength={7}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          updateField(
                            'primaryColor',
                            DEFAULT_COLOR,
                          )
                        }
                        className="mt-3 text-sm font-medium text-zinc-600 hover:text-zinc-900"
                      >
                        Restaurar cor padrão
                      </button>
                    </div>
                    <p className="rounded-xl bg-blue-50 px-4 py-3 text-sm text-blue-800">
                      A pré-visualização ao lado acompanha
                      suas alterações antes de salvar.
                    </p>
                  </div>
                </section>
              )}
              {/* AGENDAMENTO */}
              {activeTab === 'agendamento' && (
                <section className="rounded-2xl bg-white p-5 shadow-sm sm:p-7">
                  <div>
                    <h3 className="text-lg font-bold text-zinc-900">
                      Agendamento público
                    </h3>
                    <p className="mt-1 text-sm text-zinc-500">
                      Defina o período em que os clientes
                      podem solicitar atendimentos.
                    </p>
                  </div>
                  <div className="mt-6 space-y-5">
                    <div>
                      <label
                        htmlFor="tenant-timezone"
                        className={LABEL_CLASS}
                      >
                        Fuso horário da empresa
                      </label>
                      <select
                        id="tenant-timezone"
                        value={form.timezone}
                        onChange={(event) =>
                          updateField(
                            'timezone',
                            event.target.value,
                          )
                        }
                        className={INPUT_CLASS}
                      >
                        {!TIMEZONES.some(
                          (item) =>
                            item.value === form.timezone,
                        ) && (
                          <option value={form.timezone}>
                            {form.timezone}
                          </option>
                        )}
                        {TIMEZONES.map((item) => (
                          <option
                            key={item.value}
                            value={item.value}
                          >
                            {item.label}
                          </option>
                        ))}
                      </select>
                      <p className="mt-2 text-xs text-zinc-500">
                        O fuso horário é utilizado para
                        interpretar datas e horários da agenda.
                      </p>
                    </div>
                    <div className="grid gap-5 md:grid-cols-2">
                      <div>
                        <label
                          htmlFor="tenant-min-advance"
                          className={LABEL_CLASS}
                        >
                          Antecedência mínima
                        </label>
                        <div className="relative">
                          <input
                            id="tenant-min-advance"
                            type="number"
                            min={0}
                            max={1440}
                            step={1}
                            required
                            value={
                              form.bookingMinAdvanceMinutes
                            }
                            onChange={(event) =>
                              updateField(
                                'bookingMinAdvanceMinutes',
                                Number(event.target.value),
                              )
                            }
                            className={`${INPUT_CLASS} pr-24`}
                          />
                          <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs text-zinc-400">
                            minutos
                          </span>
                        </div>
                        <p className="mt-2 text-xs text-zinc-500">
                          De 0 a 1440 minutos.
                          Ex.: 120 = 2 horas.
                        </p>
                      </div>
                      <div>
                        <label
                          htmlFor="tenant-max-days"
                          className={LABEL_CLASS}
                        >
                          Agenda disponível
                        </label>
                        <div className="relative">
                          <input
                            id="tenant-max-days"
                            type="number"
                            min={1}
                            max={365}
                            step={1}
                            required
                            value={
                              form.bookingMaxAdvanceDays
                            }
                            onChange={(event) =>
                              updateField(
                                'bookingMaxAdvanceDays',
                                Number(event.target.value),
                              )
                            }
                            className={`${INPUT_CLASS} pr-20`}
                          />
                          <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs text-zinc-400">
                            dias
                          </span>
                        </div>
                        <p className="mt-2 text-xs text-zinc-500">
                          De 1 a 365 dias à frente.
                        </p>
                      </div>
                    </div>
                    <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
                      <p className="text-sm font-semibold text-blue-900">
                        Como essas regras funcionam?
                      </p>
                      <p className="mt-2 text-sm text-blue-800">
                        O cliente só poderá escolher
                        horários que respeitem a antecedência
                        mínima e o período máximo configurado.
                        O backend também valida essas regras.
                      </p>
                    </div>
                  </div>
                </section>
              )}
              {/* NOTIFICAÇÕES */}
              {activeTab === 'notificacoes' && (
                <section className="rounded-2xl bg-white p-5 shadow-sm sm:p-7">
                  <div>
                    <h3 className="text-lg font-bold text-zinc-900">
                      Notificações e lembretes
                    </h3>
                    <p className="mt-1 text-sm text-zinc-500">
                      Configure os lembretes automáticos
                      para atendimentos confirmados.
                    </p>
                  </div>
                  <div className="mt-6 space-y-5">
                    <label className="flex cursor-pointer items-start justify-between gap-5 rounded-xl border border-zinc-200 bg-zinc-50 p-5">
                      <div>
                        <p className="text-sm font-semibold text-zinc-900">
                          Enviar lembretes por e-mail
                        </p>
                        <p className="mt-2 text-sm text-zinc-500">
                          Somente agendamentos confirmados
                          de clientes com e-mail cadastrado
                          são elegíveis ao lembrete.
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        checked={
                          form.appointmentRemindersEnabled
                        }
                        onChange={(event) =>
                          updateField(
                            'appointmentRemindersEnabled',
                            event.target.checked,
                          )
                        }
                        className="mt-1 h-5 w-5 shrink-0 accent-green-600"
                      />
                    </label>
                    <div
                      className={`rounded-xl border p-5 ${
                        form.appointmentRemindersEnabled
                          ? 'border-zinc-200 bg-white'
                          : 'border-zinc-100 bg-zinc-50'
                      }`}
                    >
                      <label
                        htmlFor="tenant-reminder-hours"
                        className={LABEL_CLASS}
                      >
                        Enviar lembrete com antecedência de
                      </label>
                      <div className="relative max-w-sm">
                        <input
                          id="tenant-reminder-hours"
                          type="number"
                          min={1}
                          max={168}
                          step={1}
                          required={
                            form.appointmentRemindersEnabled
                          }
                          disabled={
                            !form.appointmentRemindersEnabled
                          }
                          value={
                            form.appointmentReminderHoursBefore
                          }
                          onChange={(event) =>
                            updateField(
                              'appointmentReminderHoursBefore',
                              Number(event.target.value),
                            )
                          }
                          className={`${INPUT_CLASS} pr-20`}
                        />
                        <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs text-zinc-400">
                          horas
                        </span>
                      </div>
                      <p className="mt-2 text-xs text-zinc-500">
                        Entre 1 e 168 horas antes
                        do atendimento.
                      </p>
                    </div>
                    {form.appointmentRemindersEnabled ? (
                      <div className="rounded-xl bg-green-50 p-4 text-sm text-green-800">
                        Os lembretes estão ativados,
                        com antecedência aproximada de{' '}
                        <strong>
                          {
                            form.appointmentReminderHoursBefore
                          }{' '}
                          {form.appointmentReminderHoursBefore ===
                          1
                            ? 'hora'
                            : 'horas'}
                        </strong>
                        .
                      </div>
                    ) : (
                      <div className="rounded-xl bg-zinc-100 p-4 text-sm text-zinc-600">
                        Os lembretes automáticos
                        estão desativados nesta empresa.
                      </div>
                    )}
                    <p className="text-xs text-zinc-500">
                      O envio depende da configuração
                      do serviço de e-mail e do worker
                      de notificações do sistema.
                    </p>
                  </div>
                </section>
              )}
            </fieldset>
            {/* AÇÕES DA ABA */}
            <section className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-zinc-900">
                  {activeTabDirty
                    ? 'Existem alterações não salvas nesta seção.'
                    : 'Esta seção está atualizada.'}
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  O salvamento altera somente
                  as configurações desta aba.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={discardActiveChanges}
                  disabled={saving || removingLogo || !activeTabDirty}
                  className="rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Descartar
                </button>
                <button
                  type="submit"
                  disabled={saving || removingLogo || !activeTabDirty}
                  className="rounded-xl bg-green-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving
                    ? 'Salvando...'
                    : 'Salvar alterações'}
                </button>
              </div>
            </section>
          </form>
          {/* PRÉ-VISUALIZAÇÃO */}
          <aside className="min-w-0 rounded-2xl bg-white p-5 shadow-sm sm:p-6 xl:sticky xl:top-6">
            <h3 className="text-base font-semibold text-zinc-900">
              Pré-visualização
            </h3>
            <p className="mt-1 text-sm text-zinc-500">
              Confira a identidade da empresa antes de salvar.
            </p>
            <div className="mt-5 overflow-hidden rounded-2xl bg-zinc-950 p-5 text-white">
              {displayedLogoUrl ? (
                <div className="mb-4 flex h-24 items-center justify-center overflow-hidden rounded-xl bg-white p-3">
                  <img
                    src={displayedLogoUrl}
                    alt="Logo da empresa"
                    className="max-h-full max-w-full object-contain"
                  />
                </div>
              ) : (
                <div
                  className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl text-xl font-bold"
                  style={{
                    backgroundColor: primaryColor,
                    color: buttonTextColor,
                  }}
                >
                  {form.name.charAt(0).toUpperCase() || 'A'}
                </div>
              )}
              <h4 className="break-words font-semibold">
                {form.name || 'Nome da empresa'}
              </h4>
              <p className="mt-1 text-xs text-zinc-400">
                Sistema de agendamento
              </p>
              <div
                className="mt-5 rounded-xl px-4 py-3 text-sm font-medium"
                style={{
                  backgroundColor: primaryColor,
                  color: buttonTextColor,
                }}
              >
                Item selecionado
              </div>
            </div>
            <div className="mt-5 space-y-3">
              <div className="rounded-xl border border-zinc-200 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
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
              <div className="rounded-xl border border-zinc-200 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  Lembretes
                </p>
                {form.appointmentRemindersEnabled ? (
                  <p className="mt-2 text-sm text-zinc-700">
                    Ativos — aproximadamente{' '}
                    <strong>
                      {
                        form.appointmentReminderHoursBefore
                      }{' '}
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
            </div>
            <p className="mt-4 break-all text-xs text-zinc-400">
              Identificador: {tenant.slug}
            </p>
          </aside>
        </div>
      </div>
    </PanelShell>
  );
}
