import type { ShopTemplate } from "./shopTemplates";
import { userTemplateStore, withUserTemplate as withTemplate, type UserTemplate } from "./userTemplates";

// Twoje szablony Sklepu - wspólny mechanizm z lib/userTemplates.ts.

export type UserShopTemplate = UserTemplate<ShopTemplate>;

const store = userTemplateStore<ShopTemplate>("pm-shop-user-templates", (t) => Boolean(t));

export function withUserTemplate(list: UserShopTemplate[], name: string, template: ShopTemplate, now = Date.now()): UserShopTemplate[] {
  return withTemplate(list, name, template, now);
}

export const loadUserTemplates = store.load;
export const addUserTemplate = store.add;
export const removeUserTemplate = store.remove;
export const renameUserTemplate = store.rename;
