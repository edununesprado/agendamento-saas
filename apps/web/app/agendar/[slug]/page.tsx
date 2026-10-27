'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { TurnstileWidget } from '@/components/turnstile-widget';
import { getTenantLogoUrl } from '@/lib/tenant-logo';

type Tenant = {
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
};

type Service = {
  id: string;
  name: string;
  durationMin: number;
  priceCents: number;
};

type Employee = {
  id: string;
  name: string;
};

type AvailabilityResponse = {
  date: string;
  employeeId: string;
  serviceId: string;
  timezone: string;
  slots: string[];
};

type PublicAppointment = {
  id: string;
  startsAt: string;
  endsAt: string;
  status: 'PENDING' | 'CONFIRMED' | 'COMPLETED' | 'CANCELED' | 'NO_SHOW';
  employee: Employee;
  service: Service;
};

type ClientForm = {
  name: string;
  phone: string;
  email: string;
  notes: string;
};

const emptyForm: ClientForm = {
  name: '',
  phone: '',
  email: '',
  notes: '',
};

const API_URL = (
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333'
).replace(/\/+$/, '');

/*
 * Etapa 6.2 — Turnstile.
 * A ativação do frontend deve acompanhar TURNSTILE_ENABLED no backend.
 * A chave pública pode ser exposta; a chave secreta nunca vai ao frontend.
 */
const TURNSTILE_SITE_KEY =
  process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() ?? '';

const TURNSTILE_REQUIRED =
  process.env.NEXT_PUBLIC_TURNSTILE_ENABLED === 'true' ||
  (Boolean(TURNSTILE_SITE_KEY) &&
    process.env.NEXT_PUBLIC_TURNSTILE_ENABLED !== 'false');

class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function readResponse<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => null);

  if (response.status === 429) {
    throw new ApiError(
      'Muitas tentativas em pouco tempo. Aguarde um minuto e tente novamente.',
      429,
    );
  }

  if (!response.ok) {
    const message = Array.isArray(data?.message)
      ? data.message.join(', ')
      : data?.message ?? 'Não foi possível concluir a solicitação.';

    throw new ApiError(message, response.status);
  }

  return data as T;
}

async function publicFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  return readResponse<T>(response);
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(cents / 100);
}

function formatDateInTimeZone(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const values = Object.fromEntries(
    parts.filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );

  return `${values.year}-${values.month}-${values.day}`;
}

function addDaysToDateString(value: string, days: number): string {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);

  const nextYear = date.getUTCFullYear();
  const nextMonth = String(date.getUTCMonth() + 1).padStart(2, '0');
  const nextDay = String(date.getUTCDate()).padStart(2, '0');

  return `${nextYear}-${nextMonth}-${nextDay}`;
}

function zonedLocalToIso(
  date: string,
  time: string,
  timezone: string,
): string {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);

  const utcGuess = new Date(
    Date.UTC(year, month - 1, day, hour, minute, 0),
  );

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(utcGuess);

  const values = Object.fromEntries(
    parts.filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );

  const localAsUtc = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second),
  );

  const offset = localAsUtc - utcGuess.getTime();
  return new Date(utcGuess.getTime() - offset).toISOString();
}

function formatAppointmentDate(value: string, timezone: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: timezone,
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(new Date(value));
}

function getContrastColor(hex: string): string {
  const normalized = hex.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    return '#ffffff';
  }

  const red = parseInt(normalized.slice(0, 2), 16);
  const green = parseInt(normalized.slice(2, 4), 16);
  const blue = parseInt(normalized.slice(4, 6), 16);
  const brightness = (red * 299 + green * 587 + blue * 114) / 1000;

  return brightness > 180 ? '#18181b' : '#ffffff';
}

export default function PublicBookingPage() {
  const params = useParams();
  const rawSlug = params.slug;
  const slug = Array.isArray(rawSlug) ? rawSlug[0] : rawSlug;

  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [slots, setSlots] = useState<string[]>([]);
  const [serviceId, setServiceId] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [date, setDate] = useState('');
  const [selectedSlot, setSelectedSlot] = useState('');
  const [form, setForm] = useState<ClientForm>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [loadingEmployees, setLoadingEmployees] = useState(false);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [confirmation, setConfirmation] = useState<PublicAppointment | null>(null);
  const [confirmationName, setConfirmationName] = useState('');
  const [slotsVersion, setSlotsVersion] = useState(0);

  // Turnstile: um token de uso único por tentativa de envio.
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);

  const selectedService = useMemo(
    () => services.find((service) => service.id === serviceId) ?? null,
    [services, serviceId],
  );

  const selectedEmployee = useMemo(
    () => employees.find((employee) => employee.id === employeeId) ?? null,
    [employees, employeeId],
  );

  const tenantLogoUrl = getTenantLogoUrl(tenant);
  const primaryColor = tenant?.primaryColor ?? '#18181b';
  const buttonTextColor = getContrastColor(primaryColor);
  const minDate = tenant
    ? formatDateInTimeZone(new Date(), tenant.timezone)
    : '';
  const maxDate = tenant && minDate
    ? addDaysToDateString(minDate, tenant.bookingMaxAdvanceDays)
    : '';

  // Consulta a empresa e os serviços públicos.
  useEffect(() => {
    if (!slug) return;

    async function initialize() {
      try {
        setLoading(true);
        setError('');

        const encodedSlug = encodeURIComponent(String(slug));
        const [tenantData, servicesData] = await Promise.all([
          publicFetch<Tenant>(`/public/tenants/${encodedSlug}`),
          publicFetch<Service[]>(`/public/tenants/${encodedSlug}/services`),
        ]);

        setTenant(tenantData);
        setServices(servicesData);
        setDate(formatDateInTimeZone(new Date(), tenantData.timezone));
      } catch (err) {
        setError(err instanceof Error
          ? err.message
          : 'Erro ao carregar agendamento.');
      } finally {
        setLoading(false);
      }
    }

    initialize();
  }, [slug]);

  // Ao trocar o serviço, consulta os profissionais vinculados.
  useEffect(() => {
    if (!slug || !serviceId) {
      setEmployees([]);
      setEmployeeId('');
      setSlots([]);
      setSelectedSlot('');
      return;
    }

    const controller = new AbortController();

    async function loadEmployees() {
      try {
        setLoadingEmployees(true);
        setError('');
        setEmployeeId('');
        setSlots([]);
        setSelectedSlot('');

        const encodedSlug = encodeURIComponent(String(slug));
        const data = await publicFetch<Employee[]>(
          `/public/tenants/${encodedSlug}/employees?serviceId=${encodeURIComponent(serviceId)}`,
          { signal: controller.signal },
        );

        if (!controller.signal.aborted) {
          setEmployees(data);
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error
          ? err.message
          : 'Erro ao carregar profissionais.');
      } finally {
        if (!controller.signal.aborted) {
          setLoadingEmployees(false);
        }
      }
    }

    loadEmployees();
    return () => controller.abort();
  }, [slug, serviceId]);

  // Consulta os horários e respeita a antecedência mínima.
  useEffect(() => {
    if (!slug || !tenant || !serviceId || !employeeId || !date) {
      setSlots([]);
      setSelectedSlot('');
      return;
    }

    const currentTenant = tenant;
    const controller = new AbortController();

    async function loadSlots() {
      try {
        setLoadingSlots(true);
        // Nao apaga mensagens de erro durante atualizacoes de horarios.
        setSelectedSlot('');

        const query = new URLSearchParams({ employeeId, serviceId, date });
        const encodedSlug = encodeURIComponent(String(slug));
        const data = await publicFetch<AvailabilityResponse>(
          `/public/tenants/${encodedSlug}/availability?${query.toString()}`,
          { signal: controller.signal },
        );

        const minimumStartTime = Date.now() +
          currentTenant.bookingMinAdvanceMinutes * 60 * 1000;

        const futureSlots = data.slots.filter((slot) => {
          const instant = new Date(
            zonedLocalToIso(date, slot, currentTenant.timezone),
          );
          return instant.getTime() >= minimumStartTime;
        });

        if (!controller.signal.aborted) {
          setSlots(futureSlots);
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        setSlots([]);
        setError(err instanceof Error
          ? err.message
          : 'Erro ao carregar horários.');
      } finally {
        if (!controller.signal.aborted) {
          setLoadingSlots(false);
        }
      }
    }

    loadSlots();
    return () => controller.abort();
  }, [slug, tenant, serviceId, employeeId, date, slotsVersion]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;

    if (!tenant || !slug || !serviceId || !employeeId || !date || !selectedSlot) {
      setError('Escolha o serviço, profissional, data e horário.');
      return;
    }

    if (!form.name.trim()) {
      setError('Informe seu nome.');
      return;
    }

    if (!form.phone.trim()) {
      setError('Informe seu telefone.');
      return;
    }

    if (date < minDate || date > maxDate) {
      setError(
        `Escolha uma data entre hoje e os próximos ${tenant.bookingMaxAdvanceDays} dias.`,
      );
      return;
    }

    if (TURNSTILE_REQUIRED && !turnstileToken) {
      setError('Conclua a verificação de segurança antes de agendar.');
      return;
    }

    let submitted = false;

    try {
      setSaving(true);
      setError('');

      const startsAt = zonedLocalToIso(date, selectedSlot, tenant.timezone);
      const minimumStartTime = Date.now() +
        tenant.bookingMinAdvanceMinutes * 60 * 1000;

      if (new Date(startsAt).getTime() < minimumStartTime) {
        setError(
          `Este horário ficou muito próximo. O agendamento precisa ser feito com pelo menos ${tenant.bookingMinAdvanceMinutes} minutos de antecedência.`,
        );
        setSelectedSlot('');
        setSlotsVersion((current) => current + 1);
        return;
      }

      const encodedSlug = encodeURIComponent(String(slug));

      /*
       * A verificação é obrigatória no backend quando ativada.
       * O token é enviado no JSON e nunca gravado no banco.
       */
      submitted = true;
      const appointment = await publicFetch<PublicAppointment>(
        `/public/tenants/${encodedSlug}/appointments`,
        {
          method: 'POST',
          body: JSON.stringify({
            employeeId,
            serviceId,
            startsAt,
            client: {
              name: form.name.trim(),
              phone: form.phone.trim(),
              email: form.email.trim() || undefined,
            },
            notes: form.notes.trim() || undefined,
            turnstileToken: TURNSTILE_REQUIRED
              ? turnstileToken
              : undefined,
          }),
        },
      );

      setConfirmationName(form.name.trim());
      setConfirmation(appointment);
    } catch (err) {
      setError(err instanceof Error
        ? err.message
        : 'Não foi possível realizar o agendamento.');

      // Somente conflito de disponibilidade exige selecionar novo horario.
      // Erros de CAPTCHA/rede/rate limit preservam os dados preenchidos.
      if (err instanceof ApiError && err.status === 409) {
        setSelectedSlot('');
        setSlotsVersion((current) => current + 1);
      }
    } finally {
      if (submitted && TURNSTILE_REQUIRED) {
        // Mesmo em erro ou HTTP 429, não reutilizar um token enviado.
        setTurnstileToken(null);
        setTurnstileResetKey((current) => current + 1);
      }
      setSaving(false);
    }
  }

  function startAgain() {
    setConfirmation(null);
    setConfirmationName('');
    setServiceId('');
    setEmployeeId('');
    setSelectedSlot('');
    setEmployees([]);
    setSlots([]);
    setForm(emptyForm);
    setError('');
    setTurnstileToken(null);
    setTurnstileResetKey((current) => current + 1);

    if (tenant) {
      setDate(formatDateInTimeZone(new Date(), tenant.timezone));
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-4">
        <div className="text-center">
          <div className="mx-auto h-9 w-9 animate-spin rounded-full border-4 border-zinc-200 border-t-zinc-900" />
          <p className="mt-4 text-sm text-zinc-500">Carregando agendamento...</p>
        </div>
      </main>
    );
  }

  if (!tenant) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-sm">
          <h1 className="text-xl font-semibold text-zinc-900">Agendamento indisponível</h1>
          <p className="mt-3 text-sm text-zinc-500">
            {error || 'Não foi possível localizar esta empresa.'}
          </p>
        </div>
      </main>
    );
  }

  if (confirmation) {
    return (
      <main className="min-h-screen bg-zinc-50 px-4 py-10">
        <div className="mx-auto max-w-xl">
          <div className="overflow-hidden rounded-3xl bg-white shadow-sm">
            <div
              className="px-6 py-8 text-center"
              style={{ backgroundColor: primaryColor, color: buttonTextColor }}
            >
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-white/20 text-2xl">
                ✓
              </div>
              <h1 className="mt-4 text-2xl font-bold">Solicitação enviada!</h1>
              <p className="mt-2 text-sm opacity-90">Obrigado, {confirmationName}.</p>
            </div>

            <div className="p-6 sm:p-8">
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                <p className="font-medium text-amber-900">Aguardando confirmação</p>
                <p className="mt-1 text-sm text-amber-700">
                  Seu agendamento foi enviado para a empresa e está com status pendente.
                </p>
              </div>

              <div className="mt-6 space-y-4 rounded-2xl bg-zinc-50 p-5">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">Serviço</p>
                  <p className="mt-1 font-medium text-zinc-900">{confirmation.service.name}</p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">Profissional</p>
                  <p className="mt-1 font-medium text-zinc-900">{confirmation.employee.name}</p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">Data e horário</p>
                  <p className="mt-1 font-medium capitalize text-zinc-900">
                    {formatAppointmentDate(confirmation.startsAt, tenant.timezone)}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">Valor</p>
                  <p className="mt-1 font-medium text-zinc-900">
                    {formatCurrency(confirmation.service.priceCents)}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={startAgain}
                className="mt-6 w-full rounded-xl px-5 py-3.5 text-sm font-semibold transition hover:opacity-90"
                style={{ backgroundColor: primaryColor, color: buttonTextColor }}
              >
                Fazer outro agendamento
              </button>
            </div>
          </div>

          <p className="mt-5 text-center text-xs text-zinc-400">
            Agendamento online • {tenant.name}
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-50">
      <header style={{ backgroundColor: primaryColor, color: buttonTextColor }}>
        <div className="mx-auto max-w-4xl flex items-center gap-4 px-4 py-7 sm:px-6">
          {tenantLogoUrl ? (
            <img
              src={tenantLogoUrl}
              alt={tenant.name}
              className="h-14 w-14 rounded-2xl bg-white object-contain p-1 shadow-sm"
            />
          ) : (
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/20 text-xl font-bold">
              {tenant.name.charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <h1 className="text-2xl font-bold">{tenant.name}</h1>
            <p className="mt-1 text-sm opacity-80">Agende seu horário online</p>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        {error && (
          <div
            className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700"
            role="alert"
          >
            {error}
          </div>
        )}

        {/* SERVIÇO */}
        <section className="rounded-3xl bg-white p-5 shadow-sm sm:p-7">
          <div className="flex items-center gap-3">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold"
              style={{ backgroundColor: primaryColor, color: buttonTextColor }}
            >
              1
            </div>
            <div>
              <h2 className="font-semibold text-zinc-900">Escolha o serviço</h2>
              <p className="text-sm text-zinc-500">Qual atendimento você deseja?</p>
            </div>
          </div>

          {services.length === 0 ? (
            <p className="mt-6 rounded-xl bg-zinc-50 p-4 text-sm text-zinc-500">
              Nenhum serviço disponível para agendamento.
            </p>
          ) : (
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {services.map((service) => {
                const selected = serviceId === service.id;
                return (
                  <button
                    key={service.id}
                    type="button"
                    onClick={() => {
                      setServiceId(service.id);
                      setError('');
                    }}
                    className="rounded-2xl border p-4 text-left transition hover:bg-zinc-50"
                    style={{
                      borderColor: selected ? primaryColor : '#e4e4e7',
                      boxShadow: selected ? `0 0 0 1px ${primaryColor}` : undefined,
                    }}
                  >
                    <p className="font-semibold text-zinc-900">{service.name}</p>
                    <div className="mt-2 flex items-center justify-between gap-3 text-sm">
                      <span className="text-zinc-500">{service.durationMin} min</span>
                      <span className="font-semibold text-zinc-900">
                        {formatCurrency(service.priceCents)}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* PROFISSIONAL */}
        {serviceId && (
          <section className="mt-5 rounded-3xl bg-white p-5 shadow-sm sm:p-7">
            <div className="flex items-center gap-3">
              <div
                className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold"
                style={{ backgroundColor: primaryColor, color: buttonTextColor }}
              >
                2
              </div>
              <div>
                <h2 className="font-semibold text-zinc-900">Escolha o profissional</h2>
                <p className="text-sm text-zinc-500">Quem irá realizar o atendimento?</p>
              </div>
            </div>

            {loadingEmployees ? (
              <p className="mt-6 text-sm text-zinc-500">Carregando profissionais...</p>
            ) : employees.length === 0 ? (
              <p className="mt-6 rounded-xl bg-zinc-50 p-4 text-sm text-zinc-500">
                Nenhum profissional disponível para este serviço.
              </p>
            ) : (
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {employees.map((employee) => {
                  const selected = employeeId === employee.id;
                  return (
                    <button
                      key={employee.id}
                      type="button"
                      onClick={() => {
                        setEmployeeId(employee.id);
                        setSelectedSlot('');
                        setError('');
                      }}
                      className="flex items-center gap-3 rounded-2xl border p-4 text-left transition hover:bg-zinc-50"
                      style={{
                        borderColor: selected ? primaryColor : '#e4e4e7',
                        boxShadow: selected ? `0 0 0 1px ${primaryColor}` : undefined,
                      }}
                    >
                      <div
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full font-semibold"
                        style={{ backgroundColor: `${primaryColor}18`, color: primaryColor }}
                      >
                        {employee.name.charAt(0).toUpperCase()}
                      </div>
                      <p className="font-medium text-zinc-900">{employee.name}</p>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* DATA E HORÁRIO */}
        {employeeId && (
          <section className="mt-5 rounded-3xl bg-white p-5 shadow-sm sm:p-7">
            <div className="flex items-center gap-3">
              <div
                className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold"
                style={{ backgroundColor: primaryColor, color: buttonTextColor }}
              >
                3
              </div>
              <div>
                <h2 className="font-semibold text-zinc-900">Data e horário</h2>
                <p className="text-sm text-zinc-500">Escolha quando deseja ser atendido.</p>
              </div>
            </div>

            <div className="mt-6">
              <label className="mb-2 block text-sm font-medium text-zinc-700">Data</label>
              <input
                type="date"
                value={date}
                min={minDate}
                max={maxDate}
                onChange={(event) => {
                  setDate(event.target.value);
                  setSelectedSlot('');
                  setError('');
                }}
                className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 outline-none transition focus:border-zinc-500 sm:max-w-xs"
              />
              <p className="mt-2 text-xs text-zinc-400">
                Agendamentos com pelo menos{' '}
                <strong>{tenant.bookingMinAdvanceMinutes} minutos</strong>{' '}
                de antecedência e no máximo{' '}
                <strong>{tenant.bookingMaxAdvanceDays} dias</strong> à frente.
              </p>
            </div>

            <div className="mt-6">
              <p className="mb-3 text-sm font-medium text-zinc-700">Horários disponíveis</p>
              {loadingSlots ? (
                <p className="text-sm text-zinc-500">Buscando horários...</p>
              ) : slots.length === 0 ? (
                <div className="rounded-xl bg-zinc-50 p-4 text-sm text-zinc-500">
                  Não há horários disponíveis nesta data.
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
                  {slots.map((slot) => {
                    const selected = selectedSlot === slot;
                    return (
                      <button
                        key={slot}
                        type="button"
                        onClick={() => {
                          setSelectedSlot(slot);
                          setError('');
                        }}
                        className="rounded-xl border px-3 py-3 text-sm font-medium transition"
                        style={{
                          backgroundColor: selected ? primaryColor : '#ffffff',
                          borderColor: selected ? primaryColor : '#e4e4e7',
                          color: selected ? buttonTextColor : '#18181b',
                        }}
                      >
                        {slot}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        )}

        {/* DADOS DO CLIENTE */}
        {selectedSlot && (
          <section className="mt-5 rounded-3xl bg-white p-5 shadow-sm sm:p-7">
            <div className="flex items-center gap-3">
              <div
                className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold"
                style={{ backgroundColor: primaryColor, color: buttonTextColor }}
              >
                4
              </div>
              <div>
                <h2 className="font-semibold text-zinc-900">Seus dados</h2>
                <p className="text-sm text-zinc-500">Preencha os dados para concluir.</p>
              </div>
            </div>

            <div className="mt-6 rounded-2xl bg-zinc-50 p-4 text-sm">
              <p className="font-semibold text-zinc-900">Resumo</p>
              <div className="mt-3 grid gap-2 text-zinc-600 sm:grid-cols-2">
                <p>Serviço:{' '}
                  <strong className="text-zinc-900">{selectedService?.name}</strong>
                </p>
                <p>Profissional:{' '}
                  <strong className="text-zinc-900">{selectedEmployee?.name}</strong>
                </p>
                <p>Horário:{' '}
                  <strong className="text-zinc-900">{selectedSlot}</strong>
                </p>
                <p>Valor:{' '}
                  <strong className="text-zinc-900">
                    {selectedService ? formatCurrency(selectedService.priceCents) : '-'}
                  </strong>
                </p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="mt-6 grid gap-5 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-zinc-700">Nome *</label>
                <input
                  value={form.name}
                  onChange={(event) => setForm((current) => ({
                    ...current,
                    name: event.target.value,
                  }))}
                  placeholder="Seu nome"
                  className="w-full rounded-xl border border-zinc-300 px-4 py-3 outline-none transition focus:border-zinc-500"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-zinc-700">Telefone *</label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(event) => setForm((current) => ({
                    ...current,
                    phone: event.target.value,
                  }))}
                  placeholder="(34) 99999-9999"
                  className="w-full rounded-xl border border-zinc-300 px-4 py-3 outline-none transition focus:border-zinc-500"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="mb-2 block text-sm font-medium text-zinc-700">E-mail</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(event) => setForm((current) => ({
                    ...current,
                    email: event.target.value,
                  }))}
                  placeholder="seuemail@exemplo.com"
                  className="w-full rounded-xl border border-zinc-300 px-4 py-3 outline-none transition focus:border-zinc-500"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="mb-2 block text-sm font-medium text-zinc-700">Observações</label>
                <textarea
                  value={form.notes}
                  onChange={(event) => setForm((current) => ({
                    ...current,
                    notes: event.target.value,
                  }))}
                  rows={3}
                  maxLength={500}
                  placeholder="Alguma observação para o atendimento?"
                  className="w-full resize-none rounded-xl border border-zinc-300 px-4 py-3 outline-none transition focus:border-zinc-500"
                />
              </div>

              {/* Mensagem proxima ao formulario, preservando os dados. */}
              {error && (
                <p
                  role="alert"
                  className="sm:col-span-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
                >
                  {error}
                </p>
              )}

              {/* CAPTCHA: exibido somente quando ativado. */}
              {TURNSTILE_REQUIRED && (
                <div className="sm:col-span-2 space-y-3">
                  <p className="text-sm font-medium text-zinc-700">
                    Verificação de segurança *
                  </p>
                  <TurnstileWidget
                    siteKey={TURNSTILE_SITE_KEY}
                    onTokenChange={setTurnstileToken}
                    resetKey={turnstileResetKey}
                  />
                  <p className="text-xs text-zinc-500">
                    A verificação ajuda a proteger a agenda contra solicitações automatizadas.
                  </p>
                </div>
              )}

              <div className="sm:col-span-2">
                <button
                  type="submit"
                  disabled={saving || (TURNSTILE_REQUIRED && !turnstileToken)}
                  className="w-full rounded-xl px-5 py-4 font-semibold transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                  style={{ backgroundColor: primaryColor, color: buttonTextColor }}
                >
                  {saving ? 'Enviando agendamento...' : 'Confirmar agendamento'}
                </button>
                <p className="mt-3 text-center text-xs text-zinc-400">
                  O horário ficará aguardando confirmação da empresa.
                </p>
              </div>
            </form>
          </section>
        )}

        {(tenant.phone || tenant.email) && (
          <section className="mt-5 text-center text-sm text-zinc-500">
            <p>Precisa falar com a empresa?</p>
            <div className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1">
              {tenant.phone && <span>{tenant.phone}</span>}
              {tenant.email && <span>{tenant.email}</span>}
            </div>
          </section>
        )}

        <p className="mt-8 text-center text-xs text-zinc-400">
          Agendamento online • {tenant.name}
        </p>
      </div>
    </main>
  );
}
