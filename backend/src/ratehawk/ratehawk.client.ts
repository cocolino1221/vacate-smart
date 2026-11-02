import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Format standard de răspuns ETG / RateHawk API v3 */
export interface RateHawkEnvelope<T> {
  data: T | null;
  debug?: unknown;
  error: string | null;
  status: 'ok' | 'error' | string;
}

export class RateHawkError extends Error {
  constructor(
    public readonly code: string,
    public readonly endpoint: string,
    public readonly httpStatus?: number,
  ) {
    super(`RateHawk ${endpoint}: ${code}`);
  }
}

/**
 * Client HTTP generic pentru API-ul RateHawk (ETG / WorldOTA).
 * Autentificare: HTTP Basic cu KEY_ID:API_KEY.
 * Același client e folosit de toate produsele (hoteluri, zboruri, transferuri, trenuri) –
 * fiecare modul își definește propriile endpoint-uri.
 */
@Injectable()
export class RateHawkClient {
  private readonly logger = new Logger(RateHawkClient.name);
  private readonly baseUrl: string;
  private readonly auth: string;
  private readonly timeoutMs: number;

  constructor(config: ConfigService) {
    this.baseUrl = config.get<string>('ratehawk.baseUrl')!.replace(/\/$/, '');
    const keyId = config.get<string>('ratehawk.keyId');
    const apiKey = config.get<string>('ratehawk.apiKey');
    this.auth = 'Basic ' + Buffer.from(`${keyId}:${apiKey}`).toString('base64');
    this.timeoutMs = config.get<number>('ratehawk.timeoutMs')!;
    if (!keyId || !apiKey) {
      this.logger.warn('RATEHAWK_KEY_ID / RATEHAWK_API_KEY lipsesc – apelurile către RateHawk vor eșua.');
    }
  }

  /**
   * POST către un endpoint, ex. `/search/serp/region/`.
   * Aruncă RateHawkError dacă status != ok, cu excepția celor din `allowStatuses`
   * (ex. "processing" la statusul rezervării), pentru care întoarce envelope-ul brut.
   */
  async post<T>(endpoint: string, body: unknown, opts: { timeoutMs?: number } = {}): Promise<RateHawkEnvelope<T>> {
    const url = `${this.baseUrl}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
    const started = Date.now();
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: this.auth, 'Content-Type': 'application/json' },
        body: JSON.stringify(body ?? {}),
        signal: AbortSignal.timeout(opts.timeoutMs ?? this.timeoutMs),
      });
    } catch (e) {
      this.logger.error(`${endpoint} network error: ${(e as Error).message}`);
      throw new RateHawkError('network_error', endpoint);
    }

    if (res.status === 429) throw new RateHawkError('rate_limited', endpoint, 429);

    let json: RateHawkEnvelope<T>;
    try {
      json = (await res.json()) as RateHawkEnvelope<T>;
    } catch {
      throw new RateHawkError(`invalid_response_http_${res.status}`, endpoint, res.status);
    }
    this.logger.debug(`${endpoint} ${res.status} ${json.status} ${Date.now() - started}ms`);
    return json;
  }

  /** Ca `post`, dar cere status "ok" și întoarce direct `data`. */
  async call<T>(endpoint: string, body: unknown, opts: { timeoutMs?: number } = {}): Promise<T> {
    const json = await this.post<T>(endpoint, body, opts);
    if (json.status !== 'ok' || json.error) {
      throw new RateHawkError(json.error ?? json.status ?? 'unknown_error', endpoint);
    }
    return json.data as T;
  }
}

/** Transformă erorile RateHawk în răspunsuri HTTP prietenoase pentru frontend. */
export function toHttpError(e: unknown): HttpException {
  if (e instanceof HttpException) return e;
  if (e instanceof RateHawkError) {
    const map: Record<string, [number, string]> = {
      rate_limited: [HttpStatus.TOO_MANY_REQUESTS, 'Prea multe cereri, încearcă din nou în câteva secunde.'],
      no_available_rates: [HttpStatus.CONFLICT, 'Tariful nu mai este disponibil. Alege altă cameră.'],
      rate_not_found: [HttpStatus.CONFLICT, 'Tariful nu mai este disponibil. Alege altă cameră.'],
      network_error: [HttpStatus.BAD_GATEWAY, 'Furnizorul nu răspunde momentan.'],
    };
    const [status, message] = map[e.code] ?? [HttpStatus.BAD_GATEWAY, `Eroare furnizor: ${e.code}`];
    return new HttpException({ message, code: e.code }, status);
  }
  return new HttpException('Eroare internă', HttpStatus.INTERNAL_SERVER_ERROR);
}
