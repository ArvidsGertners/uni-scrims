// Messages as keys with typed parameters (ARCHITECTURE §5.21): core hands out a Message, the web
// renders it in the language of the request.
import type { Locale } from "../../config/locale.ts";
import { type Catalog, MESSAGES } from "./messages.ts";

export type MessageKey = keyof Catalog;

/** The parameters of a key, or undefined for plain text. */
export type MessageParams<K extends MessageKey> = Catalog[K] extends (params: infer P) => string
  ? P
  : undefined;

/** Keys without parameters; zod messages can only be these (key()). */
export type PlainMessageKey = {
  [K in MessageKey]: Catalog[K] extends string ? K : never;
}[MessageKey];

/** A message of core: always an object, so it can never be rendered as its bare key by mistake. */
export type Message = {
  [K in MessageKey]: Catalog[K] extends string
    ? { readonly key: K; readonly params?: undefined }
    : { readonly key: K; readonly params: MessageParams<K> };
}[MessageKey];

/** A message with its parameters; tsc checks that the key exists and the parameters fit. */
export function msg<K extends MessageKey>(
  key: K,
  ...params: Catalog[K] extends string ? [] : [MessageParams<K>]
): Message {
  return { key, params: params[0] } as Message;
}

export function renderMessage(message: Message, locale: Locale): string {
  const entry = MESSAGES[locale][message.key] as string | ((params: unknown) => string);
  return typeof entry === "string" ? entry : entry(message.params);
}

export function isMessageKey(value: string): value is MessageKey {
  return Object.hasOwn(MESSAGES.de, value);
}

/** A key as a zod message; tsc rejects unknown keys and keys with parameters. */
export function key<K extends PlainMessageKey>(messageKey: K): K {
  return messageKey;
}
