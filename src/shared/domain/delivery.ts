/**
 * Janela de pedido e data de entrega.
 *
 * Regra do negócio:
 *   segunda e terça  -> entrega na QUARTA da mesma semana
 *   quarta e quinta  -> entrega na SEXTA  da mesma semana
 *
 * Sexta, sábado e domingo não foram definidos pela operação. O padrão aqui
 * é jogar para a próxima quarta (ou seja, o pedido entra na janela de
 * segunda/terça seguinte). Troque `weekendPolicy` se a operação decidir
 * diferente.
 *
 * Corte de horário: um pedido feito às 23h50 de terça não tem como ser
 * entregue na quarta. Por isso existe `cutoffHour` (padrão 16h): passou do
 * corte no ÚLTIMO dia da janela, o pedido cai na janela seguinte. Para
 * desligar esse comportamento, use cutoffHour = 24.
 *
 * Este arquivo é lógica pura, sem Firebase e sem React — é o que permite
 * testá-lo isoladamente.
 */

export type WeekendPolicy = 'NEXT_WEDNESDAY' | 'NEXT_FRIDAY';

export interface DeliveryScheduleConfig {
  /** Hora local (0–24) a partir da qual o último dia da janela já fechou. */
  cutoffHour: number;
  /** Datas sem entrega, formato 'YYYY-MM-DD' (feriados, manutenção). */
  blockedDates: string[];
  /** Para onde vão os pedidos de sexta, sábado e domingo. */
  weekendPolicy: WeekendPolicy;
}

export const DEFAULT_SCHEDULE_CONFIG: DeliveryScheduleConfig = {
  cutoffHour: 16,
  blockedDates: [],
  weekendPolicy: 'NEXT_WEDNESDAY',
};

export interface DeliveryWindow {
  /** 'A' = pedidos de seg/ter, entrega quarta. 'B' = qua/qui, entrega sexta. */
  windowId: 'A' | 'B';
  /** Data da entrega, 'YYYY-MM-DD'. */
  deliveryDate: string;
  /** Rótulo pronto para a interface. */
  deliveryLabel: string;
  /** Momento em que esta janela fecha para novos pedidos. */
  cutoffAt: Date;
  /** Verdadeiro quando o pedido caiu para uma janela adiante do dia atual. */
  rolledOver: boolean;
}

const WEEKDAY_LABEL = [
  'domingo',
  'segunda-feira',
  'terça-feira',
  'quarta-feira',
  'quinta-feira',
  'sexta-feira',
  'sábado',
];

const pad = (n: number) => String(n).padStart(2, '0');

/** 'YYYY-MM-DD' no fuso local (nunca use toISOString aqui: ele converte p/ UTC). */
export function toLocalDateString(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function atMidnight(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

function addDays(d: Date, days: number): Date {
  const c = new Date(d);
  c.setDate(c.getDate() + days);
  return c;
}

/** Próxima ocorrência de `targetDow` a partir de `from` (inclui o próprio dia). */
function nextDow(from: Date, targetDow: number): Date {
  const diff = (targetDow - from.getDay() + 7) % 7;
  return addDays(atMidnight(from), diff);
}

function dateAtHour(d: Date, hour: number): Date {
  const c = atMidnight(d);
  c.setHours(Math.min(hour, 23), hour >= 24 ? 59 : 0, 0, 0);
  if (hour >= 24) c.setHours(23, 59, 59, 999);
  return c;
}

/**
 * Descobre a janela válida para um pedido feito em `now`.
 * Retorna a data de entrega já pulando datas bloqueadas.
 */
export function resolveDeliveryWindow(
  now: Date = new Date(),
  config: Partial<DeliveryScheduleConfig> = {}
): DeliveryWindow {
  // Mesclagem campo a campo, NÃO por spread.
  //
  // `{ ...DEFAULT, ...config }` parece equivalente, mas não é: o spread
  // sobrescreve o padrão quando a chave existe com valor `undefined`. Como
  // os chamadores passam `blockedDates: settings.blockedDates` e o documento
  // portal_settings/delivery pode não existir, o padrão era substituído por
  // `undefined` e a linha do `.includes` abaixo derrubava a aplicação inteira.
  const cfg: DeliveryScheduleConfig = {
    cutoffHour: config?.cutoffHour ?? DEFAULT_SCHEDULE_CONFIG.cutoffHour,
    blockedDates: Array.isArray(config?.blockedDates)
      ? config!.blockedDates
      : DEFAULT_SCHEDULE_CONFIG.blockedDates,
    weekendPolicy: config?.weekendPolicy ?? DEFAULT_SCHEDULE_CONFIG.weekendPolicy,
  };

  const dow = now.getDay(); // 0 dom ... 6 sáb
  const hour = now.getHours();

  let windowId: 'A' | 'B';
  let rolledOver = false;

  if (dow === 1) {
    windowId = 'A'; // segunda
  } else if (dow === 2) {
    // terça: último dia da janela A
    if (hour >= cfg.cutoffHour) {
      windowId = 'B';
      rolledOver = true;
    } else {
      windowId = 'A';
    }
  } else if (dow === 3) {
    windowId = 'B'; // quarta
  } else if (dow === 4) {
    // quinta: último dia da janela B
    if (hour >= cfg.cutoffHour) {
      windowId = 'A';
      rolledOver = true;
    } else {
      windowId = 'B';
    }
  } else {
    // sexta, sábado, domingo: sem janela definida pela operação
    windowId = cfg.weekendPolicy === 'NEXT_FRIDAY' ? 'B' : 'A';
    rolledOver = true;
  }

  const targetDow = windowId === 'A' ? 3 : 5; // quarta ou sexta
  let delivery = nextDow(now, targetDow);

  // Se a janela virou, a entrega nunca pode cair hoje ou antes.
  if (delivery <= atMidnight(now)) delivery = addDays(delivery, 7);
  if (rolledOver && delivery <= atMidnight(now)) delivery = addDays(delivery, 7);

  // Pula feriados: tenta a próxima quarta ou sexta livre.
  let guard = 0;
  while (cfg.blockedDates.includes(toLocalDateString(delivery)) && guard < 12) {
    delivery = delivery.getDay() === 3 ? addDays(delivery, 2) : addDays(delivery, 5);
    guard++;
  }

  const cutoffDay = windowId === 'A' ? addDays(delivery, -1) : addDays(delivery, -1);

  return {
    windowId,
    deliveryDate: toLocalDateString(delivery),
    deliveryLabel: `${WEEKDAY_LABEL[delivery.getDay()]}, ${pad(delivery.getDate())}/${pad(
      delivery.getMonth() + 1
    )}`,
    cutoffAt: dateAtHour(cutoffDay, cfg.cutoffHour),
    rolledOver,
  };
}

/** Frase curta para mostrar no carrinho, do jeito que o cliente entende. */
export function describeWindow(win: DeliveryWindow): string {
  return win.rolledOver
    ? `A janela de hoje já fechou. Entrega na ${win.deliveryLabel}.`
    : `Pedido fechado hoje, entrega na ${win.deliveryLabel}.`;
}