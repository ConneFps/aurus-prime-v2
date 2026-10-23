import QRCode from 'qrcode';
/**
 * PIX Payload Generator (Bacen BR Code / EMV QRCPS-MPM Compliant)
 * 
 * Regras do Banco Central do Brasil (BACEN) para QR Code Pix Estático:
 * - 00: Payload Format Indicator = '01'
 * - 26: Merchant Account Information
 *       00: 'br.gov.bcb.pix'
 *       01: Chave Pix (CNPJ: apenas 14 dígitos numéricos; e-mail; telefone com +55; ou chave aleatória)
 *       02: Descrição (opcional, máx 25 caracteres, sem acentos ou caracteres especiais como #)
 * - 52: Merchant Category Code = '0000'
 * - 53: Transaction Currency = '986' (BRL)
 * - 54: Transaction Amount (2 casas decimais, se informado)
 * - 58: Country Code = 'BR'
 * - 59: Merchant Name (máx 25 caracteres, maiúsculas, sem acentos)
 * - 60: Merchant City (máx 15 caracteres, maiúsculas, sem acentos)
 * - 62: Additional Data Field Template
 *       05: Reference Label / txId (máx 25 caracteres alfanuméricos [a-zA-Z0-9] ou '***')
 * - 63: CRC16 (4 caracteres hexadecimais em maiúsculas, calculado com CRC16-CCITT False 0x1021)
 */

/** Valores padrão usados só quando as Configurações não têm chave Pix. */
export const OFFICIAL_PIX_KEY = '05099651002148'; // CNPJ 05.099.651/0021-48 (Aurus Prime)
export const OFFICIAL_MERCHANT_NAME = 'AURUS PRIME';
export const OFFICIAL_MERCHANT_CITY = 'SAO PAULO';

export interface PixPayloadParams {
  pixKey?: string;
  merchantName?: string;
  merchantCity?: string;
  amount?: number;
  txId?: string;
  info?: string;
}

export function calculateCRC16(payload: string): string {
  let crc = 0xFFFF;
  const polynomial = 0x1021;

  for (let i = 0; i < payload.length; i++) {
    const charCode = payload.charCodeAt(i);
    crc ^= (charCode << 8);
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ polynomial) & 0xFFFF;
      } else {
        crc = (crc << 1) & 0xFFFF;
      }
    }
  }

  return crc.toString(16).toUpperCase().padStart(4, '0');
}

function formatEMV(id: string, value: string): string {
  const len = value.length.toString().padStart(2, '0');
  return `${id}${len}${value}`;
}

function removeAccents(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Constrói a string do Pix Copia e Cola / Payload EMV do Bacen
 */
export function buildPixPayload(params: PixPayloadParams): string {
  const rawKey = params.pixKey || OFFICIAL_PIX_KEY;
  // Se for formato CNPJ ou CPF com pontos/traços, extrai somente os dígitos
  const isLikelyDoc = /^[\d.\-/]+$/.test(rawKey.trim());
  const cleanPixKey = isLikelyDoc ? rawKey.replace(/\D/g, '') : rawKey.trim();

  const merchantName = (params.merchantName || OFFICIAL_MERCHANT_NAME).trim();
  const cleanName = removeAccents(merchantName).replace(/[^a-zA-Z0-9 ]/g, '').toUpperCase().slice(0, 25) || OFFICIAL_MERCHANT_NAME;

  const merchantCity = (params.merchantCity || OFFICIAL_MERCHANT_CITY).trim();
  const cleanCity = removeAccents(merchantCity).replace(/[^a-zA-Z0-9 ]/g, '').toUpperCase().slice(0, 15) || OFFICIAL_MERCHANT_CITY;

  // 00: Payload Format Indicator
  let payload = formatEMV('00', '01');

  // 26: Merchant Account Information
  let mai = formatEMV('00', 'br.gov.bcb.pix');
  mai += formatEMV('01', cleanPixKey);
  if (params.info) {
    const cleanInfo = removeAccents(params.info).replace(/[^a-zA-Z0-9 ]/g, '').trim().slice(0, 25);
    if (cleanInfo) {
      mai += formatEMV('02', cleanInfo);
    }
  }
  payload += formatEMV('26', mai);

  // 52: Merchant Category Code (0000)
  payload += formatEMV('52', '0000');

  // 53: Transaction Currency (986 = Real Brasileiro / BRL)
  payload += formatEMV('53', '986');

  // 54: Transaction Amount (formatado com 2 casas decimais)
  if (params.amount !== undefined && params.amount !== null && params.amount > 0) {
    payload += formatEMV('54', Number(params.amount).toFixed(2));
  }

  // 58: Country Code (BR)
  payload += formatEMV('58', 'BR');

  // 59: Merchant Name
  payload += formatEMV('59', cleanName);

  // 60: Merchant City
  payload += formatEMV('60', cleanCity);

  // 62: Additional Data Field Template (txId)
  let cleanTxId = '***';
  if (params.txId && params.txId !== '***') {
    const alphanumeric = params.txId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 25);
    if (alphanumeric.length > 0) {
      cleanTxId = alphanumeric;
    }
  }
  const additional = formatEMV('05', cleanTxId);
  payload += formatEMV('62', additional);

  // 63: CRC16 template
  payload += '6304';
  const crc = calculateCRC16(payload);
  return payload + crc;
}

/**
 * Sobrecarga compatível com chamadas existentes:
 * generatePixPayload(amount, txid) OU generatePixPayload(params)
 */
export function generatePixPayload(
  amountOrParams: number | PixPayloadParams,
  txid: string = '***'
): string {
  if (typeof amountOrParams === 'number') {
    return buildPixPayload({
      amount: amountOrParams,
      txId: txid,
      pixKey: OFFICIAL_PIX_KEY,
      merchantName: OFFICIAL_MERCHANT_NAME,
      merchantCity: OFFICIAL_MERCHANT_CITY
    });
  }
  return buildPixPayload(amountOrParams);
}


/** QR Code (PNG data URL) para exibir/baixar. */
export async function qrDataUrl(text: string, size = 320): Promise<string> {
  return QRCode.toDataURL(text, { width: size, margin: 1, errorCorrectionLevel: 'M' });
}

/** Gera um txid alfanumérico curto (máx. 25) a partir de um número de pedido. */
export function pixTxidFor(ref: string): string {
  return ('AP' + ref.replace(/[^a-zA-Z0-9]/g, '')).slice(0, 25);
}
